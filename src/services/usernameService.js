/**
 * usernameService.js — SEED-IT Student Username System (SEED-SEB Edition)
 *
 * Implements username generation, uniqueness checking, and reservation:
 * 1. Base username: sanitized lowercase alphanumeric from student name (e.g., 'ashok_kumar')
 * 2. Collision fallback: appends '_rollno' (e.g., 'ashok_kumar_21cs045')
 * 3. Secondary fallback: appends numeric increment (e.g., 'ashok_kumar_1', 'ashok_kumar_21cs045_1')
 */

import { db } from '../lib/firebase-config';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Normalizes any string to a URL-safe lowercase slug with underscores.
 */
export function sanitizeUsernameComponent(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Checks if a specific username is available in Firestore.
 */
export async function isUsernameAvailable(username, excludeUid = null) {
  if (!username || typeof username !== 'string') return false;
  const cleanHandle = sanitizeUsernameComponent(username);
  if (!cleanHandle || cleanHandle.length < 2) return false;

  try {
    const snap = await getDoc(doc(db, 'usernames', cleanHandle));
    if (!snap.exists()) return true;
    const data = snap.data();
    if (excludeUid && data?.uid === excludeUid) return true;
    return false;
  } catch (err) {
    console.warn('[usernameService] isUsernameAvailable check failed:', err);
    return false;
  }
}

/**
 * Finds the next available unique username for a student using the naming strategy:
 * Step 1: sanitized name
 * Step 2: sanitized name + '_' + sanitized rollNumber
 * Step 3: sanitized name + '_' + counter
 */
export async function findAvailableUsername(name, rollNumber = '', currentUid = null) {
  const baseName = sanitizeUsernameComponent(name) || 'student';
  const roll = sanitizeUsernameComponent(rollNumber);

  // 1. Try base name (e.g., 'ashok_kumar')
  const baseAvailable = await isUsernameAvailable(baseName, currentUid);
  if (baseAvailable) {
    return baseName;
  }

  // 2. Collision fallback: append roll number (e.g., 'ashok_kumar_21cs045')
  if (roll) {
    const candidateWithRoll = `${baseName}_${roll}`;
    const rollAvailable = await isUsernameAvailable(candidateWithRoll, currentUid);
    if (rollAvailable) {
      return candidateWithRoll;
    }

    for (let i = 1; i <= 20; i++) {
      const candidateNumberedRoll = `${candidateWithRoll}_${i}`;
      const isFree = await isUsernameAvailable(candidateNumberedRoll, currentUid);
      if (isFree) return candidateNumberedRoll;
    }
  }

  // 3. Numbered base candidate (e.g., 'ashok_kumar_1', 'ashok_kumar_2')
  for (let i = 1; i <= 50; i++) {
    const candidateNumbered = `${baseName}_${i}`;
    const isFree = await isUsernameAvailable(candidateNumbered, currentUid);
    if (isFree) return candidateNumbered;
  }

  return `${baseName}_${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Reserves a username in 'usernames' collection and updates 'users/{uid}'.
 */
export async function claimUsername(uid, username, userProfile = {}) {
  if (!uid || !username) throw new Error('Missing uid or username');
  const cleanUsername = sanitizeUsernameComponent(username);

  await setDoc(doc(db, 'usernames', cleanUsername), {
    uid,
    username: cleanUsername,
    name: userProfile.name || '',
    college: userProfile.college || '',
    department: userProfile.department || '',
    claimedAt: serverTimestamp(),
  });

  try {
    await updateDoc(doc(db, 'users', uid), {
      username: cleanUsername,
      updatedAt: serverTimestamp(),
    });
  } catch (userDocErr) {
    await setDoc(doc(db, 'users', uid), { username: cleanUsername }, { merge: true });
  }

  return cleanUsername;
}

/**
 * Just-in-time check: ensures the signed-in user has a valid username assigned.
 */
export async function ensureUserHasUsername(user) {
  if (!user || !user.uid) return null;

  if (user.username && String(user.username).trim().length > 1) {
    const clean = sanitizeUsernameComponent(user.username);
    try {
      const snap = await getDoc(doc(db, 'usernames', clean));
      if (!snap.exists()) {
        await claimUsername(user.uid, clean, user);
      }
    } catch (_) {}
    return clean;
  }

  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) {
      const remoteData = snap.data();
      if (remoteData.username && String(remoteData.username).trim().length > 1) {
        return sanitizeUsernameComponent(remoteData.username);
      }
    }
  } catch (_) {}

  const candidate = await findAvailableUsername(user.name, user.rollNumber, user.uid);
  const claimed = await claimUsername(user.uid, candidate, user);

  try {
    const rawAuth = localStorage.getItem('auth_data');
    if (rawAuth) {
      const parsed = JSON.parse(rawAuth);
      if (parsed.uid === user.uid) {
        parsed.username = claimed;
        localStorage.setItem('auth_data', JSON.stringify(parsed));
      }
    }
  } catch (_) {}

  return claimed;
}

export default {
  sanitizeUsernameComponent,
  isUsernameAvailable,
  findAvailableUsername,
  claimUsername,
  ensureUserHasUsername,
};
