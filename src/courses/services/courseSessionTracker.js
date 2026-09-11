/**
 * courseSessionTracker.js
 * High-efficiency Bounded Active Session Tracker.
 * 
 * Protects Firestore write quotas by accumulating active seconds in client memory
 * and flushing ONLY on key milestones (topic/problem solve, tab switch, unmount,
 * or 5-min intervals).
 * 
 * Features:
 * - 120s idle timeout cutoff (stops accumulating if student walks away).
 * - Only counts when document.visibilityState === 'visible'.
 * - Dual persistence:
 *   1. users/{uid}/courseProgress/{courseId} -> timeSpentSeconds, lastActivityAt
 *   2. dailyCourseMetrics/{tenantId}_{cohortId}_{date} -> totalActiveSeconds, courseBreakdown
 */

import { db } from '../../lib/firebase-config';
import { doc, setDoc, increment, serverTimestamp } from 'firebase/firestore';

const IDLE_THRESHOLD_MS = 120 * 1000; // 120 seconds idle cutoff
const FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes periodic flush

let currentSession = null;

function getTodayDateStr() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function startCourseSession(uid, courseId, userMetadata = {}) {
  // If already tracking another course session, cleanly flush and stop it first
  if (currentSession) {
    stopCourseSession();
  }

  if (!uid || uid === 'demo' || !courseId) return () => {};

  const tenantId = userMetadata.tenantId || userMetadata.college || 'general';
  const cohortId = userMetadata.cohortId || userMetadata.year || 'general';

  const session = {
    uid,
    courseId,
    tenantId,
    cohortId,
    accumulatedSeconds: 0,
    lastActiveTimestamp: Date.now(),
    isActive: true,
    intervalTimerId: null,
    flushTimerId: null,
  };

  currentSession = session;

  // Activity listeners to detect presence and reset idle timer
  const handleUserActivity = () => {
    if (!currentSession) return;
    currentSession.lastActiveTimestamp = Date.now();
    currentSession.isActive = true;
  };

  const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];
  activityEvents.forEach((evt) => {
    window.addEventListener(evt, handleUserActivity, { passive: true });
  });

  // 1-second tick timer
  session.intervalTimerId = setInterval(() => {
    if (!currentSession) return;
    const now = Date.now();
    const isVisible = typeof document !== 'undefined' ? document.visibilityState === 'visible' : true;
    const isWithinIdleLimit = now - currentSession.lastActiveTimestamp < IDLE_THRESHOLD_MS;

    if (isVisible && isWithinIdleLimit) {
      currentSession.accumulatedSeconds += 1;
    } else {
      currentSession.isActive = false;
    }
  }, 1000);

  // 5-minute periodic bounded flush
  session.flushTimerId = setInterval(() => {
    flushActiveSessionTime('periodic_5min');
  }, FLUSH_INTERVAL_MS);

  // Visibility and page unload flush handlers
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      flushActiveSessionTime('tab_hidden');
    } else {
      if (currentSession) {
        currentSession.lastActiveTimestamp = Date.now();
      }
    }
  };

  const handleBeforeUnload = () => {
    flushActiveSessionTime('page_unload');
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('beforeunload', handleBeforeUnload);

  // Return cleanup teardown function
  return () => {
    activityEvents.forEach((evt) => {
      window.removeEventListener(evt, handleUserActivity);
    });
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('beforeunload', handleBeforeUnload);
    stopCourseSession();
  };
}

/**
 * Flush accumulated active seconds to Firestore.
 */
export async function flushActiveSessionTime(reason = 'milestone') {
  if (!currentSession) return;

  const secondsToFlush = currentSession.accumulatedSeconds;
  if (secondsToFlush < 5) {
    // Skip trivial sub-5-second blips
    return;
  }

  // Reset accumulator immediately to avoid double-flushing
  currentSession.accumulatedSeconds = 0;

  const { uid, courseId, tenantId, cohortId } = currentSession;
  const dateStr = getTodayDateStr();

  try {
    // 1. Update student's courseProgress document
    const userProgressRef = doc(db, 'users', uid, 'courseProgress', courseId);
    await setDoc(
      userProgressRef,
      {
        courseId,
        timeSpentSeconds: increment(secondsToFlush),
        lastActivityAt: serverTimestamp(),
        lastHeartbeatAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    // 2. Update daily aggregated cohort metrics document
    if (tenantId && cohortId && tenantId !== 'general') {
      const metricDocId = `${tenantId}_${cohortId}_${dateStr}`;
      const metricRef = doc(db, 'dailyCourseMetrics', metricDocId);

      await setDoc(
        metricRef,
        {
          id: metricDocId,
          tenantId,
          cohortId,
          date: dateStr,
          totalActiveSeconds: increment(secondsToFlush),
          [`courseBreakdown.${courseId}.seconds`]: increment(secondsToFlush),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    console.log(`[courseSessionTracker] Flushed ${secondsToFlush}s for ${courseId} (${reason})`);
  } catch (err) {
    console.warn('[courseSessionTracker] Flush error (non-fatal):', err.message);
  }
}

/**
 * Increment daily problem metrics when student solves a coding problem in a course.
 */
export async function recordDailyProblemMetric(tenantId, cohortId, courseId, isSolved = true) {
  if (!tenantId || !cohortId || tenantId === 'general') return;
  const dateStr = getTodayDateStr();
  const metricDocId = `${tenantId}_${cohortId}_${dateStr}`;

  try {
    const metricRef = doc(db, 'dailyCourseMetrics', metricDocId);
    const updates = {
      id: metricDocId,
      tenantId,
      cohortId,
      date: dateStr,
      totalProblemsAttempted: increment(1),
      [`courseBreakdown.${courseId}.attempted`]: increment(1),
      updatedAt: serverTimestamp(),
    };
    if (isSolved) {
      updates.totalProblemsSolved = increment(1);
      updates[`courseBreakdown.${courseId}.solved`] = increment(1);
    }
    await setDoc(metricRef, updates, { merge: true });
  } catch (err) {
    console.warn('[courseSessionTracker] Problem metric record error:', err.message);
  }
}

/**
 * Stop session and flush any remaining time.
 */
export function stopCourseSession() {
  if (!currentSession) return;

  if (currentSession.intervalTimerId) {
    clearInterval(currentSession.intervalTimerId);
  }
  if (currentSession.flushTimerId) {
    clearInterval(currentSession.flushTimerId);
  }

  flushActiveSessionTime('session_stop');
  currentSession = null;
}
