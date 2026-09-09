import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  FaPlay, FaPause, FaVolumeUp, FaVolumeMute, 
  FaExpand, FaCompress, FaLock, FaCheckCircle, 
  FaForward, FaBackward, FaShieldAlt 
} from 'react-icons/fa';
import VideoCheckpointOverlay from './VideoCheckpointOverlay';
import { toast } from 'sonner';

const SAMPLE_FALLBACK_VIDEO = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

const VideoCheckpointPlayer = ({ 
  topic, 
  user, 
  course, 
  activeModule, 
  topicProgress,
  onCheckpointPassed, 
  onVideoComplete 
}) => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);

  const videoUrl = topic?.videoUrl || topic?.lessonContent?.videoUrl || SAMPLE_FALLBACK_VIDEO;

  // Collect checkpoints from topic definition
  const checkpoints = useMemo(() => {
    const list = topic?.checkpoints || topic?.lessonContent?.midVideoCheckpoints || [];
    return [...list].sort((a, b) => (a.timeSeconds || a.pauseAtTimestampSec || 0) - (b.timeSeconds || b.pauseAtTimestampSec || 0)).map((cp, idx) => ({
      checkpointId: cp.checkpointId || cp.id || `CP_${idx + 1}`,
      timeSeconds: cp.timeSeconds || cp.pauseAtTimestampSec || 120,
      type: cp.type || 'MCQ',
      question: cp.question || 'Quick Check Question',
      options: cp.options || [],
      correctAnswer: cp.correctAnswer || 'A',
      explanation: cp.explanation || '',
      required: cp.required !== false,
      pauseVideo: cp.pauseVideo !== false,
      blockSeek: cp.blockSeek !== false
    }));
  }, [topic]);

  const [passedCheckpoints, setPassedCheckpoints] = useState(() => {
    return topicProgress?.passedCheckpoints || [];
  });

  // Calculate current maximum allowed forward scrub time
  const currentAllowedTime = useMemo(() => {
    for (const cp of checkpoints) {
      if (cp.required && !passedCheckpoints.includes(cp.checkpointId)) {
        return cp.timeSeconds;
      }
    }
    return 999999; // All checkpoints passed, full video unlocked!
  }, [checkpoints, passedCheckpoints]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(topic?.duration || 600);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [activeCheckpoint, setActiveCheckpoint] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (topicProgress?.passedCheckpoints) {
      setPassedCheckpoints(topicProgress.passedCheckpoints);
    }
  }, [topicProgress]);

  // Video Time Update Monitor (Checkpoint Trigger)
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const curr = videoRef.current.currentTime;
    setCurrentTime(curr);

    // Check if we hit an unpassed checkpoint
    for (const cp of checkpoints) {
      if (cp.required && !passedCheckpoints.includes(cp.checkpointId)) {
        if (curr >= cp.timeSeconds) {
          videoRef.current.pause();
          videoRef.current.currentTime = cp.timeSeconds;
          setIsPlaying(false);
          setActiveCheckpoint(cp);
          break;
        }
      }
    }
  };

  // Controlled Seeking: Block scrubbing forward past currentAllowedTime
  const handleSeeking = () => {
    if (!videoRef.current) return;
    if (videoRef.current.currentTime > currentAllowedTime + 1) {
      videoRef.current.currentTime = currentAllowedTime;
      toast.warning('Forward scrubbing locked', {
        description: 'Complete the upcoming checkpoint to unlock forward video content.'
      });
    }
  };

  const handleTogglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      if (activeCheckpoint) return; // Must answer checkpoint first
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSeekSlider = (e) => {
    const target = parseFloat(e.target.value);
    if (target > currentAllowedTime + 1) {
      toast.warning('Forward scrubbing locked', {
        description: 'Complete the checkpoint question first.'
      });
      if (videoRef.current) videoRef.current.currentTime = currentAllowedTime;
      return;
    }
    if (videoRef.current) {
      videoRef.current.currentTime = target;
      setCurrentTime(target);
    }
  };

  const handleSpeedCycle = () => {
    const speeds = [1.0, 1.25, 1.5, 2.0, 0.75];
    const next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
    setPlaybackSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  };

  const handleToggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  const handleCheckpointPass = () => {
    if (!activeCheckpoint) return;
    const cpId = activeCheckpoint.checkpointId;
    const updated = [...passedCheckpoints, cpId];
    setPassedCheckpoints(updated);
    setActiveCheckpoint(null);

    // Calculate next allowed time
    let nextAllowed = duration;
    for (const cp of checkpoints) {
      if (cp.required && !updated.includes(cp.checkpointId)) {
        nextAllowed = cp.timeSeconds;
        break;
      }
    }

    onCheckpointPassed?.(cpId, nextAllowed);

    // Auto-resume playback
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.play();
        setIsPlaying(true);
      }
    }, 400);
  };

  const formatTime = (secs) => {
    if (isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="video-delivery-container" ref={containerRef}>
      <div className="video-player-canvas">
        <video
          ref={videoRef}
          src={videoUrl}
          className="main-instructor-video"
          onTimeUpdate={handleTimeUpdate}
          onSeeking={handleSeeking}
          onSeeked={handleSeeking}
          onLoadedMetadata={() => {
            if (videoRef.current) setDuration(videoRef.current.duration || duration);
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            onVideoComplete?.();
          }}
          playsInline
        />

        {/* Checkpoint Markers on Timeline */}
        <div className="video-checkpoint-pins-layer">
          {checkpoints.map((cp) => {
            const pct = duration > 0 ? (cp.timeSeconds / duration) * 100 : 0;
            const isPassed = passedCheckpoints.includes(cp.checkpointId);
            return (
              <div
                key={cp.checkpointId}
                className={`checkpoint-timeline-pin ${isPassed ? 'passed' : 'locked'}`}
                style={{ left: `${pct}%` }}
                title={`Checkpoint at ${formatTime(cp.timeSeconds)}: ${isPassed ? 'Passed' : 'Locked'}`}
              >
                {isPassed ? <FaCheckCircle /> : <FaLock />}
              </div>
            );
          })}
        </div>

        {/* Mid-Video Active Checkpoint Overlay */}
        {activeCheckpoint && (
          <VideoCheckpointOverlay
            checkpoint={activeCheckpoint}
            onPass={handleCheckpointPass}
          />
        )}
      </div>

      {/* Video Control Bar */}
      <div className="video-control-bar">
        {/* Scrubber Track */}
        <div className="video-progress-wrapper">
          <input
            type="range"
            min="0"
            max={duration || 100}
            step="0.5"
            value={currentTime}
            onChange={handleSeekSlider}
            className="video-seek-slider"
          />
          <div 
            className="seek-allowed-range" 
            style={{ width: `${Math.min(100, (currentAllowedTime / (duration || 1)) * 100)}%` }} 
            title="Unlocked content range"
          />
        </div>

        {/* Control Buttons */}
        <div className="video-controls-row">
          <div className="ctrl-left">
            <button className="video-btn play-btn" onClick={handleTogglePlay} title={isPlaying ? "Pause" : "Play"}>
              {isPlaying ? <FaPause /> : <FaPlay />}
            </button>
            <button className="video-btn mute-btn" onClick={handleToggleMute} title="Volume">
              {isMuted ? <FaVolumeMute /> : <FaVolumeUp />}
            </button>
            <span className="video-timestamp">
              {formatTime(currentTime)} <span className="ts-sep">/</span> {formatTime(duration)}
            </span>
          </div>

          <div className="ctrl-right">
            {currentAllowedTime < duration && (
              <span className="controlled-seek-badge">
                <FaShieldAlt /> Controlled Seeking Active
              </span>
            )}
            <button className="speed-badge-btn" onClick={handleSpeedCycle} title="Playback Speed">
              {playbackSpeed}x
            </button>
            <button className="video-btn fs-btn" onClick={handleToggleFullscreen} title="Toggle Fullscreen">
              {isFullscreen ? <FaCompress /> : <FaExpand />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoCheckpointPlayer;
