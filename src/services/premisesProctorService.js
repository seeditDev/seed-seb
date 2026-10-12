/**
 * premisesProctorService.js
 *
 * Peer-to-Peer WebRTC signaling and stream management for the secondary Android
 * premises/desk proctoring camera.
 *
 * Cost: $0 (Pure P2P over public Google STUN; Firestore for initial signaling handshake).
 */

import { db } from '../lib/firebase-config';
import { doc, setDoc, updateDoc, arrayUnion, onSnapshot, serverTimestamp, deleteDoc } from 'firebase/firestore';
import ProctorService from './proctorService';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:relay.metered.ca:80' },
  { urls: 'stun:global.turn.twilio.com:3478' },
  {
    urls: [
      'turn:relay.metered.ca:80',
      'turn:relay.metered.ca:443',
      'turn:relay.metered.ca:443?transport=tcp',
      'turn:standard.relay.metered.ca:80',
      'turn:standard.relay.metered.ca:443',
      'turn:standard.relay.metered.ca:443?transport=tcp',
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp'
    ],
    username: 'openrelay',
    credential: 'openrelay'
  }
];

/**
 * Generate a concise 6-digit numeric pairing code (e.g. 784219)
 */
export function generatePairingCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Initializes and manages a premises camera receiver session on SEED-SEB desktop.
 */
export class PremisesProctorSession {
  constructor({
    uid,
    assessmentId,
    candidateRoll = 'CANDIDATE',
    tenantId = '',
    onStream = () => {},
    onStatusChange = () => {},
    onHeartbeat = () => {},
    onViolation = () => {},
    onFaceSnapshot = () => {},
  }) {
    this.uid = uid;
    this.assessmentId = assessmentId;
    this.candidateRoll = candidateRoll;
    this.tenantId = tenantId;
    this.onStream = onStream;
    this.onStatusChange = onStatusChange;
    this.onHeartbeat = onHeartbeat;
    this.onViolation = onViolation;
    this.onFaceSnapshot = onFaceSnapshot;

    this.pairingCode = generatePairingCode();
    this.sessionId = `P-${this.pairingCode}`;
    this.pc = null;
    this.dataChannel = null;
    this.unsubscribeSnapshot = null;
    this.remoteStream = null;
    this.isDestroyed = false;
    this.hasConnectedOnce = false;
    this.disconnectGraceTimer = null;

    this.appliedMobileIceKeys = new Set();
    this.bufferedMobileIce = [];
    this.isSettingRemoteDescription = false;
    this.processedFaceSnapshots = new Set();
    this.lastHeartbeatTime = Date.now();
    this.heartbeatCheckInterval = null;
  }

