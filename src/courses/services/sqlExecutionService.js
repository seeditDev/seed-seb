import initSqlJs from 'sql.js';

let sqlPromise = null;

/**
 * Initializes and caches the SQLite WebAssembly runtime.
 * Uses the static WASM binary located at /sql-wasm.wasm in the public directory.
 */
export const initSqlEngine = async () => {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      try {
        const baseUrl = import.meta.env?.BASE_URL || '/';
        const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
        return await initSqlJs({
          locateFile: (file) => `${cleanBase}${file}`
        });
      } catch (err) {
        console.warn('[SQLEngine] Local SQLite WASM load failed, attempting CDN fallback:', err);
        return await initSqlJs({
          locateFile: () => 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/sql-wasm.wasm'
        });
      }
    })().catch((err) => {
      console.error('[SQLEngine] Fatal error initializing SQLite runtime:', err);
      sqlPromise = null;
      throw err;
    });
  }
  return sqlPromise;
};

/**
 * Creates an isolated in-memory SQLite database populated with schema and seed data.
 */
export const createDatabase = async (schemaSql = '', seedSql = '') => {
  const SQL = await initSqlEngine();
  const db = new SQL.Database();

  if (schemaSql && schemaSql.trim()) {
    try {
      db.run(schemaSql);
    } catch (err) {
      console.error('[SQLEngine] Error applying schemaSql:', err);
    }
  }

  if (seedSql && seedSql.trim()) {
    try {
      db.run(seedSql);
    } catch (err) {
      console.error('[SQLEngine] Error applying seedSql:', err);
    }
  }

  return db;
};

/**
 * Retrieves the names of all non-system user tables in the database.
 */
export const getTables = (db) => {
  if (!db) return [];
  try {
    const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC;");
    if (res && res[0] && res[0].values) {
      return res[0].values.map(v => v[0]);
    }
  } catch (err) {
    console.error('[SQLEngine] Error fetching table list:', err);
  }
  return [];
};

/**
 * Inspects a table's schema and retrieves sample rows for preview.
 */
export const getTablePreview = (db, tableName, limit = 50) => {
  if (!db || !tableName) return { columns: [], rows: [], count: 0 };
  try {
    const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, '');
    const countRes = db.exec(`SELECT COUNT(*) FROM "${safeTable}";`);
    const count = (countRes && countRes[0]?.values?.[0]?.[0]) || 0;

    const dataRes = db.exec(`SELECT * FROM "${safeTable}" LIMIT ${limit};`);
    if (dataRes && dataRes[0]) {
      return {
        columns: dataRes[0].columns || [],
        rows: dataRes[0].values || [],
        count
      };
    }
  } catch (err) {
    console.error(`[SQLEngine] Error previewing table "${tableName}":`, err);
  }
  return { columns: [], rows: [], count: 0 };
};

/**
 * Executes a student SQL query against the provided database.
 * Returns execution metrics, column headers, rows, or formatted error messages.
 */
export const executeQuery = (db, query) => {
  if (!db) {
    return {
      success: false,
      columns: [],
      rows: [],
      count: 0,
      executionTimeMs: 0,
      error: 'SQLite database engine is not initialized.'
    };
  }

  const cleanQuery = (query || '').trim();
  if (!cleanQuery) {
    return {
      success: false,
      columns: [],
      rows: [],
      count: 0,
      executionTimeMs: 0,
      error: 'Query is empty. Please enter a valid SQL statement.'
    };
  }

  const startTime = performance.now();
  try {
    const res = db.exec(cleanQuery);
    const duration = Math.round((performance.now() - startTime) * 100) / 100;

    if (!res || res.length === 0) {
      // Mutations like UPDATE, INSERT, DELETE or empty SELECTs
      return {
        success: true,
        columns: [],
        rows: [],
        count: 0,
        executionTimeMs: duration,
        error: null,
        message: 'Query executed successfully with 0 rows returned.'
      };
    }

    const latest = res[res.length - 1];
    return {
      success: true,
      columns: latest.columns || [],
      rows: latest.values || [],
      count: (latest.values || []).length,
      executionTimeMs: duration,
      error: null
    };
  } catch (err) {
    const duration = Math.round((performance.now() - startTime) * 100) / 100;
    return {
      success: false,
      columns: [],
      rows: [],
      count: 0,
      executionTimeMs: duration,
      error: err.message || 'SQL syntax error.'
    };
  }
};

/**
 * Normalizes cell values for resilient comparison (trims strings, handles numbers and nulls).
 */
const normalizeCellValue = (val) => {
  if (val === null || val === undefined) return '__NULL__';
  if (typeof val === 'number') return Number(val.toFixed(4));
  if (typeof val === 'string') return val.trim();
  return String(val);
};

/**
 * Compares two SQL execution result sets.
 * Does NOT compare SQL query strings — compares columns, values, and order.
 */
export const compareResults = (actual, expected, options = {}) => {
  const { orderSensitive = false } = options;

  if (!actual || !expected) return false;
  if (!actual.success || !expected.success) return false;

  // 1. Column count must match
  if (actual.columns.length !== expected.columns.length) return false;

  // 2. Column names (case-insensitive, trimmed)
  const actualCols = actual.columns.map(c => String(c).trim().toLowerCase());
  const expectedCols = expected.columns.map(c => String(c).trim().toLowerCase());
  const colsMatch = actualCols.every((col, idx) => col === expectedCols[idx]);
  if (!colsMatch) return false;

  // 3. Row count must match
  if (actual.rows.length !== expected.rows.length) return false;

  // 4. Row content verification
  if (orderSensitive) {
    for (let r = 0; r < expected.rows.length; r++) {
      const actRow = actual.rows[r];
      const expRow = expected.rows[r];
      for (let c = 0; c < expected.columns.length; c++) {
        if (normalizeCellValue(actRow[c]) !== normalizeCellValue(expRow[c])) {
          return false;
        }
      }
    }
    return true;
  }

  // Set-based row comparison (order-independent)
  const serializeRow = (row) => row.map(normalizeCellValue).join('|||');
  const expectedRowCounts = new Map();
  for (const row of expected.rows) {
    const key = serializeRow(row);
    expectedRowCounts.set(key, (expectedRowCounts.get(key) || 0) + 1);
  }

  for (const row of actual.rows) {
    const key = serializeRow(row);
    const count = expectedRowCounts.get(key);
    if (!count || count <= 0) return false;
    expectedRowCounts.set(key, count - 1);
  }

  return true;
};

/**
 * Evaluates a student query against an expected reference query.
 */
export const evaluateTask = (db, studentQuery, expectedQuery, options = {}) => {
  const actualResult = executeQuery(db, studentQuery);
  if (!actualResult.success) {
    return {
      passed: false,
      actual: actualResult,
      expected: null,
      error: actualResult.error
    };
  }

  const expectedResult = executeQuery(db, expectedQuery);
  if (!expectedResult.success) {
    console.error('[SQLEngine] Failed to run reference expected query:', expectedQuery, expectedResult.error);
    return {
      passed: false,
      actual: actualResult,
      expected: expectedResult,
      error: 'Internal reference query error'
    };
  }

  const passed = compareResults(actualResult, expectedResult, options);
  return {
    passed,
    actual: actualResult,
    expected: expectedResult,
    error: null
  };
};

export default {
  initSqlEngine,
  createDatabase,
  getTables,
  getTablePreview,
  executeQuery,
  compareResults,
  evaluateTask
};
