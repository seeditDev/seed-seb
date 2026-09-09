import React, { useState, useEffect } from 'react';
import { 
  FaMicrophone, FaKeyboard, FaCheckCircle, FaTimesCircle, 
  FaArrowRight, FaRedo, FaLightbulb, FaLock, FaVolumeUp 
} from 'react-icons/fa';
import aiClassService from '../../services/aiClassService';

const InteractiveQuickCheckView = ({ 
  topic, 
  quickCheckData, 
  onCorrectComplete, 
  onBackToClass 
}) => {
  const [inputMode, setInputMode] = useState('voice'); // 'voice' | 'text'
  const [typedAnswer, setTypedAnswer] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [evaluationState, setEvaluationState] = useState('idle'); // 'idle' | 'correct' | 'incorrect'
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [retriesCount, setRetriesCount] = useState(0);
  const [showHint, setShowHint] = useState(false);

  const check = quickCheckData || topic?.activities?.[0]?.quickCheck || {
    question: 'In an array of size 5, what will be the valid index range?',
    expectedAnswer: '0 to 4',
    acceptedAnswers: ['0 to 4', '0-4', '0 to 4 inclusive', 'index 0 to 4', '0,1,2,3,4', 'from 0 to 4', 'zero to four', '0 to n-1', '0 to size - 1'],
    onCorrect: {
      message: 'Correct! Exactly. Array indexing starts from 0, so valid indices for size 5 are 0, 1, 2, 3, and 4.'
    },
    onIncorrect: {
      message: 'Not quite. Remember that array indexing starts from 0. For an array of size 5, what is the index of the first and last elements?'
    }
  };

  useEffect(() => {
    return () => {
      aiClassService.stopListening();
    };
  }, []);

  const handleStartVoice = () => {
    if (isListening) {
      aiClassService.stopListening();
      setIsListening(false);
      return;
    }

    setEvaluationState('idle');
    setInterimTranscript('');
    setIsListening(true);

    aiClassService.startListening({
      onResult: (spokenText) => {
        setInterimTranscript(spokenText);
        setTypedAnswer(spokenText);
      },
      onEnd: () => {
        setIsListening(false);
      },
      onError: () => {
        setIsListening(false);
      }
    });
  };

  const handleEvaluate = () => {
    const raw = (typedAnswer || interimTranscript).trim().toLowerCase();
    if (!raw) return;

    const accepted = check.acceptedAnswers?.map(a => a.toLowerCase()) || ['0 to 4', 'zero to four'];
    const isCorrect = accepted.some(ans => raw.includes(ans) || ans.includes(raw));

    if (isCorrect) {
      setEvaluationState('correct');
      setFeedbackMessage(check.onCorrect?.message || 'Correct! Array indexing starts at 0.');
      aiClassService.speakText('Correct! Exactly. Array indexing starts from 0.');
    } else {
      setEvaluationState('incorrect');
      setFeedbackMessage(check.onIncorrect?.message || 'Not quite. Think about where the first element begins.');
      setRetriesCount(prev => prev + 1);
    }
  };

  return (
    <div className="quick-check-fullscreen-stage">
      <div className="quick-check-focus-card">
        {/* Card Header */}
        <div className="focus-card-header">
          <div className="focus-card-title-group">
            <span className="focus-badge-icon">?</span>
            <div>
              <h3 className="focus-title">Quick Check</h3>
              <span className="focus-meta">Question 1 of 1</span>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="focus-mode-toggle">
            <button
              className={`mode-btn ${inputMode === 'voice' ? 'active' : ''}`}
              onClick={() => setInputMode('voice')}
            >
              <FaMicrophone />
              <span>Speak Answer</span>
            </button>
            <button
              className={`mode-btn ${inputMode === 'text' ? 'active' : ''}`}
              onClick={() => setInputMode('text')}
            >
              <FaKeyboard />
              <span>Type Answer</span>
            </button>
          </div>
        </div>

        {/* Question Prompt */}
        <div className="focus-question-box">
          <h2 className="focus-question-text">{check.question}</h2>
        </div>

        {/* Interactive Response Arena with Floating Teacher Tip */}
        <div className="focus-interaction-layout">
          <div className="focus-input-col">
            {inputMode === 'voice' ? (
              <div className="voice-mic-orb-area">
                <div 
                  className={`pulse-mic-orb ${isListening ? 'listening' : ''}`}
                  onClick={handleStartVoice}
                  title="Click to speak"
                >
                  <FaMicrophone className="mic-symbol-icon" />
                  {isListening && <div className="mic-wave-ring" />}
                </div>

                <div className="mic-instruction-text">
                  <strong>{isListening ? 'Listening to your voice...' : 'Click the mic and speak your answer'}</strong>
                  <p>Tip: Speak clearly. You can also switch to typing anytime.</p>
                </div>

                {interimTranscript && (
                  <div className="speech-transcript-bubble">
                    <span className="transcript-label">Transcribed:</span>
                    <span className="transcript-text">"{interimTranscript}"</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-type-area">
                <textarea
                  className="focus-text-input"
                  placeholder="Type your answer here (e.g., 0 to 4)..."
                  value={typedAnswer}
                  onChange={(e) => setTypedAnswer(e.target.value)}
                  rows={4}
                />
              </div>
            )}
          </div>

          {/* Teacher Miniature Tip Balloon (Matching Reference Collage) */}
          <div className="focus-teacher-balloon-col">
            <div className="teacher-tip-bubble">
              <p>"Take your time! Think about how indexing works in arrays and what the initial offset is."</p>
            </div>
            <div className="teacher-mini-profile">
              <img 
                src="/images/ai_instructor.jpg" 
                alt="Teacher" 
                className="teacher-mini-avatar"
              />
              <span className="teacher-mini-name">SEED-IT AI Instructor</span>
            </div>
          </div>
        </div>

        {/* Evaluation Banner */}
        {evaluationState === 'correct' && (
          <div className="focus-feedback-box correct">
            <FaCheckCircle className="feedback-icon" />
            <div>
              <strong>Correct!</strong>
              <p>{feedbackMessage}</p>
            </div>
          </div>
        )}

        {evaluationState === 'incorrect' && (
          <div className="focus-feedback-box incorrect">
            <FaTimesCircle className="feedback-icon" />
            <div>
              <strong>Not quite.</strong>
              <p>{feedbackMessage}</p>
              {showHint && (
                <div className="hint-reveal-box">
                  <FaLightbulb />
                  <span>Hint: If size is $N$, indices start at $0$ and end at $N - 1$.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Footer */}
        <div className="focus-action-footer">
          <div className="action-left">
            <button className="skip-disabled-badge" disabled>
              <FaLock />
              <span>Skip (Not allowed)</span>
            </button>
            {evaluationState === 'incorrect' && !showHint && (
              <button 
                className="show-hint-btn"
                onClick={() => setShowHint(true)}
              >
                <FaLightbulb />
                <span>Show Hint</span>
              </button>
            )}
          </div>

          <div className="action-right">
            {evaluationState === 'correct' ? (
              <button 
                className="continue-lesson-btn"
                onClick={() => {
                  onCorrectComplete();
                  onBackToClass();
                }}
              >
                <span>Continue Lesson</span>
                <FaArrowRight />
              </button>
            ) : (
              <button 
                className="submit-answer-btn"
                onClick={handleEvaluate}
                disabled={!typedAnswer.trim() && !interimTranscript.trim()}
              >
                <span>Submit Answer</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InteractiveQuickCheckView;
