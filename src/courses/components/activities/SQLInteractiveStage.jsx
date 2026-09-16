import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { 
  FaDatabase, FaUndo, FaCheckCircle, 
  FaCircle, FaLightbulb, FaCheck, FaExclamationCircle, 
  FaTable, FaChevronDown, FaChevronUp, FaClock,
  FaSun, FaMoon, FaBolt 
} from 'react-icons/fa';
import { remeasureMonacoFonts } from '../../../utils/monacoFontFix';
import { 
  createDatabase, 
  getTables, 
  getTablePreview, 
  executeQuery, 
  compareResults 
} from '../../services/sqlExecutionService';
import { toast } from 'sonner';
import '../../styles/SQLInteractiveStage.css';

const SQLInteractiveStage = ({
  exercise,
  onComplete,
  onNextLesson,
  initialQuery = 'SELECT * FROM movies;'
}) => {
  const [db, setDb] = useState(null);
  const [dbReady, setDbReady] = useState(false);
  const [tables, setTables] = useState([]);
  const [activeTable, setActiveTable] = useState('');
  const [tablePreview, setTablePreview] = useState(null);
  const [showDataset, setShowDataset] = useState(true);

  // Editor state
  const [query, setQuery] = useState(() => exercise?.defaultQuery || initialQuery);
  const queryRef = useRef(query);
  queryRef.current = query;
  const userHasEditedRef = useRef(false);

  const [queryResult, setQueryResult] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // Tasks progress state
  const tasks = useMemo(() => exercise?.tasks || [], [exercise?.tasks]);
  const [taskProgress, setTaskProgress] = useState(() => {
    return tasks.map((_, idx) => ({ id: idx, completed: false }));
  });

  // Reset exercise state whenever exercise definition changes (prevents completion leaking between topics)
  useEffect(() => {
    userHasEditedRef.current = false;
    setTaskProgress(tasks.map((_, idx) => ({ id: idx, completed: false })));
    setQuery(exercise?.defaultQuery || initialQuery);
    setQueryResult(null);
    setActiveSolutionIdx(null);
  }, [exercise, tasks, initialQuery]);

  const [activeSolutionIdx, setActiveSolutionIdx] = useState(null);

  // Editor Theme State: 'vs-dark' (Dark) | 'vs' (Light)
  const [editorTheme, setEditorTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('sql_editor_theme');
      if (saved === 'vs' || saved === 'vs-dark') return saved;
      const portalTheme = localStorage.getItem('portal_theme');
      if (portalTheme && ['light', 'red-light', 'bw'].includes(portalTheme)) {
        return 'vs';
      }
    } catch (e) {}
    return 'vs-dark';
  });

  const handleToggleTheme = () => {
    setEditorTheme((prev) => {
      const next = prev === 'vs-dark' ? 'vs' : 'vs-dark';
      try {
        localStorage.setItem('sql_editor_theme', next);
      } catch (e) {}
      return next;
    });
  };

  // Initialize in-memory SQLite database
  const initDb = useCallback(async () => {
    setDbReady(false);
    try {
      const database = await createDatabase(exercise?.schemaSql || '', exercise?.seedSql || '');
      setDb(database);
      const userTables = getTables(database);
      setTables(userTables);
      if (userTables.length > 0) {
        const defaultTable = exercise?.defaultTable || userTables[0];
        setActiveTable(defaultTable);
        setTablePreview(getTablePreview(database, defaultTable));
      }
      setDbReady(true);
      return database;
    } catch (err) {
      console.error('[SQLInteractiveStage] Failed to initialize SQLite database:', err);
      toast.error('Failed to initialize SQLite engine. Please refresh.');
      return null;
    }
  }, [exercise?.schemaSql, exercise?.seedSql, exercise?.defaultTable]);

  useEffect(() => {
    initDb();
  }, [initDb]);

  // Update table preview when active tab changes
  useEffect(() => {
    if (db && activeTable) {
      setTablePreview(getTablePreview(db, activeTable));
    }
  }, [db, activeTable]);

  // Execute Query & Validate Tasks
  const handleRunQuery = useCallback((userQuery, validateTasks = true) => {
    const q = userQuery !== undefined ? userQuery : queryRef.current;
    if (!db || !dbReady) return;
    setIsExecuting(true);

    const result = executeQuery(db, q);
    setQueryResult(result);

    // Validate against each task only when validateTasks is true (e.g. user writes/edits query)
    if (validateTasks && result.success && tasks.length > 0) {
      setTaskProgress(prevProgress => {
        let anyNewlySolved = false;
        const updated = prevProgress.map((tp, idx) => {
          if (tp.completed) return tp; // Already completed

          const targetTask = tasks[idx];
          if (!targetTask?.expectedQuery) return tp;

          // Run expected reference query
          const expRes = executeQuery(db, targetTask.expectedQuery);
          const isMatch = compareResults(result, expRes, {
            orderSensitive: Boolean(targetTask.orderSensitive)
          });

          if (isMatch) {
            anyNewlySolved = true;
            return { ...tp, completed: true };
          }
          return tp;
        });

        if (anyNewlySolved) {
          toast.success('Task objective completed!', { id: 'sql-task-pass' });
        }

        const allSolved = updated.every(t => t.completed);
        if (allSolved && !prevProgress.every(t => t.completed)) {
          toast.success('All tasks passed! Topic objective completed. Click "Next Lesson →" to continue.', { duration: 4500 });
          onComplete?.('sqlPassed');
        }

        return updated;
      });
    }

    setIsExecuting(false);
  }, [db, dbReady, tasks, onComplete]);

  // Keyboard shortcut handler for Monaco Editor (Ctrl+Enter / Cmd+Enter)
  const handleEditorDidMount = useCallback((editor, monaco) => {
    remeasureMonacoFonts(monaco, editor);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      userHasEditedRef.current = true;
      handleRunQuery(queryRef.current, true);
    });
  }, [handleRunQuery]);

  // Debounced auto-execution on query change (real-time reactive evaluation as user writes query)
  useEffect(() => {
    if (!dbReady || !db || !query?.trim()) return;
    const timer = setTimeout(() => {
      handleRunQuery(query, userHasEditedRef.current);
    }, 350);
    return () => clearTimeout(timer);
  }, [query, dbReady, db, handleRunQuery]);

  // Run initial query once when DB is first ready (for table preview only, without auto-validating tasks)
  useEffect(() => {
    if (dbReady && db && query) {
      handleRunQuery(query, false);
    }
  }, [dbReady]);

  // Reset database back to seed state
  const handleResetDatabase = async () => {
    const database = await initDb();
    if (database) {
      const resetQuery = exercise?.defaultQuery || 'SELECT * FROM movies;';
      setQuery(resetQuery);
      setTaskProgress(tasks.map((_, idx) => ({ id: idx, completed: false })));
      toast.info('Database restored to initial state.');
      setTimeout(() => {
        const res = executeQuery(database, resetQuery);
        setQueryResult(res);
      }, 50);
    }
  };

  const allTasksCompleted = useMemo(() => {
    return taskProgress.length > 0 && taskProgress.every(t => t.completed);
  }, [taskProgress]);

  const solvedCount = useMemo(() => {
    return taskProgress.filter(t => t.completed).length;
  }, [taskProgress]);

  return (
    <div className="sql-stage-container">
      {/* 1. TOP DATASET VIEWER */}
      <section className="sql-dataset-panel">
        <div className="dataset-header-row" onClick={() => setShowDataset(prev => !prev)}>
          <div className="dataset-title-group">
            <FaTable className="dataset-icon" />
            <span className="dataset-heading">Database Tables &amp; Sample Data</span>
            <span className="dataset-count-badge">{tables.length} {tables.length === 1 ? 'Table' : 'Tables'}</span>
          </div>

          <div className="dataset-header-actions" onClick={e => e.stopPropagation()}>
            {tables.map(tName => (
              <button
                key={tName}
                type="button"
                className={`table-tab-pill ${activeTable === tName ? 'active' : ''}`}
                onClick={() => setActiveTable(tName)}
              >
                <FaDatabase style={{ fontSize: '10px' }} />
                <span>{tName}</span>
              </button>
            ))}
            <button 
              type="button" 
              className="dataset-toggle-btn"
              onClick={() => setShowDataset(prev => !prev)}
              title={showDataset ? 'Collapse Dataset' : 'Expand Dataset'}
            >
              {showDataset ? <FaChevronUp /> : <FaChevronDown />}
            </button>
          </div>
        </div>

        {showDataset && tablePreview && (
          <div className="dataset-table-scroll-wrapper">
            <table className="sql-data-table">
              <thead>
                <tr>
                  {tablePreview.columns.map((col, cIdx) => (
                    <th key={cIdx}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tablePreview.rows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx}>{cell === null ? <span className="null-val">NULL</span> : String(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 2. SPLIT WORKSPACE: TASKS (LEFT) & SQL WORKBENCH (RIGHT) */}
      <div className="sql-workspace-grid">
        {/* LEFT COLUMN: EXERCISE TASKS */}
        <aside className="sql-tasks-column">
          <div className="tasks-header-card">
            <div className="tasks-title-row">
              <h3>Exercise Tasks</h3>
              <span className={`tasks-completion-badge ${allTasksCompleted ? 'complete' : ''}`}>
                {solvedCount} of {tasks.length} Completed
              </span>
            </div>
            <p className="tasks-hint-text">
              ⚡ Write your SQL query on the right. Your query executes in real-time as you type — matching the required task outputs will automatically check them off and complete this topic!
            </p>
          </div>

          <div className="tasks-list-stack">
            {tasks.map((task, idx) => {
              const isDone = taskProgress[idx]?.completed;
              return (
                <div 
                  key={idx} 
                  className={`task-card-item ${isDone ? 'done' : ''}`}
                >
                  <div className="task-indicator-col">
                    {isDone ? (
                      <FaCheckCircle className="task-done-icon" />
                    ) : (
                      <FaCircle className="task-pending-icon" />
                    )}
                  </div>
                  <div className="task-content-col">
                    <span className="task-number">Task {idx + 1}</span>
                    <p className="task-instruction">{task.instruction}</p>
                    
                    {task.solution && (
                      <div className="task-solution-box">
                        <button
                          type="button"
                          className="toggle-solution-btn"
                          onClick={() => setActiveSolutionIdx(activeSolutionIdx === idx ? null : idx)}
                        >
                          <FaLightbulb /> {activeSolutionIdx === idx ? 'Hide Solution' : 'View Solution'}
                        </button>
                        {activeSolutionIdx === idx && (
                          <pre className="solution-code-snippet">{task.solution}</pre>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="tasks-footer-actions">
            <button
              type="button"
              className={`continue-lesson-btn ${allTasksCompleted ? 'unlocked' : 'locked'}`}
              disabled={!allTasksCompleted}
              onClick={onNextLesson}
            >
              {allTasksCompleted ? (
                <>Next Lesson <FaCheck style={{ marginLeft: '6px' }} /></>
              ) : (
                <>Complete All Tasks to Unlock Next Lesson</>
              )}
            </button>
          </div>
        </aside>

        {/* RIGHT COLUMN: MONACO SQL EDITOR & LIVE RESULT GRID */}
        <main className="sql-editor-column">
          <div className="editor-workbench-card">
            <div className="workbench-toolbar">
              <div className="toolbar-left">
                <span className="lang-badge">
                  <FaDatabase /> SQL Editor
                </span>
              </div>

              <div className="toolbar-right">
                <div className="live-eval-pill" title="Queries execute automatically in real-time as you write">
                  <FaBolt className="live-bolt-icon" />
                  <span>Auto-Evaluating</span>
                </div>
                <button
                  type="button"
                  className={`wb-action-btn theme-toggle ${editorTheme === 'vs-dark' ? 'dark' : 'light'}`}
                  onClick={handleToggleTheme}
                  title={`Switch to ${editorTheme === 'vs-dark' ? 'Light' : 'Dark'} Mode`}
                  aria-label="Toggle editor theme"
                >
                  {editorTheme === 'vs-dark' ? (
                    <>
                      <FaSun className="theme-toggle-icon sun" />
                      <span>Light</span>
                    </>
                  ) : (
                    <>
                      <FaMoon className="theme-toggle-icon moon" />
                      <span>Dark</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="wb-action-btn reset"
                  onClick={handleResetDatabase}
                  title="Reset database tables and code"
                >
                  <FaUndo /> Reset
                </button>
              </div>
            </div>

            {/* Monaco SQL Editor */}
            <div className={`monaco-sql-wrapper ${editorTheme === 'vs-dark' ? 'theme-dark' : 'theme-light'}`}>
              <Editor
                height="190px"
                language="sql"
                theme={editorTheme}
                value={query}
                onMount={handleEditorDidMount}
                onChange={(val) => {
                  userHasEditedRef.current = true;
                  setQuery(val || '');
                }}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13.5,
                  fontFamily: "'Fira Code', 'Consolas', monospace",
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  wordWrap: 'on',
                  padding: { top: 12, bottom: 12 }
                }}
              />
            </div>
          </div>

          {/* LIVE QUERY OUTPUT RESULTS TABLE */}
          <div className="query-output-card">
            <div className="output-status-bar">
              {queryResult?.success ? (
                <div className="output-meta-pill success">
                  <span className="meta-dot green" />
                  <span>{queryResult.count} {queryResult.count === 1 ? 'Row' : 'Rows'} returned</span>
                  <span className="meta-divider">•</span>
                  <span className="meta-time"><FaClock style={{ marginRight: '4px' }} />{queryResult.executionTimeMs} ms</span>
                </div>
              ) : queryResult?.error ? (
                <div className="output-meta-pill error">
                  <FaExclamationCircle />
                  <span>SQL Error: {queryResult.error}</span>
                </div>
              ) : (
                <div className="output-meta-pill idle">
                  <FaBolt style={{ color: '#10b981', marginRight: '4px' }} />
                  <span>Type your SQL statement in the editor to view live results</span>
                </div>
              )}
            </div>

            {queryResult?.success && queryResult.columns.length > 0 ? (
              <div className="output-table-scroll-box">
                <table className="sql-data-table output-view">
                  <thead>
                    <tr>
                      {queryResult.columns.map((col, cIdx) => (
                        <th key={cIdx}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {queryResult.rows.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {row.map((cell, cIdx) => (
                          <td key={cIdx}>{cell === null ? <span className="null-val">NULL</span> : String(cell)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : queryResult?.success && queryResult.columns.length === 0 ? (
              <div className="empty-results-notice">
                {queryResult.message || 'Statement executed successfully. No result rows returned.'}
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
};

export default SQLInteractiveStage;
