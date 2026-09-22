import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import {
  FaPlay,
  FaUndo,
  FaCheckCircle,
  FaCircle,
  FaCheck,
  FaExclamationCircle,
  FaSun,
  FaMoon,
  FaBolt,
  FaTerminal,
  FaDesktop,
  FaCode,
  FaFileCode,
  FaGithub,
  FaExternalLinkAlt,
  FaTrophy,
  FaLayerGroup,
  FaSpinner
} from 'react-icons/fa';
import { remeasureMonacoFonts } from '../../../utils/monacoFontFix';
import { compileReactCode, generateSandboxHtml, evaluateTasks } from '../../services/reactRuntimeService';
import {
  getGitHubConfig,
  connectWithGitHubOAuth,
  syncProjectToGitHub
} from '../../../services/githubSyncService';
import { toast } from 'sonner';
import '../../styles/GuidedProjectStage.css';

const GuidedProjectStage = ({
  project,
  user,
  onComplete,
  onNextLesson
}) => {
  const uid = user?.uid;
  const milestones = useMemo(() => project?.milestones || [], [project?.milestones]);

  // Current active milestone index (0-indexed)
  const [activeMilestoneIdx, setActiveMilestoneIdx] = useState(0);
  const currentMilestone = milestones[activeMilestoneIdx] || milestones[0] || {};

  // Milestone completion map: { 0: true, 1: false, ... }
  const [completedMilestones, setCompletedMilestones] = useState(() => {
    const init = {};
    milestones.forEach((_, idx) => { init[idx] = false; });
    return init;
  });

  // Project multi-file state: { 'App.jsx': '...', 'styles.css': '...' }
  const [fileContents, setFileContents] = useState(() => {
    const map = {};
    (currentMilestone?.files || []).forEach((f) => {
      map[f.name] = f.code || '';
    });
    return map;
  });

  const [activeFileName, setActiveFileName] = useState(() => {
    return currentMilestone?.files?.[0]?.name || 'App.jsx';
  });

  // When active milestone changes, populate starter files if not already edited
  useEffect(() => {
    if (!currentMilestone?.files) return;
    setFileContents((prev) => {
      const updated = { ...prev };
      currentMilestone.files.forEach((f) => {
        if (updated[f.name] === undefined) {
          updated[f.name] = f.code || '';
        }
      });
      return updated;
    });

    if (!currentMilestone.files.some((f) => f.name === activeFileName)) {
      setActiveFileName(currentMilestone.files[0]?.name || 'App.jsx');
    }
  }, [activeMilestoneIdx, currentMilestone]);

  // Editor Theme State
  const [editorTheme, setEditorTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('react_editor_theme');
      if (saved === 'vs' || saved === 'vs-dark') return saved;
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

  // Execution & Preview State
  const [compileError, setCompileError] = useState(null);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('preview'); // 'preview' | 'console'
  const [isExecuting, setIsExecuting] = useState(false);
  const iframeRef = useRef(null);

  // Active milestone tasks status
  const currentTasks = useMemo(() => currentMilestone?.tasks || [], [currentMilestone]);
  const [taskStatus, setTaskStatus] = useState(() => {
    return currentTasks.map((_, i) => ({ id: i, completed: false, message: '' }));
  });

  useEffect(() => {
    setTaskStatus(currentTasks.map((_, i) => ({ id: i, completed: false, message: '' })));
  }, [activeMilestoneIdx, currentTasks]);

  // Console messages listener
  useEffect(() => {
    const handleMsg = (e) => {
      if (e.data && e.data.type === 'SEED_CONSOLE') {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setConsoleLogs((prev) => [
          ...prev.slice(-99),
          { level: e.data.level, text: e.data.text, time }
        ]);
      }
    };
    window.addEventListener('message', handleMsg);
    return () => window.removeEventListener('message', handleMsg);
  }, []);

  // Run Compilation & DOM evaluation
  const handleRunMilestone = useCallback(async (currentFiles = fileContents, validate = true) => {
    setIsExecuting(true);
    setCompileError(null);

    const appCode = currentFiles['App.jsx'] || Object.values(currentFiles)[0] || '';
    const cssCode = currentFiles['styles.css'] || '';

    // 1. Transpile JSX
    const compileRes = compileReactCode(appCode);
    if (!compileRes.success) {
      setCompileError(compileRes.error);
      setIsExecuting(false);
      return;
    }

    // 2. Inject into sandboxed preview
    if (iframeRef.current) {
      const htmlPayload = generateSandboxHtml({
        compiledJs: compileRes.code,
        appIdentifier: compileRes.appIdentifier,
        css: cssCode
      });
      iframeRef.current.srcdoc = htmlPayload;
    }

    // 3. Evaluate tasks for current milestone
    if (validate && currentTasks.length > 0) {
      await new Promise((res) => setTimeout(res, 220));

      try {
        const evalResults = await evaluateTasks(currentTasks, appCode, iframeRef.current);
        let allPassed = true;

        setTaskStatus(evalResults.map((r, i) => {
          if (!r.passed) allPassed = false;
          return { id: i, completed: r.passed, message: r.message };
        }));

        if (allPassed) {
          setCompletedMilestones((prev) => ({ ...prev, [activeMilestoneIdx]: true }));
          toast.success(`Milestone ${activeMilestoneIdx + 1} completed! 🎯`, { duration: 3500 });

          // If last milestone
          if (activeMilestoneIdx === milestones.length - 1) {
            toast.success('🎉 All Capstone Project Milestones Completed! Ready for GitHub Sync.', { duration: 5000 });
            onComplete?.('projectPassed');
          }
        }
      } catch (err) {
        console.warn('[GuidedProjectStage] Validation error:', err);
      }
    }

    setIsExecuting(false);
  }, [fileContents, currentTasks, activeMilestoneIdx, milestones.length, onComplete]);

  // Initial preview on mount / milestone change (preview only, verified when user clicks Run)
  useEffect(() => {
    handleRunMilestone(fileContents, false);
  }, [activeMilestoneIdx]);

  // Keyboard shortcut Ctrl+Enter
  const handleEditorDidMount = useCallback((editor, monaco) => {
    remeasureMonacoFonts(monaco, editor);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      handleRunMilestone(fileContents, true);
    });
  }, [fileContents, handleRunMilestone]);

  // Code editor change handler
  const handleCodeChange = (newVal) => {
    setFileContents((prev) => ({
      ...prev,
      [activeFileName]: newVal || ''
    }));
  };

  // GitHub Sync State
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [showConnectModal, setShowConnectModal] = useState(false);

  const ghConfig = getGitHubConfig();

  const handleSyncToGitHub = async () => {
    if (!ghConfig.isConnected) {
      setShowConnectModal(true);
      return;
    }

    setIsSyncing(true);
    setSyncResult(null);

    const projectPayload = {
      projectId: project.projectId || project.id || 'react-app',
      title: project.title,
      category: project.category || 'React Development',
      description: project.description,
      skills: project.skills || ['React 18', 'State Management', 'Components'],
      files: Object.entries(fileContents).map(([name, content]) => ({
        path: `src/${name}`,
        content
      }))
    };

    // Add root package.json & README stub
    projectPayload.files.push({
      path: 'package.json',
      content: JSON.stringify({
        name: project.projectId || 'react-project',
        version: '1.0.0',
        private: true,
        scripts: {
          dev: 'vite',
          build: 'vite build',
          preview: 'vite preview'
        },
        dependencies: {
          react: '^18.3.1',
          'react-dom': '^18.3.1'
        },
        devDependencies: {
          '@vitejs/plugin-react': '^4.3.1',
          vite: '^5.4.0'
        }
      }, null, 2)
    });

    try {
      const res = await syncProjectToGitHub(uid, projectPayload);
      if (res.success) {
        setSyncResult(res);
        toast.success('Project successfully synced to your GitHub Portfolio! 🚀');
      } else {
        toast.error(res.message || 'GitHub Sync encountered an issue.');
      }
    } catch (e) {
      toast.error(e.message || 'Sync failed.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleConnectOAuth = async () => {
    try {
      await connectWithGitHubOAuth(uid);
      setShowConnectModal(false);
      toast.success('Connected to GitHub! Now syncing project...');
      handleSyncToGitHub();
    } catch (err) {
      toast.error(err.message || 'Failed connecting with GitHub OAuth.');
    }
  };

  const allMilestonesPassed = useMemo(() => {
    return milestones.length > 0 && milestones.every((_, idx) => completedMilestones[idx]);
  }, [milestones, completedMilestones]);

  return (
    <div className="guided-project-stage">
      {/* 1. PROJECT HEADER BANNER */}
      <section className="project-hero-card">
        <div className="project-hero-top">
          <div className="badge-cluster">
            <span className="project-type-pill">
              <FaLayerGroup style={{ marginRight: '6px' }} />
              Guided Capstone Project
            </span>
            <span className="track-pill">{project?.category || 'React Track'}</span>
          </div>

          <div className="milestone-counter-pill">
            {Object.values(completedMilestones).filter(Boolean).length} of {milestones.length} Milestones Completed
          </div>
        </div>

        <h1 className="project-title">{project?.title || 'React Capstone Project'}</h1>
        <p className="project-desc">{project?.description}</p>

        {/* 2. STEPPER NAVIGATION */}
        <div className="milestone-stepper-bar">
          {milestones.map((m, idx) => {
            const isCompleted = completedMilestones[idx];
            const isCurrent = activeMilestoneIdx === idx;
            return (
              <button
                key={idx}
                type="button"
                className={`stepper-step-btn ${isCurrent ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                onClick={() => setActiveMilestoneIdx(idx)}
              >
                <div className="step-circle">
                  {isCompleted ? <FaCheck /> : idx + 1}
                </div>
                <div className="step-info">
                  <span className="step-tag">Milestone {idx + 1}</span>
                  <span className="step-name">{m.title}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. WORKSPACE SPLIT */}
      <div className="project-workspace-grid">
        {/* LEFT COLUMN: MILESTONE OBJECTIVES & GITHUB SYNC */}
        <aside className="project-milestone-column">
          <div className="milestone-card">
            <div className="milestone-card-header">
              <span className="milestone-badge">Step {activeMilestoneIdx + 1} of {milestones.length}</span>
              <h3 className="milestone-name">{currentMilestone.title}</h3>
            </div>

            {currentMilestone.goal && (
              <p className="milestone-goal">
                <strong>Goal:</strong> {currentMilestone.goal}
              </p>
            )}

            {currentMilestone.instructions && (
              <div className="milestone-instructions">
                {currentMilestone.instructions}
              </div>
            )}

            {/* Checklist */}
            <div className="milestone-tasks-stack">
              <h4>Milestone Verification Checklist</h4>
              {currentTasks.map((t, tIdx) => {
                const isPassed = taskStatus[tIdx]?.completed;
                return (
                  <div key={tIdx} className={`milestone-task-item ${isPassed ? 'passed' : ''}`}>
                    <div className="m-icon-col">
                      {isPassed ? <FaCheckCircle className="m-done-icon" /> : <FaCircle className="m-pending-icon" />}
                    </div>
                    <div className="m-content-col">
                      <span className="m-task-text">{t.instruction}</span>
                      {!isPassed && taskStatus[tIdx]?.message && (
                        <span className="m-task-error">{taskStatus[tIdx].message}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Next Milestone / Step Progression */}
            <div className="milestone-action-bar">
              {activeMilestoneIdx < milestones.length - 1 ? (
                <button
                  type="button"
                  className={`btn-next-milestone ${completedMilestones[activeMilestoneIdx] ? 'unlocked' : 'locked'}`}
                  disabled={!completedMilestones[activeMilestoneIdx]}
                  onClick={() => setActiveMilestoneIdx((prev) => prev + 1)}
                >
                  Proceed to Milestone {activeMilestoneIdx + 2} →
                </button>
              ) : (
                <div className="final-milestone-badge">
                  <FaTrophy style={{ color: '#f59e0b', fontSize: '18px' }} />
                  <span>Final Milestone Completed!</span>
                </div>
              )}
            </div>
          </div>

          {/* GITHUB PORTFOLIO SYNC CARD */}
          <div className={`github-sync-card ${allMilestonesPassed ? 'ready-to-sync' : ''}`}>
            <div className="gh-card-header">
              <FaGithub className="gh-icon" />
              <div className="gh-title-col">
                <h4>GitHub Portfolio Sync</h4>
                <span>Publish this verified project to your GitHub profile</span>
              </div>
            </div>

            <p className="gh-card-desc">
              Push all project source code, component files, and a recruiter-ready <code>README.md</code> directly to your connected GitHub repository.
            </p>

            {syncResult ? (
              <div className="gh-success-box">
                <FaCheckCircle style={{ color: '#10b981', fontSize: '16px' }} />
                <div>
                  <strong>Successfully Pushed to GitHub!</strong>
                  <a
                    href={syncResult.projectUrl || syncResult.repoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="gh-link-btn"
                  >
                    View Project on GitHub <FaExternalLinkAlt style={{ fontSize: '10px', marginLeft: '4px' }} />
                  </a>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className={`btn-sync-github ${isSyncing ? 'loading' : ''}`}
                onClick={handleSyncToGitHub}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <>
                    <FaSpinner className="spin-icon" /> Pushing to GitHub...
                  </>
                ) : (
                  <>
                    <FaGithub /> Sync Project to GitHub
                  </>
                )}
              </button>
            )}
          </div>
        </aside>

        {/* RIGHT COLUMN: WORKSPACE & CODE TABS */}
        <main className="project-editor-column">
          <div className="project-workbench-card">
            {/* FILE TABS */}
            <div className="workbench-top-tabs">
              <div className="file-tabs-strip">
                {Object.keys(fileContents).map((fName) => (
                  <button
                    key={fName}
                    type="button"
                    className={`file-pill-tab ${activeFileName === fName ? 'active' : ''}`}
                    onClick={() => setActiveFileName(fName)}
                  >
                    <FaFileCode className="file-icon" />
                    <span>{fName}</span>
                  </button>
                ))}
              </div>

              <div className="workbench-actions">
                <button
                  type="button"
                  className="wb-icon-btn"
                  onClick={handleToggleTheme}
                  title="Toggle Editor Theme"
                >
                  {editorTheme === 'vs-dark' ? <FaSun /> : <FaMoon />}
                </button>
                <button
                  type="button"
                  className="wb-run-btn"
                  onClick={() => handleRunMilestone(fileContents, true)}
                  disabled={isExecuting}
                  title="Run and verify current milestone (Ctrl + Enter)"
                >
                  <FaPlay style={{ fontSize: '10px' }} /> Run &amp; Verify
                </button>
              </div>
            </div>

            {/* Monaco Multi-File Editor */}
            <div className={`monaco-wrapper ${editorTheme === 'vs-dark' ? 'dark' : 'light'}`}>
              <Editor
                height="320px"
                language={activeFileName.endsWith('.css') ? 'css' : activeFileName.endsWith('.json') ? 'json' : 'javascript'}
                theme={editorTheme}
                value={fileContents[activeFileName] || ''}
                onMount={handleEditorDidMount}
                onChange={handleCodeChange}
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
            <div className="project-error-card">
              <FaExclamationCircle className="error-icon" />
              <div>
                <strong>Transpilation Error:</strong>
                <pre>{compileError}</pre>
              </div>
            </div>
          )}

          {/* LIVE PREVIEW & CONSOLE */}
          <div className="project-preview-card">
            <div className="preview-nav-bar">
              <div className="preview-tabs">
                <button
                  type="button"
                  className={`p-tab ${activeTab === 'preview' ? 'active' : ''}`}
                  onClick={() => setActiveTab('preview')}
                >
                  <FaDesktop /> Live Application
                </button>
                <button
                  type="button"
                  className={`p-tab ${activeTab === 'console' ? 'active' : ''}`}
                  onClick={() => setActiveTab('console')}
                >
                  <FaTerminal /> Console ({consoleLogs.length})
                </button>
              </div>
            </div>

            {/* Live iframe */}
            <div className={`preview-iframe-wrapper ${activeTab === 'preview' ? 'show' : 'hide'}`}>
              <iframe
                ref={iframeRef}
                title="Guided Project Sandbox"
                className="project-sandbox-iframe"
                sandbox="allow-scripts allow-modals allow-same-origin"
              />
            </div>

            {/* Console output */}
            <div className={`project-console-wrapper ${activeTab === 'console' ? 'show' : 'hide'}`}>
              {consoleLogs.length === 0 ? (
                <div className="console-empty-text">No console output recorded yet.</div>
              ) : (
                consoleLogs.map((log, idx) => (
                  <div key={idx} className={`console-line ${log.level}`}>
                    <span className="c-time">{log.time}</span>
                    <span className="c-text">{log.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </main>
      </div>

      {/* CONNECT GITHUB MODAL IF NOT CONNECTED */}
      {showConnectModal && (
        <div className="gh-modal-backdrop" onClick={() => setShowConnectModal(false)}>
          <div className="gh-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="gh-modal-header">
              <FaGithub className="modal-gh-icon" />
              <h3>Connect GitHub Account</h3>
            </div>
            <p className="gh-modal-desc">
              Connect your GitHub account to sync this completed capstone project to your personal repository portfolio.
            </p>
            <div className="gh-modal-actions">
              <button
                type="button"
                className="btn-connect-oauth"
                onClick={handleConnectOAuth}
              >
                <FaGithub /> Connect with GitHub (1-Click)
              </button>
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setShowConnectModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GuidedProjectStage;
