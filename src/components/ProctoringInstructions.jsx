import React, { useState, useEffect, useRef, useCallback, useReducer } from 'react';
import { FaCheckCircle, FaTimesCircle, FaCamera, FaExclamationTriangle, FaSpinner, FaSync, FaClock, FaLaptopCode, FaClipboardList, FaMobileAlt, FaQrcode } from 'react-icons/fa';
import '../styles/ProctoringInstructions.css';
import * as faceapi from 'face-api.js';
import * as tf from '@tensorflow/tfjs';
import QRCode from 'qrcode';
import { setProctorCacheExpiry } from '../utils/proctorCache';
import { PremisesProctorSession } from '../services/premisesProctorService';

// Helper to resolve models directory path under file://, base path, and http/https protocols
const getModelsPath = (subPath) => {
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    const path = window.location.pathname;
    const buildIndex = path.indexOf('/build/');
    if (buildIndex !== -1) {
      const basePath = path.substring(0, buildIndex + 7); // includes "/build/"
      return `file://${basePath}${subPath}`;
    }
    const lastSlash = path.lastIndexOf('/');
    if (lastSlash !== -1) {
      const basePath = path.substring(0, lastSlash + 1);
      return `file://${basePath}${subPath}`;
    }
  }
  const cleanSub = String(subPath || '').replace(/^\/+/, '');
  const baseUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
  const prefix = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${prefix}${cleanSub}`;
};

const ensureYolov8ForInstructions = async () => {
  if (window.yolov8Loaded && window.yolov8Model) return window.yolov8Model;
  try {
    const model = await tf.loadGraphModel(getModelsPath('models/yolov8/model.json'));
    window.yolov8Model = model;
    window.yolov8Loaded = true;
    return model;
  } catch (err) {
    console.warn('[ProctoringInstructions] Primary YOLOv8 load failed, trying /models/yolov8 fallback:', err);
    try {
      const model = await tf.loadGraphModel('/models/yolov8/model.json');
      window.yolov8Model = model;
      window.yolov8Loaded = true;
      return model;
    } catch (err2) {
      console.warn('[ProctoringInstructions] Error loading YOLOv8 model:', err2);
      return null;
    }
  }
};

const ProctoringInstructions = ({ assessment, onContinue, onCancel }) => {
  const [cameraStatus, setCameraStatus] = useState('requesting'); // requesting, granted, denied, error
  const [cameraError, setCameraError] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [canContinue, setCanContinue] = useState(false);
  const verificationIntervalRef = useRef(null);
  const contentRef = useRef(null);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [isAcknowledged, setIsAcknowledged] = useState(false);

  // Dual-Camera / Premises Proctoring Config
  const isPremisesRequired = Boolean(
    assessment?.proctorConfig?.premisesCameraRequired ||
    assessment?.proctorConfig?.premisesProctoring ||
    assessment?.premisesCameraRequired ||
    assessment?.premisesProctoring ||
    assessment?.settings?.premisesCameraRequired ||
    assessment?.settings?.premisesProctoring ||
    (assessment?.sections || []).some(s =>
      s?.premisesCameraRequired ||
      s?.premisesProctoring ||
      s?.proctorConfig?.premisesCameraRequired ||
      s?.proctorConfig?.premisesProctoring
    )
  );
  const [premisesStatus, setPremisesStatus] = useState('initializing'); // initializing, waiting_for_mobile, connecting, connected, error
  const [premisesPairingCode, setPremisesPairingCode] = useState('');
  const [premisesQrDataUrl, setPremisesQrDataUrl] = useState('');
  const [premisesBattery, setPremisesBattery] = useState(null);
  const [premisesFaceVerified, setPremisesFaceVerified] = useState(false);
  const [premisesFaceVerificationStatus, setPremisesFaceVerificationStatus] = useState('pending'); // pending, verifying, verified, mismatch, no_face, error
  const [premisesFaceDistance, setPremisesFaceDistance] = useState(null);
  const premisesSessionRef = useRef(null);
  const premisesStreamRef = useRef(null);
  const premisesVideoRef = useRef(null);
  const [premisesAngleVerified, setPremisesAngleVerified] = useState(false);
  const [premisesAngleCheck, setPremisesAngleCheck] = useState({
    candidateSeated: false,
    laptopVisible: false,
    noProhibited: true,
    prohibitedItems: [],
    streak: 0,
    reason: 'Align phone at 45° angle showing your desk and laptop.'
  });
  const angleCheckStreakRef = useRef(0);
  
  // Single reducer for all photo state — batches into one render to prevent video flicker
  const [photoState, dispatchPhoto] = useReducer(
    (state, action) => ({ ...state, ...action }),
    { status: 'pending', url: null, error: '', capturing: false }
  );
  // Aliases for backwards-compatibility with JSX references
  const photoStatus = photoState.status;
  const photoURL = photoState.url;
  const captureError = photoState.error;
  const isCapturing = photoState.capturing;

  // Track if we are proceeding to test (must not stop camera on unmount if proceeding)
  const isProceedingRef = useRef(false);

  const [currentStep, setCurrentStep] = useState(1); // 1 = Face capture, 2 = Mobile camera (if req) / Guidelines, 3 = Guidelines (if req)

  const handleMobileFaceSnapshot = useCallback(async (mobilePhotoDataUrl) => {
    if (!mobilePhotoDataUrl) return;
    console.log('[ProctoringInstructions] Evaluating mobile face snapshot for dual identity match...');
    setPremisesFaceVerificationStatus('verifying');

    try {
      const assessmentId = assessment?.id || 'unknown';
      const laptopDescriptorStr = localStorage.getItem('proctor_reference_descriptor_' + assessmentId);
      if (!laptopDescriptorStr) {
        console.warn('[ProctoringInstructions] No laptop reference photo descriptor found in localStorage');
        premisesSessionRef.current?.sendVerificationResult(false, 'Laptop face photo not registered yet');
        setPremisesFaceVerificationStatus('mismatch');
        return;
      }
      const laptopDescriptor = new Float32Array(JSON.parse(laptopDescriptorStr));

      const modelsReady = await loadFaceApiForPhoto();
      if (!modelsReady) {
        premisesSessionRef.current?.sendVerificationResult(false, 'AI models not ready on laptop');
        setPremisesFaceVerificationStatus('error');
        return;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = mobilePhotoDataUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      // Progressive detection cascade for mobile photo
      const mobileConfidences = [0.55, 0.38, 0.25];
      let detection = null;
      for (const minConf of mobileConfidences) {
        detection = await faceapi.detectSingleFace(
          img,
          new faceapi.SsdMobilenetv1Options({ minConfidence: minConf })
        ).withFaceLandmarks().withFaceDescriptor();
        if (detection) {
          console.log(`[ProctoringInstructions] Mobile face detected at minConfidence: ${minConf}`);
          break;
        }
      }

      if (!detection) {
        console.warn('[ProctoringInstructions] No clear face detected in mobile snapshot');
        premisesSessionRef.current?.sendVerificationResult(false, 'No face detected in mobile photo. Please face the mobile camera directly.');
        setPremisesFaceVerificationStatus('no_face');
        setPremisesFaceVerified(false);
        return;
      }

      const distance = faceapi.euclideanDistance(laptopDescriptor, detection.descriptor);
      console.log(`[ProctoringInstructions] Dual Face Distance: ${distance.toFixed(4)} (Threshold: 0.52)`);
      setPremisesFaceDistance(distance);

      if (distance <= 0.52) {
        console.log('[ProctoringInstructions] Dual Face MATCH CONFIRMED!');
        premisesSessionRef.current?.sendVerificationResult(true, 'Face verified successfully');
        setPremisesFaceVerified(true);
        setPremisesFaceVerificationStatus('verified');
      } else {
        console.warn(`[ProctoringInstructions] Dual Face MISMATCH! Distance: ${distance.toFixed(4)}`);
        premisesSessionRef.current?.sendVerificationResult(false, 'Face does not match laptop photo. Retake required.');
        setPremisesFaceVerified(false);
        setPremisesFaceVerificationStatus('mismatch');
      }
    } catch (err) {
      console.error('[ProctoringInstructions] Error comparing dual face snapshots:', err);
      premisesSessionRef.current?.sendVerificationResult(false, 'Internal verification error on laptop');
      setPremisesFaceVerificationStatus('error');
      setPremisesFaceVerified(false);
    }
  }, [assessment?.id]);

  useEffect(() => {
    // Request camera access when component mounts
    requestCameraAccess();

    // Cleanup on unmount - stop stream if not proceeding to the test
    return () => {
      if (verificationIntervalRef.current) {
        clearInterval(verificationIntervalRef.current);
      }
      
      if (!isProceedingRef.current) {
        console.log('[ProctoringInstructions] Unmounting guidelines without proceeding. Shutting down camera...');
        if (streamRef.current) {
          try {
            streamRef.current.getTracks().forEach(track => {
              track.onended = null;
              track.stop();
            });
          } catch (e) {
            console.warn('[ProctoringInstructions] Error stopping stream on unmount:', e);
          }
        }
        if (window.cameraStream) {
          try {
            window.cameraStream.getTracks().forEach(track => {
              track.onended = null;
              track.stop();
            });
          } catch (_) {}
          window.cameraStream = null;
        }
      }
    };
  }, []);

  // Initialize WebRTC Premises Camera Pairing Session ONLY after face photo is registered and user enters Step 2
  useEffect(() => {
    if (!isPremisesRequired || photoStatus !== 'captured' || currentStep < 2) return;

    // Reuse existing active session across re-renders
    if (premisesSessionRef.current && !premisesSessionRef.current.isDestroyed) {
      console.log('[ProctoringInstructions] Reusing active premises session:', premisesSessionRef.current.sessionId);
      setPremisesPairingCode(premisesSessionRef.current.pairingCode);
      return;
    }

    let isCancelled = false;

    async function initPremisesSession() {
      try {
        const authData = JSON.parse(localStorage.getItem('auth_data') ?? '{}');
        const candidateRoll = authData.rollNumber ?? 'CANDIDATE';
        const uid = authData.uid ?? 'candidate_uid';
        const tenantId = authData.tenantId ?? '';

        const session = new PremisesProctorSession({
          uid,
          assessmentId: assessment?.id || 'assessment',
          candidateRoll,
          tenantId,
          onStream: (stream) => {
            console.log('[ProctoringInstructions] Premises camera stream received!');
            premisesStreamRef.current = stream;
            window.premisesStream = stream;
            if (premisesVideoRef.current) {
              premisesVideoRef.current.srcObject = stream;
              premisesVideoRef.current.play().catch(() => {});
            }
          },
          onStatusChange: (status) => {
            if (!isCancelled) {
              console.log('[ProctoringInstructions] Premises status changed:', status);
              setPremisesStatus(status);
            }
          },
          onHeartbeat: (hb) => {
            if (!isCancelled && hb?.battery !== null) {
              setPremisesBattery(hb.battery);
            }
          },
          onFaceSnapshot: handleMobileFaceSnapshot,
        });

        premisesSessionRef.current = session;
        window.premisesSession = session;

        const info = await session.start();
        if (isCancelled) return;

        setPremisesPairingCode(info.pairingCode);
        const qrUrl = await QRCode.toDataURL(info.qrPayload, {
          width: 240,
          margin: 1,
          color: {
            dark: '#0f172a',
            light: '#ffffff',
          },
        });
        if (!isCancelled) {
          setPremisesQrDataUrl(qrUrl);
        }
      } catch (err) {
        console.error('[ProctoringInstructions] Error starting premises session:', err);
        if (!isCancelled) setPremisesStatus('error');
      }
    }

    initPremisesSession();

    return () => {
      isCancelled = true;
      // Do NOT destroy the session during render transitions; session stays live until test proceeds or user cancels
    };
  }, [isPremisesRequired, photoStatus, currentStep, assessment?.id, handleMobileFaceSnapshot]);

  const handleRegeneratePremisesSession = async () => {
    try {
      setPremisesStatus('initializing');
      setPremisesPairingCode('');
      setPremisesQrDataUrl('');
      setPremisesFaceVerified(false);
      setPremisesFaceVerificationStatus('pending');
      setPremisesFaceDistance(null);
      if (premisesSessionRef.current) {
        try {
          premisesSessionRef.current.destroy({ deleteFromFirestore: true });
        } catch (_) {}
        premisesSessionRef.current = null;
        window.premisesSession = null;
      }
      const authData = JSON.parse(localStorage.getItem('auth_data') ?? '{}');
      const candidateRoll = authData.rollNumber ?? 'CANDIDATE';
      const uid = authData.uid ?? 'candidate_uid';
      const tenantId = authData.tenantId ?? '';

      const session = new PremisesProctorSession({
        uid,
        assessmentId: assessment?.id || 'assessment',
        candidateRoll,
        tenantId,
        onStream: (stream) => {
          console.log('[ProctoringInstructions] Premises camera stream received!');
          premisesStreamRef.current = stream;
          window.premisesStream = stream;
          if (premisesVideoRef.current) {
            premisesVideoRef.current.srcObject = stream;
            premisesVideoRef.current.play().catch(() => {});
          }
        },
        onStatusChange: (status) => {
          console.log('[ProctoringInstructions] Premises status changed:', status);
          setPremisesStatus(status);
        },
        onHeartbeat: (hb) => {
          if (hb?.battery !== null) {
            setPremisesBattery(hb.battery);
          }
        },
        onFaceSnapshot: handleMobileFaceSnapshot,
      });

      premisesSessionRef.current = session;
      window.premisesSession = session;

      const info = await session.start();
      setPremisesPairingCode(info.pairingCode);
      const qrUrl = await QRCode.toDataURL(info.qrPayload, {
        width: 240,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      });
      setPremisesQrDataUrl(qrUrl);
    } catch (err) {
      console.error('[ProctoringInstructions] Error regenerating premises session:', err);
      setPremisesStatus('error');
    }
  };

  const handleReconnectPremises = async () => {
    try {
      console.log('[ProctoringInstructions] Initiating premises camera stream reconnection...');
      setPremisesStatus('connecting');
      if (premisesSessionRef.current && typeof premisesSessionRef.current.reconnect === 'function') {
        await premisesSessionRef.current.reconnect();
      } else {
        await handleRegeneratePremisesSession();
      }
    } catch (err) {
      console.error('[ProctoringInstructions] Error reconnecting premises camera:', err);
      setPremisesStatus('error');
    }
  };

  // Continuous Angle & Workspace Calibration Loop (Checks: Seated, Laptop visible, Strict 2-item rule)
  useEffect(() => {
    if (!isPremisesRequired || premisesStatus !== 'connected' || !premisesFaceVerified || premisesAngleVerified) {
      return;
    }

    let isMounted = true;
    let timer = null;

    const runCalibrationCheck = async () => {
      try {
        const video = premisesVideoRef.current;
        if (!video || video.readyState < 2 || video.videoWidth === 0) {
          if (isMounted) timer = setTimeout(runCalibrationCheck, 1200);
          return;
        }

        const model = await ensureYolov8ForInstructions();
        if (!model || typeof window.runYolov8Inference !== 'function') {
          if (isMounted) timer = setTimeout(runCalibrationCheck, 1500);
          return;
        }

        const res = await window.runYolov8Inference(video, model);
        if (!isMounted) return;

        const candidateSeated = res.personCount === 1;
        const laptopVisible = Boolean(res.laptopDetected);
        const noProhibited = !res.prohibitedDetected;
        const prohibitedItems = res.prohibitedItems || [];

        let reason = '';
        if (res.personCount === 0) {
          reason = 'Candidate not detected in premises camera. Please ensure you are seated at your desk.';
        } else if (res.personCount > 1) {
          reason = 'Multiple people detected in premises camera. Only candidate allowed.';
        } else if (!noProhibited) {
          reason = `Prohibited object detected: ${prohibitedItems.join(', ')}. Workspace must only have candidate and laptop.`;
        } else if (!laptopVisible) {
          reason = 'Laptop/keyboard not clearly visible. Adjust phone angle to show your workspace & laptop.';
        } else {
          reason = 'Desk setup and camera angle verified! Candidate and laptop detected.';
        }

        const allPassed = candidateSeated && laptopVisible && noProhibited;
        if (allPassed) {
          angleCheckStreakRef.current += 1;
        } else {
          angleCheckStreakRef.current = 0;
        }

        setPremisesAngleCheck({
          candidateSeated,
          laptopVisible,
          noProhibited,
          prohibitedItems,
          streak: angleCheckStreakRef.current,
          reason
        });

        if (angleCheckStreakRef.current >= 2) {
          console.log('[ProctoringInstructions] Premises angle and desk setup VERIFIED!');
          setPremisesAngleVerified(true);
          try {
            premisesSessionRef.current?.dataChannel?.send(JSON.stringify({
              type: 'angle_verified',
              message: 'Desk setup and camera angle confirmed.'
            }));
          } catch (_) {}
          return;
        }
      } catch (calibErr) {
        console.warn('[ProctoringInstructions] Calibration check error:', calibErr);
      }

      if (isMounted) {
        timer = setTimeout(runCalibrationCheck, 1600);
      }
    };

    timer = setTimeout(runCalibrationCheck, 1000);

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [isPremisesRequired, premisesStatus, premisesFaceVerified, premisesAngleVerified]);

  const handleCancelInstructions = () => {
    if (premisesSessionRef.current) {
      try {
        premisesSessionRef.current.destroy({ deleteFromFirestore: true });
      } catch (_) {}
      premisesSessionRef.current = null;
      window.premisesSession = null;
      window.premisesStream = null;
    }
    onCancel();
  };

  useEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl) {
      return;
    }
    // If content is short (no scroll), allow immediately
    if (contentEl.scrollHeight <= contentEl.clientHeight) {
      setHasScrolledToBottom(true);
    }
  }, [currentStep]);

  const handleContentScroll = () => {
    const el = contentRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 16) {
      setHasScrolledToBottom(true);
    }
  };

  const requestCameraAccess = async () => {
    try {
      setCameraStatus('requesting');
      setCameraError(null);
      setCanContinue(false);

      console.log('[ProctoringInstructions] Requesting camera access...');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });

      console.log('[ProctoringInstructions] Camera access granted.');

      // Store stream globally so ProctoringEngine can reuse it
      window.cameraStream = stream;
      streamRef.current = stream;
      setCameraStatus('granted');
      setCanContinue(true);
    } catch (error) {
      console.error('[ProctoringInstructions] Camera access error:', error);
      setCameraStatus('denied');
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setCameraError('Camera access denied. Please allow camera access to continue.');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setCameraError('No camera found. Please connect a camera to continue.');
      } else {
        setCameraError('Failed to access camera. Please check your camera settings.');
      }
      setCanContinue(false);
    }
  };

 

  const loadFaceApiForPhoto = async () => {
    try {
      const isAlreadyLoaded = Boolean(
        window.faceApiLoaded ||
        (faceapi.nets.ssdMobilenetv1?.params &&
         faceapi.nets.faceLandmark68Net?.params &&
         faceapi.nets.faceRecognitionNet?.params)
      );
      if (isAlreadyLoaded) {
        window.faceApiLoaded = true;
        return true;
      }
      console.log('[ProctoringInstructions] Loading faceapi models from:', getModelsPath('models/face-api'));
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(getModelsPath('models/face-api')),
        faceapi.nets.faceLandmark68Net.loadFromUri(getModelsPath('models/face-api')),
        faceapi.nets.faceRecognitionNet.loadFromUri(getModelsPath('models/face-api'))
      ]);
      window.faceApiLoaded = true;
      return true;
    } catch (err) {
      console.warn('[ProctoringInstructions] Primary faceapi model load failed:', err);
      try {
        console.log('[ProctoringInstructions] Retrying faceapi models from /models/face-api fallback...');
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri('/models/face-api'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models/face-api'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models/face-api')
        ]);
        window.faceApiLoaded = true;
        return true;
      } catch (err2) {
        try {
          console.log('[ProctoringInstructions] Retrying faceapi models from ./models/face-api fallback...');
          await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri('./models/face-api'),
            faceapi.nets.faceLandmark68Net.loadFromUri('./models/face-api'),
            faceapi.nets.faceRecognitionNet.loadFromUri('./models/face-api')
          ]);
          window.faceApiLoaded = true;
          return true;
        } catch (err3) {
          console.error('[ProctoringInstructions] All faceapi model load attempts failed:', err3);
          return false;
        }
      }
    }
  };

  // Bind stream to video element when videoRef becomes available after permission is granted
  useEffect(() => {
    if (cameraStatus === 'granted' && streamRef.current && videoRef.current) {
      const video = videoRef.current;
      
      if (video.srcObject !== streamRef.current) {
        console.log('[ProctoringInstructions] Binding stream to video preview element...');
        video.srcObject = streamRef.current;
        video.setAttribute('playsinline', 'true');
        video.muted = true;
        
        video.play().then(() => {
          console.log('[ProctoringInstructions] Video preview play() successful');
        }).catch(error => {
          console.error('[ProctoringInstructions] Video preview play() failed:', error);
        });
      }
    }
  }, [cameraStatus]);

  const captureReferencePhoto = useCallback(async () => {
    dispatchPhoto({ error: '', capturing: true });
    
    const modelsReady = await loadFaceApiForPhoto();
    if (!modelsReady) {
      dispatchPhoto({ error: "AI face-detection models failed to load. Please check your connection.", status: 'failed', capturing: false });
      return;
    }
    
    const video = videoRef.current;
    if (!video) {
      dispatchPhoto({ error: "Camera stream is not ready yet. Please wait.", capturing: false });
      return;
    }

    // Wait for video frame to be ready/decoded if needed
    if (video.videoWidth === 0 || video.videoHeight === 0 || video.readyState < 2) {
      console.log('[ProctoringInstructions] Waiting for video stream frame decoding...');
      await new Promise(resolve => {
        if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) return resolve();
        const handler = () => {
          video.removeEventListener('loadeddata', handler);
          video.removeEventListener('canplay', handler);
          resolve();
        };
        video.addEventListener('loadeddata', handler);
        video.addEventListener('canplay', handler);
        setTimeout(resolve, 800);
      });
    }

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      dispatchPhoto({ error: "Camera stream resolution is not available. Please ensure camera is active.", capturing: false });
      return;
    }
    
    try {
      console.log('[ProctoringInstructions] Capturing frame to high-precision canvas...');
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      
      // Step 1: Draw directly to canvas first.
      const canvas = document.createElement('canvas');
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
      
      // Step 2: Quality & Brightness Guard
      try {
        const sampleData = ctx.getImageData(0, 0, videoWidth, videoHeight).data;
        let sum = 0;
        const step = Math.max(4, Math.floor(sampleData.length / 3000) * 4);
        let count = 0;
        for (let i = 0; i < sampleData.length; i += step) {
          sum += (sampleData[i] + sampleData[i + 1] + sampleData[i + 2]) / 3;
          count++;
        }
        const avgBrightness = count > 0 ? (sum / count) : 100;
        console.log(`[ProctoringInstructions] Captured frame brightness: ${avgBrightness.toFixed(1)}/255`);
        if (avgBrightness < 10) {
          dispatchPhoto({
            error: "Camera frame is completely dark. Check if your camera privacy shutter is closed or room lighting is too dim.",
            status: 'failed',
            capturing: false
          });
          return;
        }
      } catch (pixelErr) {
        console.warn('[ProctoringInstructions] Brightness check non-fatal error:', pixelErr);
      }

      // Step 3: Multi-Tier Face Detection Cascade
      let detection = null;

      // PASS 1: Test HTMLVideoElement directly (Hardware WebGL video texture)
      const videoConfidenceLevels = [0.55, 0.40, 0.25, 0.15];
      for (const minConf of videoConfidenceLevels) {
        detection = await faceapi.detectSingleFace(
          video,
          new faceapi.SsdMobilenetv1Options({ minConfidence: minConf })
        ).withFaceLandmarks().withFaceDescriptor();

        if (detection) {
          console.log(`[ProctoringInstructions] Face detected directly on video stream at minConfidence ${minConf}! Score: ${detection.detection.score?.toFixed(3)}`);
          break;
        }
      }

      // PASS 2: If video pass yielded no face, test the static Canvas bitmap buffer
      if (!detection) {
        console.log('[ProctoringInstructions] Video pass yielded no face, attempting static canvas buffer...');
        const canvasConfidenceLevels = [0.40, 0.25, 0.15];
        for (const minConf of canvasConfidenceLevels) {
          detection = await faceapi.detectSingleFace(
            canvas,
            new faceapi.SsdMobilenetv1Options({ minConfidence: minConf })
          ).withFaceLandmarks().withFaceDescriptor();

          if (detection) {
            console.log(`[ProctoringInstructions] Face detected on canvas buffer at minConfidence ${minConf}! Score: ${detection.detection.score?.toFixed(3)}`);
            break;
          }
        }
      }

      // PASS 3: Contrast-boosted fallback pass
      if (!detection) {
        console.log('[ProctoringInstructions] Standard passes yielded no face, attempting auto-contrast pass...');
        const boostedCanvas = document.createElement('canvas');
        boostedCanvas.width = videoWidth;
        boostedCanvas.height = videoHeight;
        const bCtx = boostedCanvas.getContext('2d');
        bCtx.filter = 'contrast(1.3) brightness(1.1)';
        bCtx.drawImage(canvas, 0, 0);

        detection = await faceapi.detectSingleFace(
          boostedCanvas,
          new faceapi.SsdMobilenetv1Options({ minConfidence: 0.15 })
        ).withFaceLandmarks().withFaceDescriptor();

        if (detection) {
          console.log(`[ProctoringInstructions] Face detected via contrast-boosted pass! Score: ${detection.detection.score?.toFixed(3)}`);
        }
      }

      // Step 4: Verification of Multiple Faces or Complete Absence + Diagnostic logging
      if (!detection) {
        try {
          const allVideoFaces = await faceapi.detectAllFaces(
            video,
            new faceapi.SsdMobilenetv1Options({ minConfidence: 0.05 })
          );
          const allCanvasFaces = await faceapi.detectAllFaces(
            canvas,
            new faceapi.SsdMobilenetv1Options({ minConfidence: 0.05 })
          );
          console.warn('[ProctoringInstructions] Diagnostic face scan results:', {
            videoFaceCount: allVideoFaces?.length || 0,
            videoScores: allVideoFaces?.map(f => f.score) || [],
            canvasFaceCount: allCanvasFaces?.length || 0,
            canvasScores: allCanvasFaces?.map(f => f.score) || []
          });
          if ((allVideoFaces && allVideoFaces.length > 1) || (allCanvasFaces && allCanvasFaces.length > 1)) {
            dispatchPhoto({
              error: 'Multiple people detected in the camera frame. Please ensure only you are visible.',
              status: 'failed',
              capturing: false
            });
            return;
          }
        } catch (diagErr) {
          console.warn('[ProctoringInstructions] Diagnostic face check error:', diagErr);
        }

        dispatchPhoto({
          error: "No face detected in the frame. Please look directly at the camera, ensure good lighting, and try again.",
          status: 'failed',
          capturing: false
        });
        return;
      }

      const box = detection.detection.box;

      // Step 5: Verify margins (Face must not be severely clipped outside viewport)
      const borderThresholdX = videoWidth * 0.02;
      const borderThresholdY = videoHeight * 0.02;
      if (
        box.x < -borderThresholdX || 
        box.y < -borderThresholdY || 
        (box.x + box.width) > (videoWidth + borderThresholdX) || 
        (box.y + box.height) > (videoHeight + borderThresholdY)
      ) {
        dispatchPhoto({ error: "Face is cut off at the edge. Please center your face inside the guide.", status: 'failed', capturing: false });
        return;
      }

      // Step 6: Verify pose/symmetry (Looking straight check)
      const landmarks = detection.landmarks;
      const leftEye = landmarks.getLeftEye()[0];
      const rightEye = landmarks.getRightEye()[3];
      const nose = landmarks.getNose()[0];
      
      const distLeft = Math.abs(nose.x - leftEye.x);
      const distRight = Math.abs(rightEye.x - nose.x);
      
      if (distLeft > 0 && distRight > 0) {
        const ratio = distLeft / distRight;
        console.log('[ProctoringInstructions] Manual capture symmetry ratio:', ratio);
        if (ratio < 0.40 || ratio > 2.5) {
          dispatchPhoto({ error: "Please look straight at the camera. Severe side-facing photos are rejected.", status: 'failed', capturing: false });
          return;
        }
      }
      
      // Step 7: Export snapshot & descriptor
      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      
      const assessmentId = assessment?.id || 'unknown';
      localStorage.setItem('proctor_reference_photo_' + assessmentId, dataUrl);
      localStorage.setItem('proctor_reference_descriptor_' + assessmentId, JSON.stringify(Array.from(detection.descriptor)));
      
      const duration = assessment?.duration || 60;
      setProctorCacheExpiry(duration, assessmentId);
      
      // Single dispatch — one React render for all photo state changes (prevents flicker)
      dispatchPhoto({ url: dataUrl, status: 'captured', error: '', capturing: false });
      console.log('[ProctoringInstructions] Reference photo manually captured and validated!');
    } catch (err) {
      console.error('[ProctoringInstructions] Error during manual face capture:', err);
      dispatchPhoto({ error: "An error occurred during verification. Please try again.", status: 'failed', capturing: false });
    }
  }, [assessment]);

  useEffect(() => {
    // Pre-load photo from cache if present
    const assessmentId = assessment?.id;
    if (assessmentId) {
      const existingPhoto = localStorage.getItem('proctor_reference_photo_' + assessmentId);
      const existingDescriptor = localStorage.getItem('proctor_reference_descriptor_' + assessmentId);
      if (existingPhoto && existingDescriptor) {
        // Single dispatch — avoids two renders
        dispatchPhoto({ url: existingPhoto, status: 'captured' });
      }
    }
  }, [assessment?.id]);

  const handleContinue = () => {
    if (canContinue && streamRef.current && hasScrolledToBottom && isAcknowledged && photoStatus === 'captured') {
      if (isPremisesRequired && (premisesStatus !== 'connected' || !premisesFaceVerified || !premisesAngleVerified)) {
        console.warn('[ProctoringInstructions] Cannot proceed without connected, face-verified, and angle-verified premises camera');
        return;
      }
      console.log('[ProctoringInstructions] Continuing to test (Dual camera, face & angle verified)');
      isProceedingRef.current = true;
      // Don't stop the stream here - let ProctoringEngine use it
      onContinue();
    } else {
      console.warn('[ProctoringInstructions] Cannot continue:', {
        canContinue,
        hasStream: !!streamRef.current,
        hasScrolledToBottom,
        isAcknowledged,
        photoStatus,
        premisesStatus: isPremisesRequired ? premisesStatus : 'not_required'
      });
    }
  };

  const handleRetry = () => {
    if (verificationIntervalRef.current) {
      clearInterval(verificationIntervalRef.current);
      verificationIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (window.cameraStream) {
      window.cameraStream.getTracks().forEach(track => track.stop());
      window.cameraStream = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCanContinue(false);
    requestCameraAccess();
  };
  return (
    <div className="proctoring-instructions-overlay">
      <div className="proctoring-instructions-modal">
        <div className="instructions-header">
          <h2>
            <FaCamera className="header-icon" />
            Exam Entry & Proctoring Guidelines
          </h2>
          <p className="instructions-subtitle">Follow the steps below to verify your identity and start your assessment</p>
        </div>

        {/* Wizard Progress Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          padding: '16px 24px',
          background: 'var(--bg-primary, #0f172a)',
          borderBottom: '1px solid var(--border-color, #334155)'
        }}>
          {/* Step 1: Face Registration */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: photoStatus === 'captured' ? '#10b981' : 'var(--accent-coding, #10b981)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: '700'
            }}>
              {photoStatus === 'captured' ? '✓' : '1'}
            </span>
            <span style={{ fontSize: '13.5px', fontWeight: '600', color: currentStep === 1 ? 'var(--text-main, #f1f5f9)' : 'var(--text-muted, #94a3b8)' }}>
              Face Registration
            </span>
          </div>

          <div style={{ width: '40px', height: '2px', background: currentStep >= 2 ? '#10b981' : 'var(--border-color, #334155)' }}></div>

          {/* Optional Step 2: Mobile Premises Camera */}
          {isPremisesRequired && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: premisesStatus === 'connected' ? '#10b981' : currentStep === 2 ? 'var(--accent-coding, #10b981)' : 'var(--bg-secondary, #1e293b)',
                  border: (currentStep === 2 || premisesStatus === 'connected') ? 'none' : '1px solid var(--border-color, #334155)',
                  color: (currentStep === 2 || premisesStatus === 'connected') ? 'white' : 'var(--text-muted, #94a3b8)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: '700'
                }}>
                  {premisesStatus === 'connected' ? '✓' : '2'}
                </span>
                <span style={{ fontSize: '13.5px', fontWeight: '600', color: currentStep === 2 ? 'var(--text-main, #f1f5f9)' : 'var(--text-muted, #94a3b8)' }}>
                  Premises Camera
                </span>
              </div>

              <div style={{ width: '40px', height: '2px', background: currentStep >= 3 ? '#10b981' : 'var(--border-color, #334155)' }}></div>
            </>
          )}

          {/* Final Step: Guidelines */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: currentStep === (isPremisesRequired ? 3 : 2) ? 'var(--accent-coding, #10b981)' : 'var(--bg-secondary, #1e293b)',
              border: currentStep === (isPremisesRequired ? 3 : 2) ? 'none' : '1px solid var(--border-color, #334155)',
              color: currentStep === (isPremisesRequired ? 3 : 2) ? 'white' : 'var(--text-muted, #94a3b8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: '700'
            }}>
              {isPremisesRequired ? '3' : '2'}
            </span>
            <span style={{ fontSize: '13.5px', fontWeight: '600', color: currentStep === (isPremisesRequired ? 3 : 2) ? 'var(--text-main, #f1f5f9)' : 'var(--text-muted, #94a3b8)' }}>
              Proctoring Guidelines
            </span>
          </div>
        </div>

        {/* STEP 1: IDENTITY VERIFICATION & CAPTURE */}
        {currentStep === 1 && (
          <div className="instructions-content">
            <div className="registration-grid-layout">
              {/* Left Column: Camera Preview */}
              <div className="camera-preview-section" style={{ margin: 0 }}>
                <h3>
                  <FaCamera className="section-icon" />
                  Camera Registration Preview
                </h3>
                <div className="camera-preview-container">
                  {cameraStatus === 'requesting' && (
                    <div className="camera-status-message">
                      <FaSpinner className="spinner-icon" />
                      <p>Requesting camera access...</p>
                      <p className="camera-status-hint">Please allow camera access when prompted by the browser.</p>
                    </div>
                  )}

                  {cameraStatus === 'granted' && (
                    <div className="camera-preview-wrapper" style={{ maxWidth: '100%', width: '100%' }}>
                    <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className="instructions-video-preview"
                        style={{ willChange: 'transform', transform: 'translateZ(0)' }}
                      />
                      
                      {photoStatus !== 'captured' && (
                        <>
                          {/* Vignette: separate static div so it never repaints during state updates */}
                          <div className="face-guide-vignette" aria-hidden="true" />
                          <div className="face-guide-oval">
                            <div className="guide-text">Position face inside oval</div>
                          </div>
                        </>
                      )}

                      <div className="photo-capture-overlay">
                        {photoStatus === 'captured' && (
                          <div className="photo-scan-status scan-captured">
                            <FaCheckCircle className="scan-success-icon" />
                            <span> Identity Verified & Registered!</span>
                          </div>
                        )}
                      </div>
                      {photoURL && (
                        <div className="photo-thumbnail">
                          <img src={photoURL} alt="Registered Identity" />
                          <span className="thumbnail-label">REGISTERED</span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {cameraStatus === 'denied' && (
                    <div className="camera-status-error">
                      <FaExclamationTriangle className="error-icon" />
                      <p>{cameraError || 'Camera access is required'}</p>
                      <button className="retry-camera-btn" onClick={handleRetry}>
                        Retry Camera Access
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Controls & Verification Checklist */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{
                  background: 'var(--bg-primary, #0f172a)',
                  border: '1px solid var(--border-color, #334155)',
                  borderRadius: '12px',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px'
                }}>
                  <h4 style={{ color: 'var(--text-main, #f1f5f9)', fontSize: '15px', fontWeight: 700, margin: 0 }}>
                    Register Face Profile
                  </h4>
                  <p style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '13px', margin: 0, lineHeight: '1.4' }}>
                    Ensure you are in a well-lit room, looking straight at the camera. Click the button below to register your face structure.
                  </p>

                  <div className="camera-controls-section" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {captureError && (
                      <div className="lw-error-row" style={{
                        background: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#f87171',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        fontWeight: '600'
                      }}>
                        <FaExclamationTriangle style={{ flexShrink: 0 }} /> {captureError}
                      </div>
                    )}

                    {photoStatus !== 'captured' ? (
                      <button 
                        className="lw-btn-primary" 
                        style={{ width: '100%', justifyContent: 'center', gap: '8px', padding: '12px', background: 'var(--accent-coding, #10b981)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600' }}
                        onClick={captureReferencePhoto}
                        disabled={isCapturing || cameraStatus !== 'granted'}
                      >
                        {isCapturing ? (
                          <>
                            <FaSpinner className="spinner-icon pulse" style={{ fontSize: '16px', margin: 0 }} />
                            <span>Verifying face quality...</span>
                          </>
                        ) : (
                          <>
                            <FaCamera />
                            <span>Capture Registration Photo</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <button 
                        className="lw-btn-secondary" 
                        style={{ width: '100%', justifyContent: 'center', gap: '8px', padding: '12px', background: 'rgba(51, 65, 85, 0.65)', border: '1px solid rgba(100, 116, 139, 0.35)', color: '#cbd5e1', borderRadius: '8px' }}
                        onClick={() => {
                          dispatchPhoto({ status: 'pending', url: null, error: '' });
                          const assessmentId = assessment?.id || 'unknown';
                          localStorage.removeItem('proctor_reference_photo_' + assessmentId);
                          localStorage.removeItem('proctor_reference_descriptor_' + assessmentId);
                          if (premisesSessionRef.current) {
                            try {
                              premisesSessionRef.current.destroy({ deleteFromFirestore: true });
                            } catch (_) {}
                            premisesSessionRef.current = null;
                            window.premisesSession = null;
                          }
                          setPremisesStatus('initializing');
                          setPremisesPairingCode('');
                          setPremisesQrDataUrl('');
                          setPremisesFaceVerified(false);
                          setPremisesFaceVerificationStatus('pending');
                          setPremisesFaceDistance(null);
                          setPremisesAngleVerified(false);
                        }}
                      >
                        <FaSync />
                        <span>Retake Registration Photo</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Status Checks */}
                <div className="camera-verification-checklist" style={{ margin: 0 }}>
                  <h4>Verification Steps</h4>
                  <ul>
                    <li className={cameraStatus === 'granted' ? 'passed' : 'pending'}>
                      <span className="badge-bullet"></span>
                      <span className="badge-text">Webcam Access Permission</span>
                      <span className="badge-status">{cameraStatus === 'granted' ? ' Passed' : '○ Pending'}</span>
                    </li>
                    <li className={photoStatus === 'captured' ? 'passed' : 'pending'}>
                      <span className="badge-bullet"></span>
                      <span className="badge-text">Offline Face Registration</span>
                      <span className="badge-status">{photoStatus === 'captured' ? ' Registered' : isCapturing ? ' Verifying...' : '○ Pending'}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: PREMISES CAMERA PAIRING (When required) */}
        {isPremisesRequired && currentStep === 2 && (
          <div className="instructions-content" style={{ padding: '24px 32px' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '24px',
              alignItems: 'start'
            }}>
              {/* Left Column: Instructions & Code */}
              <div style={{
                background: 'rgba(30, 41, 59, 0.5)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                borderRadius: '16px',
                padding: '24px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: '18px'
                  }}>
                    <FaMobileAlt />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: '#f8fafc' }}>
                      Dual-Camera Setup Required
                    </h3>
                    <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                      Connect your Android phone to monitor your desk &amp; room premises
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '20px 0' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#3b82f6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>1</span>
                    <span style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.4' }}>Open the <strong>SEEDit app</strong> on your Android mobile device.</span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#3b82f6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>2</span>
                    <span style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.4' }}>Tap the <strong>Premises Camera</strong> scanner icon in the header or Tests tab.</span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#3b82f6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>3</span>
                    <span style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.4' }}>Scan the QR code or manually enter the 6-digit session code:</span>
                  </div>
                </div>

                {/* Session Code Display */}
                <div style={{
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px dashed #10b981',
                  borderRadius: '12px',
                  padding: '14px',
                  textAlign: 'center',
                  marginBottom: '16px'
                }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '700' }}>
                    Manual Session Pairing Code
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: '800', letterSpacing: '4px', color: '#34d399', fontFamily: 'monospace', margin: '4px 0' }}>
                    {premisesPairingCode || '------'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '6px' }}>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      Session ID: {premisesSessionRef.current?.sessionId || ('P-' + premisesPairingCode)}
                    </span>
                    <button
                      type="button"
                      onClick={handleRegeneratePremisesSession}
                      title="Generate new pairing code"
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(52, 211, 153, 0.4)',
                        borderRadius: '6px',
                        color: '#34d399',
                        fontSize: '11px',
                        padding: '2px 8px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <FaSync style={{ fontSize: '10px' }} />
                      <span>Refresh Code</span>
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#3b82f6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>4</span>
                  <span style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.4' }}>Place your phone on your desk at a <strong>45° angle</strong> showing your keyboard, workspace, and immediate area.</span>
                </div>
              </div>

              {/* Right Column: QR Code / Live Viewfinder */}
              <div style={{
                background: 'rgba(30, 41, 59, 0.5)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                borderRadius: '16px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '380px',
                textAlign: 'center'
              }}>
                {premisesStatus === 'connected' ? (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{
                      position: 'relative',
                      width: '100%',
                      maxWidth: '360px',
                      height: '240px',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      border: '2px solid #10b981',
                      background: '#000',
                      boxShadow: '0 8px 24px rgba(16, 185, 129, 0.25)'
                    }}>
                      <video
                        ref={premisesVideoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <div style={{
                        position: 'absolute',
                        top: '10px',
                        left: '10px',
                        background: 'rgba(16, 185, 129, 0.9)',
                        color: '#fff',
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '11px',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff' }}></span>
                        PREMISES LIVE
                      </div>
                      {premisesBattery !== null && (
                        <div style={{
                          position: 'absolute',
                          top: '10px',
                          right: '10px',
                          background: 'rgba(15, 23, 42, 0.85)',
                          color: '#f8fafc',
                          padding: '4px 8px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: '600'
                        }}>
                          📱 {premisesBattery}%
                        </div>
                      )}
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginTop: '14px',
                      color: premisesFaceVerified ? '#10b981' : '#f59e0b',
                      fontWeight: '700',
                      fontSize: '13.5px'
                    }}>
                      <FaCheckCircle style={{ fontSize: '18px' }} />
                      <span>Phone Camera Connected &amp; Streaming</span>
                    </div>

                    {/* Dual Face Identity Verification Status Card */}
                    <div style={{
                      marginTop: '12px',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      width: '100%',
                      maxWidth: '360px',
                      background: premisesFaceVerified 
                        ? 'rgba(16, 185, 129, 0.14)' 
                        : premisesFaceVerificationStatus === 'verifying'
                        ? 'rgba(59, 130, 246, 0.14)'
                        : premisesFaceVerificationStatus === 'mismatch' || premisesFaceVerificationStatus === 'no_face'
                        ? 'rgba(239, 68, 68, 0.16)'
                        : 'rgba(245, 158, 11, 0.14)',
                      border: premisesFaceVerified
                        ? '1px solid #10b981'
                        : premisesFaceVerificationStatus === 'verifying'
                        ? '1px solid #3b82f6'
                        : premisesFaceVerificationStatus === 'mismatch' || premisesFaceVerificationStatus === 'no_face'
                        ? '1px solid #ef4444'
                        : '1px solid #f59e0b',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                      textAlign: 'center'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontWeight: '700',
                        fontSize: '13px',
                        color: premisesFaceVerified 
                          ? '#10b981' 
                          : premisesFaceVerificationStatus === 'verifying'
                          ? '#60a5fa'
                          : premisesFaceVerificationStatus === 'mismatch' || premisesFaceVerificationStatus === 'no_face'
                          ? '#f87171'
                          : '#fbbf24'
                      }}>
                        {premisesFaceVerified ? (
                          <>
                            <FaCheckCircle style={{ fontSize: '16px' }} />
                            <span>Dual Face Match Confirmed (Same Candidate)</span>
                          </>
                        ) : premisesFaceVerificationStatus === 'verifying' ? (
                          <>
                            <FaSpinner className="spinner-icon pulse" style={{ fontSize: '15px' }} />
                            <span>Comparing Laptop &amp; Mobile Face...</span>
                          </>
                        ) : premisesFaceVerificationStatus === 'mismatch' ? (
                          <>
                            <FaTimesCircle style={{ fontSize: '16px' }} />
                            <span>Face Mismatch! Please retake on mobile phone.</span>
                          </>
                        ) : premisesFaceVerificationStatus === 'no_face' ? (
                          <>
                            <FaExclamationTriangle style={{ fontSize: '16px' }} />
                            <span>No face detected in mobile selfie. Retake required.</span>
                          </>
                        ) : (
                          <>
                            <FaClock style={{ fontSize: '15px' }} />
                            <span>Waiting for Mobile Face Verification Selfie...</span>
                          </>
                        )}
                      </div>
                      <p style={{ margin: 0, fontSize: '11.5px', color: '#cbd5e1' }}>
                        {premisesFaceVerified
                          ? 'Face confirmed identical to registered webcam photo. Now position phone on desk.'
                          : 'Hold your mobile phone at eye level in the SEEDit app to verify your identity.'}
                      </p>
                    </div>

                    {/* Setup & Camera Angle Verification Checklist Card */}
                    {premisesFaceVerified && (
                      <div style={{
                        marginTop: '12px',
                        padding: '14px 16px',
                        borderRadius: '12px',
                        width: '100%',
                        maxWidth: '360px',
                        background: premisesAngleVerified ? 'rgba(16, 185, 129, 0.12)' : 'rgba(30, 41, 59, 0.85)',
                        border: premisesAngleVerified ? '1px solid #10b981' : '1px solid #334155',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        textAlign: 'left'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '12.5px', fontWeight: '700', color: premisesAngleVerified ? '#34d399' : '#f1f5f9' }}>
                            {premisesAngleVerified ? '✅ Desk Setup & Angle Verified' : '📐 Workspace & Angle Check'}
                          </span>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: '700',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            background: premisesAngleVerified ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.2)',
                            color: premisesAngleVerified ? '#10b981' : '#fbbf24'
                          }}>
                            {premisesAngleVerified ? 'PASSED' : `STABILITY ${premisesAngleCheck.streak}/2`}
                          </span>
                        </div>

                        {/* Checklist items */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11.5px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: premisesAngleCheck.candidateSeated ? '#10b981' : '#cbd5e1' }}>
                            <span>👤 Candidate Seated at Desk</span>
                            <span>{premisesAngleCheck.candidateSeated ? '✓ Visible' : '○ Sit in View'}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: premisesAngleCheck.laptopVisible ? '#10b981' : '#cbd5e1' }}>
                            <span>💻 Assessment Laptop in View</span>
                            <span>{premisesAngleCheck.laptopVisible ? '✓ Visible' : '○ Adjust Phone Angle'}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: premisesAngleCheck.noProhibited ? '#10b981' : '#f87171' }}>
                            <span>🚫 Strict 2-Item Rule (No bags, phones, books)</span>
                            <span>{premisesAngleCheck.noProhibited ? '✓ Clean Desk' : `⚠ Prohibited: ${premisesAngleCheck.prohibitedItems.join(', ')}`}</span>
                          </div>
                        </div>

                        <div style={{
                          fontSize: '11px',
                          color: premisesAngleVerified ? '#94a3b8' : '#fbbf24',
                          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                          paddingTop: '6px'
                        }}>
                          {premisesAngleCheck.reason}
                        </div>
                      </div>
                    )}

                    <p style={{ fontSize: '11.5px', color: '#94a3b8', margin: '8px 0 0 0' }}>
                      Place phone on your desk at a 45° angle. Only candidate and laptop are permitted in frame.
                    </p>
                  </div>
                ) : (
                  <div>
                    {(premisesStatus === 'disconnected' || premisesStatus === 'error') && (
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '16px',
                        background: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                        borderRadius: '12px',
                        marginBottom: '16px',
                        maxWidth: '320px'
                      }}>
                        <FaExclamationTriangle style={{ color: '#ef4444', fontSize: '24px' }} />
                        <div style={{ color: '#f87171', fontWeight: '700', fontSize: '13px' }}>
                          Premises Camera Disconnected
                        </div>
                        <p style={{ margin: 0, fontSize: '11.5px', color: '#cbd5e1', textAlign: 'center' }}>
                          Connection to mobile phone was lost. Keep your phone active and click below to reconnect.
                        </p>
                        <button
                          type="button"
                          onClick={handleReconnectPremises}
                          style={{
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 16px',
                            fontWeight: '600',
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <FaSync />
                          <span>Reconnect Stream</span>
                        </button>
                      </div>
                    )}
                    <div style={{
                      width: '240px',
                      height: '240px',
                      background: '#fff',
                      borderRadius: '16px',
                      padding: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px auto',
                      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
                    }}>
                      {premisesQrDataUrl ? (
                        <img
                          src={premisesQrDataUrl}
                          alt="Pairing QR Code"
                          style={{ width: '100%', height: '100%', display: 'block', borderRadius: '8px' }}
                        />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', color: '#64748b' }}>
                          <FaSpinner className="spinner-icon pulse" style={{ fontSize: '24px' }} />
                          <span style={{ fontSize: '12px' }}>Generating Pairing QR...</span>
                        </div>
                      )}
                    </div>

                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 14px',
                      borderRadius: '20px',
                      background: premisesStatus === 'connecting' ? 'rgba(234, 179, 8, 0.2)' : 'rgba(59, 130, 246, 0.15)',
                      color: premisesStatus === 'connecting' ? '#facc15' : '#60a5fa',
                      fontSize: '12.5px',
                      fontWeight: '600'
                    }}>
                      {premisesStatus === 'connecting' ? (
                        <>
                          <FaSpinner className="spinner-icon pulse" />
                          <span>Establishing WebRTC Connection...</span>
                        </>
                      ) : (
                        <>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6', animation: 'blink-rec 1.2s infinite' }}></span>
                          <span>Waiting for Mobile Phone to Scan...</span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP GUIDELINES & AGREEMENT */}
        {currentStep === (isPremisesRequired ? 3 : 2) && (
          <>
            <div
              className="instructions-content"
              ref={contentRef}
              onScroll={handleContentScroll}
              tabIndex={0}
            >
              <div className="instructions-scroll-hint">
                <FaExclamationTriangle className="hint-icon" />
                <span>Scroll through the guidelines and check the box at the bottom to start.</span>
              </div>

              <div className="instructions-grid-layout">
                <div className="instructions-left-column">
                  {assessment && (
                    <div className="instructions-assessment-card" style={{
                      background: 'linear-gradient(135deg, #1e1b4b 0%, #311042 100%)',
                      borderRadius: '16px',
                      padding: '24px',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
                      position: 'relative',
                      overflow: 'hidden',
                      color: '#ffffff',
                      border: '1px solid var(--border-color)'
                    }}>
                      <span style={{ 
                        fontSize: '0.72rem', 
                        color: '#c7d2fe', 
                        fontWeight: '700', 
                        textTransform: 'uppercase', 
                        letterSpacing: '0.15em',
                        display: 'block',
                        marginBottom: '8px',
                        textAlign: 'left'
                      }}>Selected Assessment</span>
                      
                      <h4 style={{
                        margin: '0 0 20px',
                        fontSize: '1.45rem',
                        color: '#ffffff',
                        fontWeight: '800',
                        lineHeight: '1.3',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
                        paddingBottom: '14px',
                        textAlign: 'left'
                      }}>{assessment.name}</h4>
                      
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '12px'
                      }}>
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          background: 'rgba(255, 255, 255, 0.08)',
                          padding: '12px 8px',
                          borderRadius: '12px',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                          textAlign: 'center'
                        }}>
                          <FaLaptopCode style={{ fontSize: '1.25rem', color: '#ffffff', marginBottom: '6px' }} />
                          <span style={{ fontSize: '0.7rem', color: '#e0e7ff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</span>
                          <span style={{ fontSize: '0.88rem', color: '#ffffff', fontWeight: '700', marginTop: '4px', textTransform: 'capitalize' }}>{assessment.type}</span>
                        </div>
                        
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          background: 'rgba(255, 255, 255, 0.08)',
                          padding: '12px 8px',
                          borderRadius: '12px',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                          textAlign: 'center'
                        }}>
                          <FaClock style={{ fontSize: '1.25rem', color: '#ffffff', marginBottom: '6px' }} />
                          <span style={{ fontSize: '0.7rem', color: '#e0e7ff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Duration</span>
                          <span style={{ fontSize: '0.88rem', color: '#ffffff', fontWeight: '700', marginTop: '4px' }}>{assessment.duration} Mins</span>
                        </div>
                        
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          background: 'rgba(255, 255, 255, 0.08)',
                          padding: '12px 8px',
                          borderRadius: '12px',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                          textAlign: 'center'
                        }}>
                          <FaClipboardList style={{ fontSize: '1.25rem', color: '#ffffff', marginBottom: '6px' }} />
                          <span style={{ fontSize: '0.7rem', color: '#e0e7ff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Questions</span>
                          <span style={{ fontSize: '0.88rem', color: '#ffffff', fontWeight: '700', marginTop: '4px' }}>{assessment.questions ?? ''} Qs</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Section details for Multi-Section Assessments */}
                  {assessment.isMultiSection && assessment.sections && assessment.sections.length > 0 && (
                    <div style={{ marginTop: '0px', background: 'var(--bg-primary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                      <h4 style={{ color: 'var(--accent-coding)', margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: '700', letterSpacing: '-0.01em', textAlign: 'left' }}>Assessment Sections</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {assessment.sections.map((sec, idx) => {
                          const secQCount = Array.isArray(sec.questionIds) ? sec.questionIds.length : (Array.isArray(sec.questions) ? sec.questions.length : (Number(sec.questions) || 0));
                          return (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ color: 'var(--text-muted)', fontWeight: '700', fontSize: '0.85rem' }}>#{idx + 1}</span>
                                <span style={{ color: 'var(--text-main)', fontWeight: '600', fontSize: '0.9rem' }}>{sec.name}</span>
                              </div>
                              <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                                <span> {sec.duration_minutes || sec.duration || 0}m</span>
                                <span> {secQCount > 0 ? `${secQCount} Qs` : sec.type?.toUpperCase()}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="instructions-right-column">
                  <div className="instructions-section">
                    <h3>
                      <FaCheckCircle className="section-icon check-icon" />
                      What You MUST Do:
                    </h3>
                    <ul className="instructions-list do-list">
                      <li>
                        <FaCheckCircle className="check-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Keep yourself clearly visible in front of the camera at all times</span>
                      </li>
                      <li>
                        <FaCheckCircle className="check-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Ensure good lighting so you are clearly visible</span>
                      </li>
                      <li>
                        <FaCheckCircle className="check-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Stay in front of the camera throughout the entire test</span>
                      </li>
                      <li>
                        <FaCheckCircle className="check-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Make sure only you are visible in the camera view</span>
                      </li>
                      <li>
                        <FaCheckCircle className="check-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Keep your eyes on the screen</span>
                      </li>
                      <li>
                        <FaCheckCircle className="check-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Ensure a stable internet connection</span>
                      </li>
                    </ul>
                  </div>

                  <div className="instructions-section">
                    <h3>
                      <FaTimesCircle className="section-icon dont-icon" />
                      What You MUST NOT Do:
                    </h3>
                    <ul className="instructions-list dont-list">
                      <li>
                        <FaTimesCircle className="dont-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Do not leave your seat or move away from the camera</span>
                      </li>
                      <li>
                        <FaTimesCircle className="dont-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Do not allow anyone else to appear in the camera view</span>
                      </li>
                      <li>
                        <FaTimesCircle className="dont-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Do not cover yourself or turn away from the camera</span>
                      </li>
                      <li>
                        <FaTimesCircle className="dont-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Do not use mobile phones or other devices during the test</span>
                      </li>
                      <li>
                        <FaTimesCircle className="dont-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Do not switch tabs or minimize the browser window</span>
                      </li>
                      <li>
                        <FaTimesCircle className="dont-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Do not communicate with anyone during the test</span>
                      </li>
                    </ul>
                  </div>

                  <div className="instructions-section warning-section">
                    <h3>
                      <FaExclamationTriangle className="section-icon warning-icon" />
                      Important Notes:
                    </h3>
                    <ul className="instructions-list warning-list">
                      <li>
                        <FaExclamationTriangle className="warning-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Camera access is mandatory - the test cannot proceed without it</span>
                      </li>
                      <li>
                        <FaExclamationTriangle className="warning-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Violations are tracked automatically (no person detected, multiple people detected)</span>
                      </li>
                      <li>
                        <FaExclamationTriangle className="warning-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>After 15 violations, your test will be automatically submitted</span>
                      </li>
                      <li>
                        <FaExclamationTriangle className="warning-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>A mini camera view will be displayed during the test</span>
                      </li>
                      <li>
                        <FaExclamationTriangle className="warning-icon" style={{ marginRight: '10px', flexShrink: 0, marginTop: '3px' }} />
                        <span>Your test session is being monitored for integrity</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className={`instructions-acknowledgement ${!hasScrolledToBottom ? 'disabled' : ''}`}>
              <label>
                <input
                  type="checkbox"
                  checked={isAcknowledged}
                  disabled={!hasScrolledToBottom}
                  onChange={(e) => setIsAcknowledged(e.target.checked)}
                />
                I have read and accept the proctoring guidelines
              </label>
              {!hasScrolledToBottom && (
                <small>Scroll to the bottom of the guidelines to enable agreement.</small>
              )}
            </div>
          </>
        )}

        {/* Footer controls based on active wizard step */}
        <div className="instructions-footer">
          {currentStep === 1 ? (
            <>
              <button 
                className="instructions-btn cancel-btn"
                onClick={handleCancelInstructions}
              >
                Cancel
              </button>
              <button 
                className={`instructions-btn continue-btn ${(!canContinue || photoStatus !== 'captured') ? 'disabled' : ''}`}
                onClick={() => setCurrentStep(2)}
                disabled={!canContinue || photoStatus !== 'captured'}
              >
                {isPremisesRequired ? 'Proceed to Premises Camera' : 'Proceed to Guidelines'}
              </button>
            </>
          ) : isPremisesRequired && currentStep === 2 ? (
            <>
              <button 
                className="instructions-btn cancel-btn"
                onClick={() => setCurrentStep(1)}
              >
                Back to Registration
              </button>
              <button 
                className={`instructions-btn continue-btn ${(premisesStatus !== 'connected' || !premisesFaceVerified || !premisesAngleVerified) ? 'disabled' : ''}`}
                onClick={() => setCurrentStep(3)}
                disabled={premisesStatus !== 'connected' || !premisesFaceVerified || !premisesAngleVerified}
              >
                {!premisesFaceVerified 
                  ? 'Verify Face on Mobile' 
                  : !premisesAngleVerified 
                  ? 'Align Desk Setup & Angle' 
                  : 'Proceed to Guidelines'}
              </button>
            </>
          ) : (
            <>
              <button 
                className="instructions-btn cancel-btn"
                onClick={() => setCurrentStep(isPremisesRequired ? 2 : 1)}
              >
                {isPremisesRequired ? 'Back to Premises Camera' : 'Back to Registration'}
              </button>
              <button 
                className={`instructions-btn continue-btn ${(!hasScrolledToBottom || !isAcknowledged || (isPremisesRequired && (premisesStatus !== 'connected' || !premisesFaceVerified || !premisesAngleVerified))) ? 'disabled' : ''}`}
                onClick={handleContinue}
                disabled={!hasScrolledToBottom || !isAcknowledged || (isPremisesRequired && (premisesStatus !== 'connected' || !premisesFaceVerified || !premisesAngleVerified))}
              >
                I Understand, Start Test
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProctoringInstructions;
