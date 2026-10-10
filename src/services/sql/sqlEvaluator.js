/**
 * Deterministic SQL Evaluator for SEED-SEB MSA.
 * Evaluates candidate query results against expected results.
 */

function normalizeValue(val, epsilon = 0.001) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return Math.round(val / epsilon) * epsilon;
  }
  if (!isNaN(Number(val)) && typeof val === 'string' && val.trim() !== '') {
    return Math.round(Number(val) / epsilon) * epsilon;
  }
  return String(val).trim();
}

/**
 * Evaluates candidate execution results against author's expectedResult matrix.
 *
 * @param {object} actual - Result from executeStudentQuery { success, columns, rows, error }
 * @param {object} expected - Expected output { columns, rows, rowCount }
 * @param {number} maxMarks - Marks allocated to this question
 * @param {object} rules - Evaluation rules { requireOrderedRows, caseSensitiveColumns, toleranceEpsilon }
 * @returns {object} { passed, marksAwarded, maxMarks, percentage, status, feedback }
 */
export function evaluateStudentResult(actual, expected, maxMarks = 10, rules = {}) {
  if (!actual || !actual.success) {
    return {
      passed: false,
      marksAwarded: 0,
      maxMarks,
      percentage: 0,
      status: 'SYNTAX_ERROR',
      feedback: actual?.error || 'Syntax error in query execution',
    };
  }

  let expectedRows = expected?.rows;
  if (!Array.isArray(expectedRows) && typeof expected?.rowsJson === 'string') {
    try {
      expectedRows = JSON.parse(expected.rowsJson);
    } catch {
      expectedRows = [];
    }
  }

  if (!expected || !Array.isArray(expectedRows)) {
    return {
      passed: true,
      marksAwarded: maxMarks,
      maxMarks,
      percentage: 100,
      status: 'CORRECT',
      feedback: 'Query executed successfully.',
    };
  }

  expected = {
    ...expected,
    rows: expectedRows,
  };

  const {
    requireOrderedRows = false,
    caseSensitiveColumns = false,
    toleranceEpsilon = 0.001,
  } = rules;

  const actualCols = (actual.columns || []).map((c) =>
    caseSensitiveColumns ? c : c.toLowerCase()
  );
  const expectedCols = (expected.columns || []).map((c) =>
    caseSensitiveColumns ? c : c.toLowerCase()
  );

  // 1. Column count verification
  if (actualCols.length !== expectedCols.length) {
    return {
      passed: false,
      marksAwarded: 0,
      maxMarks,
      percentage: 0,
      status: 'WRONG',
      feedback: `Column count mismatch: Expected ${expectedCols.length} columns (${expectedCols.join(', ')}), but your query returned ${actualCols.length} columns (${(actual.columns || []).join(', ')}).`,
    };
  }

  // 2. Row count verification
  if (actual.rows.length !== expected.rows.length) {
    return {
      passed: false,
      marksAwarded: 0,
      maxMarks,
      percentage: 0,
      status: 'WRONG',
      feedback: `Row count mismatch: Expected ${expected.rows.length} row(s), but your query returned ${actual.rows.length} row(s).`,
    };
  }

  // 3. Row data comparison
  const normActual = actual.rows.map((row) =>
    row.map((val) => normalizeValue(val, toleranceEpsilon))
  );
  const normExpected = expected.rows.map((row) =>
    row.map((val) => normalizeValue(val, toleranceEpsilon))
  );

  if (requireOrderedRows) {
    for (let i = 0; i < normExpected.length; i++) {
      const eRow = normExpected[i];
      const aRow = normActual[i];
      for (let j = 0; j < eRow.length; j++) {
        if (eRow[j] !== aRow[j]) {
          return {
            passed: false,
            marksAwarded: 0,
            maxMarks,
            percentage: 0,
            status: 'WRONG',
            feedback: `Row ${i + 1} value mismatch at column "${expected.columns[j]}": Expected "${eRow[j]}", but got "${aRow[j]}" (Exact sequence order required).`,
          };
        }
      }
    }
  } else {
    // Unordered: multiset comparison
    const actualSerialized = normActual.map((r) => JSON.stringify(r)).sort();
    const expectedSerialized = normExpected.map((r) => JSON.stringify(r)).sort();

    for (let i = 0; i < expectedSerialized.length; i++) {
      if (actualSerialized[i] !== expectedSerialized[i]) {
        return {
          passed: false,
          marksAwarded: 0,
          maxMarks,
          percentage: 0,
          status: 'WRONG',
          feedback: 'Output records do not match the expected result set. Check filtering and join criteria.',
        };
      }
    }
  }

  return {
    passed: true,
    marksAwarded: maxMarks,
    maxMarks,
    percentage: 100,
    status: 'CORRECT',
    feedback: 'All tests passed! Correct query output.',
  };
}
