/**
 * assessmentTimerWorker.js
 *
 * Dedicated Web Worker Timer for high-stakes assessments.
 *
 * Runs timer ticks on a background OS thread completely isolated from:
 * - Monaco Editor layout passes & syntax highlighting
 * - TensorFlow.js / YOLOv8 face proctoring inference
 * - SQL parsing & local SQLite execution
 *
 * Ground Truth: Strictly anchored to wall-clock `endTimeMs` via `Date.now()`.
 * If main-thread UI work delays a message, the next tick immediately snaps
 * to the exact real-world seconds remaining (zero cumulative drift).
 *
 * Fallback: Gracefully falls back to high-resolution window interval if
 * Worker execution is unavailable or restricted.
 */
import { useEffect, useRef, useCallback } from 'react';

const WORKER_SCRIPT = `
let timerId = null;

self.onmessage = function(e) {
  const data = e.data || {};
  if (data.action === 'START') {
    if (timerId) clearInterval(timerId);
    const endTimeMs = data.endTimeMs;
    const intervalMs = data.intervalMs || 500;

    function tick() {
      const now = Date.now();
      const remainingSecs = Math.max(0, Math.round((endTimeMs - now) / 1000));
      self.postMessage({ type: 'TICK', remainingSecs: remainingSecs, nowMs: now });
      if (remainingSecs <= 0) {
        if (timerId) {
          clearInterval(timerId);
          timerId = null;
        }
        self.postMessage({ type: 'EXPIRED', nowMs: now });
      }
    }

    tick();
    timerId = setInterval(tick, intervalMs);
  } else if (data.action === 'STOP') {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }
};
`;

/**
 * Creates an isolated Web Worker instance or returns null if unsupported.
 */
export function createTimerWorker() {
  if (typeof window === 'undefined' || typeof window.Worker === 'undefined') {
    return null;
  }
  try {
    const blob = new Blob([WORKER_SCRIPT], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    worker._blobUrl = url;
    return worker;
  } catch (err) {
    console.warn('[AssessmentTimerWorker] Could not instantiate Web Worker, using main-thread fallback:', err);
    return null;
  }
}

/**
 * React hook for a drift-resistant, background-isolated assessment timer.
 *
 * @param {Object} options
 * @param {number} options.endTimeMs - Ground truth timestamp (ms) when timer expires.
 * @param {boolean} options.isStarted - Whether timer is active.
 * @param {function(number): void} options.onTick - Callback receiving remaining seconds.
 * @param {function(): void} [options.onExpire] - Callback invoked when timer hits 0.
 * @param {number} [options.intervalMs=500] - Polling interval.
 */
export function useAssessmentTimer({
  endTimeMs,
  isStarted,
  onTick,
  onExpire,
  intervalMs = 500
}) {
  const onTickRef = useRef(onTick);
  const onExpireRef = useRef(onExpire);
  const workerRef = useRef(null);
  const fallbackIntervalRef = useRef(null);
  const hasExpiredRef = useRef(false);

  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  const stopTimer = useCallback(() => {
    if (workerRef.current) {
      try {
        workerRef.current.postMessage({ action: 'STOP' });
        workerRef.current.terminate();
        if (workerRef.current._blobUrl) {
          URL.revokeObjectURL(workerRef.current._blobUrl);
        }
      } catch (_) {}
      workerRef.current = null;
    }
    if (fallbackIntervalRef.current) {
      clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isStarted || !endTimeMs || endTimeMs <= 0) {
      stopTimer();
      hasExpiredRef.current = false;
      return;
    }

    hasExpiredRef.current = false;
    const worker = createTimerWorker();

    if (worker) {
      workerRef.current = worker;
      worker.onmessage = (e) => {
        const msg = e.data || {};
        if (msg.type === 'TICK') {
          if (typeof onTickRef.current === 'function') {
            onTickRef.current(msg.remainingSecs);
          }
        } else if (msg.type === 'EXPIRED') {
          if (!hasExpiredRef.current) {
            hasExpiredRef.current = true;
            if (typeof onExpireRef.current === 'function') {
              onExpireRef.current();
            }
          }
        }
      };

      worker.postMessage({
        action: 'START',
        endTimeMs,
        intervalMs
      });
    } else {
      // Main-thread wall-clock fallback
      const tick = () => {
        const now = Date.now();
        const remaining = Math.max(0, Math.round((endTimeMs - now) / 1000));
        if (typeof onTickRef.current === 'function') {
          onTickRef.current(remaining);
        }
        if (remaining <= 0) {
          if (fallbackIntervalRef.current) {
            clearInterval(fallbackIntervalRef.current);
            fallbackIntervalRef.current = null;
          }
          if (!hasExpiredRef.current) {
            hasExpiredRef.current = true;
            if (typeof onExpireRef.current === 'function') {
              onExpireRef.current();
            }
          }
        }
      };
      tick();
      fallbackIntervalRef.current = setInterval(tick, intervalMs);
    }

    return () => {
      stopTimer();
    };
  }, [endTimeMs, isStarted, intervalMs, stopTimer]);

  return { stopTimer };
}

export default useAssessmentTimer;
