/**
 * assessmentSessionService.js
 *
 * Firestore-backed attempt lifecycle management for SEED SEB.
 *
 * ─── Schema: users/{uid}/contestAttempts/{uid}_{assessmentId} ────────────────
 * {
 *   uid,               // Firebase Auth UID — canonical identity
 *   assessmentId,
 *   assessmentTitle,
 *   type:              'mcq' | 'msa' | 'coding',
 *   slug,
 *   tenantId,
 *   cohortId,
 *   email,             // stored for reporting only; NOT used as identity
 *   status,            // ATTEMPT_STATES value (see attemptStateMachine.js)
 *   startedAt:         serverTimestamp,   // authoritative start
 *   durationSeconds:   number,            // total exam time
 *   //
 *   // NOTE: timeRemainingSeconds is NOT stored here.
 *   //   Remaining time on resume = durationSeconds - elapsed(now - startedAt)
 *   //   Client timer is a display mechanism only.
 *   //
 *   sections:          { [sectionId]: { status, startedAt, completedAt, durationSeconds } },
 *   sectionAnswers:    { [sectionId]: { [qIdx]: selectedOptionIdx } },
 *   activeSection:     { id, idx, startedAt, durationSeconds } | null,
 *   completed:         boolean,
 *   autoSubmitted:     boolean,
 *   autoSubmitReason:  string | null,
 *   lastSavedAt:       serverTimestamp,
 *   scoring_authority: 'client_provisional',  // always set; see limitation notice
 * }
 *
 * ─── Create-Once Rule ────────────────────────────────────────────────────────
 * startAssessmentSession() MUST NOT overwrite an existing active or completed attempt.
 * It reads the existing document first and only creates if:
 *   1. No document exists, OR
 *   2. The existing document is in NOT_STARTED state.
 * Any other existing state causes it to return the existing attempt for resume handling.
 *
 * ─── LIMITATION ──────────────────────────────────────────────────────────────
 * All scoring is client_provisional. This client computes scores locally.
 * A trusted server-side scoring pipeline is not yet implemented.
 * The scoring_authority field clearly marks this in every attempt document.
 */

import { auth, db } from '../lib/firebase-config';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  deleteField,
  runTransaction,
} from 'firebase/firestore';
import {
  ATTEMPT_STATES,
  TERMINAL_STATES,
  RESUMABLE_STATES,
  isValidTransition,
  isTerminal,
  isResumable,
  attemptDocId,
  buildAttemptEnvelope,
  withRetry,
  saveLocalSubmissionEnvelope,
  clearLocalSubmissionEnvelope,
  calcAuthoritativeRemainingSeconds,
} from './attemptStateMachine';

// ─────────────────────────────────────────────────────────────────────────────
// Identity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get current user ID: Firebase Auth UID.
 * MUST be auth.currentUser.uid — never fall back to email or localStorage.
 *
 * @returns {string|null}
 */
function getCurrentUid() {
  const uid = auth?.currentUser?.uid;
  if (!uid) {
    console.error('[SessionService] No Firebase Auth user. Student must be logged in via Firebase Auth before any attempt operation.');
    return null;
  }
  return uid;
}

