import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { MONACO_FONT_OPTIONS, remeasureMonacoFonts } from '../../../utils/monacoFontFix';
import { 
  FaPlay, FaCheck, FaTimes, FaUndo, FaTerminal, 
  FaArrowLeft, FaArrowRight, FaCheckCircle, FaTimesCircle, FaSpinner, FaCode,
  FaShieldAlt, FaLightbulb, FaCheckDouble, FaExternalLinkAlt,
  FaChevronDown, FaChevronUp, FaImage, FaCopy,
  FaGithub
} from 'react-icons/fa';
import desktopBridge from '../../../utils/desktopBridge';
import { fetchQuestion } from '../../../services/codingQuestionBankService';
import { 
  getQuestionSampleTestCases, 
  getQuestionHiddenTestCases, 
  isTestCasePassed 
} from '../../../utils/testCaseUtils';
import { syncPracticeProblemToQuestionBank } from '../../services/learningEngineService';
import { useSystemTheme } from '../../services/courseThemeHelper';
import GitHubSyncModal from '../../../components/common/GitHubSyncModal';
import {
  getGitHubConfig,
  fetchGitHubConfigFromFirestore,
  syncSolvedProblemToGitHub
} from '../../../services/githubSyncService';
import { toast } from 'sonner';

const DEFAULT_BOILERPLATES = {
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    // Read input from cin and write logic
    return 0;
}`,
  python: `import sys, json

def main():
    input_data = sys.stdin.read().strip()
    # Write solution logic
    pass

if __name__ == '__main__':
    main()`,
  java: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        // Read input and write logic
    }
}`,
  c: `#include <stdio.h>
#include <stdlib.h>

int main() {
    // Read input and write logic
    return 0;
}`,
  javascript: `'use strict';
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', line => {
    // Write solution logic
    rl.close();
});`
};

const getBoilerplateForLang = (qbData, lang) => {
  const bps = qbData?.boilerPlates || qbData?.boilerplates || qbData?.starterCode || {};
  if (lang === 'cpp') {
    return bps['C++'] || bps['cpp'] || bps['c++'] || DEFAULT_BOILERPLATES.cpp;
  }
  if (lang === 'python') {
    return bps['Python3'] || bps['python'] || bps['py'] || DEFAULT_BOILERPLATES.python;
  }
  if (lang === 'java') {
    return bps['Java'] || bps['java'] || DEFAULT_BOILERPLATES.java;
  }
  if (lang === 'c') {
    return bps['C'] || bps['c'] || bps['C++'] || DEFAULT_BOILERPLATES.c;
  }
  if (lang === 'javascript') {
    return bps['JavaScript'] || bps['javascript'] || bps['js'] || DEFAULT_BOILERPLATES.javascript;
  }
  return bps[lang] || DEFAULT_BOILERPLATES.cpp;
};

import ProblemMarkdownRenderer, { ProblemImage } from '../../../components/common/ProblemMarkdownRenderer';

const ProblemStatementRenderer = ProblemMarkdownRenderer;

