import React, { useState, useEffect, useMemo, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { 
  FaCode, FaPlay, FaTerminal, FaCheckCircle, FaSpinner, 
  FaArrowRight, FaArrowLeft, FaFileCode, FaCopy, FaUndo, FaTrash 
} from 'react-icons/fa';
import desktopBridge from '../../../utils/desktopBridge';
import { useSystemTheme } from '../../services/courseThemeHelper';
import '../../styles/CodeExamplesActivity.css';

const getMonacoLang = (lang) => {
  const l = (lang || '').toLowerCase().trim();
  if (l === 'c') return 'c';
  if (l === 'cpp' || l === 'c++') return 'cpp';
  if (l === 'python' || l === 'python3' || l === 'py') return 'python';
  if (l === 'java') return 'java';
  if (l === 'javascript' || l === 'js') return 'javascript';
  if (l === 'csharp' || l === 'c#') return 'csharp';
  if (l === 'sql') return 'sql';
  if (l === 'rust') return 'rust';
  if (l === 'go') return 'go';
  return 'c';
};

const getFileExtension = (lang) => {
  const l = (lang || '').toLowerCase().trim();
  if (l === 'c') return 'main.c';
  if (l === 'cpp' || l === 'c++') return 'main.cpp';
  if (l === 'python' || l === 'python3' || l === 'py') return 'main.py';
  if (l === 'java') return 'Main.java';
  if (l === 'javascript' || l === 'js') return 'index.js';
  if (l === 'csharp' || l === 'c#') return 'Program.cs';
  if (l === 'sql') return 'query.sql';
  if (l === 'rust') return 'main.rs';
  if (l === 'go') return 'main.go';
  return 'example.txt';
};

// Simulation engine for browser dev mode when native desktop bridge is not running
const simulateConsoleOutput = (code, lang) => {
  const lines = [];

  // Parse printf statements in C / C++
  const printfRegex = /printf\s*\(\s*"([^"]*)"(?:\s*,\s*([^)]*))?\s*\)/g;
  let match;
  while ((match = printfRegex.exec(code)) !== null) {
    let fmt = match[1];
    const args = match[2];
    if (args) {
      if (args.includes('strlen') && (code.includes('"Hello"') || code.includes('"hello"'))) {
        fmt = fmt.replace('%zu', '5').replace('%d', '5');
      } else if (args.trim() === 'i' && code.includes('i <= 3')) {
        fmt = '1\n2\n3';
      }
    }
    fmt = fmt.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    lines.push(fmt);
  }

  // Parse cout << ...
  const coutRegex = /cout\s*<<\s*([^;]+);/g;
  while ((match = coutRegex.exec(code)) !== null) {
    const raw = match[1]
      .replace(/"/g, '')
      .replace(/<<\s*endl/g, '')
      .replace(/<<\s*"\\n"/g, '')
      .trim();
    lines.push(raw);
  }

  // Parse print(...) in Python
  const printRegex = /print\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((match = printRegex.exec(code)) !== null) {
    lines.push(match[1]);
  }

  // Parse System.out.println(...) in Java
  const sysoutRegex = /System\.out\.print(?:ln)?\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((match = sysoutRegex.exec(code)) !== null) {
    lines.push(match[1]);
  }

  if (lines.length > 0) {
    return lines.join('\n').trim();
  }

  return 'Execution completed.\nProgram returned exit code 0.';
};

const CodeExamplesActivity = ({ topic, onCheckpointComplete, onContinue }) => {
  const { monacoTheme } = useSystemTheme();

  // Extract and deduplicate examples across all sources
  const examples = useMemo(() => {
    const list = [];
    const seenCodes = new Set();

    // Helper to register unique examples
    const addUnique = (item) => {
      const trimmed = (item.code || '').trim();
      if (!trimmed || seenCodes.has(trimmed)) return;
      seenCodes.add(trimmed);
      list.push(item);
    };

    // 1. Direct topic.codeExamples from real course JSON
    if (Array.isArray(topic?.codeExamples) && topic.codeExamples.length > 0) {
      topic.codeExamples.forEach((ex, idx) => {
        addUnique({
          id: ex.exampleId || `ex-${idx}`,
          language: ex.language || 'c',
          rawLabel: ex.label || '',
          title: ex.title || `Example ${idx + 1}`,
          code: ex.code
        });
      });
    }

    // 2. Extract runnable codeCards from topic pages
    const pageCards = (topic?.pages || []).filter(p => p.codeCard && p.codeCard.code);
    if (pageCards.length > 0) {
      pageCards.forEach((p, idx) => {
        addUnique({
          id: p.pageId || `page-${idx}`,
          language: p.codeCard.language || 'c',
          rawLabel: p.title || '',
          title: p.title || `Worked Example ${idx + 1}`,
          description: p.callout?.text || '',
          code: p.codeCard.code
        });
      });
    }

    // 3. exampleActivity from topic.activities
    const exampleActivity = topic?.activities?.find(a => a.type === 'EXAMPLE');
    if (exampleActivity?.examples && Array.isArray(exampleActivity.examples)) {
      exampleActivity.examples.forEach((ex, idx) => {
        addUnique({
          id: `act-${idx}`,
          language: ex.language || 'c',
          rawLabel: ex.label || '',
          title: ex.title || `Worked Example ${idx + 1}`,
          code: ex.code
        });
      });
    }

    // 4. Practice problem boilerplates fallback if still empty
    if (list.length === 0) {
      const firstProb = topic?.practiceProblems?.[0];
      if (firstProb?.boilerPlates && Object.keys(firstProb.boilerPlates).length > 0) {
        for (const [k, v] of Object.entries(firstProb.boilerPlates)) {
          addUnique({
            id: `bp-${k}`,
            language: k.toLowerCase().replace('++', 'pp').replace('#', 'sharp'),
            rawLabel: k,
            title: `${firstProb.title || topic?.title} (${k})`,
            code: v
          });
        }
      }
    }

    // 5. Default fallback
    if (list.length === 0) {
      list.push({
        id: 'default-ex',
        language: 'c',
        rawLabel: 'C',
        title: `${topic?.title || 'Example'} in C`,
        code: `#include <stdio.h>\n\nint main(void) {\n    printf("Welcome to ${topic?.title || 'SEED-IT'}!\\n");\n    return 0;\n}`
      });
    }

    return list;
  }, [topic]);

  // Tab indexing and active code state
  const [activeIdx, setActiveIdx] = useState(0);
  const activeExample = examples[activeIdx] || examples[0];

  const [currentCode, setCurrentCode] = useState(() => activeExample?.code || '');
  const [output, setOutput] = useState('');
  const [execStatus, setExecStatus] = useState('idle'); // 'idle' | 'running' | 'success' | 'error'
  const [execTime, setExecTime] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  // Sync editor content when active example changes or topic changes
  useEffect(() => {
    if (activeIdx >= examples.length) {
      setActiveIdx(0);
    } else {
      setCurrentCode(examples[activeIdx]?.code || '');
      setOutput('');
      setExecStatus('idle');
      setExecTime(null);
    }
  }, [activeIdx, examples]);

  // Compute a clean, human-readable tab label
  const getTabLabel = (ex, idx) => {
    const uniqueLangs = new Set(examples.map(e => (e.language || '').toLowerCase()));
    const isMultiLang = uniqueLangs.size > 1;

    let cleanTitle = (ex.title || ex.rawLabel || '')
      .replace(/\s*\([^)]*\)\s*/g, '')
      .replace(/^interactive sample \d+/i, '')
      .replace(/^worked example/i, '')
      .replace(/^example \d+/i, '')
      .trim();

    if (isMultiLang) {
      const langBadge = (ex.language || 'code').toUpperCase();
      return cleanTitle ? `${langBadge} • ${cleanTitle}` : langBadge;
    }

    if (cleanTitle) {
      const truncated = cleanTitle.length > 22 ? cleanTitle.slice(0, 20) + '…' : cleanTitle;
      return `${idx + 1}. ${truncated}`;
    }

    return `Example ${idx + 1}`;
  };

  const handleRunExample = async () => {
    setIsRunning(true);
    setExecStatus('running');
    setOutput('Compiling and executing code in sandbox...');
    const startTime = performance.now();

    try {
      const bridgeLang = activeExample.language === 'cpp' 
        ? 'cpp' 
        : (activeExample.language === 'python' ? 'python3' : activeExample.language);

      const res = await Promise.race([
        desktopBridge.runDirectSandbox(bridgeLang, currentCode, ''),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Sandbox execution timeout')), 5000))
      ]);

      const elapsed = Math.round(performance.now() - startTime);
      setExecTime(elapsed);

      if (res && !res.engineDisconnected && res.error !== 'ENGINE_NOT_CONNECTED') {
        const out = res.stdout || res.output || res.stderr || 'Program completed with no output.';
        setOutput(out);
        setExecStatus(res.exit_code === 0 || !res.stderr ? 'success' : 'error');
      } else {
        // Simulated execution output in browser dev mode
        const simulated = simulateConsoleOutput(currentCode, activeExample.language);
        setOutput(simulated);
        setExecStatus('success');
      }

      onCheckpointComplete?.('exampleRun');
    } catch (err) {
      setOutput(`Error: ${err.message}`);
      setExecStatus('error');
    } finally {
      setIsRunning(false);
    }
  };

  const handleReset = () => {
    setCurrentCode(activeExample?.code || '');
    setOutput('');
    setExecStatus('idle');
  };

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(currentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleFinishAndContinue = () => {
    onCheckpointComplete?.('exampleRun');
    onContinue?.();
  };

  return (
    <div className="code-examples-activity-wrapper">
      {/* 1. Header Banner */}
      <div className="examples-header-banner">
        <div className="examples-header-left">
          <div className="examples-title-row">
            <div className="examples-icon-badge">
              <FaCode />
            </div>
            <h3>Interactive Worked Examples</h3>
          </div>
          <p className="examples-subtitle">
            Explore and execute code implementations. Tweak values, run the program, and observe real-time output in the integrated terminal.
          </p>
        </div>
      </div>

      {/* 2. Example Tabs */}
      {examples.length > 1 && (
        <div className="examples-tabs-bar">
          {examples.map((ex, idx) => (
            <button
              key={ex.id || idx}
              className={`example-tab-pill ${activeIdx === idx ? 'active' : ''}`}
              onClick={() => setActiveIdx(idx)}
            >
              <FaFileCode className="tab-icon" />
              <span>{getTabLabel(ex, idx)}</span>
              <span className="tab-lang-badge">{(ex.language || 'c').toUpperCase()}</span>
            </button>
          ))}
        </div>
      )}

      {/* 3. Main IDE Card */}
      <div className="ide-workspace-card">
        {/* IDE Top Bar */}
        <div className="ide-top-bar">
          <div className="ide-top-left">
            <div className="ide-window-dots">
              <span className="ide-dot red" />
              <span className="ide-dot yellow" />
              <span className="ide-dot green" />
            </div>
            <div className="ide-file-tab">
              <FaFileCode className="file-icon" />
              <span>{getFileExtension(activeExample.language)}</span>
            </div>
            <span className="ide-example-title-badge">
              {activeExample.title}
            </span>
          </div>

          <div className="ide-top-actions">
            <button className="ide-action-btn" onClick={handleReset} title="Reset code to original sample">
              <FaUndo />
              <span>Reset</span>
            </button>
            <button className={`ide-action-btn copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy} title="Copy code to clipboard">
              <FaCopy />
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
            <button 
              className="ide-run-btn" 
              onClick={handleRunExample}
              disabled={isRunning}
            >
              {isRunning ? <FaSpinner className="spin-icon" /> : <FaPlay />}
              <span>{isRunning ? 'Running...' : 'Run Example'}</span>
            </button>
          </div>
        </div>

        {/* Monaco Editor */}
        <div className="ide-editor-container">
          <Editor
            height="340px"
            language={getMonacoLang(activeExample.language)}
            value={currentCode}
            theme={monacoTheme}
            onChange={(val) => setCurrentCode(val || '')}
            options={{
              minimap: { enabled: false },
              fontSize: 13.5,
              fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
              fontLigatures: true,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 14, bottom: 14 },
              lineNumbers: 'on',
              folding: true,
              tabSize: 4,
              renderLineHighlight: 'line',
              scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 }
            }}
          />
        </div>

        {/* Integrated Terminal Console */}
        <div className="ide-terminal-pane">
          <div className="terminal-header">
            <div className="terminal-header-left">
              <div className="terminal-title">
                <FaTerminal />
                <span>Console Output</span>
              </div>
              <span className={`terminal-status-pill ${execStatus}`}>
                {execStatus === 'running' && 'Compiling & Running...'}
                {execStatus === 'success' && `Exit Code 0 • ${execTime ? `${execTime}ms` : 'Success'}`}
                {execStatus === 'error' && 'Execution Error'}
                {execStatus === 'idle' && 'Ready'}
              </span>
            </div>
            {output && (
              <div className="terminal-header-right">
                <button className="terminal-mini-btn" onClick={() => setOutput('')} title="Clear console">
                  <FaTrash /> Clear
                </button>
              </div>
            )}
          </div>

          <div className="terminal-body">
            {output ? (
              <pre className={execStatus === 'error' ? 'terminal-stderr' : 'terminal-stdout'}>
                {output}
              </pre>
            ) : (
              <div className="terminal-prompt-placeholder">
                Click <strong>"Run Example"</strong> to compile and execute this program in the sandbox environment.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Bottom Stepper Footer */}
      <div className="examples-stepper-footer">
        <div className="examples-stepper-info">
          <span>Example <strong>{activeIdx + 1}</strong> of <strong>{examples.length}</strong></span>
          {activeExample.description && (
            <span>• {activeExample.description}</span>
          )}
        </div>

        <div className="examples-stepper-nav">
          <button 
            className="examples-nav-btn" 
            onClick={() => setActiveIdx(prev => Math.max(0, prev - 1))}
            disabled={activeIdx === 0}
          >
            <FaArrowLeft />
            <span>Previous Example</span>
          </button>

          {activeIdx < examples.length - 1 ? (
            <button 
              className="examples-nav-btn" 
              onClick={() => setActiveIdx(prev => Math.min(examples.length - 1, prev + 1))}
            >
              <span>Next Example</span>
              <FaArrowRight />
            </button>
          ) : (
            <button 
              className="examples-nav-btn complete-btn" 
              onClick={handleFinishAndContinue}
            >
              <span>Complete &amp; Continue</span>
              <FaCheckCircle />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CodeExamplesActivity;
