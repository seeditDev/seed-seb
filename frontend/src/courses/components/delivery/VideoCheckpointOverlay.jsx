import React, { useState } from 'react';
import { FaQuestionCircle, FaCheckCircle, FaExclamationTriangle, FaArrowRight, FaRedo } from 'react-icons/fa';

const VideoCheckpointOverlay = ({ checkpoint, onPass }) => {
  const [selectedOpt, setSelectedOpt] = useState(null);
  const [textInput, setTextInput] = useState('');
  const [feedback, setFeedback] = useState(null); // { isCorrect: boolean, message: string }

  if (!checkpoint) return null;

  const isMCQ = checkpoint.type === 'MCQ' || (checkpoint.options && checkpoint.options.length > 0);

  const handleSubmit = (e) => {
    e?.preventDefault();

    if (isMCQ) {
      if (selectedOpt === null || selectedOpt === undefined) return;

      const correctVal = checkpoint.correctAnswer;
      const selectedIdx = Number(selectedOpt);
      const selectedLetter = ['A', 'B', 'C', 'D', 'E'][selectedIdx] || String(selectedOpt).toUpperCase();
      const selectedText = String(checkpoint.options?.[selectedIdx]?.text || checkpoint.options?.[selectedIdx] || selectedOpt).trim().toLowerCase();

      const correctIdx = typeof correctVal === 'number' ? correctVal : ['A', 'B', 'C', 'D', 'E'].indexOf(String(correctVal).toUpperCase());
      const correctLetter = typeof correctVal === 'number' ? ['A', 'B', 'C', 'D', 'E'][correctVal] : String(correctVal).toUpperCase();
      const correctText = String(checkpoint.options?.[correctIdx]?.text || checkpoint.options?.[correctIdx] || correctVal).trim().toLowerCase();

      const isCorrect = 
        selectedOpt === correctVal ||
        selectedIdx === correctIdx ||
        selectedLetter === correctLetter ||
        selectedText === correctText;

      if (isCorrect) {
        setFeedback({ isCorrect: true, message: checkpoint.explanation || 'Correct answer! Video resuming...' });
        setTimeout(() => {
          onPass();
        }, 1200);
      } else {
        setFeedback({ isCorrect: false, message: checkpoint.explanation || 'Incorrect. Review the instructor explanation and try again.' });
      }
    } else {
      // Text / keyword check
      const clean = textInput.trim().toLowerCase();
      const keywords = (checkpoint.acceptedKeywords || [checkpoint.expectedAnswer || '']).map(k => String(k).toLowerCase());
      const isCorrect = keywords.some(k => k && clean.includes(k));

      if (isCorrect) {
        setFeedback({ isCorrect: true, message: checkpoint.explanation || 'Great job! Concept verified.' });
        setTimeout(() => {
          onPass();
        }, 1200);
      } else {
        setFeedback({ isCorrect: false, message: checkpoint.explanation || 'Not quite. Check your spelling or review the previous explanation.' });
      }
    }
  };

  return (
    <div className="video-checkpoint-backdrop">
      <div className="video-checkpoint-modal">
        <div className="vc-modal-header">
          <div className="vc-badge">
            <FaQuestionCircle />
            <span>Checkpoint Required</span>
          </div>
          <span className="vc-hint">Video paused until answered</span>
        </div>

        <h3 className="vc-question-text">{checkpoint.question}</h3>

        {isMCQ ? (
          <div className="vc-options-list">
            {(checkpoint.options || []).map((opt, oIdx) => {
              const letter = String.fromCharCode(65 + oIdx);
              const optText = typeof opt === 'object' ? (opt.text || opt.title || opt.label || '') : opt;
              const isSelected = selectedOpt === oIdx;

              return (
                <div
                  key={oIdx}
                  className={`vc-option-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => !feedback?.isCorrect && setSelectedOpt(oIdx)}
                >
                  <div className="vc-radio-indicator">
                    {isSelected && <div className="vc-radio-dot" />}
                  </div>
                  <span className="vc-opt-letter">{letter}.</span>
                  <span className="vc-opt-text">{optText}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="vc-text-form">
            <input
              type="text"
              className="vc-text-input"
              placeholder="Type your answer here..."
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              disabled={feedback?.isCorrect}
              autoFocus
            />
          </form>
        )}

        {feedback && (
          <div className={`vc-feedback-banner ${feedback.isCorrect ? 'correct' : 'incorrect'}`}>
            {feedback.isCorrect ? <FaCheckCircle /> : <FaExclamationTriangle />}
            <p>{feedback.message}</p>
          </div>
        )}

        <div className="vc-modal-actions">
          {feedback?.isCorrect ? (
            <button className="vc-continue-btn active" onClick={onPass}>
              <span>Resume Video</span>
              <FaArrowRight />
            </button>
          ) : (
            <button
              className="vc-submit-btn"
              onClick={handleSubmit}
              disabled={isMCQ ? (selectedOpt === null || selectedOpt === undefined) : !textInput.trim()}
            >
              Submit Answer
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoCheckpointOverlay;
