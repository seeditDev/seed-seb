import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import {
  FaPlay,
  FaUndo,
  FaCheckCircle,
  FaCircle,
  FaLightbulb,
  FaCheck,
  FaExclamationCircle,
  FaSun,
  FaMoon,
  FaBolt,
  FaTerminal,
  FaDesktop,
  FaCode,
  FaRedo
} from 'react-icons/fa';
import { remeasureMonacoFonts } from '../../../utils/monacoFontFix';
import { compileReactCode, generateSandboxHtml, evaluateTasks } from '../../services/reactRuntimeService';
import { toast } from 'sonner';
import '../../styles/ReactInteractiveStage.css';

const DEFAULT_STARTER_CODE = `import React, { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>
      <h1>React Learning Lab</h1>
      <p>Current count: <strong>{count}</strong></p>
      <button 
        className="btn-primary"
        onClick={() => setCount(count + 1)}
      >
        Increment
      </button>
    </div>
  );
}
`;

const ReactInteractiveStage = ({
  exercise,
  onComplete,
  onNextLesson,
  initialCode = ''
}) => {
  const defaultCode = exercise?.defaultCode || initialCode || DEFAULT_STARTER_CODE;

  // Editor code state
  const [code, setCode] = useState(defaultCode);
  const codeRef = useRef(code);
  codeRef.current = code;
  const userHasEditedRef = useRef(false);

  // Compilation & Sandbox state
  const [compileError, setCompileError] = useState(null);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('preview'); // 'preview' | 'console' | 'tests'
  const iframeRef = useRef(null);

  // Tasks progress state
  const tasks = useMemo(() => exercise?.tasks || [], [exercise?.tasks]);
  const [taskProgress, setTaskProgress] = useState(() => {
    return tasks.map((t, idx) => ({
      id: t.id !== undefined ? t.id : idx,
      completed: false,
      message: ''
    }));
  });

  const [activeSolutionIdx, setActiveSolutionIdx] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // Editor Theme State: 'vs-dark' (Dark) | 'vs' (Light)
  const [editorTheme, setEditorTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('react_editor_theme');
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
        localStorage.setItem('react_editor_theme', next);
      } catch (e) {}
      return next;
    });
  };

  // Reset stage whenever exercise changes
  useEffect(() => {
    userHasEditedRef.current = false;
    const initial = exercise?.defaultCode || initialCode || DEFAULT_STARTER_CODE;
    setCode(initial);
    codeRef.current = initial;
    setCompileError(null);
    setConsoleLogs([]);
    setActiveSolutionIdx(null);
    setTaskProgress(tasks.map((t, idx) => ({
      id: t.id !== undefined ? t.id : idx,
      completed: false,
      message: ''
    })));
  }, [exercise, tasks, initialCode]);

  // Handle messages from the sandboxed iframe (console interception)
  useEffect(() => {
    const handleWindowMessage = (event) => {
      if (event.data && event.data.type === 'SEED_CONSOLE') {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setConsoleLogs((prev) => [
          ...prev.slice(-99),
          { level: event.data.level, text: event.data.text, time }
        ]);
      }
    };

    window.addEventListener('message', handleWindowMessage);
    return () => window.removeEventListener('message', handleWindowMessage);
  }, []);

  // Run Compilation, inject into IFrame & Evaluate Tasks
  const handleRunCode = useCallback(async (currentCode, validate = true) => {
    const targetCode = currentCode !== undefined ? currentCode : codeRef.current;
    setIsExecuting(true);
    setCompileError(null);
    if (validate) {
      userHasEditedRef.current = true;
    }

    // 1. Transpile JSX with Sucrase
    const compileResult = compileReactCode(targetCode);
    if (!compileResult.success) {
      setCompileError(compileResult.error);
      setIsExecuting(false);
      return;
    }

    // 2. Generate HTML & inject into iframe
    if (iframeRef.current) {
      const htmlPayload = generateSandboxHtml({
        compiledJs: compileResult.code,
        appIdentifier: compileResult.appIdentifier,
        css: exercise?.css || ''
      });

      iframeRef.current.srcdoc = htmlPayload;
    }

    // 3. Evaluate tasks once iframe has loaded
    if (validate && tasks.length > 0) {
      // Wait for iframe DOM render
      await new Promise((res) => setTimeout(res, 200));

      try {
        const evalResults = await evaluateTasks(tasks, targetCode, iframeRef.current);
        let anyNewlySolved = false;

        setTaskProgress((prev) => {
          const updated = prev.map((tp, idx) => {
            const result = evalResults[idx];
            if (!result) return tp;

            if (result.passed && !tp.completed) {
              anyNewlySolved = true;
            }

            return {
              ...tp,
              completed: result.passed,
              message: result.message
            };
          });

          if (anyNewlySolved) {
            toast.success('Task requirement passed!', { id: 'react-task-pass' });
          }

          const allDone = updated.every((t) => t.completed);
          if (allDone && !prev.every((t) => t.completed)) {
            toast.success('All tasks passed! Topic completed. Click "Next Lesson →" to continue.', { duration: 4500 });
            onComplete?.('reactPassed');
          }

          return updated;
        });
      } catch (e) {
        console.warn('[ReactInteractiveStage] Evaluation error:', e);
      }
    }

    setIsExecuting(false);
  }, [tasks, exercise?.css, onComplete]);

  // Initial preview on mount / exercise change (preview only, tasks verified when user runs)
  useEffect(() => {
    if (code?.trim()) {
      handleRunCode(code, false);
    }
  }, [exercise]);

  // Keyboard shortcut Ctrl+Enter / Cmd+Enter
  const handleEditorDidMount = useCallback((editor, monaco) => {
    remeasureMonacoFonts(monaco, editor);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      userHasEditedRef.current = true;
      handleRunCode(codeRef.current, true);
    });
  }, [handleRunCode]);

  // Reset code back to default
  const handleReset = () => {
    const initial = exercise?.defaultCode || initialCode || DEFAULT_STARTER_CODE;
    setCode(initial);
    codeRef.current = initial;
    userHasEditedRef.current = false;
    setTaskProgress(tasks.map((t, idx) => ({
      id: t.id !== undefined ? t.id : idx,
      completed: false,
      message: ''
    })));
    toast.info('Code restored to initial exercise starter.');
    handleRunCode(initial, false);
  };

  const allTasksCompleted = useMemo(() => {
    return taskProgress.length > 0 && taskProgress.every((t) => t.completed);
  }, [taskProgress]);

  const solvedCount = useMemo(() => {
    return taskProgress.filter((t) => t.completed).length;
  }, [taskProgress]);

  return (
    <div className="react-stage-container">
      {/* 1. TOP CONCEPT / EXERCISE HEADER BANNER */}
      {exercise && (
        <section className="react-exercise-banner">
          <div className="exercise-meta-row">
            <div className="badge-group">
              <span className="react-tag-badge">
                <FaCode style={{ marginRight: '6px' }} />
                {exercise.category || 'React Interactive Lab'}
              </span>
              {exercise.difficulty && (
                <span className={`difficulty-badge ${exercise.difficulty.toLowerCase()}`}>
                  {exercise.difficulty}
                </span>
              )}
            </div>
            <div className="exercise-progress-counter">
              <span className={`counter-pill ${allTasksCompleted ? 'complete' : ''}`}>
                {solvedCount} of {tasks.length} Tasks Solved
              </span>
            </div>
          </div>
          <h2 className="exercise-title">{exercise.title || 'Interactive Component Exercise'}</h2>
          {exercise.description && (
            <p className="exercise-desc">{exercise.description}</p>
          )}
        </section>
      )}

      {/* 2. SPLIT WORKSPACE: TASKS & INSTRUCTIONS (LEFT) + WORKBENCH & PREVIEW (RIGHT) */}
      <div className="react-workspace-grid">
        {/* LEFT COLUMN: TASKS CHECKLIST & GUIDANCE */}
        <aside className="react-tasks-column">
          <div className="tasks-header-card">
            <div className="tasks-title-row">
              <h3>Exercise Objectives</h3>
              <span className={`tasks-completion-badge ${allTasksCompleted ? 'complete' : ''}`}>
                {allTasksCompleted ? 'All Passed ✓' : `${solvedCount} / ${tasks.length}`}
              </span>
            </div>
            <p className="tasks-hint-text">
              ⚡ Write your code in the editor, then click <strong>Run &amp; Test</strong> (or press <code>Ctrl+Enter</code>) to view the preview and verify your objectives.
            </p>
          </div>

          <div className="tasks-list-stack">
            {tasks.map((task, idx) => {
              const tp = taskProgress[idx];
              const isDone = tp?.completed;
              const hasError = !isDone && userHasEditedRef.current && tp?.message && tp?.message !== 'Passed';

              return (
                <div key={idx} className={`task-card-item ${isDone ? 'done' : ''} ${hasError ? 'failed' : ''}`}>
                  <div className="task-indicator-col">
                    {isDone ? (
                      <FaCheckCircle className="task-done-icon" />
                    ) : (
                      <FaCircle className="task-pending-icon" />
                    )}
                  </div>

                  <div className="task-content-col">
                    <div className="task-top-bar">
                      <span className="task-number">Task {idx + 1}</span>
                      {isDone && <span className="task-status-tag passed">Passed</span>}
                    </div>
                    <p className="task-instruction">{task.instruction}</p>

                    {hasError && (
                      <div className="task-fail-hint">
                        <FaExclamationCircle className="fail-icon" />
                        <span>{tp.message}</span>
                      </div>
                    )}

                    {task.solution && (
                      <div className="task-solution-box">
                        <button
                          type="button"
                          className="toggle-solution-btn"
                          onClick={() => setActiveSolutionIdx(activeSolutionIdx === idx ? null : idx)}
                        >
                          <FaLightbulb /> {activeSolutionIdx === idx ? 'Hide Hint / Solution' : 'View Hint / Solution'}
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

          {/* Solution toggle for the entire component if provided */}
          {exercise?.solution && (
            <div className="full-solution-card">
              <button
                type="button"
                className="btn-outline-solution"
                onClick={() => setActiveSolutionIdx(activeSolutionIdx === 'full' ? null : 'full')}
              >
                <FaLightbulb /> {activeSolutionIdx === 'full' ? 'Hide Complete Solution' : 'Reveal Complete Reference Solution'}
              </button>
              {activeSolutionIdx === 'full' && (
                <pre className="full-solution-snippet">{exercise.solution}</pre>
              )}
            </div>
          )}

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

        {/* RIGHT COLUMN: MONACO REACT EDITOR & SANDBOX PREVIEW */}
        <main className="react-editor-column">
          {/* Editor Card */}
          <div className="editor-workbench-card">
            <div className="workbench-toolbar">
              <div className="toolbar-left">
                <span className="lang-badge">
                  <FaCode /> App.jsx
                </span>
                <span className="framework-badge">React 18</span>
              </div>

              <div className="toolbar-right">
                <div className="live-eval-pill" title="Live JSX compilation in milliseconds">
                  <FaBolt className="live-bolt-icon" />
                  <span>Live Sandbox</span>
                </div>

                <button
                  type="button"
                  className={`wb-action-btn theme-toggle ${editorTheme === 'vs-dark' ? 'dark' : 'light'}`}
                  onClick={handleToggleTheme}
                  title={`Switch to ${editorTheme === 'vs-dark' ? 'Light' : 'Dark'} Mode`}
                >
                  {editorTheme === 'vs-dark' ? (
                    <><FaSun className="theme-toggle-icon sun" /> <span>Light</span></>
                  ) : (
                    <><FaMoon className="theme-toggle-icon moon" /> <span>Dark</span></>
                  )}
                </button>

                <button
                  type="button"
                  className="wb-action-btn reset"
                  onClick={handleReset}
                  title="Reset code to starter code"
                >
                  <FaUndo /> Reset
                </button>

                <button
                  type="button"
                  className="wb-action-btn run-btn"
                  onClick={() => {
                    userHasEditedRef.current = true;
                    handleRunCode(codeRef.current, true);
                  }}
                  disabled={isExecuting}
                  title="Run and evaluate tasks (Ctrl + Enter)"
                >
                  <FaPlay style={{ fontSize: '11px' }} /> Run &amp; Test
                </button>
              </div>
            </div>

            {/* Monaco JSX Editor */}
            <div className={`monaco-editor-wrapper ${editorTheme === 'vs-dark' ? 'theme-dark' : 'theme-light'}`}>
              <Editor
                height="320px"
                language="javascript"
                theme={editorTheme}
                value={code}
                onMount={handleEditorDidMount}
                onChange={(val) => {
                  userHasEditedRef.current = true;
                  setCode(val || '');
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

          {/* Compilation Error Notice */}
          {compileError && (
            <div className="compile-error-banner">
              <FaExclamationCircle className="error-icon" />
              <div className="error-text-col">
                <strong>Syntax / Transpilation Error</strong>
                <pre>{compileError}</pre>
              </div>
            </div>
          )}

          {/* PREVIEW & CONSOLE TABS */}
          <div className="sandbox-output-card">
            <div className="output-tabs-bar">
              <div className="tabs-left">
                <button
                  type="button"
                  className={`tab-btn ${activeTab === 'preview' ? 'active' : ''}`}
                  onClick={() => setActiveTab('preview')}
                >
                  <FaDesktop /> Live Preview
                </button>
                <button
                  type="button"
                  className={`tab-btn ${activeTab === 'console' ? 'active' : ''}`}
                  onClick={() => setActiveTab('console')}
                >
                  <FaTerminal /> Console ({consoleLogs.length})
                </button>
              </div>

              <div className="tabs-right">
                {activeTab === 'console' && consoleLogs.length > 0 && (
                  <button
                    type="button"
                    className="clear-console-btn"
                    onClick={() => setConsoleLogs([])}
                  >
                    Clear
                  </button>
                )}
                {activeTab === 'preview' && (
                  <button
                    type="button"
                    className="reload-preview-btn"
                    onClick={() => handleRunCode(codeRef.current, false)}
                    title="Reload Sandbox"
                  >
                    <FaRedo /> Reload
                  </button>
                )}
              </div>
            </div>

            {/* TAB CONTENT: PREVIEW IFRAME */}
            <div className={`tab-body-preview ${activeTab === 'preview' ? 'active' : 'hidden'}`}>
              <iframe
                ref={iframeRef}
                title="React Live Preview"
                className="sandbox-iframe"
                sandbox="allow-scripts allow-modals allow-same-origin"
              />
            </div>

            {/* TAB CONTENT: CONSOLE */}
            <div className={`tab-body-console ${activeTab === 'console' ? 'active' : 'hidden'}`}>
              {consoleLogs.length === 0 ? (
                <div className="console-empty">
                  <FaTerminal className="console-empty-icon" />
                  <span>No console logs yet. Any <code>console.log()</code> output will appear here.</span>
                </div>
              ) : (
                <div className="console-log-list">
                  {consoleLogs.map((log, lIdx) => (
                    <div key={lIdx} className={`console-row ${log.level}`}>
                      <span className="log-time">{log.time}</span>
                      <span className={`log-badge ${log.level}`}>{log.level}</span>
                      <span className="log-msg">{log.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ReactInteractiveStage;
