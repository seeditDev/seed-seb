import React, { useState } from 'react';
import { FaMicrophone, FaCheckCircle, FaExclamationCircle, FaQuestionCircle, FaPaperPlane } from 'react-icons/fa';
import aiClassService from '../../services/aiClassService';

const QuickCheckCard = ({ quickCheck, onPass, isPassed = false }) => {
  const [inputVal, setInputVal] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [feedback, setFeedback] = useState(null); // { isCorrect: boolean, text: string }

  if (!quickCheck) return null;

  const handleToggleVoice = () => {
    if (isListening) {
      aiClassService.stopListening();
      setIsListening(false);
      return;
    }

    setIsListening(true);
    aiClassService.startListening({
      onResult: (transcript) => {
        setInputVal(transcript);
        setIsListening(false);
        // Automatic evaluation on voice capture
        validate(transcript);
      },
      onError: (err) => {
        setIsListening(false);
      },
      onEnd: () => {
        setIsListening(false);
      }
    });
  };

  const validate = (text) => {
    const result = aiClassService.evaluateAnswer(text || inputVal, quickCheck);
    setFeedback({
      isCorrect: result.isCorrect,
      text: result.feedback
    });

    if (result.isCorrect) {
      onPass?.();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    validate(inputVal);
  };

  return (
    <div className="quick-check-card">
      <div className="quick-check-header">
        <div className="quick-check-badge">
          <FaQuestionCircle />
          <span>Quick Check</span>
        </div>
        <span className="quick-check-counter">1 of 1 &gt;</span>
      </div>

      <div className="quick-check-question">
        {quickCheck.question}
      </div>

      <div className="quick-check-subprompt">
        <span className="quick-check-hand"><FaQuestionCircle /></span>
        <span>{quickCheck.prompt || 'Your turn: Answer using voice or type.'}</span>
      </div>

      <form className="quick-check-input-row" onSubmit={handleSubmit}>
        <button
          type="button"
          className={`quick-check-mic-btn ${isListening ? 'listening' : ''}`}
          onClick={handleToggleVoice}
          title={isListening ? 'Listening... click to stop' : 'Click to answer with your voice'}
        >
          <FaMicrophone />
        </button>

        <input
          type="text"
          className="quick-check-text-input"
          placeholder={isListening ? 'Listening to your voice...' : 'Type your answer here...'}
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          disabled={isPassed && feedback?.isCorrect}
        />

        <button
          type="submit"
          className="quick-check-submit-btn"
          disabled={!inputVal.trim() || (isPassed && feedback?.isCorrect)}
        >
          {isPassed && feedback?.isCorrect ? 'Passed' : 'Submit'}
        </button>
      </form>

      {feedback && (
        <div className={`quick-check-feedback-banner ${feedback.isCorrect ? 'correct' : 'incorrect'}`}>
          {feedback.isCorrect ? <FaCheckCircle /> : <FaExclamationCircle />}
          <p>{feedback.text}</p>
        </div>
      )}

      {isPassed && !feedback && (
        <div className="quick-check-feedback-banner correct">
          <FaCheckCircle />
          <p>Checkpoint Completed! Great job grasping this concept.</p>
        </div>
      )}
    </div>
  );
};

export default QuickCheckCard;
