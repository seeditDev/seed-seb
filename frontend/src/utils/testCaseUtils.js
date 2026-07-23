/**
 * testCaseUtils.js
 * Utility helper to handle and resolve test cases in SEED-IT Platform.
 * Supports:
 * - Regular test cases (type: "reg")
 * - Generator test cases (type: "gen") with dynamic JS expressions (e.g. "[[7," + "0,".repeat(97) + "9993],10000]")
 * - Auto-resolving input and expectedOutput expressions
 */

/**
 * Resolves a raw test case value string (input or expected output).
 * If type is "gen" or the string contains JS generator expressions, evaluates it safely.
 * @param {any} rawVal 
 * @param {string} type - e.g. "gen" or "reg"
 * @returns {string} Fully evaluated and resolved string value
 */
export function resolveTestCaseValue(rawVal, type) {
  if (rawVal === undefined || rawVal === null) return '';
  const strVal = String(rawVal);

  const isGen = type === 'gen' || 
                strVal.includes('.repeat(') || 
                (strVal.includes('" + "') && strVal.startsWith('"[')) ||
                (strVal.includes('Array(') && strVal.includes('.fill('));

  if (isGen) {
    try {
      const evaluated = new Function(`"use strict"; return (${strVal});`)();
      if (typeof evaluated === 'object') {
        return JSON.stringify(evaluated);
      }
      return String(evaluated);
    } catch (e) {
      console.warn("[TestCaseUtils] Error evaluating generated testcase expression:", e);
      return strVal;
    }
  }

  return strVal;
}

/**
 * Normalizes a single test case object, evaluating generated inputs/outputs if needed.
 * @param {Object} tc - Raw test case object
 * @returns {Object} Normalized test case with resolved input and expected properties
 */
export function normalizeTestCase(tc) {
  if (!tc) return tc;
  const isGen = tc.type === 'gen';
  const rawInput = tc.input !== undefined ? tc.input : '';
  const resolvedInput = resolveTestCaseValue(rawInput, tc.type);

  const rawExpected = tc.expectedOutput !== undefined 
    ? tc.expectedOutput 
    : (tc.expected !== undefined ? tc.expected : (tc.output !== undefined ? tc.output : (tc.expected_output !== undefined ? tc.expected_output : '')));
  const resolvedExpected = resolveTestCaseValue(rawExpected, tc.type);

  return {
    ...tc,
    id: tc.id || tc.label || '',
    input: resolvedInput,
    expected: resolvedExpected,
    expectedOutput: resolvedExpected,
    isGenerated: isGen
  };
}

/**
 * Normalizes an array of test cases.
 * @param {Array} testCases 
 * @returns {Array} Array of normalized test cases
 */
export function normalizeTestCaseArray(testCases) {
  if (!Array.isArray(testCases)) return [];
  return testCases.map(normalizeTestCase);
}
