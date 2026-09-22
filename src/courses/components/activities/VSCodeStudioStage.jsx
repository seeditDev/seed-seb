import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import {
  VscFiles,
  VscNewFile,
  VscNewFolder,
  VscTrash,
  VscClose,
  VscChevronDown,
  VscChevronRight,
  VscCheck,
  VscGithub,
  VscTerminal,
  VscGear,
  VscRefresh,
  VscCode
} from 'react-icons/vsc';
import {
  FaReact,
  FaJs,
  FaCss3Alt,
  FaFileCode,
  FaPlay,
  FaDesktop,
  FaCheckCircle,
  FaCircle,
  FaExclamationCircle,
  FaExternalLinkAlt,
  FaSpinner
} from 'react-icons/fa';
import { remeasureMonacoFonts } from '../../../utils/monacoFontFix';
import {
  bundleVirtualFileSystem,
  evaluateMultiFileTasks
} from '../../services/multiFileRuntimeService';
import {
  getGitHubConfig,
  connectWithGitHubOAuth,
  syncProjectToGitHub
} from '../../../services/githubSyncService';
import { toast } from 'sonner';
import '../../styles/VSCodeStudioStage.css';

// Helpers to get file icon and language
function getFileIcon(filename) {
  if (filename.endsWith('.jsx')) return <FaReact style={{ color: '#61dafb' }} />;
  if (filename.endsWith('.js')) return <FaJs style={{ color: '#f7df1e' }} />;
  if (filename.endsWith('.css')) return <FaCss3Alt style={{ color: '#38bdf8' }} />;
  if (filename.endsWith('.json')) return <span style={{ color: '#fbbf24', fontSize: '11px', fontWeight: 700 }}>{}</span>;
  return <FaFileCode style={{ color: '#94a3b8' }} />;
}

function getFileLanguage(filename) {
  if (filename.endsWith('.css')) return 'css';
  if (filename.endsWith('.json')) return 'json';
  if (filename.endsWith('.jsx') || filename.endsWith('.js')) return 'javascript';
  return 'plaintext';
}

const DEFAULT_FILES = {
  'src/App.jsx': `import React from 'react';
import Header from './components/Header';
import './styles.css';

export default function App() {
  return (
    <div className="app-container">
      <Header title="SEED Code Studio" />
      <main className="content">
        <p>Edit components in the file explorer to see live multi-file updates!</p>
      </main>
    </div>
  );
}
`,
  'src/components/Header.jsx': `import React from 'react';

export default function Header({ title }) {
  return (
    <header className="app-header">
      <h1 id="app-title">{title}</h1>
      <span className="badge">Multi-File React</span>
    </header>
  );
}
`,
  'src/styles.css': `.app-container {
  max-width: 500px;
  margin: 0 auto;
  font-family: Inter, sans-serif;
  color: #0f172a;
}
.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  border-bottom: 2px solid #e2e8f0;
}
.app-header h1 {
  font-size: 20px;
  margin: 0;
}
.badge {
  background: #e0e7ff;
  color: #3730a3;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 11.5px;
  font-weight: 600;
}
.content {
  padding: 20px 0;
}
`
};

