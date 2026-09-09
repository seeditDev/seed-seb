import React, { useState, useEffect, useRef } from 'react';
import { 
  FaPlay, FaPause, FaVolumeUp, FaVolumeMute, 
  FaExpand, FaCompress, FaMicrophone, FaBookOpen, 
  FaCode, FaFolder, FaChalkboardTeacher, FaCheckCircle
} from 'react-icons/fa';
import QuickCheckCard from './QuickCheckCard';
import aiClassService from '../../services/aiClassService';

const AIClassActivity = ({ 
  topic, 
  activeTab, 
  setActiveTab, 
  onCheckpointComplete, 
  checkpoints = {} 
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [currentTimeSec, setCurrentTimeSec] = useState(80); // 01:20
  const totalDurationSec = 505; // 08:25
  const [currentSegmentIdx, setCurrentSegmentIdx] = useState(0);
  const [speechBubbleText, setSpeechBubbleText] = useState(
    "Hi! Today we'll learn about Arrays. An array is a collection of elements of the same type stored in contiguous memory locations... Shall we see a simple example?"
  );

  const timerRef = useRef(null);

  const aiClassData = topic?.activities?.find(a => a.type === 'AI_CLASS');
  const segments = aiClassData?.script?.segments || [
    {
      id: 'S1',
      text: "Hi! Today we'll learn about Arrays. An array is a collection of elements of the same type stored in contiguous memory locations... Shall we see a simple example?"
    },
    {
      id: 'S2',
      text: "Because all elements are stored right next to each other, the computer calculates the memory location of index i in constant O(1) time using: Base Address plus index times element size."
    },
    {
      id: 'S3',
      text: "Now let's test your comprehension before we move to code."
    }
  ];

  useEffect(() => {
    return () => {
      aiClassService.cancel();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleTogglePlay = () => {
    if (isPlaying) {
      aiClassService.pause();
      setIsPlaying(false);
      if (timerRef.current) clearInterval(timerRef.current);
    } else {
      const textToSpeak = segments[currentSegmentIdx]?.text || speechBubbleText;
      aiClassService.speakText(textToSpeak, {
        speed: playbackSpeed,
        onStart: () => setIsPlaying(true),
        onEnd: () => {
          setIsPlaying(false);
          if (timerRef.current) clearInterval(timerRef.current);
          onCheckpointComplete?.('watchAiClass');
        }
      });
      setIsPlaying(true);

      timerRef.current = setInterval(() => {
        setCurrentTimeSec(prev => {
          if (prev >= totalDurationSec) {
            clearInterval(timerRef.current);
            return totalDurationSec;
          }
          return prev + 1;
        });
      }, 1000 / playbackSpeed);
    }
  };

  const handleNextSegment = () => {
    const nextIdx = (currentSegmentIdx + 1) % segments.length;
    setCurrentSegmentIdx(nextIdx);
    const text = segments[nextIdx].text;
    setSpeechBubbleText(text);
    if (isPlaying) {
      aiClassService.speakText(text, {
        speed: playbackSpeed,
        onEnd: () => {
          setIsPlaying(false);
          onCheckpointComplete?.('watchAiClass');
        }
      });
    }
  };

  const handleSpeedCycle = () => {
    const speeds = [1.0, 1.25, 1.5, 0.85];
    const nextSpeed = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
    setPlaybackSpeed(nextSpeed);
    if (isPlaying) {
      aiClassService.cancel();
      aiClassService.speakText(speechBubbleText, { speed: nextSpeed });
    }
  };

  const progressPct = Math.min(100, Math.round((currentTimeSec / totalDurationSec) * 100));

  return (
    <div className="ai-class-stage">

      {/* Video & AI Teacher Stage */}
      <div className="ai-video-player-container">
        <div className="ai-video-canvas">
          <img 
            src="/images/ai_instructor.jpg" 
            alt="AI Instructor" 
            className="ai-instructor-img"
            onError={(e) => {
              // Fallback placeholder if image not loaded
              e.target.src = "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&q=80";
            }}
          />

          {/* Slogan pill in top right */}
          <div className="ai-player-brand-slogan">
            <span>Practice</span>
            <span>Solve</span>
            <span>Improve</span>
            <span className="accent-word">Grow</span>
          </div>

          {/* Interactive Speech Bubble */}
          <div className="ai-speech-bubble" onClick={handleNextSegment} title="Click to hear next teaching point">
            <p className="ai-bubble-text">{speechBubbleText}</p>
            <div className="ai-bubble-footer">
              <span className="ai-bubble-badge">SEED-IT AI Instructor</span>
              <span className="ai-bubble-next-hint">Click bubble for next segment &rarr;</span>
            </div>
          </div>

          {/* Central Voice Quick Response Button */}
          <div className="ai-player-central-overlay">
            <button 
              className="ai-player-voice-btn"
              onClick={() => {
                document.querySelector('.quick-check-mic-btn')?.click();
              }}
              title="Speak your answer"
            >
              <FaMicrophone />
              <span>Click to speak</span>
            </button>
          </div>
        </div>

        {/* Video Player Control Bar */}
        <div className="ai-player-controls-bar">
          {/* Progress bar */}
          <div 
            className="ai-player-timeline"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              setCurrentTimeSec(Math.round(pct * totalDurationSec));
            }}
          >
            <div className="ai-timeline-fill" style={{ width: `${progressPct}%` }} />
          </div>

          <div className="ai-controls-row">
            <div className="ai-controls-left">
              <button className="ai-ctrl-icon-btn" onClick={handleTogglePlay} title={isPlaying ? "Pause" : "Play"}>
                {isPlaying ? <FaPause /> : <FaPlay />}
              </button>
              <button className="ai-ctrl-icon-btn" title="Volume">
                <FaVolumeUp />
              </button>
              <span className="ai-time-display">
                {formatTime(currentTimeSec)} <span className="ai-time-sep">/</span> {formatTime(totalDurationSec)}
              </span>
            </div>

            <div className="ai-controls-right">
              <button className="ai-speed-pill-btn" onClick={handleSpeedCycle} title="Playback Speed">
                {playbackSpeed}x
              </button>
              <button className="ai-ctrl-icon-btn" title="Full Screen">
                <FaExpand />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Check Card Component */}
      <QuickCheckCard 
        quickCheck={aiClassData?.quickCheck}
        onPass={() => onCheckpointComplete?.('quickCheck')}
        isPassed={checkpoints?.quickCheck}
      />
    </div>
  );
};

export default AIClassActivity;
