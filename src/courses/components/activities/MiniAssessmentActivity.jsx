import React, { useState, useEffect } from 'react';
import { FaClock, FaCheckCircle, FaExclamationCircle, FaLock, FaTrophy, FaArrowRight } from 'react-icons/fa';
import { renderMathAndCode } from '../../../utils/mathAndCodeRenderer';
import { ProblemImage } from '../../../components/common/ProblemMarkdownRenderer';

const MiniAssessmentActivity = ({ module, onComplete, passingPercentage = 70 }) => {
  const assessment = module?.miniAssessment || {
    title: `${module?.title || 'Module'} Mini Assessment`,
    questionCount: 5,
    durationMinutes: 10,
    passingPercentage: 70,
    questions: [
      {
        id: 'q1',
        text: 'In zero-indexed languages, what is the memory address formula for element A[i] with base address B and element size S?',
        options: ['B + (i * S)', 'B + (i / S)', 'B * (i + S)', 'B - (i * S)'],
        correctIndex: 0
      },
      {
        id: 'q2',
        text: 'What is the average time complexity of random element access in an array given its index?',
        options: ['O(N)', 'O(log N)', 'O(1)', 'O(N log N)'],
        correctIndex: 2
      },
      {
        id: 'q3',
        text: 'What happens when inserting an element at the beginning of an array of size N?',
        options: ['No shift required', 'Elements must shift right taking O(N) time', 'Elements overwrite index 0 in O(1)', 'Array automatically rotates in O(log N)'],
        correctIndex: 1
      },
      {
        id: 'q4',
        text: 'Which problem-solving pattern is best suited for finding a subarray with a given sum in a non-negative array?',
        options: ['Binary Search Tree', 'Sliding Window / Two Pointers', 'Graph BFS', 'Dynamic Programming Matrix'],
        correctIndex: 1
      },
      {
        id: 'q5',
        text: 'What is the amortized time complexity of appending an element to the end of a dynamic array (std::vector or ArrayList)?',
        options: ['O(1)', 'O(N)', 'O(N^2)', 'O(log N)'],
        correctIndex: 0
      }
    ]
  };

  const questions = assessment.questions || [];
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeftSec, setTimeLeftSec] = useState(assessment.durationMinutes * 60);

  useEffect(() => {
    if (submitted) return;
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
  }, [submitted]);

  const formatTimer = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleSelect = (qIdx, optIdx) => {
    if (submitted) return;
    setSelectedAnswers(prev => ({ ...prev, [qIdx]: optIdx }));
  };

  const handleSubmit = () => {
    if (submitted) return;
    let correct = 0;
    questions.forEach((q, idx) => {
      const chosen = selectedAnswers[idx];
      if (chosen === undefined || chosen === null) return;

      const correctVal = q.correctAnswer !== undefined ? q.correctAnswer : q.correctIndex;
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
        correct++;
      }
    });

    const calculatedScore = Math.round((correct / (questions.length || 1)) * 100);
    setScore(calculatedScore);
    setSubmitted(true);
    onComplete?.(calculatedScore);
  };

  const passed = score >= passingPercentage;

  return (
    <div className="mini-assessment-container">
      {/* Assessment Header */}
      <div className="assessment-card-header">
        <div>
          <h3 className="assessment-title">{assessment.title}</h3>
          <p className="assessment-subtitle">
            {questions.length} Questions • {assessment.durationMinutes} Mins • {passingPercentage}% to pass
          </p>
        </div>

        {!submitted && (
          <div className="assessment-countdown-badge">
            <FaClock />
            <span>{formatTimer(timeLeftSec)}</span>
          </div>
        )}
      </div>

      {/* Result Screen if submitted */}
      {submitted ? (
        <div className={`assessment-result-card ${passed ? 'passed' : 'failed'}`}>
          <div className="result-icon-circle">
            {passed ? <FaTrophy /> : <FaExclamationCircle />}
          </div>
          <h2 className="result-score-heading">{score}%</h2>
          <p className="result-verdict">
            {passed 
              ? 'Congratulations! You have successfully passed the Mini Assessment and unlocked the next module!' 
              : 'You did not meet the 70% passing threshold. Review the lesson notes and try again.'}
          </p>

          <div className="result-rewards-row">
            <span className="reward-pill">+100 XP</span>
            <span className="reward-pill">+20 Credits</span>
          </div>

          <div className="result-actions">
            {!passed && (
              <button 
                className="assessment-retry-btn"
                onClick={() => {
                  setSubmitted(false);
                  setSelectedAnswers({});
                  setTimeLeftSec(assessment.durationMinutes * 60);
                }}
              >
                Retry Assessment
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Questions List */
        <div className="assessment-questions-flow">
          {questions.map((q, qIdx) => (
            <div key={q.id || qIdx} className="assessment-q-card">
              <div className="assessment-q-text">
                <span className="assessment-q-num">{qIdx + 1}.</span> {renderMathAndCode(q.text || q.question)}
              </div>

              {(q?.imageUrl || q?.image || q?.figure || q?.diagram || q?.questionImage || q?.assetUrl) && (
                <div style={{ margin: '10px 0', textAlign: 'center' }}>
                  <ProblemImage 
                    src={q?.imageUrl || q?.image || q?.figure || q?.diagram || q?.questionImage || q?.assetUrl} 
                    alt={`Question ${qIdx + 1} Illustration`} 
                  />
                </div>
              )}

              <div className="assessment-options-grid">
                {q.options.map((opt, optIdx) => {
                  const optText = typeof opt === 'object' ? (opt.text || opt.title || '') : opt;
                  return (
                    <div
                      key={optIdx}
                      className={`assessment-option-item ${selectedAnswers[qIdx] === optIdx ? 'selected' : ''}`}
                      onClick={() => handleSelect(qIdx, optIdx)}
                    >
                      <div className="option-radio-circle">
                        {selectedAnswers[qIdx] === optIdx && <div className="option-radio-dot" />}
                      </div>
                      <span className="opt-letter">{String.fromCharCode(65 + optIdx)}</span>
                      <span className="opt-text">{renderMathAndCode(optText, true)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="assessment-submit-bar">
            <button 
              className="assessment-final-submit-btn" 
              onClick={handleSubmit}
              disabled={Object.keys(selectedAnswers).length === 0}
            >
              <span>Submit Assessment</span>
              <FaArrowRight />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MiniAssessmentActivity;