const VSCodeStudioStage = ({
  studio,
  user,
  onComplete,
  onNextLesson
}) => {
  const uid = user?.uid;
  const initialFiles = studio?.files || DEFAULT_FILES;

  // Virtual File System state: { 'src/App.jsx': 'code...', ... }
  const [files, setFiles] = useState(initialFiles);
  const filesRef = useRef(files);
  filesRef.current = files;

  // Open tabs list
  const [openTabs, setOpenTabs] = useState(() => {
    const keys = Object.keys(initialFiles);
    return keys.slice(0, 3);
  });

  // Active open file
  const [activeFile, setActiveFile] = useState(() => {
    return Object.keys(initialFiles).find(k => k.endsWith('App.jsx')) || Object.keys(initialFiles)[0] || 'src/App.jsx';
  });

  // Active Activity Bar view: 'explorer' | 'tasks' | 'github'
  const [activeSidebarView, setActiveSidebarView] = useState('explorer');

  // Expanded folders in Explorer tree: { 'src': true, 'src/components': true }
  const [expandedFolders, setExpandedFolders] = useState({
    'src': true,
    'src/components': true,
    'src/hooks': true,
    'src/styles': true
  });

  // New file input state
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  // Editor theme
  const [editorTheme, setEditorTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('vscode_studio_theme');
      if (saved === 'vs' || saved === 'vs-dark') return saved;
    } catch (_) {}
    return 'vs-dark';
  });

  const handleToggleTheme = () => {
    setEditorTheme(prev => {
      const next = prev === 'vs-dark' ? 'vs' : 'vs-dark';
      try {
        localStorage.setItem('vscode_studio_theme', next);
      } catch (_) {}
      return next;
    });
  };

  // Execution & Sandbox state
  const [compileError, setCompileError] = useState(null);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [activeRightTab, setActiveRightTab] = useState('preview'); // 'preview' | 'console' | 'tasks'
  const [isExecuting, setIsExecuting] = useState(false);
  const iframeRef = useRef(null);

  // Tasks verification state
  const tasks = useMemo(() => studio?.tasks || [], [studio?.tasks]);
  const [taskProgress, setTaskProgress] = useState(() => {
    return tasks.map((t, idx) => ({
      id: t.id !== undefined ? t.id : idx,
      completed: false,
      message: ''
    }));
  });

  // Reset stage when studio definition changes
  useEffect(() => {
    const f = studio?.files || DEFAULT_FILES;
    setFiles(f);
    filesRef.current = f;
    const fileKeys = Object.keys(f);
    setOpenTabs(fileKeys.slice(0, 3));
    setActiveFile(fileKeys.find(k => k.endsWith('App.jsx')) || fileKeys[0] || 'src/App.jsx');
    setCompileError(null);
    setConsoleLogs([]);
    setTaskProgress(tasks.map((t, idx) => ({
      id: t.id !== undefined ? t.id : idx,
      completed: false,
      message: ''
    })));
  }, [studio, tasks]);

  // Console listener
  useEffect(() => {
    const handleMsg = (e) => {
      if (e.data && e.data.type === 'SEED_CONSOLE') {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setConsoleLogs(prev => [
          ...prev.slice(-99),
          { level: e.data.level, text: e.data.text, time }
        ]);
      }
    };
    window.addEventListener('message', handleMsg);
    return () => window.removeEventListener('message', handleMsg);
  }, []);

  // Run multi-file bundler and evaluate
  const handleBundleAndRun = useCallback(async (currentFiles = filesRef.current, validate = true) => {
    setIsExecuting(true);
    setCompileError(null);

    const bundle = bundleVirtualFileSystem(currentFiles, studio?.entryPoint || 'src/App.jsx');

    if (!bundle.success) {
      setCompileError(bundle.error);
      setIsExecuting(false);
      return;
    }

    if (iframeRef.current) {
      iframeRef.current.srcdoc = bundle.html;
    }

    if (validate && tasks.length > 0) {
      await new Promise(r => setTimeout(r, 220));

      try {
        const results = await evaluateMultiFileTasks(tasks, currentFiles, iframeRef.current);
        let anyNewlySolved = false;

        setTaskProgress(prev => {
          const updated = prev.map((tp, idx) => {
            const r = results[idx];
            if (!r) return tp;
            if (r.passed && !tp.completed) {
              anyNewlySolved = true;
            }
            return {
              ...tp,
              completed: r.passed,
              message: r.message
            };
          });

          if (anyNewlySolved) {
            toast.success('Studio objective completed! ⚡');
          }

          const allDone = updated.every(t => t.completed);
          if (allDone && !prev.every(t => t.completed)) {
            toast.success('All tasks passed! Topic objective achieved.', { duration: 4500 });
            onComplete?.('studioPassed');
          }

          return updated;
        });
      } catch (err) {
        console.warn('[VSCodeStudioStage] Validation error:', err);
      }
    }

    setIsExecuting(false);
  }, [tasks, studio?.entryPoint, onComplete]);

  // Initial bundle on mount or studio change (preview only, tasks verified when user clicks Run)
  useEffect(() => {
    handleBundleAndRun(files, false);
  }, [studio]);

  // Editor mount
  const handleEditorDidMount = useCallback((editor, monaco) => {
    remeasureMonacoFonts(monaco, editor);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      handleBundleAndRun(filesRef.current, true);
    });
  }, [handleBundleAndRun]);

  // File tree data structure derivation
  const fileTree = useMemo(() => {
    const root = { name: 'workspace', isDir: true, path: '', children: {} };

    Object.keys(files).sort().forEach(filePath => {
      const parts = filePath.split('/');
      let current = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isFile = i === parts.length - 1;
        const currentPath = parts.slice(0, i + 1).join('/');

        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            path: currentPath,
            isDir: !isFile,
            children: isFile ? null : {}
          };
        }
        current = current.children[part];
      }
    });

    return root;
  }, [files]);

  // Tab management
  const handleOpenFile = (filePath) => {
    if (!openTabs.includes(filePath)) {
      setOpenTabs([...openTabs, filePath]);
    }
    setActiveFile(filePath);
  };

  const handleCloseTab = (e, filePath) => {
    e.stopPropagation();
    const remaining = openTabs.filter(t => t !== filePath);
    setOpenTabs(remaining);
    if (activeFile === filePath) {
      setActiveFile(remaining[remaining.length - 1] || '');
    }
  };

  const handleCodeChange = (newCode) => {
    if (!activeFile) return;
    setFiles(prev => ({
      ...prev,
      [activeFile]: newCode || ''
    }));
  };

  // File creation
  const handleCreateFile = () => {
    const raw = (newFileName || '').trim().replace(/\\/g, '/');
    if (!raw) {
      setIsCreatingFile(false);
      return;
    }

    const cleanPath = raw.startsWith('src/') ? raw : `src/${raw}`;

    if (files[cleanPath]) {
      toast.error(`File "${cleanPath}" already exists.`);
      return;
    }

    const initialCode = cleanPath.endsWith('.css')
      ? '/* New CSS Stylesheet */\n'
      : `import React from 'react';\n\nexport default function ${cleanPath.split('/').pop().replace(/\.[^/.]+$/, '')}() {\n  return <div>New Component</div>;\n}\n`;

    setFiles(prev => ({
      ...prev,
      [cleanPath]: initialCode
    }));

    setOpenTabs(prev => [...prev, cleanPath]);
    setActiveFile(cleanPath);
    setNewFileName('');
    setIsCreatingFile(false);
    toast.success(`Created file: ${cleanPath}`);
  };

  // File deletion
  const handleDeleteFile = (e, filePath) => {
    e.stopPropagation();
    if (Object.keys(files).length <= 1) {
      toast.error('Cannot delete the only remaining file in workspace.');
      return;
    }
    if (confirm(`Are you sure you want to delete "${filePath}"?`)) {
      setFiles(prev => {
        const next = { ...prev };
        delete next[filePath];
        return next;
      });
      setOpenTabs(prev => prev.filter(t => t !== filePath));
      if (activeFile === filePath) {
        const remaining = Object.keys(files).filter(f => f !== filePath);
        setActiveFile(remaining[0] || '');
      }
      toast.info(`Deleted "${filePath}".`);
    }
  };

  // GitHub Sync
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
      projectId: studio?.projectId || 'react-workspace-app',
      title: studio?.title || 'Multi-File React Application',
      category: studio?.category || 'React Architecture',
      description: studio?.description || 'Built in SEED Code Studio with multi-file component separation.',
      skills: studio?.skills || ['React 18', 'Component Separation', 'Modular CSS', 'VFS Bundling'],
      files: Object.entries(files).map(([p, content]) => ({
        path: p,
        content
      }))
    };

    // Ensure package.json exists in commit
    if (!files['package.json']) {
      projectPayload.files.push({
        path: 'package.json',
        content: JSON.stringify({
          name: 'seed-react-studio-app',
          private: true,
          version: '1.0.0',
          scripts: { dev: 'vite', build: 'vite build' },
          dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
          devDependencies: { '@vitejs/plugin-react': '^4.3.1', vite: '^5.4.0' }
        }, null, 2)
      });
    }

    try {
      const res = await syncProjectToGitHub(uid, projectPayload);
      if (res.success) {
        setSyncResult(res);
        toast.success('Project synced to your GitHub Portfolio! 🚀');
      } else {
        toast.error(res.message || 'GitHub Sync failed.');
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
      toast.success('Connected to GitHub! Now syncing...');
      handleSyncToGitHub();
    } catch (err) {
      toast.error(err.message || 'OAuth Connection Failed.');
    }
  };

  const allTasksCompleted = useMemo(() => {
    return taskProgress.length > 0 && taskProgress.every(t => t.completed);
  }, [taskProgress]);

  // Recursive Tree Node Renderer
  const renderTreeNodes = (node, depth = 0) => {
    if (!node.children) return null;

    return Object.values(node.children).map(child => {
      if (child.isDir) {
        const isExpanded = Boolean(expandedFolders[child.path]);
        return (
          <div key={child.path} className="tree-dir-block">
            <div
              className="tree-dir-row"
              style={{ paddingLeft: `${16 + depth * 14}px` }}
              onClick={() => {
                setExpandedFolders(prev => ({
                  ...prev,
                  [child.path]: !prev[child.path]
                }));
              }}
            >
              {isExpanded ? <VscChevronDown className="arrow-icon" /> : <VscChevronRight className="arrow-icon" />}
              <span className="dir-name">{child.name}</span>
            </div>
            {isExpanded && renderTreeNodes(child, depth + 1)}
          </div>
        );
      }

      const isActive = activeFile === child.path;
      return (
        <div
          key={child.path}
          className={`tree-file-row ${isActive ? 'active' : ''}`}
          style={{ paddingLeft: `${24 + depth * 14}px` }}
          onClick={() => handleOpenFile(child.path)}
        >
          <span className="file-icon-wrap">{getFileIcon(child.name)}</span>
          <span className="file-name">{child.name}</span>
          <button
            type="button"
            className="delete-file-btn"
            title="Delete file"
            onClick={(e) => handleDeleteFile(e, child.path)}
          >
            <VscTrash />
          </button>
        </div>
      );
    });
  };

  return (
    <div className={`vscode-studio-root ${editorTheme === 'vs-dark' ? 'theme-dark' : 'theme-light'}`}>
      {/* 1. TOP HEADER BANNER */}
      {studio && (
        <header className="studio-top-bar">
          <div className="studio-title-group">
            <VscCode className="studio-brand-icon" />
            <span className="studio-brand-name">SEED Code Studio</span>
            <span className="studio-sep">/</span>
            <h2 className="studio-lesson-title">{studio.title || 'Multi-File Architecture Workspace'}</h2>
          </div>

          <div className="studio-top-actions">
            <div className={`status-tag ${allTasksCompleted ? 'passed' : 'pending'}`}>
              {allTasksCompleted ? 'Objectives Met ✓' : `${taskProgress.filter(t => t.completed).length}/${tasks.length} Verified`}
            </div>

            <button
              type="button"
              className="top-action-btn run"
              onClick={() => handleBundleAndRun(files, true)}
              disabled={isExecuting}
              title="Run project and verify objectives (Ctrl + Enter)"
            >
              <FaPlay style={{ fontSize: '11px' }} /> Run &amp; Preview
            </button>
          </div>
        </header>
      )}

      {/* 2. MAIN WORKSPACE CONTAINER */}
      <div className="studio-workspace-body">
        {/* ACTIVITY BAR (FAR LEFT) */}
        <nav className="studio-activity-bar">
          <button
            type="button"
            className={`activity-btn ${activeSidebarView === 'explorer' ? 'active' : ''}`}
            onClick={() => setActiveSidebarView(activeSidebarView === 'explorer' ? '' : 'explorer')}
            title="Explorer (Files)"
          >
            <VscFiles />
          </button>

          <button
            type="button"
            className={`activity-btn ${activeSidebarView === 'tasks' ? 'active' : ''}`}
            onClick={() => setActiveSidebarView(activeSidebarView === 'tasks' ? '' : 'tasks')}
            title="Learning Objectives & Instructions"
          >
            <VscCheck />
            {tasks.length > 0 && <span className="activity-badge">{taskProgress.filter(t => t.completed).length}</span>}
          </button>

          <button
            type="button"
            className={`activity-btn ${activeSidebarView === 'github' ? 'active' : ''}`}
            onClick={() => setActiveSidebarView(activeSidebarView === 'github' ? '' : 'github')}
            title="GitHub Portfolio Sync"
          >
            <VscGithub />
          </button>

          <div className="activity-bar-spacer" />

          <button
            type="button"
            className="activity-btn"
            onClick={handleToggleTheme}
            title="Toggle Color Theme"
          >
            <VscGear />
          </button>
        </nav>

        {/* SIDEBAR DRAWER (EXPLORER / TASKS / GITHUB) */}
        {activeSidebarView && (
          <aside className="studio-sidebar">
            {/* VIEW 1: FILE EXPLORER */}
            {activeSidebarView === 'explorer' && (
              <div className="sidebar-view explorer-view">
                <div className="sidebar-header">
                  <span>EXPLORER: REACT-APP</span>
                  <div className="sidebar-header-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      title="New File (e.g. src/components/Card.jsx)"
                      onClick={() => setIsCreatingFile(true)}
                    >
                      <VscNewFile />
                    </button>
                  </div>
                </div>

                {isCreatingFile && (
                  <div className="new-file-prompt">
                    <input
                      type="text"
                      placeholder="src/components/MyComponent.jsx"
                      value={newFileName}
                      autoFocus
                      onChange={e => setNewFileName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleCreateFile();
                        if (e.key === 'Escape') setIsCreatingFile(false);
                      }}
                    />
                    <div className="prompt-actions">
                      <button type="button" onClick={handleCreateFile} className="btn-ok">Add</button>
                      <button type="button" onClick={() => setIsCreatingFile(false)} className="btn-cancel">✕</button>
                    </div>
                  </div>
                )}

                <div className="tree-scroll-area">
                  {renderTreeNodes(fileTree)}
                </div>
              </div>
            )}

            {/* VIEW 2: TASKS & CHECKLIST */}
            {activeSidebarView === 'tasks' && (
              <div className="sidebar-view tasks-view">
                <div className="sidebar-header">
                  <span>LEARNING OBJECTIVES</span>
                </div>

                <div className="tasks-scroll-area">
                  {studio?.description && (
                    <p className="sidebar-desc-text">{studio.description}</p>
                  )}

                  <div className="objectives-list">
                    {tasks.map((task, idx) => {
                      const tp = taskProgress[idx];
                      const isDone = tp?.completed;
                      return (
                        <div key={idx} className={`objective-card ${isDone ? 'done' : 'pending'}`}>
                          <div className="obj-icon">
                            {isDone ? <FaCheckCircle className="done-icon" /> : <FaCircle className="pending-icon" />}
                          </div>
                          <div className="obj-body">
                            <span className="obj-title">Objective {idx + 1}</span>
                            <p className="obj-text">{task.instruction}</p>
                            {!isDone && tp?.message && tp.message !== 'Passed' && (
                              <span className="obj-error">{tp.message}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="tasks-action-footer">
                    <button
                      type="button"
                      className={`btn-advance-lesson ${allTasksCompleted ? 'unlocked' : 'locked'}`}
                      disabled={!allTasksCompleted}
                      onClick={onNextLesson}
                    >
                      {allTasksCompleted ? 'Next Lesson →' : 'Complete Objectives to Advance'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 3: GITHUB SYNC */}
            {activeSidebarView === 'github' && (
              <div className="sidebar-view github-view">
                <div className="sidebar-header">
                  <span>GITHUB PORTFOLIO SYNC</span>
                </div>

                <div className="github-scroll-area">
                  <div className="gh-panel-card">
                    <VscGithub className="gh-panel-icon" />
                    <h4>Sync Multi-File Project</h4>
                    <p>
                      Push this complete component hierarchy, folders, and README directly to your personal GitHub repository.
                    </p>

                    {syncResult ? (
                      <div className="gh-synced-notice">
                        <FaCheckCircle />
                        <span>Successfully committed!</span>
                        <a
                          href={syncResult.projectUrl || syncResult.repoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="gh-commit-link"
                        >
                          View Repository on GitHub <FaExternalLinkAlt />
                        </a>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn-gh-push"
                        onClick={handleSyncToGitHub}
                        disabled={isSyncing}
                      >
                        {isSyncing ? (
                          <><FaSpinner className="spin" /> Pushing {Object.keys(files).length} files...</>
                        ) : (
                          <><VscGithub /> Sync to GitHub Portfolio</>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </aside>
        )}

        {/* CENTER MONACO EDITOR */}
        <main className="studio-editor-workbench">
          {/* TABS STRIP */}
          <div className="editor-tabs-bar">
            <div className="tabs-scroll">
              {openTabs.map(tPath => {
                const isActive = activeFile === tPath;
                const fileName = tPath.split('/').pop();
                return (
                  <div
                    key={tPath}
                    className={`editor-tab ${isActive ? 'active' : ''}`}
                    onClick={() => setActiveFile(tPath)}
                  >
                    <span className="tab-icon">{getFileIcon(fileName)}</span>
                    <span className="tab-label">{fileName}</span>
                    <button
                      type="button"
                      className="tab-close-btn"
                      onClick={(e) => handleCloseTab(e, tPath)}
                      title="Close"
                    >
                      <VscClose />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* BREADCRUMB */}
          <div className="editor-breadcrumb">
            <span>workspace</span>
            <span>&gt;</span>
            <span>{activeFile}</span>
          </div>

          {/* MONACO CODE EDITOR */}
          <div className="editor-monaco-mount">
            {activeFile && (
              <Editor
                height="100%"
                language={getFileLanguage(activeFile)}
                theme={editorTheme}
                value={files[activeFile] || ''}
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
                  padding: { top: 10, bottom: 10 }
                }}
              />
            )}
          </div>

          {/* STATUS BAR */}
          <footer className="editor-status-bar">
            <div className="status-left">
              <span>main*</span>
              <span>0 errors</span>
            </div>
            <div className="status-right">
              <span>UTF-8</span>
              <span>{getFileLanguage(activeFile || 'App.jsx').toUpperCase()}</span>
              <span>Prettier</span>
            </div>
          </footer>
        </main>

        {/* RIGHT PANE: LIVE SANDBOX & CONSOLE */}
        <section className="studio-preview-pane">
          <div className="preview-nav">
            <button
              type="button"
              className={`p-nav-btn ${activeRightTab === 'preview' ? 'active' : ''}`}
              onClick={() => setActiveRightTab('preview')}
            >
              <FaDesktop /> Live Preview
            </button>
            <button
              type="button"
              className={`p-nav-btn ${activeRightTab === 'console' ? 'active' : ''}`}
              onClick={() => setActiveRightTab('console')}
            >
              <VscTerminal /> Console ({consoleLogs.length})
            </button>
            <button
              type="button"
              className={`p-nav-btn ${activeRightTab === 'tasks' ? 'active' : ''}`}
              onClick={() => setActiveRightTab('tasks')}
            >
              <VscCheck /> Checks ({taskProgress.filter(t => t.completed).length}/{tasks.length})
            </button>
          </div>

          {/* TRANSPILE ERROR BANNER */}
          {compileError && (
            <div className="studio-error-notice">
              <FaExclamationCircle />
              <pre>{compileError}</pre>
            </div>
          )}

          {/* PREVIEW TAB */}
          <div className={`preview-mount ${activeRightTab === 'preview' ? 'show' : 'hide'}`}>
            <iframe
              ref={iframeRef}
              title="SEED Code Studio Preview"
              className="studio-iframe"
              sandbox="allow-scripts allow-modals allow-same-origin"
            />
          </div>

          {/* CONSOLE TAB */}
          <div className={`console-mount ${activeRightTab === 'console' ? 'show' : 'hide'}`}>
            {consoleLogs.length === 0 ? (
              <div className="console-empty">No console output recorded.</div>
            ) : (
              consoleLogs.map((c, i) => (
                <div key={i} className={`console-entry ${c.level}`}>
                  <span className="c-time">{c.time}</span>
                  <span className="c-msg">{c.text}</span>
                </div>
              ))
            )}
          </div>

          {/* TASKS TAB */}
          <div className={`checks-mount ${activeRightTab === 'tasks' ? 'show' : 'hide'}`}>
            {tasks.map((task, idx) => {
              const tp = taskProgress[idx];
              return (
                <div key={idx} className={`check-row ${tp?.completed ? 'passed' : 'failed'}`}>
                  {tp?.completed ? <FaCheckCircle className="c-icon-done" /> : <FaCircle className="c-icon-pend" />}
                  <div>
                    <div className="c-instr">{task.instruction}</div>
                    {!tp?.completed && tp?.message && <div className="c-sub">{tp.message}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* CONNECT GITHUB MODAL */}
      {showConnectModal && (
        <div className="gh-modal-backdrop" onClick={() => setShowConnectModal(false)}>
          <div className="gh-modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="gh-modal-header">
              <VscGithub className="modal-icon" />
              <h3>Connect GitHub Portfolio</h3>
            </div>
            <p>Connect your GitHub account with 1-click OAuth to sync this multi-file project directly into your personal repository.</p>
            <div className="modal-actions">
              <button type="button" className="btn-oauth" onClick={handleConnectOAuth}>
                <VscGithub /> Connect with GitHub (1-Click)
              </button>
              <button type="button" className="btn-cancel" onClick={() => setShowConnectModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VSCodeStudioStage;
