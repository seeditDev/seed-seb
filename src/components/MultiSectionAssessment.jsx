/**
 * MultiSectionAssessment.jsx
 *
 * Multi-section exam orchestrator.
 * MCQ sections use the built-in MCQSectionView.
 * Coding sections mount CodingAssessmentSandbox in embedded mode for full feature parity.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { buildResultDoc, buildSectionResult, buildQuestionResult, buildCodingSubmission } from '../utils/buildResultDoc.js';
import { useNavigate } from './router-compat';
import { toast } from 'sonner';
import {
  FaClock, FaCheckCircle, FaLock, FaBookOpen, FaCode,
  FaArrowLeft, FaArrowRight, FaBookmark,
  FaChevronRight, FaFileAlt, FaListUl, FaShieldAlt, FaLightbulb, FaSignOutAlt, FaFlag,
  FaExclamationTriangle, FaKey, FaEye, FaEyeSlash, FaWifi, FaCamera, FaExpand, FaPlay, FaInfoCircle
} from 'react-icons/fa';
import '../styles/MultiSectionAssessment.css';
import '../styles/MCQPage.css';
import '../styles/CodingAssessmentSandbox.css';
import { db, auth } from '../lib/firebase-config';
import { doc, setDoc, getDoc, collection, getDocs, query, where, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { fetchQuestionsForContest } from '../services/codingQuestionBankService';
import ProctoringEngine from './ProctoringEngine';
import AudioProctoringEngine from './AudioProctoringEngine';
import ProctoringInstructions from './ProctoringInstructions';
import CodingAssessmentPage from './CodingAssessmentPage';
import SpokenEnglishAssessment from './SpokenEnglishAssessment';
import EssaySectionView from './EssaySectionView';
import SQLSectionView from './SQLSectionView';
import AssessmentFeedback from './AssessmentFeedback';
import desktopBridge from '../utils/desktopBridge';
import { useAssessmentTimer } from '../utils/assessmentTimerWorker';
import {
  saveAssessmentSnapshot,
  loadAssessmentSnapshot,
  clearAssessmentSnapshot,
  queueWALMutation,
  drainWALQueue
} from '../utils/assessmentStorageVault';
import timeService from '../services/timeService';
import { getViolations, writeViolationToFirestore } from '../utils/proctorCache';
import { renderMathAndCode } from '../utils/mathAndCodeRenderer';
import { ProblemImage } from './common/ProblemMarkdownRenderer';
import { normalizeTestCaseArray } from '../utils/testCaseUtils';
import SecurityWatermark from './SecurityWatermark';
import { requireTenant, resolveTenant } from '../utils/tenant';
import { fetchContentJSON, fetchJSONFile } from '../utils/contentApi';
import { createSubmitGuard } from '../utils/submitGuard';
import DOMPurify from 'dompurify';
import {
  startAssessmentSession,
  getActiveAttempt,
  markSectionStarted,
  saveSessionProgress,
  markSectionCompleted,
  completeAssessmentSession,
  oneThirdSaveThreshold,
  transitionAttemptState,
} from '../services/assessmentSessionService';
import { ATTEMPT_STATES, attemptDocId } from '../services/attemptStateMachine';
import { markAssessmentCompleted, invalidateCompletionCache } from '../services/attemptStatusService';
import { stopAllMediaAndAI } from '../utils/hardwareTeardown';
import { savePendingEnvelope } from '../utils/safeStorage';
import { parseScheduleWindow } from '../utils/assessmentValidator.js';
import { submitAssessmentResult } from '../services/placementTrackService';


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
const normalizeQuestion = (q, idx = 0) => {
  if (!q) return q;
  const rawId = q.questionId || q.id || q.challengeId || q._id;
  const id = String(rawId !== undefined && rawId !== null && String(rawId).trim() !== '' ? rawId : `q_${idx}`).trim();
  const title = q.title || q.name || (q.content?.title ?? '');
  const description = q.content?.problemStatement || q.description || q.problemStatement || q.statement || '';
  const instructions = q.content?.inputFormat || q.inputFormat || (q.instructions ?? '');
  const constraints = Array.isArray(q.content?.constraints)
    ? q.content.constraints.join('\n')
    : (q.constraints ?? '');

  // Normalize boilerPlates robustly supporting camelCase, lowerCase, and standard language keys
  const getNormalizedLangKey = (k) => {
    const clean = String(k).trim().toLowerCase();
    if (clean === 'c') return 'c';
    if (clean === 'cpp' || clean === 'c++') return 'cpp';
    if (clean === 'java') return 'java';
    if (clean === 'python' || clean === 'python3') return 'python';
    if (clean === 'javascript' || clean === 'js') return 'javascript';
    return clean;
  };

  const VALID_LANG_NAMES = new Set(['c', 'cpp', 'c++', 'java', 'python', 'python3', 'javascript', 'js', 'csharp', 'cs', 'ruby', 'go', 'rust', 'kotlin', 'swift', 'typescript', 'ts']);

  const rawBoilerplates = {
    ...(q.content?.boilerPlates || {}),
    ...(q.content?.boilerplates || {}),
    ...(q.boilerplates || {}),
    ...(q.boilerPlates || {}),
    ...(q.starterCode || {}),
    ...(q.starterCodes || {}),
    ...(q.content?.starterCode || {}),
    ...(q.content?.starterCodes || {})
  };
  const boilerPlates = {};

  Object.entries(rawBoilerplates).forEach(([lang, val]) => {
    const clean = String(lang).trim().toLowerCase();
    if (!VALID_LANG_NAMES.has(clean) && !VALID_LANG_NAMES.has(clean.replace(/[^a-z0-9]/g, ''))) return;
    if (typeof val !== 'string') return;
    const norm = getNormalizedLangKey(lang);
    boilerPlates[norm] = val;
    if (norm === 'cpp') boilerPlates['c++'] = val;
    if (norm === 'python') boilerPlates.python3 = val;
    if (norm === 'javascript') boilerPlates.js = val;
  });

  const testCases = normalizeTestCaseArray(
    q.testCases?.sample ||
    q.content?.sampleTestCases ||
    q.sampleTestCases ||
    q.sampleTests ||
    (Array.isArray(q.testCases) ? q.testCases.filter(tc => !tc.hidden && !tc.isHidden) : []) ||
    []
  );

  let hidden = [];
  if (Array.isArray(q.testCases?.hidden) && q.testCases.hidden.length > 0) {
    hidden = normalizeTestCaseArray(q.testCases.hidden);
  } else if (Array.isArray(q.hiddenTestCases) && q.hiddenTestCases.length > 0) {
    hidden = normalizeTestCaseArray(q.hiddenTestCases);
  } else if (Array.isArray(q.hiddenTests) && q.hiddenTests.length > 0) {
    hidden = normalizeTestCaseArray(q.hiddenTests);
  } else if (Array.isArray(q.content?.testCases) && q.content.testCases.length > 0) {
    hidden = normalizeTestCaseArray(q.content.testCases);
  } else if (Array.isArray(q.testCases)) {
    const hList = q.testCases.filter(tc => tc.hidden || tc.isHidden);
    if (hList.length > 0) {
      hidden = normalizeTestCaseArray(hList);
    }
  } else if (Array.isArray(q.test_cases)) {
    const hList = q.test_cases.filter(tc => tc.hidden || tc.isHidden);
    if (hList.length > 0) {
      hidden = normalizeTestCaseArray(hList);
    }
  } else if (Array.isArray(q.hidden_test_cases) && q.hidden_test_cases.length > 0) {
    hidden = normalizeTestCaseArray(q.hidden_test_cases);
  }

  // Fallback to sample test cases only if no hidden test cases exist anywhere
  if (hidden.length === 0 && testCases.length > 0) {
    hidden = testCases;
  }

  return {
    ...q,
    id,
    questionId: id,
    title,
    description,
    statement: description,
    problemStatement: description,
    instructions,
    inputFormat: instructions,
    outputFormat: q.content?.outputFormat || q.outputFormat || '',
    constraints,
    boilerPlates,
    boilerplates: boilerPlates,
    starterCode: boilerPlates,
    starterCodes: boilerPlates,
    examples: Array.isArray(q.examples) ? q.examples : (q.content?.examples || []),
    sampleTestCases: testCases,
    sampleTests: testCases,
    hiddenTestCases: hidden,
    hiddenTests: hidden,
    testCases: {
      ...(typeof q.testCases === 'object' && !Array.isArray(q.testCases) ? q.testCases : {}),
      sample: testCases,
      hidden
    },
  };
};

/**
 * Robustly extracts the list of questions or challenges for a given section
 * checking sectionData map (all alias keys) and active section inline properties.
 */
const getSectionQuestionsList = (sec, secDataMap, idx) => {
  if (!sec) return [];
  const secData = secDataMap ? (
    secDataMap[sec.sectionId] ||
    secDataMap[sec.id] ||
    secDataMap[sec.name] ||
    secDataMap[sec.slug] ||
    secDataMap[String(idx)]
  ) : null;

  if (secData) {
    if (Array.isArray(secData.questions) && secData.questions.length > 0) return secData.questions;
    if (Array.isArray(secData.challenges) && secData.challenges.length > 0) return secData.challenges;
    if (Array.isArray(secData.codingQuestions) && secData.codingQuestions.length > 0) return secData.codingQuestions;
    if (Array.isArray(secData.qids) && secData.qids.length > 0) return secData.qids;
    if (secData.problem) return [secData.problem];
  }
  if (Array.isArray(sec.questions) && sec.questions.length > 0) return sec.questions;
  if (Array.isArray(sec.challenges) && sec.challenges.length > 0) return sec.challenges;
  if (Array.isArray(sec.codingQuestions) && sec.codingQuestions.length > 0) return sec.codingQuestions;
  if (Array.isArray(sec.qids) && sec.qids.length > 0) return sec.qids;
  if (sec.problem) return [sec.problem];
  return [];
};


// ─── MCQ Section Renderer ────────────────────────────────────────────────────

