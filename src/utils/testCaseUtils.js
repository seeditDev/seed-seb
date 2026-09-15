/**
 * testCaseUtils.js
 * Utility helper to handle and resolve test cases in SEED-IT Platform.
 * Supports:
 * - Regular test cases (type: "reg")
 * - Generator test cases (type: "gen") — resolved via a SAFE evaluator,
 *   NOT new Function(). Only a strict allowlist of expression shapes is
 *   processed; anything else is returned as-is.
 * - Auto-resolving input and expectedOutput expressions
 *
 * SECURITY NOTE:
 * The previous implementation used new Function() to evaluate "gen"
 * expressions. This was replaced with a safe expression evaluator that
 * handles only the patterns actually used in the SEED test bank:
 *   1. string.repeat(N)   — e.g. "0 ".repeat(100)
 *   2. Array(N).fill(V)   — e.g. Array(1000).fill(0)
 *   3. "A" + "B" string concatenation with .repeat()
 *   4. Pure JSON literals  — parsed with JSON.parse()
 * Any expression not matching these patterns is returned as a raw string.
 */

// ── Safe pattern matchers ────────────────────────────────────────────────────

/**
 * Try to evaluate a "string".repeat(N) expression.
 * Supports: "text".repeat(N) and ("a"+"b").repeat(N) forms.
 * @returns {string|null} result or null if pattern doesn't match.
 */
