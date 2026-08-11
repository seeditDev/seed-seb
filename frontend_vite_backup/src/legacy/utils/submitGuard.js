/**
 * Single shared in-flight guard for assessment submissions.
 *
 * BUG FIXED: MCQ / Coding / Multi-Section auto-submit could fire from several
 * effects at once (timer effect, per-question timer effect, visibility effect,
 * proctoring violation callback). The `disabled` attribute on the submit button
 * does not protect programmatic paths, so multiple final result documents were
 * written for the same attempt.
 *
 * Usage:
 *   const guard = useSubmitGuard();
 *   if (!guard.begin('timer')) return;      // already submitting / already done
 *   try { ...submit... ; guard.complete(); }
 *   catch (e) { guard.fail(); throw e; }
 */
import { useRef, useMemo } from 'react';

export function createSubmitGuard() {
  const state = { inFlight: false, done: false, reason: null };
  return {
    get isInFlight() { return state.inFlight; },
    get isDone() { return state.done; },
    get reason() { return state.reason; },
    /** @returns {boolean} true when the caller owns the submission */
    begin(reason = 'manual') {
      if (state.inFlight || state.done) return false;
      state.inFlight = true;
      state.reason = reason;
      return true;
    },
    /** Mark the attempt as finally submitted — no further submits allowed. */
    complete() {
      state.inFlight = false;
      state.done = true;
    },
    /** Release the lock after a recoverable failure so a retry can run. */
    fail() {
      state.inFlight = false;
    },
    reset() {
      state.inFlight = false;
      state.done = false;
      state.reason = null;
    },
  };
}

export function useSubmitGuard() {
  const ref = useRef(null);
  if (!ref.current) ref.current = createSubmitGuard();
  return ref.current;
}

/**
 * Deterministic attempt document id, so a duplicate submit overwrites the same
 * document instead of creating a second result row.
 */
export function attemptDocId(email, testId) {
  return `${String(email || '').toLowerCase()}__${String(testId || 'unknown')}`;
}

export default useSubmitGuard;
