import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { MONACO_FONT_OPTIONS, remeasureMonacoFonts } from '../../../utils/monacoFontFix';
import { 
  FaPlay, FaCheck, FaTimes, FaSpinner, 
  FaCode, FaTerminal, FaCheckCircle, FaExclamationTriangle,
  FaFileCode, FaShieldAlt
} from 'react-icons/fa';
import desktopBridge from '../../../utils/desktopBridge';
import { useSystemTheme } from '../../services/courseThemeHelper';
import ProblemMarkdownRenderer, { ProblemImage } from '../../../components/common/ProblemMarkdownRenderer';

const DEFAULT_BOILERPLATES = {
  cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}`,
  c: `#include <stdio.h>\n\nint main() {\n    // Write your solution here\n    return 0;\n}`,
  java: `import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // Write your solution here\n    }\n}`,
  python: `import sys\n\ndef main():\n    # Write your solution here\n    pass\n\nif __name__ == '__main__':\n    main()`
};

const CourseMSACodingSection = ({
  codingData,
  moduleTitle,
  onComplete,
  passingPercentage = 90
}) => {
  const { monacoTheme } = useSystemTheme();
  const problems = codingData?.problems || (codingData?.problem ? [codingData.problem] : []);
  const [activeProblemIdx, setActiveProblemIdx] = useState(0);

  const activeProblem = problems[activeProblemIdx] || {
    problemId: 'P101',
    title: 'Hands-On Milestone Coding Challenge',
    difficulty: 'Medium',
    problemStatement: 'Implement an optimal algorithm to solve the problem as described in the specification.',
    sampleTestCases: [
      { input: '5', output: '10', explanation: 'Sample test case demonstration' }
    ],
    constraints: '1 <= N <= 10^5',
    boilerplates: DEFAULT_BOILERPLATES
  };

  const [language, setLanguage] = useState('cpp');
  const [codeMap, setCodeMap] = useState({});
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('testcases'); // 'testcases' | 'console'
  const [testCaseResults, setTestCaseResults] = useState({});
  const [consoleOutput, setConsoleOutput] = useState('');
  const [problemScores, setProblemScores] = useState({});
  const [isAllSubmitted, setIsAllSubmitted] = useState(false);
  const [overallResult, setOverallResult] = useState(null);

  const editorRef = useRef(null);

  // Initialize boilerplates
  const currentProblemId = activeProblem.problemId || `prob_${activeProblemIdx}`;
  const currentCode = codeMap[`${currentProblemId}_${language}`] || 
    activeProblem.boilerplates?.[language] || 
    DEFAULT_BOILERPLATES[language] || 
    DEFAULT_BOILERPLATES.cpp;

  const handleLanguageChange = (newLang) => {
    setLanguage(newLang);
  };

  const handleEditorChange = (val) => {
    setCodeMap(prev => ({
      ...prev,
      [`${currentProblemId}_${language}`]: val
    }));
  };

  // Run Code against Sample Test Cases
  const handleRunCode = async () => {
    setIsRunning(true);
    setActiveTab('testcases');
    setConsoleOutput('Running code against sample test cases...');

    const sampleCases = activeProblem.sampleTestCases || [
      { input: 'sample', output: 'sample' }
    ];

    const results = [];
    let allPassed = true;

    for (let i = 0; i < sampleCases.length; i++) {
      const tc = sampleCases[i];
      try {
        const res = await desktopBridge.runDirectSandbox(language, currentCode, tc.input || '');
        const out = (res.stdout || '').trim();
        const expected = (tc.output || '').trim();
        const passed = out === expected || out.replace(/\r\n/g, '\n') === expected.replace(/\r\n/g, '\n');
        if (!passed) allPassed = false;

        results.push({
          caseNum: i + 1,
          input: tc.input,
          expected: tc.output,
          actual: out,
          error: res.stderr || null,
          passed
        });
      } catch (err) {
        allPassed = false;
        results.push({
          caseNum: i + 1,
          input: tc.input,
          expected: tc.output,
          actual: '',
          error: err.message,
          passed: false
        });
      }
    }

    setTestCaseResults(prev => ({
      ...prev,
      [currentProblemId]: results
    }));

    setConsoleOutput(allPassed ? 'All sample test cases passed!' : 'Some sample test cases failed.');
    setIsRunning(false);
  };

  // Submit problem against all test cases (sample + hidden)
  const handleSubmitProblem = async () => {
    setIsSubmitting(true);
    const allCases = [
      ...(activeProblem.sampleTestCases || []),
      ...(activeProblem.hiddenTestCases || [])
    ];

    if (allCases.length === 0) {
      allCases.push({ input: 'test', output: 'test' });
    }

    let passedCases = 0;
    for (const tc of allCases) {
      try {
        const res = await desktopBridge.runDirectSandbox(language, currentCode, tc.input || '');
        const out = (res.stdout || '').trim();
        const expected = (tc.output || '').trim();
        if (out === expected || out.replace(/\r\n/g, '\n') === expected.replace(/\r\n/g, '\n')) {
          passedCases++;
        }
      } catch (_) {}
    }

    const pct = Math.round((passedCases / allCases.length) * 100);
    const updatedScores = {
      ...problemScores,
      [currentProblemId]: pct
    };
    setProblemScores(updatedScores);
    setIsSubmitting(false);

    // If all problems are submitted or single problem
    const probCount = problems.length || 1;
    const submittedCount = Object.keys(updatedScores).length;

    if (submittedCount >= probCount) {
      const allProblemsClearedAllCases = Object.values(updatedScores).every(score => score === 100);
      const avgScore = Math.round(Object.values(updatedScores).reduce((a, b) => a + b, 0) / probCount);
      const resObj = {
        codingScore: avgScore,
        allTestCasesPassed: allProblemsClearedAllCases,
        passed: allProblemsClearedAllCases, // In MSA assessments, coding questions MUST clear all test cases (100%)
        passingPercentage: 100
      };
      setOverallResult(resObj);
      setIsAllSubmitted(true);
      onComplete?.(resObj);
    } else {
      // Advance to next problem if available
      if (activeProblemIdx < problems.length - 1) {
        setActiveProblemIdx(prev => prev + 1);
      }
    }
  };

  if (isAllSubmitted && overallResult) {
    return (
      <div className="msa-section-verdict-card">
        <div className={`verdict-circle ${overallResult.passed ? 'passed' : 'failed'}`}>
          {overallResult.passed ? <FaCheckCircle /> : <FaTimes />}
        </div>
        <h3 className="verdict-title">
          {overallResult.passed ? 'Coding Requirement Fulfilled (100%)!' : 'Coding Section Incomplete'}
        </h3>
        <div className="verdict-score-row">
          <span className="verdict-number">{overallResult.codingScore}%</span>
          <span className="verdict-sub">Test Cases Cleared</span>
        </div>
        <p className="verdict-desc">
          {overallResult.passed
            ? `Outstanding! You cleared all test cases (100%) across all coding challenges.`
            : `You achieved ${overallResult.codingScore}%. As in SEED-IT MSA assessments, coding challenges must clear all test cases (100%) to clear this section.`}
        </p>
        <div className="verdict-actions">
          {overallResult.passed ? (
            <div className="status-pill passed"><FaCheck style={{ marginRight: '6px' }} /> Coding Section Cleared (100% Test Cases)</div>
          ) : (
            <button
              className="msa-retry-btn"
              onClick={() => {
                setProblemScores({});
                setIsAllSubmitted(false);
                setOverallResult(null);
              }}
            >
              Retry Coding Challenges
            </button>
          )}
        </div>
      </div>
    );
  }

  const currentCaseResults = testCaseResults[currentProblemId] || [];

  return (
    <div className="course-msa-coding-workspace">
      {/* Top Coding Bar */}
      <div className="msa-coding-top-bar">
        <div className="coding-tabs-left">
          <span className="coding-badge">SECTION 2: CODING ASSESSMENT</span>
          {problems.map((p, idx) => (
            <button
              key={p.problemId || idx}
              className={`prob-selector-tab ${idx === activeProblemIdx ? 'active' : ''}`}
              onClick={() => setActiveProblemIdx(idx)}
            >
              <FaFileCode />
              <span>Problem {idx + 1}: {p.title || `Challenge ${idx + 1}`}</span>
              {problemScores[p.problemId || `prob_${idx}`] !== undefined && (
                <span className="prob-score-pill">
                  {problemScores[p.problemId || `prob_${idx}`]}%
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="coding-actions-right">
          <select
            className="msa-lang-dropdown"
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
          >
            <option value="cpp">C++ (GCC)</option>
            <option value="c">C (GCC)</option>
            <option value="java">Java (OpenJDK)</option>
            <option value="python">Python 3</option>
          </select>
        </div>
      </div>

      {/* Main Split Pane: Problem Description Left, Monaco Editor Right */}
      <div className="msa-coding-split-grid">
        {/* Left: Problem Statement Pane */}
        <div className="msa-problem-desc-col">
          <div className="problem-header-row">
            <h3 className="problem-title">{activeProblem.title}</h3>
            <span className="problem-diff-badge easy">{activeProblem.difficulty || 'Medium'}</span>
          </div>

          <div className="problem-body-markdown">
            <ProblemMarkdownRenderer content={activeProblem.problemStatement} />
            {(activeProblem.imageUrl || activeProblem.image || activeProblem.figure || activeProblem.diagram || activeProblem.questionImage || activeProblem.assetUrl || activeProblem.content?.imageUrl || activeProblem.content?.image) && (
              <div style={{ margin: '14px 0', textAlign: 'center' }}>
                <ProblemImage 
                  src={activeProblem.imageUrl || activeProblem.image || activeProblem.figure || activeProblem.diagram || activeProblem.questionImage || activeProblem.assetUrl || activeProblem.content?.imageUrl || activeProblem.content?.image} 
                  alt={activeProblem.title || 'Problem Illustration'} 
                />
              </div>
            )}
          </div>

          {/* Sample Cases Display */}
          {(activeProblem.sampleTestCases || []).map((tc, idx) => (
            <div key={idx} className="problem-sample-block">
              <h5>Example {idx + 1}:</h5>
              <pre className="sample-code-box">
                <code>{`Input:\n${tc.input}\n\nOutput:\n${tc.output}${tc.explanation ? `\n\nExplanation:\n${tc.explanation}` : ''}`}</code>
              </pre>
            </div>
          ))}

          {/* Constraints Box */}
          {activeProblem.constraints && (
            <div className="problem-constraints-box">
              <h5>Constraints:</h5>
              <ProblemMarkdownRenderer content={activeProblem.constraints} />
            </div>
          )}
        </div>

        {/* Right: Monaco Editor & Bottom Drawer */}
        <div className="msa-editor-col">
          <div className="msa-monaco-mount">
            <Editor
              height="100%"
              theme={monacoTheme}
              language={language === 'cpp' || language === 'c' ? 'cpp' : (language === 'python' ? 'python' : 'java')}
              value={currentCode}
              onChange={handleEditorChange}
              onMount={(editor, monaco) => { 
                editorRef.current = editor; 
                remeasureMonacoFonts(monaco, editor);
              }}
              options={{
                ...MONACO_FONT_OPTIONS,
                fontSize: 14,
                minimap: { enabled: false },
                automaticLayout: true,
                scrollBeyondLastLine: false,
                tabSize: 4
              }}
            />
          </div>

          {/* Bottom Execution & Test Case Drawer */}
          <div className="msa-coding-bottom-drawer">
            <div className="drawer-header-row">
              <div className="drawer-tabs">
                <button
                  className={`drawer-tab ${activeTab === 'testcases' ? 'active' : ''}`}
                  onClick={() => setActiveTab('testcases')}
                >
                  <FaCheckCircle />
                  <span>Test Cases</span>
                </button>
                <button
                  className={`drawer-tab ${activeTab === 'console' ? 'active' : ''}`}
                  onClick={() => setActiveTab('console')}
                >
                  <FaTerminal />
                  <span>Console Output</span>
                </button>
              </div>

              <div className="drawer-buttons-row">
                <button
                  className="msa-run-btn"
                  onClick={handleRunCode}
                  disabled={isRunning || isSubmitting}
                >
                  {isRunning ? <FaSpinner className="spin-icon" /> : <FaPlay />}
                  <span>Run Code</span>
                </button>

                <button
                  className="msa-submit-code-btn"
                  onClick={handleSubmitProblem}
                  disabled={isRunning || isSubmitting}
                >
                  {isSubmitting ? <FaSpinner className="spin-icon" /> : <FaCheck />}
                  <span>Submit Solution</span>
                </button>
              </div>
            </div>

            <div className="drawer-content-pane">
              {activeTab === 'testcases' ? (
                <div className="testcases-list">
                  {currentCaseResults.length > 0 ? (
                    currentCaseResults.map((tc) => (
                      <div key={tc.caseNum} className={`testcase-row ${tc.passed ? 'passed' : 'failed'}`}>
                        <div className="tc-header">
                          <span className="tc-title">Case {tc.caseNum}</span>
                          <span className={`tc-tag ${tc.passed ? 'passed' : 'failed'}`}>
                            {tc.passed ? 'Passed' : 'Failed'}
                          </span>
                        </div>
                        <div className="tc-details">
                          <div><strong>Input:</strong> <code>{tc.input}</code></div>
                          <div><strong>Expected:</strong> <code>{tc.expected}</code></div>
                          <div><strong>Output:</strong> <code>{tc.actual || tc.error || 'None'}</code></div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="no-tc-notice">Click "Run Code" to test your solution against sample test cases.</p>
                  )}
                </div>
              ) : (
                <pre className="console-output-box">
                  <code>{consoleOutput || 'Ready to run.'}</code>
                </pre>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CourseMSACodingSection;