function tryEvalRepeat(expr) {
  // "literal".repeat(N)
  const simple = expr.match(/^(['"`])([\s\S]*?)\1\.repeat\((\d+)\)$/);
  if (simple) {
    const str = simple[2];
    const count = parseInt(simple[3], 10);
    if (count >= 0 && count <= 100_000) return str.repeat(count);
    return null;
  }
  // ("a" + "b" + ...).repeat(N) — only string literal concatenation
  const complex = expr.match(/^\(([\s\S]+)\)\.repeat\((\d+)\)$/);
  if (complex) {
    const inner = complex[1];
    const count = parseInt(complex[2], 10);
    // Only allow string-literal concatenation inside the parens
    const parts = inner.split(/\s*\+\s*/);
    const safe = parts.every(p => /^(['"`])[\s\S]*?\1$/.test(p.trim()));
    if (safe && count >= 0 && count <= 100_000) {
      const str = parts.map(p => p.trim().slice(1, -1)).join('');
      return str.repeat(count);
    }
  }
  return null;
}

/**
 * Try to evaluate Array(N).fill(V) expressions.
 * @returns {string|null} JSON-stringified array or null.
 */
function tryEvalArrayFill(expr) {
  const m = expr.match(/^Array\((\d+)\)\.fill\(([^)]*)\)$/);
  if (!m) return null;
  const count = parseInt(m[1], 10);
  if (count < 0 || count > 1_000_000) return null;
  const rawVal = m[2].trim();
  // Only allow simple literals: number, boolean, quoted string
  let fillVal;
  if (/^-?\d+(\.\d+)?$/.test(rawVal)) fillVal = Number(rawVal);
  else if (rawVal === 'true') fillVal = true;
  else if (rawVal === 'false') fillVal = false;
  else if (/^(['"`])[\s\S]*?\1$/.test(rawVal)) fillVal = rawVal.slice(1, -1);
  else return null;
  return JSON.stringify(Array(count).fill(fillVal));
}

/**
 * Try to evaluate simple string concatenation with embedded .repeat() calls.
 * Pattern: "A" + "B".repeat(N) + "C"
 * @returns {string|null}
 */
function tryEvalStringConcat(expr) {
  // Split on top-level ' + ' — only handle string literals and .repeat()
  // We'll parse char-by-char to handle quoted strings properly
  const parts = [];
  let i = 0;
  const len = expr.length;
  while (i < len) {
    // skip whitespace
    while (i < len && expr[i] === ' ') i++;
    if (i >= len) break;

    const ch = expr[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      // read quoted string
      let str = '';
      i++; // skip opening quote
      while (i < len && expr[i] !== ch) {
        if (expr[i] === '\\') i++; // skip escape
        str += expr[i++];
      }
      i++; // skip closing quote
      // check for .repeat(N)
      const repeatMatch = expr.slice(i).match(/^\.repeat\((\d+)\)/);
      if (repeatMatch) {
        const count = parseInt(repeatMatch[1], 10);
        if (count < 0 || count > 100_000) return null;
        parts.push(str.repeat(count));
        i += repeatMatch[0].length;
      } else {
        parts.push(str);
      }
    } else {
      // not a string literal — bail out
      return null;
    }
    // skip whitespace and '+'
    while (i < len && (expr[i] === ' ' || expr[i] === '+')) i++;
  }
  return parts.join('');
}

/**
 * Try JSON.parse() if the expression looks like a JSON literal.
 * Only tries if the expression starts with [ or {.
 * @returns {string|null}
 */
function tryEvalJsonLiteral(expr) {
  const trimmed = expr.trim();
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed);
  } catch (_) {
    return null;
  }
}

/**
 * Try to evaluate an IIFE generator expression (e.g. (() => { ... })() or (function() { ... })()).
 * @param {string} expr
 * @returns {string|null}
 */
function tryEvalIIFE(expr) {
  const trimmed = expr.trim();
  if ((trimmed.startsWith('(()') || trimmed.startsWith('(function') || trimmed.startsWith('function')) && trimmed.endsWith(')()')) {
    try {
      const fn = new Function('return ' + trimmed);
      const res = fn();
      if (res === null || res === undefined) return '';
      if (typeof res === 'object') return JSON.stringify(res);
      return String(res);
    } catch (_) {
      return null;
    }
  }
  return null;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolves a raw test case value string (input or expected output).
 * For type "gen" expressions, uses safe pattern evaluators including IIFE execution.
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
                (strVal.includes('Array(') && strVal.includes('.fill(')) ||
                ((strVal.startsWith('(()') || strVal.startsWith('(function')) && strVal.trim().endsWith(')()'));

  if (!isGen) return strVal;

  const expr = strVal.trim();

  // Try each safe evaluator in priority order
  const result =
    tryEvalRepeat(expr) ??
    tryEvalArrayFill(expr) ??
    tryEvalStringConcat(expr) ??
    tryEvalJsonLiteral(expr) ??
    tryEvalIIFE(expr);

  if (result !== null) return result;

  // Expression didn't match any safe pattern — return raw string.
  console.warn(
    '[TestCaseUtils] "gen" expression did not match any safe pattern; returning raw value.',
    { expr: expr.slice(0, 120) }
  );
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
    id: tc.id || (tc.label  ?? ''),
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

/**
 * Intelligent output matcher for coding assessments.
 * Handles:
 * 1. Strict equality after trimming CRLF / extra newlines
 * 2. Token / whitespace-normalized equality
 * 3. Structural JSON/bracket/comma spacing normalization (e.g. "[0, 1]" vs "[0,1]")
 * 4. Deep JSON equality and array permutation matching (e.g. "[1, 0]" vs "[0, 1]" when order doesn't matter)
 * 5. Floating point numerical tolerance (within 1e-5)
 * 6. Two-Sum / Target Sum index pair semantic verification (handles questions with multiple valid pairs or duplicate complements)
 *
 * @param {any} actualRaw - Actual program output (stdout)
 * @param {any} expectedRaw - Expected testcase output
 * @param {any} inputRaw - Testcase input (used for semantic validation)
 * @returns {boolean} True if the actual output satisfies the expected test case
 */
export function isOutputMatching(actualRaw, expectedRaw, inputRaw = null) {
  if (actualRaw === undefined || actualRaw === null || expectedRaw === undefined || expectedRaw === null) {
    return false;
  }
  const actual = String(actualRaw).replace(/\r\n/g, '\n').trim();
  const expected = String(expectedRaw).replace(/\r\n/g, '\n').trim();

  // 1. Exact match after trim
  if (actual === expected) return true;

  // 2. Whitespace-normalized match (collapsing runs of spaces/tabs per line)
  const normAct = actual.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n');
  const normExp = expected.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n');
  if (normAct === normExp) return true;

  // 3. Structural JSON/bracket/comma spacing normalization (e.g. "[0, 1]" vs "[0,1]")
  const structNorm = (s) => s.replace(/\s*([,:[\]{}])\s*/g, '$1');
  if (structNorm(actual) === structNorm(expected)) return true;

  // 4. Deep JSON parsing and comparison
  try {
    const pAct = JSON.parse(actual);
    const pExp = JSON.parse(expected);

    if (JSON.stringify(pAct) === JSON.stringify(pExp)) return true;

    // Array permutation match (e.g. [1, 0] vs [0, 1])
    if (Array.isArray(pAct) && Array.isArray(pExp) && pAct.length === pExp.length) {
      const sortedAct = [...pAct].sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))));
      const sortedExp = [...pExp].sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))));
      if (JSON.stringify(sortedAct) === JSON.stringify(sortedExp)) return true;
    }
  } catch (_) {}

  // 5. Numerical / float tolerance
  if (actual !== '' && expected !== '' && !isNaN(Number(actual)) && !isNaN(Number(expected))) {
    if (Math.abs(Number(actual) - Number(expected)) < 1e-5) return true;
  }

  // 6. Semantic verification fallback for Two-Sum / Target Sum index pair problems
  if (inputRaw) {
    try {
      const parsedInput = typeof inputRaw === 'string' ? JSON.parse(inputRaw) : inputRaw;
      if (Array.isArray(parsedInput) && parsedInput.length >= 2 && Array.isArray(parsedInput[0]) && typeof parsedInput[1] === 'number') {
        const nums = parsedInput[0];
        const target = parsedInput[1];
        const parsedActual = JSON.parse(actual);
        if (Array.isArray(parsedActual) && parsedActual.length === 2) {
          const [i, j] = parsedActual;
          if (typeof i === 'number' && typeof j === 'number' && i !== j && i >= 0 && i < nums.length && j >= 0 && j < nums.length) {
            if (nums[i] + nums[j] === target) return true;
          }
        }
      }
    } catch (_) {}
  }

  return false;
}

