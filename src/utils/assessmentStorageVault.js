/**
 * assessmentStorageVault.js
 *
 * Tiered Local-First Storage & Transactional Write-Ahead Log (WAL)
 * for High-Stakes Assessments in SEED SEB.
 *
 * Storage Tiers:
 * - Tier 1: In-memory & compact localStorage metadata (instant boot & fast read)
 * - Tier 2: IndexedDB State Vault (hundreds of MB capacity, eliminates 5MB quota errors)
 * - Tier 3: Native PyQt DPAPI encrypted disk file via desktopBridge.saveAnswer
 *
 * Write-Ahead Log (WAL):
 * - Buffers in-progress cloud sync payloads, partial scores, and proctor events locally.
 * - Auto-drains to Firestore on network restoration or periodically every 30s.
 */

const DB_NAME = 'seed_seb_assessment_vault';
const DB_VERSION = 1;
const SNAPSHOT_STORE = 'assessment_snapshots';
const WAL_STORE = 'write_ahead_log';

let dbPromise = null;

/**
 * Initializes and returns the IndexedDB instance for the assessment vault.
 */
function getVaultDB() {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
            db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'assessmentId' });
          }
          if (!db.objectStoreNames.contains(WAL_STORE)) {
            const walStore = db.createObjectStore(WAL_STORE, { keyPath: 'id' });
            walStore.createIndex('by_status', 'status', { unique: false });
            walStore.createIndex('by_queuedAt', 'queuedAt', { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          console.warn('[AssessmentVault] IndexedDB open error:', req.error);
          resolve(null);
        };
      } catch (err) {
        console.warn('[AssessmentVault] IndexedDB initialization error:', err);
        resolve(null);
      }
    });
  }
  return dbPromise;
}

/**
 * Saves a full assessment session snapshot to IndexedDB and mirrors
 * critical recovery metadata to localStorage for synchronous boot.
 *
 * @param {string} assessmentId
 * @param {Object} snapshot
 */
export async function saveAssessmentSnapshot(assessmentId, snapshot) {
  if (!assessmentId) return;

  const nowMs = Date.now();
  const envelope = {
    assessmentId,
    data: snapshot,
    savedAt: new Date().toISOString(),
    timestamp: nowMs
  };

  // 1. Primary write to high-capacity IndexedDB
  try {
    const db = await getVaultDB();
    if (db) {
      const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
      const store = tx.objectStore(SNAPSHOT_STORE);
      store.put(envelope);
    }
  } catch (idbErr) {
    console.warn('[AssessmentVault] IndexedDB snapshot write warning:', idbErr);
  }

  // 2. Synchronous mirror to localStorage for instant pre-hydration
  try {
    const compactSummary = {
      assessmentId,
      email: snapshot.email || '',
      completedSections: snapshot.completedSections || {},
      currentSecIdx: snapshot.currentSecIdx,
      secStarted: snapshot.secStarted,
      secTimer: snapshot.secTimer,
      sectionEndTimeMs: snapshot.sectionEndTimeMs,
      savedAt: envelope.savedAt,
      lastActiveTimestamp: nowMs,
      vaultBacked: true
    };
    localStorage.setItem(`msaProgress_${assessmentId}`, JSON.stringify(compactSummary));
  } catch (lsErr) {
    console.warn('[AssessmentVault] localStorage compact mirror error (exceeded quota?):', lsErr);
  }
}

/**
 * Loads the latest assessment session snapshot. Checks IndexedDB first
 * for full rich state, falling back to localStorage.
 *
 * @param {string} assessmentId
 * @returns {Promise<Object|null>}
 */
export async function loadAssessmentSnapshot(assessmentId) {
  if (!assessmentId) return null;

  // 1. Try IndexedDB full state
  try {
    const db = await getVaultDB();
    if (db) {
      const result = await new Promise((resolve) => {
        const tx = db.transaction(SNAPSHOT_STORE, 'readonly');
        const store = tx.objectStore(SNAPSHOT_STORE);
        const req = store.get(assessmentId);
        req.onsuccess = () => resolve(req.result ? req.result.data : null);
        req.onerror = () => resolve(null);
      });
      if (result) return result;
    }
  } catch (_) {}

  // 2. Fallback to localStorage
  try {
    const raw = localStorage.getItem(`msaProgress_${assessmentId}`);
    if (raw) return JSON.parse(raw);
  } catch (_) {}

  return null;
}

