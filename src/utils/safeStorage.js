/**
 * safeStorage.js
 * Resilient client storage with IndexedDB backup to prevent data loss
 * from localStorage QuotaExceededError during offline assessment submissions.
 *
 * v2: Added proctor_snapshots object store for offline webcam images.
 *     Blobs are stored directly in IndexedDB (no Base64 conversion, no
 *     localStorage — avoids the ~5 MB quota limit and main-thread blocking).
 */

const DB_NAME         = 'seed_seb_offline_store';
const STORE_NAME      = 'pending_envelopes';
const SNAPSHOT_STORE  = 'proctor_snapshots';
const DB_VERSION      = 2;

let dbPromise = null;

function getIDB() {
  if (typeof window === 'undefined' || !window.indexedDB) return null;
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
          // v2: binary blob store for offline proctoring snapshots
          if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
            const snapStore = db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'key' });
            // Index by uid+assessmentId prefix for batch retrieval
            snapStore.createIndex('by_assessment', 'assessmentKey', { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          console.warn('[SafeStorage] IndexedDB open error:', req.error);
          resolve(null);
        };
      } catch (err) {
        console.warn('[SafeStorage] IndexedDB initialization error:', err);
        resolve(null);
      }
    });
  }
  return dbPromise;
}

export async function savePendingEnvelope(key, envelope) {
  const payloadStr = typeof envelope === 'string' ? envelope : JSON.stringify(envelope);
  
  // 1. Attempt primary localStorage write
  try {
    localStorage.setItem(key, payloadStr);
    console.log(`[SafeStorage] Envelope saved to localStorage: ${key}`);
  } catch (lsErr) {
    console.warn(`[SafeStorage] localStorage write failed for ${key} (${lsErr?.message}). Falling back to IndexedDB.`);
    // Try clearing old non-critical caches to free space
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('course_progress_cache_') || k.startsWith('firebase:previous_websocket_failure'))) {
          localStorage.removeItem(k);
        }
      }
      localStorage.setItem(key, payloadStr);
      console.log(`[SafeStorage] Envelope saved to localStorage after clearing non-critical cache: ${key}`);
    } catch (_) { /* continue to IndexedDB */ }
  }

  // 2. Mirror into IndexedDB as persistent reliable store
  try {
    const idb = await getIDB();
    if (idb) {
      const tx = idb.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const parsedObj = typeof envelope === 'string' ? JSON.parse(envelope) : envelope;
      store.put({ key, ...parsedObj, savedAtLocal: new Date().toISOString() });
    }
  } catch (idbErr) {
    console.warn('[SafeStorage] IndexedDB mirror write failed:', idbErr);
  }
}

export async function removePendingEnvelope(key) {
  try {
    localStorage.removeItem(key);
  } catch (_) {}

  try {
    const idb = await getIDB();
    if (idb) {
      const tx = idb.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(key);
    }
  } catch (_) {}
}

// ── Proctor snapshot helpers (v2) ────────────────────────────────────────────
// Webcam images are stored as native Blobs in IndexedDB — no Base64 encoding,
// no localStorage quota issues, no main-thread blocking from FileReader.

/**
 * Persist an offline proctoring snapshot blob to IndexedDB.
 *
 * @param {string} uid            - Firebase Auth UID
 * @param {string} assessmentId   - Assessment ID
 * @param {Blob}   blob           - Raw image blob from webcam capture
 * @param {string} filename       - Suggested filename (e.g. "snapshot_1234567890.jpg")
 * @returns {Promise<string|null>} The storage key, or null on failure
 */
export async function saveProctorSnapshot(uid, assessmentId, blob, filename) {
  const key          = `proctor_snap_${uid}_${assessmentId}_${Date.now()}`;
  const assessmentKey = `${uid}_${assessmentId}`;
  try {
    const idb = await getIDB();
    if (!idb) {
      console.warn('[SafeStorage] IndexedDB unavailable — proctor snapshot not saved:', key);
      return null;
    }
    const tx    = idb.transaction(SNAPSHOT_STORE, 'readwrite');
    const store = tx.objectStore(SNAPSHOT_STORE);
    store.put({ key, assessmentKey, uid, assessmentId, blob, filename, savedAt: new Date().toISOString() });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
    console.log(`[SafeStorage] Proctor snapshot saved to IndexedDB: ${key}`);
    return key;
  } catch (err) {
    console.error('[SafeStorage] Failed to save proctor snapshot to IndexedDB:', err);
    return null;
  }
}

/**
 * Retrieve all unsynced proctoring snapshots for a uid + assessmentId pair.
 *
 * @param {string} uid
 * @param {string} assessmentId
 * @returns {Promise<Array<{key:string, blob:Blob, filename:string, savedAt:string}>>}
 */
export async function getProctorSnapshots(uid, assessmentId) {
  const assessmentKey = `${uid}_${assessmentId}`;
  try {
    const idb = await getIDB();
    if (!idb) return [];
    return await new Promise((resolve, reject) => {
      const tx    = idb.transaction(SNAPSHOT_STORE, 'readonly');
      const store = tx.objectStore(SNAPSHOT_STORE);
      const index = store.index('by_assessment');
      const req   = index.getAll(assessmentKey);
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror   = () => reject(req.error);
    });
  } catch (err) {
    console.error('[SafeStorage] Failed to retrieve proctor snapshots:', err);
    return [];
  }
}

/**
 * Remove a single proctoring snapshot by its key after successful upload.
 *
 * @param {string} key
 */
export async function removeProctorSnapshot(key) {
  try {
    const idb = await getIDB();
    if (!idb) return;
    const tx    = idb.transaction(SNAPSHOT_STORE, 'readwrite');
    const store = tx.objectStore(SNAPSHOT_STORE);
    store.delete(key);
  } catch (err) {
    console.warn('[SafeStorage] Failed to delete proctor snapshot:', err);
  }
}

export function readJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
}

export default {
  savePendingEnvelope,
  removePendingEnvelope,
  saveProctorSnapshot,
  getProctorSnapshots,
  removeProctorSnapshot,
  readJSON,
  writeJSON,
};
