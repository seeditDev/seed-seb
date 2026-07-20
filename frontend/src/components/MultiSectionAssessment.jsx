/**
 * MultiSectionAssessment.jsx
 *
 * Multi-section exam orchestrator.
 * MCQ sections use the built-in MCQSectionView.
 * Coding sections mount CodingAssessmentSandbox in embedded mode for full feature parity.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaClock, FaCheckCircle, FaLock, FaBookOpen, FaCode,
  FaArrowLeft, FaArrowRight, FaBookmark,
  FaChevronRight
} from 'react-icons/fa';
import '../styles/MultiSectionAssessment.css';
import '../styles/MCQPage.css';
import '../styles/CodingAssessmentSandbox.css';
import { db } from '../firebase-config';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { safeUpsert } from '../supabaseClient';
import { fetchQuestionsForContest } from '../services/codingQuestionBankService';
import ProctoringEngine from './ProctoringEngine';
import AudioProctoringEngine from './AudioProctoringEngine';
import CodingAssessmentPage from './CodingAssessmentPage';
import SpokenEnglishAssessment from './SpokenEnglishAssessment';
import timeService from '../services/timeService';
import { renderMathAndCode } from '../utils/mathAndCodeRenderer';

// ─── Helpers ────────────────────────────────────────────────────────────────

const slugify = (val = '') =>
  val.toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';


const formatTime = (secs) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const formatSecs = (val) => {
  const m = Math.floor(val / 60);
  const s = val % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const isTruthy = (val) => {
  if (val === undefined || val === null) return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  const s = String(val).trim().toLowerCase();
  return s === 'true' || s === '1';
};

/**
 * Normalises a raw coding question from JSON into the internal schema.
 */
const normalizeQuestion = (q) => {
  if (!q) return q;
  const id = q.questionId || q.id || '';
  const title = q.title || '';
  const description = q.content?.problemStatement || q.description || '';
  const instructions = q.content?.inputFormat || q.instructions || '';
  const constraints = Array.isArray(q.content?.constraints)
    ? q.content.constraints.join('\n')
    : (q.constraints || '');

  // Normalize boilerplates robustly supporting camelCase, lowerCase, and standard language keys
  const getNormalizedLangKey = (k) => {
    const clean = String(k).trim().toLowerCase();
    if (clean === 'c') return 'c';
    if (clean === 'cpp' || clean === 'c++') return 'cpp';
    if (clean === 'java') return 'java';
    if (clean === 'python' || clean === 'python3') return 'python';
    if (clean === 'javascript' || clean === 'js') return 'javascript';
    return clean;
  };

  const rawBoilerplates = q.boilerPlates || q.boilerplates || {};
  const boilerplates = {};

  Object.entries(rawBoilerplates).forEach(([lang, val]) => {
    const norm = getNormalizedLangKey(lang);
    if (norm === 'python') {
      boilerplates.python = val;
      boilerplates.python3 = val;
    } else {
      boilerplates[norm] = val;
    }
  });

  if (q.solution?.code) {
    Object.entries(q.solution.code).forEach(([lang, val]) => {
      const norm = getNormalizedLangKey(lang);
      if (norm === 'python') {
        boilerplates.python = val;
        boilerplates.python3 = val;
      } else {
        boilerplates[norm] = val;
      }
    });
  }

  const testCases = (q.content?.sampleTestCases || []).map(tc => ({
    input: tc.input,
    expected: tc.expected || tc.expectedOutput
  }));

  let hidden = [];
  if (q.testCases?.hidden) {
    hidden = q.testCases.hidden.map(tc => ({ id: tc.id || tc.label, input: tc.input, expected: tc.expectedOutput || tc.expected }));
  } else if (Array.isArray(q.testCases)) {
    hidden = q.testCases.map(tc => ({ id: tc.id || '', input: tc.input, expected: tc.expected }));
  }

  return { ...q, id, title, description, instructions, constraints, boilerplates, testCases, hiddenTests: hidden };
};


// ─── MCQ Section Renderer ────────────────────────────────────────────────────

