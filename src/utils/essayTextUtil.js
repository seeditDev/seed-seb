/**
 * essayTextUtil.js
 * Canonical text tokenization and typing analytics calculation for SEED-IT Essay assessments.
 * Standardized across student frontends, evaluators, admin reports, and PDF engines.
 */

/**
 * Standard canonical word counter.
 * - Whitespace-separated tokens.
 * - Consecutive spaces and newlines ignored.
 * - Leading and trailing whitespace ignored.
 * - Pure punctuation tokens stripped out.
 * - Returns 0 for empty or whitespace-only inputs.
 *
 * @param {string} text - Raw input text (excluding title).
 * @returns {number} Standard word count.
 */
export function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;

  // Split on whitespace sequence
  const tokens = trimmed.split(/\s+/);
  
  // Filter tokens that contain at least one alphanumeric character
  return tokens.filter(tok => /[a-zA-Z0-9]/.test(tok)).length;
}

/**
 * Standard sentence counter.
 *
 * @param {string} text
 * @returns {number}
 */
export function countSentences(text) {
  if (!text || typeof text !== 'string') return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;

  const matches = trimmed.match(/[^.!?]+[.!?]+(\s|$)/g);
  return matches ? matches.length : (trimmed.length > 0 ? 1 : 0);
}

/**
 * Standard paragraph counter.
 *
 * @param {string} text
 * @returns {number}
 */
export function countParagraphs(text) {
  if (!text || typeof text !== 'string') return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;

  return trimmed
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0).length;
}

/**
 * Calculate Gross Words Per Minute (WPM).
 * WPM = wordsTyped / (activeTypingSeconds / 60)
 *
 * @param {number} wordsTyped
 * @param {number} activeTypingSeconds
 * @returns {number} Gross WPM rounded to nearest integer
 */
export function calculateGrossWPM(wordsTyped, activeTypingSeconds) {
  if (!wordsTyped || wordsTyped <= 0 || !activeTypingSeconds || activeTypingSeconds <= 2) {
    return 0;
  }
  const minutes = activeTypingSeconds / 60;
  const rawWpm = wordsTyped / minutes;
  return Math.max(0, Math.min(250, Math.round(rawWpm)));
}
