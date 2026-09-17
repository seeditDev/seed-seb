import React, { useState, useEffect } from 'react';
import { 
  FaClock, FaAward, FaCheckCircle, FaTimesCircle, 
  FaArrowLeft, FaArrowRight, FaLock, FaRedo 
} from 'react-icons/fa';

const ASSESSMENT_QUESTIONS = [
  {
    id: 1,
    question: 'Which of the following is the time complexity of accessing an element by its index in an array?',
    options: [
      { id: 'A', text: 'O(1)' },
      { id: 'B', text: 'O(n)' },
      { id: 'C', text: 'O(log n)' },
      { id: 'D', text: 'O(n log n)' }
    ],
    correctAnswer: 'A',
    explanation: 'Array elements are stored in contiguous memory locations, allowing direct calculation of memory address in constant O(1) time.'
  },
  {
    id: 2,
    question: 'In zero-indexed arrays of size N, what is the valid index range?',
    options: [
      { id: 'A', text: '1 to N' },
      { id: 'B', text: '0 to N' },
      { id: 'C', text: '0 to N - 1' },
      { id: 'D', text: '1 to N - 1' }
    ],
    correctAnswer: 'C',
    explanation: 'A zero-indexed array of length N starts at index 0 and terminates at index N - 1.'
  },
  {
    id: 3,
    question: 'What is the worst-case time complexity for inserting an element at the beginning of an unsorted array of size N?',
    options: [
      { id: 'A', text: 'O(1)' },
      { id: 'B', text: 'O(N)' },
      { id: 'C', text: 'O(log N)' },
      { id: 'D', text: 'O(N^2)' }
    ],
    correctAnswer: 'B',
    explanation: 'All existing N elements must be shifted one position to the right, taking O(N) operations.'
  },
  {
    id: 4,
    question: 'Which formula correctly computes the memory address of element A[i] given base address B and element size S?',
    options: [
      { id: 'A', text: 'Address = B + (i * S)' },
      { id: 'B', text: 'Address = B + (i / S)' },
      { id: 'C', text: 'Address = (B + i) * S' },
      { id: 'D', text: 'Address = B * i + S' }
    ],
    correctAnswer: 'A',
    explanation: 'Address arithmetic: Base Address + (Index * Element Size).'
  },
  {
    id: 5,
    question: 'What happens if you attempt to access an index greater than or equal to the array size in C++ without bounds checking?',
    options: [
      { id: 'A', text: 'Compilation Error' },
      { id: 'B', text: 'Undefined Behavior / Segmentation Fault' },
      { id: 'C', text: 'Array expands automatically' },
      { id: 'D', text: 'Always returns 0' }
    ],
    correctAnswer: 'B',
    explanation: 'Accessing out-of-bounds indices in C++ leads to undefined behavior or segmentation fault.'
  }
];

