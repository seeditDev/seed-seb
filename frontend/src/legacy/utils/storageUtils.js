import { normalizeUser } from '../models/canonicalModels';

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
  const data = getStorageJson('auth_data', null);
  if (!data) return normalizeUser({});
  const resolvedUid = data?.uid || data?.UID || data?.userId || (typeof window !== 'undefined' && window.firebaseUser?.uid) || '';
  if (resolvedUid && !data.uid) {
    data.uid = resolvedUid;
  }
  return normalizeUser(data);
};

export const setAuthData = (data) => {
  const normalized = normalizeUser(data);
  setStorageJson('auth_data', normalized);
  return normalized;
};