const MCQSectionView = React.memo(({ sectionData, secTimer, secStarted = false, proctoringData = { violationCount: 0, violations: [] }, settings = {}, onSectionSubmit, assessmentName = '', assessmentId = '' }) => {
  const questions = useMemo(() => sectionData?.questions || [], [sectionData?.questions]);
  const stateKey = `msa_active_mcq_state_${assessmentId}_${sectionData?.id || 'section'}`;

  const [answers, setAnswers] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_mcq_state_${assessmentId}_${sectionData?.id || 'section'}`);
      if (saved) return JSON.parse(saved).answers || {};
    } catch (_) {}
    return {};
  });

  const [questionIndex, setQuestionIndex] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_mcq_state_${assessmentId}_${sectionData?.id || 'section'}`);
      if (saved) return JSON.parse(saved).questionIndex || 0;
    } catch (_) {}
    return 0;
  });

  const [bookmarked, setBookmarked] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_mcq_state_${assessmentId}_${sectionData?.id || 'section'}`);
      if (saved) return JSON.parse(saved).bookmarked || [];
    } catch (_) {}
    return [];
  });

  const [lockedQuestions, setLockedQuestions] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_mcq_state_${assessmentId}_${sectionData?.id || 'section'}`);
      if (saved) return JSON.parse(saved).lockedQuestions || [];
    } catch (_) {}
    return [];
  });

  const [qTimerRemaining, setQTimerRemaining] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_mcq_state_${assessmentId}_${sectionData?.id || 'section'}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.qTimerRemaining !== undefined) return parsed.qTimerRemaining;
      }
    } catch (_) {}
    return settings.questionTimer || 0;
  });

  const [timeSpentPerQ, setTimeSpentPerQ] = useState(() => {
    try {
      const saved = localStorage.getItem(`msa_active_mcq_state_${assessmentId}_${sectionData?.id || 'section'}`);
      if (saved) return JSON.parse(saved).timeSpentPerQ || {};
    } catch (_) {}
    return {};
  });

  // Save active MCQ section state to localStorage on changes
  useEffect(() => {
    const snapshot = {
      answers,
      questionIndex,
      bookmarked,
      lockedQuestions,
      qTimerRemaining,
      timeSpentPerQ
    };
    localStorage.setItem(stateKey, JSON.stringify(snapshot));
  }, [answers, questionIndex, bookmarked, lockedQuestions, qTimerRemaining, timeSpentPerQ, stateKey]);

  const [showReview, setShowReview] = useState(false);
  const [customNotice, setCustomNotice] = useState(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const onSubmitRef = useRef(onSectionSubmit);
  useEffect(() => { onSubmitRef.current = onSectionSubmit; }, [onSectionSubmit]);



  const hasTimerStartedRef = useRef(false);

  // Auto-submit when section timer expires
  useEffect(() => {
    if (secTimer > 0) {
      hasTimerStartedRef.current = true;
    }
    if (secTimer <= 0 && hasTimerStartedRef.current) {
      handleSubmit();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secTimer]);

  const isFirstMount = useRef(true);
  const questionTimerStartedRef = useRef(false);

  // Mark if question timer has successfully started with a positive value
  useEffect(() => {
    if (qTimerRemaining > 0) {
      questionTimerStartedRef.current = true;
    }
  }, [qTimerRemaining]);

  // Per-question lock timer
  useEffect(() => {
    if (settings.questionTimer > 0) {
      questionTimerStartedRef.current = false; // Reset start indicator on question transition
      if (isFirstMount.current) {
        isFirstMount.current = false;
        // Don't reset if we restored a saved timer for this question index!
        const key = `msa_active_mcq_state_${assessmentId}_${sectionData?.id || 'section'}`;
        try {
          const saved = localStorage.getItem(key);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.questionIndex === questionIndex && parsed.qTimerRemaining !== undefined) {
              setQTimerRemaining(parsed.qTimerRemaining);
              return;
            }
          }
        } catch (_) {}
      }
      setQTimerRemaining(settings.questionTimer);
    }
  }, [questionIndex, settings.questionTimer, assessmentId, sectionData]);

  useEffect(() => {
    if (settings.questionTimer <= 0 || !secStarted) return;
    const t = setInterval(() => {
      setQTimerRemaining(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [settings.questionTimer, secStarted]);

  useEffect(() => {
    if (settings.questionTimer > 0 && qTimerRemaining === 0 && questionTimerStartedRef.current) {
      setLockedQuestions(l => {
        if (l.includes(questionIndex)) return l;
        return [...l, questionIndex];
      });
      if (questionIndex + 1 < questions.length) {
        setQuestionIndex(q => q + 1);
      } else {
        handleSubmit();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qTimerRemaining, questionIndex, questions.length, settings.questionTimer]);

  const handleSubmit = useCallback(() => {
    let correct = 0;
    questions.forEach((q, i) => {
      if (answers[i] !== undefined && q.options[answers[i]] === q.correctAnswer) correct++;
    });
    const total = questions.length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

    const questionsDetails = questions.map((q, idx) => {
      const selectedIdx = answers[idx];
      const selectedAnswer = selectedIdx !== undefined ? (q.options?.[selectedIdx] || '') : '';
      const isCorrect = selectedAnswer === q.correctAnswer;
      const timeSpent = timeSpentPerQ[idx] || 0;
      return {
        questionNumber: idx + 1,
        questionText: q.question || q.text || '',
        difficulty: (q.difficulty || 'medium').toLowerCase(),
        topic: q.topic || q.tag || (q.tags ? (Array.isArray(q.tags) ? q.tags[0] : q.tags) : 'General'),
        tags: Array.isArray(q.tags) ? q.tags : (q.tags ? [q.tags] : (q.topic ? [q.topic] : ['General'])),
        isCorrect,
        selectedAnswer,
        correctAnswer: q.correctAnswer || '',
        timeSpent
      };
    });
    
    // Clean up active MCQ state from localStorage
    localStorage.removeItem(stateKey);

    if (onSubmitRef.current) {
      onSubmitRef.current({
        answers,
        timeSpentPerQ,
        score: correct,
        totalQuestions: total,
        totalMarks: total,
        percentage: pct,
        questions: questionsDetails,
        violationCount: 0,
        totalNoFace: 0,
        totalMultipleFaces: 0,
        violations: []
      });
    }
  }, [answers, timeSpentPerQ, questions, stateKey]);

  const questionEnterTimeRef = useRef(null);

  useEffect(() => {
    questionEnterTimeRef.current = timeService.now();
  }, [questionIndex]);

  const handleSelectOption = (optIdx) => {
    if (lockedQuestions.includes(questionIndex)) return;

    // Calculate time spent since entering or last selection on this question
    const now = timeService.now();
    const elapsedMs = now - (questionEnterTimeRef.current || now);
    const elapsedSecs = Math.max(0, Math.round(elapsedMs / 1000));

    setTimeSpentPerQ(prev => ({
      ...prev,
      [questionIndex]: (prev[questionIndex] || 0) + elapsedSecs
    }));

    // Reset enter time to now for subsequent selections
    questionEnterTimeRef.current = now;

    setAnswers(prev => ({ ...prev, [questionIndex]: optIdx }));
  };

  const navQuestion = (dir) => {
    if (settings.questionTimer > 0) return;
    if (dir === 'prev' && questionIndex > 0 && !settings.forwardOnly) setQuestionIndex(q => q - 1);
    if (dir === 'next' && questionIndex < questions.length - 1) {
      setQuestionIndex(q => q + 1);
    }
  };

  const renderTextWithCode = (text) => renderMathAndCode(text, false);

  if (questions.length === 0) {
    return (
      <div className="msa-loading">
        <div className="msa-spinner" />
        <p>Loading MCQ questions...</p>
      </div>
    );
  }

  const q = questions[questionIndex];
  const total = questions.length;
  const attempted = Object.keys(answers).length;
  const pct = total > 0 ? Math.round((attempted / total) * 100) : 0;
  const isLocked = lockedQuestions.includes(questionIndex);

  return (
    <div className="mcq-test-content" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0f172a' }}>

      {/* Submit Confirmation Overlay */}
      {showSubmitConfirm && (
        <div className="mcq-popup-overlay" style={{ zIndex: 10005 }}>
          <div className="mcq-popup-content" style={{ border: '1.5px solid #ef4444', boxShadow: '0 0 20px rgba(239,68,68,0.3)' }}>
            <h3 style={{ color: '#f8fafc', marginBottom: '12px' }}>Submit Section?</h3>
            <p style={{ color: '#94a3b8', lineHeight: '1.6', marginBottom: '20px' }}>
              Are you sure you want to submit this section? You cannot go back or change your answers.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                style={{ padding: '10px 20px', borderRadius: '6px', border: '1px solid #334155', background: '#1e293b', color: '#cbd5e1', fontWeight: '600', cursor: 'pointer' }}
                onClick={() => setShowSubmitConfirm(false)}
              >Cancel</button>
              <button
                style={{ padding: '10px 24px', borderRadius: '6px', border: 'none', background: '#10b981', color: '#fff', fontWeight: '700', cursor: 'pointer' }}
                onClick={() => { setShowSubmitConfirm(false); handleSubmit(); }}
              >Submit Section</button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Notice Overlay */}
      {customNotice && (
        <div className="mcq-popup-overlay" style={{ zIndex: 10010 }}>
          <div className="mcq-popup-content" style={{
            border: `1.5px solid ${customNotice.type === 'error' ? '#ef4444' : customNotice.type === 'success' ? '#10b981' : '#f59e0b'}`,
          }}>
            <h3 style={{ color: customNotice.type === 'error' ? '#ef4444' : customNotice.type === 'success' ? '#10b981' : '#f59e0b' }}>{customNotice.title}</h3>
            <p style={{ margin: '12px 0', color: '#94a3b8', lineHeight: '1.6' }}>{customNotice.message}</p>
            <button
              style={{ padding: '10px 24px', border: 'none', borderRadius: '6px', background: customNotice.type === 'error' ? '#ef4444' : customNotice.type === 'success' ? '#10b981' : '#f59e0b', color: '#fff', fontWeight: '700', cursor: 'pointer' }}
              onClick={() => { const fn = customNotice.onConfirm; setCustomNotice(null); if (fn) fn(); }}
            >Understood</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mcq-test-header-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', background: '#1e293b', borderBottom: '1px solid #334155' }}>
        <div className="mcq-test-info">
          {assessmentName && <p style={{ color: '#64748b', fontSize: '0.75rem', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: '600' }}>{assessmentName}</p>}
          <h1 style={{ fontSize: '1.1rem', color: '#f8fafc', margin: 0 }}>{sectionData?.name || 'MCQ Section'}</h1>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {settings.audioProctored && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              background: (proctoringData?.audioViolationCount || 0) > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.12)',
              color: (proctoringData?.audioViolationCount || 0) > 0 ? '#ef4444' : '#10b981',
              border: (proctoringData?.audioViolationCount || 0) > 0 ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(16,185,129,0.3)',
              padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: '700'
            }}>
              <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: (proctoringData?.audioViolationCount || 0) > 0 ? '#ef4444' : '#10b981', animation: 'pulseLock 1.5s infinite' }} />
              🎤 Audio: {proctoringData?.audioViolationCount || 0}/{settings.maxAudioViolations || 5}
            </div>
          )}
          {settings.proctored && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              background: (proctoringData?.violationCount || 0) > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.12)',
              color: (proctoringData?.violationCount || 0) > 0 ? '#ef4444' : '#10b981',
              border: (proctoringData?.violationCount || 0) > 0 ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
              padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: '700'
            }}>
              <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: (proctoringData?.violationCount || 0) > 0 ? '#ef4444' : '#10b981', animation: 'pulseLock 1.5s infinite' }} />
              📷 Camera: {proctoringData?.violationCount || 0}/{settings.maxViolations || 7}
            </div>
          )}
          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{attempted} / {total} Answered</span>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: secTimer <= 60 ? 'rgba(239,68,68,0.15)' : 'rgba(16, 185, 129, 0.12)',
            border: secTimer <= 60 ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
            padding: '5px 12px', borderRadius: '20px', fontSize: '0.85rem',
            color: secTimer <= 60 ? '#ef4444' : '#10b981', fontWeight: '600'
          }}>
            <FaClock />
            <span>{formatTime(secTimer)}</span>
          </div>
          {!settings.timerRestrictedSubmit && (
            <button
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', border: 'none', padding: '7px 18px', borderRadius: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem' }}
              onClick={() => setShowSubmitConfirm(true)}
            >
              Submit Section
            </button>
          )}
        </div>
      </div>

      <div className="mcq-workspace-layout" style={{ flex: 1, overflow: 'hidden', display: 'flex', gap: 0 }}>
        {/* Main question area */}
        <div className="mcq-workspace-main" style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          {showReview ? (
            <div className="mcq-review-container">
              <h3 style={{ color: '#f8fafc', marginBottom: '20px' }}>Review Your Answers</h3>
              <div className="mcq-review-list">
                {questions.map((rq, idx) => (
                  <div key={idx} className="mcq-review-item">
                    <div className="mcq-review-header">
                      <span>Question {idx + 1}</span>
                      <span>{formatSecs(timeSpentPerQ[idx] || 0)}</span>
                    </div>
                    <div className="mcq-review-question">{renderTextWithCode(rq.question)}</div>
                    <div className="mcq-review-answer">
                      Your answer: {answers[idx] !== undefined ? rq.options[answers[idx]] : 'Not answered'}
                    </div>
                    <div className="mcq-review-actions">
                      <button onClick={() => { setQuestionIndex(idx); setShowReview(false); }}>Go to Question</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mcq-review-bottom-nav">
                <button className="mcq-nav-button" onClick={() => setShowReview(false)}>Back to Test</button>
                <button className="mcq-submit-button" onClick={handleSubmit}>Submit Section</button>
              </div>
            </div>
          ) : (
            <>
              <div className="mcq-question-container">
                <div className="mcq-question-header" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <span className="mcq-question-number">Question {questionIndex + 1} of {total}</span>
                  {settings.questionTimer > 0 && (
                    <span style={{
                      fontSize: '0.8rem',
                      background: qTimerRemaining <= 10 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                      color: qTimerRemaining <= 10 ? '#ef4444' : '#6366f1',
                      border: qTimerRemaining <= 10 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(99, 102, 241, 0.3)',
                      padding: '3px 8px', borderRadius: '12px', fontWeight: 'bold'
                    }}>
                      ⏳ Locks in: {qTimerRemaining}s
                    </span>
                  )}
                  <button
                    className={`mcq-bookmark-button ${bookmarked.includes(questionIndex) ? 'bookmarked' : ''}`}
                    onClick={() => setBookmarked(prev => prev.includes(questionIndex) ? prev.filter(x => x !== questionIndex) : [...prev, questionIndex])}
                    style={{ marginLeft: 'auto' }}
                  >
                    <FaBookmark />
                  </button>
                </div>

                {isLocked && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', padding: '12px 16px', color: '#ef4444', marginBottom: '15px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FaLock />
                    <span>This question's timer expired. Your answer is locked.</span>
                  </div>
                )}

                <div className="mcq-question-text">{renderTextWithCode(q.question)}</div>

                <div className="mcq-options">
                  {q.options.map((opt, oIdx) => (
                    <button
                      key={oIdx}
                      className={`mcq-option ${answers[questionIndex] === oIdx ? 'selected' : ''}`}
                      onClick={() => handleSelectOption(oIdx)}
                      disabled={isLocked}
                      style={isLocked ? { cursor: 'not-allowed', opacity: 0.8 } : {}}
                    >
                      <span className="mcq-option-letter">{String.fromCharCode(65 + oIdx)}</span>
                      <span className="mcq-option-text">{renderMathAndCode(opt, true)}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mcq-navigation" style={{ marginTop: '20px' }}>
                <button
                  className="mcq-nav-button"
                  onClick={() => navQuestion('prev')}
                  disabled={questionIndex === 0 || settings.forwardOnly || settings.questionTimer > 0}
                >
                  <FaArrowLeft /> Previous
                </button>
                <button
                  className="mcq-nav-button"
                  onClick={() => navQuestion('next')}
                  disabled={questionIndex === total - 1 || settings.questionTimer > 0}
                >
                  Next <FaArrowRight />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Sidebar */}
        <div className="mcq-workspace-sidebar" style={{ width: '240px', background: '#1e293b', borderLeft: '1px solid #334155', overflowY: 'auto', padding: '16px' }}>
          {/* Progress */}
          <div className="mcq-sidebar-card">
            <h3 className="mcq-sidebar-title">Progress</h3>
            <div className="mcq-progress-container">
              <div className="mcq-progress-meta">
                <span>Answered</span><span>{pct}%</span>
              </div>
              <div className="mcq-progress-bar-outer">
                <div className="mcq-progress-bar-inner" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="mcq-stats-grid" style={{ marginTop: '10px' }}>
              <div className="mcq-stat-card-mini"><span>Done</span><span>{attempted}</span></div>
              <div className="mcq-stat-card-mini"><span>Left</span><span>{total - attempted}</span></div>
            </div>
          </div>

          {/* Question map */}
          <div className="mcq-sidebar-card" style={{ marginTop: '12px' }}>
            <h3 className="mcq-sidebar-title">Question Map</h3>
            <div className="mcq-question-nav-grid">
              {questions.map((_, idx) => {
                let cls = 'mcq-question-nav-item';
                if (answers[idx] !== undefined) cls += ' attempted';
                if (questionIndex === idx) cls += ' current';
                if (bookmarked.includes(idx)) cls += ' bookmarked';
                return (
                  <button
                    key={idx}
                    className={cls}
                    onClick={() => {
                      if (settings.forwardOnly || settings.questionTimer > 0) return;
                      setQuestionIndex(idx);
                      setShowReview(false);
                    }}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
});


// ─── Coding Section Renderer ──────────────────────────────────────────────────
// Uses the real CodingAssessmentPage in embedded mode for full feature parity.

const CodingSectionView = React.memo(({ sectionData, secTimer, settings = {}, proctoringData, onSectionSubmit, assessmentName = '', assessmentId = '' }) => {
  const testData = {
    questions: sectionData?.questions || []
  };

  const embeddedSettings = {
    ...settings,
    proctored: false,
    audioProctored: false
  };

  return (
    <CodingAssessmentPage
      isEmbedded={true}
      testData={testData}
      secTimer={secTimer}
      onSectionSubmit={onSectionSubmit}
      settings={embeddedSettings}
      parentProctoringData={proctoringData}
      parentSettings={settings}
    />
  );
});


// ─── Main Orchestrator ────────────────────────────────────────────────────────

const MultiSectionAssessment = () => {
  const navigate = useNavigate();
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  // coordinator refs
  const examStartTimeRef = useRef(new Date().toISOString());

  // Section coordinator state
  const [currentSecIdx, setCurrentSecIdx] = useState(-1);
  const [secStarted, setSecStarted] = useState(false);
  const [secTimer, setSecTimer] = useState(0);
  const [secCompleted, setSecCompleted] = useState({});
  const [sectionCountdown, setSectionCountdown] = useState(null);
  const [countdownSecIdx, setCountdownSecIdx] = useState(-1);

  // Data stores
  const [sectionData, setSectionData] = useState({});
  const [examResults, setExamResults] = useState({});
  const [examFinished, setExamFinished] = useState(false);
  const [isVisualProctorReady, setIsVisualProctorReady] = useState(false);
  const [isAudioProctorReady, setIsAudioProctorReady] = useState(false);
  const [proctoringData, setProctoringData] = useState({
    violationCount: 0,
    audioViolationCount: 0,
    violations: []
  });

  const shouldUseProctoring = useMemo(() => {
    if (!assessment) return false;
    return isTruthy(assessment.proctored) || (assessment.sections || []).some(s => isTruthy(s.proctored));
  }, [assessment]);

  const shouldUseAudioProctoring = useMemo(() => {
    if (!assessment) return false;
    // Audio proctoring is INDEPENDENT of camera proctoring.
    // Only activate if audioProctored is explicitly true at the top-level or any section.
    // Do NOT fall back to assessment.proctored — that controls camera only.
    return isTruthy(assessment.audioProctored) ||
           (assessment.sections || []).some(s => isTruthy(s.audioProctored));
  }, [assessment]);

  const maxViolations = useMemo(() => {
    if (!assessment) return 7;
    return Number(assessment.maxViolations) || 7;
  }, [assessment]);

  const maxAudioViolations = useMemo(() => {
    if (!assessment) return 5;
    return Number(assessment.maxAudioViolations) || 5;
  }, [assessment]);

  // Crash recovery
  const [restoredProgress, setRestoredProgress] = useState(null);

  const timerRef = useRef(null);
  const examFinishedRef = useRef(examFinished);
  useEffect(() => { examFinishedRef.current = examFinished; }, [examFinished]);

  const handleProctorReady = useCallback(() => {
    console.log('[MSA] Camera Proctoring is ready');
    setIsVisualProctorReady(true);
  }, []);

  const handleProctorViolationUpdate = useCallback((info) => {
    if (!info?.violationType) return;
    setProctoringData(prev => {
      const isReal = ['no_face', 'multiple_faces', 'tab_switch'].includes(info.violationType);
      return {
        ...prev,
        violationCount: typeof info.violationCount === 'number' ? info.violationCount : prev.violationCount,
        violations: isReal ? [...prev.violations, { type: info.violationType, timestamp: info.timestamp }] : prev.violations
      };
    });
  }, []);

  const handleProctorAutoSubmit = useCallback(() => {
    autoSubmitEntireExam('proctoring_violations');
  }, [autoSubmitEntireExam]);

  const handleAudioProctorReady = useCallback(() => {
    console.log('[MSA] Audio Proctoring is ready');
    setIsAudioProctorReady(true);
  }, []);

  const handleAudioProctorViolationUpdate = useCallback((info) => {
    if (!info?.type) return;
    setProctoringData(prev => {
      const nextAudioCount = (prev.audioViolationCount || 0) + 1;
      if (nextAudioCount >= maxAudioViolations) {
        setTimeout(() => {
          autoSubmitEntireExam('proctoring_violations');
        }, 1000);
      }
      return {
        ...prev,
        audioViolationCount: nextAudioCount,
        violations: [...prev.violations, { type: info.type, timestamp: info.timestamp }]
      };
    });
  }, [maxAudioViolations, autoSubmitEntireExam]);

  // ── Block back/forward navigation during exam & hide PyQt SEB nav buttons
  useEffect(() => {
    window.history.pushState({ msaActive: true }, '');
    const handler = () => window.history.pushState({ msaActive: true }, '');
    window.addEventListener('popstate', handler);

    // Hide PyQt SEB navigation controls
    window.__seedHideNavControls = true;

    return () => {
      window.removeEventListener('popstate', handler);
      window.__seedHideNavControls = false;
    };
  }, []);

  // ── Initial load
  useEffect(() => {
    let authData = {};
    let assessmentData = null;
    try {
      authData = JSON.parse(localStorage.getItem('auth_data') || '{}');
      assessmentData = JSON.parse(sessionStorage.getItem('multisectionAssessmentData') || 'null');
    } catch (e) {
      console.error('[MSA] Failed to parse localStorage:', e);
    }

    if (!authData?.Email || !assessmentData) {
      navigate('/student/dashboard');
      return;
    }

    setUser(authData);
    setAssessment(assessmentData);

    // Verify if already completed/submitted
    const checkAttempt = async () => {
      try {
        const college = authData.College || 'KGKITE';
        const year = authData.Year || '2026';
        const docPath = `AssessmentResults/${assessmentData.id}/colleges/${college}/years/${year}/students/${authData.Email}`;
        const docSnap = await getDoc(doc(db, docPath));
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.completed === true || data.status === 'submitted') {
            alert('You have already completed and submitted this assessment. Re-attempts are not permitted.');
            navigate('/student/dashboard');
            return;
          }
        }
      } catch (err) {
        console.error('[MSA] Failed to check existing attempt:', err);
      }
    };
    checkAttempt();

    // Crash recovery
    const progressKey = `msaProgress_${assessmentData.id}`;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(progressKey) || 'null'); } catch (_) {}
    if (saved && saved.email === authData.Email) {
      console.log('[MSA] Restoring partial progress');
      setExamResults(saved.examResults || {});
      setSecCompleted(saved.completedSections || {});
      setRestoredProgress(saved);
    }

    loadAllSections(assessmentData);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Resume after crash
  useEffect(() => {
    if (!assessment || !restoredProgress) return;
    if (restoredProgress.currentSecIdx !== undefined && restoredProgress.currentSecIdx >= 0) {
      console.log('[MSA] Resuming active section index:', restoredProgress.currentSecIdx);
      setCurrentSecIdx(restoredProgress.currentSecIdx);
      setSecStarted(restoredProgress.secStarted || false);
      setSecTimer(restoredProgress.secTimer || 0);
    } else {
      const nextIdx = (restoredProgress.lastSectionIdx ?? -1) + 1;
      const sectionsCount = (assessment.sections || []).length;
      if (nextIdx < sectionsCount) {
        handleStartSection(nextIdx);
      } else {
        setExamFinished(true);
      }
    }
    setRestoredProgress(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment, restoredProgress]);

  // ── Continuous progress save to localStorage
  useEffect(() => {
    if (!assessment || currentSecIdx < 0 || !secStarted) return;
    const progressKey = `msaProgress_${assessment.id}`;
    const snapshot = {
      assessmentId: assessment.id,
      email: user?.Email || '',
      completedSections: secCompleted,
      examResults,
      currentSecIdx,
      secStarted,
      secTimer,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(progressKey, JSON.stringify(snapshot));
  }, [assessment, user, secCompleted, examResults, currentSecIdx, secStarted, secTimer]);

  // ── Fetch all section JSON files
  const loadAllSections = async (exam) => {
    setLoading(true);
    const loaded = {};
    try {
      await Promise.all(
        (exam.sections || []).map(async (sec) => {
          let fetchUrl = sec.url || '';
          if (!fetchUrl || !fetchUrl.endsWith('.json')) {
            fetchUrl = sec.type === 'mcq'
              ? `/seed-contents/mcq/testbank/${slugify(sec.name)}.json`
              : `/seed-contents/coding/testbank/${slugify(sec.name)}.json`;
          }
          let cleanPath = fetchUrl;
          if (cleanPath.startsWith('http')) {
            if (cleanPath.includes('/seed-contents/main/')) {
              cleanPath = cleanPath.split('/seed-contents/main/')[1];
            } else if (cleanPath.includes('/SEEDDB/main/')) {
              cleanPath = cleanPath.split('/SEEDDB/main/')[1];
            } else if (cleanPath.includes('/contents/')) {
              cleanPath = cleanPath.split('/contents/')[1];
            }
          }
          if (cleanPath.startsWith('/seed-contents/')) cleanPath = cleanPath.substring('/seed-contents/'.length);
          else if (cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);

          const githubUrl = `https://raw.githubusercontent.com/seeditDev/seed-contents/main/${cleanPath}`;
          const localUrl = `/seed-contents/${cleanPath}`;

          try {
            let res = await fetch(githubUrl, { cache: 'no-store' });
            if (!res.ok) {
              res = await fetch(localUrl);
              if (!res.ok) throw new Error('Local fetch also failed');
            }
            const data = await res.json();
            if (sec.type === 'coding') {
              let ids = [];
              if (Array.isArray(data.questionIds)) {
                ids = data.questionIds;
              } else if (Array.isArray(data.questions)) {
                ids = data.questions.map(q => typeof q === 'string' ? q : (q.id || q.questionId));
              }

              if (ids.length > 0) {
                try {
                  const resolved = await fetchQuestionsForContest(ids);
                  data.questions = resolved.map(normalizeQuestion);
                } catch (resErr) {
                  console.error('[MSA] Failed to resolve questions from bank:', resErr);
                  data.questions = [];
                }
              } else if (Array.isArray(data.questions)) {
                data.questions = data.questions.map(normalizeQuestion);
              } else {
                data.questions = [];
              }
            }
            loaded[sec.sectionId] = data;
          } catch (e) {
            console.error(`[MSA] Failed to load section "${sec.name}":`, e);
          }
        })
      );
      setSectionData(loaded);
    } catch (err) {
      console.error('[MSA] Error loading sections:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Section timer countdown loop
  useEffect(() => {
    if (secStarted && secTimer > 0) {
      timerRef.current = setInterval(() => {
        setSecTimer(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secStarted, currentSecIdx]);

  // ── Handle timer expiry (outside the state updater)
  useEffect(() => {
    if (secStarted && secTimer === 0) {
      autoSubmitSection();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secTimer, secStarted]);

  // ── Pre-section countdown
  useEffect(() => {
    if (sectionCountdown === null) return;
    if (sectionCountdown <= 0) {
      const activeSec = assessment?.sections?.[countdownSecIdx];
      const qList = activeSec ? sectionData[activeSec.sectionId]?.questions : null;
      const questionsLoaded = Array.isArray(qList) && qList.length > 0;

      const visualReady = !shouldUseProctoring || isVisualProctorReady;
      const audioReady = !shouldUseAudioProctoring || isAudioProctorReady;

      if (questionsLoaded && visualReady && audioReady) {
        setSecStarted(true);
        setSectionCountdown(null);
      }
      return;
    }
    const t = setTimeout(() => setSectionCountdown(prev => prev - 1), 1000);
    return () => clearTimeout(t);
  }, [
    sectionCountdown,
    countdownSecIdx,
    sectionData,
    shouldUseProctoring,
    isVisualProctorReady,
    shouldUseAudioProctoring,
    isAudioProctorReady,
    assessment
  ]);

  const submittingSecIdxRef = useRef(-1);

  const handleStartSection = useCallback((idx) => {
    submittingSecIdxRef.current = -1;
    setCountdownSecIdx(idx);
    setSectionCountdown(10);
    setCurrentSecIdx(idx);
    if (idx === 0) {
      setIsVisualProctorReady(false);
      setIsAudioProctorReady(false);
    }
    if (assessment && assessment.sections) {
      const section = assessment.sections[idx];
      if (section) setSecTimer((section.duration_minutes || 30) * 60);
    }
  }, [assessment]);

  const autoSubmitEntireExam = useCallback((reason) => {
    if (examFinishedRef.current) return;
    examFinishedRef.current = true;
    setSecStarted(false);
    clearInterval(timerRef.current);

    if (user?.Email && assessment) {
      const college = user.College || 'KGKITE';
      const year = user.Year || '2026';
      
      const sectionsList = Object.values(examResults).map(sec => ({
        sectionName: sec.sectionName || '',
        name: sec.sectionName || '',
        score: sec.data?.score || 0,
        totalMarks: sec.data?.totalMarks || sec.data?.totalQuestions || 0,
        maxScore: sec.data?.totalMarks || sec.data?.totalQuestions || 0
      }));

      const aggregatedQuestions = Object.values(examResults)
        .filter(sec => sec.type === 'mcq' && sec.data?.questions)
        .reduce((acc, sec) => acc.concat(sec.data.questions), []);

      const aggregatedCoding = Object.values(examResults)
        .filter(sec => sec.type === 'coding' && sec.data?.coding)
        .reduce((acc, sec) => acc.concat(sec.data.coding), []);

      const totalMarksSum = Object.values(examResults).reduce((a, s) => a + (s.data?.totalMarks || s.data?.totalQuestions || 0), 0);

      const totalScore = Object.values(examResults).reduce((a, s) => a + (s.data?.score || 0), 0);
      const totalQ = Object.values(examResults).reduce((a, s) => a + (s.data?.totalQuestions || 0), 0);
      const pct = totalQ > 0 ? (totalScore / totalQ) : 0;
      const totalViolations = proctoringData.violationCount;

      // Scoring fields
      const partialScore = totalScore;
      const fullScore = (totalQ > 0 && totalScore >= totalQ) ? totalMarksSum : 0;

      const timeStartedISO = examStartTimeRef.current;
      const timeEndedISO = new Date().toISOString();
      const timeTaken = Math.round((new Date(timeEndedISO).getTime() - new Date(timeStartedISO).getTime()) / 1000);
      const timeM = Math.floor(timeTaken / 60);
      const timeS = timeTaken % 60;
      const timeTakenFormatted = `${timeM}:${timeS < 10 ? '0' : ''}${timeS}`;

      const totalNoFace = Object.values(examResults).reduce((a, s) => a + (s.data?.totalNoFace || 0), 0) + 
                          (proctoringData.violations.filter(v => v.type === 'no_face').length);
      const totalMultipleFaces = Object.values(examResults).reduce((a, s) => a + (s.data?.totalMultipleFaces || 0), 0) + 
                                 (proctoringData.violations.filter(v => v.type === 'multiple_faces').length);
      
      const allViolations = proctoringData.violations;

      const attemptData = {
        email: user.Email, rollNumber: user['Roll Number'] || '', name: user.Name || '',
        college, year, department: user.Department || '',
        testID: assessment.id, testName: assessment.name,
        assessmentId: assessment.id, assessmentName: assessment.name,
        submittedAt: serverTimestamp(), submittedAtISO: new Date().toISOString(),
        type: 'multisection',
        sections: examResults,
        sectionsArray: sectionsList,
        questions: aggregatedQuestions,
        coding: aggregatedCoding,
        totalMarks: totalMarksSum,
        score: totalScore,
        totalQuestions: totalQ,
        correctAnswers: totalScore,
        incorrectAnswers: totalQ - totalScore,
        percentage: totalQ > 0 ? Math.round(pct * 100) : 0,
        partialScore,
        fullScore,
        timeTaken: timeTakenFormatted,
        timeTakenSeconds: timeTaken,
        violationCount: totalViolations,
        totalNoFace,
        totalMultipleFaces,
        completed: true,
        status: 'submitted',
        autoSubmitted: true,
        autoSubmitReason: reason || 'proctoring_violations'
      };

      const docPath = `AssessmentResults/${assessment.id}/colleges/${college}/years/${year}/students/${user.Email}`;
      setDoc(doc(db, docPath), attemptData, { merge: true })
        .then(() => console.log('[MSA] Final result saved to Firestore'))
        .catch(e => console.error('[MSA] Firestore final save failed:', e));

      setDoc(doc(db, 'users', user.Email, 'contestAttempts', assessment.id), attemptData, { merge: true })
        .catch(e => console.error('[MSA] Student-centric save failed:', e));

      safeUpsert('mcq_results', {
        roll_number: user['Roll Number'] || '',
        name: user.Name || '',
        email: user.Email,
        college,
        year,
        department: user.Department || '',
        test_id: assessment.id,
        test_name: assessment.name,
        score: totalScore,
        total_questions: totalQ,
        correct_answers: totalScore,
        incorrect_answers: totalQ - totalScore,
        percentage: pct,
        partial_score: partialScore,
        full_score: fullScore,
        time_taken: timeTaken,
        time_taken_formatted: timeTakenFormatted,
        time_started: timeStartedISO,
        time_ended: timeEndedISO,
        submitted_at: timeEndedISO,
        auto_submitted: true,
        auto_submit_reason: reason || 'proctoring_violations',
        violation_count: totalViolations,
        total_no_face: totalNoFace,
        total_multiple_faces: totalMultipleFaces,
        violations: allViolations,
        total_marks: totalMarksSum,
        questions: aggregatedQuestions,
        updated_at: timeEndedISO
      }, { onConflict: 'email,test_id' }).then(
        ({ data, error }) => {
          if (error) {
            console.warn('[MSA] Supabase mcq_results save failed:', error.message || error);
          } else {
            console.log('[MSA] Supabase mcq_results save succeeded:', data);
          }
        },
        e => console.warn('[MSA] Supabase mcq_results save failed (transport):', e)
      );

      // Upsert to unified assessment_results table
      safeUpsert('assessment_results', {
        type: 'multisection',
        test_id: assessment.id,
        test_name: assessment.name,
        roll_number: user['Roll Number'] || '',
        name: user.Name || '',
        email: user.Email,
        college,
        year,
        department: user.Department || '',
        score: totalScore,
        total_questions: totalQ,
        correct_answers: totalScore,
        incorrect_answers: totalQ - totalScore,
        percentage: pct,
        partial_score: partialScore,
        full_score: fullScore,
        status: 'submitted',
        time_taken: timeTaken,
        time_taken_formatted: timeTakenFormatted,
        time_started: timeStartedISO,
        time_ended: timeEndedISO,
        submitted_at: timeEndedISO,
        auto_submitted: true,
        auto_submit_reason: reason || 'proctoring_violations',
        violation_count: totalViolations,
        total_no_face: totalNoFace,
        total_multiple_faces: totalMultipleFaces,
        violations: allViolations,
        total_marks: totalMarksSum,
        questions: aggregatedQuestions,
        coding: aggregatedCoding,
        sections: sectionsList,
        updated_at: timeEndedISO
      }, { onConflict: 'email,test_id,type' }).then(
        ({ data, error }) => {
          if (error) {
            console.warn('[MSA] Supabase assessment_results save failed:', error.message || error);
          } else {
            console.log('[MSA] Supabase assessment_results save succeeded:', data);
          }
        },
        e => console.warn('[MSA] Supabase assessment_results save failed (transport):', e)
      );
    }

    setExamFinished(true);
    sessionStorage.removeItem('multisectionAssessmentData');
    localStorage.removeItem(`msaProgress_${assessment.id}`);

    // Clear MCQ, Coding, and proctoring temporary workspace details
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith(`msa_active_mcq_state_${assessment.id}`) ||
        key.startsWith(`codingAssessmentCode`) ||
        key.startsWith(`codingTimeSpentPerQ`) ||
        key.startsWith(`proctor_violations_`) ||
        key.startsWith(`proctor_events_`)
      )) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  }, [assessment, user, examResults, proctoringData]);

  const autoSubmitSection = useCallback((sectionResults) => {
    if (examFinishedRef.current) return;
    if (!assessment?.sections || currentSecIdx < 0 || currentSecIdx >= assessment.sections.length) return;

    if (submittingSecIdxRef.current === currentSecIdx) {
      console.warn(`[MSA] Duplicate section submission call blocked for section index ${currentSecIdx}`);
      return;
    }
    submittingSecIdxRef.current = currentSecIdx;

    const activeSection = assessment.sections[currentSecIdx];
    if (!activeSection) return;

    const updatedResults = {
      ...examResults,
      [activeSection.sectionId]: {
        sectionName: activeSection.name,
        type: activeSection.type,
        data: sectionResults || {}
      }
    };

    setExamResults(updatedResults);
    setSecCompleted(prev => ({ ...prev, [activeSection.sectionId]: true }));
    setSecStarted(false);
    clearInterval(timerRef.current);

    const nextIdx = currentSecIdx + 1;
    const totalSections = (assessment.sections || []).length;

    if (nextIdx < totalSections) {
      // Save partial progress
      const progressKey = `msaProgress_${assessment.id}`;
      const snapshot = {
        assessmentId: assessment.id,
        email: user?.Email || '',
        completedSections: Object.fromEntries(Object.keys(updatedResults).map(id => [id, true])),
        examResults: updatedResults,
        lastSectionIdx: currentSecIdx,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(progressKey, JSON.stringify(snapshot));

      if (user?.Email) {
        const college = user.College || 'KGKITE';
        const year = user.Year || '2026';
        setDoc(doc(db, `AssessmentResults/${assessment.id}/colleges/${college}/years/${year}/students/${user.Email}`), {
          email: user.Email, rollNumber: user['Roll Number'] || '', name: user.Name || '',
          college, year, department: user.Department || '',
          testID: assessment.id, testName: assessment.name,
          assessmentId: assessment.id, assessmentName: assessment.name,
          type: 'multisection', status: 'partial',
          sectionsCompleted: currentSecIdx + 1, totalSections,
          sections: updatedResults, lastUpdatedAt: serverTimestamp(),
          lastUpdatedAtISO: new Date().toISOString()
        }, { merge: true }).catch(e => console.error('[MSA] Partial Firestore save failed:', e));
      }

      handleStartSection(nextIdx);
    } else {
      // All sections done — final submission
      if (user?.Email) {
        const college = user.College || 'KGKITE';
        const year = user.Year || '2026';
        const sectionsList = Object.values(updatedResults).map(sec => ({
          sectionName: sec.sectionName || '',
          name: sec.sectionName || '',
          score: sec.data?.score || 0,
          totalMarks: sec.data?.totalMarks || sec.data?.totalQuestions || 0,
          maxScore: sec.data?.totalMarks || sec.data?.totalQuestions || 0
        }));

        const aggregatedQuestions = Object.values(updatedResults)
          .filter(sec => sec.type === 'mcq' && sec.data?.questions)
          .reduce((acc, sec) => acc.concat(sec.data.questions), []);

        const aggregatedCoding = Object.values(updatedResults)
          .filter(sec => sec.type === 'coding' && sec.data?.coding)
          .reduce((acc, sec) => acc.concat(sec.data.coding), []);

        const aggregatedSpokenEnglish = Object.values(updatedResults)
          .filter(sec => (sec.type === 'spoken_english' || sec.type === 'speech' || sec.type === 'sea'))
          .map(sec => sec.data || {});

        const totalMarksSum = Object.values(updatedResults).reduce((a, s) => a + (s.data?.totalMarks || s.data?.totalQuestions || 0), 0);

        const totalScore = Object.values(updatedResults).reduce((a, s) => a + (s.data?.score || 0), 0);
        const totalQ = Object.values(updatedResults).reduce((a, s) => a + (s.data?.totalQuestions || 0), 0);
        const pct = totalQ > 0 ? (totalScore / totalQ) : 0;
        const totalViolations = proctoringData.violationCount;

        // Scoring fields
        const partialScore = totalScore;
        const fullScore = (totalQ > 0 && totalScore >= totalQ) ? totalMarksSum : 0;

        // Metrics computation
        const timeStartedISO = examStartTimeRef.current;
        const timeEndedISO = new Date().toISOString();
        const timeTaken = Math.round((new Date(timeEndedISO).getTime() - new Date(timeStartedISO).getTime()) / 1000);
        const timeM = Math.floor(timeTaken / 60);
        const timeS = timeTaken % 60;
        const timeTakenFormatted = `${timeM}:${timeS < 10 ? '0' : ''}${timeS}`;

        const totalNoFace = proctoringData.violations.filter(v => v.type === 'no_face').length;
        const totalMultipleFaces = proctoringData.violations.filter(v => v.type === 'multiple_faces').length;
        const allViolations = proctoringData.violations;

        const autoSubmitted = Object.values(updatedResults).some(s => s.data?.autoSubmitted);
        const autoSubmitReason = Object.values(updatedResults)
          .map(s => s.data?.autoSubmitReason || '')
          .filter(Boolean)
          .join(', ');

        const attemptData = {
          email: user.Email, rollNumber: user['Roll Number'] || '', name: user.Name || '',
          college, year, department: user.Department || '',
          testID: assessment.id, testName: assessment.name,
          assessmentId: assessment.id, assessmentName: assessment.name,
          submittedAt: serverTimestamp(), submittedAtISO: new Date().toISOString(),
          type: 'multisection',
          sections: updatedResults,
          sectionsArray: sectionsList,
          questions: aggregatedQuestions,
          coding: aggregatedCoding,
          spokenEnglish: aggregatedSpokenEnglish.length > 0 ? aggregatedSpokenEnglish[0] : null,
          sea: aggregatedSpokenEnglish.length > 0 ? aggregatedSpokenEnglish[0] : null,
          totalMarks: totalMarksSum,
          score: totalScore,
          totalQuestions: totalQ,
          correctAnswers: totalScore,
          incorrectAnswers: totalQ - totalScore,
          percentage: totalQ > 0 ? Math.round(pct * 100) : 0,
          partialScore,
          fullScore,
          timeTaken: timeTakenFormatted,
          timeTakenSeconds: timeTaken,
          violationCount: totalViolations,
          totalNoFace,
          totalMultipleFaces,
          completed: true,
          status: 'submitted',
          autoSubmitted,
          autoSubmitReason
        };

        const docPath = `AssessmentResults/${assessment.id}/colleges/${college}/years/${year}/students/${user.Email}`;
        setDoc(doc(db, docPath), attemptData, { merge: true })
          .then(() => console.log('[MSA] Final result saved to Firestore'))
          .catch(e => console.error('[MSA] Firestore final save failed:', e));

        setDoc(doc(db, 'users', user.Email, 'contestAttempts', assessment.id), attemptData, { merge: true })
          .catch(e => console.error('[MSA] Student-centric save failed:', e));

        safeUpsert('mcq_results', {
          roll_number: user['Roll Number'] || '',
          name: user.Name || '',
          email: user.Email,
          college,
          year,
          department: user.Department || '',
          test_id: assessment.id,
          test_name: assessment.name,
          score: totalScore,
          total_questions: totalQ,
          correct_answers: totalScore,
          incorrect_answers: totalQ - totalScore,
          percentage: pct,
          partial_score: partialScore,
          full_score: fullScore,
          time_taken: timeTaken,
          time_taken_formatted: timeTakenFormatted,
          time_started: timeStartedISO,
          time_ended: timeEndedISO,
          submitted_at: timeEndedISO,
          auto_submitted: autoSubmitted,
          auto_submit_reason: autoSubmitReason,
          violation_count: totalViolations,
          total_no_face: totalNoFace,
          total_multiple_faces: totalMultipleFaces,
          violations: allViolations,
          total_marks: totalMarksSum,
          questions: aggregatedQuestions,
          updated_at: timeEndedISO
        }, { onConflict: 'email,test_id' }).then(
          ({ data, error }) => {
            if (error) {
              console.warn('[MSA] Supabase mcq_results save failed:', error.message || error);
            } else {
              console.log('[MSA] Supabase mcq_results save succeeded:', data);
            }
          },
          e => console.warn('[MSA] Supabase mcq_results save failed (transport):', e)
        );

        // Upsert to unified assessment_results table
        safeUpsert('assessment_results', {
          type: 'multisection',
          test_id: assessment.id,
          test_name: assessment.name,
          roll_number: user['Roll Number'] || '',
          name: user.Name || '',
          email: user.Email,
          college,
          year,
          department: user.Department || '',
          score: totalScore,
          total_questions: totalQ,
          correct_answers: totalScore,
          incorrect_answers: totalQ - totalScore,
          percentage: pct,
          partial_score: partialScore,
          full_score: fullScore,
          status: 'submitted',
          time_taken: timeTaken,
          time_taken_formatted: timeTakenFormatted,
          time_started: timeStartedISO,
          time_ended: timeEndedISO,
          submitted_at: timeEndedISO,
          auto_submitted: autoSubmitted,
          auto_submit_reason: autoSubmitReason,
          violation_count: totalViolations,
          total_no_face: totalNoFace,
          total_multiple_faces: totalMultipleFaces,
          violations: allViolations,
          total_marks: totalMarksSum,
          questions: aggregatedQuestions,
          coding: aggregatedCoding,
          sections: sectionsList,
          updated_at: timeEndedISO
        }, { onConflict: 'email,test_id,type' }).then(
          ({ data, error }) => {
            if (error) {
              console.warn('[MSA] Supabase assessment_results save failed:', error.message || error);
            } else {
              console.log('[MSA] Supabase assessment_results save succeeded:', data);
            }
          },
          e => console.warn('[MSA] Supabase assessment_results save failed (transport):', e)
        );
      }

      setExamFinished(true);
      sessionStorage.removeItem('multisectionAssessmentData');
      localStorage.removeItem(`msaProgress_${assessment.id}`);

      // Clear MCQ, Coding, and proctoring temporary workspace details
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith(`msa_active_mcq_state_${assessment.id}`) ||
          key.startsWith(`codingAssessmentCode`) ||
          key.startsWith(`codingTimeSpentPerQ`) ||
          key.startsWith(`proctor_violations_`) ||
          key.startsWith(`proctor_events_`)
        )) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    }
  }, [assessment, currentSecIdx, examResults, handleStartSection, user]);

  // ────────────────────────── RENDER ─────────────────────────────────────────

  if (loading || !assessment) {
    return (
      <div className="msa-loading">
        <div className="msa-spinner" />
        <p>Loading multi-section exam environment...</p>
      </div>
    );
  }

  // Exam finished screen
  if (examFinished) {
    return (
      <div className="msa-finished-container" style={{ maxWidth: '600px', margin: '100px auto', padding: '45px', background: '#1e293b', borderRadius: '12px', color: '#f8fafc', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)', fontFamily: "'Inter',sans-serif", textAlign: 'center' }}>
        <FaCheckCircle style={{ color: '#10b981', fontSize: '5rem', marginBottom: '20px' }} />
        <h1 style={{ fontSize: '2.4rem', fontWeight: '800', color: 'white', marginBottom: '15px' }}>Assessment Completed!</h1>
        <p style={{ color: '#94a3b8', fontSize: '1.2rem', lineHeight: '1.6', marginBottom: '40px' }}>
          Congratulations <strong>{user?.Name}</strong>, your answers have been successfully recorded and submitted. You may now safely return to the dashboard.
        </p>
        <button
          onClick={() => navigate('/student/dashboard')}
          style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', padding: '14px 35px', fontSize: '1.1rem', fontWeight: '700', borderRadius: '6px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)' }}
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const activeSection = currentSecIdx >= 0 ? assessment.sections?.[currentSecIdx] : null;
  const activeSecData = activeSection ? sectionData[activeSection.sectionId] : null;

  // ── Active section view (MCQ or Coding)
  if (activeSection) {
    const codingQTimers = (() => {
      const qCount = (activeSecData?.questions || []).length;
      if (activeSection.questionTimerList) {
        const parts = String(activeSection.questionTimerList).split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
        if (parts.length > 0) return Array.from({ length: qCount }, (_, idx) => parts[idx] !== undefined ? parts[idx] : parts[parts.length - 1]);
      }
      if (activeSection.questionTimer) return Array(qCount).fill(activeSection.questionTimer);
      return [];
    })();
    const sectionSettings = activeSection.type === 'mcq'
      ? {
          timerRestrictedSubmit: isTruthy(activeSection.timerRestrictedSubmit),
          questionTimer: activeSection.questionTimer || 0,
          forwardOnly: isTruthy(activeSection.forwardOnly) || (activeSection.questionTimer > 0),
          proctored: isTruthy(assessment.proctored) || isTruthy(activeSection.proctored),
          // audioProctored is independent of camera proctoring — only use its own flag
          audioProctored: isTruthy(assessment.audioProctored) || isTruthy(activeSection.audioProctored),
          maxViolations: Number(assessment.maxViolations) || 7,
          maxAudioViolations: Number(assessment.maxAudioViolations) || 5
        }
      : {
          timerRestrictedSubmit: isTruthy(activeSection.timerRestrictedSubmit),
          questionTimers: codingQTimers,
          forwardOnly: isTruthy(activeSection.forwardOnly) || (codingQTimers.length > 0),
          proctored: isTruthy(assessment.proctored) || isTruthy(activeSection.proctored),
          maxViolations: Number(assessment.maxViolations) || 7,
          // audioProctored is independent of camera proctoring — only use its own flag
          audioProctored: isTruthy(assessment.audioProctored) || isTruthy(activeSection.audioProctored),
          maxAudioViolations: Number(assessment.maxAudioViolations) || 5
        };
    const sectionView = (activeSection.type === 'spoken_english' || activeSection.type === 'speech' || activeSection.type === 'sea')
      ? (
        <SpokenEnglishAssessment
          key={`spoken-${activeSection.sectionId}`}
          assessmentData={{ ...activeSecData, name: activeSection.name }}
          user={user}
          onBack={() => autoSubmitSection()}
        />
      )
      : activeSection.type === 'mcq'
      ? (
        <MCQSectionView
          key={`mcq-${activeSection.sectionId}`}
          sectionData={activeSecData}
          secTimer={secTimer}
          secStarted={secStarted}
          proctoringData={proctoringData}
          settings={sectionSettings}
          onSectionSubmit={autoSubmitSection}
          assessmentName={assessment.name || ''}
          assessmentId={assessment.id || ''}
        />
      )
      : (
        <CodingSectionView
          key={`coding-${activeSection.sectionId}`}
          sectionData={activeSecData}
          secTimer={secTimer}
          settings={sectionSettings}
          proctoringData={proctoringData}
          onSectionSubmit={autoSubmitSection}
          assessmentName={assessment.name || ''}
          assessmentId={assessment.id || ''}
        />
      );

  return (
    <>
      {shouldUseProctoring && user?.Email && (
        <ProctoringEngine
          studentID={user.Email}
          testID={assessment.id}
          isTestActive={currentSecIdx >= 0 && !examFinished}
          maxViolations={maxViolations}
          onReady={handleProctorReady}
          onViolationUpdate={handleProctorViolationUpdate}
          onAutoSubmit={handleProctorAutoSubmit}
        />
      )}
      {shouldUseAudioProctoring && user?.Email && (
        <AudioProctoringEngine
          studentID={user.Email}
          testID={assessment.id}
          isTestActive={currentSecIdx >= 0 && !examFinished}
          maxViolations={maxAudioViolations}
          onReady={handleAudioProctorReady}
          onViolationUpdate={handleAudioProctorViolationUpdate}
        />
      )}
      {sectionView}
        {/* Pre-section countdown overlay */}
        {sectionCountdown !== null && (() => {
          const activeSec = assessment?.sections?.[countdownSecIdx];
          const qList = activeSec ? sectionData[activeSec.sectionId]?.questions : null;
          const questionsLoaded = Array.isArray(qList) && qList.length > 0;
          return (
            <div style={{
              position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
              background: 'var(--bg-primary)',
              color: 'var(--text-main)', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', zIndex: 99999, fontFamily: "'Inter',sans-serif"
            }}>
              <div style={{ textAlign: 'center', maxWidth: '500px', padding: '20px' }}>
                <div className="msa-spinner" style={{ width: '60px', height: '60px', borderTopColor: 'var(--accent-coding)', margin: '0 auto 24px' }} />
                <h2 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '8px', color: 'var(--accent-coding)', letterSpacing: '-0.02em' }}>
                  Preparing Section Workspace...
                </h2>
                {assessment?.name && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '700', marginBottom: '6px' }}>
                    {assessment.name}
                  </p>
                )}
                <p style={{ color: 'var(--text-muted)', fontSize: '1rem', marginBottom: '24px', lineHeight: '1.6' }}>
                  Entering Section: <strong style={{ color: 'var(--text-main)' }}>{assessment?.sections?.[countdownSecIdx]?.name}</strong>.
                  <br />Loading questions and preparing environment.
                </p>

                {/* Status indicators */}
                <div style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  marginBottom: '24px',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  fontSize: '0.9rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Section Questions:</span>
                    <span style={{ fontWeight: '600', color: questionsLoaded ? '#10b981' : '#f59e0b' }}>
                      {questionsLoaded ? 'Loaded ✓' : 'Fetching questions...'}
                    </span>
                  </div>
                  {shouldUseProctoring && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Camera Proctoring:</span>
                      <span style={{ fontWeight: '600', color: isVisualProctorReady ? '#10b981' : '#f59e0b' }}>
                        {isVisualProctorReady ? 'Ready ✓' : 'Initializing AI & models...'}
                      </span>
                    </div>
                  )}
                  {shouldUseAudioProctoring && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Microphone Proctoring:</span>
                      <span style={{ fontWeight: '600', color: isAudioProctorReady ? '#10b981' : '#f59e0b' }}>
                        {isAudioProctorReady ? 'Ready ✓' : 'Requesting mic permission...'}
                      </span>
                    </div>
                  )}
                </div>

                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px 32px', display: 'inline-block' }}>
                  <div style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: '700' }}>
                    {sectionCountdown <= 0 ? 'Waiting for resources...' : 'Section Starts In'}
                  </div>
                  <div style={{ fontSize: '3.5rem', fontWeight: '900', color: 'var(--text-main)', fontFamily: 'monospace', lineHeight: '1' }}>
                    {sectionCountdown > 0 ? `${sectionCountdown}s` : '0s'}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </>
    );
  }

  // ── Welcome / Navigation screen (currentSecIdx === -1 or between sections)
  return (
    <div className="msa-root">
      <header className="msa-header">
        <div className="msa-header-title">
          <span>🏆</span> {assessment.name}
        </div>
        <div className="msa-candidate-info">
          <span>{user?.Name || 'Candidate'}</span>
          <span className="msa-email">{user?.Email}</span>
        </div>
      </header>

      <div className="msa-workspace">
        <aside className="msa-sidebar">
          <h3 className="msa-sidebar-title">Exam Sections</h3>
          <div className="msa-section-list">
            {(assessment.sections || []).map((sec, idx) => {
              const isCompleted = !!secCompleted[sec.sectionId];
              const isActive = idx === currentSecIdx;
              const isLocked = idx > currentSecIdx && !isCompleted;
              return (
                <div key={sec.sectionId} className={`msa-sec-card ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isLocked ? 'locked' : ''}`}>
                  <div className="msa-sec-card-header">
                    <span className="msa-sec-icon">{sec.type === 'mcq' ? <FaBookOpen /> : <FaCode />}</span>
                    <span className="msa-sec-name">{sec.name}</span>
                  </div>
                  <div className="msa-sec-card-meta">
                    <span>{sec.duration_minutes} Mins</span>
                    <span>•</span>
                    <span>{sec.type.toUpperCase()}</span>
                  </div>
                  {isCompleted
                    ? <span className="msa-badge completed">Submitted</span>
                    : isActive
                      ? <span className="msa-badge active">Active Now</span>
                      : isLocked
                        ? <span className="msa-badge locked"><FaLock /> Locked</span>
                        : <button className="msa-start-btn" onClick={() => handleStartSection(idx)}>Start Section</button>
                  }
                </div>
              );
            })}
          </div>
        </aside>

        <main className="msa-content">
          {currentSecIdx === -1 ? (
            <div className="msa-intro-card">
              <h2>Welcome to the Assessment</h2>
              <p>This exam consists of multiple sections. Each section has a separate countdown timer and questions.</p>
              <div className="msa-rules-box">
                <h4>Guidelines:</h4>
                <ul>
                  <li>Once you start a section, its timer starts counting down and cannot be paused.</li>
                  <li>When a section's timer expires, your progress is automatically saved and you proceed to the next section.</li>
                  <li>You cannot navigate back to a completed or submitted section.</li>
                  <li>Fullscreen mode is monitored and proctored. Tab switches will log violations.</li>
                </ul>
              </div>
              <button className="msa-action-btn primary" onClick={() => handleStartSection(0)}>
                Proceed to First Section <FaChevronRight />
              </button>
            </div>
          ) : (
            <div className="msa-intro-card">
              <h2>Section Submitted Successfully</h2>
              <p>You have finished the current section. The next section will start shortly.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default MultiSectionAssessment;
