/**
 * codingProgressService.js
 *
 * Local Storage First service for tracking student practice progress,
 * with sync hooks to Firebase Firestore for cross-device persistence.
 *
 * Local storage format:
 *   Key: `practice_progress_{uid}` -> {
 *     solvedProblems: string[],
 *     problemDetails: {
 *       [questionId]: {
 *         status: 'SOLVED' | 'ATTEMPTED',
 *         language: string,
 *         attempts: number,
 *         bestScore: number,
 *         lastSolvedAt: string
 *       }
 *     }
 *   }
 */

import { db } from '../firebase-config';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const COLLECTION = 'codingProgress';

// Helper: Get local progress structure
const getLocalProgress = (uid) => {
  if (!uid) return { solvedProblems: [], problemDetails: {}, activity: {}, sheetSolvedDicts: {} };
  try {
    const raw = localStorage.getItem(`practice_progress_${uid}`);
    if (!raw) return { solvedProblems: [], problemDetails: {}, activity: {}, sheetSolvedDicts: {} };
    const parsed = JSON.parse(raw);
    return {
      solvedProblems: Array.isArray(parsed.solvedProblems) ? parsed.solvedProblems : [],
      problemDetails: parsed.problemDetails || {},
      activity: parsed.activity || {},
      sheetSolvedDicts: parsed.sheetSolvedDicts || {}
    };
  } catch (_) {
    return { solvedProblems: [], problemDetails: {}, activity: {}, sheetSolvedDicts: {} };
  }
};

// Helper: Save local progress structure
const saveLocalProgress = (uid, progress) => {
  if (!uid) return;
  localStorage.setItem(`practice_progress_${uid}`, JSON.stringify(progress));
};

// ── Read Operations ────────────────────────────────────────────────────────────

/**
 * Get solved question IDs from Local Storage.
 */
export const getSolvedQuestionIds = async (uid) => {
  const local = getLocalProgress(uid);
  return local.solvedProblems;
};

/**
 * Get full progress from Local Storage.
 */
export const getFullProgress = async (uid) => {
  return getLocalProgress(uid);
};

/**
 * Get question-specific progress from Local Storage.
 */
export const getQuestionProgress = async (uid, questionId) => {
  const local = getLocalProgress(uid);
  return local.problemDetails[questionId] || null;
};

// ── Write Operations ───────────────────────────────────────────────────────────

/**
 * Mark a question as solved locally.
 */
export const markQuestionSolved = async (uid, questionId, language, score, attempts = 1) => {
  if (!uid || !questionId) return { success: false };
  
  const local = getLocalProgress(uid);
  const existing = local.problemDetails[questionId];
  const now = new Date().toISOString();

  const detail = {
    status: 'SOLVED',
    language,
    attempts: (existing?.attempts || 0) + attempts,
    bestScore: Math.max(score, existing?.bestScore || 0),
    lastSolvedAt: now,
  };

  local.problemDetails[questionId] = detail;
  
  // Track activity solved count
  if (!local.solvedProblems.includes(questionId)) {
    local.solvedProblems.push(questionId);
    
    if (!local.activity) local.activity = {};
    const today = new Date().toISOString().split('T')[0];
    if (!local.activity[today]) {
      local.activity[today] = { hours: 0, problemsSolved: 0 };
    }
    local.activity[today].problemsSolved += 1;
  }

  saveLocalProgress(uid, local);
  console.log(`[CodingProgressService] ${questionId} marked as SOLVED in Local Storage`);

  // Fire-and-forget auto sync if online
  if (navigator.onLine) {
    try {
      const docRef = doc(db, COLLECTION, uid);
      await setDoc(docRef, local, { merge: true });
    } catch (e) {
      console.warn('[CodingProgressService] Background sync failed (will be synced later):', e.message);
    }
  }

  return { success: true };
};

/**
 * Mark a question as attempted locally.
 */
export const markQuestionAttempted = async (uid, questionId, language, score) => {
  if (!uid || !questionId) return { success: false };
  
  const local = getLocalProgress(uid);
  const existing = local.problemDetails[questionId];
  const now = new Date().toISOString();

  const detail = {
    status: existing?.status === 'SOLVED' ? 'SOLVED' : 'ATTEMPTED',
    language,
    attempts: (existing?.attempts || 0) + 1,
    bestScore: Math.max(score, existing?.bestScore || 0),
    lastSolvedAt: now,
  };

  local.problemDetails[questionId] = detail;
  saveLocalProgress(uid, local);

  // Fire-and-forget auto sync if online
  if (navigator.onLine) {
    try {
      const docRef = doc(db, COLLECTION, uid);
      await setDoc(docRef, local, { merge: true });
    } catch (e) {
      console.warn('[CodingProgressService] Background sync failed:', e.message);
    }
  }

  return { success: true };
};

// ── Sync Operations ────────────────────────────────────────────────────────────

/**
 * Synchronize Local Storage progress with Firebase Firestore.
 * Merges both copies taking the best results.
 * @param {string} uid - Student Email or UID
 */
