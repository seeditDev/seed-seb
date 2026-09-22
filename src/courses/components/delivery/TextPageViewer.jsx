import React, { useState, useEffect, useMemo } from 'react';
import { 
  FaBookOpen, FaArrowLeft, FaArrowRight, FaCheckCircle, 
  FaQuestionCircle, FaLightbulb, FaCode, FaCheck,
  FaCopy, FaDesktop, FaExternalLinkAlt, FaPlay, FaShieldAlt, FaLock
} from 'react-icons/fa';
import LessonMarkdownRenderer from './LessonMarkdownRenderer';
import { renderMathAndCode } from '../../../utils/mathAndCodeRenderer';
import { ProblemImage } from '../../../components/common/ProblemMarkdownRenderer';

const TextPageViewer = ({
  topic,
  user,
  course,
  activeModule,
  topicProgress,
  onCheckpointPassed,
  onTopicComplete,
  onPageChange
}) => {
  // Flatten topic into a linear sequence of steps:
  // Page 1 (Content) -> Checkpoint 1 (Full page) -> Page 2 (Content) -> Checkpoint 2 -> ...
  const steps = useMemo(() => {
    if (topic?.pages && Array.isArray(topic.pages) && topic.pages.length > 0) {
      const items = [];
      topic.pages.forEach((p, pIdx) => {
        // Step A: The Content Page (reading text only, no checkpoint below)
        items.push({
          type: 'CONTENT',
          stepId: `page_${p.pageId || pIdx + 1}`,
          pageIndex: pIdx,
          title: p.title || `${topic?.title || 'Lesson'} — Page ${pIdx + 1}`,
          content: p.content,
          callout: p.callout,
          codeCard: p.codeCard,
          illustration: p.illustration,
          visual: p.visual,
          hasCheckpointAfter: Boolean(p.checkpoint)
        });

        // Step B: The Checkpoint Page (dedicated full-page checkpoint)
        if (p.checkpoint) {
          items.push({
            type: 'CHECKPOINT',
            stepId: `cp_${p.checkpoint.checkpointId || p.pageId || pIdx + 1}`,
            checkpointId: p.checkpoint.checkpointId || `CP_${p.pageId || pIdx + 1}`,
            pageIndex: pIdx,
            title: p.checkpoint.title || `Knowledge Check`,
            subtitle: `Checkpoint for: ${p.title || `Page ${pIdx + 1}`}`,
            checkpoint: p.checkpoint,
            parentPageTitle: p.title || `Page ${pIdx + 1}`,
            parentPageIndex: pIdx
          });
        }
      });
      return items;
    }

    // If no topic.pages configured: use only authentic topic content
    const textContent = 
      topic?.lesson?.content || 
      topic?.lessonContent?.textAndVisuals?.content || 
      topic?.lessonMarkdown || 
      topic?.content || 
      topic?.lesson?.summary || 
      topic?.description || 
      '';

    const visual = topic?.lessonContent?.textAndVisuals?.visualDiagram;

    const firstAssessment = topic?.assessments?.[0];
    const realCheckpoint = topic?.checkpoints?.[0] || topic?.lessonContent?.midVideoCheckpoints?.[0] || (firstAssessment ? {
      checkpointId: firstAssessment.id || 'CP_1',
      question: firstAssessment.question,
      options: (firstAssessment.options || []).map((opt, oIdx) => ({
        id: String.fromCharCode(65 + oIdx),
        text: typeof opt === 'string' ? opt : (opt.text || `Option ${oIdx + 1}`)
      })),
      correctAnswer: typeof firstAssessment.correctAnswer === 'number' 
        ? String.fromCharCode(65 + firstAssessment.correctAnswer)
        : (firstAssessment.correctAnswer || 'A'),
      explanation: firstAssessment.explanation || ''
    } : null);

    const stepItems = [
      {
        type: 'CONTENT',
        stepId: 'P1',
        pageIndex: 0,
        title: topic?.title || 'Lesson Overview',
        content: textContent,
        visual: visual || null,
        example: topic?.activities?.find(a => a.type === 'EXAMPLE')?.languages?.cpp || null,
        hasCheckpointAfter: Boolean(realCheckpoint)
      }
    ];

    if (realCheckpoint) {
      stepItems.push({
        type: 'CHECKPOINT',
        stepId: realCheckpoint.checkpointId || 'CP_1',
        checkpointId: realCheckpoint.checkpointId || 'CP_1',
        pageIndex: 0,
        title: `${topic?.title || 'Lesson'} — Knowledge Check`,
        subtitle: `Checkpoint for: ${topic?.title || 'Lesson'}`,
        checkpoint: realCheckpoint,
        parentPageTitle: topic?.title || 'Lesson',
        parentPageIndex: 0
      });
    }

    return stepItems;
  }, [topic]);

  const [currentStepIdx, setCurrentStepIdx] = useState(() => {
    const savedPgIdx = topicProgress?.currentPageIdx || 0;
    const matchIdx = steps.findIndex(s => s.type === 'CONTENT' && s.pageIndex === savedPgIdx);
    return matchIdx !== -1 ? matchIdx : 0;
  });

  const [passedCheckpoints, setPassedCheckpoints] = useState(() => {
    return topicProgress?.passedCheckpoints || [];
  });

  useEffect(() => {
    if (topicProgress?.passedCheckpoints) {
      setPassedCheckpoints(topicProgress.passedCheckpoints);
    }
  }, [topicProgress?.passedCheckpoints]);

  const [selectedOpt, setSelectedOpt] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // Reset option and feedback whenever the step changes
  useEffect(() => {
    setSelectedOpt(null);
    setFeedback(null);
  }, [currentStepIdx]);

  const currentStep = steps[currentStepIdx] || steps[0] || {};
  const isCheckpointStep = currentStep.type === 'CHECKPOINT';
  const checkpoint = currentStep.checkpoint;
  const cpId = currentStep.checkpointId || checkpoint?.checkpointId;
  const isCheckpointPassed = isCheckpointStep 
    ? (cpId ? passedCheckpoints.includes(cpId) : true)
    : true;

  const hasExamples = Boolean(
    topic?.activities?.some(a => (typeof a === 'string' && a.toLowerCase() === 'examples') || a?.type === 'EXAMPLE') ||
    (topic?.codeExamples && topic.codeExamples.length > 0) ||
    (topic?.pages && topic.pages.some(p => p.codeCard)) ||
    (topic?.lessonContent?.codeExamples && topic.lessonContent.codeExamples.length > 0) ||
    topic?.example
  );
  const hasPractice = Boolean(
    topic?.activities?.some(a => (typeof a === 'string' && a.toLowerCase() === 'practice') || a?.type === 'PRACTICE') ||
    (topic?.practiceProblems && topic.practiceProblems.length > 0) ||
    (topic?.practiceQuestions && topic.practiceQuestions.length > 0) ||
    (topic?.codingQuestions && topic.codingQuestions.length > 0)
  );
  const isReadingCompleted = Boolean(
    topicProgress?.checkpoints?.readingCompleted || 
    topicProgress?.readingCompleted ||
    topicProgress?.completed
  );

  const handleSelectOption = (optId) => {
    if (feedback?.isCorrect || isCheckpointPassed) return;
    setSelectedOpt(optId);
  };

  const handleCheckpointSubmit = () => {
    if (!checkpoint || selectedOpt === null || selectedOpt === undefined) return;

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
      const updated = [...passedCheckpoints, cpId];
      setPassedCheckpoints(updated);
      setFeedback({ 
        isCorrect: true, 
        message: checkpoint.explanation || 'Correct! You have grasped this concept.' 
      });
      onCheckpointPassed?.(cpId);
    } else {
      setFeedback({ 
        isCorrect: false, 
        message: checkpoint.explanation ? `Not quite. ${checkpoint.explanation}` : 'Incorrect answer. Review the concept on the previous page and try again.' 
      });
    }
  };

  const handleNextStep = () => {
    if (isCheckpointStep && !isCheckpointPassed) return;

    if (currentStepIdx < steps.length - 1) {
      const nextIdx = currentStepIdx + 1;
      setCurrentStepIdx(nextIdx);
      const nextStep = steps[nextIdx];
      if (nextStep && nextStep.type === 'CONTENT') {
        onPageChange?.(nextStep.pageIndex);
      }
    } else {
      onTopicComplete?.();
    }
  };

  const handlePrevStep = () => {
    if (currentStepIdx > 0) {
      setCurrentStepIdx(prev => prev - 1);
    }
  };

  const nextStep = steps[currentStepIdx + 1];
  const isLastStep = currentStepIdx === steps.length - 1;

  // Determine button labels & actions
  let nextBtnLabel = 'Next Page';
  let nextBtnIcon = <FaArrowRight />;

  if (isCheckpointStep) {
    if (isLastStep) {
      nextBtnLabel = isReadingCompleted ? 'Complete Lesson' : (hasExamples ? 'Next: Code Examples' : hasPractice ? 'Next: Practice Problems' : 'Complete Lesson');
    } else if (nextStep?.type === 'CONTENT') {
      nextBtnLabel = `Continue to Page ${nextStep.pageIndex + 1}`;
    } else {
      nextBtnLabel = 'Continue';
    }
  } else {
    // Current step is CONTENT
    if (nextStep?.type === 'CHECKPOINT') {
      nextBtnLabel = 'Proceed to Checkpoint';
      nextBtnIcon = <FaQuestionCircle />;
    } else if (isLastStep) {
      nextBtnLabel = isReadingCompleted ? 'Complete Lesson' : (hasExamples ? 'Next: Code Examples' : hasPractice ? 'Next: Practice Problems' : 'Complete Lesson');
    } else {
      nextBtnLabel = `Continue to Page ${nextStep.pageIndex + 1}`;
    }
  }

  const totalContentPages = steps.filter(s => s.type === 'CONTENT').length;

  return (
    <div className="text-delivery-container">
      {/* Top Header Bar */}
      <div className="text-page-header-bar">
        <div className="text-page-info">
          <span className="text-topic-tag">
            {isCheckpointStep 
              ? `CHECKPOINT • STEP ${currentStepIdx + 1} OF ${steps.length}` 
              : `PAGE ${currentStep.pageIndex + 1} OF ${totalContentPages} • LESSON READING`}
          </span>
          <h2 className="text-page-title">{currentStep.title}</h2>
        </div>

        {/* Step Progression Indicators */}
        <div className="text-pagination-indicator">
          <span>Step {currentStepIdx + 1} of {steps.length}</span>
          <div className="text-page-dots">
            {steps.map((s, idx) => {
              const isCurrent = idx === currentStepIdx;
              const isPassed = s.type === 'CHECKPOINT' 
                ? passedCheckpoints.includes(s.checkpointId)
                : idx <= currentStepIdx;

              const isClickable = idx <= currentStepIdx || (s.type === 'CONTENT' && idx === currentStepIdx + 1 && !isCheckpointStep);

              return (
                <div 
                  key={s.stepId || idx} 
                  className={`page-dot ${s.type === 'CHECKPOINT' ? 'checkpoint-dot' : 'content-dot'} ${isCurrent ? 'current' : isPassed ? 'completed' : ''}`}
                  onClick={() => isClickable && setCurrentStepIdx(idx)}
                  title={s.type === 'CHECKPOINT' ? `Checkpoint: ${s.title}` : `Page ${s.pageIndex + 1}: ${s.title}`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area: Render either Checkpoint Page or Content Page */}
      {isCheckpointStep ? (
        /* ====================================================================
           Dedicated Full-Page Checkpoint View (Page -> Checkpoint -> Page)
           ==================================================================== */
        <div className="text-page-content-scroll">
          <div className="text-checkpoint-fullpage-canvas">
            <div className="text-checkpoint-hero-card">
              <div className="text-checkpoint-hero-header">
                <div className="text-checkpoint-badge-pill">
                  <FaShieldAlt className="badge-icon" />
                  <span>Checkpoint Verification</span>
                </div>
                <button 
                  className="text-checkpoint-review-btn"
                  onClick={() => setCurrentStepIdx(prev => Math.max(0, prev - 1))}
                  title="Return to the lesson page"
                >
                  <FaBookOpen />
                  <span>Review Lesson Notes</span>
                </button>
              </div>

              <div className="text-checkpoint-context-banner">
                <h3 className="text-checkpoint-hero-title">{currentStep.title}</h3>
                <p className="text-checkpoint-hero-sub">
                  Verify your understanding of <strong>{currentStep.parentPageTitle}</strong> before unlocking the next section.
                </p>
              </div>

              <div className="text-checkpoint-question-container">
                <div className="text-checkpoint-q-header">
                  <span className="q-tag">QUESTION</span>
                </div>
                <div className="text-checkpoint-q-statement">
                  {renderMathAndCode(checkpoint.question)}
                </div>

                {(checkpoint?.imageUrl || checkpoint?.image || checkpoint?.figure || checkpoint?.diagram) && (
                  <div style={{ margin: '14px 0', textAlign: 'center' }}>
                    <ProblemImage 
                      src={checkpoint?.imageUrl || checkpoint?.image || checkpoint?.figure || checkpoint?.diagram} 
                      alt="Checkpoint Illustration" 
                    />
                  </div>
                )}

                {/* Interactive Options List */}
                <div className="text-checkpoint-options-grid">
                  {(checkpoint.options || []).map((opt, oIdx) => {
                    const letter = String.fromCharCode(65 + oIdx);
                    const optText = typeof opt === 'object' ? (opt.text || opt.title || opt.label || '') : opt;
                    const isSelected = selectedOpt === oIdx;

                    return (
                      <div
                        key={oIdx}
                        className={`text-opt-item-standalone ${isSelected ? 'selected' : ''} ${isCheckpointPassed ? 'locked-passed' : ''}`}
                        onClick={() => handleSelectOption(oIdx)}
                      >
                        <div className="text-opt-radio">
                          {isSelected && <div className="dot" />}
                        </div>
                        <span className="text-opt-letter">{letter}.</span>
                        <span className="text-opt-text">{renderMathAndCode(optText, true)}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Feedback Alerts */}
                {feedback && (
                  <div className={`text-feedback-banner ${feedback.isCorrect ? 'correct' : 'incorrect'}`}>
                    {feedback.isCorrect ? <FaCheckCircle /> : <FaLightbulb />}
                    <div className="feedback-content">
                      <strong>{feedback.isCorrect ? 'Correct!' : 'Incorrect'}</strong>
                      <p>{feedback.message}</p>
                    </div>
                  </div>
                )}

                {isCheckpointPassed && !feedback && (
                  <div className="text-feedback-banner correct">
                    <FaCheckCircle />
                    <div className="feedback-content">
                      <strong>Checkpoint Completed</strong>
                      <p>You have verified this concept. Click "{nextBtnLabel}" below to proceed.</p>
                    </div>
                  </div>
                )}

                {/* Submit Action */}
                {!isCheckpointPassed && (
                  <div className="text-checkpoint-submit-row">
                    <button
                      className="text-checkpoint-submit-btn-hero"
                      onClick={handleCheckpointSubmit}
                      disabled={selectedOpt === null || selectedOpt === undefined}
                    >
                      <FaCheck />
                      <span>Submit Checkpoint</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ====================================================================
           Pure Content Reading Page (No checkpoint rendered below it!)
           ==================================================================== */
        <div className="text-page-content-scroll">
          <div className="text-page-article-body">
            {currentStep.content && (
              <div className="text-article-markdown-wrapper">
                <LessonMarkdownRenderer content={currentStep.content} />
              </div>
            )}

            {/* Key Takeaway Tip Aside */}
            {currentStep.callout && (
              <aside className="lesson-tip-aside">
                <div className="tip-aside-header">
                  <FaLightbulb className="tip-bulb-icon" />
                  <span className="tip-label">TIP • {currentStep.callout.title || 'Key Takeaway'}</span>
                </div>
                <p className="tip-aside-text">{currentStep.callout.text}</p>
              </aside>
            )}

            {/* Runnable Sample Reference Bar */}
            {currentStep.codeCard && (
              <div className="lesson-runnable-sample-bar">
                <div className="sample-bar-left">
                  <span className="sample-chip">RUNNABLE SAMPLE</span>
                  <span className="sample-title">
                    {currentStep.title || 'Code Sample'} ({currentStep.codeCard.language?.toUpperCase() || 'CODE'})
                  </span>
                </div>
                <span className="sample-action-hint">
                  <FaCode style={{ marginRight: '5px' }} />
                  <span>Available in Code Examples</span>
                </span>
              </div>
            )}

            {/* Optional Illustration */}
            {currentStep.illustration && (
              <div className="text-illustration-card">
                <div className="illustration-title">
                  <FaDesktop />
                  <span>{currentStep.illustration.title || 'Architectural Diagram'}</span>
                </div>
                <div className="illustration-display-box">
                  <div className="concept-diagram-watermark">
                    <span>{currentStep.illustration.caption || 'Concept Visual Map'}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Page Navigation Controls */}
      <div className="text-page-nav-bar">
        <button 
          className="text-nav-btn prev"
          onClick={handlePrevStep}
          disabled={currentStepIdx === 0}
        >
          <FaArrowLeft />
          <span>{isCheckpointStep ? 'Review Lesson Notes' : 'Previous Page'}</span>
        </button>

        <button 
          className={`text-nav-btn next ${isCheckpointStep && !isCheckpointPassed ? 'locked' : ''}`}
          onClick={handleNextStep}
          disabled={isCheckpointStep && !isCheckpointPassed}
        >
          <span>{nextBtnLabel}</span>
          {isCheckpointStep && !isCheckpointPassed ? <FaLock /> : nextBtnIcon}
        </button>
      </div>
    </div>
  );
};

export default TextPageViewer;

