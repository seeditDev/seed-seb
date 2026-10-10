import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import {
  FaPlay,
  FaRedo,
  FaCheckCircle,
  FaArrowLeft,
  FaArrowRight,
  FaClock,
  FaDatabase,
  FaCheck,
  FaExclamationCircle,
  FaCode,
  FaInfoCircle,
} from 'react-icons/fa';
import { toast } from 'sonner';
import SchemaExplorer from './sql/SchemaExplorer';
import QueryResultGrid from './sql/QueryResultGrid';
import { executeStudentQuery } from '../services/sql/sqlExecutionEngine';
import { evaluateStudentResult } from '../services/sql/sqlEvaluator';

export default function SQLSectionView({
  sectionData,
  secTimer = 0,
  secStarted = true,
  proctoringData = {},
  settings = {},
  onSectionSubmit,
  assessmentName = '',
  assessmentId = '',
  user = null,
}) {
  // Normalize questions array
  const questions = useMemo(() => {
    const list =
      sectionData?.questions ||
      sectionData?.sqlQuestions ||
      sectionData?.challenges ||
      sectionData?.items ||
      [];
    return list.map((q, idx) => {
      let expectedResult = q.expectedResult || null;
      if (expectedResult && typeof expectedResult === 'object') {
        let rows = expectedResult.rows;
        if (!Array.isArray(rows) && typeof expectedResult.rowsJson === 'string') {
          try {
            rows = JSON.parse(expectedResult.rowsJson);
          } catch {
            rows = [];
          }
        }
        expectedResult = {
          columns: Array.isArray(expectedResult.columns) ? expectedResult.columns : [],
          rows: Array.isArray(rows) ? rows : [],
          rowCount: Number(expectedResult.rowCount ?? (Array.isArray(rows) ? rows.length : 0)),
        };
      }

      return {
        ...q,
        id: q.id || q.questionId || `sql_q_${idx}`,
        marks: Number(q.marks || 10),
        difficulty: q.difficulty || 'easy',
        starterQuery: q.starterQuery || 'SELECT * FROM employees;\n',
        problemStatement: q.problemStatement || q.description || q.statement || 'Write an SQL query to retrieve the required records.',
        title: q.title || `SQL Question ${idx + 1}`,
        expectedResult,
        evaluationRules: q.evaluationRules || {},
      };
    });
  }, [sectionData]);

  // Normalize database tables
  const tables = useMemo(() => {
    if (sectionData?.schema?.tables && Array.isArray(sectionData.schema.tables)) {
      return sectionData.schema.tables;
    }
    if (sectionData?.sqlSchema?.tables && Array.isArray(sectionData.sqlSchema.tables)) {
      return sectionData.sqlSchema.tables;
    }
    if (Array.isArray(sectionData?.tables)) {
      return sectionData.tables;
    }
    return [];
  }, [sectionData]);

  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [isExecuting, setIsExecuting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Storage key for local draft persistence
  const storageKey = useMemo(() => {
    const uId = user?.uid || user?.id || 'guest';
    const aId = assessmentId || sectionData?.assessmentId || 'assessment';
    const sId = sectionData?.sectionId || sectionData?.id || 'sql_section';
    return `msa_sql_state_${uId}_${aId}_${sId}`;
  }, [user, assessmentId, sectionData]);

  // Per-question state keyed by question id
  const [qStates, setQStates] = useState(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch (_) {}

    const init = {};
    questions.forEach((q) => {
      init[q.id] = {
        query: q.starterQuery || 'SELECT * FROM employees;\n',
        lastResult: null,
        submitted: false,
        marksAwarded: 0,
        status: 'UNATTEMPTED',
        lastFeedback: null,
      };
    });
    return init;
  });

  // Sync to sessionStorage on state changes
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(qStates));
    } catch (_) {}
  }, [qStates, storageKey]);

  const activeQ = questions[currentQIdx] || questions[0] || {};
  const activeState = qStates[activeQ.id] || {
    query: activeQ.starterQuery || '',
    lastResult: null,
    submitted: false,
    marksAwarded: 0,
    status: 'UNATTEMPTED',
    lastFeedback: null,
  };

  const currentQuery = activeState.query;

  const handleQueryChange = (val) => {
    setQStates((prev) => ({
      ...prev,
      [activeQ.id]: {
        ...prev[activeQ.id],
        query: val,
      },
    }));
  };

  // Run Query (Test without scoring final submission)
  const handleRunQuery = async () => {
    if (!currentQuery.trim()) {
      toast.error('Please enter a query before running.');
      return;
    }

    setIsExecuting(true);
    try {
      const res = executeStudentQuery(tables, currentQuery, { timeoutMs: 3500 });
      setQStates((prev) => ({
        ...prev,
        [activeQ.id]: {
          ...prev[activeQ.id],
          lastResult: res,
        },
      }));

      if (!res.success) {
        toast.error(`Execution error: ${res.error}`);
      } else {
        toast.success(`Query returned ${res.rowCount} row(s) in ${res.executionTimeMs}ms.`);
      }
    } catch (err) {
      toast.error(`Execution failed: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  // Submit Answer for this specific question
  const handleSubmitAnswer = async () => {
    if (!currentQuery.trim()) {
      toast.error('Query cannot be empty');
      return;
    }

    setIsExecuting(true);
    try {
      const execRes = executeStudentQuery(tables, currentQuery, { timeoutMs: 3500 });
      const evalRes = evaluateStudentResult(
        execRes,
        activeQ.expectedResult,
        activeQ.marks,
        activeQ.evaluationRules
      );

      setQStates((prev) => ({
        ...prev,
        [activeQ.id]: {
          ...prev[activeQ.id],
          lastResult: execRes,
          submitted: true,
          marksAwarded: evalRes.marksAwarded,
          status: evalRes.status,
          lastFeedback: evalRes.feedback,
        },
      }));

      if (evalRes.passed) {
        toast.success(`Question Submitted! Full marks awarded (${evalRes.marksAwarded}/${activeQ.marks}).`);
      } else {
        toast.warning(`Submitted: ${evalRes.feedback}`);
      }
    } catch (err) {
      toast.error(`Submission error: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  // Reset Query to default boilerplate
  const handleResetQuery = () => {
    setQStates((prev) => ({
      ...prev,
      [activeQ.id]: {
        ...prev[activeQ.id],
        query: activeQ.starterQuery || 'SELECT * FROM employees;\n',
      },
    }));
    toast.info('Query reset to default template.');
  };

  // Submit the entire SQL section
  const handleFinalSectionSubmit = () => {
    let totalAwarded = 0;
    let maxSectionMarks = 0;
    const submissions = [];

    questions.forEach((q) => {
      const state = qStates[q.id] || {};
      const marks = Number(state.marksAwarded || 0);
      totalAwarded += marks;
      maxSectionMarks += q.marks;

      submissions.push({
        questionId: q.id,
        title: q.title,
        marksAwarded: marks,
        maxMarks: q.marks,
        status: state.status || 'UNATTEMPTED',
        submittedQuery: state.query || '',
        submitted: Boolean(state.submitted),
      });
    });

    const sectionResult = {
      sectionId: sectionData?.sectionId || sectionData?.id || 'sql_section',
      sectionType: 'sql',
      name: sectionData?.name || 'SQL Assessment Section',
      totalMarks: maxSectionMarks,
      score: totalAwarded,
      marksAwarded: totalAwarded,
      maxMarks: maxSectionMarks,
      percentage: maxSectionMarks > 0 ? Math.round((totalAwarded / maxSectionMarks) * 100) : 0,
      questionsAttempted: submissions.filter((s) => s.submitted).length,
      totalQuestions: questions.length,
      submissions,
      sqlSubmissions: submissions,
    };

    setShowSubmitModal(false);
    if (typeof onSectionSubmit === 'function') {
      onSectionSubmit(sectionResult);
    }
  };

  // Keyboard shortcut: Ctrl+Enter to run query
  const handleKeyDown = useCallback(
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRunQuery();
      }
    },
    [currentQuery, tables]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const attemptedCount = useMemo(() => {
    return Object.values(qStates).filter((s) => s.submitted).length;
  }, [qStates]);

  const formatTimer = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-50 dark:bg-slate-950 overflow-hidden text-slate-800 dark:text-slate-100">
      {/* Top Section Header */}
      <div className="h-12 px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            <FaDatabase />
            {sectionData?.name || 'SQL Assessment Section'}
          </span>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <span className="text-xs text-slate-500 font-medium">
            Question {currentQIdx + 1} of {questions.length}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-mono font-semibold text-slate-700 dark:text-slate-300">
            <FaClock className="text-indigo-500" />
            <span>{formatTimer(secTimer)}</span>
          </div>

          <button
            type="button"
            onClick={() => setShowSubmitModal(true)}
            className="px-3 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            Submit Section
          </button>
        </div>
      </div>

      {/* Main Split Layout: Left Problem/Schema, Right SQL Workspace */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Left Panel: Problem Statement & Schema Explorer (5 cols) */}
        <div className="lg:col-span-5 border-r border-slate-200 dark:border-slate-800 overflow-y-auto p-4 space-y-4 bg-white/70 dark:bg-slate-900/40">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 uppercase">
                {activeQ.difficulty}
              </span>
              <span className="text-xs font-bold text-slate-500">
                {activeQ.marks} Marks
              </span>
            </div>

            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {activeQ.title}
            </h2>

            <div className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
              {activeQ.problemStatement}
            </div>
          </div>

          {/* Schema Explorer */}
          <div className="pt-2">
            <SchemaExplorer tables={tables} />
          </div>
        </div>

        {/* Right Panel: Monaco SQL Editor & Execution Results (7 cols) */}
        <div className="lg:col-span-7 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
          {/* Editor Controls */}
          <div className="p-2.5 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <FaCode className="text-indigo-500" />
              <span>SQL Query Editor</span>
              <span className="text-[10px] text-slate-400 font-mono">(Ctrl + Enter to run)</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetQuery}
                title="Reset query template"
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs flex items-center gap-1 transition"
              >
                <FaRedo className="text-[10px]" />
                Reset
              </button>

              <button
                type="button"
                onClick={handleRunQuery}
                disabled={isExecuting}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                <FaPlay className="text-[10px]" />
                Run Query
              </button>

              <button
                type="button"
                onClick={handleSubmitAnswer}
                disabled={isExecuting}
                className="px-3.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                <FaCheck className="text-[10px]" />
                Submit Answer
              </button>
            </div>
          </div>

          {/* Monaco Editor Container */}
          <div className="flex-1 min-h-[220px] max-h-[45vh] border-b border-slate-200 dark:border-slate-800">
            <Editor
              height="100%"
              language="sql"
              theme="vs-dark"
              value={currentQuery}
              onChange={handleQueryChange}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                renderLineHighlight: 'all',
                automaticLayout: true,
                tabSize: 2,
              }}
            />
          </div>

          {/* Results Grid Container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Execution Output
              </h4>
              {activeState.submitted && (
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <FaCheckCircle />
                  Answer Submitted ({activeState.marksAwarded}/{activeQ.marks} Marks)
                </span>
              )}
            </div>

            <QueryResultGrid
              result={activeState.lastResult}
              isExecuting={isExecuting}
              evaluationFeedback={
                activeState.lastFeedback ? { feedback: activeState.lastFeedback, passed: activeState.status === 'CORRECT' } : null
              }
            />
          </div>
        </div>
      </div>

      {/* Bottom Question Navigation Toolbar */}
      <div className="h-12 px-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shrink-0">
        <button
          type="button"
          disabled={currentQIdx === 0}
          onClick={() => setCurrentQIdx((prev) => Math.max(0, prev - 1))}
          className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5 transition"
        >
          <FaArrowLeft className="text-[10px]" />
          Previous
        </button>

        {/* Question Palette Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-md">
          {questions.map((q, idx) => {
            const isCurrent = idx === currentQIdx;
            const isSubmitted = Boolean(qStates[q.id]?.submitted);
            return (
              <button
                key={q.id || idx}
                type="button"
                onClick={() => setCurrentQIdx(idx)}
                className={`w-7 h-7 rounded-lg text-xs font-bold transition flex items-center justify-center cursor-pointer ${
                  isCurrent
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : isSubmitted
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={currentQIdx === questions.length - 1}
          onClick={() => setCurrentQIdx((prev) => Math.min(questions.length - 1, prev + 1))}
          className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5 transition"
        >
          Next
          <FaArrowRight className="text-[10px]" />
        </button>
      </div>

      {/* Submit Section Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Submit SQL Assessment Section?
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              You have attempted <span className="font-bold text-indigo-600">{attemptedCount}</span> of{' '}
              <span className="font-bold">{questions.length}</span> SQL questions. Once submitted, you cannot revisit this section.
            </p>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-xs space-y-1">
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>Total Questions:</span>
                <span className="font-bold">{questions.length}</span>
              </div>
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span>Submitted Answers:</span>
                <span className="font-bold">{attemptedCount}</span>
              </div>
              <div className="flex justify-between text-amber-600 dark:text-amber-400">
                <span>Unattempted Questions:</span>
                <span className="font-bold">{questions.length - attemptedCount}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Continue Assessment
              </button>
              <button
                type="button"
                onClick={handleFinalSectionSubmit}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition"
              >
                Confirm Submission
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