export const syncProgressWithFirebase = async (uid) => {
  if (!uid) return { success: false, error: 'No user ID' };
  if (!navigator.onLine) return { success: false, error: 'Device is offline' };

  try {
    const docRef = doc(db, COLLECTION, uid);
    const docSnap = await getDoc(docRef);
    
    const local = getLocalProgress(uid);
    const remote = docSnap.exists() ? docSnap.data() : { solvedProblems: [], problemDetails: {} };

    // Merge solvedProblems array
    const mergedSolved = [...new Set([...(local.solvedProblems || []), ...(remote.solvedProblems || [])])];

    // Merge problemDetails
    const mergedDetails = { ...(remote.problemDetails || {}), ...(local.problemDetails || {}) };
    
    // Resolve conflicts by taking the best score and total attempts
    const allKeys = new Set([...Object.keys(local.problemDetails), ...Object.keys(remote.problemDetails || {})]);
    for (const key of allKeys) {
      const lDet = local.problemDetails[key];
      const rDet = remote.problemDetails?.[key];

      if (lDet && rDet) {
        mergedDetails[key] = {
          status: (lDet.status === 'SOLVED' || rDet.status === 'SOLVED') ? 'SOLVED' : 'ATTEMPTED',
          language: lDet.bestScore >= rDet.bestScore ? lDet.language : rDet.language,
          attempts: Math.max(lDet.attempts || 1, rDet.attempts || 1),
          bestScore: Math.max(lDet.bestScore || 0, rDet.bestScore || 0),
          lastSolvedAt: new Date(lDet.lastSolvedAt) > new Date(rDet.lastSolvedAt) ? lDet.lastSolvedAt : rDet.lastSolvedAt
        };
      }
    }

    // Merge activity maps
    const localActivity = local.activity || {};
    const remoteActivity = remote.activity || {};
    const mergedActivity = { ...remoteActivity, ...localActivity };
    const activityDates = new Set([...Object.keys(localActivity), ...Object.keys(remoteActivity)]);
    for (const date of activityDates) {
      const lAct = localActivity[date] || { hours: 0, problemsSolved: 0 };
      const rAct = remoteActivity[date] || { hours: 0, problemsSolved: 0 };
      mergedActivity[date] = {
        hours: Math.max(lAct.hours || 0, rAct.hours || 0),
        problemsSolved: Math.max(lAct.problemsSolved || 0, rAct.problemsSolved || 0)
      };
    }

    // Merge sheetSolvedDicts
    const localSheets = local.sheetSolvedDicts || {};
    const remoteSheets = remote.sheetSolvedDicts || {};
    const mergedSheets = { ...remoteSheets, ...localSheets };
    const allSheetKeys = new Set([...Object.keys(localSheets), ...Object.keys(remoteSheets)]);
    for (const sheetId of allSheetKeys) {
      mergedSheets[sheetId] = { ...(remoteSheets[sheetId] || {}), ...(localSheets[sheetId] || {}) };
    }

    const mergedProgress = {
      solvedProblems: mergedSolved,
      problemDetails: mergedDetails,
      activity: mergedActivity,
      sheetSolvedDicts: mergedSheets,
      updatedAt: new Date().toISOString()
    };

    // Save to both locations
    saveLocalProgress(uid, mergedProgress);
    await setDoc(docRef, mergedProgress, { merge: true });

    console.log('[CodingProgressService] Sync completed successfully');
    return { success: true, progress: mergedProgress };
  } catch (error) {
    console.error('[CodingProgressService] Sync failed:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get question status for UI display.
 */
export const getQuestionDisplayStatus = (questionId, solvedIds = [], problemDetails = {}, isPremium = false, userIsPremium = false) => {
  if (questionId && String(questionId).startsWith('Q0.')) {
    isPremium = false;
  }
  if (isPremium && !userIsPremium) return 'LOCKED';
  if (solvedIds.includes(questionId)) return 'SOLVED';
  const detail = problemDetails[questionId];
  if (detail?.status === 'ATTEMPTED') return 'ATTEMPTED';
  return 'UNSOLVED';
};

/**
 * Log portal usage time (in minutes) for today.
 */
export const logPortalActivityTime = async (uid, minutes = 1) => {
  if (!uid) return { success: false };
  
  const local = getLocalProgress(uid);
  if (!local.activity) {
    local.activity = {};
  }
  
  const today = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
  if (!local.activity[today]) {
    local.activity[today] = {
      hours: 0,
      problemsSolved: 0
    };
  }
  
  local.activity[today].hours = (local.activity[today].hours || 0) + (minutes / 60);
  
  saveLocalProgress(uid, local);
  
  // Fire-and-forget sync
  if (navigator.onLine) {
    try {
      const docRef = doc(db, COLLECTION, uid);
      await setDoc(docRef, local, { merge: true });
    } catch (e) {
      console.warn('[CodingProgressService] Background sync failed:', e.message);
    }
  }
  return { success: true };
};

/**
 * Mark a sheet problem solved/unsolved and sync.
 */
export const saveSheetProgress = async (uid, sheetId, problemId, isSolved) => {
  if (!uid || !sheetId || !problemId) return { success: false };
  const local = getLocalProgress(uid);
  if (!local.sheetSolvedDicts) local.sheetSolvedDicts = {};
  if (!local.sheetSolvedDicts[sheetId]) local.sheetSolvedDicts[sheetId] = {};
  
  if (isSolved) {
    local.sheetSolvedDicts[sheetId][problemId] = true;
  } else {
    delete local.sheetSolvedDicts[sheetId][problemId];
  }

  saveLocalProgress(uid, local);

  // Fire-and-forget sync
  if (navigator.onLine) {
    try {
      const docRef = doc(db, COLLECTION, uid);
      await setDoc(docRef, local, { merge: true });
    } catch (e) {
      console.warn('[CodingProgressService] Background sync failed:', e.message);
    }
  }
  return { success: true };
};

export default {
  getSolvedQuestionIds,
  getFullProgress,
  getQuestionProgress,
  markQuestionSolved,
  markQuestionAttempted,
  syncProgressWithFirebase,
  getQuestionDisplayStatus,
  logPortalActivityTime,
  saveSheetProgress,
};
