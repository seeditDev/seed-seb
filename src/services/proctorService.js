/**
 * proctorService.js — SEED SEB Proctoring Event Logger
 *
 * v2 Firestore path:  proctoringLogs/{attemptId}/events/{eventId}
 *   where attemptId = {assessmentId}_{uid}   (Firebase Auth UID — NOT email)
 *
 * Identity rule:
 *   uid must be passed in from the authenticated component that holds
 *   auth.currentUser.uid. This service MUST NOT read localStorage to
 *   derive identity. localStorage is untrusted by policy.
 *
 * Offline queue (events):
 *   Events that fail to upload are queued in localStorage under a key
 *   scoped to {uid}_{assessmentId} to prevent cross-user contamination.
 *   They are retried idempotently on reconnect using the stored eventId.
 *
 *   [P1] During an active assessment, events are NEVER permanently dropped
 *   regardless of retry count. The assessment must flush or finalise before
 *   events become eligible for discard.
 *
 * Offline snapshot queue (webcam images — v2):
 *   Webcam snapshots are stored as native Blobs in IndexedDB (safeStorage.js).
 *   This avoids the ~5 MB localStorage quota limit, eliminates Base64/FileReader
 *   main-thread blocking, and prevents sensitive biometric images from persisting
 *   as plain text in browser storage. Blobs are removed from IndexedDB after
 *   successful upload to Firebase Storage.
 *
 *   [P2] Quota limits: MAX_OFFLINE_SNAPSHOTS and SNAPSHOT_MAX_AGE_MS cap the
 *   accumulation of snapshots during long offline sessions.
 *
 * Append-only rule:
 *   Events are written with addDoc (auto-generated ID) or setDoc with
 *   a client-generated UUID. They are NEVER updated after creation.
 *   Historical events must not be modified.
 *
 * Canonical event ordering:
 *   Use (serverTimestamp, clientTimestamp, sessionId, sequence) as the
 *   authoritative tuple. The sequence counter is per-session (resets on
 *   process restart). sessionId disambiguates events from separate restarts.
 *   Do NOT rely on sequence alone for forensic ordering.
 */

import { db, storage } from '../lib/firebase-config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { saveProctorSnapshot, getProctorSnapshots, removeProctorSnapshot } from '../utils/safeStorage';

