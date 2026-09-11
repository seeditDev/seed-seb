import React, { useState, useEffect } from 'react';
import { FaVideo, FaBookOpen, FaLayerGroup, FaDatabase } from 'react-icons/fa';
import VideoCheckpointPlayer from './VideoCheckpointPlayer';
import TextPageViewer from './TextPageViewer';
import LessonMarkdownRenderer from './LessonMarkdownRenderer';
import SQLInteractiveStage from '../activities/SQLInteractiveStage';
import learningEngineService from '../../services/learningEngineService';

const LessonDeliveryStage = ({
  topic,
  user,
  course,
  activeModule,
  topicProgress,
  onCheckpointComplete,
  onTopicComplete
}) => {
  const uid = user?.uid || 'demo-student';

  // Determine available modes
  const isSqlExercise = Boolean(topic?.sqlExercise || topic?.mode === 'SQL_INTERACTIVE');
  const hasVideo = Boolean(topic?.videoUrl || topic?.lessonContent?.videoUrl);
  const hasText = Boolean(topic?.pages?.length > 0 || topic?.lessonContent?.textAndVisuals || topic?.description);
  
  // Default delivery mode:
  // If author explicitly configured topic.mode, use that.
  // If both are available, default to 'VIDEO' with toggle.
  const authorMode = topic?.mode || (hasVideo && hasText ? 'VIDEO_TEXT' : (hasVideo ? 'VIDEO' : 'TEXT'));
  
  const [activeDeliveryMode, setActiveDeliveryMode] = useState(() => {
    if (authorMode === 'TEXT') return 'TEXT';
    return 'VIDEO';
  });

  useEffect(() => {
    if (authorMode === 'TEXT') setActiveDeliveryMode('TEXT');
    else if (authorMode === 'VIDEO') setActiveDeliveryMode('VIDEO');
  }, [authorMode, topic?.topicId]);

  const handleCheckpointPassed = async (checkpointId, nextAllowedTime = 0) => {
    await learningEngineService.passTopicCheckpoint(
      uid,
      course,
      activeModule?.moduleId,
      topic?.topicId,
      checkpointId,
      nextAllowedTime
    );
    onCheckpointComplete?.(checkpointId);
  };

  const handleTextPageChange = async (pageIdx) => {
    await learningEngineService.updateTextPageProgress(
      uid,
      course,
      activeModule?.moduleId,
      topic?.topicId,
      pageIdx
    );
  };

  const showModeSwitcher = authorMode === 'VIDEO_TEXT' || (hasVideo && hasText);

  if (isSqlExercise && topic?.sqlExercise) {
    return (
      <div className="lesson-delivery-stage sql-delivery-mode">
        {topic && (
          <div className="sql-topic-intro-card">
            <h3 className="sql-topic-intro-title">
              {topic.title}
            </h3>
            {topic.description && (
              <p className="sql-topic-intro-desc">
                {topic.description}
              </p>
            )}
            {topic.lessonMarkdown && (
              <div className="sql-topic-intro-markdown">
                <LessonMarkdownRenderer content={topic.lessonMarkdown} />
              </div>
            )}
            {topic.lessonContent?.textAndVisuals?.content && (
              <div className="sql-topic-intro-markdown">
                <LessonMarkdownRenderer content={topic.lessonContent.textAndVisuals.content} />
              </div>
            )}
          </div>
        )}
        <SQLInteractiveStage
          exercise={topic.sqlExercise}
          onComplete={() => {
            handleCheckpointPassed('sqlExercisePassed', 0);
            onCheckpointComplete?.('sqlExercisePassed');
            onTopicComplete?.();
          }}
          onNextLesson={() => {
            onTopicComplete?.();
          }}
        />
      </div>
    );
  }

  return (
    <div className="lesson-delivery-stage">
      {/* Optional Mode Switcher Header */}
      {showModeSwitcher && (
        <div className="learning-mode-switcher-bar">
          <div className="mode-switcher-hint">
            <FaLayerGroup />
            <span>Learning Presentation Mode:</span>
          </div>

          <div className="mode-toggle-pills">
            <button
              className={`mode-pill-btn ${activeDeliveryMode === 'VIDEO' ? 'active' : ''}`}
              onClick={() => setActiveDeliveryMode('VIDEO')}
              title="Watch real instructor video lesson"
            >
              <FaVideo />
              <span>Video Mode</span>
            </button>

            <button
              className={`mode-pill-btn ${activeDeliveryMode === 'TEXT' ? 'active' : ''}`}
              onClick={() => setActiveDeliveryMode('TEXT')}
              title="Read structured page-by-page text lesson"
            >
              <FaBookOpen />
              <span>Text Mode</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Delivery Area */}
      <div className="delivery-view-mount">
        {activeDeliveryMode === 'VIDEO' ? (
          <VideoCheckpointPlayer
            topic={topic}
            user={user}
            course={course}
            activeModule={activeModule}
            topicProgress={topicProgress}
            onCheckpointPassed={handleCheckpointPassed}
            onVideoComplete={() => {
              learningEngineService.updateTopicCheckpoint(
                uid,
                course,
                activeModule?.moduleId,
                topic?.topicId,
                'videoWatched',
                true
              );
              onCheckpointComplete?.('videoWatched');
            }}
          />
        ) : (
          <TextPageViewer
            topic={topic}
            user={user}
            course={course}
            activeModule={activeModule}
            topicProgress={topicProgress}
            onCheckpointPassed={(cpId) => handleCheckpointPassed(cpId, 0)}
            onPageChange={handleTextPageChange}
            onTopicComplete={() => {
              onTopicComplete?.();
            }}
          />
        )}
      </div>
    </div>
  );
};

export default LessonDeliveryStage;