function getAttemptRef(uid, assessmentId) {
  const docId = attemptDocId(uid, assessmentId);
  return doc(db, 'users', uid, 'contestAttempts', docId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start a new assessment attempt — CREATE ONCE.
 *
 * Returns an object describing the outcome:
 *   { outcome: 'created',  attempt: data }  — new attempt, exam can begin
 *   { outcome: 'resumed',  attempt: data }  — existing resumable attempt found
 *   { outcome: 'blocked',  attempt: data, reason }  — submitted/terminal, cannot proceed
 *   { outcome: 'error',    error }
 *
 * NEVER overwrites an existing active or submitted attempt.
 *
 * @param {object} assessment — { id, name, type, duration_minutes, sections }
 * @param {string} slug       — route slug
 * @returns {Promise<{outcome, attempt?, reason?, error?}>}
 */
export async function startAssessmentSession(assessment, slug = '') {
  const uid = getCurrentUid();
  if (!uid) {
    return { outcome: 'error', error: 'Not authenticated. Please log in before starting an assessment.' };
  }
  if (!assessment?.id) {
    return { outcome: 'error', error: 'Invalid assessment: missing id.' };
  }

  try {
    const ref = getAttemptRef(uid, assessment.id);

    // ── Existence check (create-once) ───────────────────────────────────────
    // Read the attempt first so we can handle existing attempts before
    // entering the transaction.  The transaction below only fires if no
    // attempt exists yet (or it is in NOT_STARTED state).
    const existing = await getDoc(ref);
    if (existing.exists()) {
      const data = existing.data();
      const currentStatus = data.status || (data.completed ? ATTEMPT_STATES.SUBMITTED : ATTEMPT_STATES.IN_PROGRESS);

      if (isTerminal(currentStatus)) {
        console.log(`[SessionService] Attempt for ${assessment.id} is in terminal state: ${currentStatus}. Blocking.`);
        return {
          outcome: 'blocked',
          attempt: data,
          reason: currentStatus === ATTEMPT_STATES.SUBMITTED
            ? 'This assessment has already been submitted.'
            : currentStatus === ATTEMPT_STATES.AUTO_SUBMITTED
              ? 'This assessment was auto-submitted.'
              : `Assessment is in a final state: ${currentStatus}.`,
        };
      }

      if (isResumable(currentStatus)) {
        console.log(`[SessionService] Resumable attempt found for ${assessment.id} (status: ${currentStatus}).`);
        // [Fix Audit-7 P1] Run reconciliation BEFORE returning resumable.
        // If a result was written but completeAssessmentSession() failed on the previous
        // session, the attempt will be in a non-terminal (resumable) state even though the
        // student has already submitted. Reconciling here prevents re-entry into a completed exam.
        const existingTenantId = data.tenantId || '';
        if (existingTenantId) {
          try {
            await reconcileAttemptWithResult(assessment.id, existingTenantId);
            // Re-read: reconciliation may have finalized the attempt.
            const reRead = await getDoc(ref);
            if (reRead.exists()) {
              const reReadData = reRead.data();
              const reReadStatus = reReadData.status;
              if (isTerminal(reReadStatus)) {
                console.log(`[SessionService] Reconciliation finalized attempt for ${assessment.id} (status: ${reReadStatus}). Blocking resume.`);
                return {
                  outcome: 'blocked',
                  attempt: reReadData,
                  reason: 'This assessment was already submitted. Returning to dashboard.',
                };
              }
            }
          } catch (reconcileErr) {
            console.warn('[SessionService] Pre-resume reconciliation failed (non-fatal):', reconcileErr?.message);
          }
        }
        return { outcome: 'resumed', attempt: data };
      }

      // STARTING / SUBMITTING / EXPIRED — do not interfere
      // [Fix Audit-6 P1] Run reconciliation: if a result was written but the attempt
      // was never finalized (completeAssessmentSession failed), heal it now.
      const existingTenantId = data.tenantId || '';
      if (existingTenantId) {
        reconcileAttemptWithResult(assessment.id, existingTenantId).catch(() => {});
      }
      console.log(`[SessionService] Attempt in non-resumable active state: ${currentStatus}. Not creating new attempt.`);
      return { outcome: 'resumed', attempt: data };
    }

    // ── Atomic create-once via Firestore transaction ────────────────────────
    // [Fix Audit-7 P1] Replace the previous getDoc→setDoc read-then-write pattern
    // with a transaction to guarantee create-once at the database level.
    // Without this, two tabs opening simultaneously can both see "no document"
    // and both issue a setDoc, with the second overwriting the first attempt payload.
    //
    // The transaction re-reads the document inside its lock, so even if a second
    // tab commits between our initial getDoc (above) and this transaction, the
    // second attempt is guaranteed to abort and return the first.
    const profile = auth.currentUser;
    const authProfile = {
      tenantId:    null,
      cohortId:    null,
      email:       profile?.email ?? '',
      displayName: profile?.name ?? '',
    };

    // Read profile fields from Firestore (single read, not from localStorage)
    try {
      const userSnap = await getDoc(doc(db, 'users', uid));
      if (userSnap.exists()) {
        const user = userSnap.data();
        authProfile.tenantId = user.tenantId ?? '';
        authProfile.cohortId = user.cohortId ?? '';
      }
    } catch (profileErr) {
      console.warn('[SessionService] Could not read user profile for attempt envelope:', profileErr?.message);
    }

    const envelope = buildAttemptEnvelope(uid, assessment.id, authProfile, assessment, slug);

    // runTransaction guarantees atomicity: if the document was created by another
    // tab between our initial getDoc and this transaction commit, the transaction
    // is aborted and returns the result from the inner handler.
    const txResult = await runTransaction(db, async (tx) => {
      const txSnap = await tx.get(ref);
      if (txSnap.exists()) {
        // Another tab beat us to the create — return existing data.
        return { created: false, data: txSnap.data() };
      }
      // Safe to create: no concurrent write raced us.
      tx.set(ref, {
        ...envelope,
        startedAt:   serverTimestamp(),
        lastSavedAt: serverTimestamp(),
      });
      return { created: true, data: envelope };
    });

    if (!txResult.created) {
      // A concurrent tab created the attempt first. Treat as resumed.
      console.log('[SessionService] Concurrent create detected: returning existing attempt for', assessment.id);
      const concurrentData = txResult.data;
      const concurrentStatus = concurrentData.status || ATTEMPT_STATES.IN_PROGRESS;
      if (isTerminal(concurrentStatus)) {
        return { outcome: 'blocked', attempt: concurrentData, reason: 'Assessment is in a final state.' };
      }
      return { outcome: 'resumed', attempt: concurrentData };
    }

    console.log('[SessionService] New attempt created (atomic) for assessment', assessment.id, '| uid:', uid);
    return { outcome: 'created', attempt: txResult.data };

  } catch (err) {
    console.error('[SessionService] startAssessmentSession failed:', err?.message);
    return { outcome: 'error', error: err?.message || 'Failed to start assessment session.' };
  }
}

/**
 * Retrieve the current attempt for the authenticated student.
 * Returns null if none exists.
 *
 * @param {string} assessmentId
 * @returns {Promise<object|null>}
 */
export async function getActiveAttempt(assessmentId) {
  const uid = getCurrentUid();
  if (!uid || !assessmentId) return null;
  try {
    const snap = await getDoc(getAttemptRef(uid, assessmentId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (err) {
    console.warn('[SessionService] getActiveAttempt failed:', err?.message);
    return null;
  }
}

/**
 * Transition the attempt state in Firestore.
 * Validates the transition against the state machine before writing.
 *
 * @param {string} assessmentId
 * @param {string} toState        — target ATTEMPT_STATES value
 * @param {object} [extraData]    — additional fields to merge
 * @returns {Promise<boolean>}    — true on success
 */
export async function transitionAttemptState(assessmentId, toState, extraData = {}) {
  const uid = getCurrentUid();
  if (!uid || !assessmentId) return false;

  try {
    const ref = getAttemptRef(uid, assessmentId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      console.warn('[SessionService] transitionAttemptState: attempt doc does not exist.');
      return false;
    }

    const current = snap.data();
    const fromState = current.status || ATTEMPT_STATES.IN_PROGRESS;

    if (!isValidTransition(fromState, toState)) {
      console.warn(`[SessionService] Invalid state transition ${fromState} → ${toState} rejected.`);
      return false;
    }

    await withRetry(() =>
      updateDoc(ref, {
        status:      toState,
        lastSavedAt: serverTimestamp(),
        ...extraData,
      })
    );

    console.log(`[SessionService] Attempt state: ${fromState} → ${toState}`);
    return true;
  } catch (err) {
    console.error('[SessionService] transitionAttemptState failed:', err?.message);
    return false;
  }
}

/**
 * Call when a section begins.
 * @param {string} assessmentId
 * @param {{ sectionId, name, secIdx, durationMinutes }} section
 */
export async function markSectionStarted(assessmentId, section) {
  const uid = getCurrentUid();
  if (!uid || !assessmentId) return;
  try {
    const now = new Date().toISOString();
    const ref = getAttemptRef(uid, assessmentId);
    await updateDoc(ref, {
      [`sections.${section.sectionId}.status`]:          ATTEMPT_STATES.IN_PROGRESS,
      [`sections.${section.sectionId}.startedAt`]:       now,
      [`sections.${section.sectionId}.durationSeconds`]: (section.durationMinutes || 30) * 60,
      activeSection: {
        id:              section.sectionId,
        name:            section.name ?? '',
        idx:             section.secIdx,
        startedAt:       now,
        durationSeconds: (section.durationMinutes || 30) * 60,
      },
      lastSavedAt: serverTimestamp(),
    }).catch(async () => {
      await setDoc(ref, {
        sections: {
          [section.sectionId]: {
            status:          ATTEMPT_STATES.IN_PROGRESS,
            startedAt:       now,
            durationSeconds: (section.durationMinutes || 30) * 60,
          },
        },
        activeSection: {
          id:              section.sectionId,
          name:            section.name ?? '',
          idx:             section.secIdx,
          startedAt:       now,
          durationSeconds: (section.durationMinutes || 30) * 60,
        },
        lastSavedAt: serverTimestamp(),
      }, { merge: true });
    });
    console.log('[SessionService] Section started:', section.sectionId);
  } catch (err) {
    console.warn('[SessionService] markSectionStarted failed (non-fatal):', err?.message);
  }
}

/**
 * Save current section answers to Firestore.
 * Does NOT store timeRemainingSeconds — authoritative time comes from startedAt + durationSeconds.
 *
 * @param {string} assessmentId
 * @param {string} sectionId
 * @param {object} answers  — { [qIdx]: selectedOptionIdx | null }
 */
export async function saveSessionProgress(assessmentId, sectionId, answers) {
  const uid = getCurrentUid();
  if (!uid || !assessmentId) return;
  try {
    const ref = getAttemptRef(uid, assessmentId);
    await updateDoc(ref, {
      [`sectionAnswers.${sectionId}`]: answers || {},
      lastSavedAt: serverTimestamp(),
    }).catch(async () => {
      await setDoc(ref, {
        sectionAnswers: {
          [sectionId]: answers || {},
        },
        lastSavedAt: serverTimestamp(),
      }, { merge: true });
    });
    console.log('[SessionService] Progress saved for section', sectionId);
  } catch (err) {
    console.warn('[SessionService] saveSessionProgress failed (non-fatal):', err?.message);
  }
}

/**
 * Call when a section is submitted (normal or auto-submit).
 * @param {string} assessmentId
 * @param {string} sectionId
 */
export async function markSectionCompleted(assessmentId, sectionId) {
  const uid = getCurrentUid();
  if (!uid || !assessmentId) return;
  try {
    await updateDoc(getAttemptRef(uid, assessmentId), {
      [`sections.${sectionId}.status`]:      ATTEMPT_STATES.SUBMITTED,
      [`sections.${sectionId}.completedAt`]: new Date().toISOString(),
      [`sectionAnswers.${sectionId}`]:       deleteField(), // already in results collection
      activeSection:                         null,
      lastSavedAt:                           serverTimestamp(),
    }).catch(async () => {
      await setDoc(getAttemptRef(uid, assessmentId), {
        [`sections.${sectionId}.status`]:      ATTEMPT_STATES.SUBMITTED,
        [`sections.${sectionId}.completedAt`]: new Date().toISOString(),
        activeSection:                         null,
        lastSavedAt:                           serverTimestamp(),
      }, { merge: true });
    });
  } catch (err) {
    console.warn('[SessionService] markSectionCompleted failed (non-fatal):', err?.message);
  }
}

/**
 * Mark the entire assessment as fully submitted.
 * Uses the state machine transition SUBMITTING → SUBMITTED or AUTO_SUBMITTED.
 * This is a CRITICAL write — retried with exponential backoff.
 * The student MUST NOT be shown "submitted" until this succeeds.
 *
 * @param {string} assessmentId
 * @param {{ autoSubmitted?: boolean, reason?: string, finalPayload?: object }} [opts]
 * @returns {Promise<{ success: boolean, pending?: boolean }>}
 */
export async function completeAssessmentSession(assessmentId, opts = {}) {
  const uid = getCurrentUid();
  if (!uid || !assessmentId) return { success: false };

  const targetState = opts.autoSubmitted
    ? ATTEMPT_STATES.AUTO_SUBMITTED
    : ATTEMPT_STATES.SUBMITTED;

  const attemptRef = getAttemptRef(uid, assessmentId);

  // Idempotency check: if already submitted, return success immediately
  try {
    const snap = await getDoc(attemptRef);
    if (snap.exists()) {
      const current = snap.data();
      if (isTerminal(current?.status) || current?.completed === true) {
        console.log('[SessionService] Attempt already finalized for assessment', assessmentId, '| status:', current?.status);
        clearLocalSubmissionEnvelope(uid, assessmentId);
        return { success: true, alreadySubmitted: true };
      }
    }
  } catch (err) {
    console.warn('[SessionService] Pre-submission idempotency check notice:', err?.message);
  }

  const updateData = {
    status:           targetState,
    completed:        true,
    autoSubmitted:    opts.autoSubmitted || false,
    autoSubmitReason: opts.reason || null,
    completedAt:      serverTimestamp(),
    submittedAt:      new Date().toISOString(),
    activeSection:    null,
    lastSavedAt:      serverTimestamp(),
    scoring_authority: 'client_provisional',
  };

  // Persist envelope locally before attempting the write (crash recovery)
  saveLocalSubmissionEnvelope(uid, assessmentId, {
    assessmentId,
    uid,
    status:         targetState,
    submittedAt:    updateData.submittedAt,
    ...(opts.finalPayload || {}),
  });

  try {
    await withRetry(() => updateDoc(attemptRef, updateData));
    clearLocalSubmissionEnvelope(uid, assessmentId);
    console.log('[SessionService] Session completed for assessment', assessmentId, '| state:', targetState);
    return { success: true };
  } catch (err) {
    console.error('[SessionService] completeAssessmentSession FAILED after retries:', err?.message);
    // Envelope remains in localStorage for retry on next boot.
    return { success: false, pending: true };
  }
}

/**
 * Calculate authoritative remaining seconds for an assessment/section.
 * Uses server-recorded startedAt + durationSeconds — NOT client-stored timeRemainingSeconds.
 *
 * @param {object} attemptData — Firestore attempt document data
 * @returns {number}
 */
export { calcAuthoritativeRemainingSeconds };

/**
 * Threshold (in seconds remaining) at which the 1/3-mark save fires.
 * @param {number} totalDurationSeconds
 * @returns {number}
 */
export function oneThirdSaveThreshold(totalDurationSeconds) {
  return Math.round(totalDurationSeconds * (2 / 3));
}

// ─────────────────────────────────────────────────────────────────────────────
// Startup Reconciliation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * [Fix Audit-6 P1] Startup reconciliation: result exists but attempt is not finalized.
 *
 * This handles the failure case where:
 *   1. setDoc(result) succeeded
 *   2. completeAssessmentSession() then failed (network, crash, etc.)
 *   ⟹ result exists, attempt remains IN_PROGRESS
 *
 * On app boot or assessment resume, call this to detect and heal that discrepancy.
 * If a canonical result already exists for this student+assessment AND the attempt
 * is not already in a terminal state, finalize the attempt automatically.
 *
 * This makes the lifecycle eventually consistent without manual admin intervention.
 *
 * @param {string} assessmentId
 * @param {string} tenantId     — required to locate the result at the canonical path
 * @returns {Promise<{ reconciled: boolean, reason?: string }>}
 */
export async function reconcileAttemptWithResult(assessmentId, tenantId) {
  const uid = getCurrentUid();
  if (!uid || !assessmentId || !tenantId) {
    return { reconciled: false, reason: 'missing-params' };
  }

  try {
    // 1. Check if result already exists
    const resultRef = doc(db, 'assessmentResults', tenantId, assessmentId, uid);
    const resultSnap = await getDoc(resultRef);
    if (!resultSnap.exists()) {
      return { reconciled: false, reason: 'no-result' };
    }

    // 2. Check current attempt state
    const attemptRef = getAttemptRef(uid, assessmentId);
    const attemptSnap = await getDoc(attemptRef);
    if (!attemptSnap.exists()) {
      // No attempt to reconcile — result may be from a different flow
      return { reconciled: false, reason: 'no-attempt' };
    }

    const attemptData = attemptSnap.data();
    const currentStatus = attemptData.status || ATTEMPT_STATES.IN_PROGRESS;

    if (isTerminal(currentStatus) || attemptData.completed === true) {
      // Already terminal — no reconciliation needed
      return { reconciled: false, reason: 'already-terminal' };
    }

    // 3. Result exists + attempt not terminal → finalize the attempt
    console.log('[SessionService] reconcileAttemptWithResult: result exists but attempt not finalized. Reconciling…', {
      assessmentId, uid, currentStatus,
    });

    const resultData = resultSnap.data();
    const wasAutoSubmitted = Boolean(resultData?.autoSubmitted);

    const finalizeResult = await completeAssessmentSession(assessmentId, {
      autoSubmitted: wasAutoSubmitted,
      reason: resultData?.submissionReason || 'reconciliation',
    });

    if (finalizeResult.success || finalizeResult.alreadySubmitted) {
      console.log('[SessionService] reconcileAttemptWithResult: attempt successfully finalized.');
      return { reconciled: true, reason: 'finalized' };
    }

    return { reconciled: false, reason: 'finalization-failed' };
  } catch (err) {
    console.warn('[SessionService] reconcileAttemptWithResult failed:', err?.message);
    return { reconciled: false, reason: err?.message };
  }
}

export default {
  startAssessmentSession,
  getActiveAttempt,
  transitionAttemptState,
  markSectionStarted,
  saveSessionProgress,
  markSectionCompleted,
  completeAssessmentSession,
  reconcileAttemptWithResult,
  calcAuthoritativeRemainingSeconds,
  oneThirdSaveThreshold,
};
