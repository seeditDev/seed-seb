import alasqlEngine from 'alasql';

const alasql = (alasqlEngine && alasqlEngine.default) ? alasqlEngine.default : alasqlEngine;

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

  // Enable case-insensitive table and column matching
  if (alasql && alasql.options) {
    alasql.options.casesensitive = false;
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
        // Coerce numbers stored as strings so comparisons and numeric operators work accurately
        const cleanSampleData = tbl.sampleData.map((row) => {
          if (!row || typeof row !== 'object') return row;
          const cleanRow = {};
          for (const [k, v] of Object.entries(row)) {
            const colDef = (tbl.columns || []).find(
              (c) => c.name && c.name.toLowerCase() === k.toLowerCase()
            );
            const isNum =
              colDef &&
              ['INTEGER', 'NUMERIC', 'REAL', 'INT', 'FLOAT', 'DOUBLE', 'NUMBER'].includes(
                String(colDef.type).toUpperCase()
              );
            if (isNum && typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) {
              cleanRow[k] = Number(v);
            } else {
              cleanRow[k] = v;
            }
          }
          return cleanRow;
        });

        try {
          alasql(`INSERT INTO \`${tbl.tableName}\` SELECT * FROM ?`, [cleanSampleData]);
        } catch (_) {
          // Direct fallback into AlaSQL database table definition
          const targetDb =
            alasql.databases?.[dbId] ||
            alasql.databases?.[alasql.useid];
          if (targetDb?.tables?.[tbl.tableName]) {
            targetDb.tables[tbl.tableName].data = JSON.parse(
              JSON.stringify(cleanSampleData)
            );
          }
        }
      }
    }

    // Execute candidate query
    const rawResult = alasql(queryText.trim());
    const executionTimeMs = Math.round(performance.now() - startTime);

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

    // Multi-statement handling (if query contains comments, multiple selects or trailing ;)
    let finalResult = rawResult;
    if (
      Array.isArray(rawResult) &&
      rawResult.length > 0 &&
      Array.isArray(rawResult[rawResult.length - 1]) &&
      !('0' in rawResult[rawResult.length - 1] && typeof rawResult[rawResult.length - 1] === 'object' && !Array.isArray(rawResult[rawResult.length - 1]))
    ) {
      finalResult = rawResult[rawResult.length - 1];
    }

    // Scalar result (e.g. SELECT 1+1 or SELECT count(*))
    if (!finalResult || !Array.isArray(finalResult)) {
      return {
        success: true,
        columns: ['result'],
        rows: [[finalResult]],
        rowCount: 1,
        executionTimeMs,
      };
    }

    if (finalResult.length === 0) {
      return {
        success: true,
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs,
      };
    }

    // Extract all unique columns across rows to avoid missing keys
    const columns = Array.from(
      new Set(finalResult.flatMap((r) => (r && typeof r === 'object' ? Object.keys(r) : [])))
    );
    const rows = finalResult.map((row) =>
      columns.map((c) => (row && typeof row === 'object' ? (row[c] ?? null) : null))
    );

    return {
      success: true,
      columns,
      rows,
      rowCount: rows.length,
      executionTimeMs,
    };
  } catch (err) {
    const executionTimeMs = Math.round(performance.now() - startTime);
    return {
      success: false,
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs,
      error: err?.message || String(err),
    };
  } finally {
    try {
      alasql(`DROP DATABASE IF EXISTS ${dbId};`);
    } catch (_) {}
  }
}