const MCQSectionView = React.memo(({ sectionData, secTimer, secStarted = false, proctoringData = { violationCount: 0, violations: [] }, settings = {}, onSectionSubmit, assessmentName = '', assessmentId = '' }) => {
  const questions = useMemo(() => sectionData?.questions || [], [sectionData?.questions]);
  const secId = sectionData?.sectionId || sectionData?.id || sectionData?.name || '';
  const stateKey = `msa_active_mcq_state_${assessmentId}_${secId}`;

  const [answers, setAnswers] = useState(() => {
    try {
      if (typeof window === 'undefined') return {};
      const saved = localStorage.getItem(`msa_active_mcq_state_${assessmentId}_${secId}`);
      if (saved) return JSON.parse(saved).answers || {};
    } catch (_) { }
    return {};
  });

  const [questionIndex, setQuestionIndex] = useState(() => {
    try {
      if (typeof window === 'undefined') return 0;
      const saved = localStorage.getItem(`msa_active_mcq_state_${assessmentId}_${secId}`);
      if (saved) return JSON.parse(saved).questionIndex || 0;
    } catch (_) { }
    return 0;
  });

  const [bookmarked, setBookmarked] = useState(() => {
    try {
      if (typeof window === 'undefined') return [];
      const saved = localStorage.getItem(stateKey);
      if (saved) return JSON.parse(saved).bookmarked || [];
    } catch (_) { }
    return [];
  });

  const [lockedQuestions, setLockedQuestions] = useState(() => {
    try {
      if (typeof window === 'undefined') return [];
      const saved = localStorage.getItem(stateKey);
      if (saved) return JSON.parse(saved).lockedQuestions || [];
    } catch (_) { }
    return [];
  });

  const [qTimerRemaining, setQTimerRemaining] = useState(() => {
    try {
      if (typeof window === 'undefined') return settings.questionTimer || 0;
      const saved = localStorage.getItem(stateKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.qTimerRemaining !== undefined) return parsed.qTimerRemaining;
      }
    } catch (_) { }
    return settings.questionTimer || 0;
  });

  const [timeSpentPerQ, setTimeSpentPerQ] = useState(() => {
    try {
      if (typeof window === 'undefined') return {};
      const saved = localStorage.getItem(stateKey);
      if (saved) return JSON.parse(saved).timeSpentPerQ || {};
    } catch (_) { }
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
        const key = stateKey;
        try {
          const saved = localStorage.getItem(key);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.questionIndex === questionIndex && parsed.qTimerRemaining !== undefined) {
              setQTimerRemaining(parsed.qTimerRemaining);
              return;
            }
          }
        } catch (_) { }
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
    // ── Scoring ──────────────────────────────────────────────────────────────
    // Use per-question marks when available, falling back to 1 mark/question.
    // The section's canonical max is sectionData.maxScore (set by Admin Hub).
    // NEVER use question count as the max marks — sections can have different
    // weights (e.g. MCQ section = 40 marks, Coding section = 60 marks).
    let score = 0;
    questions.forEach((q, i) => {
      const userAnsIdx = answers[i];
      if (userAnsIdx !== undefined) {
        const userChoice = q.options?.[userAnsIdx];
        const isMatch = (q.correctAnswer !== undefined && (userChoice === q.correctAnswer || String(userChoice).trim().toLowerCase() === String(q.correctAnswer).trim().toLowerCase())) ||
                        (typeof q.correctIndex === 'number' && userAnsIdx === q.correctIndex);
        if (isMatch) {
          score += (Number(q.marks) > 0 ? Number(q.marks) : 1);
        }
      }
    });
    const total = questions.length;
    // Authoritative section max from Admin Hub config; fall back to question count only
    // when sectionData.maxScore is not set (old/incomplete data).
    const sectionTotalMarks = Number(sectionData?.maxScore) > 0
      ? Number(sectionData.maxScore)
      : total;
    // Percentage based on marks, clamped, NaN-safe.
    const pct = sectionTotalMarks > 0 ? Math.min(100, Math.round((score / sectionTotalMarks) * 100)) : 0;

    const questionsDetails = questions.map((q, idx) => {
      const selectedIdx = answers[idx];
      const selectedAnswer = selectedIdx !== undefined ? (q.options?.[selectedIdx] ?? '') : '';
      const isCorrect = (q.correctAnswer !== undefined && (selectedAnswer === q.correctAnswer || String(selectedAnswer).trim().toLowerCase() === String(q.correctAnswer).trim().toLowerCase())) ||
                        (typeof q.correctIndex === 'number' && selectedIdx === q.correctIndex);
      const timeSpent = timeSpentPerQ[idx] || 0;
      return {
        questionNumber: idx + 1,
        questionText: q.question || q.text || q.questionText || '',
        difficulty: (q.difficulty || 'medium').toLowerCase(),
        topic: q.topic || q.tag || (q.tags ? (Array.isArray(q.tags) ? q.tags[0] : q.tags) : 'General'),
        tags: Array.isArray(q.tags) ? q.tags : (q.tags ? [q.tags] : (q.topic ? [q.topic] : ['General'])),
        isCorrect,
        selectedAnswer,
        correctAnswer: q.correctAnswer ?? (typeof q.correctIndex === 'number' ? q.options?.[q.correctIndex] : ''),
        timeSpent
      };
    });

    // Clean up active MCQ state from localStorage
    localStorage.removeItem(stateKey);

    if (onSubmitRef.current) {
      onSubmitRef.current({
        answers,
        timeSpentPerQ,
        score,
        totalQuestions: total,
        // FIX: totalMarks = section max marks (from Admin Hub), NOT question count.
        // This is what the MSA aggregator sums to get the overall maxScore.
        maxScore: sectionTotalMarks,
        // FIX: percentage = score / sectionTotalMarks * 100, not score / totalQuestions.
        percentage: pct,
        questions: questionsDetails,
        violationCount: 0,
        totalNoFace: 0,
        totalMultipleFaces: 0,
        violations: []
      });
    }
  }, [answers, timeSpentPerQ, questions, stateKey, sectionData]);

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
    if (dir === 'next' && questionIndex < questions.length - 1) setQuestionIndex(q => q + 1);
  };

  const renderTextWithCode = (text) => renderMathAndCode(text, false);

  const { candidateRoll, tenantId } = useMemo(() => {
    try {
      if (typeof window === 'undefined') return { candidateRoll: '', tenantId: '' };
      const authData = JSON.parse(localStorage.getItem('auth_data') || '{}');
      return {
        candidateRoll: authData.rollNumber || authData.uid || '',
        tenantId: authData.tenantId || ''
      };
    } catch (_) {
      return { candidateRoll: '', tenantId: '' };
    }
  }, []);

  if (questions.length === 0) {
    return (
      <div className="msa-loading">
        <div className="msa-spinner" />
        <p>Loading MCQ questions...</p>
      </div>
    );
  }

  const q = questions[questionIndex] || {};
  const total = questions.length;
  const attempted = Object.keys(answers).length;
  const unattempted = Math.max(0, total - attempted);
  const flaggedCount = bookmarked.length;
  const pct = total > 0 ? Math.round((attempted / total) * 100) : 0;
  const isLocked = lockedQuestions.includes(questionIndex);

  return (
    <div className="mcq-ref-app-container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SecurityWatermark rollNumber={candidateRoll} tenantId={tenantId} />

      {/* Submit Confirmation Overlay */}
      {showSubmitConfirm && (
        <div className="mcq-confirm-dialog">
          <div className="mcq-confirm-content">
            <h3>Submit Section?</h3>
            <p>Are you sure you want to submit this section? You cannot return or modify your answers once submitted.</p>
            <div className="mcq-confirm-buttons">
              <button type="button" className="btn-cancel" onClick={() => setShowSubmitConfirm(false)}>Cancel</button>
              <button type="button" className="btn-confirm-submit" onClick={() => { setShowSubmitConfirm(false); handleSubmit(); }}>Confirm & Submit</button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Notice Overlay */}
      {customNotice && (
        <div className="mcq-confirm-dialog">
          <div className="mcq-confirm-content">
            <h3>{customNotice.title}</h3>
            <p>{customNotice.message}</p>
            <div className="mcq-confirm-buttons">
              <button
                type="button"
                className="btn-confirm-submit"
                onClick={() => { const fn = customNotice.onConfirm; setCustomNotice(null); if (fn) fn(); }}
              >Understood</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOP HEADER ── */}
      <header className="mcq-ref-header">
        <div className="mcq-ref-header-left">
          <div className="mcq-brand-badge">
            <div className="mcq-brand-logo-wrap">
              <img
                src="/SEED_Logo_Transparent.png"
                alt="SEED Logo"
                className="mcq-brand-logo-img"
                onError={(e) => {
                  e.target.src = '/SEED_Logo.png';
                }}
              />
            </div>
            <div className="mcq-brand-text">
              <span className="mcq-brand-title">SEED-SEB</span>
              <span className="mcq-brand-subtitle">SECURE EXAMINATION &amp; BENCHMARKING</span>
            </div>
          </div>
        </div>

        <div className="mcq-ref-header-center">
          <h2 className="mcq-ref-assessment-title">{sectionData?.name || assessmentName || 'MCQ Section Assessment'}</h2>
          <div className="mcq-ref-assessment-meta">
            {assessmentName && <span>{assessmentName}</span>}
            {assessmentName && <span className="meta-dot">•</span>}
            <span>{total} Questions</span>
            <span className="meta-dot">•</span>
            <span>1 Mark Each</span>
          </div>
        </div>

        <div className="mcq-ref-header-right">
          {(settings.audioProctored || settings.proctored || settings.tabSwitchLimit !== undefined) && (
            <div className="mcq-proctor-pills-wrap">
              {settings.audioProctored && (
                <div className="mcq-proctor-badge" title="Audio Proctoring">
                  <span className={`status-dot ${(proctoringData?.audioViolationCount || 0) > 0 ? 'bad' : 'good'}`} />
                  Audio: {proctoringData?.audioViolationCount || 0}/{settings.maxAudioViolations || 200}
                </div>
              )}
              {settings.proctored && (
                <div className="mcq-proctor-badge" title="Camera Proctoring">
                  <span className={`status-dot ${(proctoringData?.violationCount || 0) > 0 ? 'bad' : 'good'}`} />
                  Camera: {proctoringData?.violationCount || 0}/{settings.maxViolations || 200}
                </div>
              )}
              <div className="mcq-proctor-badge" title="Tab Switches">
                <span className={`status-dot ${(proctoringData?.tabSwitchCount || 0) > 0 ? 'bad' : 'good'}`} />
                Tabs: {proctoringData?.tabSwitchCount || 0}{settings.tabSwitchLimit > 0 ? `/${settings.tabSwitchLimit}` : ''}
              </div>
            </div>
          )}

          <div className="mcq-ref-timer-box">
            <div className="mcq-timer-icon-wrap">
              <FaClock />
            </div>
            <div className="mcq-timer-details">
              <span className="mcq-timer-label">Time Remaining</span>
              <span className={`mcq-timer-value ${secTimer <= 300 ? 'warning' : ''} ${secTimer <= 60 ? 'danger' : ''}`}>
                {formatTime(secTimer)}
              </span>
            </div>
          </div>

          <button
            type="button"
            className={`mcq-ref-flag-btn ${bookmarked.includes(questionIndex) ? 'flagged' : ''}`}
            onClick={() => setBookmarked(prev => prev.includes(questionIndex) ? prev.filter(x => x !== questionIndex) : [...prev, questionIndex])}
          >
            <FaFlag />
            <span>{bookmarked.includes(questionIndex) ? 'Flagged' : 'Flag for Review'}</span>
          </button>

          {!settings.timerRestrictedSubmit && (
            <button
              type="button"
              className="mcq-ref-submit-btn"
              onClick={() => setShowSubmitConfirm(true)}
            >
              <FaSignOutAlt />
              <span>Submit Section</span>
            </button>
          )}
        </div>
      </header>

      {/* Review Screen */}
      {showReview ? (
        <div className="mcq-review-container" style={{ padding: '24px', maxWidth: '900px', margin: '20px auto' }}>
          <h3 style={{ color: 'var(--mcq-text-main)', marginBottom: '20px' }}>Review Your Answers</h3>
          <div className="mcq-review-list">
            {questions.map((rq, idx) => (
              <div key={idx} className="mcq-review-item">
                <div className="mcq-review-header">
                  <span>Question {idx + 1}</span>
                  <span>{formatSecs(timeSpentPerQ[idx] || 0)}</span>
                </div>
                <div className="mcq-review-question">{renderTextWithCode(rq.question || rq.text || rq.questionText || '')}</div>
                {(rq.imageUrl || rq.image || rq.figure || rq.diagram || rq.questionImage || rq.assetUrl || rq.content?.imageUrl || rq.content?.image) && (
                  <div className="mcq-review-image" style={{ margin: '8px 0', maxWidth: '320px' }}>
                    <ProblemImage 
                      src={rq.imageUrl || rq.image || rq.figure || rq.diagram || rq.questionImage || rq.assetUrl || rq.content?.imageUrl || rq.content?.image} 
                      alt={`Question ${idx + 1} Illustration`} 
                    />
                  </div>
                )}
                <div className="mcq-review-answer">
                  Your answer: {answers[idx] !== undefined ? rq.options[answers[idx]] : <span className="text-muted">Not answered</span>}
                </div>
                <div className="mcq-review-actions">
                  <button type="button" onClick={() => { setQuestionIndex(idx); setShowReview(false); }}>Go to Question</button>
                </div>
              </div>
            ))}
          </div>
          <div className="mcq-review-bottom-nav">
            <button type="button" className="mcq-nav-button" onClick={() => setShowReview(false)}>Back to Test</button>
            <button type="button" className="mcq-submit-button" onClick={handleSubmit}>Submit Section</button>
          </div>
        </div>
      ) : (
        /* ── 3-COLUMN WORKSPACE ── */
        <div className="mcq-ref-layout-3col">
          {/* 1. LEFT SIDEBAR */}
          <aside className="mcq-ref-col-left">
            {/* Section Overview Card */}
            <div className="mcq-ref-card">
              <div className="mcq-card-head">
                <div className="mcq-card-head-icon">
                  <FaListUl />
                </div>
                <h4>Section Overview</h4>
              </div>
              <div className="mcq-overview-table">
                <div className="overview-row">
                  <span className="overview-label">Total Questions</span>
                  <strong className="overview-val">{total}</strong>
                </div>
                <div className="overview-row">
                  <span className="overview-label">Attempted</span>
                  <strong className="overview-val text-emerald">{attempted}</strong>
                </div>
                <div className="overview-row">
                  <span className="overview-label">Not Attempted</span>
                  <strong className="overview-val text-muted">{unattempted}</strong>
                </div>
                <div className="overview-row">
                  <span className="overview-label">Flagged</span>
                  <strong className="overview-val text-amber">{flaggedCount}</strong>
                </div>
              </div>
            </div>

            {/* Legend Card */}
            <div className="mcq-ref-card">
              <div className="mcq-card-head">
                <div className="mcq-card-head-icon">
                  <FaShieldAlt />
                </div>
                <h4>Legend</h4>
              </div>
              <div className="mcq-legend-list">
                <div className="legend-item">
                  <span className="legend-dot answered" />
                  <span>Answered</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot not-answered" />
                  <span>Not Answered</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot current" />
                  <span>Current Question</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot flagged" />
                  <span>Flagged for Review</span>
                </div>
              </div>
            </div>

            {/* Secure Environment Card */}
            <div className="mcq-ref-card secure-badge-card">
              <div className="mcq-card-head">
                <div className="mcq-card-head-icon">
                  <FaLock />
                </div>
                <h4>Secure Environment</h4>
              </div>
              <p className="secure-badge-text">
                Your activity is being monitored<br />
                <span className="sub">*for a fair assessment.</span>
              </p>
            </div>
          </aside>

          {/* 2. CENTER QUESTION WORKSPACE */}
          <main className="mcq-ref-col-center">
            <div className="mcq-center-question-card">
              <div className="mcq-center-card-header">
                <h3 className="mcq-q-title">Question {questionIndex + 1} of {total}</h3>
                <button
                  type="button"
                  className={`mcq-center-flag-btn ${bookmarked.includes(questionIndex) ? 'flagged' : ''}`}
                  onClick={() => setBookmarked(prev => prev.includes(questionIndex) ? prev.filter(x => x !== questionIndex) : [...prev, questionIndex])}
                >
                  <FaBookmark />
                  <span>{bookmarked.includes(questionIndex) ? 'Flagged for Review' : 'Mark for Review'}</span>
                </button>
              </div>

              <div className="mcq-center-q-body">
                {isLocked && (
                  <div className="mcq-locked-notice">
                    <FaLock />
                    <span>This question's timer expired. Your answer is locked.</span>
                  </div>
                )}

                <div className="mcq-q-text-line">
                  <span className="mcq-q-num-badge">Q{questionIndex + 1}.</span>
                  <span className="mcq-q-content">{renderTextWithCode(q.question || q.text || q.questionText || '')}</span>
                </div>

                {/* Render question illustration if present on question object */}
                {(q.imageUrl || q.image || q.figure || q.diagram || q.questionImage || q.assetUrl || q.content?.imageUrl || q.content?.image) && (
                  <div className="mcq-q-image-container" style={{ margin: '14px 0', textAlign: 'center' }}>
                    <ProblemImage 
                      src={q.imageUrl || q.image || q.figure || q.diagram || q.questionImage || q.assetUrl || q.content?.imageUrl || q.content?.image} 
                      alt={q.imageAlt || `Question ${questionIndex + 1} Illustration`} 
                    />
                  </div>
                )}

                <div className="mcq-ref-options-stack">
                  {q.options?.map((opt, oIdx) => {
                    const letter = String.fromCharCode(65 + oIdx);
                    const isSelected = answers[questionIndex] === oIdx;
                    return (
                      <button
                        type="button"
                        key={oIdx}
                        className={`mcq-ref-option-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleSelectOption(oIdx)}
                        disabled={isLocked}
                        style={isLocked ? { cursor: 'not-allowed', opacity: 0.8 } : {}}
                      >
                        <div className="option-radio-indicator">
                          <span className="radio-circle" />
                        </div>
                        <div className="option-letter-badge">{letter}</div>
                        <div className="option-text-content">{renderMathAndCode(opt, true)}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Quick Tip / Hint Box */}
                {(q.hint || q.explanation) ? (
                  <div className="mcq-quick-tip-card">
                    <div className="tip-icon"><FaLightbulb /></div>
                    <div className="tip-content">
                      <strong>Quick Tip</strong>
                      <p>{q.hint || q.explanation}</p>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Bottom Nav inside Center Card */}
              <div className="mcq-center-actions-footer">
                <button
                  type="button"
                  className="mcq-btn-prev"
                  onClick={() => navQuestion('prev')}
                  disabled={questionIndex === 0 || settings.forwardOnly || settings.questionTimer > 0}
                >
                  <FaArrowLeft /> Previous
                </button>

                <button
                  type="button"
                  className="mcq-btn-save-next"
                  onClick={() => {
                    if (questionIndex === total - 1) {
                      setShowSubmitConfirm(true);
                    } else {
                      navQuestion('next');
                    }
                  }}
                >
                  <span>{questionIndex === total - 1 ? 'Submit Section' : 'Save & Next'}</span>
                  <FaArrowRight />
                </button>
              </div>
            </div>
          </main>

          {/* 3. RIGHT SIDEBAR */}
          <aside className="mcq-ref-col-right">
            {/* Question Navigator Card */}
            <div className="mcq-ref-card">
              <div className="mcq-card-head">
                <h4>Question Navigator</h4>
              </div>
              <div className="mcq-navigator-grid">
                {questions.map((_, idx) => {
                  const isAttempted = answers[idx] !== undefined;
                  const isCurrent = questionIndex === idx;
                  const isBookmarked = bookmarked.includes(idx);

                  let stateClass = '';
                  if (isCurrent) stateClass = 'current';
                  else if (isBookmarked) stateClass = 'flagged';
                  else if (isAttempted) stateClass = 'answered';
                  else stateClass = 'unanswered';

                  return (
                    <button
                      type="button"
                      key={idx}
                      className={`nav-grid-btn ${stateClass}`}
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



            {/* Section Summary Card */}
            <div className="mcq-ref-card">
              <div className="mcq-card-head">
                <h4>Section Summary</h4>
              </div>
              <div className="mcq-summary-list">
                <div className="summary-item">
                  <div className="summary-left">
                    <span className="legend-dot answered" />
                    <span>Answered</span>
                  </div>
                  <span className="summary-stat">{attempted} ({total > 0 ? Math.round((attempted / total) * 100) : 0}%)</span>
                </div>
                <div className="summary-item">
                  <div className="summary-left">
                    <span className="legend-dot not-answered" />
                    <span>Not Answered</span>
                  </div>
                  <span className="summary-stat">{unattempted} ({total > 0 ? Math.round((unattempted / total) * 100) : 0}%)</span>
                </div>
                <div className="summary-item">
                  <div className="summary-left">
                    <span className="legend-dot flagged" />
                    <span>Flagged</span>
                  </div>
                  <span className="summary-stat">{flaggedCount} ({total > 0 ? Math.round((flaggedCount / total) * 100) : 0}%)</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ── BOTTOM FOOTER ── */}
      <footer className="mcq-ref-bottom-footer">
        <div className="footer-left-info">
          <span>Assessment ID: {assessmentId ?? ''}</span>
          <span className="footer-sep">•</span>
          <span>Tenant: {tenantId}</span>
          <span className="footer-sep">•</span>
          <span>Candidate: {candidateRoll}</span>
        </div>

        <div className="footer-center-hint">
          You can navigate between questions using the Question Navigator
        </div>

        <div className="footer-right-actions">
          <button
            type="button"
            className="mcq-footer-end-btn"
            onClick={() => setShowSubmitConfirm(true)}
          >
            <FaSignOutAlt />
            <span>End Section</span>
          </button>
        </div>
      </footer>
    </div>
  );
});


// ─── Coding Section Renderer ──────────────────────────────────────────────────
// Uses the real CodingAssessmentPage in embedded mode for full feature parity.

const CodingSectionView = React.memo(({ sectionData, secTimer, settings = {}, proctoringData, onSectionSubmit, assessmentName = '', assessmentId = '' }) => {
  // Normalize all possible coding content field names into a single `questions` array.
  // Memoized so secTimer ticks don't generate new array/object references every second.
  const resolvedQuestions = useMemo(() => {
    let rawList = [];
    if (Array.isArray(sectionData?.questions) && sectionData.questions.length > 0) {
      rawList = sectionData.questions;
    } else if (Array.isArray(sectionData?.challenges) && sectionData.challenges.length > 0) {
      rawList = sectionData.challenges;
    } else if (Array.isArray(sectionData?.codingQuestions) && sectionData.codingQuestions.length > 0) {
      rawList = sectionData.codingQuestions;
    } else if (Array.isArray(sectionData?.items) && sectionData.items.length > 0) {
      rawList = sectionData.items;
    } else if (Array.isArray(sectionData?.qids) && sectionData.qids.length > 0) {
      rawList = sectionData.qids.map(qid => typeof qid === 'string' ? { id: qid, questionId: qid } : qid);
    }
    return rawList.map(normalizeQuestion);
  }, [sectionData?.questions, sectionData?.challenges, sectionData?.codingQuestions, sectionData?.items, sectionData?.qids]);

  const testData = useMemo(() => ({
    ...sectionData,
    assessmentId: assessmentId || sectionData?.assessmentId || '',
    assessmentName: assessmentName || sectionData?.assessmentName || '',
    sectionId: sectionData?.sectionId || sectionData?.id || '',
    questions: resolvedQuestions
  }), [sectionData, assessmentId, assessmentName, resolvedQuestions]);

  const embeddedSettings = useMemo(() => ({
    ...settings,
    proctored: false,
    audioProctored: false
  }), [settings]);

  return (
    <CodingAssessmentPage
      isEmbedded={true}
      testData={testData}
      assessmentId={assessmentId || sectionData?.assessmentId || ''}
      sectionId={sectionData?.sectionId || sectionData?.id || ''}
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
  const sectionStartTimesRef = useRef({});
  // Mirror user/assessment into refs so callbacks that run before the first
  // React state flush (e.g. grace-period auto-submit 500ms after mount) can
  // still read them synchronously.
  const userRef = useRef(null);
  const assessmentRef = useRef(null);

  // Section coordinator state
  const [currentSecIdx, setCurrentSecIdx] = useState(-1);
  const [secStarted, setSecStarted] = useState(false);
  const [secTimer, setSecTimer] = useState(0);
  const [secCompleted, setSecCompleted] = useState({});
  const [sectionCountdown, setSectionCountdown] = useState(null);
  const [countdownSecIdx, setCountdownSecIdx] = useState(-1);
  const [prelaunchTick, setPrelaunchTick] = useState(0);

  // Data stores
  const [sectionData, setSectionData] = useState({});
  const [examResults, setExamResults] = useState(() => {
    try {
      if (typeof window === 'undefined') return {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('msaProgress_')) {
          const parsed = JSON.parse(localStorage.getItem(key) || '{}');
          if (parsed.examResults && Object.keys(parsed.examResults).length > 0) {
            return parsed.examResults;
          }
        }
      }
    } catch (_) {}
    return {};
  });
  const examResultsRef = useRef(examResults);
  useEffect(() => {
    if (examResults && Object.keys(examResults).length > 0) {
      examResultsRef.current = {
        ...(examResultsRef.current || {}),
        ...examResults
      };
    }
  }, [examResults]);
  const [examFinished, setExamFinished] = useState(false);
  const [isSubmittingEntireExam, setIsSubmittingEntireExam] = useState(false);
  // 4-sec relaxation between sections: null = not showing, number = countdown value
  const [relaxationCountdown, setRelaxationCountdown] = useState(null);
  const [relaxationNextIdx, setRelaxationNextIdx] = useState(-1);

  // Pre-Flight passkey gate state
  const [passkeyInput, setPasskeyInput] = useState('');
  const [passkeyError, setPasskeyError] = useState('');
  const [showPasskey, setShowPasskey] = useState(false);
  const passkeyInputRef = useRef(null);
  const [isVisualProctorReady, setIsVisualProctorReady] = useState(false);
  const [isAudioProctorReady, setIsAudioProctorReady] = useState(false);
  const [proctoringData, setProctoringData] = useState({
    violationCount: 0,
    audioViolationCount: 0,
    tabSwitchCount: 0,
    violations: []
  });
  const [submissionReason, setSubmissionReason] = useState(null);
  const [completedAttemptId, setCompletedAttemptId] = useState('');
  const [completedTenant, setCompletedTenant] = useState(null);

  const [showInstructions, setShowInstructions] = useState(false);

  // Background Transactional Write-Ahead Log (WAL) drainer
  useEffect(() => {
    const handleDrain = () => {
      drainWALQueue(setDoc, doc, db);
    };
    window.addEventListener('seed:vault_drain_request', handleDrain);
    const drainInterval = setInterval(handleDrain, 30000);
    return () => {
      window.removeEventListener('seed:vault_drain_request', handleDrain);
      clearInterval(drainInterval);
    };
  }, []);

  const isPremisesRequired = useMemo(() => {
    if (!assessment) return false;
    return Boolean(
      assessment.proctorConfig?.premisesCameraRequired ||
      assessment.proctorConfig?.premisesProctoring ||
      assessment.premisesCameraRequired ||
      assessment.premisesProctoring ||
      assessment.settings?.premisesCameraRequired ||
      assessment.settings?.premisesProctoring ||
      (assessment.sections || []).some(s =>
        isTruthy(s?.premisesCameraRequired) ||
        isTruthy(s?.premisesProctoring) ||
        isTruthy(s?.proctorConfig?.premisesCameraRequired) ||
        isTruthy(s?.proctorConfig?.premisesProctoring)
      )
    );
  }, [assessment]);

  const shouldUseProctoring = useMemo(() => {
    if (!assessment) return false;
    return isTruthy(assessment.proctored) || (assessment.sections || []).some(s => isTruthy(s.proctored)) || isPremisesRequired;
  }, [assessment, isPremisesRequired]);

  const shouldUseAudioProctoring = useMemo(() => {
    if (!assessment) return false;
    // Audio proctoring is INDEPENDENT of camera proctoring.
    // Only activate if audioProctored is explicitly true at the top-level or any section.
    // Do NOT fall back to assessment.proctored — that controls camera only.
    return isTruthy(assessment.audioProctored) ||
      (assessment.sections || []).some(s => isTruthy(s.audioProctored));
  }, [assessment]);

  const maxViolations = useMemo(() => {
    if (!assessment) return 200;
    return Number(assessment.proctorConfig?.maxCameraViolations ?? assessment.proctorConfig?.maxViolations ?? assessment.maxCameraViolations ?? assessment.maxViolations) || 200;
  }, [assessment]);

  const tabSwitchLimit = useMemo(() => {
    if (!assessment) return 5;
    const raw = assessment.proctorConfig?.tabSwitchLimit ?? assessment.tabSwitchLimit;
    if (raw !== undefined && raw !== null && raw !== '') {
      const num = Number(raw);
      return isNaN(num) ? 5 : num;
    }
    return 5;
  }, [assessment]);

  const shouldWatchTabSwitches = useMemo(() => {
    if (!assessment) return false;
    return shouldUseProctoring || tabSwitchLimit > 0 || assessment.tabSwitchLimit !== undefined || assessment.proctorConfig?.tabSwitchLimit !== undefined;
  }, [assessment, shouldUseProctoring, tabSwitchLimit]);

  const maxAudioViolations = useMemo(() => {
    if (!assessment) return 200;
    return Number(assessment.proctorConfig?.maxAudioViolations ?? assessment.maxAudioViolations) || 200;
  }, [assessment]);

  // Crash recovery
  const [restoredProgress, setRestoredProgress] = useState(null);

  const timerRef = useRef(null);
  /** Absolute wall-clock ms when the current section timer expires. Set on section start. */
  const sectionEndTimeMsRef = useRef(0);
  /** Idempotency lock: prevents timer + violation + button from all calling finalSubmit concurrently. */
  const finalSubmitLockRef = useRef(false);
  const examFinishedRef = useRef(examFinished);
  useEffect(() => { examFinishedRef.current = examFinished; }, [examFinished]);
  // Keep userRef/assessmentRef in sync with state for callback closures
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { assessmentRef.current = assessment; }, [assessment]);
  // Prevents React StrictMode double-invoke from firing the grace-period auto-submit twice
  const gracePeriodFiredRef = useRef(false);
  const autoSubmitSectionRef = useRef(null);

  // Helper to completely release camera, microphone, and AI proctoring
  const teardownHardwareAndProctoring = useCallback(() => {
    try {
      window.dispatchEvent(new CustomEvent('seb:stop-proctoring-hardware'));
    } catch (_) { }

    // Explicitly stop all camera tracks
    if (window.cameraStream) {
      try {
        window.cameraStream.getTracks().forEach((track) => {
          track.onended = null;
          track.stop();
          console.log('[MSA] Stopped camera track:', track.label);
        });
      } catch (err) {
        console.error('[MSA] Error stopping camera track:', err);
      }
      window.cameraStream = null;
    }

    // Explicitly stop all audio tracks
    if (window.audioStream) {
      try {
        window.audioStream.getTracks().forEach((track) => {
          track.onended = null;
          track.stop();
          console.log('[MSA] Stopped audio track:', track.label);
        });
      } catch (err) {
        console.error('[MSA] Error stopping audio track:', err);
      }
      window.audioStream = null;
    }

    // Stop tracks on any video/audio elements in DOM
    try {
      document.querySelectorAll('video, audio').forEach((el) => {
        if (el.srcObject && typeof el.srcObject.getTracks === 'function') {
          el.srcObject.getTracks().forEach((track) => {
            track.onended = null;
            track.stop();
          });
          el.srcObject = null;
        }
      });
    } catch (_) { }
  }, []);

  // Global unmount teardown
  useEffect(() => {
    return () => {
      teardownHardwareAndProctoring();
    };
  }, [teardownHardwareAndProctoring]);

  const autoSubmitEntireExam = useCallback(async (reason) => {
    // P0-04: Idempotency guard — prevents timer, violation handler, and button click
    // from all racing to finalize the exam simultaneously.
    if (finalSubmitLockRef.current) {
      console.warn(`[MSA] Final submit already in progress (reason=${reason}), ignoring duplicate call.`);
      return;
    }
    finalSubmitLockRef.current = true;
    setSubmissionReason(reason || 'auto_submit');
    setIsSubmittingEntireExam(true);

    if (examFinishedRef.current) {
      setIsSubmittingEntireExam(false);
      return;
    }
    examFinishedRef.current = true;
    setSecStarted(false);
    clearInterval(timerRef.current);
    try {
      stopAllMediaAndAI();
      teardownHardwareAndProctoring();
    } catch (_) { }

    const effectiveUser = userRef.current || user;
    if (!effectiveUser) {
      throw new Error('[MSA] autoSubmitEntireExam: User profile is missing.');
    }
    const effectiveAssessment = assessmentRef.current || assessment;
    if (!effectiveAssessment?.id) {
      throw new Error('[MSA] autoSubmitEntireExam: Assessment metadata is missing.');
    }

    const userId = auth?.currentUser?.uid || effectiveUser.uid;
    if (!userId) {
      throw new Error('[MSA] autoSubmitEntireExam: Authenticated userId is required.');
    }

    const tenant = requireTenant(effectiveUser);
    const email = tenant.email;
    const tenantId = tenant.tenantId;

    // Harvest active section if in progress so its score and responses are included
    try {
      window.dispatchEvent(new CustomEvent('msa:request-coding-snapshot'));
    } catch (_) {}

    // Read latest results from ref, state, and localStorage fallback
    let baseResults = { ...(examResultsRef.current || {}), ...(examResults || {}) };
    try {
      const saved = JSON.parse(localStorage.getItem(`msaProgress_${effectiveAssessment.id}`) || '{}');
      if (saved.examResults && Object.keys(saved.examResults).length > 0) {
        baseResults = { ...saved.examResults, ...baseResults };
      }
    } catch (_) {}

    const combinedResults = { ...baseResults };
    if (effectiveAssessment?.sections && currentSecIdx >= 0 && effectiveAssessment.sections[currentSecIdx]) {
      const activeSec = effectiveAssessment.sections[currentSecIdx];
      const activeSecId = activeSec.sectionId || activeSec.id || activeSec.name || `sec_${currentSecIdx}`;
      if (!combinedResults[activeSecId] && !combinedResults[activeSec.sectionId] && !combinedResults[activeSec.name]) {
        if (activeSec.type === 'coding') {
          let activeCodingData = null;
          try {
            const raw = localStorage.getItem(`msa_active_coding_state_${effectiveAssessment.id}_${activeSecId}`)
              || localStorage.getItem(`msa_active_coding_state_${effectiveAssessment.id}`)
              || localStorage.getItem('msa_active_coding_latest');
            if (raw) activeCodingData = JSON.parse(raw);
          } catch (_) {}

          if (!activeCodingData || !activeCodingData.coding || activeCodingData.coding.length === 0) {
            let storedScores = {};
            let storedCodes = {};
            try {
              storedScores = JSON.parse(localStorage.getItem('codingQuestionScores') || '{}');
              storedCodes = JSON.parse(localStorage.getItem('codingAssessmentCode') || '{}');
            } catch (_) {}

            const secQuestions = activeSec.questions || activeSec.challenges || activeSec.codingQuestions || [];
            let earnedScore = 0;
            let maxScore = 0;
            const evaluatedQuestions = secQuestions.map((rawQ, idx) => {
              const q = normalizeQuestion(rawQ, idx);
              const qId = q.id || q.questionId || `q_${idx}`;
              const scoreObj = storedScores[qId] || {};
              const qWeight = q.weight || 10;
              maxScore += qWeight;
              const passed = scoreObj.passed || scoreObj.testPassedCount || 0;
              const total = scoreObj.total || scoreObj.totalTestCases || (q.testCases ? q.testCases.length : 0);
              const isAttempted = scoreObj.submitted || (scoreObj.testResults && scoreObj.testResults.length > 0) || (scoreObj.score > 0);
              const earned = isAttempted ? (scoreObj.score || 0) : 0;
              earnedScore += earned;

              const finalCode = scoreObj.code || scoreObj.solution || storedCodes[`${qId}_${scoreObj.language || 'cpp'}`] || storedCodes[`${qId}_c`] || storedCodes[`${qId}_python`] || storedCodes[`${qId}_java`] || '';
              const status = isAttempted
                ? (scoreObj.status || (total > 0 ? (passed === total ? 'Accepted' : (passed > 0 ? 'Partial' : 'Wrong Answer')) : 'Wrong Answer'))
                : 'Did Not Attempt';

              return buildCodingSubmission({
                questionId: qId,
                questionNumber: idx + 1,
                questionKey: `Q${idx + 1}`,
                problemTitle: q.name || q.title || `Question ${idx + 1}`,
                title: q.name || q.title || `Question ${idx + 1}`,
                difficulty: q.difficulty || 'Easy',
                language: scoreObj.language || 'cpp',
                code: isAttempted ? finalCode : '',
                solution: isAttempted ? finalCode : '',
                status: status,
                testsPassed: isAttempted ? passed : 0,
                totalTests: total,
                score: earned,
                maxScore: qWeight,
                percentage: isAttempted ? (scoreObj.percentage || (total > 0 ? Math.round((passed / total) * 100) : 0)) : 0,
                attempted: isAttempted,
                testResults: isAttempted ? (scoreObj.testResults || []) : [],
                submittedAt: scoreObj.submittedAt || new Date().toISOString()
              });
            });

            activeCodingData = {
              score: earnedScore,
              maxScore: maxScore || activeSec.duration_minutes || 10,
              totalQuestions: secQuestions.length,
              answers: storedCodes,
              coding: evaluatedQuestions,
              questions: evaluatedQuestions,
            };
          }

          const secTimeSpent = activeCodingData?.timeTaken || activeCodingData?.timeSpentSeconds || Math.max(0, (activeSec.duration_minutes || 30) * 60 - (secTimer || 0));

          combinedResults[activeSecId] = {
            sectionId: activeSecId,
            sectionName: activeSec.name || `Section ${currentSecIdx + 1}`,
            type: 'coding',
            startedAt: activeCodingData?.startedAt || sectionStartTimesRef.current[currentSecIdx] || new Date().toISOString(),
            submittedAt: new Date().toISOString(),
            timeSpentSeconds: secTimeSpent,
            questionTiming: activeCodingData?.questionTiming || {},
            data: {
              score: activeCodingData.score || 0,
              maxScore: activeCodingData.maxScore || activeSec.duration_minutes || 10,
              totalQuestions: activeCodingData.totalQuestions || (activeSec.questions || []).length || 0,
              answers: activeCodingData.answers || {},
              coding: activeCodingData.coding || [],
              questions: activeCodingData.questions || activeCodingData.coding || [],
              questionTiming: activeCodingData.questionTiming || {},
              timeSpentPerQ: activeCodingData.timeSpentPerQ || {},
            }
          };
        } else if (activeSec.type === 'essay' || activeSec.type === 'essay_writing') {
          let essayData = null;
          try {
            const draftKey = `essay_draft_${effectiveAssessment.id}_${activeSecId}`;
            const altDraftKey = `essay_draft_${effectiveAssessment.id}_${activeSec.name || 'default'}`;
            const savedDraft = localStorage.getItem(draftKey) || localStorage.getItem(altDraftKey);
            if (savedDraft) {
              const parsedDraft = JSON.parse(savedDraft);
              const rawText = parsedDraft.answerText || '';
              const maxLimit = Number(activeSec.maxWords || activeSec.essayPrompt?.maxWords) || 500;
              const words = rawText.trim().split(/\s+/).filter(Boolean);
              const trimmedText = words.slice(0, maxLimit).join(' ');
              const title = parsedDraft.studentTitle || activeSec.name || 'Essay';
              const minWords = Number(activeSec.minWords) || 100;
              const maxScore = Number(activeSec.maxScore) || 20;
              const earnedScore = words.length >= minWords ? maxScore * 0.75 : 0;
              essayData = {
                studentTitle: title,
                answerText: trimmedText,
                wordCount: Math.min(words.length, maxLimit),
                originalWordCount: words.length,
                score: earnedScore,
                maxScore,
                autoSubmitted: true,
                autoTrimmedTo500: words.length > maxLimit
              };
            }
          } catch (eErr) {
            console.warn('[MSA] autoSubmitEntireExam essay recovery error:', eErr);
          }

          combinedResults[activeSecId] = {
            sectionId: activeSecId,
            sectionName: activeSec.name || `Section ${currentSecIdx + 1}`,
            type: activeSec.type,
            startedAt: sectionStartTimesRef.current[currentSecIdx] || new Date().toISOString(),
            submittedAt: new Date().toISOString(),
            timeSpentSeconds: Math.max(0, (activeSec.duration_minutes || 30) * 60 - (secTimer || 0)),
            data: essayData || {
              score: 0,
              maxScore: Number(activeSec.maxScore) || 20,
              wordCount: 0,
              answerText: '',
              autoSubmitted: true
            }
          };
        } else if (activeSec.type === 'sql' || activeSec.type === 'sql_assessment') {
          let sqlData = null;
          try {
            const raw = localStorage.getItem(`msa_sql_active_${effectiveAssessment.id}_${activeSecId}`)
              || sessionStorage.getItem(`msa_sql_v2_${userId}_${effectiveAssessment.id}_${activeSecId}`);
            if (raw) {
              const qStates = JSON.parse(raw);
              const secQuestions = activeSec.questions || activeSec.sqlQuestions || [];
              let totalAwarded = 0;
              let maxSectionMarks = 0;
              const submissions = [];
              secQuestions.forEach((q) => {
                const state = qStates[q.id] || {};
                const marks = Number(state.marksAwarded || 0);
                totalAwarded += marks;
                const qMarks = Number(q.marks || 10);
                maxSectionMarks += qMarks;
                submissions.push({
                  questionId: q.id,
                  title: q.title || `Question`,
                  marksAwarded: marks,
                  maxMarks: qMarks,
                  status: state.status || 'UNATTEMPTED',
                  submittedQuery: state.query || '',
                  submitted: Boolean(state.submitted)
                });
              });
              sqlData = {
                sectionId: activeSecId,
                sectionType: 'sql',
                name: activeSec.name || 'SQL Assessment Section',
                totalMarks: maxSectionMarks || Number(activeSec.maxScore) || 20,
                score: totalAwarded,
                marksAwarded: totalAwarded,
                maxMarks: maxSectionMarks || Number(activeSec.maxScore) || 20,
                percentage: maxSectionMarks > 0 ? Math.round((totalAwarded / maxSectionMarks) * 100) : 0,
                questionsAttempted: submissions.filter(s => s.submitted).length,
                totalQuestions: secQuestions.length,
                submissions,
                sqlSubmissions: submissions,
                autoSubmitted: true
              };
            }
          } catch (sqlErr) {
            console.warn('[MSA] autoSubmitEntireExam sql recovery error:', sqlErr);
          }

          combinedResults[activeSecId] = {
            sectionId: activeSecId,
            sectionName: activeSec.name || `Section ${currentSecIdx + 1}`,
            type: activeSec.type,
            startedAt: sectionStartTimesRef.current[currentSecIdx] || new Date().toISOString(),
            submittedAt: new Date().toISOString(),
            timeSpentSeconds: Math.max(0, (activeSec.duration_minutes || 30) * 60 - (secTimer || 0)),
            data: sqlData || {
              score: 0,
              maxScore: Number(activeSec.maxScore) || 20,
              totalQuestions: (activeSec.questions || []).length || 0,
              submissions: [],
              autoSubmitted: true
            }
          };
        } else {
          // MCQ and default sections
          let activeAnswers = {};
          let savedTiming = {};
          try {
            const raw = localStorage.getItem(`msa_active_mcq_state_${effectiveAssessment.id}_${activeSecId}`)
              || localStorage.getItem(`msa_active_mcq_state_${effectiveAssessment.id}_${activeSec.id ?? ''}`)
              || localStorage.getItem(`msa_active_mcq_state_${effectiveAssessment.id}`);
            if (raw) {
              const parsed = JSON.parse(raw);
              activeAnswers = parsed.answers || {};
              savedTiming = parsed.timeSpentPerQ || {};
            }
          } catch (_) { }

          const secQuestions = activeSec.questions || [];
          let earnedScore = 0;
          let answeredCount = 0;
          const evaluatedQuestions = secQuestions.map((q, i) => {
            const userAnsIdx = activeAnswers[i];
            const isAnswered = userAnsIdx !== undefined;
            if (isAnswered) answeredCount++;
            const userChoice = q.options?.[userAnsIdx];
            const isMatch = (q.correctAnswer !== undefined && (userChoice === q.correctAnswer || String(userChoice).trim().toLowerCase() === String(q.correctAnswer).trim().toLowerCase())) ||
              (q.correctIndex !== undefined && userAnsIdx === q.correctIndex) ||
              (q.answer !== undefined && userAnsIdx === q.answer);
            const qMarks = Number(q.marks) || Number(q.weight) || 1;
            if (isMatch) earnedScore += qMarks;
            return {
              ...q,
              userAnswer: userChoice ?? null,
              userAnswerIndex: userAnsIdx ?? null,
              isCorrect: Boolean(isMatch),
              marksEarned: isMatch ? qMarks : 0
            };
          });

          const maxSectionScore = Number(activeSec.maxScore) || secQuestions.reduce((sum, q) => sum + (Number(q.marks) || Number(q.weight) || 1), 0) || 10;

          combinedResults[activeSecId] = {
            sectionId: activeSecId,
            sectionName: activeSec.name || `Section ${currentSecIdx + 1}`,
            type: activeSec.type || 'mcq',
            startedAt: sectionStartTimesRef.current[currentSecIdx] || new Date().toISOString(),
            submittedAt: new Date().toISOString(),
            timeSpentSeconds: Math.max(0, (activeSec.duration_minutes || 30) * 60 - (secTimer || 0)),
            questionTiming: savedTiming,
            data: {
              score: earnedScore,
              maxScore: maxSectionScore,
              totalQuestions: secQuestions.length,
              answeredQuestions: answeredCount,
              answers: activeAnswers,
              questions: evaluatedQuestions,
              timeSpentPerQ: savedTiming,
              autoSubmitted: true
            }
          };
        }
      }
    }

    const sectionsList = (effectiveAssessment?.sections || []).map((sec, sIdx) => {
      const sKey = sec.sectionId || sec.id || sec.name || `sec_${sIdx}`;
      const resSec = combinedResults[sKey] || combinedResults[sec.sectionId] || combinedResults[sec.id] || combinedResults[sec.name] || combinedResults[String(sIdx)];
      const secData = resSec?.data || {};
      const secTime = resSec?.timeSpentSeconds || secData?.timeSpentSeconds || 0;
      const secM = Math.floor(secTime / 60);
      const secS = secTime % 60;
      return {
        sectionId: sKey,
        sectionName: sec.name || resSec?.sectionName || `Section ${sIdx + 1}`,
        name: sec.name || resSec?.sectionName || `Section ${sIdx + 1}`,
        type: sec.type || resSec?.type || 'unknown',
        score: secData.score || 0,
        maxScore: secData.maxScore || Number(sec.maxScore) || secData.totalQuestions || 0,
        startedAt: resSec?.startedAt || '',
        submittedAt: resSec?.submittedAt || '',
        timeSpentSeconds: secTime,
        timeTaken: secTime,
        timeTakenFormatted: `${secM}:${secS < 10 ? '0' : ''}${secS}`,
        questionTiming: resSec?.questionTiming || secData.questionTiming || {},
      };
    });

    // Add any extra sections from combinedResults that weren't in effectiveAssessment.sections
    Object.keys(combinedResults).forEach(key => {
      const match = sectionsList.some(s => s.sectionId === key || s.name === key);
      if (!match) {
        const extraSec = combinedResults[key];
        const secData = extraSec?.data || {};
        const secTime = extraSec?.timeSpentSeconds || secData?.timeSpentSeconds || 0;
        const secM = Math.floor(secTime / 60);
        const secS = secTime % 60;
        sectionsList.push({
          sectionId: key,
          sectionName: extraSec.sectionName || key,
          name: extraSec.sectionName || key,
          type: extraSec.type || 'unknown',
          score: secData.score || 0,
          maxScore: secData.maxScore || secData.totalQuestions || 0,
          startedAt: extraSec.startedAt || '',
          submittedAt: extraSec.submittedAt || '',
          timeSpentSeconds: secTime,
          timeTaken: secTime,
          timeTakenFormatted: `${secM}:${secS < 10 ? '0' : ''}${secS}`,
          questionTiming: extraSec.questionTiming || secData.questionTiming || {},
        });
      }
    });

    const aggregatedQuestions = Object.values(combinedResults)
      .filter(sec => {
        const sType = String(sec.type || sec.data?.type || '').toLowerCase();
        if (sType === 'coding' || sType === 'code' || sType === 'sql' || sType === 'sql_assessment' || sType === 'essay' || sType === 'essay_writing' || sType === 'spoken_english' || sType === 'speech' || sType === 'sea') {
          return false;
        }
        return (sType === 'mcq' || sType === 'questions' || sType === 'quiz' || !sType) && Array.isArray(sec.data?.questions);
      })
      .reduce((acc, sec) => acc.concat(sec.data.questions), [])
      .filter(q => q && (Array.isArray(q.options) || Boolean(q.questionText || q.question || q.text || q.prompt)) && q.testsPassed === undefined && q.totalTests === undefined && !q.problemTitle)
      .map((q, idx) => ({ ...q, questionNumber: idx + 1 }));

    const aggregatedCoding = Object.values(combinedResults)
      .filter(sec => sec.type === 'coding')
      .filter(sec => sec.data?.questions?.length || sec.data?.coding?.length)
      .reduce((acc, sec) => acc.concat(sec.data.questions || sec.data.coding || []), [])
      .map(c => buildCodingSubmission(c));

    const aggregatedEssay = Object.values(combinedResults)
      .filter(sec => sec.type === 'essay' || sec.type === 'essay_writing')
      .map(sec => ({
        sectionId: sec.sectionId || '',
        sectionName: sec.sectionName || 'Essay Writing',
        ...(sec.data || {}),
        studentTitle: sec.data?.studentTitle || sec.data?.submission?.studentTitle || '',
        answerText: sec.data?.answerText || sec.data?.submission?.answerText || '',
        wordCount: sec.data?.wordCount || sec.data?.submission?.wordCount || 0,
        rubricScores: sec.data?.rubricScores || sec.data?.evaluation?.rubricScores || {},
        rubricMax: sec.data?.rubricMax || sec.data?.evaluation?.rubricMax || {},
        grammarAnalysis: sec.data?.grammarAnalysis || sec.data?.evaluation?.grammarAnalysis || {},
      }));

    const aggregatedSql = Object.values(combinedResults)
      .filter(sec => sec.type === 'sql' || sec.sectionType === 'sql' || sec.data?.sectionType === 'sql')
      .reduce((acc, sec) => acc.concat(sec.data?.sqlSubmissions || sec.data?.submissions || []), []);

    const aggregatedQuestionTiming = Object.values(combinedResults)
      .filter(sec => sec.type === 'coding')
      .reduce((acc, sec) => {
        if (sec.questionTiming && Object.keys(sec.questionTiming).length > 0) {
          return { ...acc, ...sec.questionTiming };
        }
        if (sec.data?.questionTiming && Object.keys(sec.data?.questionTiming).length > 0) {
          return { ...acc, ...sec.data.questionTiming };
        }
        if (Array.isArray(sec.data?.questions)) {
          sec.data.questions.forEach((q, idx) => {
            const key = q.questionKey || `Q${idx + 1}`;
            if (!acc[key]) {
              acc[key] = {
                timeSpentSeconds: q.timeSpentSeconds || 0,
                timeSpentFormatted: q.timeSpentFormatted || '00:00',
                questionId: q.questionId || '',
                questionNumber: q.questionNumber || idx + 1,
                title: q.title || q.name || `Question ${idx + 1}`
              };
            }
          });
        }
        return acc;
      }, {});

    const totalMarksSum = sectionsList.reduce((acc, s) => acc + (Number(s.maxScore) || 0), 0) || Number(effectiveAssessment.maxScore) || 100;
    const totalScore = sectionsList.reduce((acc, s) => acc + (Number(s.score) || 0), 0);
    const pct = totalMarksSum > 0 ? (totalScore / totalMarksSum) : 0;
    const totalViolations = proctoringData.violationCount || 0;

    let authorizedStartedAt = examStartTimeRef.current || new Date().toISOString();
    try {
      const attemptSnap = await getActiveAttempt(effectiveAssessment.id);
      if (attemptSnap?.startedAt) {
        authorizedStartedAt = attemptSnap.startedAt.toDate
          ? attemptSnap.startedAt.toDate().toISOString()
          : new Date(attemptSnap.startedAt).toISOString();
      }
    } catch (_) {
      console.warn('[MSA] autoSubmit: Could not read authoritative startedAt, using client ref fallback');
    }

    const timeEndedISO = new Date().toISOString();
    const timeTaken = Math.max(0, Math.round((new Date(timeEndedISO).getTime() - new Date(authorizedStartedAt).getTime()) / 1000));
    const timeM = Math.floor(timeTaken / 60);
    const timeS = timeTaken % 60;
    const timeTakenFormatted = `${timeM}:${timeS < 10 ? '0' : ''}${timeS}`;

    const totalNoFace = (proctoringData.violations || []).filter(v => v.type === 'no_face').length;
    const totalMultipleFaces = (proctoringData.violations || []).filter(v => v.type === 'multiple_faces').length;

    const attemptData = buildResultDoc({
      user: {
        uid: userId,
        email: tenant.email,
        name: effectiveUser.name || '',
        rollNumber: effectiveUser.rollNumber || '',
        tenantId: tenant.tenantId,
        college: tenant.college,
        department: tenant.department,
        year: tenant.year,
        cohortId: tenant.cohortId,
      },
      assessment: {
        id: effectiveAssessment.id,
        title: effectiveAssessment.name || effectiveAssessment.title || '',
        assessmentType: 'multi_section',
      },
      scores: {
        totalScore,
        maxScore: totalMarksSum,
        percentage: totalMarksSum > 0 ? Math.min(100, Math.round(pct * 100)) : 0,
        passed: totalMarksSum > 0 && (totalScore / totalMarksSum >= 0.5),
      },
      timing: {
        startedAt: authorizedStartedAt,
        timeTakenSeconds: timeTaken,
      },
      submission: {
        autoSubmitted: true,
        submissionReason: reason || 'proctoring_violations',
      },
      sections: sectionsList,
      questions: aggregatedQuestions,
      codingSubmissions: aggregatedCoding,
      essaySubmissions: aggregatedEssay,
      sqlSubmissions: aggregatedSql,
      questionTiming: aggregatedQuestionTiming,
      proctoring: {
        violationCount: totalViolations,
        totalNoFace,
        totalMultipleFaces,
        violations: proctoringData.violations || [],
      },
      sessionAttemptId: attemptDocId(userId, effectiveAssessment.id),
    });

    const v2DocPath = `assessmentResults/${tenant.tenantId}/${effectiveAssessment.id}/${userId}`;

    try {
      await transitionAttemptState(effectiveAssessment?.id, ATTEMPT_STATES.SUBMITTING, {
        autoSubmitted: true,
        autoSubmitReason: reason || 'proctoring_violations',
      }).catch(() => { });

      const sanitizedPayload = JSON.parse(JSON.stringify(attemptData));
      await setDoc(doc(db, v2DocPath), sanitizedPayload);
      console.log('[MSA] Final result saved to Firestore canonical path:', v2DocPath);

      // ── RECRUITER ASSESSMENT RESULTS ISOLATION (Auto-termination) ──
      try {
        const courseCtx = (() => {
          try { return JSON.parse(sessionStorage.getItem('msaCourseCtx') || '{}'); } catch (_) { return {}; }
        })();
        const isRecruiterAssessment = Boolean(
          effectiveAssessment?.isRecruitment ||
          effectiveAssessment?.tag === 'Recruitment' ||
          effectiveAssessment?.category === 'recruiter' ||
          effectiveAssessment?.recruiterAssessmentId ||
          effectiveAssessment?.recruiterId ||
          effectiveAssessment?.companyId ||
          effectiveAssessment?.courseId?.startsWith('recruiter_') ||
          courseCtx?.isRecruitment ||
          courseCtx?.recruiterId ||
          courseCtx?.companyId ||
          courseCtx?.courseId?.startsWith('recruiter_')
        );

        if (isRecruiterAssessment) {
          const effectiveRecruiterId = String(
            effectiveAssessment?.recruiterId ||
            courseCtx?.recruiterId ||
            effectiveAssessment?.companyId ||
            courseCtx?.companyId ||
            (effectiveAssessment?.courseId?.startsWith('recruiter_') ? effectiveAssessment.courseId.replace('recruiter_', '') : '') ||
            (courseCtx?.courseId?.startsWith('recruiter_') ? courseCtx.courseId.replace('recruiter_', '') : '') ||
            effectiveAssessment?.createdByUid ||
            courseCtx?.createdByUid ||
            (effectiveAssessment?.companyName ? slugify(effectiveAssessment.companyName) : 'recruiter_default')
          ).trim();

          const recruiterPayload = {
            ...sanitizedPayload,
            recruiterId: effectiveRecruiterId,
            companyId: effectiveAssessment?.companyId || courseCtx?.companyId || effectiveRecruiterId,
            companyName: effectiveAssessment?.companyName || courseCtx?.companyName || 'Corporate Partner',
            assessmentId: effectiveAssessment.id,
            testId: effectiveAssessment.id,
            testName: effectiveAssessment.name || effectiveAssessment.title || 'Recruitment Assessment',
            userId,
            studentUid: userId,
            studentName: effectiveUser.name || '',
            studentEmail: tenant.email || '',
            studentCollege: tenant.college || '',
            studentDepartment: tenant.department || '',
            studentYear: tenant.year || '',
            studentRollNumber: effectiveUser.rollNumber || '',
            score: totalScore,
            maxScore: totalMarksSum,
            percentage: totalMarksSum > 0 ? Math.min(100, Math.round((totalScore / totalMarksSum) * 100)) : 0,
            isPassed: totalMarksSum > 0 && (totalScore / totalMarksSum >= 0.5),
            status: 'submitted',
            autoSubmitted: true,
            submissionReason: reason || 'proctoring_violations',
            submittedAt: serverTimestamp(),
            timeTakenSeconds: timeTaken,
            proctorViolations: totalViolations,
            sections: sectionsList,
            codingSubmissions: aggregatedCoding,
            questions: aggregatedQuestions,
            essaySubmissions: aggregatedEssay,
            questionTiming: aggregatedQuestionTiming
          };

          const rPath1 = `recruitorAssessmentResults/${effectiveRecruiterId}/${effectiveAssessment.id}/${userId}`;
          const rPath2 = `recruiterAssessmentResults/${effectiveRecruiterId}/${effectiveAssessment.id}/${userId}`;
          await Promise.all([
            setDoc(doc(db, rPath1), recruiterPayload, { merge: true }),
            setDoc(doc(db, rPath2), recruiterPayload, { merge: true })
          ]);
          console.log('[MSA] Recruiter auto-termination result saved to:', rPath1);
        }
      } catch (recWriteErr) {
        console.warn('[MSA] Non-fatal recruiterAssessmentResults auto-terminate write error:', recWriteErr);
      }
    } catch (writeErr) {
      console.error('[MSA] Remote write failed, saving local envelope:', writeErr);
      const envKey = `msa_pending_submission_${userId}_${effectiveAssessment.id}`;
      const sanitizedPayload = JSON.parse(JSON.stringify(attemptData));
      savePendingEnvelope(envKey, {
        uid: userId,
        assessmentId: effectiveAssessment.id,
        resultPayload: sanitizedPayload,
        savedAt: new Date().toISOString(),
      }).catch(() => { });
    }

    // ── Placement track clearance sync on auto-submit ──
    const isAutoPlacementClearance = Boolean(
      effectiveAssessment?.trackType === 'placement' ||
      effectiveAssessment?.placementLevel ||
      (effectiveAssessment?.id && String(effectiveAssessment.id).toLowerCase().includes('placement-clearance')) ||
      (effectiveAssessment?.slug && String(effectiveAssessment.slug).toLowerCase().includes('placement-clearance'))
    );

    if (isAutoPlacementClearance) {
      try {
        const levelNum = Number(effectiveAssessment.placementLevel || 1);
        const attemptId = effectiveAssessment.attemptId || sessionStorage.getItem('placementAttemptId') || `ATTEMPT-${levelNum}-${Date.now()}`;
        const passPct = Number(effectiveAssessment.passPercentage || 70);
        const primaryScore = Number(totalScore || 0);
        const totalPossible = Number(totalMarksSum || 1600);
        const percentageAchieved = totalPossible > 0 ? Math.round((primaryScore / totalPossible) * 100) : 0;
        const isPassed = percentageAchieved >= passPct;

        await submitAssessmentResult(userId, levelNum, attemptId, {
          passed: isPassed,
          score: percentageAchieved,
          feedback: isPassed
            ? `Cleared Level ${levelNum} Placement Assessment with ${percentageAchieved}%!`
            : `Scored ${percentageAchieved}% (Auto-submitted: ${reason || 'time_expired'}).`
        });
        console.log(`[MSA] Placement track auto-submitted: Level ${levelNum}, Passed: ${isPassed}, Score: ${percentageAchieved}%`);
      } catch (placementErr) {
        console.error('[MSA] Failed to sync placement track on auto-submit:', placementErr);
      }
    }

    try {
      await completeAssessmentSession(effectiveAssessment?.id, { autoSubmitted: true, reason: reason || 'proctoring_violations' });
    } catch (sErr) {
      console.warn('[MSA] completeAssessmentSession notice:', sErr);
    }

    try {
      await markAssessmentCompleted(effectiveUser, effectiveAssessment?.id);
      if (email) invalidateCompletionCache(email);
    } catch (cErr) {
      console.warn('[MSA] markAssessmentCompleted notice:', cErr);
    }

    // ── Course progress tracking (non-fatal) ──
    try {
      const courseCtx = JSON.parse(sessionStorage.getItem('msaCourseCtx') || '{}');
      if (courseCtx.courseId && courseCtx.seriesId) {
        import('../services/mcqService').then(({ default: MCQService }) => {
          const totalScore = Object.values(combinedResults || {}).reduce((s, sec) => s + (sec.totalScore || 0), 0);
          const effectiveTestId = (courseCtx.testId || courseCtx.assessmentId || effectiveAssessment?.id || assessment?.id || '').trim();
          if (effectiveTestId) {
            MCQService.markCourseProgress({
              uid: effectiveUser?.uid ?? '',
              courseId: courseCtx.courseId,
              seriesId: courseCtx.seriesId,
              testId: effectiveTestId,
              assessmentId: effectiveTestId,
              score: totalScore,
              totalScore: totalScore,
              maxScore: courseCtx.maxScore || 100,
            }).catch(() => { });
          }
        }).catch(() => { });
        sessionStorage.removeItem('msaCourseCtx');
      }
    } catch (_) { /* non-fatal */ }

    // Clear MCQ, Coding, and proctoring temporary workspace details
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        (effectiveAssessment?.id && key.startsWith(`msa_active_mcq_state_${effectiveAssessment.id}`)) ||
        (effectiveAssessment?.id && key.startsWith(`msa_active_coding_state_${effectiveAssessment.id}`)) ||
        key === 'msa_active_coding_latest' ||
        key.startsWith(`codingAssessmentCode`) ||
        key.startsWith(`codingQuestionScores`) ||
        key.startsWith(`codingTimeSpentPerQ`) ||
        key.startsWith(`codingQuestionTiming`) ||
        key.startsWith(`proctor_violations_`) ||
        key.startsWith(`proctor_events_`)
      )) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    sessionStorage.removeItem('multisectionAssessmentData');
    localStorage.removeItem(`msaProgress_${effectiveAssessment?.id}`);
    clearAssessmentSnapshot(effectiveAssessment?.id);
    try {
      await desktopBridge.markAssessmentSubmitted();
      await desktopBridge.forceEndAssessment();
    } catch (dbErr) {
      console.warn('[MSA] desktopBridge cleanup error in autoSubmitEntireExam:', dbErr);
    }
    setIsSubmittingEntireExam(false);
    setExamFinished(true);
    stopAllMediaAndAI();
  }, [assessment, currentSecIdx, examResults, proctoringData, secTimer, user]);

  const handleProctorReady = useCallback(() => {
    console.log('[MSA] Camera Proctoring is ready');
    setTimeout(() => {
      setIsVisualProctorReady(true);
    }, 0);
  }, []);

  const handleProctorViolationUpdate = useCallback((info) => {
    if (!info?.violationType || info.violationType === 'init_sync') return;

    // ── Firestore audit trail (fire-and-forget) ───────────────────────────────
    const uid = auth?.currentUser?.uid;
    if (uid && assessment?.id) {
      writeViolationToFirestore(uid, assessment.id, {
        type: info.violationType,
        timestamp: info.timestamp || new Date().toISOString(),
        source: 'camera',
      });
    }

    const realViolationTypes = ['no_face', 'multiple_faces', 'tab_switch', 'fullscreen_exit', 'cell_phone', 'prohibited_object', 'looking_away', 'face_mismatch'];
    const isReal = realViolationTypes.includes(info.violationType);
    const isTabSwitch = info.violationType === 'tab_switch' || info.violationType === 'fullscreen_exit';

    setProctoringData(prev => {
      const nextCount = typeof info.violationCount === 'number' ? info.violationCount : (prev.violationCount + 1);
      const prevTabSwitches = typeof prev.tabSwitchCount === 'number'
        ? prev.tabSwitchCount
        : (prev.violations || []).filter(v => v.type === 'tab_switch' || v.type === 'fullscreen_exit').length;
      const nextTabSwitches = isTabSwitch ? prevTabSwitches + 1 : prevTabSwitches;

      if ((maxViolations > 0 && nextCount >= maxViolations) || (tabSwitchLimit > 0 && nextTabSwitches >= tabSwitchLimit)) {
        setTimeout(() => {
          console.warn(`[MSA] Violation limit reached (count: ${nextCount}/${maxViolations}, tabs: ${nextTabSwitches}/${tabSwitchLimit}). Auto-submitting exam...`);
          window.dispatchEvent(new CustomEvent('seb:stop-proctoring-hardware'));
          stopAllMediaAndAI();
          autoSubmitEntireExam('proctoring_violations');
        }, 0);
      }

      if (isTabSwitch) {
        if (tabSwitchLimit > 0 && nextTabSwitches >= tabSwitchLimit) {
          toast.error(`Exam auto-submitted: Tab switch limit (${tabSwitchLimit}) exceeded!`, { id: 'tab-switch-toast', duration: 4000 });
        } else {
          toast.warning(`⚠️ Warning: Tab switch / window focus loss detected! (${nextTabSwitches}${tabSwitchLimit > 0 ? `/${tabSwitchLimit}` : ''})`, {
            id: 'tab-switch-toast',
            duration: 3500
          });
        }
      }

      return {
        ...prev,
        violationCount: nextCount,
        tabSwitchCount: nextTabSwitches,
        violations: isReal ? [...prev.violations, { type: info.violationType, timestamp: info.timestamp }] : prev.violations
      };
    });
  }, [maxViolations, tabSwitchLimit, autoSubmitEntireExam, assessment?.id]);


  const handleProctorAutoSubmit = useCallback(() => {
    window.dispatchEvent(new CustomEvent('seb:stop-proctoring-hardware'));
    stopAllMediaAndAI();
    setTimeout(() => {
      autoSubmitEntireExam('proctoring_violations');
    }, 300);
  }, [autoSubmitEntireExam]);

  const handleAudioProctorReady = useCallback(() => {
    console.log('[MSA] Audio Proctoring is ready');
    setTimeout(() => {
      setIsAudioProctorReady(true);
    }, 0);
  }, []);

  const handleAudioProctorViolationUpdate = useCallback((info) => {
    if (!info?.type) return;

    // ── Firestore audit trail (fire-and-forget) ───────────────────────────────
    const uid = auth?.currentUser?.uid;
    if (uid && assessment?.id) {
      writeViolationToFirestore(uid, assessment.id, {
        type: info.type,
        timestamp: info.timestamp || new Date().toISOString(),
        source: 'audio',
      });
    }

    setProctoringData(prev => {
      const nextAudioCount = (prev.audioViolationCount || 0) + 1;

      setTimeout(() => {
        if (nextAudioCount >= maxAudioViolations) {
          window.dispatchEvent(new CustomEvent('seb:stop-proctoring-hardware'));
          stopAllMediaAndAI();
          autoSubmitEntireExam('proctoring_violations');
        } else if (info.type === 'audio-noise-detected') {
          toast.warning(`⚠️ Audio Warning: Voice / noise detected! (${nextAudioCount}/${maxAudioViolations})`, {
            id: 'audio-violation-toast',
            duration: 3500
          });
        } else if (info.type === 'audio-mic-disconnected') {
          toast.error(`⚠️ Microphone disconnected!`, {
            id: 'audio-mic-toast',
            duration: 4000
          });
        } else if (info.type === 'audio-permission-denied') {
          toast.error(`⚠️ Microphone access denied!`, {
            id: 'audio-perm-toast',
            duration: 4000
          });
        }
      }, 0);

      return {
        ...prev,
        audioViolationCount: nextAudioCount,
        violations: [...prev.violations, { type: info.type, timestamp: info.timestamp }]
      };
    });
  }, [maxAudioViolations, autoSubmitEntireExam, assessment?.id]);

  // ── Tab switch & visibility change proctoring listeners with 1.5s debounce (P0-06 / P1) ──
  const lastTabSwitchRef = useRef(0);
  const hiddenStartTimeRef = useRef(0);

  useEffect(() => {
    if (!shouldWatchTabSwitches || currentSecIdx < 0 || !secStarted || examFinished) return;

    const reportTabViolation = (reason = '') => {
      const now = Date.now();
      // Debounce rapid blur + visibilitychange within 1.5s so switching away is counted as 1 single event
      if (now - lastTabSwitchRef.current < 1500) return;
      lastTabSwitchRef.current = now;

      const eventData = {
        violationType: 'tab_switch',
        timestamp: new Date().toISOString(),
        reason
      };
      handleProctorViolationUpdate(eventData);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenStartTimeRef.current = Date.now();
        reportTabViolation('visibility_hidden');
      } else {
        const awayDuration = hiddenStartTimeRef.current ? Math.round((Date.now() - hiddenStartTimeRef.current) / 1000) : 0;
        hiddenStartTimeRef.current = 0;
        // Tab return is informational — log to Firestore if available, but do not increment strike count
        const uid = auth?.currentUser?.uid || user?.uid || user?.id;
        if (uid && assessment?.id) {
          writeViolationToFirestore(uid, assessment.id, {
            type: 'tab_return',
            awayDuration,
            timestamp: new Date().toISOString(),
            source: 'system'
          });
        }
      }
    };

    const handleWindowBlur = () => {
      reportTabViolation('window_blur');
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        const now = Date.now();
        if (now - lastTabSwitchRef.current < 1500) return;
        lastTabSwitchRef.current = now;
        handleProctorViolationUpdate({
          violationType: 'fullscreen_exit',
          timestamp: new Date().toISOString()
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [shouldWatchTabSwitches, currentSecIdx, secStarted, examFinished, handleProctorViolationUpdate, assessment?.id, user]);

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
      try { stopAllMediaAndAI(); } catch (_) { }
    };
  }, []);

  // ── Initial load
  useEffect(() => {
    const initLoad = async () => {
      let authData = {};
      let assessmentData = null;
      try {
        authData = JSON.parse(localStorage.getItem('auth_data') || '{}');
        assessmentData = JSON.parse(sessionStorage.getItem('multisectionAssessmentData') || 'null');

        // Fallback to persistent localStorage backup if sessionStorage was cleared by browser exit/tab close
        if (!assessmentData) {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('msaActiveAssessment_')) {
              try {
                const backup = JSON.parse(localStorage.getItem(key) || 'null');
                if (backup) {
                  assessmentData = backup;
                  sessionStorage.setItem('multisectionAssessmentData', JSON.stringify(backup));
                  break;
                }
              } catch (_) { }
            }
          }
        }

        // Fallback to URL path slug resolving local public assessment JSON or Firestore
        if (!assessmentData && typeof window !== 'undefined') {
          const pathParts = window.location.pathname.split('/').filter(Boolean);
          const pathSlug = pathParts[pathParts.length - 1];
          if (pathSlug && pathSlug !== 'dashboard' && pathSlug !== 'assessment') {
            try {
              const res = await fetch(`/seed-contents/assessments/${pathSlug}.json`);
              if (res.ok) {
                assessmentData = await res.json();
                sessionStorage.setItem('multisectionAssessmentData', JSON.stringify(assessmentData));
                sessionStorage.setItem('msaSlug', pathSlug);
              }
            } catch (_) { }

            if (!assessmentData) {
              try {
                const docSnap = await getDoc(doc(db, 'assessments', pathSlug));
                if (docSnap.exists()) {
                  assessmentData = { id: docSnap.id, ...docSnap.data() };
                  sessionStorage.setItem('multisectionAssessmentData', JSON.stringify(assessmentData));
                  sessionStorage.setItem('msaSlug', pathSlug);
                }
              } catch (_) { }
            }
          }
        }

        if (!authData?.email && auth?.currentUser?.email) {
          authData = {
            uid: auth.currentUser.uid,
            email: auth.currentUser.email,
            name: auth.currentUser.displayName || 'Student',
            ...authData
          };
        }
      } catch (e) {
        console.error('[MSA] Failed to parse localStorage / fallback:', e);
      }

      if (!authData?.email || !assessmentData) {
        navigate('/student/dashboard', { replace: true });
        return;
      }

    // Verify schedule window
    if (assessmentData.schedule) {
      const { startDate, endDate } = parseScheduleWindow(assessmentData.schedule);
      const now = new Date();
      if (startDate && now < startDate) {
        toast.error(`This test has not started yet. It is scheduled to start on ${startDate.toLocaleDateString()} at ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`);
        sessionStorage.removeItem('multisectionAssessmentData');
        localStorage.removeItem(`msaActiveAssessment_${assessmentData.id}`);
        navigate('/student/dashboard', { replace: true });
        return;
      }
      if (endDate && now > endDate) {
        toast.error(`This test schedule has expired. The access window closed on ${endDate.toLocaleDateString()} at ${endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`);
        sessionStorage.removeItem('multisectionAssessmentData');
        localStorage.removeItem(`msaActiveAssessment_${assessmentData.id}`);
        navigate('/student/dashboard', { replace: true });
        return;
      }
    }

    // Verify candidate targeting restrictions (Approach A: Email / Roll number / UID targeting)
    if (assessmentData.targeting) {
      const { targetType, allowedEmails, allowedRollNumbers, allowedUserIds, tenantIds, years, departments } = assessmentData.targeting;

      if (Array.isArray(tenantIds) && tenantIds.length > 0) {
        const sTenant = String(authData.tenantId || authData.College || authData.college || '').toLowerCase();
        if (!tenantIds.some(tid => String(tid || '').toLowerCase() === sTenant)) {
          toast.error('Access Restricted: This assessment is not available for your institution.');
          sessionStorage.removeItem('multisectionAssessmentData');
          localStorage.removeItem(`msaActiveAssessment_${assessmentData.id}`);
          navigate('/student/dashboard', { replace: true });
          return;
        }
      }

      if (Array.isArray(years) && years.length > 0) {
        const sYear = String(authData.year || authData.Year || '').toLowerCase();
        if (!years.some(y => String(y || '').toLowerCase() === sYear)) {
          toast.error('Access Restricted: This assessment is not open to your academic year.');
          sessionStorage.removeItem('multisectionAssessmentData');
          localStorage.removeItem(`msaActiveAssessment_${assessmentData.id}`);
          navigate('/student/dashboard', { replace: true });
          return;
        }
      }

      if (Array.isArray(departments) && departments.length > 0) {
        const sDept = String(authData.department || authData.Department || '').toLowerCase();
        if (!departments.some(d => String(d || '').toLowerCase() === sDept)) {
          toast.error('Access Restricted: This assessment is not open to your department.');
          sessionStorage.removeItem('multisectionAssessmentData');
          localStorage.removeItem(`msaActiveAssessment_${assessmentData.id}`);
          navigate('/student/dashboard', { replace: true });
          return;
        }
      }

      const isRestrictedToSpecific =
        targetType === 'specific_students' ||
        (Array.isArray(allowedEmails) && allowedEmails.length > 0) ||
        (Array.isArray(allowedRollNumbers) && allowedRollNumbers.length > 0) ||
        (Array.isArray(allowedUserIds) && allowedUserIds.length > 0);

      if (isRestrictedToSpecific) {
        const studentEmail = String(authData.email || auth?.currentUser?.email || '').trim().toLowerCase();
        const studentRoll = String(authData.rollNumber || '').trim().toUpperCase();
        const studentUid = String(authData.uid || auth?.currentUser?.uid || '').trim();

        const emailAllowed =
          Array.isArray(allowedEmails) &&
          allowedEmails.length > 0 &&
          allowedEmails.some(e => String(e || '').trim().toLowerCase() === studentEmail);

        const rollAllowed =
          Array.isArray(allowedRollNumbers) &&
          allowedRollNumbers.length > 0 &&
          allowedRollNumbers.some(r => String(r || '').trim().toUpperCase() === studentRoll);

        const uidAllowed =
          Array.isArray(allowedUserIds) &&
          allowedUserIds.length > 0 &&
          allowedUserIds.some(u => String(u || '').trim() === studentUid);

        if (!emailAllowed && !rollAllowed && !uidAllowed) {
          toast.error('Access Restricted: You are not authorized to take this assessment.');
          sessionStorage.removeItem('multisectionAssessmentData');
          localStorage.removeItem(`msaActiveAssessment_${assessmentData.id}`);
          navigate('/student/dashboard', { replace: true });
          return;
        }
      }
    }

    const isPlacementTest = Boolean(
      assessmentData?.trackType === 'placement' ||
      assessmentData?.placementLevel ||
      (assessmentData?.id && String(assessmentData.id).toLowerCase().includes('placement-clearance')) ||
      (assessmentData?.slug && String(assessmentData.slug).toLowerCase().includes('placement-clearance'))
    );

    // Immediately block if already submitted locally (placement assessments manage attempts via cooldowns)
    if (!isPlacementTest && assessmentData.id && localStorage.getItem(`msaCompleted_${assessmentData.id}`) === 'true') {
      toast.error('You have already completed and submitted this assessment. Re-attempts are not permitted.');
      sessionStorage.removeItem('multisectionAssessmentData');
      localStorage.removeItem(`msaActiveAssessment_${assessmentData.id}`);
      localStorage.removeItem(`msaProgress_${assessmentData.id}`);
      navigate('/student/dashboard', { replace: true });
      return;
    }

    setUser(authData);
    setAssessment(assessmentData);
    // Mirror into refs immediately so autoSubmitEntireExam can use them
    // synchronously before React has flushed the above state updates.
    userRef.current = authData;
    assessmentRef.current = assessmentData;
    localStorage.setItem(`msaActiveAssessment_${assessmentData.id}`, JSON.stringify(assessmentData));

    // Verify if already completed/submitted on server (Strict 1-attempt policy, bypassed for placement track)
    const checkAttempt = async () => {
      if (isPlacementTest) return;
      try {
        const uid = auth?.currentUser?.uid || authData.uid;
        if (!uid) return;

        // 1. Check user profile completedAssessmentIds array
        if (authData.completedAssessmentIds?.includes(assessmentData.id)) {
          localStorage.setItem(`msaCompleted_${assessmentData.id}`, 'true');
          toast.error('You have already completed your 1 permitted attempt for this assessment. Re-attempts are not permitted.');
          sessionStorage.removeItem('multisectionAssessmentData');
          localStorage.removeItem(`msaActiveAssessment_${assessmentData.id}`);
          localStorage.removeItem(`msaProgress_${assessmentData.id}`);
          navigate('/student/dashboard', { replace: true });
          return;
        }

        // 2. Check canonical multi-tenant result paths
        const tenantId = authData.tenantId || 'global';
        const candidatePaths = [
          `assessmentResults/${tenantId}/${assessmentData.id}/${uid}`,
          `assessmentResults/global/${assessmentData.id}/${uid}`,
          `assessmentResults/ALL/${assessmentData.id}/${uid}`,
        ];

        for (const canonDocPath of candidatePaths) {
          try {
            const docSnap = await getDoc(doc(db, canonDocPath));
            if (docSnap.exists()) {
              const data = docSnap.data();
              if (data.completed === true || data.status === 'submitted' || data.submitted === true) {
                localStorage.setItem(`msaCompleted_${assessmentData.id}`, 'true');
                toast.error('You have already completed your 1 permitted attempt for this assessment. Re-attempts are not permitted.');
                sessionStorage.removeItem('multisectionAssessmentData');
                localStorage.removeItem(`msaActiveAssessment_${assessmentData.id}`);
                localStorage.removeItem(`msaProgress_${assessmentData.id}`);
                navigate('/student/dashboard', { replace: true });
                return;
              }
            }
          } catch (_) {}
        }
      } catch (err) {
        console.error('[MSA] Failed to check existing attempt:', err);
      }
    };

    checkAttempt();

    // Crash / Exit recovery with 15-minute grace period check.
    // Guard with a ref so React StrictMode's double-invoke does not fire this twice.
    const progressKey = `msaProgress_${assessmentData.id}`;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(progressKey) || 'null'); } catch (_) { }
    if (!saved) {
      try {
        saved = await loadAssessmentSnapshot(assessmentData.id);
      } catch (_) {}
    }
    const currentEmail = authData.email || authData.Email;
    if (saved && saved.email && currentEmail && saved.email.toLowerCase() !== currentEmail.toLowerCase()) {
      localStorage.removeItem(progressKey);
      saved = null;
    }
    if (saved && saved.email && currentEmail && saved.email.toLowerCase() === currentEmail.toLowerCase()) {
      const nowMs = new Date().getTime();
      const lastActiveMs = saved.lastActiveTimestamp || (saved.savedAt ? new Date(saved.savedAt).getTime() : nowMs);
      const elapsedOfflineSec = Math.floor((nowMs - lastActiveMs) / 1000);
      const GRACE_PERIOD_SEC = 900; // 15 minutes

      if (elapsedOfflineSec > GRACE_PERIOD_SEC) {
        if (gracePeriodFiredRef.current) return; // StrictMode guard
        gracePeriodFiredRef.current = true;
        console.warn(`[MSA] Offline exit duration (${elapsedOfflineSec}s) exceeded ${GRACE_PERIOD_SEC / 60}-minute grace period. Auto-submitting.`);
        toast.warning(`Your assessment was auto-submitted because your offline exit window exceeded ${GRACE_PERIOD_SEC / 60} minutes.`);
        examResultsRef.current = saved.examResults || {};
        setExamResults(saved.examResults || {});
        setSecCompleted(saved.completedSections || {});
        // Use a short delay to let React batch the state above, then submit
        setTimeout(() => {
          autoSubmitEntireExam('grace_period_exceeded');
        }, 500);
        return;
      }

      console.log(`[MSA] Restoring progress within 5-min grace period (${elapsedOfflineSec}s offline)`);
      examResultsRef.current = saved.examResults || {};
      setExamResults(saved.examResults || {});
      setSecCompleted(saved.completedSections || {});
      setRestoredProgress({
        ...saved,
        elapsedOfflineSec
      });
    }

      loadAllSections(assessmentData).then(() => {
        // Only attach session on load if actively restoring an existing in-progress session.
        // If candidate is on the welcome screen, session starts when handleStartSection is clicked.
        const slug = sessionStorage.getItem('msaSlug') || (assessmentData.id ?? '');
        if (saved && saved.currentSecIdx !== undefined && saved.currentSecIdx >= 0) {
          startAssessmentSession(assessmentData, slug).catch(() => { });
        }
      });
    };

    initLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Resume after crash / exit
  useEffect(() => {
    if (!assessment || !restoredProgress) return;
    if (restoredProgress.currentSecIdx !== undefined && restoredProgress.currentSecIdx >= 0) {
      let adjustedTimer = 0;
      if (restoredProgress.sectionEndTimeMs && restoredProgress.sectionEndTimeMs > 0) {
        adjustedTimer = Math.max(0, Math.round((restoredProgress.sectionEndTimeMs - Date.now()) / 1000));
      } else {
        const elapsed = restoredProgress.elapsedOfflineSec || 0;
        adjustedTimer = Math.max(0, (restoredProgress.secTimer || 0) - elapsed);
      }
      sectionEndTimeMsRef.current = Date.now() + adjustedTimer * 1000;

      console.log('[MSA] Resuming active section index:', restoredProgress.currentSecIdx, 'Adjusted timer:', adjustedTimer, 's');

      if (adjustedTimer <= 0 && restoredProgress.secStarted) {
        console.warn('[MSA] Active section timer expired while offline. Submitting active section.');
        setCurrentSecIdx(restoredProgress.currentSecIdx);
        setSecStarted(true);
        setSecTimer(0);
        setSectionCountdown(null);
        setTimeout(() => autoSubmitSectionRef.current?.(), 1000);
      } else if (restoredProgress.secStarted) {
        // Was actively in the section — restore directly without prelaunch
        setCurrentSecIdx(restoredProgress.currentSecIdx);
        setSecStarted(true);
        setSecTimer(adjustedTimer);
        setSectionCountdown(null);
      } else {
        // Was on prelaunch screen — remain on prelaunch screen
        setCurrentSecIdx(-1);
        setSecStarted(false);
        if (adjustedTimer > 0) setSecTimer(adjustedTimer);
      }
    } else {
      const nextIdx = (restoredProgress.lastSectionIdx ?? -1) + 1;
      const sectionsCount = (assessment.sections || []).length;
      if (nextIdx < sectionsCount) {
        if (nextIdx === 0) {
          // Section 0 not started yet — remain on prelaunch screen so proctoring & pairing can be completed
          setCurrentSecIdx(-1);
          setSecStarted(false);
        } else {
          handleStartSection(nextIdx);
        }
      } else {
        setExamFinished(true);
      }
    }
    setRestoredProgress(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment, restoredProgress]);

  // ── Continuous progress save & heartbeat to localStorage & Firestore cloud backup
  const lastCloudSyncRef = useRef(0);
  useEffect(() => {
    if (!assessment || currentSecIdx < 0 || !secStarted) return;
    const progressKey = `msaProgress_${assessment.id}`;
    const nowMs = new Date().getTime();

    // Preserve existing completed sections in localStorage - NEVER overwrite with empty!
    let mergedExamResults = {
      ...(examResultsRef.current || {}),
      ...(examResults || {})
    };
    try {
      const prevSaved = JSON.parse(localStorage.getItem(progressKey) || '{}');
      if (prevSaved.examResults && Object.keys(prevSaved.examResults).length > 0) {
        mergedExamResults = { ...prevSaved.examResults, ...mergedExamResults };
      }
    } catch (_) {}
    examResultsRef.current = mergedExamResults;

    const snapshot = {
      assessmentId: assessment.id,
      email: user?.email ?? '',
      completedSections: secCompleted,
      examResults: mergedExamResults,
      currentSecIdx,
      secStarted,
      secTimer,
      sectionEndTimeMs: sectionEndTimeMsRef.current,
      savedAt: new Date().toISOString(),
      lastActiveTimestamp: nowMs
    };
    saveAssessmentSnapshot(assessment.id, snapshot);
    localStorage.setItem(progressKey, JSON.stringify(snapshot));
    localStorage.setItem(`msaActiveAssessment_${assessment.id}`, JSON.stringify(assessment));

    // Periodic cloud sync to assessmentResults & contestAttempts (throttled every 5 minutes / 300s)
    if (nowMs - lastCloudSyncRef.current > 300000) {
      lastCloudSyncRef.current = nowMs;
      try {
        const tenant = requireTenant(user);
        const userId = auth?.currentUser?.uid || user?.uid;
        if (userId && tenant?.tenantId && assessment?.id) {
          const totalSecs = (assessment.sections || []).length;
          // 1. Sync in-progress snapshot to assessmentResults
          const progressPayload = {
            userId,
            email: tenant.email || user.email || '',
            rollNumber: user.rollNumber ?? '',
            name: user.name ?? '',
            tenantId: tenant.tenantId,
            cohortId: tenant.cohortId || '2K27',
            assessmentId: assessment.id,
            assessmentTitle: assessment.name || assessment.title || '',
            type: 'multisection',
            status: 'in_progress',
            completed: false,
            sectionsCompleted: Object.keys(secCompleted || {}).length,
            totalSections: totalSecs,
            sections: examResults,
            activeSection: {
              idx: currentSecIdx,
              name: assessment.sections?.[currentSecIdx]?.name || `Section ${currentSecIdx + 1}`,
              status: 'IN_PROGRESS',
              timeRemainingSeconds: secTimer
            },
            lastUpdatedAt: serverTimestamp(),
            lastUpdatedAtISO: new Date().toISOString()
          };
          const targetDoc = `assessmentResults/${tenant.tenantId}/${assessment.id}/${userId}`;
          setDoc(doc(db, targetDoc), progressPayload, { merge: true })
            .catch(() => {
              // Network dropped — queue to transactional Write-Ahead Log
              queueWALMutation({ targetDoc, payload: progressPayload, type: 'in_progress_sync' });
            });

          // 2. Sync to contestAttempts
          const attDocId = `${assessment.id}_${userId}`;
          const attemptPayload = {
            uid: userId,
            assessmentId: assessment.id,
            tenantId: tenant.tenantId,
            status: 'IN_PROGRESS',
            completed: false,
            activeSection: {
              id: assessment.sections?.[currentSecIdx]?.sectionId || assessment.sections?.[currentSecIdx]?.id || `sec_${currentSecIdx}`,
              name: assessment.sections?.[currentSecIdx]?.name || `Section ${currentSecIdx + 1}`,
              idx: currentSecIdx,
              startedAt: snapshot.savedAt,
              durationSeconds: (assessment.sections?.[currentSecIdx]?.duration_minutes || 30) * 60
            },
            lastSavedAt: serverTimestamp()
          };
          const attDocPath = `users/${userId}/contestAttempts/${attDocId}`;
          setDoc(doc(db, 'users', userId, 'contestAttempts', attDocId), attemptPayload, { merge: true })
            .catch(() => {
              queueWALMutation({ targetDoc: attDocPath, payload: attemptPayload, type: 'attempt_sync' });
            });
        }
      } catch (_) {}
    }
  }, [assessment, user, secCompleted, examResults, currentSecIdx, secStarted, secTimer]);

  // ── Fetch all section JSON files
  const loadAllSections = async (exam) => {
    setLoading(true);
    const loaded = {};
    try {
      await Promise.all(
        (exam.sections || []).map(async (sec, idx) => {
          const processData = async (data, secType) => {
            const rawType = (secType || data.contentCategory || data.type || sec.type || '').toLowerCase();
            const isEssay = rawType === 'essay' || rawType === 'essay_writing' || data.contentCategory === 'essay';
            const isMcq = !isEssay && (rawType === 'mcq' || data.contentCategory === 'mcq');
            const isSql = !isEssay && !isMcq && (rawType === 'sql' || rawType === 'sql_assessment' || data.contentCategory === 'sql' || Array.isArray(data.sqlQuestions) || Boolean(data.sqlSchema));
            const isCoding = !isEssay && !isMcq && !isSql && (rawType === 'coding' || rawType === 'code' || data.contentCategory === 'coding' || Array.isArray(data.challenges) || Array.isArray(data.codingQuestions) || Array.isArray(data.qids) || Array.isArray(data.questionIds) || Boolean(data.problem));

            if (isMcq) {
              // Normalize MCQ questions for student view (support both Firestore 'text'/'correctIndex' and static 'question'/'correctAnswer')
              data.questions = (data.questions || []).map((q, qIdx) => {
                const qText = q.question || q.text || q.questionText || q.prompt || q.statement || q.title || '';
                const qOptions = Array.isArray(q.options) ? q.options : (Array.isArray(q.choices) ? q.choices : []);
                const cIdx = typeof q.correctIndex === 'number' ? q.correctIndex : (typeof q.correctAnswerIndex === 'number' ? q.correctAnswerIndex : undefined);
                const cAns = q.correctAnswer !== undefined 
                  ? q.correctAnswer 
                  : (cIdx !== undefined && qOptions[cIdx] !== undefined 
                    ? (typeof qOptions[cIdx] === 'object' ? (qOptions[cIdx].text || qOptions[cIdx].value || qOptions[cIdx].label) : qOptions[cIdx]) 
                    : undefined);
                return {
                  ...q,
                  id: q.id || q.questionId || q.qid || `mcq_${qIdx}`,
                  question: qText,
                  text: qText,
                  questionText: qText,
                  options: qOptions,
                  correctAnswer: cAns,
                  correctIndex: cIdx !== undefined ? cIdx : (cAns !== undefined ? qOptions.indexOf(cAns) : undefined),
                  marks: Number(q.marks || 1),
                };
              });
            } else if (isCoding) {
              // Prefer qids array (from Firebase), challenges array, questionIds, questions array, or problem
              let questionRefs = [];
              if (Array.isArray(data.qids) && data.qids.length > 0) {
                questionRefs = data.qids;
              } else if (Array.isArray(data.challenges) && data.challenges.length > 0) {
                questionRefs = data.challenges;
              } else if (Array.isArray(data.questionIds) && data.questionIds.length > 0) {
                questionRefs = data.questionIds;
              } else if (Array.isArray(data.questions) && data.questions.length > 0) {
                questionRefs = data.questions;
              } else if (Array.isArray(data.codingQuestions) && data.codingQuestions.length > 0) {
                questionRefs = data.codingQuestions;
              } else if (Array.isArray(sec.qids) && sec.qids.length > 0) {
                questionRefs = sec.qids;
              } else if (data.problem) {
                questionRefs = [data.problem];
              }

              if (questionRefs.length > 0) {
                try {
                  const resolved = await fetchQuestionsForContest(questionRefs);
                  data.questions = (resolved || []).map(normalizeQuestion);
                  data.challenges = data.questions;
                } catch (resErr) {
                  console.error('[MSA] Failed to resolve coding questions via question bank, falling back to inline challenges:', resErr);
                  data.questions = questionRefs.map(normalizeQuestion);
                  data.challenges = data.questions;
                }
              } else {
                data.questions = [];
                data.challenges = [];
              }
            } else if (isSql) {
              data.questions = Array.isArray(data.sqlQuestions) && data.sqlQuestions.length > 0
                ? data.sqlQuestions
                : (Array.isArray(data.questions) ? data.questions : []);
              data.schema = data.sqlSchema || data.schema || { tables: [] };
            }

            // Store under all possible identifiers
            const secKeys = [sec.sectionId, sec.id, sec.name, sec.slug, String(idx)].filter(Boolean);
            secKeys.forEach(k => {
              loaded[k] = data;
            });
          };

          // 1. Check Firebase Firestore as primary source of truth (assessments/{slug} or assessments/{id})
          const slugOrId = sec.assessmentId || sec.slug || sec.id;
          if (slugOrId && typeof slugOrId === 'string' && !slugOrId.startsWith('http') && !slugOrId.endsWith('.json')) {
            try {
              let assessData = null;
              let resolvedDocId = slugOrId;
              const assessSnap = await getDoc(doc(db, 'assessments', slugOrId));
              if (assessSnap.exists()) {
                assessData = assessSnap.data();
                resolvedDocId = assessSnap.id;
                console.log(`[MSA] Loaded section "${sec.name}" (${slugOrId}) from Firestore assessments/`);
              } else {
                // Query by slug field if direct ID didn't match
                const q = query(collection(db, 'assessments'), where('slug', '==', slugOrId));
                const qSnap = await getDocs(q);
                if (!qSnap.empty) {
                  const assessDoc = qSnap.docs[0];
                  assessData = assessDoc.data();
                  resolvedDocId = assessDoc.id;
                  console.log(`[MSA] Loaded section "${sec.name}" by slug "${slugOrId}" from Firestore assessments/`);
                }
              }

              if (assessData) {
                const mergedData = {
                  ...sec,
                  ...assessData,
                  sectionId: sec.sectionId || sec.id || resolvedDocId,
                  name: sec.name || assessData.title || assessData.name || 'Assessment Section',
                  type: assessData.contentCategory || sec.type || assessData.type || 'coding',
                  duration_minutes: sec.duration_minutes || assessData.durationMinutes || 30,
                  maxScore: sec.maxScore || assessData.maxScore || 100,
                  id: resolvedDocId,
                  assessmentId: resolvedDocId,
                  questions: (Array.isArray(assessData.questions) && assessData.questions.length > 0)
                    ? assessData.questions
                    : (Array.isArray(sec.questions) && sec.questions.length > 0 ? sec.questions : []),
                  challenges: (Array.isArray(assessData.challenges) && assessData.challenges.length > 0)
                    ? assessData.challenges
                    : (Array.isArray(sec.challenges) && sec.challenges.length > 0 ? sec.challenges : []),
                  qids: (Array.isArray(assessData.qids) && assessData.qids.length > 0)
                    ? assessData.qids
                    : (Array.isArray(sec.qids) && sec.qids.length > 0 ? sec.qids : []),
                };
                await processData(mergedData, mergedData.type);
                return;
              }
            } catch (fsErr) {
              console.warn(`[MSA] Firestore lookup for section "${slugOrId}" failed, trying fallback:`, fsErr);
            }
          }

          // 2. If section already contains inline questions/challenges/qids, use them directly
          if (Array.isArray(sec.qids) && sec.qids.length > 0) {
            await processData({ qids: sec.qids, ...sec }, sec.type);
            return;
          }
          if (Array.isArray(sec.questions) && sec.questions.length > 0) {
            await processData({ questions: sec.questions, ...sec }, sec.type);
            return;
          }
          if (Array.isArray(sec.challenges) && sec.challenges.length > 0) {
            await processData({ challenges: sec.challenges, ...sec }, sec.type);
            return;
          }

          // 2. Fetch via contentApi or cdnUrl fallback
          let fetchUrl = sec.cdnUrl || sec.url || sec.assessmentId || (sec.slug ?? '');
          if (!fetchUrl || (!fetchUrl.endsWith('.json') && !fetchUrl.startsWith('http'))) {
            fetchUrl = sec.type === 'mcq'
              ? `mcq/testbank/${slugify(sec.name)}.json`
              : `coding/testbank/${slugify(sec.name)}.json`;
          }

          try {
            const data = await fetchContentJSON(fetchUrl);
            if (data) {
              await processData(data, sec.type);
              return;
            }
            console.warn(`[MSA] Could not load section "${sec.name}" via contentApi.`);
          } catch (e) {
            console.error(`[MSA] Failed to load section "${sec.name}":`, e);
          }

          // Fallback guaranteed registration: NEVER leave sectionData[sec.sectionId] undefined!
          await processData({
            ...sec,
            questions: sec.questions || sec.challenges || [],
            challenges: sec.challenges || sec.questions || []
          }, sec.type);
        })
      );
      setSectionData(loaded);
    } catch (err) {
      console.error('[MSA] Error loading sections:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Section timer countdown (Worker-isolated & wall-clock anchored)
  useAssessmentTimer({
    endTimeMs: sectionEndTimeMsRef.current,
    isStarted: secStarted && sectionEndTimeMsRef.current > 0,
    onTick: useCallback((remaining) => {
      setSecTimer(remaining);
    }, []),
    onExpire: useCallback(() => {
      setSecTimer(0);
      toast('Time up! Submitting section…', { icon: '⏰', duration: 3000 });
      autoSubmitSectionRef.current?.();
    }, [])
  });

  // ── 1/3-time Firestore progress save (fires once per section, non-fatal)
  const oneThirdSavedRef = useRef(false);
  const sectionTotalTimerRef = useRef(0);
  useEffect(() => {
    // Reset when section changes
    oneThirdSavedRef.current = false;
    if (assessment?.sections?.[currentSecIdx]) {
      sectionTotalTimerRef.current = (assessment.sections[currentSecIdx].duration_minutes || 30) * 60;
    }
  }, [currentSecIdx, assessment]);

  useEffect(() => {
    if (!secStarted || oneThirdSavedRef.current) return;
    const totalSecs = sectionTotalTimerRef.current;
    if (totalSecs <= 0) return;
    const saveAt = oneThirdSaveThreshold(totalSecs); // fires when 1/3 time remains
    if (secTimer <= saveAt && secTimer > 0) {
      oneThirdSavedRef.current = true;
      const activeSec = assessment?.sections?.[currentSecIdx];
      if (!activeSec || !user?.email) return;
      const sectionId = activeSec.sectionId || activeSec.name;
      // Read current MCQ answers from localStorage (MCQSectionView persists them there)
      let savedAnswers = {};
      try {
        const authData = JSON.parse(localStorage.getItem('auth_data') ?? '{}');
        const stateKey = `msa_active_mcq_state_${assessment.id}_${sectionId}`;
        const raw = localStorage.getItem(stateKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          savedAnswers = parsed.answers || {};
        }
        // saveSessionProgress(assessmentId, sectionId, answers) — 3 args only
        saveSessionProgress(assessment.id, sectionId, savedAnswers).catch(() => { });
      } catch (_) { /* non-fatal */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secTimer, secStarted]);

  const countdownWaitRef = useRef(0);

  // ── Relaxation countdown between sections (15 seconds)
  useEffect(() => {
    if (relaxationCountdown === null) return;
    if (relaxationCountdown <= 0) {
      setRelaxationCountdown(null);
      handleStartSection(relaxationNextIdx);
      return;
    }
    const t = setTimeout(() => setRelaxationCountdown(prev => (prev ?? 1) - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relaxationCountdown]);

  // ── Pre-section countdown & environment readiness check
  useEffect(() => {
    if (sectionCountdown === null) {
      countdownWaitRef.current = 0;
      return;
    }
    if (sectionCountdown <= 0) {
      const activeSec = assessment?.sections?.[countdownSecIdx];
      const qList = getSectionQuestionsList(activeSec, sectionData, countdownSecIdx);
      const questionsLoaded = Array.isArray(qList) && qList.length > 0;

      const visualReady = !shouldUseProctoring || isVisualProctorReady;
      const audioReady = !shouldUseAudioProctoring || isAudioProctorReady;

      countdownWaitRef.current += 1;

      // Fail-safe condition:
      // Either resources are ready, OR we have waited >= 4 seconds at 0s.
      // The candidate is GUARANTEED to advance into the assessment workspace!
      const canProceed = (visualReady && audioReady && questionsLoaded) || countdownWaitRef.current >= 4;

      if (canProceed) {
        console.log('[MSA] Prelaunch cleared. Launching section workspace. waitCount:', countdownWaitRef.current);
        if (activeSec) {
          const durationSecs = (activeSec.durationMinutes || activeSec.duration_minutes || activeSec.duration || 30) * 60;
          sectionEndTimeMsRef.current = Date.now() + durationSecs * 1000;
          setSecTimer(durationSecs);
          sectionStartTimesRef.current[countdownSecIdx] = new Date().toISOString();
        }
        setSecStarted(true);
        setSectionCountdown(null);
        countdownWaitRef.current = 0;
      } else {
        // Increment prelaunchTick state to guarantee React runs this effect every second
        const t = setTimeout(() => {
          setPrelaunchTick(prev => prev + 1);
        }, 1000);
        return () => clearTimeout(t);
      }
      return;
    }
    const t = setTimeout(() => setSectionCountdown(prev => prev - 1), 1000);
    return () => clearTimeout(t);
  }, [
    sectionCountdown,
    prelaunchTick,
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
    // Hard guard: if proctoring or dual-camera is required and setup is not active, enforce instructions modal
    if (idx === 0 && (shouldUseProctoring || isPremisesRequired) && (!window.cameraStream || (isPremisesRequired && !window.premisesStream))) {
      console.warn('[MSA] Blocking direct section 0 start: proctoring setup / dual camera pairing required.');
      setShowInstructions(true);
      return;
    }

    submittingSecIdxRef.current = -1;
    setCurrentSecIdx(idx);

    // ── Firestore: start session and mark section started ──
    const authData = JSON.parse(localStorage.getItem('auth_data') ?? '{}');
    if (assessment?.sections?.[idx] && authData?.email) {
      const slug = sessionStorage.getItem('msaSlug') || (assessment.id ?? '');
      startAssessmentSession(assessment, slug).then(() => {
        const sec = assessment.sections[idx];
        return markSectionStarted(assessment.id, {
          sectionId: sec.sectionId || sec.id || sec.name,
          name: sec.name ?? '',
          secIdx: idx,
          durationMinutes: sec.duration_minutes || 30,
        });
      }).catch(() => { });

      // Store coding section start time for CodingAssessmentPage timing
      if (assessment.sections[idx].type === 'coding') {
        sessionStorage.setItem('codingSecStartTime', new Date().toISOString());
      }
    }

    if (idx === 0) {
      // Register assessment context in native desktop bridge
      try {
        const allQIds = (assessment?.sections || []).flatMap(sec => {
          const qs = sec.questions || sec.challenges || sec.codingQuestions || [];
          return qs.map((q, qIdx) => q.id || q.questionId || `q_${qIdx}`);
        });
        desktopBridge.setContestContextWithQuestions(
          assessment.id,
          assessment.passkey || '',
          allQIds
        ).catch(() => {});
      } catch (err) {
        console.warn('[MSA] desktopBridge.setContestContextWithQuestions error:', err);
      }

      // Section 0: initial prelaunch check for camera/mic resources
      // Note: Timer will be anchored and started when prelaunch completes!
      setCountdownSecIdx(0);
      setSectionCountdown(5);
      setPrelaunchTick(0);
      countdownWaitRef.current = 0;
      setIsVisualProctorReady(false);
      setIsAudioProctorReady(false);
      setSecStarted(false);
      if (assessment && assessment.sections && assessment.sections[0]) {
        const durationSecs = (assessment.sections[0].durationMinutes || assessment.sections[0].duration_minutes || assessment.sections[0].duration || 30) * 60;
        setSecTimer(durationSecs);
      }
    } else {
      // Subsequent sections: starts immediately
      setCountdownSecIdx(idx);
      setSectionCountdown(null);
      setSecStarted(true);
      sectionStartTimesRef.current[idx] = new Date().toISOString();
      if (assessment && assessment.sections && assessment.sections[idx]) {
        const section = assessment.sections[idx];
        const durationSecs = (section.durationMinutes || section.duration_minutes || section.duration || 30) * 60;
        sectionEndTimeMsRef.current = Date.now() + durationSecs * 1000;
        setSecTimer(durationSecs);
      }
    }
  }, [assessment, shouldUseProctoring, isPremisesRequired]);

  const handleBeginAssessment = useCallback(() => {
    if (assessment?.passkey) {
      if (!passkeyInput.trim()) {
        setPasskeyError('Please enter the access passkey provided by your instructor.');
        if (passkeyInputRef.current) passkeyInputRef.current.focus();
        return;
      }
      if (passkeyInput.trim() !== assessment.passkey) {
        setPasskeyError('Incorrect passkey. Please check with your instructor and try again.');
        if (passkeyInputRef.current) passkeyInputRef.current.focus();
        return;
      }
    }
    setPasskeyError('');
    const targetIdx = (assessment?.sections || []).findIndex(sec => !secCompleted[sec.sectionId] && !secCompleted[sec.id]);
    const finalTargetIdx = targetIdx >= 0 ? targetIdx : 0;

    handleStartSection(finalTargetIdx);
  }, [assessment, passkeyInput, secCompleted, handleStartSection]);

  const autoSubmitSection = useCallback(async (sectionResults) => {
    if (examFinishedRef.current) return;
    if (!assessment?.sections || currentSecIdx < 0 || currentSecIdx >= assessment.sections.length) return;

    if (submittingSecIdxRef.current === currentSecIdx) {
      console.warn(`[MSA] Duplicate section submission call blocked for section index ${currentSecIdx}`);
      return;
    }
    submittingSecIdxRef.current = currentSecIdx;

    const activeSection = assessment.sections[currentSecIdx];
    if (!activeSection) return;

    const secstartedAt = sectionStartTimesRef.current[currentSecIdx] || new Date().toISOString();
    const secsubmittedAt = new Date().toISOString();
    const secTimeSpentSeconds = Math.round((new Date(secsubmittedAt).getTime() - new Date(secstartedAt).getTime()) / 1000);

    let finalSectionResults = sectionResults;
    if (!finalSectionResults && activeSection.type === 'coding') {
      try {
        const raw = localStorage.getItem(`msa_active_coding_state_${assessment.id}_${activeSection.sectionId || activeSection.id || ''}`)
          || localStorage.getItem(`msa_active_coding_state_${assessment.id}`)
          || localStorage.getItem('msa_active_coding_latest');
        if (raw) {
          finalSectionResults = JSON.parse(raw);
        }
      } catch (_) {}
    }
    if (!finalSectionResults && (activeSection.type === 'essay' || activeSection.type === 'essay_writing')) {
      // Auto timer expired without sectionResults: retrieve local draft and take only first 500 words
      try {
        const draftKey = `essay_draft_${assessment.id}_${activeSection.sectionId || activeSection.name || 'default'}`;
        const savedDraft = localStorage.getItem(draftKey);
        if (savedDraft) {
          const parsedDraft = JSON.parse(savedDraft);
          const rawText = parsedDraft.answerText || '';
          const maxLimit = Number(activeSection.maxWords || activeSection.essayPrompt?.maxWords) || 500;
          const words = rawText.trim().split(/\s+/).filter(Boolean);
          const trimmedText = words.slice(0, maxLimit).join(' ');
          const title = parsedDraft.studentTitle || activeSection.name || 'Essay';
          finalSectionResults = {
            studentTitle: title,
            answerText: trimmedText,
            wordCount: Math.min(words.length, maxLimit),
            originalWordCount: words.length,
            score: Math.min(words.length, maxLimit) >= (Number(activeSection.minWords) || 100) ? (Number(activeSection.maxScore) || 20) * 0.75 : 0,
            maxScore: Number(activeSection.maxScore) || 20,
            autoSubmitted: true,
            autoTrimmedTo500: words.length > maxLimit
          };
          try { localStorage.removeItem(draftKey); } catch (_) {}
        }
      } catch (err) {
        console.warn('[MSA] Error auto-recovering essay draft on timer expiry:', err);
      }
    }
    if (!finalSectionResults && (activeSection.type === 'sql' || activeSection.type === 'sql_assessment')) {
      try {
        const secKey = activeSection.sectionId || activeSection.id || `sec_${currentSecIdx}`;
        const uId = user?.uid || user?.id || 'guest';
        const raw = localStorage.getItem(`msa_sql_active_${assessment.id}_${secKey}`)
          || sessionStorage.getItem(`msa_sql_v2_${uId}_${assessment.id}_${secKey}`);
        if (raw) {
          const qStates = JSON.parse(raw);
          const secQuestions = activeSection.questions || activeSection.sqlQuestions || [];
          let totalAwarded = 0;
          let maxSectionMarks = 0;
          const submissions = [];
          secQuestions.forEach((q) => {
            const state = qStates[q.id] || {};
            const marks = Number(state.marksAwarded || 0);
            totalAwarded += marks;
            const qMarks = Number(q.marks || 10);
            maxSectionMarks += qMarks;
            submissions.push({
              questionId: q.id,
              title: q.title || `Question`,
              marksAwarded: marks,
              maxMarks: qMarks,
              status: state.status || 'UNATTEMPTED',
              submittedQuery: state.query || '',
              submitted: Boolean(state.submitted)
            });
          });
          finalSectionResults = {
            sectionId: secKey,
            sectionType: 'sql',
            name: activeSection.name || 'SQL Assessment Section',
            totalMarks: maxSectionMarks || Number(activeSection.maxScore) || 20,
            score: totalAwarded,
            marksAwarded: totalAwarded,
            maxMarks: maxSectionMarks || Number(activeSection.maxScore) || 20,
            percentage: maxSectionMarks > 0 ? Math.round((totalAwarded / maxSectionMarks) * 100) : 0,
            questionsAttempted: submissions.filter(s => s.submitted).length,
            totalQuestions: secQuestions.length,
            submissions,
            sqlSubmissions: submissions,
            autoSubmitted: true
          };
        }
      } catch (sqlRecErr) {
        console.warn('[MSA] Error auto-recovering SQL answers on timer expiry:', sqlRecErr);
      }
    }
    if (!finalSectionResults && (activeSection.type === 'mcq' || !activeSection.type || activeSection.type === 'questions')) {
      try {
        const secKey = activeSection.sectionId || activeSection.id || `sec_${currentSecIdx}`;
        const raw = localStorage.getItem(`msa_active_mcq_state_${assessment.id}_${secKey}`)
          || localStorage.getItem(`msa_active_mcq_state_${assessment.id}_${activeSection.id || ''}`)
          || localStorage.getItem(`msa_active_mcq_state_${assessment.id}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          const activeAnswers = parsed.answers || {};
          const secQuestions = activeSection.questions || [];
          let score = 0;
          let answeredCount = 0;
          const questionsWithAnswers = secQuestions.map((q, i) => {
            const userAnsIdx = activeAnswers[i];
            const isAnswered = userAnsIdx !== undefined;
            if (isAnswered) answeredCount++;
            const userChoice = q.options?.[userAnsIdx];
            const isMatch = (q.correctAnswer !== undefined && (userChoice === q.correctAnswer || String(userChoice).trim().toLowerCase() === String(q.correctAnswer).trim().toLowerCase())) ||
              (q.correctIndex !== undefined && userAnsIdx === q.correctIndex) ||
              (q.answer !== undefined && userAnsIdx === q.answer);
            const qMarks = Number(q.marks) || Number(q.weight) || 1;
            if (isMatch) score += qMarks;
            return {
              ...q,
              userAnswer: userChoice ?? null,
              userAnswerIndex: userAnsIdx ?? null,
              isCorrect: Boolean(isMatch),
              marksEarned: isMatch ? qMarks : 0
            };
          });
          const maxMarks = Number(activeSection.maxScore) || secQuestions.reduce((sum, q) => sum + (Number(q.marks) || Number(q.weight) || 1), 0) || 1;
          finalSectionResults = {
            score,
            maxScore: maxMarks,
            totalQuestions: secQuestions.length,
            answeredQuestions: answeredCount,
            answers: activeAnswers,
            questions: questionsWithAnswers,
            timeSpentPerQ: parsed.timeSpentPerQ || {},
            autoSubmitted: true
          };
        }
      } catch (mcqRecErr) {
        console.warn('[MSA] Error auto-recovering MCQ answers on timer expiry:', mcqRecErr);
      }
    }

    // Read previous results from ref, state, and localStorage fallback
    const progressKey = `msaProgress_${assessment.id}`;
    let baseResults = { ...(examResultsRef.current || {}), ...(examResults || {}) };
    try {
      const savedProgress = JSON.parse(localStorage.getItem(progressKey) || '{}');
      if (savedProgress.examResults && Object.keys(savedProgress.examResults).length > 0) {
        baseResults = { ...savedProgress.examResults, ...baseResults };
      }
    } catch (_) {}

    const secKey = activeSection.sectionId || activeSection.id || activeSection.name || `sec_${currentSecIdx}`;

    const updatedResults = {
      ...baseResults,
      [secKey]: {
        sectionId: secKey,
        sectionName: activeSection.name || `Section ${currentSecIdx + 1}`,
        type: activeSection.type,
        startedAt: secstartedAt,
        submittedAt: secsubmittedAt,
        timeSpentSeconds: secTimeSpentSeconds,
        questionTiming: finalSectionResults?.questionTiming || {},
        data: finalSectionResults || {}
      }
    };
    if (activeSection.sectionId && activeSection.sectionId !== secKey) updatedResults[activeSection.sectionId] = updatedResults[secKey];
    if (activeSection.name && activeSection.name !== secKey) updatedResults[activeSection.name] = updatedResults[secKey];

    examResultsRef.current = updatedResults;
    setExamResults(updatedResults);
    setSecCompleted(prev => ({
      ...prev,
      [secKey]: true,
      ...(activeSection.sectionId ? { [activeSection.sectionId]: true } : {}),
      ...(activeSection.name ? { [activeSection.name]: true } : {})
    }));
    setSecStarted(false);
    clearInterval(timerRef.current);

    // ── Firestore: mark section completed ──
    if (user?.email && assessment?.id) {
      markSectionCompleted(assessment.id, activeSection.sectionId || activeSection.name).catch(() => { });
    }

    const nextIdx = currentSecIdx + 1;
    const totalSections = (assessment.sections || []).length;

    if (nextIdx < totalSections) {
      // Save partial progress
      const snapshot = {
        assessmentId: assessment.id,
        email: user.email,
        completedSections: Object.fromEntries(Object.keys(updatedResults).map(id => [id, true])),
        examResults: updatedResults,
        currentSecIdx: nextIdx,
        lastSectionIdx: currentSecIdx,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(progressKey, JSON.stringify(snapshot));
      saveAssessmentSnapshot(assessment.id, snapshot);

      const tenant = requireTenant(user);
      const userId = auth?.currentUser?.uid || user.uid;
      if (!userId) {
        throw new Error('[MSA] autoSubmitSection partial: missing authenticated userId.');
      }

      const partialQuestionTiming = Object.values(updatedResults)
        .filter(sec => sec.type === 'coding' && (sec.questionTiming || sec.data?.questionTiming))
        .reduce((acc, sec) => ({ ...acc, ...(sec.questionTiming || sec.data?.questionTiming) }), {});

      const partialSectionsList = (assessment.sections || []).map((sec, sIdx) => {
        const sKey = sec.sectionId || sec.id || sec.name || `sec_${sIdx}`;
        const resSec = updatedResults[sKey] || updatedResults[sec.sectionId] || updatedResults[sec.id] || updatedResults[sec.name] || updatedResults[String(sIdx)];
        const secData = resSec?.data || {};
        const secTime = resSec?.timeSpentSeconds || secData?.timeSpentSeconds || 0;
        const secM = Math.floor(secTime / 60);
        const secS = secTime % 60;
        return {
          sectionId: sKey,
          sectionName: sec.name || resSec?.sectionName || `Section ${sIdx + 1}`,
          name: sec.name || resSec?.sectionName || `Section ${sIdx + 1}`,
          type: sec.type || resSec?.type || 'unknown',
          score: secData.score || 0,
          maxScore: secData.maxScore || Number(sec.maxScore) || secData.totalQuestions || 0,
          startedAt: resSec?.startedAt || '',
          submittedAt: resSec?.submittedAt || '',
          timeSpentSeconds: secTime,
          timeTaken: secTime,
          timeTakenFormatted: `${secM}:${secS < 10 ? '0' : ''}${secS}`,
          questionTiming: resSec?.questionTiming || secData.questionTiming || {},
        };
      });

      setDoc(doc(db, `assessmentResults/${tenant.tenantId}/${assessment.id}/${userId}`), {
        userId,
        email: tenant.email,
        rollNumber: user.rollNumber ?? '',
        name: user.name ?? '',
        tenantId: tenant.tenantId,
        cohortId: tenant.cohortId,
        assessmentId: assessment.id,
        assessmentTitle: assessment.name,
        type: 'multisection',
        status: 'partial',
        sectionsCompleted: currentSecIdx + 1,
        totalSections,
        sections: partialSectionsList,
        questionTiming: partialQuestionTiming,
        lastUpdatedAt: serverTimestamp(),
        lastUpdatedAtISO: new Date().toISOString()
      }, { merge: true }).catch(e => console.error('[MSA] Partial Firestore save failed:', e));

      // ── Inter-section transition loader ──
      const nextSec = assessment.sections[nextIdx];
      toast.success(`Section submitted! Next: "${nextSec?.name || `Section ${nextIdx + 1}`}" starting...`, { duration: 3500 });
      setRelaxationNextIdx(nextIdx);
      setRelaxationCountdown(4);
      // handleStartSection(nextIdx) is called by the relaxation countdown useEffect
    } else {
      // All sections done — final submission
      setIsSubmittingEntireExam(true);
      const tenant = requireTenant(user);
      const userId = auth?.currentUser?.uid || user.uid;
      if (!userId) {
        throw new Error('[MSA] handleFinalSubmit: not authenticated, missing userId.');
      }

      try {
        const sectionsList = (assessment.sections || []).map((sec, sIdx) => {
          const sKey = sec.sectionId || sec.id || sec.name || `sec_${sIdx}`;
          const resSec = updatedResults[sKey] || updatedResults[sec.sectionId] || updatedResults[sec.id] || updatedResults[sec.name] || updatedResults[String(sIdx)];
          const secData = resSec?.data || {};
          const secTime = resSec?.timeSpentSeconds || secData?.timeSpentSeconds || 0;
          const secM = Math.floor(secTime / 60);
          const secS = secTime % 60;
          return {
            sectionId: sKey,
            sectionName: sec.name || resSec?.sectionName || `Section ${sIdx + 1}`,
            name: sec.name || resSec?.sectionName || `Section ${sIdx + 1}`,
            type: sec.type || resSec?.type || 'unknown',
            score: secData.score || 0,
            maxScore: secData.maxScore || Number(sec.maxScore) || secData.totalQuestions || 0,
            startedAt: resSec?.startedAt || '',
            submittedAt: resSec?.submittedAt || '',
            timeSpentSeconds: secTime,
            timeTaken: secTime,
            timeTakenFormatted: `${secM}:${secS < 10 ? '0' : ''}${secS}`,
            questionTiming: resSec?.questionTiming || secData.questionTiming || {},
          };
        });

        // Add any extra sections from updatedResults that weren't in assessment.sections
        Object.keys(updatedResults).forEach(key => {
          const match = sectionsList.some(s => s.sectionId === key || s.name === key);
          if (!match) {
            const extraSec = updatedResults[key];
            const secData = extraSec?.data || {};
            const secTime = extraSec?.timeSpentSeconds || secData?.timeSpentSeconds || 0;
            const secM = Math.floor(secTime / 60);
            const secS = secTime % 60;
            sectionsList.push({
              sectionId: key,
              sectionName: extraSec.sectionName || key,
              name: extraSec.sectionName || key,
              type: extraSec.type || 'unknown',
              score: secData.score || 0,
              maxScore: secData.maxScore || secData.totalQuestions || 0,
              startedAt: extraSec.startedAt || '',
              submittedAt: extraSec.submittedAt || '',
              timeSpentSeconds: secTime,
              timeTaken: secTime,
              timeTakenFormatted: `${secM}:${secS < 10 ? '0' : ''}${secS}`,
              questionTiming: extraSec.questionTiming || secData.questionTiming || {},
            });
          }
        });

        const aggregatedQuestions = Object.values(updatedResults)
          .filter(sec => {
            const sType = String(sec.type || sec.data?.type || '').toLowerCase();
            if (sType === 'coding' || sType === 'code' || sType === 'sql' || sType === 'sql_assessment' || sType === 'essay' || sType === 'essay_writing' || sType === 'spoken_english' || sType === 'speech' || sType === 'sea') {
              return false;
            }
            return (sType === 'mcq' || sType === 'questions' || sType === 'quiz' || !sType) && Array.isArray(sec.data?.questions);
          })
          .reduce((acc, sec) => acc.concat(sec.data.questions), [])
          .filter(q => q && (Array.isArray(q.options) || Boolean(q.questionText || q.question || q.text || q.prompt)) && q.testsPassed === undefined && q.totalTests === undefined && !q.problemTitle)
          .map((q, idx) => ({ ...q, questionNumber: idx + 1 }));

        const aggregatedCoding = Object.values(updatedResults)
          .filter(sec => sec.type === 'coding' && (sec.data?.questions || sec.data?.coding))
          .reduce((acc, sec) => acc.concat(sec.data.questions || sec.data.coding || []), [])
          .map(c => buildCodingSubmission(c));

        const aggregatedEssay = Object.values(updatedResults)
          .filter(sec => sec.type === 'essay' || sec.type === 'essay_writing')
          .map(sec => ({
            sectionId: sec.sectionId || '',
            sectionName: sec.sectionName || 'Essay Writing',
            ...(sec.data || {}),
            studentTitle: sec.data?.studentTitle || sec.data?.submission?.studentTitle || '',
            answerText: sec.data?.answerText || sec.data?.submission?.answerText || '',
            wordCount: sec.data?.wordCount || sec.data?.submission?.wordCount || 0,
            rubricScores: sec.data?.rubricScores || sec.data?.evaluation?.rubricScores || {},
            rubricMax: sec.data?.rubricMax || sec.data?.evaluation?.rubricMax || {},
            grammarAnalysis: sec.data?.grammarAnalysis || sec.data?.evaluation?.grammarAnalysis || {},
          }));

        const aggregatedSql = Object.values(updatedResults)
          .filter(sec => sec.type === 'sql' || sec.sectionType === 'sql' || sec.data?.sectionType === 'sql')
          .reduce((acc, sec) => acc.concat(sec.data?.sqlSubmissions || sec.data?.submissions || []), []);

        const aggregatedQuestionTiming = Object.values(updatedResults)
          .filter(sec => sec.type === 'coding')
          .reduce((acc, sec) => {
            if (sec.questionTiming && Object.keys(sec.questionTiming).length > 0) {
              return { ...acc, ...sec.questionTiming };
            }
            if (sec.data?.questionTiming && Object.keys(sec.data?.questionTiming).length > 0) {
              return { ...acc, ...sec.data.questionTiming };
            }
            if (Array.isArray(sec.data?.questions)) {
              sec.data.questions.forEach((q, idx) => {
                const key = q.questionKey || `Q${idx + 1}`;
                if (!acc[key]) {
                  acc[key] = {
                    timeSpentSeconds: q.timeSpentSeconds || 0,
                    timeSpentFormatted: q.timeSpentFormatted || '00:00',
                    questionId: q.questionId || '',
                    questionNumber: q.questionNumber || idx + 1,
                    title: q.title || q.name || `Question ${idx + 1}`
                  };
                }
              });
            }
            return acc;
          }, {});

        const totalMarksSum = sectionsList.reduce((acc, s) => acc + (Number(s.maxScore) || 0), 0) || Number(assessment.maxScore) || 100;
        const totalScorePartial = sectionsList.reduce((acc, s) => acc + (Number(s.score) || 0), 0);

        // Calculate All-Testcases-Pass Score (strictly 100% testcases passed for each question)
        let allPassTotalScore = 0;
        let solvedAllPassCount = 0;
        let partialSolvedCount = 0;

        Object.values(updatedResults).forEach((sec) => {
          if (sec.type === 'mcq') {
            allPassTotalScore += (sec.data?.score || 0);
            const correctCount = (sec.data?.questions || []).filter((q) => q.isCorrect).length;
            solvedAllPassCount += correctCount;
          } else if (sec.type === 'coding') {
            const codingList = sec.data?.questions || sec.data?.coding || [];
            codingList.forEach((c) => {
              const passed = c.testsPassed || c.passedTestCases || 0;
              const total = c.totalTests || c.totalTestCases || 0;
              const weight = c.maxScore || c.weight || 20;
              if (passed > 0) {
                partialSolvedCount++;
              }
              if (total > 0 && passed === total) {
                allPassTotalScore += weight;
                solvedAllPassCount++;
              }
            });
          } else {
            allPassTotalScore += (sec.data?.score || 0);
          }
        });

        const isContest = Boolean(
          assessment?.isContest ||
          assessment?.contestId ||
          sessionStorage.getItem('msaCourseCtx')?.includes('"isContest":true')
        );

        const primaryTotalScore = isContest ? allPassTotalScore : totalScorePartial;
        const pct = totalMarksSum > 0 ? primaryTotalScore / totalMarksSum : 0;
        const partialPct = totalMarksSum > 0 ? totalScorePartial / totalMarksSum : 0;

        let authorizedStartedAt = examStartTimeRef.current;
        try {
          const attemptSnap = await getActiveAttempt(assessment.id);
          if (attemptSnap?.startedAt) {
            authorizedStartedAt = attemptSnap.startedAt.toDate
              ? attemptSnap.startedAt.toDate().toISOString()
              : new Date(attemptSnap.startedAt).toISOString();
          }
        } catch (_) {
          console.warn('[MSA] handleFinalSubmit: Could not read authoritative startedAt, using client ref fallback');
        }

        const timeEndedISO = new Date().toISOString();
        const timeTaken = Math.round((new Date(timeEndedISO).getTime() - new Date(authorizedStartedAt).getTime()) / 1000);
        const timeM = Math.floor(timeTaken / 60);
        const timeS = timeTaken % 60;
        const timeTakenFormatted = `${timeM}:${timeS < 10 ? '0' : ''}${timeS}`;

        const vInfo = getViolations(assessment.id, tenant.email);
        const allViolations = (vInfo.violations && vInfo.violations.length > 0) ? vInfo.violations : (proctoringData.violations || []);
        const totalViolations = Math.max(vInfo.violationCount || 0, proctoringData.violationCount || 0, allViolations.length);
        const totalNoFace = allViolations.filter(v => v.type === 'no_face').length;
        const totalMultipleFaces = allViolations.filter(v => v.type === 'multiple_faces').length;

        const autoSubmitted = Object.values(updatedResults).some(s => s.data?.autoSubmitted);
        const autoSubmitReason = Object.values(updatedResults)
          .map(s => s.data?.autoSubmitReason ?? '')
          .filter(Boolean)
          .join(', ');

        const sessionAttemptId = attemptDocId(userId, assessment.id);

        const attemptData = buildResultDoc({
          user: {
            uid: userId,
            email: tenant.email,
            name: user.name || '',
            rollNumber: user.rollNumber || '',
            tenantId: tenant.tenantId,
            college: tenant.college,
            department: tenant.department,
            year: tenant.year,
            cohortId: tenant.cohortId,
          },
          assessment: {
            id: assessment.id,
            title: assessment.name || assessment.title || '',
            assessmentType: 'multi_section',
          },
          scores: {
            totalScore: primaryTotalScore,
            allPassTotalScore,
            allPassScore: allPassTotalScore,
            partialScore: totalScorePartial,
            maxScore: totalMarksSum,
            percentage: totalMarksSum > 0 ? Math.min(100, Math.round(pct * 100)) : 0,
            partialPercentage: totalMarksSum > 0 ? Math.min(100, Math.round(partialPct * 100)) : 0,
            passed: totalMarksSum > 0 && (primaryTotalScore / totalMarksSum >= 0.5),
            evaluationType: isContest ? 'all_pass_strict' : 'dual_captured',
          },
          timing: {
            startedAt: authorizedStartedAt,
            timeTakenSeconds: timeTaken,
          },
          submission: {
            autoSubmitted: Boolean(autoSubmitted),
            submissionReason: autoSubmitReason || 'manual',
          },
          sections: sectionsList,
          questions: aggregatedQuestions,
          codingSubmissions: aggregatedCoding,
          essaySubmissions: aggregatedEssay,
          sqlSubmissions: aggregatedSql,
          questionTiming: aggregatedQuestionTiming,
          proctoring: {
            violationCount: totalViolations,
            totalNoFace,
            totalMultipleFaces,
            violations: allViolations,
          },
          sessionAttemptId,
        });

        const v2DocPath = `assessmentResults/${tenant.tenantId}/${assessment.id}/${userId}`;

        // [Fix Audit-7 P1] Transition attempt to SUBMITTING before writing result.
        // Required by Firestore result-create rule which checks attempt.status ∈ [SUBMITTING, EXPIRED, FAILED_RECOVERABLE].
        // Non-fatal: if the transition write fails we still proceed; FAILED_RECOVERABLE is also accepted.
        try {
          await transitionAttemptState(assessment?.id, ATTEMPT_STATES.SUBMITTING);
          console.log('[MSA] handleFinalSubmit: attempt transitioned to SUBMITTING');
        } catch (transErr) {
          console.warn('[MSA] handleFinalSubmit: SUBMITTING transition failed (non-fatal, proceeding with result write):', transErr?.message);
        }

        // P0 fix: only proceed to SUBMITTED state after CONFIRMED result write.
        // On failure: save pending envelope, transition to FAILED_RECOVERABLE,
        // and return early — do NOT show "submitted" or navigate to dashboard.
        let resultWriteSuccess = false;
        try {
          const sanitizedPayload = JSON.parse(JSON.stringify(attemptData));
          await setDoc(doc(db, v2DocPath), sanitizedPayload);
          console.log('[MSA] Final result saved to Firestore canonical path:', v2DocPath);
          resultWriteSuccess = true;

          // ── RECRUITER ASSESSMENT RESULTS ISOLATION ──
          // Maintain recruiter results under recruitorAssessmentResults/{recruiterId}/{assessmentId}/{userId}
          // (with recruiterAssessmentResults mirror) so recruiter data is completely separated from local/institutional tests.
          try {
            const courseCtx = (() => {
              try { return JSON.parse(sessionStorage.getItem('msaCourseCtx') || '{}'); } catch (_) { return {}; }
            })();
            const isRecruiterAssessment = Boolean(
              assessment?.isRecruitment ||
              assessment?.tag === 'Recruitment' ||
              assessment?.category === 'recruiter' ||
              assessment?.recruiterAssessmentId ||
              assessment?.recruiterId ||
              assessment?.companyId ||
              assessment?.courseId?.startsWith('recruiter_') ||
              courseCtx?.isRecruitment ||
              courseCtx?.recruiterId ||
              courseCtx?.companyId ||
              courseCtx?.courseId?.startsWith('recruiter_')
            );

            if (isRecruiterAssessment) {
              const effectiveRecruiterId = String(
                assessment?.recruiterId ||
                courseCtx?.recruiterId ||
                assessment?.companyId ||
                courseCtx?.companyId ||
                (assessment?.courseId?.startsWith('recruiter_') ? assessment.courseId.replace('recruiter_', '') : '') ||
                (courseCtx?.courseId?.startsWith('recruiter_') ? courseCtx.courseId.replace('recruiter_', '') : '') ||
                assessment?.createdByUid ||
                courseCtx?.createdByUid ||
                (assessment?.companyName ? slugify(assessment.companyName) : 'recruiter_default')
              ).trim();

              const recruiterPayload = {
                ...sanitizedPayload,
                recruiterId: effectiveRecruiterId,
                companyId: assessment?.companyId || courseCtx?.companyId || effectiveRecruiterId,
                companyName: assessment?.companyName || courseCtx?.companyName || 'Corporate Partner',
                assessmentId: assessment.id,
                testId: assessment.id,
                testName: assessment.name || assessment.title || 'Recruitment Assessment',
                userId,
                studentUid: userId,
                studentName: user.name || user.displayName || '',
                studentEmail: tenant.email || user.email || '',
                studentCollege: tenant.college || '',
                studentDepartment: tenant.department || '',
                studentYear: tenant.year || '',
                studentRollNumber: user.rollNumber || '',
                score: primaryTotalScore,
                maxScore: totalMarksSum,
                percentage: totalMarksSum > 0 ? Math.min(100, Math.round(pct * 100)) : 0,
                allPassScore: allPassTotalScore,
                partialScore: totalScorePartial,
                isPassed: totalMarksSum > 0 && (primaryTotalScore / totalMarksSum >= 0.5),
                status: 'submitted',
                submittedAt: serverTimestamp(),
                submittedAtISO: timeEndedISO,
                timeTakenSeconds: timeTaken,
                timeTakenFormatted,
                proctorViolations: totalViolations,
                sections: sectionsList,
                codingSubmissions: aggregatedCoding,
                questions: aggregatedQuestions,
                essaySubmissions: aggregatedEssay,
                questionTiming: aggregatedQuestionTiming
              };

              const rPath1 = `recruitorAssessmentResults/${effectiveRecruiterId}/${assessment.id}/${userId}`;
              const rPath2 = `recruiterAssessmentResults/${effectiveRecruiterId}/${assessment.id}/${userId}`;
              await Promise.all([
                setDoc(doc(db, rPath1), recruiterPayload, { merge: true }),
                setDoc(doc(db, rPath2), recruiterPayload, { merge: true })
              ]);
              console.log('[MSA] Recruiter assessment result saved to:', rPath1);
            }
          } catch (recWriteErr) {
            console.warn('[MSA] Non-fatal recruiterAssessmentResults write error:', recWriteErr);
          }

          // ── If this assessment is a Contest, sync single submission & leaderboard entry ──
          if (isContest) {
            const contestId = assessment?.contestId || assessment?.id;
            const roundNum = assessment?.roundNumber || 1;
            try {
              // 1. Single submission doc keyed by userId
              const subRef = doc(db, 'contests', contestId, 'submissions', userId);
              await setDoc(subRef, {
                submissionId: userId,
                contestId,
                roundNumber: roundNum,
                userId,
                displayName: user.displayName || user.name || 'Student',
                email: tenant.email || user.email || '',
                tenantId: tenant.tenantId || 'global',
                tenantName: tenant.college || 'Global Arena',
                totalScore: allPassTotalScore,
                allPassTotalScore,
                partialScore: totalScorePartial,
                maxScore: totalMarksSum,
                percentage: totalMarksSum > 0 ? Math.min(100, Math.round((allPassTotalScore / totalMarksSum) * 100)) : 0,
                partialPercentage: totalMarksSum > 0 ? Math.min(100, Math.round(partialPct * 100)) : 0,
                timeTakenSeconds: timeTaken,
                timeTakenFormatted,
                solvedCount: solvedAllPassCount,
                partialSolvedCount,
                status: 'submitted',
                submittedAt: serverTimestamp(),
                codingSubmissions: aggregatedCoding,
                sections: sectionsList,
              }, { merge: true });

              // 2. Leaderboard entry keyed by userId (Strictly based on all testcases passed only & speed)
              const lbRef = doc(db, 'contests', contestId, 'leaderboard', userId);
              await setDoc(lbRef, {
                userId,
                displayName: user.displayName || user.name || 'Student',
                email: tenant.email || user.email || '',
                tenantId: tenant.tenantId || 'global',
                tenantName: tenant.college || 'Global Arena',
                totalScore: allPassTotalScore,
                allPassTotalScore,
                partialScore: totalScorePartial,
                maxScore: totalMarksSum,
                timeTakenSeconds: timeTaken,
                timeTakenFormatted,
                solvedCount: solvedAllPassCount,
                partialSolvedCount,
                percentage: totalMarksSum > 0 ? Math.min(100, Math.round((allPassTotalScore / totalMarksSum) * 100)) : 0,
                lastActivity: serverTimestamp(),
              }, { merge: true });

              // 3. Update participant registration state with completed round info and attempt preview metrics
              const regRef = doc(db, 'contests', contestId, 'registrations', userId);
              await setDoc(regRef, {
                status: `round_${roundNum}_completed`,
                completedRounds: arrayUnion(roundNum),
                lastCompletedRound: roundNum,
                lastScore: allPassTotalScore,
                maxScore: totalMarksSum,
                timeTakenFormatted,
                timeTakenSeconds: timeTaken,
                solvedCount: solvedAllPassCount,
                partialSolvedCount,
                percentage: totalMarksSum > 0 ? Math.min(100, Math.round((allPassTotalScore / totalMarksSum) * 100)) : 0,
                submittedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              }, { merge: true });

              console.log('[MSA] Contest submission, registration status & leaderboard synced for contestId:', contestId, 'Round:', roundNum);
            } catch (contestSyncErr) {
              console.warn('[MSA] Contest sync warning (non-fatal):', contestSyncErr);
            }
          }

          // ── If this assessment is a Placement Track Clearance Assessment, sync to placementTrackService ──
          const isFinalPlacementClearance = Boolean(
            assessment?.trackType === 'placement' ||
            assessment?.placementLevel ||
            (assessment?.id && String(assessment.id).toLowerCase().includes('placement-clearance')) ||
            (assessment?.slug && String(assessment.slug).toLowerCase().includes('placement-clearance'))
          );

          if (isFinalPlacementClearance) {
            try {
              const levelNum = Number(assessment.placementLevel || 1);
              const attemptId = assessment.attemptId || sessionStorage.getItem('placementAttemptId') || `ATTEMPT-${levelNum}-${Date.now()}`;
              const passPct = Number(assessment.passPercentage || 70);
              const primaryScore = Number(primaryTotalScore || allPassTotalScore || 0);
              const totalPossible = Number(totalMarksSum || 1600);
              const percentageAchieved = totalPossible > 0 ? Math.round((primaryScore / totalPossible) * 100) : 0;
              const isPassed = percentageAchieved >= passPct;

              await submitAssessmentResult(userId, levelNum, attemptId, {
                passed: isPassed,
                score: percentageAchieved,
                feedback: isPassed
                  ? `Cleared Level ${levelNum} Placement Assessment with ${percentageAchieved}%!`
                  : `Scored ${percentageAchieved}% (Pass threshold: ${passPct}%). Please review and retry after cooldown.`
              });
              console.log(`[MSA] Placement track result submitted: Level ${levelNum}, Passed: ${isPassed}, Score: ${percentageAchieved}%`);
            } catch (placementErr) {
              console.error('[MSA] Failed to sync placement track clearance:', placementErr);
            }
          }

          // ── If this assessment is a Corporate / Recruiter Screening Assessment or SEED Litmus Benchmark ──
          const isCorporateAssessment = Boolean(
            assessment?.isCorporate || 
            assessment?.recruiterAssessmentId || 
            assessment?.jobId || 
            assessment?.category === 'recruiter' ||
            assessment?.category === 'benchmark' ||
            assessment?.id?.startsWith('recruiter-') ||
            assessment?.id?.startsWith('benchmark-')
          );

          if (isCorporateAssessment) {
            try {
              const pct = totalMarksSum > 0 ? Math.min(100, Math.round((allPassTotalScore / totalMarksSum) * 100)) : 0;
              const calculatedPercentile = Math.min(99, Math.max(50, Math.round(pct * 0.95 + 5)));

              // 1. Update user profile benchmark score with SEED QBeA results
              const userRef = doc(db, 'users', userId);
              await setDoc(userRef, {
                seedBenchmarkScore: allPassTotalScore,
                seedBenchmarkPercentage: pct,
                seedPercentile: calculatedPercentile,
                seedQbeaScore: allPassTotalScore,
                seedQbeaPercentage: pct,
                seedQbeaPercentile: calculatedPercentile,
                seedVerified: true,
                seedVerifiedAt: serverTimestamp(),
              }, { merge: true });

              // 2. Update jobApplications if tied to a job or application
              const applicationId = assessment?.applicationId;
              const jobId = assessment?.jobId;
              if (applicationId) {
                const appRef = doc(db, 'jobApplications', applicationId);
                await setDoc(appRef, {
                  stage: pct >= 60 ? 'shortlisted' : 'applied',
                  assessmentScore: allPassTotalScore,
                  assessmentMaxScore: totalMarksSum,
                  assessmentPercentage: pct,
                  seedPercentile: calculatedPercentile,
                  seedVerified: true,
                  assessmentCompletedAt: serverTimestamp(),
                  recruiterNotes: `Proctored SEED Lockdown Assessment completed: ${allPassTotalScore}/${totalMarksSum} (${pct}%). Anti-cheat integrity verified.`,
                }, { merge: true });
              } else if (jobId) {
                const appQuery = query(
                  collection(db, 'jobApplications'),
                  where('jobId', '==', jobId),
                  where('studentUid', '==', userId)
                );
                const appSnap = await getDocs(appQuery);
                if (!appSnap.empty) {
                  for (const d of appSnap.docs) {
                    await setDoc(d.ref, {
                      stage: pct >= 60 ? 'shortlisted' : 'applied',
                      assessmentScore: allPassTotalScore,
                      assessmentMaxScore: totalMarksSum,
                      assessmentPercentage: pct,
                      seedPercentile: calculatedPercentile,
                      seedVerified: true,
                      assessmentCompletedAt: serverTimestamp(),
                      recruiterNotes: `Proctored SEED Lockdown Assessment completed: ${allPassTotalScore}/${totalMarksSum} (${pct}%). Anti-cheat integrity verified.`,
                    }, { merge: true });
                  }
                }
              }
              console.log('[MSA] Corporate / Recruiter assessment results synchronized successfully.');
            } catch (corpErr) {
              console.warn('[MSA] Error syncing corporate assessment results:', corpErr);
            }
          }
        } catch (writeErr) {
          console.error('[MSA] handleFinalSubmit: Firestore write failed — preserving pending envelope:', writeErr);
          const envKey = `msa_pending_submission_${userId}_${assessment.id}`;
          const sanitizedPayload = JSON.parse(JSON.stringify(attemptData));
          savePendingEnvelope(envKey, {
            uid: userId,
            assessmentId: assessment.id,
            resultPayload: sanitizedPayload,
            savedAt: new Date().toISOString(),
            retryCount: 0,
          }).catch(() => { });
          // Transition attempt to FAILED_RECOVERABLE so resume/retry is possible
          transitionAttemptState(assessment?.id, ATTEMPT_STATES.FAILED_RECOVERABLE).catch(() => { });
          const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
          toast.error(
            isOffline
              ? 'Submission pending — no network. Your answers are saved locally and will sync automatically when you reconnect. Do not close this window.'
              : `Submission pending (${writeErr?.message || 'Sync queued'}). Your answers are saved locally.`,
            { duration: 12000 }
          );
          // Early return: student stays on page, not navigated away
          return;
        }

        if (!resultWriteSuccess) return; // guard

        // Immediately teardown hardware and proctoring engines
        try {
          stopAllMediaAndAI();
          teardownHardwareAndProctoring();
        } catch (_) { }

        setCompletedAttemptId(sessionAttemptId);
        setCompletedTenant(tenant);
        setExamFinished(true);
        toast.success('Assessment submitted successfully! Please provide your feedback.', { duration: 4000 });
        if (assessment?.id) {
          localStorage.setItem(`msaCompleted_${assessment.id}`, 'true');
        }
        sessionStorage.removeItem('multisectionAssessmentData');
        localStorage.removeItem(`msaProgress_${assessment?.id}`);
        localStorage.removeItem(`msaActiveAssessment_${assessment?.id}`);
        clearAssessmentSnapshot(assessment?.id);

        // ── Mark attempt fully completed (Firestore session + completion index) ──
        // Only called AFTER confirmed result write success.
        // [Fix Audit-6 P1] Surface failure — result is saved; session finalization retries on next login.
        completeAssessmentSession(assessment?.id)
          .catch((err) => {
            console.error('[MSA] handleFinalSubmit: Session finalization failed — result is saved, attempt state pending:', err);
            toast('Result saved. Session finalization will complete on next login.', { duration: 6000 });
          });
        markAssessmentCompleted(user, assessment?.id).catch(() => { });
        if (user?.email) invalidateCompletionCache(user.email);
        try {
          await desktopBridge.markAssessmentSubmitted();
          await desktopBridge.endAssessment();
        } catch (dbErr) {
          console.warn('[MSA] desktopBridge cleanup error in handleFinalSubmit:', dbErr);
        }
      } finally {
        setIsSubmittingEntireExam(false);
      }

      // Clear MCQ, Coding, and proctoring temporary workspace details
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith(`msa_active_mcq_state_${assessment?.id}`) ||
          key.startsWith(`codingAssessmentCode`) ||
          key.startsWith(`codingTimeSpentPerQ`) ||
          key.startsWith(`codingQuestionTiming`) ||
          key.startsWith(`proctor_violations_`) ||
          key.startsWith(`proctor_events_`)
        )) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    }
  }, [assessment, currentSecIdx, examResults, handleStartSection, user]);
  autoSubmitSectionRef.current = autoSubmitSection;

  // Intercept navigation when exam is finished
  useEffect(() => {
    if (examFinished) {
      try {
        window.history.replaceState(null, '', '/student/assessment/feedback');
      } catch (_) { }
      const handleForward = () => {
        navigate('/student/dashboard', { replace: true, state: { justCompleted: true } });
      };
      window.addEventListener('popstate', handleForward);
      return () => window.removeEventListener('popstate', handleForward);
    }
  }, [examFinished, navigate]);

  // ────────────────────────── RENDER ─────────────────────────────────────────

  if (loading || !assessment) {
    return (
      <div className="seb-boot">
        <SecurityWatermark email={user?.email} />
        <div className="seb-boot__brand">
          <div className="seb-boot__spinner-ring"></div>
          <div className="seb-boot__logo-wrapper">
            <img src="/SEED_Logo.png" alt="SEED-IT Platform" className="seb-boot__logo" />
          </div>
        </div>
        <div className="seb-boot__title">SEED-IT Examination Environment</div>
        <div className="seb-boot__status">
          <span className="seb-boot__dot"></span>
          <span>Loading multi-section exam environment...</span>
        </div>
        <div className="seb-boot__progress-bar">
          <div className="seb-boot__progress-fill"></div>
        </div>
      </div>
    );
  }

  // Exam finished screen / Feedback flow
  if (examFinished) {
    const isViolationAutoSubmit = submissionReason === 'proctoring_violations';
    return (
      <>
        {isViolationAutoSubmit && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            borderBottom: '1px solid rgba(239, 68, 68, 0.35)',
            color: '#fca5a5',
            padding: '14px 24px',
            textAlign: 'center',
            fontSize: '0.92rem',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px'
          }}>
            <FaExclamationTriangle style={{ color: '#ef4444', fontSize: '1.2rem', flexShrink: 0 }} />
            <span>Notice: Assessment auto-submitted due to proctoring violation limit (e.g. window/tab switching). All evaluated answers, test cases, and scores have been securely recorded.</span>
          </div>
        )}
        <AssessmentFeedback
          assessment={assessment}
          user={user}
          tenant={completedTenant || { tenantId: user?.tenantId || 'default' }}
          attemptId={completedAttemptId || attemptDocId(user?.uid || user?.email, assessment?.id)}
          onComplete={() => {
            try { stopAllMediaAndAI(); } catch (_) {}
            const cId = assessment?.contestId;
            window.history.replaceState(null, '', '/student/dashboard');
            if (cId) {
              navigate('/student/dashboard', { replace: true, state: { tab: 'contests', contestId: cId, justCompleted: true } });
            } else {
              navigate('/student/dashboard', { replace: true, state: { justCompleted: true } });
            }
          }}
        />
      </>
    );
  }

  const activeSection = currentSecIdx >= 0 ? assessment.sections?.[currentSecIdx] : null;

  // ── Inter-section transition loader (using canonical SEED SEB section loader)
  if (relaxationCountdown !== null) {
    const nextSec = assessment.sections?.[relaxationNextIdx];
    return (
      <div className="seb-boot" style={{ zIndex: 99999 }}>
        <SecurityWatermark email={user?.email} />
        <div className="seb-boot__brand">
          <div className="seb-boot__spinner-ring"></div>
          <div className="seb-boot__logo-wrapper">
            <img src="/SEED_Logo.png" alt="SEED-IT Platform" className="seb-boot__logo" />
          </div>
        </div>
        <div className="seb-boot__title">
          {nextSec?.name ? `Entering ${nextSec.name}` : 'Preparing Next Section...'}
        </div>
        {assessment?.name && (
          <div style={{ color: '#64748b', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '700', marginBottom: '14px' }}>
            {assessment.name} · Section {relaxationNextIdx + 1} of {assessment?.sections?.length || 1}
          </div>
        )}
        <div className="seb-boot__status">
          <span className="seb-boot__dot"></span>
          <span>
            {`Transitioning workspace · Starting automatically in `}
            <strong style={{ color: '#0f172a', fontFamily: 'monospace', fontSize: '15px' }}>
              {relaxationCountdown > 0 ? `${relaxationCountdown}s` : '0s'}
            </strong>
          </span>
        </div>
        <div className="seb-boot__progress-bar" style={{ width: '240px' }}>
          <div className="seb-boot__progress-fill"></div>
        </div>
        <button
          onClick={() => { setRelaxationCountdown(0); }}
          style={{
            marginTop: '22px',
            background: 'rgba(22, 163, 74, 0.15)',
            color: '#16a34a',
            border: '1.5px solid rgba(22, 163, 74, 0.35)',
            padding: '10px 24px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.92rem',
            fontWeight: '700',
            transition: 'all 0.2s ease',
            zIndex: 10
          }}
        >
          Start Section Now
        </button>
      </div>
    );
  }

  const activeSecData = activeSection
    ? (sectionData[activeSection.sectionId] || sectionData[activeSection.id] || sectionData[activeSection.name] || sectionData[activeSection.slug] || sectionData[String(currentSecIdx)] || null)
    : null;

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
    const isEssay = activeSection.type === 'essay' || activeSection.type === 'essay_writing';
    const sectionSettings = isEssay
      ? {
        timerRestrictedSubmit: false,
        proctored: isTruthy(assessment.proctored) || isTruthy(activeSection.proctored),
        maxViolations,
        maxCameraViolations: maxViolations,
        audioProctored: isTruthy(assessment.audioProctored) || isTruthy(activeSection.audioProctored),
        maxAudioViolations,
        tabSwitchLimit
      }
      : activeSection.type === 'mcq'
      ? {
        timerRestrictedSubmit: isTruthy(activeSection.timerRestrictedSubmit),
        questionTimer: activeSection.questionTimer || 0,
        forwardOnly: isTruthy(activeSection.forwardOnly) || (activeSection.questionTimer > 0),
        proctored: isTruthy(assessment.proctored) || isTruthy(activeSection.proctored),
        // audioProctored is independent of camera proctoring — only use its own flag
        audioProctored: isTruthy(assessment.audioProctored) || isTruthy(activeSection.audioProctored),
        maxViolations,
        maxCameraViolations: maxViolations,
        maxAudioViolations,
        tabSwitchLimit
      }
      : {
        timerRestrictedSubmit: isTruthy(activeSection.timerRestrictedSubmit),
        questionTimers: codingQTimers,
        forwardOnly: isTruthy(activeSection.forwardOnly) || (codingQTimers.length > 0),
        proctored: isTruthy(assessment.proctored) || isTruthy(activeSection.proctored),
        maxViolations,
        maxCameraViolations: maxViolations,
        // audioProctored is independent of camera proctoring — only use its own flag
        audioProctored: isTruthy(assessment.audioProctored) || isTruthy(activeSection.audioProctored),
        maxAudioViolations,
        tabSwitchLimit
      };
    const sectionView = (activeSection.type === 'spoken_english' || activeSection.type === 'speech' || activeSection.type === 'sea')
      ? (
        <SpokenEnglishAssessment
          key={`spoken-${activeSection.sectionId}`}
          assessmentData={{ ...activeSecData, name: activeSection.name }}
          user={user}
          onSectionSubmit={(res) => autoSubmitSection(res)}
          onBack={(res) => autoSubmitSection(res)}
        />
      )
      : (activeSection.type === 'essay' || activeSection.type === 'essay_writing')
        ? (
          <EssaySectionView
            key={`essay-${activeSection.sectionId || activeSection.id || currentSecIdx}`}
            sectionData={activeSecData}
            secTimer={secTimer}
            secStarted={secStarted}
            proctoringData={proctoringData}
            settings={sectionSettings}
            onSectionSubmit={(res) => autoSubmitSection(res)}
            onBack={() => {
              toast.info('Section in progress. You can save a draft or submit your essay to proceed.');
            }}
            assessmentName={assessment.name ?? ''}
            assessmentId={assessment.id ?? ''}
            user={user}
          />
        )
      : activeSection.type === 'mcq'
        ? (
          <MCQSectionView
            key={`mcq-${activeSection.sectionId || activeSection.id || currentSecIdx}`}
            sectionData={activeSecData}
            secTimer={secTimer}
            secStarted={secStarted}
            proctoringData={proctoringData}
            settings={sectionSettings}
            onSectionSubmit={autoSubmitSection}
            assessmentName={assessment.name ?? ''}
            assessmentId={assessment.id ?? ''}
          />
        )
      : (activeSection.type === 'sql' || activeSection.type === 'sql_assessment' || activeSecData?.contentCategory === 'sql' || activeSecData?.type === 'sql')
        ? (
          <SQLSectionView
            key={`sql-${activeSection.sectionId || activeSection.id || currentSecIdx}`}
            sectionData={activeSecData}
            secTimer={secTimer}
            secStarted={secStarted}
            proctoringData={proctoringData}
            settings={sectionSettings}
            onSectionSubmit={autoSubmitSection}
            assessmentName={assessment.name ?? ''}
            assessmentId={assessment.id ?? ''}
            user={user}
          />
        )
        : (
          <CodingSectionView
            key={`coding-${activeSection.sectionId || activeSection.id || currentSecIdx}`}
            sectionData={activeSecData}
            secTimer={secTimer}
            settings={sectionSettings}
            proctoringData={proctoringData}
            onSectionSubmit={autoSubmitSection}
            assessmentName={assessment.name ?? ''}
            assessmentId={assessment.id ?? ''}
          />
        );

    return (
      <>
        <SecurityWatermark email={user?.email} />
        {shouldUseProctoring && (user?.uid || user?.id) && (
          <ProctoringEngine
            uid={user.uid || user.id}
            assessmentId={assessment.id}
            isTestActive={currentSecIdx >= 0 && !examFinished}
            isProctorActive={currentSecIdx >= 0 && !examFinished && secStarted && sectionCountdown === null}
            maxViolations={maxViolations}
            tabSwitchCount={proctoringData?.tabSwitchCount || 0}
            tabSwitchLimit={tabSwitchLimit}
            premisesProctorRequired={isPremisesRequired}
            onReady={handleProctorReady}
            onViolationUpdate={handleProctorViolationUpdate}
            onAutoSubmit={handleProctorAutoSubmit}
          />
        )}
        {shouldUseAudioProctoring && (user?.uid || user?.id) && (
          <AudioProctoringEngine
            uid={user.uid || user.id}
            assessmentId={assessment.id}
            isTestActive={currentSecIdx >= 0 && !examFinished}
            isProctorActive={currentSecIdx >= 0 && !examFinished && secStarted && sectionCountdown === null}
            maxViolations={maxAudioViolations}
            onReady={handleAudioProctorReady}
            onViolationUpdate={handleAudioProctorViolationUpdate}
          />
        )}
        {sectionView}
        {/* Pre-section countdown overlay (SEB Boot Branded Theme) */}
        {sectionCountdown !== null && (() => {
          const activeSec = assessment?.sections?.[countdownSecIdx];
          const qList = getSectionQuestionsList(activeSec, sectionData, countdownSecIdx);
          const questionsLoaded = Array.isArray(qList) && qList.length > 0;
          return (
            <div className="seb-boot" style={{ zIndex: 99999 }}>
              <div className="seb-boot__brand">
                <div className="seb-boot__spinner-ring"></div>
                <div className="seb-boot__logo-wrapper">
                  <img src="/SEED_Logo.png" alt="SEED-IT Platform" className="seb-boot__logo" />
                </div>
              </div>
              <div className="seb-boot__title">
                {activeSec?.name ? `Entering ${activeSec.name}` : 'Preparing Section Workspace...'}
              </div>
              {assessment?.name && (
                <div style={{ color: '#64748b', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: '700', marginBottom: '14px' }}>
                  {assessment.name} · Section {countdownSecIdx + 1} of {assessment?.sections?.length || 1}
                </div>
              )}
              <div className="seb-boot__status">
                <span className="seb-boot__dot"></span>
                <span>
                  {questionsLoaded ? 'Environment ready · Starting in ' : 'Configuring workspace · Starting in '}
                  <strong style={{ color: '#0f172a', fontFamily: 'monospace', fontSize: '15px' }}>
                    {sectionCountdown > 0 ? `${sectionCountdown}s` : '0s'}
                  </strong>
                </span>
              </div>
              <div className="seb-boot__progress-bar" style={{ width: '240px' }}>
                <div className="seb-boot__progress-fill"></div>
              </div>

              {/* Instant Manual Bypass Button: If countdown is at 0s or after 1s, candidate can click to immediately enter */}
              {(sectionCountdown <= 1 || countdownWaitRef.current >= 1) && (
                <button
                  type="button"
                  onClick={() => {
                    console.log('[MSA] Candidate manually started section workspace');
                    if (activeSec) {
                      const durationSecs = (activeSec.durationMinutes || activeSec.duration_minutes || activeSec.duration || 30) * 60;
                      sectionEndTimeMsRef.current = Date.now() + durationSecs * 1000;
                      setSecTimer(durationSecs);
                      sectionStartTimesRef.current[countdownSecIdx] = new Date().toISOString();
                    }
                    setSecStarted(true);
                    setSectionCountdown(null);
                    countdownWaitRef.current = 0;
                  }}
                  style={{
                    marginTop: '22px',
                    background: 'rgba(22, 163, 74, 0.15)',
                    color: '#16a34a',
                    border: '1.5px solid rgba(22, 163, 74, 0.35)',
                    padding: '10px 24px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.92rem',
                    fontWeight: '700',
                    transition: 'all 0.2s ease',
                    zIndex: 10
                  }}
                >
                  Start Assessment Workspace Now →
                </button>
              )}
            </div>
          );
        })()}
        {/* Global Submitting Overlay (SEB Boot Branded Theme) */}
        {isSubmittingEntireExam && (
          <div className="seb-boot" style={{ zIndex: 99999 }}>
            <div className="seb-boot__brand">
              <div className="seb-boot__spinner-ring"></div>
              <div className="seb-boot__logo-wrapper">
                <img src="/SEED_Logo.png" alt="SEED-IT Platform" className="seb-boot__logo" />
              </div>
            </div>
            <div className="seb-boot__title">
              Submitting Assessment Results...
            </div>
            <div className="seb-boot__status">
              <span className="seb-boot__dot"></span>
              <span>Evaluating test responses, compiling score metrics, and syncing with the secure server.</span>
            </div>
            <div className="seb-boot__progress-bar" style={{ width: '240px' }}>
              <div className="seb-boot__progress-fill"></div>
            </div>
            <p style={{ color: '#64748b', fontSize: '0.88rem', marginTop: '16px', maxWidth: '420px', textAlign: 'center', lineHeight: 1.5 }}>
              Please do not refresh, exit, or close this window while final submission is in progress.
            </p>
          </div>
        )}
      </>
    );
  }

  // ── Welcome / Navigation screen (currentSecIdx === -1 or between sections)
  return (
    <div className="msa-root">
      <SecurityWatermark email={user?.email} />
      <header className="msa-header">
        <div className="msa-header-title">
          <span></span> {assessment.name}
        </div>
        <div className="msa-candidate-info" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span>{user?.name ?? ''}</span>
          <span className="msa-email">{user?.email}</span>
        </div>
      </header>

      <div className="msa-workspace">
        <aside className="msa-sidebar">
          <h3 className="msa-sidebar-title">Exam Sections</h3>
          <div className="msa-section-list">
            {(() => {
              const firstUncompletedIdx = (assessment?.sections || []).findIndex(sec => {
                const sid = sec.sectionId || sec.id;
                return !secCompleted[sid] && !secCompleted[sec.sectionId] && !secCompleted[sec.id];
              });
              const activeIdx = currentSecIdx >= 0 ? currentSecIdx : (firstUncompletedIdx >= 0 ? firstUncompletedIdx : 0);
              return (assessment?.sections || []).map((sec, idx) => {
                const secId = sec.sectionId || sec.id || `msa-sec-${idx}`;
                const isCompleted = !!(secCompleted[secId] || secCompleted[sec.sectionId] || secCompleted[sec.id]);
                const isActive = idx === currentSecIdx;
                const isLocked = currentSecIdx >= 0 && !isCompleted && idx > activeIdx;
                return (
                  <div key={secId} className={`msa-sec-card ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isLocked ? 'locked' : ''}`}>
                    <div className="msa-sec-card-header">
                      <span className="msa-sec-icon">
                        {sec.type === 'mcq' ? <FaBookOpen /> : (sec.type === 'essay' ? <FaFileAlt /> : <FaCode />)}
                      </span>
                      <span className="msa-sec-name">{sec.name}</span>
                    </div>
                    <div className="msa-sec-card-meta">
                      <span>{sec.duration_minutes || sec.durationMinutes || sec.duration || 30} Mins</span>
                      <span>•</span>
                      <span>{String(sec.type || 'MCQ').toUpperCase()}</span>
                    </div>
                    {isCompleted ? (
                      <span className="msa-badge completed">Submitted</span>
                    ) : isActive ? (
                      <span className="msa-badge active">Active Now</span>
                    ) : null}
                  </div>
                );
              });
            })()}
          </div>
        </aside>

        <main className="msa-content">
          {currentSecIdx === -1 ? (
            <div className="msa-preflight-card">
              {/* Preflight Header */}
              <div className="msa-preflight-header">
                <div className="msa-preflight-badge-row">
                  <span className="msa-type-pill">{assessment.type?.toUpperCase() || 'ASSESSMENT'}</span>
                  <span className="msa-meta-pill">
                    <FaClock style={{ color: 'var(--accent-primary, #16a34a)' }} /> {assessment.duration || 60} Mins
                  </span>
                  <span className="msa-meta-pill">
                    <FaListUl style={{ color: 'var(--accent-primary, #16a34a)' }} /> {assessment.sections?.length || 1} Section{(assessment.sections?.length || 1) !== 1 ? 's' : ''}
                  </span>
                  {shouldUseProctoring && (
                    <span className="msa-meta-pill" style={{ color: '#0284c7', background: 'rgba(2, 132, 199, 0.1)' }}>
                      <FaShieldAlt /> Monitored
                    </span>
                  )}
                </div>
                <h1 className="msa-preflight-title">{assessment.name}</h1>
              </div>

              {/* Access Passkey Box (if mandatory) */}
              {assessment.passkey ? (
                <div
                  className="msa-passkey-box"
                  style={{
                    border: `1.5px solid ${
                      passkeyError
                        ? '#ef4444'
                        : passkeyInput.trim() === assessment.passkey
                        ? '#16a34a'
                        : 'var(--border-color)'
                    }`
                  }}
                >
                  <div className="msa-passkey-label-row">
                    <label className="msa-passkey-label">
                      <FaKey style={{ color: 'var(--accent-primary, #16a34a)' }} />
                      <span>Access Passkey</span>
                    </label>
                    {passkeyInput.trim() === assessment.passkey ? (
                      <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <FaCheckCircle /> Passkey Verified
                      </span>
                    ) : (
                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Required
                      </span>
                    )}
                  </div>

                  <div className="msa-passkey-input-wrapper">
                    <input
                      ref={passkeyInputRef}
                      type={showPasskey ? 'text' : 'password'}
                      value={passkeyInput}
                      onChange={(e) => {
                        setPasskeyInput(e.target.value);
                        if (passkeyError) setPasskeyError('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleBeginAssessment();
                        }
                      }}
                      placeholder="Enter the access passkey provided by your instructor"
                      autoFocus
                      className="msa-passkey-input"
                      style={{
                        letterSpacing: showPasskey ? 'normal' : '0.12em'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasskey(!showPasskey)}
                      className="msa-passkey-toggle-btn"
                      title={showPasskey ? 'Hide passkey' : 'Show passkey'}
                    >
                      {showPasskey ? <FaEyeSlash /> : <FaEye />}
                    </button>
                  </div>

                  {passkeyError && (
                    <div style={{ color: '#ef4444', fontSize: '12.5px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FaExclamationTriangle /> {passkeyError}
                    </div>
                  )}
                </div>
              ) : null}

              {/* System Readiness Panel */}
              <div className="msa-readiness-panel">
                <div className="msa-readiness-chip">
                  <div className="msa-readiness-chip-top">
                    <span>Internet</span>
                    <FaWifi style={{ color: navigator.onLine ? '#16a34a' : '#ef4444' }} />
                  </div>
                  <div className="msa-readiness-chip-val" style={{ color: navigator.onLine ? '#16a34a' : '#ef4444' }}>
                    {navigator.onLine ? 'Connected' : 'Offline'}
                  </div>
                </div>

                <div className="msa-readiness-chip">
                  <div className="msa-readiness-chip-top">
                    <span>Environment</span>
                    <FaExpand style={{ color: 'var(--accent-primary, #16a34a)' }} />
                  </div>
                  <div className="msa-readiness-chip-val" style={{ color: 'var(--accent-primary, #16a34a)' }}>
                    Fullscreen Enforced
                  </div>
                </div>

                <div className="msa-readiness-chip">
                  <div className="msa-readiness-chip-top">
                    <span>Proctoring</span>
                    <FaShieldAlt style={{ color: shouldUseProctoring ? '#0284c7' : '#94a3b8' }} />
                  </div>
                  <div className="msa-readiness-chip-val" style={{ color: shouldUseProctoring ? '#0284c7' : 'var(--text-main)' }}>
                    {isPremisesRequired ? 'Dual Camera' : (shouldUseProctoring ? 'AI Active' : 'Standard')}
                  </div>
                </div>

                <div className="msa-readiness-chip">
                  <div className="msa-readiness-chip-top">
                    <span>Auto-Save</span>
                    <FaCheckCircle style={{ color: '#16a34a' }} />
                  </div>
                  <div className="msa-readiness-chip-val" style={{ color: '#16a34a' }}>
                    Cloud Synced
                  </div>
                </div>
              </div>

              {/* Identity Verification & Camera Setup (Inline) OR Standard Guidelines */}
              {(shouldUseProctoring || isPremisesRequired) ? (
                <div style={{ marginTop: '20px', marginBottom: '16px' }}>
                  <ProctoringInstructions
                    variant="inline"
                    assessment={assessment}
                    passkeyVerified={!assessment.passkey || passkeyInput.trim() === assessment.passkey}
                    onContinue={() => {
                      if (assessment?.passkey && passkeyInput.trim() !== assessment.passkey) {
                        setPasskeyError('Please enter the access passkey provided by your instructor.');
                        if (passkeyInputRef.current) passkeyInputRef.current.focus();
                        return;
                      }
                      const targetIdx = (assessment?.sections || []).findIndex(sec => !secCompleted[sec.sectionId] && !secCompleted[sec.id]);
                      handleStartSection(targetIdx >= 0 ? targetIdx : 0);
                    }}
                    onCancel={() => {
                      try { stopAllMediaAndAI(); } catch (_) {}
                      window.history.replaceState(null, '', '/student/dashboard');
                      navigate('/student/dashboard', { replace: true });
                    }}
                  />
                </div>
              ) : (
                <div className="msa-preflight-guidelines">
                  <div className="msa-preflight-guidelines-header">
                    <FaInfoCircle style={{ color: 'var(--accent-primary, #16a34a)' }} />
                    <span>Important Examination Instructions:</span>
                  </div>
                  <div className="msa-guidelines-grid">
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <FaCheckCircle style={{ color: 'var(--accent-primary, #16a34a)', fontSize: '13px', marginTop: '3px', flexShrink: 0 }} />
                      <span>Fullscreen mode is strictly enforced during the exam.</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <FaCheckCircle style={{ color: 'var(--accent-primary, #16a34a)', fontSize: '13px', marginTop: '3px', flexShrink: 0 }} />
                      <span>Switching tabs or minimizing the window will log violations.</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <FaCheckCircle style={{ color: 'var(--accent-primary, #16a34a)', fontSize: '13px', marginTop: '3px', flexShrink: 0 }} />
                      <span>Each section has its own timer running continuously once started.</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <FaCheckCircle style={{ color: 'var(--accent-primary, #16a34a)', fontSize: '13px', marginTop: '3px', flexShrink: 0 }} />
                      <span>Responses and code drafts are automatically saved to the cloud.</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Preflight Actions */}
              <div className="msa-preflight-actions" style={{ justifyContent: (shouldUseProctoring || isPremisesRequired) ? 'flex-start' : 'space-between' }}>
                <button
                  type="button"
                  onClick={() => {
                    try { stopAllMediaAndAI(); } catch (_) {}
                    window.history.replaceState(null, '', '/student/dashboard');
                    navigate('/student/dashboard', { replace: true });
                  }}
                  style={{
                    background: 'transparent',
                    color: 'var(--text-muted, #64748b)',
                    border: '1.5px solid var(--border-color, #cbd5e1)',
                    padding: '11px 22px',
                    borderRadius: '10px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <FaArrowLeft /> Return to Dashboard
                </button>

                {(!shouldUseProctoring && !isPremisesRequired) && (
                  <button
                    type="button"
                    className="msa-action-btn primary"
                    onClick={handleBeginAssessment}
                    disabled={Boolean(assessment.passkey && passkeyInput.trim() !== assessment.passkey)}
                    style={{
                      padding: '12px 28px',
                      borderRadius: '10px',
                      fontSize: '14.5px',
                      fontWeight: '700',
                      background: (assessment.passkey && passkeyInput.trim() !== assessment.passkey)
                        ? 'var(--border-color, #cbd5e1)'
                        : 'var(--accent-primary, #16a34a)',
                      color: '#ffffff',
                      border: 'none',
                      boxShadow: (assessment.passkey && passkeyInput.trim() !== assessment.passkey)
                        ? 'none'
                        : '0 4px 14px rgba(22, 163, 74, 0.35)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: (assessment.passkey && passkeyInput.trim() !== assessment.passkey)
                        ? 'not-allowed'
                        : 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <FaPlay style={{ fontSize: '12px' }} /> Begin Assessment <FaChevronRight style={{ fontSize: '11px' }} />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="msa-intro-card">
              <h2>Section Submitted Successfully</h2>
              <p>You have finished the current section. The next section will start shortly.</p>
            </div>
          )}
        </main>
      </div>

      {/* Proctoring & Dual-Camera Pairing Instructions Modal */}
      {showInstructions && (
        <ProctoringInstructions
          assessment={assessment}
          onContinue={() => {
            setShowInstructions(false);
            const targetIdx = (assessment?.sections || []).findIndex(sec => !secCompleted[sec.sectionId] && !secCompleted[sec.id]);
            handleStartSection(targetIdx >= 0 ? targetIdx : 0);
          }}
          onCancel={() => {
            setShowInstructions(false);
            try { stopAllMediaAndAI(); } catch (_) {}
          }}
        />
      )}
    </div>
  );
};

export default MultiSectionAssessment;
