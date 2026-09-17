import React, { useState, useEffect } from 'react';
import { 
  FaClock, FaBookmark, FaCheckCircle, FaExclamationTriangle, 
  FaArrowLeft, FaArrowRight, FaTimes, FaAward, FaCheck
} from 'react-icons/fa';
import { renderMathAndCode } from '../../../utils/mathAndCodeRenderer';
import { ProblemImage } from '../../../components/common/ProblemMarkdownRenderer';

const CourseMSAMCQSection = ({
  mcqData,
  moduleTitle,
  onComplete,
  passingPercentage = 90
}) => {
  const questions = mcqData?.questions || [];
  const durationMinutes = mcqData?.durationMinutes || 20;

  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [markedForReview, setMarkedForReview] = useState({});
  const [timeLeftSec, setTimeLeftSec] = useState(() => durationMinutes * 60);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [result, setResult] = useState(null);

  // Timer countdown
  useEffect(() => {
    if (isSubmitted) return;
    const timer = setInterval(() => {
      setTimeLeftSec(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isSubmitted]);

  const formatTimer = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleSelectOption = (optId) => {
    if (isSubmitted) return;
    setSelectedAnswers(prev => ({
      ...prev,
      [currentIdx]: optId
    }));
  };

  const handleToggleReview = () => {
    setMarkedForReview(prev => ({
      ...prev,
      [currentIdx]: !prev[currentIdx]
    }));
  };

  const handleClearAnswer = () => {
    setSelectedAnswers(prev => {
      const copy = { ...prev };
      delete copy[currentIdx];
      return copy;
    });
  };

  const handleRetry = () => {
    setSelectedAnswers({});
    setMarkedForReview({});
    setTimeLeftSec(durationMinutes * 60);
    setIsSubmitted(false);
    setResult(null);
  };

  const handleSubmit = () => {
    let correctCount = 0;
    questions.forEach((q, idx) => {
      const chosen = selectedAnswers[idx];
      if (chosen === undefined || chosen === null) return;

      const correctVal = q.correctAnswer !== undefined 
        ? q.correctAnswer 
        : (q.correctIndex !== undefined ? q.correctIndex : q.correctOptionIndex);
      const chosenIdx = Number(chosen);
      const chosenLetter = ['A', 'B', 'C', 'D', 'E'][chosenIdx] || String(chosen).toUpperCase();
      const chosenText = String(q.options?.[chosenIdx]?.text || q.options?.[chosenIdx] || chosen).trim().toLowerCase();

      const correctIdx = typeof correctVal === 'number' ? correctVal : ['A', 'B', 'C', 'D', 'E'].indexOf(String(correctVal).toUpperCase());
      const correctLetter = typeof correctVal === 'number' ? ['A', 'B', 'C', 'D', 'E'][correctVal] : String(correctVal).toUpperCase();
      const correctText = String(q.options?.[correctIdx]?.text || q.options?.[correctIdx] || correctVal).trim().toLowerCase();

      const isCorrect = 
        chosen === correctVal ||
        chosenIdx === correctIdx ||
        chosenLetter === correctLetter ||
        chosenText === correctText;

      if (isCorrect) {
        correctCount++;
      }
    });

    const total = questions.length || 1;
    const scorePct = Math.round((correctCount / total) * 100);
    const passed = scorePct >= passingPercentage;

    const resObj = {
      scorePct,
      correctCount,
      totalCount: questions.length,
      passed,
      passingPercentage
    };

    setResult(resObj);
    setIsSubmitted(true);
    onComplete?.(resObj);
  };

  const answeredCount = Object.keys(selectedAnswers).length;
  const currentQ = questions[currentIdx] || questions[0] || {};

  return (
    <div className="msa-mcq-container">
      {/* Header Bar */}
      <div className="msa-section-header-bar">
        <div className="mcq-header-left">
          <span className="msa-badge-pill">Section 1: Conceptual MCQs</span>
          <span className="mcq-progress-crumb">
            Question {currentIdx + 1} of {questions.length} • {answeredCount} Answered
          </span>
        </div>

        <div className="mcq-header-right">
          <div className="msa-timer-badge">
            <FaClock />
            <span>Time Left: {formatTimer(timeLeftSec)}</span>
          </div>
        </div>
      </div>

      <div className="msa-mcq-grid">
        {/* Left Column: Active Question Card */}
        <div className="msa-question-pane">
          <div className="msa-question-card">
            <div className="msa-q-header">
              <div className="msa-q-badge">
                Question {currentIdx + 1} of {questions.length}
              </div>

              <button 
                className={`msa-review-flag-btn ${markedForReview[currentIdx] ? 'active' : ''}`}
                onClick={handleToggleReview}
                title="Mark this question for review"
              >
                <FaBookmark />
                <span>{markedForReview[currentIdx] ? 'Marked for Review' : 'Mark for Review'}</span>
              </button>
            </div>

            <h3 className="msa-q-statement">{renderMathAndCode(currentQ.question || currentQ.prompt || currentQ.questionText || currentQ.title || '')}</h3>

            {(currentQ?.imageUrl || currentQ?.image || currentQ?.figure || currentQ?.diagram || currentQ?.questionImage || currentQ?.assetUrl || currentQ?.content?.imageUrl || currentQ?.content?.image) && (
              <div style={{ margin: '14px 0', textAlign: 'center' }}>
                <ProblemImage 
                  src={currentQ?.imageUrl || currentQ?.image || currentQ?.figure || currentQ?.diagram || currentQ?.questionImage || currentQ?.assetUrl || currentQ?.content?.imageUrl || currentQ?.content?.image} 
                  alt={`Question ${currentIdx + 1} Illustration`} 
                />
              </div>
            )}

            {/* Options List */}
            <div className="msa-options-stack">
              {(currentQ.options || []).map((opt, oIdx) => {
                const letter = String.fromCharCode(65 + oIdx);
                const optText = typeof opt === 'object' ? (opt.text || opt.title || opt.label || '') : opt;
                const isSelected = selectedAnswers[currentIdx] === oIdx;

                return (
                  <div
                    key={oIdx}
                    className={`msa-option-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectOption(oIdx)}
                  >
                    <div className="msa-option-radio">
                      {isSelected && <div className="dot" />}
                    </div>
                    <span className="msa-opt-letter">{letter}.</span>
                    <span className="msa-opt-text">{renderMathAndCode(optText, true)}</span>
                  </div>
                );
              })}
            </div>

            {/* Question Actions Row */}
            <div className="msa-q-actions-row">
              <div className="actions-left">
                {selectedAnswers[currentIdx] !== undefined && (
                  <button className="msa-clear-btn" onClick={handleClearAnswer}>
                    Clear Response
                  </button>
                )}
              </div>

              <div className="actions-right">
                <button
                  className="msa-nav-btn"
                  onClick={() => setCurrentIdx(prev => Math.max(0, prev - 1))}
                  disabled={currentIdx === 0}
                >
                  <FaArrowLeft />
                  <span>Previous</span>
                </button>

                {currentIdx < questions.length - 1 ? (
                  <button
                    className="msa-nav-btn next"
                    onClick={() => setCurrentIdx(prev => Math.min(questions.length - 1, prev + 1))}
                  >
                    <span>Next</span>
                    <FaArrowRight />
                  </button>
                ) : (
                  <button
                    className="msa-nav-btn submit-final"
                    onClick={handleSubmit}
                  >
                    Complete Section 1
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Question Palette */}
        <div className="msa-palette-pane">
          <div className="palette-card">
            <h4 className="palette-heading">Question Palette</h4>
            <div className="palette-buttons-grid">
              {questions.map((q, idx) => {
                const isCurrent = currentIdx === idx;
                const isAnswered = selectedAnswers[idx] !== undefined;
                const isMarked = markedForReview[idx];

                let statusClass = 'unanswered';
                if (isMarked) statusClass = 'marked';
                else if (isAnswered) statusClass = 'answered';
                if (isCurrent) statusClass += ' current';

                return (
                  <button
                    key={q.id || idx}
                    className={`palette-cell-btn ${statusClass}`}
                    onClick={() => setCurrentIdx(idx)}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="palette-legend-list">
              <div className="legend-row"><span className="legend-dot answered" /> Answered ({answeredCount})</div>
              <div className="legend-row"><span className="legend-dot unanswered" /> Unanswered ({questions.length - answeredCount})</div>
              <div className="legend-row"><span className="legend-dot marked" /> Marked for Review</div>
              <div className="legend-row"><span className="legend-dot current" /> Current Question</div>
            </div>

            <button className="palette-submit-direct-btn" onClick={handleSubmit}>
              Complete Section 1
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CourseMSAMCQSection;
