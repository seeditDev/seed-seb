/**
 * storageUtils.js
 * Safe LocalStorage helpers with automatic JSON parsing and fallback error handling.
 */

export const getStorageJson = (key, fallback = {}) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[storageUtils] Error parsing storage key "${key}":`, err);
    return fallback;
  }
};

export const setStorageJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`[storageUtils] Error setting storage key "${key}":`, err);
  }
};

export const getAuthData = () => {
  const data = getStorageJson('auth_data', {});
  const resolvedUid = data?.uid || data?.UID || data?.userId || (typeof window !== 'undefined' && window.firebaseUser?.uid) || '';
  if (resolvedUid && !data.uid) {
    data.uid = resolvedUid;
  }
  return data;
};
