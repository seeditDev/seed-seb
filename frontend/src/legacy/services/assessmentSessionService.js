/**
 * assessmentSessionService.js
 *
 * Firestore-backed active attempt tracking.
 *
 * Schema:  users/{userId}/contestAttempts/{assessmentId}
 * {
 *   assessmentId,
 *   assessmentName,
 *   type:            'mcq' | 'msa' | 'coding',
 *   slug,
 *   startedAt:       serverTimestamp,
 *   startedAtISO:    string,
 *   completed:       false,
 *   autoSubmitted:   false,
 *   sections: {
 *     [sectionId]: {
 *       status: 'not_started' | 'in_progress' | 'completed',
 *       startedAt: ISO,
 *     }
 *   },
 *   activeSection: { id, idx, startedAt },
 *   // Populated only when section is started (not before):
 *   sectionAnswers: {
 *     [sectionId]: { [qIdx]: selectedOptionIdx }
 *   },
 *   timeRemainingSeconds: number,   // remaining time at last save
 *   lastSavedAt: serverTimestamp,
 * }
 *
 * Design:
 * - We ONLY create the Firestore doc when an assessment starts.
 * - We ONLY write answers for sections that have been started (saves bandwidth).
 * - Progress is saved at 1/3 of the total duration (configurable via SAVE_AT_FRACTION).
 * - On section start: set section status to 'in_progress'.
 * - On section complete: set section status to 'completed'.
 * - On final submit: set completed = true.
 * - Auto-submit (Cloud Function suggestion): a Cloud Function can watch for
 *   completed == false AND lastSavedAt older than 10 minutes to mark autoSubmitted.
 */

import { db } from '../firebase-config';
import {
  doc,
  setDoc,
  serverTimestamp,
  deleteField,
} from 'firebase/firestore';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

/** Fraction of section duration at which we write the first Firestore save. */
const SAVE_AT_FRACTION = 1 / 3;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getUserId(userData) {
  return userData?.uid || userData?.UID || (userData?.Email || '').replace(/[@.]/g, '_');
}