  _setupPeerConnection() {
    this.pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 2,
    });

    // Prepare to receive secondary video feed from phone
    this.pc.addTransceiver('video', { direction: 'recvonly' });

    // Create data channel for telemetry & heartbeats
    this.dataChannel = this.pc.createDataChannel('premisesControl', {
      ordered: true,
    });
    this._setupDataChannel(this.dataChannel);

    this.pc.ondatachannel = (e) => {
      this._setupDataChannel(e.channel);
    };

    // Remote stream track handler
    this.pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        console.log('[PremisesProctor] Received remote premises video track:', event.track.id);
        this.onStream(this.remoteStream);
      }
    };

    // Track connection state transitions
    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState;
      console.log('[PremisesProctor] Connection state changed:', state);

      if (state === 'connected') {
        if (this.disconnectGraceTimer) {
          clearTimeout(this.disconnectGraceTimer);
          this.disconnectGraceTimer = null;
        }
        const isReconnect = this.hasConnectedOnce;
        this.hasConnectedOnce = true;
        this.lastHeartbeatTime = Date.now();
        this.onStatusChange('connected', { isReconnect });

        ProctorService.logProctorEvent(this.uid, this.assessmentId, this.tenantId, {
          type: isReconnect ? 'PREMISES_CAMERA_RECONNECTED' : 'PREMISES_CAMERA_CONNECTED',
          severity: 'info',
          eventType: 'premises_camera',
          confidence: 1.0,
          details: {
            sessionId: this.sessionId,
            pairingCode: this.pairingCode,
            candidateRoll: this.candidateRoll,
          },
        }).catch((err) => console.warn('[PremisesProctor] Failed to log connection event:', err));
      } else if (state === 'disconnected') {
        // WebRTC 'disconnected' is transient (e.g. hotspot NAT renegotiation). Give 8s grace period.
        console.warn('[PremisesProctor] Connection transiently disconnected, waiting for recovery...');
        if (!this.disconnectGraceTimer) {
          this.disconnectGraceTimer = setTimeout(() => {
            if (this.pc && this.pc.connectionState === 'disconnected') {
              this._handleDisconnection('disconnected');
            }
            this.disconnectGraceTimer = null;
          }, 8000);
        }
      } else if (state === 'failed') {
        if (this.disconnectGraceTimer) {
          clearTimeout(this.disconnectGraceTimer);
          this.disconnectGraceTimer = null;
        }
        this._handleDisconnection('failed');
      }
    };

    // Also monitor iceConnectionState for fast connected detection
    this.pc.oniceconnectionstatechange = () => {
      const iceState = this.pc?.iceConnectionState;
      console.log('[PremisesProctor] ICE connection state changed:', iceState);
      if (iceState === 'connected' || iceState === 'completed') {
        if (this.disconnectGraceTimer) {
          clearTimeout(this.disconnectGraceTimer);
          this.disconnectGraceTimer = null;
        }
        if (!this.hasConnectedOnce) {
          this.hasConnectedOnce = true;
          this.lastHeartbeatTime = Date.now();
          this.onStatusChange('connected', { isReconnect: false });
        }
      }
    };

    // Handle local ICE candidates and post to Firestore
    this.pc.onicecandidate = async (event) => {
      if (!event.candidate || this.isDestroyed) return;
      try {
        const cand = event.candidate;
        const plainCand = {
          candidate: cand.candidate || '',
          sdpMid: cand.sdpMid !== null && cand.sdpMid !== undefined ? String(cand.sdpMid) : '',
          sdpMLineIndex: cand.sdpMLineIndex !== null && cand.sdpMLineIndex !== undefined ? Number(cand.sdpMLineIndex) : 0,
        };
        const docRef = doc(db, 'webrtcSignaling', this.sessionId);
        await updateDoc(docRef, {
          desktopIce: arrayUnion(plainCand),
          updatedAt: serverTimestamp(),
        });
      } catch (iceErr) {
        console.warn('[PremisesProctor] Failed to update desktop ICE candidate:', iceErr);
      }
    };
  }

  /**
   * Start WebRTC offer creation and Firestore signaling registration.
   */
  async start() {
    try {
      this._setupPeerConnection();

      // Create WebRTC Offer
      const offer = await this.pc.createOffer({
        offerToReceiveVideo: true,
      });

      // Save initial signaling document to Firestore FIRST so it exists before ICE candidates gather
      const sessionDocRef = doc(db, 'webrtcSignaling', this.sessionId);
      await setDoc(sessionDocRef, {
        sessionId: this.sessionId,
        pairingCode: this.pairingCode,
        assessmentId: this.assessmentId,
        uid: this.uid,
        candidateRoll: this.candidateRoll,
        status: 'waiting_for_mobile',
        offer: {
          type: offer.type,
          sdp: offer.sdp,
        },
        desktopIce: [],
        mobileIce: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Set local description — this begins ICE gathering against the newly created doc
      await this.pc.setLocalDescription(offer);

      console.log(`[PremisesProctor] Session created. Pairing Code: ${this.pairingCode} (Session: ${this.sessionId})`);
      this.onStatusChange('waiting_for_mobile', { pairingCode: this.pairingCode });

      // Listen for mobile answer & mobile ICE candidates
      this._listenToSignalingDoc();

      // Start periodic heartbeat validator
      this._startHeartbeatWatcher();

      return {
        sessionId: this.sessionId,
        pairingCode: this.pairingCode,
        qrPayload: JSON.stringify({
          type: 'premises_cam',
          sid: this.sessionId,
          code: this.pairingCode,
          aid: this.assessmentId,
          uid: this.uid,
          roll: this.candidateRoll,
        }),
      };
    } catch (err) {
      console.error('[PremisesProctor] Failed to initialize premises session:', err);
      this.onStatusChange('error', { error: err.message });
      throw err;
    }
  }

  /**
   * Re-establish an active WebRTC session if mobile disconnected.
   * Generates a fresh offer on the existing sessionId and pairingCode.
   */
  async reconnect() {
    try {
      console.log(`[PremisesProctor] Reconnecting session ${this.sessionId}...`);
      this.onStatusChange('reconnecting');

      if (this.pc) {
        try { this.pc.close(); } catch (_) {}
        this.pc = null;
      }
      if (this.dataChannel) {
        try { this.dataChannel.close(); } catch (_) {}
        this.dataChannel = null;
      }

      this.appliedMobileIceKeys.clear();
      this.bufferedMobileIce = [];
      this.isSettingRemoteDescription = false;

      this._setupPeerConnection();

      const offer = await this.pc.createOffer({
        offerToReceiveVideo: true,
      });

      const sessionDocRef = doc(db, 'webrtcSignaling', this.sessionId);
      await updateDoc(sessionDocRef, {
        status: 'waiting_for_mobile',
        offer: {
          type: offer.type,
          sdp: offer.sdp,
        },
        answer: null,
        desktopIce: [],
        mobileIce: [],
        updatedAt: serverTimestamp(),
      });

      await this.pc.setLocalDescription(offer);
      console.log(`[PremisesProctor] Reconnect offer published for session ${this.sessionId}`);
      this.onStatusChange('waiting_for_mobile', { isReconnect: true, pairingCode: this.pairingCode });
    } catch (err) {
      console.error('[PremisesProctor] Reconnect error:', err);
      this.onStatusChange('error', { error: err.message });
    }
  }

  _handleDisconnection(state) {
    this.onStatusChange('disconnected', { state });
    this.onViolation({
      type: 'PREMISES_CAMERA_DISCONNECTED',
      message: 'Premises mobile camera connection lost. Please keep your phone active.',
    });

    ProctorService.logProctorEvent(this.uid, this.assessmentId, this.tenantId, {
      type: 'PREMISES_CAMERA_DISCONNECTED',
      severity: 'warning',
      eventType: 'premises_camera',
      confidence: 1.0,
      details: {
        sessionId: this.sessionId,
        connectionState: state,
      },
    }).catch((err) => console.warn('[PremisesProctor] Failed to log disconnection event:', err));
  }

  async _drainBufferedMobileCandidates() {
    if (!this.pc || !this.pc.remoteDescription || this.bufferedMobileIce.length === 0) return;
    const candidates = [...this.bufferedMobileIce];
    this.bufferedMobileIce = [];
    console.log(`[PremisesProctor] Draining ${candidates.length} buffered mobile ICE candidates...`);
    for (const cand of candidates) {
      const key = `${cand.candidate}_${cand.sdpMid}_${cand.sdpMLineIndex}`;
      if (!this.appliedMobileIceKeys.has(key)) {
        this.appliedMobileIceKeys.add(key);
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(cand));
          console.log('[PremisesProctor] Successfully added buffered mobile ICE candidate');
        } catch (iceErr) {
          this.appliedMobileIceKeys.delete(key);
          console.warn('[PremisesProctor] Failed to add buffered mobile ICE candidate:', iceErr);
        }
      }
    }
  }

  _setupDataChannel(channel) {
    if (!channel) return;
    this.dataChannel = channel;

    channel.onopen = () => {
      console.log('[PremisesProctor] DataChannel opened.');
      if (this.disconnectGraceTimer) {
        clearTimeout(this.disconnectGraceTimer);
        this.disconnectGraceTimer = null;
      }
      if (!this.hasConnectedOnce) {
        this.hasConnectedOnce = true;
        this.lastHeartbeatTime = Date.now();
        this.onStatusChange('connected', { isReconnect: false });
      }
      try {
        channel.send(JSON.stringify({ type: 'handshake_ack', client: 'SEED-SEB Desktop' }));
      } catch (_) {}
    };

    channel.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'heartbeat') {
          this.lastHeartbeatTime = Date.now();
          this.onHeartbeat({
            battery: msg.battery ?? null,
            network: msg.network ?? 'online',
            cameraFacing: msg.cameraFacing ?? 'environment',
            timestamp: msg.timestamp || Date.now(),
          });
        } else if (msg.type === 'mobile_face_snapshot') {
          const photo = msg.photoDataUrl || msg.image;
          if (photo) {
            console.log('[PremisesProctor] Received mobile face snapshot via DataChannel');
            this.onFaceSnapshot(photo);
          }
        }
      } catch (e) {
        console.warn('[PremisesProctor] Failed to parse DataChannel message:', e);
      }
    };

    channel.onerror = (e) => {
      console.warn('[PremisesProctor] DataChannel error:', e);
    };
  }

  sendVerificationResult(isMatched, reason = '') {
    const payload = JSON.stringify({
      type: isMatched ? 'face_verified' : 'face_mismatch',
      verified: isMatched,
      reason,
      timestamp: Date.now(),
    });

    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        this.dataChannel.send(payload);
      } catch (_) {}
    }

    try {
      const sessionDocRef = doc(db, 'webrtcSignaling', this.sessionId);
      updateDoc(sessionDocRef, {
        faceVerified: isMatched,
        faceVerificationStatus: isMatched ? 'verified' : 'mismatched',
        faceVerifyReason: reason,
        faceVerificationReason: reason,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    } catch (_) {}
  }

  _listenToSignalingDoc() {
    const sessionDocRef = doc(db, 'webrtcSignaling', this.sessionId);

    this.unsubscribeSnapshot = onSnapshot(sessionDocRef, async (docSnap) => {
      if (!docSnap.exists() || this.isDestroyed || !this.pc) return;

      const data = docSnap.data();

      // Apply mobile answer
      if (data.answer && this.pc.signalingState === 'have-local-offer' && !this.isSettingRemoteDescription) {
        this.isSettingRemoteDescription = true;
        try {
          console.log('[PremisesProctor] Applying mobile answer...');
          await this.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          this.isSettingRemoteDescription = false;
          this.onStatusChange('connecting');

          // Immediately drain any buffered ICE candidates that arrived before remoteDescription
          await this._drainBufferedMobileCandidates();
        } catch (ansErr) {
          this.isSettingRemoteDescription = false;
          console.error('[PremisesProctor] Error setting remote description:', ansErr);
        }
      }

      // Apply or buffer mobile ICE candidates
      if (Array.isArray(data.mobileIce)) {
        for (const cand of data.mobileIce) {
          const key = `${cand.candidate}_${cand.sdpMid}_${cand.sdpMLineIndex}`;
          if (!this.appliedMobileIceKeys.has(key)) {
            if (!this.pc.remoteDescription || this.isSettingRemoteDescription) {
              // Remote description not yet applied — buffer candidate for later draining
              if (!this.bufferedMobileIce.some((b) => `${b.candidate}_${b.sdpMid}_${b.sdpMLineIndex}` === key)) {
                this.bufferedMobileIce.push(cand);
                console.log('[PremisesProctor] Buffered mobile ICE candidate until remote description is set');
              }
            } else {
              this.appliedMobileIceKeys.add(key);
              try {
                await this.pc.addIceCandidate(new RTCIceCandidate(cand));
                console.log('[PremisesProctor] Successfully added mobile ICE candidate');
              } catch (iceErr) {
                // If it failed, allow re-trying
                this.appliedMobileIceKeys.delete(key);
                console.warn('[PremisesProctor] Failed to add remote ICE candidate:', iceErr);
              }
            }
          }
        }
      }

      // Handle mobile face snapshot fallback via Firestore
      if (data.mobileFaceSnapshot && !this.processedFaceSnapshots.has(data.mobileFaceSnapshot)) {
        this.processedFaceSnapshots.add(data.mobileFaceSnapshot);
        console.log('[PremisesProctor] Received mobile face snapshot via Firestore fallback');
        this.onFaceSnapshot(data.mobileFaceSnapshot);
      }

      // Read fallback Firestore heartbeat if DataChannel is pending
      if (data.battery !== undefined || data.lastActive) {
        this.lastHeartbeatTime = Date.now();
        this.onHeartbeat({
          battery: data.battery ?? null,
          device: data.deviceInfo ?? 'Android Premises',
          timestamp: Date.now(),
        });
      }
    });
  }

  _startHeartbeatWatcher() {
    if (this.heartbeatCheckInterval) clearInterval(this.heartbeatCheckInterval);

    this.heartbeatCheckInterval = setInterval(() => {
      if (this.isDestroyed || !this.hasConnectedOnce) return;

      const elapsed = Date.now() - this.lastHeartbeatTime;
      // If no heartbeat for > 25 seconds while active, alert student
      if (elapsed > 25000 && this.pc?.connectionState === 'connected') {
        console.warn(`[PremisesProctor] Heartbeat timeout (${Math.round(elapsed / 1000)}s)`);
        this.onStatusChange('stale');
        this.onViolation({
          type: 'PREMISES_HEARTBEAT_TIMEOUT',
          message: 'Mobile premises camera heartbeat delayed. Ensure phone screen is unlocked.',
        });
      }
    }, 10000);
  }

  /**
   * Stop session, close WebRTC connection, and clean up signaling doc.
   */
  async destroy({ deleteFromFirestore = false } = {}) {
    this.isDestroyed = true;

    if (this.disconnectGraceTimer) {
      clearTimeout(this.disconnectGraceTimer);
      this.disconnectGraceTimer = null;
    }

    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
      this.heartbeatCheckInterval = null;
    }

    if (this.unsubscribeSnapshot) {
      this.unsubscribeSnapshot();
      this.unsubscribeSnapshot = null;
    }

    // Explicitly notify mobile app to shutdown camera stream and release wake lock
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        this.dataChannel.send(JSON.stringify({
          type: 'assessment_ended',
          message: 'Assessment submitted successfully. Camera released.'
        }));
      } catch (_) {}
    }

    try {
      const sessionDocRef = doc(db, 'webrtcSignaling', this.sessionId);
      if (deleteFromFirestore) {
        await deleteDoc(sessionDocRef);
      } else {
        await updateDoc(sessionDocRef, {
          status: 'assessment_ended',
          endedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (_) {}

    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch (_) {}
      this.dataChannel = null;
    }

    if (this.remoteStream) {
      try {
        this.remoteStream.getTracks().forEach((track) => track.stop());
      } catch (_) {}
      this.remoteStream = null;
    }

    if (this.pc) {
      try {
        this.pc.close();
      } catch (_) {}
      this.pc = null;
    }

    console.log(`[PremisesProctor] Session ${this.sessionId} destroyed (deleted=${deleteFromFirestore}).`);
  }
}
