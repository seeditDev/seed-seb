/**
 * Proctoring Cache Manager
 * Handles local storage caching, auto-expiration, and cleanup of proctoring-related session data.
 *
 * WRITE-THROUGH AUDIT TRAIL:
 *   recordViolation() accepts an optional `uid` parameter.
 *   When uid is provided, violations are written to Firestore (fire-and-forget):
 *     proctoringLogs/{uid}_{assessmentId}/events/{auto_id}   — individual event
 *     proctoringLogs/{uid}_{assessmentId}/summary            — running counts
 *   localStorage cache is retained for in-session performance (read path unchanged).
 */

/**
 * Write a single violation event to Firestore.
 * Fire-and-forget — never blocks the caller.
 *
 * @param {string} uid          — Firebase Auth UID (canonical identity)
 * @param {string} assessmentId — Assessment ID
 * @param {object} violation    — Violation event object
 */
export function writeViolationToFirestore(uid, assessmentId, violation) {
  if (!uid || !assessmentId) return;
  // Dynamic import keeps Firestore out of the synchronous critical path
  Promise.all([
    import('firebase/firestore'),
    import('../firebase-config'),
  ]).then(([{ addDoc, setDoc, doc, collection, serverTimestamp, increment }, { db }]) => {
    const logId = `${uid}_${assessmentId}`;
    const eventsRef = collection(db, 'proctoringLogs', logId, 'events');
    const summaryRef = doc(db, 'proctoringLogs', logId, 'summary');

    // Write event
    addDoc(eventsRef, {
      ...violation,
      uid,
      assessmentId,
      recordedAt: serverTimestamp(),
    }).catch(() => {}); // non-fatal

    // Update summary counts
    setDoc(summaryRef, {
      uid,
      assessmentId,
      totalViolations: increment(1),
      [`${violation.type || 'unknown'}Count`]: increment(1),
      lastViolationAt: serverTimestamp(),
      lastViolationType: violation.type || 'unknown',
    }, { merge: true }).catch(() => {}); // non-fatal
  }).catch(() => {}); // import failed — non-fatal
}


export const getProctorCacheKeys = (testID) => {
  const suffix = testID ? `_${testID}` : '';
  return {
    PHOTO: `proctor_reference_photo${suffix}`,
    DESCRIPTOR: `proctor_reference_descriptor${suffix}`,
    EXPIRY: `proctor_cache_expiry${suffix}`,
    ACTIVE_TEST: `proctor_active_test_id${suffix}`
  };
};

/**
 * Sets the expiration timestamp for the proctoring session based on assessment duration
 * @param {number} durationMinutes - Assessment duration in minutes
 * @param {string} testID - The unique ID of the active assessment
 */
export const setProctorCacheExpiry = (durationMinutes, testID) => {
  if (!durationMinutes || isNaN(durationMinutes)) durationMinutes = 60;
  
  const expiryTime = Date.now() + (durationMinutes + 15) * 60 * 1000;
  console.log(`[ProctorCache] Setting session expiry to: ${new Date(expiryTime).toLocaleTimeString()} for test: ${testID}`);
  
  const keys = getProctorCacheKeys(testID);
  localStorage.setItem(keys.EXPIRY, expiryTime.toString());
  if (testID) {
    localStorage.setItem(keys.ACTIVE_TEST, testID.toString());
  }
};

/**
 * Wipes all proctoring session data from local storage
 * @param {string} [testID] - Optional test ID to wipe. If omitted, wipes all proctoring cache.
 */
export const clearAllProctorCache = (testID) => {
  console.log(`[ProctorCache] Wiping proctoring localStorage items for testID: ${testID || 'all'}`);
  
  if (!testID) {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith('proctor_reference_') || 
        key.startsWith('proctor_cache_') || 
        key.startsWith('proctor_active_') || 
        key.startsWith('proctor_violations_') || 
        key.startsWith('proctor_events_')
      )) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    return;
  }

  const keys = getProctorCacheKeys(testID);
  localStorage.removeItem(keys.PHOTO);
  localStorage.removeItem(keys.DESCRIPTOR);
  localStorage.removeItem(keys.EXPIRY);
  localStorage.removeItem(keys.ACTIVE_TEST);
  
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (
      key.startsWith('proctor_violations_') || 
      key.startsWith('proctor_events_') ||
      key.includes(`_${testID}`)
    )) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
};

/**
 * Checks if the cached proctoring session has expired.
 * If expired, it automatically wipes all proctoring local storage entries.
 */
export const checkAndClearProctorCache = (testID) => {
  const keys = getProctorCacheKeys(testID);
  const expiry = localStorage.getItem(keys.EXPIRY);
  if (!expiry) return;

  const expiryTime = parseInt(expiry, 10);
  if (isNaN(expiryTime) || Date.now() > expiryTime) {
    console.log('[ProctorCache] Proctoring cache has expired. Performing automatic cleanup...');
    clearAllProctorCache(testID);
  }
};

/**
 * Record a proctoring violation event to local cache.
 * Optionally writes to Firestore audit trail when uid is provided.
 *
 * @param {string} testID      — Assessment / test ID
 * @param {string} email       — Student email (localStorage key)
 * @param {string} type        — Violation type (e.g. 'no_face', 'multiple_faces')
 * @param {object} [details]   — Additional event metadata
 * @param {string} [uid]       — Firebase Auth UID. When provided, writes to Firestore audit log.
 */
export const recordViolation = (testID, email, type, details = {}, uid = null) => {
  if (!testID || !email) return { count: 0, violations: [] };

  const cleanEmail = String(email).toLowerCase();
  const cleanTestID = String(testID);
  const countKey = `proctor_violations_${cleanEmail}_${cleanTestID}`;
  const logKey = `proctor_events_${cleanEmail}_${cleanTestID}`;

  let violations = [];
  try {
    violations = JSON.parse(localStorage.getItem(logKey) || '[]');
  } catch (_) {
    violations = [];
  }

  const newEntry = {
    type: type || 'malpractice',
    timestamp: new Date().toISOString(),
    time: new Date().toLocaleTimeString(),
    ...details
  };

  violations.push(newEntry);
  const count = violations.length;

  try {
    localStorage.setItem(logKey, JSON.stringify(violations));
    localStorage.setItem(countKey, count.toString());
  } catch (_) {}

  // ── Firestore write-through audit trail (fire-and-forget) ─────────────────
  if (uid) {
    writeViolationToFirestore(uid, cleanTestID, newEntry);
  }

  return { count, violations };
};

/**
 * Get all recorded violations for an assessment session
 */
export const getViolations = (testID, email) => {
  if (!testID || !email) return { violationCount: 0, violations: [] };

  const cleanEmail = String(email).toLowerCase();
  const cleanTestID = String(testID);
  const countKey = `proctor_violations_${cleanEmail}_${cleanTestID}`;
  const logKey = `proctor_events_${cleanEmail}_${cleanTestID}`;

  let violations = [];
  try {
    violations = JSON.parse(localStorage.getItem(logKey) || '[]');
  } catch (_) {
    violations = [];
  }

  let count = violations.length;
  try {
    const savedCount = parseInt(localStorage.getItem(countKey) || '0', 10);
    if (!isNaN(savedCount) && savedCount > count) {
      count = savedCount;
    }
  } catch (_) {}

  return { violationCount: count, violations };
};
