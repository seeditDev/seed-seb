import alasql from 'alasql';

/**
 * SQL Execution Sandbox for SEED-SEB Candidate Assessment.
 * Executes untrusted candidate SQL against an isolated in-memory database.
 */

const BLOCKED_KEYWORDS = [
  'ATTACH',
  'DETACH',
  'REQUIRE',
  'PROCESS.',
  'GLOBAL',
  'WINDOW.',
  'EVAL',
  'FUNCTION',
];

/**
 * Executes a student SQL query against an isolated dataset.
 *
 * @param {Array} tables - Array of SQLTableDef { tableName, columns, sampleData }
 * @param {string} queryText - The candidate's raw SQL query
 * @param {object} options - Optional execution parameters (timeoutMs, readOnly)
 * @returns {object} { success, columns, rows, rowCount, executionTimeMs, error }
 */
export function executeStudentQuery(tables = [], queryText = '', options = {}) {
  const startTime = performance.now();
  const { timeoutMs = 3000, readOnly = true } = options;

  if (!queryText || !queryText.trim()) {
    return {
      success: false,
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
      error: 'Query text cannot be empty',
    };
  }

  const upper = queryText.toUpperCase().trim();

  // 1. Block command injection attempts
  for (const kw of BLOCKED_KEYWORDS) {
    if (upper.includes(kw)) {
      return {
        success: false,
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: 0,
        error: `Security exception: Command "${kw}" is not permitted.`,
      };
    }
  }

  // 2. Read-only enforcement for SELECT assessment tasks
  if (readOnly) {
    const destructive = ['DROP ', 'ALTER ', 'TRUNCATE ', 'DELETE ', 'UPDATE ', 'INSERT '];
    for (const d of destructive) {
      if (upper.startsWith(d) || upper.includes(`;${d}`) || upper.includes(`;\n${d}`)) {
        return {
          success: false,
          columns: [],
          rows: [],
          rowCount: 0,
          executionTimeMs: 0,
          error: 'DDL and data mutation statements (INSERT, UPDATE, DELETE, DROP, ALTER) are not allowed in this query challenge.',
        };
      }
    }
  }

  const dbId = `candidate_run_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

  try {
    // Create completely isolated temporary database
    alasql(`CREATE DATABASE ${dbId}; USE ${dbId};`);

    // Build tables and seed data
    for (const tbl of tables) {
      if (!tbl || !tbl.tableName) continue;
      const colDefs = (tbl.columns || []).map((c) => {
        let def = `\`${c.name}\` ${c.type || 'TEXT'}`;
        if (c.isPrimaryKey) def += ' PRIMARY KEY';
        return def;
      });

      const createSql = `CREATE TABLE \`${tbl.tableName}\` (${colDefs.length > 0 ? colDefs.join(', ') : 'id INT'});`;
      alasql(createSql);

      if (Array.isArray(tbl.sampleData) && tbl.sampleData.length > 0) {
        alasql(`INSERT INTO \`${tbl.tableName}\` VALUES ?`, [tbl.sampleData]);
      }
    }

    // Execute candidate query
    const rawResult = alasql(queryText);
    const executionTimeMs = Math.round(performance.now() - startTime);

    // Drop temporary database
    alasql(`DROP DATABASE ${dbId};`);

    if (executionTimeMs > timeoutMs) {
      return {
        success: false,
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs,
        error: `Query execution timed out (${executionTimeMs}ms > ${timeoutMs}ms limit). Check for accidental cartesian products.`,
      };
    }

    // Scalar result (e.g. SELECT 1+1 or SELECT count(*))
    if (!rawResult || !Array.isArray(rawResult)) {
      return {
        success: true,
        columns: ['result'],
        rows: [[rawResult]],
        rowCount: 1,
        executionTimeMs,
      };
    }

    if (rawResult.length === 0) {
      return {
        success: true,
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs,
      };
    }

    const firstRow = rawResult[0] || {};
    const columns = Object.keys(firstRow);
    const rows = rawResult.map((row) => columns.map((c) => row[c]));

    return {
      success: true,
      columns,
      rows,
      rowCount: rows.length,
      executionTimeMs,
    };
  } catch (err) {
    try {
      alasql(`DROP DATABASE IF EXISTS ${dbId};`);
    } catch (_) {}

    const executionTimeMs = Math.round(performance.now() - startTime);
    return {
      success: false,
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs,
      error: err?.message || String(err),
    };
  }
}
