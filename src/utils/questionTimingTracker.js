/**
 * questionTimingTracker.js — Navigation/State-level Question Timing Tracker
 *
 * Recommended Behavior:
 * - When student opens Q1 → start its timer.
 * - When student moves from Q1 → Q2 → stop Q1 timer and save elapsed time.
 * - If student returns to Q1 → resume/add to Q1's existing time.
 * - On submit → stop currently active question timer and save it.
 * - Stores time in seconds (best for calculations) and formatted mm:ss.
 *
 * Produces canonical questionTiming map:
 * {
 *   "Q1": { "timeSpentSeconds": 245, "timeSpentFormatted": "04:05", "questionId": "...", "questionNumber": 1 },
 *   "Q2": { "timeSpentSeconds": 612, "timeSpentFormatted": "10:12", "questionId": "...", "questionNumber": 2 },
 *   ...
 * }
 */

export class QuestionTimingTracker {
  /**
   * @param {object} [initialData] - Existing timeSpentPerQ or questionTiming map
   * @param {string} [storageKey] - Optional localStorage key for auto-persistence
   */
  constructor(initialData = {}, storageKey = null) {
    this.storageKey = storageKey;
    this.accumulatedSeconds = {};

    // Restore from localStorage or initialData
    let dataToLoad = initialData;
    if (this.storageKey && typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem(this.storageKey);
        if (saved) {
          dataToLoad = JSON.parse(saved);
        }
      } catch (_) {}
    }

    if (dataToLoad && typeof dataToLoad === 'object') {
      Object.entries(dataToLoad).forEach(([key, val]) => {
        let secs = 0;
        if (typeof val === 'number') {
          secs = val;
        } else if (val && typeof val.timeSpentSeconds === 'number') {
          secs = val.timeSpentSeconds;
        }
        if (secs > 0) {
          this.accumulatedSeconds[key] = secs;
        }
      });
    }

    this.activeQuestionIndex = 0;
    this.activeStartTime = Date.now();
    this.isActive = true;
  }

  /**
   * Starts or resumes tracking for the given question index.
   * @param {number} [initialIndex=0]
   */
  start(initialIndex = 0) {
    this.activeQuestionIndex = typeof initialIndex === 'number' ? initialIndex : 0;
    this.activeStartTime = Date.now();
    this.isActive = true;
  }

  /**
   * Flushes elapsed time for the current active question into accumulatedSeconds.
   */
  flushCurrent() {
    if (!this.isActive || !this.activeStartTime) return;
    const now = Date.now();
    const elapsed = Math.max(0, Math.round((now - this.activeStartTime) / 1000));
    const qKey = `Q${this.activeQuestionIndex + 1}`;

    this.accumulatedSeconds[qKey] = (this.accumulatedSeconds[qKey] || 0) + elapsed;
    this.activeStartTime = now;
    this._persist();
  }

  /**
   * Switches active question.
   * Stops timer on current question, saves elapsed time, and starts timer on target.
   * @param {number} targetIndex
   */
  switchQuestion(targetIndex) {
    if (typeof targetIndex !== 'number' || targetIndex < 0) return;
    if (targetIndex === this.activeQuestionIndex) return;

    this.flushCurrent();
    this.activeQuestionIndex = targetIndex;
    this.activeStartTime = Date.now();
  }

  /**
   * Stops the active question timer permanently upon submission.
   */
  stop() {
    this.flushCurrent();
    this.isActive = false;
    this.activeStartTime = null;
  }

  /**
   * Formats seconds into mm:ss
   * @param {number} seconds
   * @returns {string} e.g. "04:05"
   */
  static formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const mins = Math.floor(s / 60);
    const remSecs = s % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${remSecs < 10 ? '0' : ''}${remSecs}`;
  }

  /**
   * Generates the canonical questionTiming map.
   * Keyed by "Q1", "Q2", etc.
   *
   * @param {Array} [questions=[]]
   * @returns {Record<string, { timeSpentSeconds: number, timeSpentFormatted: string, questionId: string, questionNumber: number, title: string }>}
   */
  getQuestionTiming(questions = []) {
    this.flushCurrent();
    const result = {};
    const count = Math.max(questions.length, Object.keys(this.accumulatedSeconds).length);

    for (let i = 0; i < count; i++) {
      const qKey = `Q${i + 1}`;
      const q = questions[i] || {};
      const qId = q.id || q.questionId || `q_${i}`;

      const secs = (this.accumulatedSeconds[qKey] ?? this.accumulatedSeconds[qId]) || 0;
      const formatted = QuestionTimingTracker.formatTime(secs);

      result[qKey] = {
        timeSpentSeconds: secs,
        timeSpentFormatted: formatted,
        questionId: qId,
        questionNumber: i + 1,
        title: q.name || q.title || `Question ${i + 1}`,
      };
    }
    return result;
  }

  /**
   * Returns a raw dictionary mapping both Q-keys ("Q1", "Q2") and question IDs to seconds.
   *
   * @param {Array} [questions=[]]
   * @returns {Record<string, number>}
   */
  getRawTimeMap(questions = []) {
    this.flushCurrent();
    const map = { ...this.accumulatedSeconds };
    questions.forEach((q, idx) => {
      const qKey = `Q${idx + 1}`;
      const qId = q.id || q.questionId;
      const secs = (this.accumulatedSeconds[qKey] ?? (qId ? this.accumulatedSeconds[qId] : 0)) || 0;
      map[qKey] = secs;
      if (qId) {
        map[qId] = secs;
      }
    });
    return map;
  }

  /**
   * Internal sync to localStorage
   */
  _persist() {
    if (this.storageKey && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(this.accumulatedSeconds));
      } catch (_) {}
    }
  }

  /**
   * Cleans up any persisted storage key
   */
  clearStorage() {
    if (this.storageKey && typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(this.storageKey);
      } catch (_) {}
    }
  }
}

export default QuestionTimingTracker;