/**
 * Removes assessment session snapshot from both IndexedDB and localStorage.
 *
 * @param {string} assessmentId
 */
export async function clearAssessmentSnapshot(assessmentId) {
  if (!assessmentId) return;

  try {
    localStorage.removeItem(`msaProgress_${assessmentId}`);
    localStorage.removeItem(`msaActiveAssessment_${assessmentId}`);
  } catch (_) {}

  try {
    const db = await getVaultDB();
    if (db) {
      const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
      const store = tx.objectStore(SNAPSHOT_STORE);
      store.delete(assessmentId);
    }
  } catch (_) {}
}

/**
 * Enqueues a Firestore mutation into the transactional Write-Ahead Log.
 *
 * @param {Object} mutation
 * @param {string} mutation.targetDoc - Firestore document path (e.g. `assessmentResults/...`)
 * @param {Object} mutation.payload - Document payload
 * @param {string} [mutation.type='progress_sync'] - Type tag
 * @returns {Promise<string>} Mutation ID
 */
export async function queueWALMutation({ targetDoc, payload, type = 'progress_sync' }) {
  const id = `wal_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const record = {
    id,
    targetDoc,
    payload,
    type,
    status: 'PENDING',
    attempts: 0,
    queuedAt: new Date().toISOString()
  };

  try {
    const db = await getVaultDB();
    if (db) {
      const tx = db.transaction(WAL_STORE, 'readwrite');
      const store = tx.objectStore(WAL_STORE);
      store.put(record);
    }
  } catch (err) {
    console.warn('[AssessmentVault] Failed to queue WAL mutation:', err);
  }

  return id;
}

/**
 * Drains all pending mutations from the Write-Ahead Log to Firestore.
 *
 * @param {Function} setDocFn - Firestore setDoc function
 * @param {Function} docFn - Firestore doc function
 * @param {Object} firestoreInstance - Firebase Firestore instance
 * @returns {Promise<number>} Number of successfully drained mutations
 */
export async function drainWALQueue(setDocFn, docFn, firestoreInstance) {
  if (!setDocFn || !docFn || !firestoreInstance) return 0;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 0; // Offline, postpone drain
  }

  try {
    const db = await getVaultDB();
    if (!db) return 0;

    const pending = await new Promise((resolve) => {
      const tx = db.transaction(WAL_STORE, 'readonly');
      const store = tx.objectStore(WAL_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    if (pending.length === 0) return 0;

    let drainedCount = 0;
    for (const item of pending) {
      try {
        await setDocFn(docFn(firestoreInstance, item.targetDoc), item.payload, { merge: true });
        
        // Remove completed item from WAL
        const delTx = db.transaction(WAL_STORE, 'readwrite');
        delTx.objectStore(WAL_STORE).delete(item.id);
        drainedCount++;
      } catch (writeErr) {
        // Increment attempts on failure
        try {
          const updateTx = db.transaction(WAL_STORE, 'readwrite');
          const store = updateTx.objectStore(WAL_STORE);
          item.attempts = (item.attempts || 0) + 1;
          item.lastError = writeErr?.message || 'Write failed';
          store.put(item);
        } catch (_) {}
      }
    }

    if (drainedCount > 0) {
      console.log(`[AssessmentVault] Successfully drained ${drainedCount} pending WAL mutations to Firestore.`);
    }
    return drainedCount;
  } catch (err) {
    console.warn('[AssessmentVault] Error draining WAL queue:', err);
    return 0;
  }
}

// Auto-drain listener on window online event
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    // Dispatch an event so components with active Firestore connections can trigger drain
    window.dispatchEvent(new CustomEvent('seed:vault_drain_request'));
  });
}

export default {
  saveAssessmentSnapshot,
  loadAssessmentSnapshot,
  clearAssessmentSnapshot,
  queueWALMutation,
  drainWALQueue
};