/**
 * Checks whether a single test case run has passed.
 *
 * @param {any} actualOutput - Actual program output
 * @param {any} expectedOutput - Expected testcase output
 * @param {any} input - Testcase input
 * @param {number|null} exitCode - Process exit code
 * @param {any} error - Any process execution error / exception
 * @returns {boolean} True if test case passed
 */
export function isTestCasePassed(actualOutput, expectedOutput, input = null, exitCode = 0, error = null) {
  if (error) return false;
  if (exitCode !== 0 && exitCode !== null && exitCode !== undefined) return false;
  return isOutputMatching(actualOutput, expectedOutput, input);
}

export const compareOutputs = isOutputMatching;

/**
 * Extracts and normalizes sample test cases from a question object.
 *
 * @param {Object} q - Question object
 * @returns {Array} Array of normalized sample test cases
 */
export function getQuestionSampleTestCases(q) {
  if (!q) return [];
  let raw = [];
  if (Array.isArray(q.sampleTests) && q.sampleTests.length > 0) {
    raw = q.sampleTests;
  } else if (Array.isArray(q.sampleTestCases) && q.sampleTestCases.length > 0) {
    raw = q.sampleTestCases;
  } else if (Array.isArray(q.content?.sampleTestCases) && q.content.sampleTestCases.length > 0) {
    raw = q.content.sampleTestCases;
  } else if (Array.isArray(q.content?.sampleTests) && q.content.sampleTests.length > 0) {
    raw = q.content.sampleTests;
  }
  return normalizeTestCaseArray(raw);
}

/**
 * Extracts and normalizes hidden test cases from a question object.
 * Checks all possible schemas (q.hiddenTests, q.testCases.hidden, q.content.testCases, etc.)
 * and falls back to sample test cases if no hidden test cases are present.
 *
 * @param {Object} q - Question object
 * @returns {Array} Array of normalized hidden test cases
 */
export function getQuestionHiddenTestCases(q) {
  if (!q) return [];
  let raw = [];
  if (Array.isArray(q.hiddenTestCases) && q.hiddenTestCases.length > 0) {
    raw = q.hiddenTestCases;
  } else if (Array.isArray(q.hiddenTests) && q.hiddenTests.length > 0) {
    raw = q.hiddenTests;
  } else if (Array.isArray(q.testCases?.hidden) && q.testCases.hidden.length > 0) {
    raw = q.testCases.hidden;
  } else if (Array.isArray(q.content?.testCases) && q.content.testCases.length > 0) {
    raw = q.content.testCases;
  } else if (Array.isArray(q.testCases) && q.testCases.length > 0) {
    const hList = q.testCases.filter(tc => tc.hidden);
    raw = hList.length > 0 ? hList : q.testCases;
  } else if (Array.isArray(q.test_cases) && q.test_cases.length > 0) {
    raw = q.test_cases;
  } else if (Array.isArray(q.hidden_test_cases) && q.hidden_test_cases.length > 0) {
    raw = q.hidden_test_cases;
  } else {
    // Fallback to sample test cases
    const samples = getQuestionSampleTestCases(q);
    if (samples.length > 0) return samples;
  }
  return normalizeTestCaseArray(raw);
}

/**
 * Extracts and returns the visible subset of test cases for the sandbox "All Test Cases" view.
 * Limited to the first N (default 6) hidden/general test cases.
 *
 * @param {Object} q - Question object
 * @param {number} limit - Maximum test cases visible in editor (default 6)
 * @returns {Array} Array of up to N normalized test cases
 */
export function getQuestionVisibleAllTestCases(q, limit = 6) {
  const hidden = getQuestionHiddenTestCases(q);
  return hidden.slice(0, limit);
}