const CourseMiniAssessmentView = ({ 
  module, 
  onComplete, 
  onBack,
  passingPercentage = 70 
}) => {
  const questions = (module?.miniAssessment?.questions && module.miniAssessment.questions.length > 0)
    ? module.miniAssessment.questions
    : (module?.assessment?.questions && module.assessment.questions.length > 0)
      ? module.assessment.questions
      : ASSESSMENT_QUESTIONS;

  const assessmentTitle = module?.miniAssessment?.title || (module?.title ? `${module.title} — Mini Assessment` : 'Module Mini Assessment');
  const durationSec = (module?.miniAssessment?.durationMinutes || 10) * 60;
  const passCutoff = module?.miniAssessment?.passingPercentage || passingPercentage;

  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [timeLeftSec, setTimeLeftSec] = useState(durationSec);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [scoreResult, setScoreResult] = useState(null);

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

  const handleSelectOption = (oIdx) => {
    if (isSubmitted) return;
    setSelectedAnswers(prev => ({
      ...prev,
      [currentIdx]: oIdx
    }));
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

    const pct = Math.round((correctCount / questions.length) * 100);
    const passed = pct >= passCutoff;

    const result = {
      scorePct: pct,
      correctCount,
      totalCount: questions.length,
      passed
    };

    setScoreResult(result);
    setIsSubmitted(true);

    if (passed) {
      onComplete?.(result);
    }
  };

  const currentQ = questions[currentIdx] || questions[0];

  return (
    <div className="mini-assessment-fullscreen-workspace">
      {/* Top Breadcrumb Header */}
      <div className="assessment-top-bar">
        <div className="assessment-top-left">
          <button className="assessment-back-btn" onClick={onBack}>
            <FaArrowLeft />
            <span>Back to Lessons</span>
          </button>
          <div className="assessment-crumbs">
            <span>Courses</span> &gt; <span>{module?.title || 'Curriculum'}</span> &gt; <span className="current">Mini Assessment</span>
          </div>
        </div>

        <div className="assessment-countdown-pill">
          <FaClock />
          <span>{formatTimer(timeLeftSec)}</span>
        </div>
      </div>

      {/* Main Grid: Question Stage on Left, Palette on Right */}
      {!isSubmitted ? (
        <div className="assessment-main-grid">
          {/* Left: Question Card */}
          <div className="assessment-question-col">
            <div className="assessment-header-banner">
              <h2 className="assessment-title">{assessmentTitle}</h2>
              <div className="assessment-meta-pills">
                <span className="meta-pill">{questions.length} Questions</span>
                <span className="meta-pill">{Math.round(durationSec / 60)} Minutes</span>
                <span className="meta-pill">Pass Mark: {passCutoff}%</span>
                <span className="meta-pill">Cutoff Required</span>
              </div>
            </div>

            <div className="question-display-card">
              <div className="question-number-tag">
                Question {currentIdx + 1} of {questions.length}
              </div>

              <h3 className="question-statement">{currentQ?.question || currentQ?.prompt || currentQ?.questionText || ''}</h3>

              <div className="options-stack">
                {(currentQ?.options || []).map((opt, oIdx) => {
                  const letter = String.fromCharCode(65 + oIdx);
                  const optText = typeof opt === 'object' ? (opt.text || opt.title || opt.label || '') : opt;
                  const isSelected = selectedAnswers[currentIdx] === oIdx;
                  return (
                    <div 
                      key={oIdx}
                      className={`assessment-option-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectOption(oIdx)}
                    >
                      <div className="option-radio-indicator">
                        {isSelected && <div className="option-radio-dot" />}
                      </div>
                      <span className="option-letter-tag">{letter}.</span>
                      <span className="option-text">{optText}</span>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Card Controls */}
              <div className="question-nav-actions">
                <button 
                  className="nav-btn prev"
                  onClick={() => setCurrentIdx(prev => Math.max(0, prev - 1))}
                  disabled={currentIdx === 0}
                >
                  Previous
                </button>

                {currentIdx < questions.length - 1 ? (
                  <button 
                    className="nav-btn next"
                    onClick={() => setCurrentIdx(prev => Math.min(questions.length - 1, prev + 1))}
                  >
                    <span>Next</span>
                    <FaArrowRight />
                  </button>
                ) : (
                  <button 
                    className="nav-btn submit-final"
                    onClick={handleSubmit}
                  >
                    Submit Assessment
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right: Question Palette & Rules */}
          <div className="assessment-palette-col">
            <div className="palette-card">
              <h4 className="palette-title">Question Palette</h4>
              <div className="palette-grid">
                {questions.map((q, idx) => {
                  const isAnswered = selectedAnswers[idx] !== undefined;
                  const isCurrent = currentIdx === idx;

                  return (
                    <button
                      key={q.id || idx}
                      className={`palette-num-btn ${isCurrent ? 'current' : isAnswered ? 'answered' : 'unanswered'}`}
                      onClick={() => setCurrentIdx(idx)}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              <div className="palette-legend-row">
                <div className="legend-item"><span className="dot current" /> Current</div>
                <div className="legend-item"><span className="dot answered" /> Answered</div>
                <div className="legend-item"><span className="dot unanswered" /> Not Answered</div>
              </div>

              <div className="palette-instructions-box">
                <h5>Instructions</h5>
                <ul>
                  <li>Read each question carefully.</li>
                  <li>You can review and change answers before submitting.</li>
                  <li>Complete all questions to achieve maximum score.</li>
                  <li>You need <strong>{passingPercentage}%</strong> to pass and unlock the next module.</li>
                  <li>You have 2 attempts for this milestone.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Result Screen */
        <div className="assessment-result-workspace">
          <div className={`assessment-verdict-card ${scoreResult.passed ? 'passed' : 'failed'}`}>
            <div className="verdict-icon-circle">
              {scoreResult.passed ? <FaCheckCircle /> : <FaTimesCircle />}
            </div>

            <h2 className="verdict-title">
              {scoreResult.passed ? 'Module Assessment Passed' : 'Assessment Not Passed'}
            </h2>

            <div className="verdict-score-display">
              <span className="score-number">{scoreResult.scorePct}%</span>
              <span className="score-ratio">({scoreResult.correctCount} of {scoreResult.totalCount} correct)</span>
            </div>

            <p className="verdict-message">
              {scoreResult.passed 
                ? `Congratulations! You have successfully mastered ${module?.title || 'this module'} and unlocked the next module.` 
                : `Required: ${passCutoff}%. Please review the lessons and practice problems before retrying.`}
            </p>

            <div className="verdict-actions-row">
              {scoreResult.passed ? (
                <button className="verdict-btn continue" onClick={() => onComplete(scoreResult)}>
                  <span>Continue to Next Module</span>
                  <FaArrowRight />
                </button>
              ) : (
                <>
                  <button className="verdict-btn retry" onClick={() => {
                    setSelectedAnswers({});
                    setTimeLeftSec(600);
                    setIsSubmitted(false);
                  }}>
                    <FaRedo />
                    <span>Try Again</span>
                  </button>
                  <button className="verdict-btn review" onClick={onBack}>
                    <span>Review Module Lessons</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CourseMiniAssessmentView;
