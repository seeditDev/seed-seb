import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  FaFileAlt,
  FaKeyboard,
  FaClock,
  FaCheckCircle,
  FaExclamationTriangle,
  FaSave,
  FaPaperPlane,
  FaShieldAlt,
  FaInfoCircle,
  FaPaste
} from 'react-icons/fa';
import { toast } from 'sonner';
import { countWords, calculateGrossWPM } from '../utils/essayTextUtil';
import { evaluateEssay } from '../services/essayEvaluationService';
import '../styles/EssaySectionView.css';

const IDLE_TIMEOUT_MS = 3000; // 3 seconds idle pauses active typing clock

const EssaySectionView = ({
  sectionData,
  secTimer,
  secStarted,
  proctoringData,
  settings,
  onSectionSubmit,
  assessmentName = '',
  assessmentId = '',
  user = null
}) => {
  // Extract configuration from sectionData
  const prompt = useMemo(() => {
    return sectionData?.essayPrompt || {
      title: sectionData?.name || sectionData?.title || 'Essay Writing Assessment',
      question: sectionData?.description || sectionData?.instructions || '',
      instructions: sectionData?.instructions || '',
      minWords: Number(sectionData?.minWords) || 300,
      maxWords: Number(sectionData?.maxWords) || 500,
      maxMarks: Number(sectionData?.maxScore) || 20,
      requireTitle: sectionData?.requireTitle !== false,
      enableTypingAnalytics: sectionData?.enableTypingAnalytics !== false,
      trackPaste: sectionData?.trackPaste !== false
    };
  }, [sectionData]);

  const rubric = useMemo(() => {
    return sectionData?.essayRubric || {
      contentWeight: 8,
      grammarWeight: 4,
      structureWeight: 3,
      coherenceWeight: 3,
      vocabularyWeight: 2,
      passThreshold: 50
    };
  }, [sectionData]);

  const storageDraftKey = useMemo(() => {
    const sId = sectionData?.sectionId || sectionData?.id || 'sec-essay';
    const aId = assessmentId || 'ass-current';
    const uid = user?.uid || 'guest';
    return `msa_essay_draft_${uid}_${aId}_${sId}`;
  }, [sectionData, assessmentId, user]);

  // Candidate input states
  const [studentTitle, setStudentTitle] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState('Draft saved locally');

  // Typing telemetry state
  const [activeTypingSeconds, setActiveTypingSeconds] = useState(0);
  const lastKeyTimeRef = useRef(Date.now());
  const isTypingActiveRef = useRef(false);
  const typingTimerIntervalRef = useRef(null);

  // Telemetry counters
  const keystrokesRef = useRef(0);
  const pasteCountRef = useRef(0);
  const pasteCharsRef = useRef(0);
  const cutCountRef = useRef(0);
  const deleteCountRef = useRef(0);
  const revisionCountRef = useRef(0);
  const [pasteCountDisplay, setPasteCountDisplay] = useState(0);

  // Restore draft from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageDraftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.studentTitle) setStudentTitle(parsed.studentTitle);
        if (parsed.answerText) setAnswerText(parsed.answerText);
        if (parsed.activeTypingSeconds) setActiveTypingSeconds(Number(parsed.activeTypingSeconds) || 0);
        if (parsed.keystrokes) keystrokesRef.current = Number(parsed.keystrokes) || 0;
        if (parsed.pasteCount) {
          pasteCountRef.current = Number(parsed.pasteCount) || 0;
          setPasteCountDisplay(pasteCountRef.current);
        }
        toast.info('Restored saved essay draft', { duration: 3000 });
      }
    } catch (_) {}
  }, [storageDraftKey]);

  // Active Typing Clock Interval (only ticks while student actively presses keys)
  useEffect(() => {
    typingTimerIntervalRef.current = setInterval(() => {
      const now = Date.now();
      if (isTypingActiveRef.current && now - lastKeyTimeRef.current < IDLE_TIMEOUT_MS) {
        setActiveTypingSeconds(prev => prev + 1);
      } else {
        isTypingActiveRef.current = false;
      }
    }, 1000);

    return () => {
      if (typingTimerIntervalRef.current) clearInterval(typingTimerIntervalRef.current);
    };
  }, []);

  // Autosave Draft (debounced 3 seconds)
  useEffect(() => {
    const handler = setTimeout(() => {
      if (!answerText && !studentTitle) return;
      try {
        const snapshot = {
          studentTitle,
          answerText,
          activeTypingSeconds,
          keystrokes: keystrokesRef.current,
          pasteCount: pasteCountRef.current,
          savedAt: new Date().toISOString()
        };
        localStorage.setItem(storageDraftKey, JSON.stringify(snapshot));
        setAutosaveStatus(`Saved at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
      } catch (_) {}
    }, 3000);

    return () => clearTimeout(handler);
  }, [studentTitle, answerText, activeTypingSeconds, storageDraftKey]);

  // Derived metrics
  const wordCount = useMemo(() => countWords(answerText), [answerText]);
  const grossWpm = useMemo(() => calculateGrossWPM(wordCount, activeTypingSeconds), [wordCount, activeTypingSeconds]);

  const minWords = prompt.minWords || 300;
  const maxWords = prompt.maxWords || 500;

  // Key event listeners on textarea
  const handleKeyDown = (e) => {
    lastKeyTimeRef.current = Date.now();
    isTypingActiveRef.current = true;
    keystrokesRef.current += 1;

    if (e.key === 'Backspace' || e.key === 'Delete') {
      deleteCountRef.current += 1;
      revisionCountRef.current += 1;
    }
  };

  const handlePaste = (e) => {
    pasteCountRef.current += 1;
    setPasteCountDisplay(pasteCountRef.current);
    const pasted = e.clipboardData ? e.clipboardData.getData('text') : '';
    pasteCharsRef.current += (pasted || '').length;

    if (prompt.trackPaste !== false) {
      toast.info('Paste event recorded in integrity telemetry', { duration: 2500 });
    }
  };

  const handleCut = () => {
    cutCountRef.current += 1;
    revisionCountRef.current += 1;
  };

  // Submission handler
  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;

    // 1. Title Validation
    if (prompt.requireTitle !== false && !studentTitle.trim()) {
      toast.error('Please enter an essay title before submitting.');
      return;
    }

    // 2. Word Count Bounds
    if (wordCount < minWords) {
      toast.error(`Minimum word limit not met. Please write at least ${minWords} words (currently ${wordCount}).`);
      return;
    }

    if (wordCount > maxWords * 1.5) {
      toast.warning(`Essay exceeds the maximum limit of ${maxWords} words considerably. Submitting anyway...`);
    }

    setIsSubmitting(true);
    toast.info('Evaluating essay and scoring rubric...', { duration: 2000 });

    try {
      // 3. Deterministic Rubric & Grammar Evaluation
      const evaluation = evaluateEssay(studentTitle, answerText, prompt, rubric);

      const payload = {
        score: evaluation.score,
        totalMarks: evaluation.maxScore,
        maxScore: evaluation.maxScore,
        percentage: evaluation.percentage,
        passed: evaluation.passed,
        timeSpentSeconds: activeTypingSeconds,
        submission: {
          studentTitle: studentTitle.trim(),
          answerText: answerText.trim(),
          wordCount,
          submittedAt: new Date().toISOString()
        },
        typingMetrics: {
          activeTypingSeconds,
          grossWpm,
          netWpm: grossWpm,
          keystrokes: keystrokesRef.current,
          pasteCount: pasteCountRef.current,
          pasteCharacters: pasteCharsRef.current,
          cutCount: cutCountRef.current,
          deleteCount: deleteCountRef.current,
          revisionCount: revisionCountRef.current,
          pasteUsed: pasteCountRef.current > 0
        },
        evaluation,
        prompt: {
          title: prompt.title || sectionData?.name || 'Essay Topic',
          question: prompt.question || '',
          minWords,
          maxWords,
          maxMarks: prompt.maxMarks || 20
        },
        sectionName: sectionData?.name || 'Essay Writing',
        type: 'essay'
      };

      // Clear local draft
      try {
        localStorage.removeItem(storageDraftKey);
      } catch (_) {}

      // Pass result to parent MSA runner
      if (onSectionSubmit) {
        onSectionSubmit(payload);
      }
    } catch (err) {
      console.error('[EssaySectionView] Submission error:', err);
      toast.error('Submission failed. Please try again.');
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    prompt,
    rubric,
    studentTitle,
    answerText,
    wordCount,
    minWords,
    maxWords,
    activeTypingSeconds,
    grossWpm,
    storageDraftKey,
    onSectionSubmit,
    sectionData
  ]);

  // Format active typing time mm:ss
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="essay-section-container">
      {/* ── 1. Topic Prompt & Rules Card ── */}
      <section className="essay-prompt-card">
        <div className="essay-prompt-header">
          <h2 className="essay-prompt-title">
            {prompt.title || 'Essay Writing Prompt'}
          </h2>
          <div className="essay-badges-row">
            <span className="essay-badge essay-badge-primary">
              {prompt.maxMarks || 20} Marks
            </span>
            <span className="essay-badge">
              Target: {minWords}–{maxWords} words
            </span>
            {secTimer !== undefined && secTimer > 0 && (
              <span className="essay-badge">
                <FaClock /> {Math.floor(secTimer / 60)}m left
              </span>
            )}
          </div>
        </div>

        {prompt.question && (
          <p className="essay-prompt-body">{prompt.question}</p>
        )}

        {prompt.instructions && (
          <div className="essay-instructions-box">
            <FaInfoCircle className="inline mr-1" />
            <strong>Instructions:</strong> {prompt.instructions}
          </div>
        )}
      </section>

      {/* ── 2. Editor Workspace ── */}
      <section className="essay-editor-card">
        {prompt.requireTitle !== false && (
          <div className="essay-title-group">
            <label htmlFor="student-essay-title" className="essay-label">
              Essay Title <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              id="student-essay-title"
              type="text"
              className="essay-title-input"
              placeholder="Enter a compelling title for your essay..."
              value={studentTitle}
              onChange={(e) => setStudentTitle(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
        )}

        <div className="essay-textarea-wrapper">
          <label htmlFor="student-essay-answer" className="essay-label">
            Essay Answer Body
          </label>
          <textarea
            id="student-essay-answer"
            className="essay-textarea"
            placeholder="Type your essay answer here. Maintain clear paragraphs for introduction, arguments, and conclusion..."
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onCut={handleCut}
            disabled={isSubmitting}
          />
        </div>

        {/* ── 3. Real-time Telemetry & Status Ribbon ── */}
        <div className="essay-telemetry-bar">
          <div className="essay-metrics-left">
            {/* Word Count with dynamic status indicator */}
            <span
              className={`essay-word-badge ${
                wordCount < minWords
                  ? 'essay-word-amber'
                  : wordCount <= maxWords
                  ? 'essay-word-emerald'
                  : 'essay-word-rose'
              }`}
            >
              Words: {wordCount} / {maxWords}
              {wordCount < minWords && (
                <small style={{ fontWeight: 500 }}> (Min {minWords})</small>
              )}
            </span>

            {/* Typing Speed Indicator */}
            {prompt.enableTypingAnalytics !== false && (
              <span className="essay-metric-item" title="Gross Words Per Minute (based on active typing time)">
                <FaKeyboard /> Speed: <strong>{grossWpm} WPM</strong>
              </span>
            )}

            {/* Active Typing Time */}
            <span className="essay-metric-item" title="Time actively spent typing">
              <FaClock /> Active Time: <strong>{formatTime(activeTypingSeconds)}</strong>
            </span>

            {/* Paste detection badge */}
            {pasteCountDisplay > 0 && (
              <span className="essay-metric-item" style={{ color: '#d97706' }} title="Pasted text events">
                <FaPaste /> Pastes: {pasteCountDisplay}
              </span>
            )}
          </div>

          <div className="essay-autosave-tag" title="Automatic local snapshot">
            <FaCheckCircle style={{ color: '#10b981' }} /> {autosaveStatus}
          </div>
        </div>

        {/* ── 4. Action Buttons ── */}
        <div className="essay-actions-footer">
          <button
            type="button"
            className="essay-btn essay-btn-secondary"
            onClick={() => {
              try {
                localStorage.setItem(storageDraftKey, JSON.stringify({
                  studentTitle,
                  answerText,
                  activeTypingSeconds,
                  keystrokes: keystrokesRef.current,
                  pasteCount: pasteCountRef.current,
                  savedAt: new Date().toISOString()
                }));
                setAutosaveStatus('Draft saved manually');
                toast.success('Essay draft saved locally');
              } catch (_) {}
            }}
            disabled={isSubmitting}
          >
            <FaSave /> Save Draft
          </button>

          <button
            type="button"
            className="essay-btn essay-btn-primary"
            onClick={handleSubmit}
            disabled={isSubmitting || wordCount < minWords}
          >
            <FaPaperPlane /> {isSubmitting ? 'Evaluating...' : 'Submit Essay'}
          </button>
        </div>
      </section>
    </div>
  );
};

EssaySectionView.propTypes = {
  sectionData: PropTypes.object,
  secTimer: PropTypes.number,
  secStarted: PropTypes.bool,
  proctoringData: PropTypes.object,
  settings: PropTypes.object,
  onSectionSubmit: PropTypes.func.isRequired,
  assessmentName: PropTypes.string,
  assessmentId: PropTypes.string,
  user: PropTypes.object
};

export default EssaySectionView;
