/**
 * activityLoggerService.js
 * 
 * Comprehensive logging service to record all student activities:
 * - Page views / Tab switches
 * - Problem attempts & solutions
 * - Assessment starts & submissions
 * - Time spent tracking
 * - Daily goal completions & streak approvals
 *
 * Saves to Firestore collection: userActivities/{uid}/logs/{logId}
 * and caches locally to disk: user_profile/{uid}/activity_logs.json
 */

import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase-config';
import desktopBridge from '../utils/desktopBridge';

// Resolve effective user ID
const resolveEffectiveUid = (uid) => {
  if (auth?.currentUser?.uid) return auth.currentUser.uid;
  if (uid && typeof uid === 'string' && uid.trim() !== '') return uid.trim();
  try {
    const authData = JSON.parse(localStorage.getItem('auth_data') ?? '{}');
    if (authData.uid) return authData.uid;
  } catch (_) {}
  return null;
};

// Events that should NEVER trigger a network Firestore write
const LOCAL_ONLY_ACTIVITY_TYPES = new Set([
  'PAGE_VIEW',
  'TAB_CHANGE',
  'TIME_SPENT',
  'QUESTION_ATTEMPT',
  'QUESTION_SOLVED',
  'GOAL_TOGGLED',
  'STREAK_APPROVED'
]);

/**
 * Log a single activity event.
 * @param {string} uid User ID
 * @param {string} type Activity event type (e.g. 'PAGE_VIEW', 'QUESTION_SOLVED', 'TIME_SPENT', 'GOAL_COMPLETED')
 * @param {object} details Additional metadata for the event
 */
export const logUserActivity = async (uid, type, details = {}) => {
  const effectiveUid = resolveEffectiveUid(uid);
  if (!effectiveUid) return;
  const now = new Date();
  const timestamp = now.toISOString();
  const dateStr = timestamp.split('T')[0];
  const logId = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const activityRecord = {
    id: logId,
    uid: effectiveUid,
    type,
    timestamp,
    date: dateStr,
    details: details || {},
    platform: 'SEED SEB Platform'
  };

  // 1. LocalStorage Cache (Keep last 50 activities)
  try {
    const cacheKey = `user_activities_${effectiveUid}`;
    const existing = JSON.parse(localStorage.getItem(cacheKey) || '[]');
    existing.unshift(activityRecord);
    if (existing.length > 50) existing.length = 50;
    localStorage.setItem(cacheKey, JSON.stringify(existing));
  } catch (_) {}

  // 2. Desktop Profile Disk Cache
  if (effectiveUid) {
    try {
      const diskActivities = (await desktopBridge.loadUserProfileCache(effectiveUid, 'activity_logs')) || [];
      if (Array.isArray(diskActivities)) {
        diskActivities.unshift(activityRecord);
        if (diskActivities.length > 300) diskActivities.length = 300;
        desktopBridge.saveUserProfileCache(effectiveUid, 'activity_logs', diskActivities);
      }
    } catch (_) {}
  }

  // 3. Firestore Sync (Guard: Never write high-frequency events or unrequested logs to Firestore)
  // Subcollection userActivities/{uid}/logs/{logId} is omitted to prevent runaway writes.
  const shouldPersistFirestore = details?.persistToFirestore === true && !LOCAL_ONLY_ACTIVITY_TYPES.has(type);
  if (shouldPersistFirestore && effectiveUid && db) {
    try {
      const userMetaRef = doc(db, 'userActivities', effectiveUid);
      await setDoc(userMetaRef, {
        uid: effectiveUid,
        lastActive: timestamp,
        lastActivityType: type,
        lastActivityDetails: details || {},
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.warn('[ActivityLogger] Firestore log write error:', err.message);
    }
  }

  return activityRecord;
};

export default {
  logUserActivity
};

