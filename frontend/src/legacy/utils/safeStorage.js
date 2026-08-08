/**
 * Defensive localStorage helpers.
 *
 * BUG FIXED: the resume-session scan in StudentDashboard walked localStorage
 * with a bare `JSON.parse` inside `try/catch(_) {}`. One corrupt `msaProgress_*`
 * blob silently aborted resumable-session detection for the whole loop and left
 * the bad entry in place forever.
 */

export function readJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === '') return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[safeStorage] Corrupt JSON at "${key}" — quarantining.`, e?.message);
    try {
      localStorage.setItem(`__corrupt__${key}`, localStorage.getItem(key) || '');
      localStorage.removeItem(key);
    } catch (_) {}
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn(`[safeStorage] write failed for "${key}"`, e?.message);
    return false;
  }
}

/** Snapshot of all keys matching a prefix. Immune to index shifts from removals. */
export function keysWithPrefix(prefix) {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) keys.push(key);
    }
  } catch (e) {
    console.warn('[safeStorage] enumeration failed', e?.message);
  }
  return keys;
}

/** Parse every entry under a prefix, skipping (and quarantining) corrupt ones. */
export function readAllJSONWithPrefix(prefix) {
  return keysWithPrefix(prefix)
    .map((key) => ({ key, value: readJSON(key, undefined) }))
    .filter((entry) => entry.value !== undefined && entry.value !== null);
}

export default readJSON;