function getSessionRef(userId, assessmentId) {
  return doc(db, 'users', userId, 'contestAttempts', assessmentId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Call when the assessment begins.
 * Creates the Firestore session doc with all sections marked as 'not_started'.
 *
 * @param {object} userData   - auth_data from localStorage
 * @param {object} assessment - { id, name, type, sections: [{sectionId, name, duration_minutes}] }
 * @param {string} slug       - route slug (used for resume navigation)
 */
export async function startAssessmentSession(userData, assessment, slug = '') {
  try {
    const userId = getUserId(userData);
    if (!userId || !assessment?.id) return;

    const sections = {};
    (assessment.sections || []).forEach(sec => {
      sections[sec.sectionId || sec.id || sec.name] = { status: 'not_started' };
    });

    await setDoc(getSessionRef(userId, assessment.id), {
      assessmentId:         assessment.id,
      assessmentName:       assessment.name || '',
      type:                 assessment.type || 'msa',
      slug:                 slug || assessment.id,
      startedAt:            serverTimestamp(),
      startedAtISO:         new Date().toISOString(),
      completed:            false,
      autoSubmitted:        false,
      sections,
      sectionAnswers:       {},
      activeSection:        null,
      timeRemainingSeconds: (assessment.duration_minutes || 60) * 60,
      lastSavedAt:          serverTimestamp(),
    }, { merge: false }); // overwrite — fresh start

    console.log('[SessionService] Session started for assessment', assessment.id);
  } catch (err) {
    console.warn('[SessionService] startAssessmentSession failed (non-fatal):', err?.message);
  }
}

/**
 * Call when a section begins.
 * Marks the section as in_progress and sets activeSection.
 *
 * @param {object} userData
 * @param {string} assessmentId
 * @param {{ sectionId: string, name: string, durationMinutes: number, secIdx: number }} section
 */
export async function markSectionStarted(userData, assessmentId, section) {
  try {
    const userId = getUserId(userData);
    if (!userId || !assessmentId) return;

    const now = new Date().toISOString();
    await setDoc(getSessionRef(userId, assessmentId), {
      [`sections.${section.sectionId}.status`]:    'in_progress',
      [`sections.${section.sectionId}.startedAt`]: now,
      activeSection: {
        id:         section.sectionId,
        name:       section.name || '',
        idx:        section.secIdx,
        startedAt:  now,
        durationMinutes: section.durationMinutes || 30,
      },
      lastSavedAt: serverTimestamp(),
    }, { merge: true });

    console.log('[SessionService] Section started:', section.sectionId);
  } catch (err) {
    console.warn('[SessionService] markSectionStarted failed (non-fatal):', err?.message);
  }
}

/**
 * Save current section answers to Firestore.
 * Only called once per section at the 1/3-time mark.
 *
 * @param {object} userData
 * @param {string} assessmentId
 * @param {string} sectionId
 * @param {object} answers          - { [qIdx]: selectedOptionIdx | null }
 * @param {number} timeRemainingSeconds
 */
export async function saveSessionProgress(userData, assessmentId, sectionId, answers, timeRemainingSeconds) {
  try {
    const userId = getUserId(userData);
    if (!userId || !assessmentId) return;

    await setDoc(getSessionRef(userId, assessmentId), {
      [`sectionAnswers.${sectionId}`]: answers || {},
      timeRemainingSeconds: timeRemainingSeconds || 0,
      lastSavedAt: serverTimestamp(),
    }, { merge: true });

    console.log('[SessionService] Progress saved for section', sectionId, '— remaining:', timeRemainingSeconds, 's');
  } catch (err) {
    console.warn('[SessionService] saveSessionProgress failed (non-fatal):', err?.message);
  }
}

/**
 * Call when a section is submitted (normal or auto-submit).
 *
 * @param {object} userData
 * @param {string} assessmentId
 * @param {string} sectionId
 */
export async function markSectionCompleted(userData, assessmentId, sectionId) {
  try {
    const userId = getUserId(userData);
    if (!userId || !assessmentId) return;

    await setDoc(getSessionRef(userId, assessmentId), {
      [`sections.${sectionId}.status`]:      'completed',
      [`sections.${sectionId}.completedAt`]: new Date().toISOString(),
      [`sectionAnswers.${sectionId}`]:       deleteField(), // free memory — already saved in results
      activeSection:                         null,
      lastSavedAt:                           serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.warn('[SessionService] markSectionCompleted failed (non-fatal):', err?.message);
  }
}

/**
 * Call when the entire assessment is fully submitted.
 * Marks completed = true so checkRemoteActiveAttempt won't surface it as "resumable".
 *
 * @param {object} userData
 * @param {string} assessmentId
 * @param {{ autoSubmitted?: boolean, reason?: string }} [opts]
 */
export async function completeAssessmentSession(userData, assessmentId, opts = {}) {
  try {
    const userId = getUserId(userData);
    if (!userId || !assessmentId) return;

    await setDoc(getSessionRef(userId, assessmentId), {
      completed:     true,
      autoSubmitted: opts.autoSubmitted || false,
      autoReason:    opts.reason || null,
      completedAt:   serverTimestamp(),
      completedAtISO: new Date().toISOString(),
      activeSection: null,
      lastSavedAt:   serverTimestamp(),
    }, { merge: true });

    console.log('[SessionService] Session completed for assessment', assessmentId);
  } catch (err) {
    console.warn('[SessionService] completeAssessmentSession failed (non-fatal):', err?.message);
  }
}

/**
 * Compute the timer (in seconds) at which we should trigger the 1/3-mark save.
 *
 * @param {number} totalDurationSeconds   total section time in seconds
 * @returns {number}  seconds remaining at which saveSessionProgress should be called
 */
export function oneThirdSaveThreshold(totalDurationSeconds) {
  // Save when 2/3 of time has elapsed (1/3 remaining)
  return Math.round(totalDurationSeconds * (1 - SAVE_AT_FRACTION));
}

export default {
  startAssessmentSession,
  markSectionStarted,
  saveSessionProgress,
  markSectionCompleted,
  completeAssessmentSession,
  oneThirdSaveThreshold,
};