// ─── Session Identity ──────────────────────────────────────────────────────────
// [P2] Stable for the lifetime of this module load (i.e. this process/page session).
// Used in event records so forensic analysis can distinguish events from separate
// application restarts. Resets if the page is reloaded — that is intentional.
const SESSION_ID = (typeof crypto !== 'undefined' && crypto.randomUUID)
  ? crypto.randomUUID()
  : `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

// ─── Offline Queue ─────────────────────────────────────────────────────────────

const OFFLINE_QUEUE_PREFIX     = 'proctor_offline_';
const MAX_RETRY_COUNT          = 5;          // Applies only when isAssessmentActive=false
const ASSESSMENT_MAX_QUEUE_SIZE = 500;       // [P2] Hard cap on queued events during active assessment

function offlineQueueKey(uid, assessmentId) {
  // Scoped to uid + assessmentId to prevent cross-user contamination
  return `${OFFLINE_QUEUE_PREFIX}${uid}_${assessmentId}`;
}

function readOfflineQueue(uid, assessmentId) {
  try {
    const raw = localStorage.getItem(offlineQueueKey(uid, assessmentId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeOfflineQueue(uid, assessmentId, events) {
  try {
    localStorage.setItem(offlineQueueKey(uid, assessmentId), JSON.stringify(events));
  } catch (_) {}
}

function appendToOfflineQueue(uid, assessmentId, event) {
  const queue = readOfflineQueue(uid, assessmentId);
  // Deduplicate by eventId
  const existing = queue.find((e) => e.eventId === event.eventId);
  if (!existing) {
    // [P2] Hard cap: warn and do not add if we exceed the maximum queue size.
    if (queue.length >= ASSESSMENT_MAX_QUEUE_SIZE) {
      console.warn(
        `[ProctorService] Offline queue cap (${ASSESSMENT_MAX_QUEUE_SIZE}) reached for ` +
        `uid=${uid} assessmentId=${assessmentId}. Event NOT added: ${event.eventId}. ` +
        'Ensure connectivity is restored to flush the queue.'
      );
      return;
    }
    queue.push(event);
    writeOfflineQueue(uid, assessmentId, queue);
  }
}

/**
 * Generate a UUID-like event ID for idempotent offline event handling.
 * @returns {string}
 */
function generateEventId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Sequence Counter ──────────────────────────────────────────────────────────
// [P2] Per-session counter. Resets to 0 on page/process restart.
// Use (sessionId, sequence) together for reliable ordering within a session;
// use (serverTimestamp, clientTimestamp) for cross-session ordering.

const sequenceCounters = new Map(); // key: `${uid}_${assessmentId}` → number

function nextSequence(uid, assessmentId) {
  const key = `${uid}_${assessmentId}`;
  const current = sequenceCounters.get(key) || 0;
  const next = current + 1;
  sequenceCounters.set(key, next);
  return next;
}

// ─── Snapshot Quota ────────────────────────────────────────────────────────────
// [P2] Caps the number of snapshots accumulated during long offline sessions.

const MAX_OFFLINE_SNAPSHOTS = 100;
const SNAPSHOT_MAX_AGE_MS   = 24 * 60 * 60 * 1000; // 24 hours

// ─── ProctorService ────────────────────────────────────────────────────────────

class ProctorService {
  /**
   * Upload a proctoring snapshot to Firebase Storage.
   *
   * @param {string} uid          — Firebase Auth UID (NOT email)
   * @param {string} assessmentId — Assessment ID
   * @param {Blob}   imageBlob    — Image blob
   * @param {string} filename     — Filename for the image
   * @returns {Promise<string|null>} Download URL or null on failure
   */
  static async uploadSnapshot(uid, assessmentId, imageBlob, filename) {
    if (!uid || !assessmentId) {
      console.error('[ProctorService] uploadSnapshot: uid and assessmentId are required.');
      return null;
    }
    try {
      if (!imageBlob) {
        console.warn('[ProctorService] No image blob provided');
        return null;
      }

      // Storage path scoped to UID (not email) to prevent cross-user data mixing
      const sanitizedUid        = uid.replace(/[^a-zA-Z0-9]/g, '_');
      const sanitizedAssessment = assessmentId.replace(/[^a-zA-Z0-9]/g, '_');
      const sanitizedFilename   = filename.replace(/[^a-zA-Z0-9]/g, '_');

      const storagePath = `proctor_snapshots/${sanitizedUid}/${sanitizedAssessment}/${sanitizedFilename}.jpg`;
      const storageRef  = ref(storage, storagePath);

      const snapshot    = await uploadBytes(storageRef, imageBlob, {
        contentType:  'image/jpeg',
        cacheControl: 'private, max-age=86400',
      });

      const downloadURL = await getDownloadURL(snapshot.ref);
      console.log('[ProctorService] Snapshot uploaded:', storagePath);
      return downloadURL;

    } catch (error) {
      console.error('[ProctorService] Error uploading snapshot:', error);
      // Save for retry — do not pass email, use UID-scoped key
      this._saveOfflineSnapshot(uid, assessmentId, imageBlob, filename);
      return null;
    }
  }

  /**
   * Log a proctoring event to Firestore.
   *
   * v2 path: proctoringLogs/{assessmentId}_{uid}/events/{eventId}
   *
   * IDENTITY: uid MUST be auth.currentUser.uid — passed in from the
   * authenticated component. This method does NOT read localStorage.
   *
   * Canonical ordering: (serverTimestamp, clientTimestamp, sessionId, sequence).
   * Do NOT use sequence alone for forensic ordering — it resets on restart.
   *
   * @param {string} uid          — Firebase Auth UID (required)
   * @param {string} assessmentId — Assessment ID (required)
   * @param {string} tenantId     — Tenant ID for the parent doc metadata
   * @param {object} eventData    — Event fields
   * @returns {Promise<string|null>} eventId or null on failure
   */
  static async logProctorEvent(uid, assessmentId, tenantId, eventData) {
    if (!uid || !assessmentId) {
      console.error('[ProctorService] logProctorEvent: uid and assessmentId are required. Not reading from localStorage.');
      return null;
    }

    const normEvent = eventData;
    const {
      eventType, misbehaviorCount,
      snapshotUrl, sectionId,
    } = eventData;

    const attemptId      = `${assessmentId}_${uid}`;
    const eventId        = generateEventId();
    const eventTimestamp = (normEvent.timestamp ? new Date(normEvent.timestamp).toISOString() : null) || new Date().toISOString();
    const seqNum         = nextSequence(uid, assessmentId);

    const logData = {
      // ── Identity (from Firebase Auth, not localStorage) ──────────────────
      uid,
      tenantId:        tenantId ?? '',
      attemptId,
      assessmentId,

      // ── Event data ───────────────────────────────────────────────────────
      eventId,
      type:            normEvent.type !== 'unknown' ? normEvent.type : (eventType || 'violation'),
      severity:        normEvent.severity,

      // ── Sequence ordering ─────────────────────────────────────────────────
      // [P2] sessionId + sequence provide reliable within-session ordering.
      // For cross-session ordering use serverTimestamp or clientTimestamp.
      sequence:        seqNum,
      sessionId:       SESSION_ID,

      // ── Timestamps ───────────────────────────────────────────────────────
      timestamp:       serverTimestamp(),  // Server-authoritative (Firestore sets this)
      clientTimestamp: eventTimestamp,     // Client clock (may drift; use for correlation)

      // ── Context ──────────────────────────────────────────────────────────
      sectionId:       sectionId || null,
      snapshotUrl:     snapshotUrl || null,
      metadata: {
        confidence:       normEvent.confidence,
        faceCount:        eventData.faceCount     || null,
        misbehaviorCount: misbehaviorCount        || 0,
      },

      synced: true,
    };

    try {
      // [P1] Ensure the parent proctoringLogs document exists BEFORE writing any
      // event to the subcollection.  Firestore rules on events may require the
      // parent to exist; writing the event first created a race where the very
      // first event could fail if the rule evaluated before the parent was created.
      //
      // setDoc with merge:true is idempotent — safe to call on every event.
      // Field names MUST match Firestore rules: userId (not uid), and attemptId
      // is required for the structural ownership check (attemptId.matches('.*_'+uid)).
      const parentRef = doc(db, 'proctoringLogs', attemptId);
      await setDoc(parentRef, {
        userId:       uid,        // rules check userId field
        attemptId,               // required for ownership validation
        assessmentId,
        tenantId:     tenantId ?? '',
        createdAt:    serverTimestamp(),
      }, { merge: true });

      // v2: proctoringLogs/{attemptId}/events/{eventId}
      const v2Ref  = collection(db, 'proctoringLogs', attemptId, 'events');
      const docRef = await addDoc(v2Ref, logData);

      console.log('[ProctorService] Event logged (v2):', attemptId, docRef.id, `seq=${seqNum} session=${SESSION_ID}`);
      return docRef.id;

    } catch (error) {
      console.error('[ProctorService] Error logging proctor event:', error);
      // Queue for offline retry with full identity
      appendToOfflineQueue(uid, assessmentId, {
        ...logData,
        eventId,   // stable for idempotent retry
        synced:    false,
        retryCount: 0,
        timestamp:  eventTimestamp,  // client timestamp (serverTimestamp not available offline)
      });
      return null;
    }
  }

  /**
   * Flush queued offline proctoring events to Firestore.
   * Events are uploaded idempotently using their stored eventId.
   *
   * [P1] ASSESSMENT MODE RETENTION: When isAssessmentActive=true, events that
   * fail to upload are NEVER permanently dropped — they are retained in the queue
   * indefinitely until the assessment concludes and connectivity is restored.
   * After the assessment ends (isAssessmentActive=false), events that fail after
   * MAX_RETRY_COUNT attempts are discarded.
   *
   * @param {string}  uid               — Firebase Auth UID
   * @param {string}  assessmentId
   * @param {boolean} [isAssessmentActive=false] — Set true during an active assessment
   * @returns {Promise<{ uploaded: number, failed: number, retained: number }>}
   */
  static async flushOfflineEvents(uid, assessmentId, isAssessmentActive = false) {
    if (!uid || !assessmentId) return { uploaded: 0, failed: 0, retained: 0 };

    const queue = readOfflineQueue(uid, assessmentId);
    if (queue.length === 0) return { uploaded: 0, failed: 0, retained: 0 };

    const attemptId = `${assessmentId}_${uid}`;

    // [P1] Write the parent log document before flushing any events.
    // This mirrors the online path and ensures Firestore parent-existence
    // rules are satisfied even when we are recovering from an offline episode.
    try {
      const parentRef = doc(db, 'proctoringLogs', attemptId);
      await setDoc(parentRef, {
        userId: uid,
        attemptId,
        assessmentId,
      }, { merge: true });
    } catch (parentErr) {
      // If the parent write fails we cannot safely flush events — abort this
      // attempt and leave the queue intact for the next flush cycle.
      console.warn('[ProctorService] Offline flush aborted — parent write failed:', parentErr?.code);
      return { uploaded: 0, failed: 0, retained: queue.length };
    }

    const remaining = [];
    let uploaded    = 0;
    let failed      = 0;
    let retained    = 0;

    for (const event of queue) {
      if (event.synced) continue; // Already uploaded in a previous run

      try {
        // Use setDoc with stable eventId for idempotent write
        const eventRef = doc(db, 'proctoringLogs', attemptId, 'events', event.eventId);
        await setDoc(eventRef, {
          ...event,
          timestamp: serverTimestamp(), // Use server timestamp on upload
          synced:    true,
        }, { merge: false }); // Overwrite — idempotent by eventId

        uploaded++;
        console.log('[ProctorService] Offline event flushed:', event.eventId);

      } catch (err) {
        console.warn('[ProctorService] Offline flush failed for event:', event.eventId, err?.code);
        event.retryCount = (event.retryCount || 0) + 1;

        if (isAssessmentActive) {
          // [P1] Assessment is still active — NEVER drop evidence events.
          // Retain all failed events in the queue regardless of retry count.
          remaining.push(event);
          retained++;
          if (event.retryCount >= MAX_RETRY_COUNT) {
            console.warn(
              `[ProctorService] Event ${event.eventId} has exceeded normal retry limit ` +
              `(retries=${event.retryCount}) but assessment is active — retaining indefinitely.`
            );
          }
        } else {
          // Post-assessment: apply normal discard policy after MAX_RETRY_COUNT.
          if (event.retryCount < MAX_RETRY_COUNT) {
            remaining.push(event);
          } else {
            console.error('[ProctorService] Event dropped after max retries (post-assessment):', event.eventId);
            failed++;
          }
        }
      }
    }

    writeOfflineQueue(uid, assessmentId, remaining);
    console.log(
      `[ProctorService] Offline flush complete — uploaded: ${uploaded}, ` +
      `failed: ${failed}, retained: ${retained}, queued: ${remaining.length}`
    );
    return { uploaded, failed, retained };
  }

  /**
   * Clear all offline proctor queues for a specific user.
   * Call on logout to prevent previous student's data appearing for next login.
   *
   * @param {string} uid
   */
  static clearUserQueues(uid) {
    if (!uid) return;
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${OFFLINE_QUEUE_PREFIX}${uid}_`)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
      sequenceCounters.forEach((_, key) => {
        if (key.startsWith(uid)) sequenceCounters.delete(key);
      });
      console.log(`[ProctorService] Cleared ${keysToRemove.length} offline queue(s) for uid:`, uid);
    } catch (_) {}
  }

  /**
   * Remove offline snapshots older than SNAPSHOT_MAX_AGE_MS from IndexedDB.
   * Call after assessment submission or on next-session startup.
   *
   * [P2] Prevents unbounded IndexedDB accumulation from long offline sessions.
   *
   * @param {string} uid
   * @param {string} assessmentId
   */
  static async clearExpiredSnapshots(uid, assessmentId) {
    if (!uid || !assessmentId) return;
    try {
      const snapshots = await getProctorSnapshots(uid, assessmentId);
      const cutoff    = Date.now() - SNAPSHOT_MAX_AGE_MS;
      let cleared     = 0;
      for (const snapshot of snapshots) {
        const ts = snapshot.timestamp || 0; // safeStorage stores a ms timestamp if available
        if (ts > 0 && ts < cutoff) {
          await removeProctorSnapshot(snapshot.key);
          cleared++;
        }
      }
      if (cleared > 0) {
        console.log(`[ProctorService] Cleared ${cleared} expired offline snapshot(s) for uid=${uid}`);
      }
    } catch (err) {
      console.warn('[ProctorService] clearExpiredSnapshots error:', err);
    }
  }

  // ── Private: offline snapshot queue (IndexedDB — v2) ─────────────────────────────────
  // Blobs are stored natively — no Base64 encoding, no FileReader,
  // no localStorage quota risk, no main-thread blocking.

  static async _saveOfflineSnapshot(uid, assessmentId, imageBlob, filename) {
    try {
      // [P2] Check existing snapshot count before storing.
      const existing = await getProctorSnapshots(uid, assessmentId);
      if (existing.length >= MAX_OFFLINE_SNAPSHOTS) {
        console.warn(
          `[ProctorService] Offline snapshot cap (${MAX_OFFLINE_SNAPSHOTS}) reached for ` +
          `uid=${uid} assessmentId=${assessmentId}. Snapshot NOT saved: ${filename}. ` +
          'Restore connectivity to flush pending snapshots.'
        );
        return;
      }

      const key = await saveProctorSnapshot(uid, assessmentId, imageBlob, filename);
      if (key) {
        console.log('[ProctorService] Offline snapshot persisted to IndexedDB:', key);
      } else {
        console.warn('[ProctorService] IndexedDB unavailable — offline snapshot may be lost.');
      }
    } catch (error) {
      console.error('[ProctorService] Error saving offline snapshot to IndexedDB:', error);
    }
  }

  /**
   * Retry uploading offline snapshots stored in IndexedDB.
   * Called when connectivity is restored.
   * After a successful flush, clears expired snapshots automatically.
   *
   * @param {string} uid
   * @param {string} assessmentId
   */
  static async retryOfflineSnapshots(uid, assessmentId) {
    if (!uid || !assessmentId) return;

    const snapshots = await getProctorSnapshots(uid, assessmentId);
    if (!snapshots.length) return;

    for (const snapshot of snapshots) {
      // Belt-and-braces: skip entries belonging to a different uid
      if (snapshot.uid !== uid) {
        console.warn('[ProctorService] Snapshot uid mismatch — skipping.');
        continue;
      }
      try {
        // snapshot.blob is a native Blob — pass directly to uploadSnapshot()
        const url = await this.uploadSnapshot(uid, assessmentId, snapshot.blob, snapshot.filename);
        if (url) {
          // Successfully uploaded — remove from IndexedDB
          await removeProctorSnapshot(snapshot.key);
          console.log('[ProctorService] Offline snapshot synced and removed:', snapshot.key);
        } else {
          console.warn('[ProctorService] Snapshot upload returned no URL — will retry later:', snapshot.key);
        }
      } catch (error) {
        console.warn('[ProctorService] Snapshot upload error — will retry on next sync:', snapshot.key, error);
      }
    }

    // [P2] Always clean up expired snapshots after a retry pass.
    await this.clearExpiredSnapshots(uid, assessmentId);
  }
}

export default ProctorService;