const CourseCodingPracticeView = ({ 
  topic, 
  topicProgress,
  onBack, 
  onContinue,
  onCheckpointComplete, 
  onProblemSolved, 
  user 
}) => {
  const { monacoTheme } = useSystemTheme();

  // Normalize raw questions from topic schema
  const rawProblems = topic?.practiceProblems || topic?.practiceQuestions || topic?.codingQuestions || [];
  const normalizedList = useMemo(() => {
    if (!rawProblems || rawProblems.length === 0) {
      return [{ id: 'Q1001', problemId: 'Q1001', title: 'Problem 1' }];
    }
    return rawProblems.map((p, idx) => {
      if (typeof p === 'string') {
        return { id: p, problemId: p, title: `Problem ${p}` };
      }
      return {
        ...p,
        id: p.problemId || p.questionId || p.id || `P_${idx + 1}`,
        problemId: p.problemId || p.questionId || p.id || `P_${idx + 1}`,
        title: p.title || `Problem ${idx + 1}`,
        difficulty: p.difficulty || 'Medium',
        description: p.description || p.problemStatement || '',
        problemStatement: p.problemStatement || p.description || '',
        constraints: p.constraints || [],
        inputFormat: p.inputFormat || '',
        outputFormat: p.outputFormat || '',
        sampleTestCases: p.sampleTestCases || p.sample_test_cases || [],
        hiddenTestCases: p.hiddenTestCases || p.hidden_test_cases || [],
        boilerPlates: p.boilerPlates || p.boilerplates || {}
      };
    });
  }, [topic?.practiceProblems, topic?.practiceQuestions, topic?.codingQuestions]);

  const [localSolvedIds, setLocalSolvedIds] = useState(() => new Set(topicProgress?.solvedProblems || []));

  useEffect(() => {
    if (topicProgress?.solvedProblems && Array.isArray(topicProgress.solvedProblems)) {
      setLocalSolvedIds(prev => {
        const next = new Set(prev);
        topicProgress.solvedProblems.forEach(id => next.add(id));
        return next;
      });
    }
  }, [topicProgress?.solvedProblems]);

  const [activeQIndex, setActiveQIndex] = useState(0);
  const activeQMeta = normalizedList[activeQIndex] || normalizedList[0];

  // GitHub Sync state
  const [showGitHubModal, setShowGitHubModal] = useState(false);
  const [githubConfig, setGithubConfig] = useState(() => getGitHubConfig());

  useEffect(() => {
    if (user?.uid) {
      fetchGitHubConfigFromFirestore(user.uid).then((cfg) => {
        if (cfg) setGithubConfig(cfg);
      });
    }
  }, [user?.uid]);

  // Loaded full Question data state
  const [loadedQuestion, setLoadedQuestion] = useState(null);
  const [isLoadingQB, setIsLoadingQB] = useState(true);

  const isQuestionSolved = useCallback((q, idx) => {
    if (!q) return false;
    const candidateIds = [
      q.id,
      q.problemId,
      q.questionId,
      (activeQIndex === idx && loadedQuestion?.id),
      (activeQIndex === idx && loadedQuestion?.problemId),
      `P_${idx + 1}`
    ].filter(Boolean);
    return candidateIds.some(id => localSolvedIds.has(id));
  }, [localSolvedIds, activeQIndex, loadedQuestion]);

  const solvedIds = localSolvedIds;

  // Editor states
  const [activeTab, setActiveTab] = useState('description'); // 'description' | 'solution'
  const [selectedLang, setSelectedLang] = useState('cpp');
  const [code, setCode] = useState(DEFAULT_BOILERPLATES.cpp);
  const editorRef = useRef(null);

  // Execution states
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionProgressText, setSubmissionProgressText] = useState('');
  
  // Test cases & Bottom Console Drawer states
  const [activeTestCaseIdx, setActiveTestCaseIdx] = useState(0);
  const [customInput, setCustomInput] = useState('');
  const [sampleResults, setSampleResults] = useState([]);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [consoleOutput, setConsoleOutput] = useState('');
  const [isConsoleOpen, setIsConsoleOpen] = useState(true);
  const [drawerTab, setDrawerTab] = useState('samples'); // 'samples' | 'submission' | 'custom'

  // Trigger smooth Monaco Editor re-layout when collapsible drawer toggles
  const handleToggleConsole = useCallback(() => {
    setIsConsoleOpen(prev => {
      const next = !prev;
      setTimeout(() => {
        editorRef.current?.layout();
      }, 120);
      return next;
    });
  }, []);

  // Load canonical Question from local realCourses JSON or SEED Question Bank
  useEffect(() => {
    let isMounted = true;
    const loadCanonicalQuestion = async () => {
      const qId = activeQMeta?.problemId || activeQMeta?.id;
      if (!qId) return;

      setIsLoadingQB(true);
      setSampleResults([]);
      setSubmissionResult(null);
      setConsoleOutput('');
      setActiveTestCaseIdx(0);
      setDrawerTab('samples');

      // 1. Fast Path: Local Embedded Practice Problem (Zero Network, Zero 404s)
      const hasEmbeddedData = Boolean(
        activeQMeta?.problemStatement || 
        activeQMeta?.sampleTestCases?.length || 
        (activeQMeta?.boilerPlates && Object.keys(activeQMeta.boilerPlates).length > 0)
      );

      if (hasEmbeddedData) {
        const sampleCases = getQuestionSampleTestCases(activeQMeta);
        const hiddenCases = getQuestionHiddenTestCases(activeQMeta);
        const fullObj = {
          ...activeQMeta,
          id: qId,
          problemId: qId,
          title: activeQMeta.title || `Problem ${qId}`,
          difficulty: activeQMeta.difficulty || 'Medium',
          tags: activeQMeta.tags || [],
          problemStatement: activeQMeta.problemStatement || activeQMeta.description || '',
          constraints: activeQMeta.constraints || [],
          inputFormat: activeQMeta.inputFormat || '',
          outputFormat: activeQMeta.outputFormat || '',
          sampleTestCases: sampleCases.length > 0 ? sampleCases : [{ id: 1, input: '', expected: '' }],
          hiddenTestCases: hiddenCases,
          solution: activeQMeta.solution || null,
          boilerPlates: activeQMeta.boilerPlates || activeQMeta.boilerplates || {}
        };

        setLoadedQuestion(fullObj);
        const initialCode = getBoilerplateForLang(fullObj, selectedLang);
        setCode(initialCode);

        setSampleResults(fullObj.sampleTestCases.map((tc, idx) => ({
          id: idx + 1,
          input: tc.input || '',
          expected: tc.expected || tc.expectedOutput || tc.output || '',
          actual: '',
          status: 'pending'
        })));
        setIsLoadingQB(false);
        return;
      }

      try {
        const qbData = await fetchQuestion(qId);
        if (!isMounted) return;

        if (qbData) {
          const sampleCases = getQuestionSampleTestCases(qbData);
          const hiddenCases = getQuestionHiddenTestCases(qbData);

          const fullObj = {
            ...qbData,
            id: qbData.questionId || qId,
            problemId: qbData.questionId || qId,
            title: qbData.title || activeQMeta.title,
            difficulty: qbData.metadata?.difficulty || activeQMeta.difficulty || 'Medium',
            tags: qbData.metadata?.tags || [],
            problemStatement: qbData.content?.problemStatement || qbData.description || activeQMeta.description || '',
            constraints: qbData.content?.constraints || qbData.constraints || [],
            inputFormat: qbData.content?.inputFormat || '',
            outputFormat: qbData.content?.outputFormat || '',
            sampleTestCases: sampleCases.length > 0 ? sampleCases : [{ id: 1, input: '', expected: '' }],
            hiddenTestCases: hiddenCases,
            solution: qbData.solution || null
          };

          setLoadedQuestion(fullObj);
          const initialCode = getBoilerplateForLang(qbData, selectedLang);
          setCode(initialCode);

          // Initialize sample results state
          setSampleResults(fullObj.sampleTestCases.map((tc, idx) => ({
            id: idx + 1,
            input: tc.input || '',
            expected: tc.expected || tc.expectedOutput || tc.output || '',
            actual: '',
            status: 'pending'
          })));
        } else {
          // Fallback if question file not found: use activeQMeta data
          const fallbackObj = {
            id: qId,
            problemId: qId,
            title: activeQMeta.title || `Problem ${qId}`,
            difficulty: activeQMeta.difficulty || 'Medium',
            problemStatement: activeQMeta.description || activeQMeta.problemStatement || 'Solve this algorithmic problem according to the specifications.',
            sampleTestCases: activeQMeta.sampleTestCases || [{ id: 1, input: 'nums = [2,7,11,15], target = 9', expected: '[0,1]' }],
            hiddenTestCases: activeQMeta.hiddenTestCases || []
          };
          setLoadedQuestion(fallbackObj);
          setCode(DEFAULT_BOILERPLATES[selectedLang]);
          setSampleResults(fallbackObj.sampleTestCases.map((tc, idx) => ({
            id: idx + 1,
            input: tc.input || '',
            expected: tc.expected || tc.output || '',
            actual: '',
            status: 'pending'
          })));
        }
      } catch (err) {
        console.error('[CourseCodingPracticeView] Failed to load canonical question:', err);
        setCode(DEFAULT_BOILERPLATES[selectedLang]);
      } finally {
        if (isMounted) setIsLoadingQB(false);
      }
    };

    loadCanonicalQuestion();
    return () => { isMounted = false; };
  }, [activeQMeta?.id, activeQMeta?.problemId]);

  // Handle language switch
  const handleLangChange = (newLang) => {
    setSelectedLang(newLang);
    if (loadedQuestion) {
      setCode(getBoilerplateForLang(loadedQuestion, newLang));
    } else {
      setCode(DEFAULT_BOILERPLATES[newLang] || '');
    }
  };

  // Reset to default boilerplate
  const handleResetCode = () => {
    if (loadedQuestion) {
      setCode(getBoilerplateForLang(loadedQuestion, selectedLang));
      toast.info('Code reset to template boilerplate.');
    }
  };

  // Map language to bridge executor
  const getBridgeLang = (lang) => {
    if (lang === 'cpp') return 'cpp';
    if (lang === 'python') return 'python';
    if (lang === 'java') return 'java';
    if (lang === 'c') return 'c';
    if (lang === 'javascript') return 'javascript';
    return lang;
  };

  // Run Code against Sample Test Cases
  const handleRunCode = async () => {
    if (!loadedQuestion) return;
    setIsRunning(true);
    setIsConsoleOpen(true);
    setTimeout(() => editorRef.current?.layout(), 120);

    const bridgeLang = getBridgeLang(selectedLang);
    const currentCode = editorRef.current ? editorRef.current.getValue() : code;

    try {
      if (drawerTab === 'custom') {
        // Run with custom user stdin
        setConsoleOutput('Executing with custom input...\n');
        const res = await Promise.race([
          desktopBridge.runDirectSandbox(bridgeLang, currentCode, customInput),
          new Promise(resolve => setTimeout(() => resolve({ 
            stdout: '', 
            stderr: 'Execution timed out (5s limit)', 
            exit_code: -1 
          }), 5000))
        ]);

        const outStr = res.stdout || (res.exit_code === 0 && !res.stderr ? 'Execution completed with no stdout.' : '');
        setConsoleOutput(outStr + (res.stderr ? `\n[Stderr]: ${res.stderr}` : ''));
      } else {
        // Run against all sample test cases
        setDrawerTab('samples');
        setConsoleOutput('Running sample test cases...\n');
        const samples = loadedQuestion.sampleTestCases || [];
        const newResults = [];
        let allPassed = true;
        let lastOutput = '';

        for (let i = 0; i < samples.length; i++) {
          const tc = samples[i];
          const rawInput = tc.input || '';
          const expectedClean = (tc.expected || tc.expectedOutput || tc.output || '').toString().trim();

          const res = await Promise.race([
            desktopBridge.runDirectSandbox(bridgeLang, currentCode, rawInput),
            new Promise(resolve => setTimeout(() => resolve({ 
              stdout: '', 
              stderr: 'Execution timed out (5s limit)', 
              exit_code: -1 
            }), 5000))
          ]);

          const actualClean = (res.stdout || '').toString().trim();
          const passed = isTestCasePassed(res.stdout, expectedClean, rawInput, res.exit_code, res.error);
          if (!passed) allPassed = false;

          lastOutput = res.stdout || res.stderr || '';

          newResults.push({
            id: i + 1,
            input: rawInput,
            expected: expectedClean,
            actual: actualClean,
            stderr: res.stderr || (res.error ? String(res.error) : ''),
            status: passed ? 'passed' : 'failed',
            exitCode: res.exit_code
          });
        }

        setSampleResults(newResults);
        setConsoleOutput(lastOutput || (allPassed ? 'All sample test cases executed successfully.' : 'Some sample test cases failed.'));

        if (allPassed && samples.length > 0) {
          toast.success('Sample test cases passed! Ready to submit.');
        } else if (samples.length > 0) {
          toast.error('Sample test cases failed. Review actual output vs expected.');
        }
      }
    } catch (err) {
      setConsoleOutput(`Execution error: ${err.message}`);
      toast.error(`Execution error: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  // Submit Code against Hidden Test Cases
  const handleSubmitCode = async () => {
    if (!loadedQuestion) return;
    setIsSubmitting(true);
    setIsConsoleOpen(true);
    setDrawerTab('submission');
    setTimeout(() => editorRef.current?.layout(), 120);
    setSubmissionResult(null);

    const hiddenCases = loadedQuestion.hiddenTestCases && loadedQuestion.hiddenTestCases.length > 0
      ? loadedQuestion.hiddenTestCases
      : loadedQuestion.sampleTestCases || [];

    const bridgeLang = getBridgeLang(selectedLang);
    const currentCode = editorRef.current ? editorRef.current.getValue() : code;

    let passedCount = 0;
    const totalCount = hiddenCases.length;
    const testDetails = [];

    try {
      for (let i = 0; i < totalCount; i++) {
        setSubmissionProgressText(`Evaluating hidden test case ${i + 1} of ${totalCount}...`);
        const tc = hiddenCases[i];
        const rawInput = tc.input || '';
        const expectedClean = (tc.expected || tc.expectedOutput || tc.output || '').toString().trim();

        if (i > 0) await new Promise(r => setTimeout(r, 40));

        const res = await Promise.race([
          desktopBridge.runDirectSandbox(bridgeLang, currentCode, rawInput),
          new Promise(resolve => setTimeout(() => resolve({ 
            stdout: '', 
            stderr: 'Execution timed out (5s limit)', 
            exit_code: -1 
          }), 5000))
        ]);

        const actualClean = (res.stdout || '').toString().trim();
        const passed = isTestCasePassed(res.stdout, expectedClean, rawInput, res.exit_code, res.error);
        if (passed) passedCount++;

        testDetails.push({
          id: i + 1,
          passed,
          input: rawInput,
          expected: expectedClean,
          actual: actualClean,
          stderr: res.stderr || ''
        });
      }

      const isAllPassed = passedCount === totalCount && totalCount > 0;
      const subResult = {
        passed: isAllPassed,
        passedCount,
        totalCount,
        percentage: Math.round((passedCount / totalCount) * 100),
        testDetails
      };

      setSubmissionResult(subResult);

      if (isAllPassed) {
        const candidateIds = [
          loadedQuestion?.id,
          loadedQuestion?.problemId,
          activeQMeta?.id,
          activeQMeta?.problemId,
          activeQMeta?.questionId,
          `P_${activeQIndex + 1}`
        ].filter(Boolean);

        // 1. Immediately update local UI state so pills turn green with zero lag
        setLocalSolvedIds(prev => {
          const next = new Set(prev);
          candidateIds.forEach(id => next.add(id));
          return next;
        });

        const primaryId = loadedQuestion?.problemId || loadedQuestion?.id || activeQMeta?.problemId || activeQMeta?.id || `P_${activeQIndex + 1}`;

        // 2. Notify parent with primary ID and all alias IDs
        onProblemSolved?.(primaryId, candidateIds);

        // 3. One-way sync to global Question Bank
        syncPracticeProblemToQuestionBank(user?.uid, primaryId, selectedLang, 100);

        // 3b. One-way sync to personal GitHub repository
        if (githubConfig.isConnected && githubConfig.autoSync) {
          syncSolvedProblemToGitHub(user?.uid, {
            questionId: primaryId,
            title: loadedQuestion?.title || activeQMeta?.title || primaryId,
            difficulty: loadedQuestion?.difficulty || activeQMeta?.difficulty || 'Medium',
            category: topic?.name || topic?.title || 'Course Coding Practice',
            language: selectedLang,
            code: currentCode,
            testCases: hiddenCases,
            isPractice: true,
            description: loadedQuestion?.description || loadedQuestion?.problemStatement || ''
          }).then((res) => {
            if (res?.success) {
              toast.success(`⚡ Solution synced to GitHub (${githubConfig.repo})!`);
            }
          }).catch((err) => console.warn('[GitHubSync] Course problem sync error:', err));
        }

        // 4. Check if all problems in topic are now solved
        const willAllBeSolved = normalizedList.every((q, idx) => {
          if (idx === activeQIndex) return true;
          return isQuestionSolved(q, idx);
        });

        if (willAllBeSolved) {
          toast.success('🎉 All practice problems for this topic are now completed! You can proceed to the next lesson.');
        } else {
          toast.success(`Accepted! Problem ${activeQIndex + 1} of ${normalizedList.length} completed.`);
        }
      } else {
        toast.error(`Wrong Answer: Passed ${passedCount} of ${totalCount} hidden test cases. All must pass for credit.`);
      }
    } catch (err) {
      toast.error(`Submission failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
      setSubmissionProgressText('');
    }
  };

  const isCurrentQSolved = isQuestionSolved(activeQMeta, activeQIndex);
  const totalSolvedInTopic = normalizedList.filter((q, idx) => isQuestionSolved(q, idx)).length;
  const isAllPracticeDone = normalizedList.length > 0 && totalSolvedInTopic >= normalizedList.length;

  return (
    <div className="compiler-fullscreen-workspace">
      {/* Streamlined Clean Top Header Bar (No duplicate breadcrumbs or redundant back buttons) */}
      <div className="compiler-header-bar">
        <div className="compiler-header-left">
          <button className="compiler-return-btn" onClick={onBack} title="Return to Lesson View">
            <FaArrowLeft />
            <span>Lesson</span>
          </button>

          <div className="compiler-questions-pills">
            {normalizedList.map((q, idx) => {
              const qId = q.id || q.problemId || `P_${idx + 1}`;
              const isSolved = isQuestionSolved(q, idx);
              const isActive = idx === activeQIndex;

              return (
                <button
                  key={qId}
                  className={`q-pill ${isActive ? 'active' : ''} ${isSolved ? 'done' : ''}`}
                  onClick={() => setActiveQIndex(idx)}
                  title={`${q.title || `Problem ${idx + 1}`} ${isSolved ? '(Completed)' : '(Pending)'}`}
                >
                  {isSolved ? <FaCheck style={{ fontSize: '10px' }} /> : idx + 1}
                </button>
              );
            })}
          </div>

          <div className="compiler-active-problem-title">
            <span className="title-text">{loadedQuestion?.title || activeQMeta.title}</span>
            <span className={`problem-difficulty-badge ${(loadedQuestion?.difficulty || activeQMeta.difficulty || 'Medium').toLowerCase()}`}>
              {loadedQuestion?.difficulty || activeQMeta.difficulty || 'Medium'}
            </span>
          </div>
        </div>

        <div className="compiler-header-right" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="practice-completion-badge" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12.5px',
            background: isAllPracticeDone ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
            color: isAllPracticeDone ? '#10b981' : 'var(--lp-text-muted)',
            padding: '4px 12px',
            borderRadius: '20px',
            border: `1px solid ${isAllPracticeDone ? '#10b981' : 'rgba(255, 255, 255, 0.1)'}`
          }}>
            {isAllPracticeDone ? <FaCheckDouble /> : <FaCode />}
            <span><strong>{totalSolvedInTopic}</strong> of <strong>{normalizedList.length}</strong> Solved</span>
          </div>

          {isAllPracticeDone && onContinue && (
            <button
              className="compiler-continue-btn"
              onClick={onContinue}
              title="Proceed to Next Lesson / Module"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                transition: 'all 0.2s ease'
              }}
            >
              <span>Next Lesson</span>
              <FaArrowRight />
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowGitHubModal(true)}
            title={githubConfig.isConnected ? `Connected to GitHub as @${githubConfig.username} (${githubConfig.repo})` : 'Connect GitHub for One-Way Sync'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              borderRadius: '20px',
              background: githubConfig.isConnected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.05)',
              border: githubConfig.isConnected ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
              color: githubConfig.isConnected ? '#10b981' : 'var(--lp-text-muted)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <FaGithub />
            <span>{githubConfig.isConnected ? `@${githubConfig.username}` : 'Sync to GitHub'}</span>
          </button>
        </div>
      </div>

      {/* Main Split Layout: Left Problem Pane & Right Editor Pane */}
      <div className="compiler-main-split">
        {/* Left Pane: Independently Scrollable Problem Statement & Media */}
        <div className="problem-panel-left">
          <div className="problem-panel-nav">
            <div className="nav-tabs-group">
              <button 
                className={`problem-tab-btn ${activeTab === 'description' ? 'active' : ''}`}
                onClick={() => setActiveTab('description')}
              >
                Description
              </button>
              {loadedQuestion?.solution && (
                <button 
                  className={`problem-tab-btn ${activeTab === 'solution' ? 'active' : ''}`}
                  onClick={() => setActiveTab('solution')}
                >
                  Editorial Approach
                </button>
              )}
            </div>

            {isCurrentQSolved && (
              <span className="problem-solved-tag">
                <FaCheckCircle /> Solved
              </span>
            )}
          </div>

          {/* Internally Scrollable Question Container */}
          <div className="problem-content-scroll">
            {isLoadingQB ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px', gap: '12px', color: '#38bdf8' }}>
                <FaSpinner className="spin" style={{ fontSize: '24px' }} />
                <span>Loading problem details from SEED Question Bank...</span>
              </div>
            ) : activeTab === 'description' ? (
              <>
                <div className="problem-title-row">
                  <h2 className="problem-title-text">{loadedQuestion?.title}</h2>
                </div>

                {/* Rendered Problem Statement with responsive images */}
                <div className="problem-description-wrapper">
                  <ProblemStatementRenderer 
                    content={loadedQuestion?.problemStatement || activeQMeta?.description || 'Solve this algorithmic problem according to the specifications.'} 
                  />
                  {(loadedQuestion?.imageUrl || loadedQuestion?.image || loadedQuestion?.figure || loadedQuestion?.diagram || loadedQuestion?.questionImage || loadedQuestion?.assetUrl || activeQMeta?.imageUrl || activeQMeta?.image) && (
                    <div style={{ margin: '14px 0', textAlign: 'center' }}>
                      <ProblemImage 
                        src={loadedQuestion?.imageUrl || loadedQuestion?.image || loadedQuestion?.figure || loadedQuestion?.diagram || loadedQuestion?.questionImage || loadedQuestion?.assetUrl || activeQMeta?.imageUrl || activeQMeta?.image} 
                        alt={loadedQuestion?.title || 'Problem Illustration'} 
                      />
                    </div>
                  )}
                </div>

                {loadedQuestion?.inputFormat && (
                  <div className="problem-format-block">
                    <strong className="format-title">Input Format:</strong>
                    <ProblemMarkdownRenderer content={loadedQuestion.inputFormat} />
                  </div>
                )}

                {loadedQuestion?.outputFormat && (
                  <div className="problem-format-block">
                    <strong className="format-title">Output Format:</strong>
                    <ProblemMarkdownRenderer content={loadedQuestion.outputFormat} />
                  </div>
                )}

                {/* Sample Examples */}
                {(loadedQuestion?.sampleTestCases || []).map((tc, idx) => (
                  <div key={idx} className="problem-example-block">
                    <span className="example-block-label">Example {idx + 1}:</span>
                    <pre className="example-pre">
                      <code>
                        <strong>Input:</strong> {tc.input}{'\n'}
                        <strong>Output:</strong> {tc.expected || tc.expectedOutput || tc.output}
                      </code>
                    </pre>
                    {tc.explanation && (
                      <div className="example-explanation-box">
                        <strong style={{ color: 'var(--lp-text-muted)', fontSize: '12px' }}>Explanation:</strong>
                        <ProblemStatementRenderer content={tc.explanation} />
                      </div>
                    )}
                  </div>
                ))}

                {/* Constraints */}
                {loadedQuestion?.constraints && (
                  <div className="problem-constraints-box">
                    <span className="constraints-label"><strong>Constraints:</strong></span>
                    <ProblemMarkdownRenderer content={loadedQuestion.constraints} />
                  </div>
                )}
              </>
            ) : (
              /* Editorial Approach Tab */
              <div className="solution-view-pane">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#f59e0b' }}>
                  <FaLightbulb />
                  <strong style={{ color: 'var(--lp-text)' }}>Editorial &amp; Approach</strong>
                </div>
                <p style={{ fontSize: '13.5px', color: 'var(--lp-text)', lineHeight: '1.65' }}>
                  {loadedQuestion?.solution?.approach || 'Examine optimal algorithmic strategies for this problem pattern.'}
                </p>
                {loadedQuestion?.solution?.code?.Python3 && (
                  <div style={{ marginTop: '14px' }}>
                    <strong style={{ fontSize: '12.5px', color: 'var(--lp-text)' }}>Reference Implementation (Python 3):</strong>
                    <pre style={{ background: 'var(--lp-surface-hover)', padding: '12px', borderRadius: '8px', border: '1px solid var(--lp-border)', fontSize: '12px', color: 'var(--lp-text)', overflowX: 'auto', marginTop: '6px' }}>
                      <code>{loadedQuestion.solution.code.Python3}</code>
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Pane: Editor & Collapsible Testcases Drawer */}
        <div className="editor-panel-right">
          {/* Top Editor Controls */}
          <div className="editor-top-controls">
            <div className="lang-select-group">
              <select 
                className="editor-lang-select"
                value={selectedLang}
                onChange={(e) => handleLangChange(e.target.value)}
              >
                <option value="cpp">C++ (GCC 12)</option>
                <option value="python">Python 3.10</option>
                <option value="java">Java (OpenJDK 17)</option>
                <option value="c">C (GCC 12)</option>
                <option value="javascript">JavaScript (Node 18)</option>
              </select>
            </div>

            <div className="editor-actions-group">
              <button 
                className="editor-action-btn reset"
                onClick={handleResetCode}
                title="Reset code to original template"
              >
                <FaUndo />
                <span>Reset</span>
              </button>
              <button 
                className="editor-action-btn run"
                onClick={handleRunCode}
                disabled={isRunning || isSubmitting}
              >
                {isRunning ? <FaSpinner className="spin" /> : <FaPlay />}
                <span>Run Code</span>
              </button>
              <button 
                className="editor-action-btn submit"
                onClick={handleSubmitCode}
                disabled={isRunning || isSubmitting}
              >
                {isSubmitting ? <FaSpinner className="spin" /> : <FaCheck />}
                <span>Submit</span>
              </button>
            </div>
          </div>

          {/* Monaco Code Canvas - Dynamically fills full height when drawer is collapsed */}
          <div className="monaco-canvas-container">
            <Editor
              height="100%"
              language={selectedLang === 'cpp' || selectedLang === 'c' ? 'cpp' : selectedLang}
              value={code}
              onMount={(editor, monaco) => { 
                editorRef.current = editor; 
                remeasureMonacoFonts(monaco, editor);
                setTimeout(() => editor.layout(), 100);
              }}
              onChange={(newVal) => setCode(newVal || '')}
              theme={monacoTheme}
              options={{
                ...MONACO_FONT_OPTIONS,
                fontSize: 13.5,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                automaticLayout: true
              }}
            />
          </div>

          {/* Collapsible Testcases Drawer (Design matches Course Content Collapsible Rail) */}
          {!isConsoleOpen ? (
            /* Collapsed Compact Rail State */
            <div 
              className="drawer-collapsed-rail"
              onClick={handleToggleConsole}
              title="Click to expand Test Cases & Console"
            >
              <div className="drawer-rail-left">
                <button 
                  className="drawer-rail-expand-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleConsole();
                  }}
                  title="Expand Test Cases & Console"
                >
                  <FaChevronUp />
                </button>
                <span className="drawer-rail-title">TEST CASES &amp; CONSOLE</span>
              </div>

              <div className="drawer-rail-right">
                <span className="rail-dot" />
                <span className="drawer-rail-summary">
                  {sampleResults.length > 0 && sampleResults.some(s => s.status !== 'pending')
                    ? `${sampleResults.filter(s => s.status === 'passed').length}/${sampleResults.length} Samples Passed`
                    : `${(loadedQuestion?.sampleTestCases || []).length} Sample Cases`}
                </span>
                {submissionResult && (
                  <span className={`drawer-rail-sub-badge ${submissionResult.passed ? 'passed' : 'failed'}`}>
                    {submissionResult.passed ? 'Accepted' : 'Failed'}
                  </span>
                )}
              </div>
            </div>
          ) : (
            /* Expanded Drawer State */
            <div className="editor-bottom-drawer open">
              <div className="drawer-header-row">
                <div className="drawer-tabs">
                  <button 
                    className={`drawer-tab-btn ${drawerTab === 'samples' ? 'active' : ''}`}
                    onClick={() => setDrawerTab('samples')}
                  >
                    Sample Test Cases ({sampleResults.length || (loadedQuestion?.sampleTestCases || []).length})
                  </button>
                  <button 
                    className={`drawer-tab-btn ${drawerTab === 'submission' ? 'active' : ''}`}
                    onClick={() => setDrawerTab('submission')}
                  >
                    Submission Results
                    {submissionResult && (
                      <span className={`drawer-tab-mini-badge ${submissionResult.passed ? 'passed' : 'failed'}`}>
                        {submissionResult.passed ? 'Passed' : 'Failed'}
                      </span>
                    )}
                  </button>
                  <button 
                    className={`drawer-tab-btn ${drawerTab === 'custom' ? 'active' : ''}`}
                    onClick={() => setDrawerTab('custom')}
                  >
                    Custom Input
                  </button>
                </div>

                <div className="drawer-header-actions">
                  {drawerTab === 'samples' && sampleResults.some(s => s.status !== 'pending') && (
                    <span className={`drawer-summary-status ${sampleResults.every(s => s.status === 'passed') ? 'passed' : 'failed'}`}>
                      {sampleResults.filter(s => s.status === 'passed').length}/{sampleResults.length} Passed
                    </span>
                  )}
                  <button 
                    className="drawer-collapse-toggle-btn"
                    onClick={handleToggleConsole}
                    title="Collapse Test Cases & Console (Focus Code Editor)"
                  >
                    <FaChevronDown />
                  </button>
                </div>
              </div>

              {/* Drawer Content Panes */}
              <div className="drawer-content-pane">
                {drawerTab === 'custom' ? (
                  <div className="custom-input-box">
                    <label style={{ fontSize: '11.5px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                      Standard Input (stdin):
                    </label>
                    <textarea
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value)}
                      placeholder="Enter custom stdin test arguments..."
                      style={{
                        width: '100%',
                        height: '70px',
                        background: '#090d16',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#f8fafc',
                        borderRadius: '6px',
                        padding: '8px',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        resize: 'none'
                      }}
                    />
                  </div>
                ) : drawerTab === 'submission' ? (
                  /* Hidden Submission Results Breakdown */
                  <div className="submission-drawer-view">
                    {isSubmitting ? (
                      <div style={{ textAlign: 'center', padding: '24px 16px', color: '#38bdf8' }}>
                        <FaSpinner className="spin" style={{ fontSize: '24px', marginBottom: '8px' }} />
                        <h4 style={{ margin: '0 0 4px 0', color: '#f8fafc', fontSize: '14px' }}>Submitting Solution...</h4>
                        <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>{submissionProgressText || 'Evaluating hidden test cases'}</p>
                      </div>
                    ) : submissionResult ? (
                      <div>
                        <div style={{
                          padding: '10px 14px',
                          borderRadius: '8px',
                          marginBottom: '10px',
                          background: submissionResult.passed ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                          border: `1px solid ${submissionResult.passed ? '#10b981' : '#ef4444'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {submissionResult.passed ? (
                              <FaCheckCircle style={{ color: '#10b981', fontSize: '18px' }} />
                            ) : (
                              <FaTimesCircle style={{ color: '#ef4444', fontSize: '18px' }} />
                            )}
                            <strong style={{ fontSize: '14px', color: submissionResult.passed ? '#10b981' : '#ef4444' }}>
                              {submissionResult.passed ? 'Accepted' : 'Wrong Answer'}
                            </strong>
                          </div>
                          <span style={{ fontSize: '12px', color: 'var(--lp-text)' }}>
                            Passed <strong>{submissionResult.passedCount}</strong> / <strong>{submissionResult.totalCount}</strong> hidden test cases ({submissionResult.percentage}%).
                          </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {submissionResult.testDetails?.map((td) => (
                            <div key={td.id} style={{
                              padding: '6px 10px',
                              borderRadius: '6px',
                              background: 'rgba(255, 255, 255, 0.03)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '12px'
                            }}>
                              <span>Test Case #{td.id}</span>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontWeight: 700,
                                color: td.passed ? '#10b981' : '#ef4444'
                              }}>
                                {td.passed ? <><FaCheck /> Passed</> : <><FaTimes /> Failed</>}
                              </span>
                            </div>
                          ))}
                        </div>

                        {submissionResult.passed && (
                          <div style={{ marginTop: '14px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                            {activeQIndex < normalizedList.length - 1 && (
                              <button
                                type="button"
                                onClick={() => setActiveQIndex(prev => prev + 1)}
                                style={{
                                  padding: '8px 16px',
                                  background: '#2563eb',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '6px',
                                  fontWeight: 600,
                                  fontSize: '13px',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)'
                                }}
                              >
                                <span>Next Problem (P{activeQIndex + 2})</span>
                                <FaArrowRight />
                              </button>
                            )}

                            {isAllPracticeDone && onContinue && (
                              <button
                                type="button"
                                onClick={onContinue}
                                style={{
                                  padding: '8px 18px',
                                  background: 'linear-gradient(135deg, #10b981, #059669)',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '6px',
                                  fontWeight: 700,
                                  fontSize: '13px',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
                                }}
                              >
                                <FaCheckDouble />
                                <span>All Done — Proceed to Next Lesson</span>
                                <FaArrowRight />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--lp-text-muted)' }}>
                        <FaShieldAlt style={{ fontSize: '28px', marginBottom: '8px', opacity: 0.4 }} />
                        <p style={{ margin: 0, fontSize: '12.5px' }}>Click "Submit" to evaluate your solution against all hidden grading test cases.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Sample Test Cases Table */
                  <div className="test-cases-table-wrap">
                    <table className="test-cases-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Input</th>
                          <th>Expected Output</th>
                          <th>Actual Output</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sampleResults.map((tc) => (
                          <tr key={tc.id}>
                            <td>{tc.id}</td>
                            <td><code>{tc.input}</code></td>
                            <td><code>{tc.expected}</code></td>
                            <td><code>{tc.actual || '—'}</code></td>
                            <td>
                              {tc.status === 'passed' ? (
                                <span className="status-pill passed"><FaCheckCircle /> Passed</span>
                              ) : tc.status === 'failed' ? (
                                <span className="status-pill failed" style={{ color: '#ef4444', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <FaTimesCircle /> Failed
                                </span>
                              ) : (
                                <span className="status-pill pending" style={{ color: '#94a3b8' }}>Pending</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Console Stdout / Stderr Box */}
                {consoleOutput && (
                  <div className="compiler-stdout-box">
                    <pre style={{ margin: 0 }}>{consoleOutput}</pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* GitHub Sync Modal */}
      {showGitHubModal && (
        <GitHubSyncModal
          user={user}
          onClose={() => {
            setShowGitHubModal(false);
            setGithubConfig(getGitHubConfig());
          }}
        />
      )}
    </div>
  );
};

export default CourseCodingPracticeView;
