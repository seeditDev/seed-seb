import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { FaExclamationTriangle, FaTimes } from 'react-icons/fa';
import ViolationCounter from './ViolationCounter';
import '../styles/ProctoringEngine.css';
import timeService from '../services/timeService';

const DETECTION_INTERVAL_MS = 2000; // no longer used for tight loop, kept for reference
const CONSECUTIVE_DETECTIONS_REQUIRED = 2; // legacy, not used in new strategy
const VIOLATION_RESET_WINDOW_MS = 6000; // legacy, not used in new strategy
const CHECK_INTERVAL_MS = 40000; // 2 minutes between proctor checks
const SEQUENCE_GAP_MS = 10000; // 10 seconds between the 2 images in a sequence
const MAX_VIOLATIONS = 5;

// Global model loading state to prevent multiple loads
let globalModelsLoaded = false;
let globalModelsLoading = false;

const ProctoringEngine = ({ 
  studentID, 
  testID, 
  onAutoSubmit,
  isTestActive = true,
  onViolationUpdate,
  maxViolations = 5
}) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectionIntervalRef = useRef(null);
  const modelsLoadedRef = useRef(false);
  const initializedRef = useRef(false);
  const retryCountRef = useRef(0);
  const detectionInProgressRef = useRef(false);
  const sequenceInProgressRef = useRef(false);
  
  const [violationCount, setViolationCount] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [isWebcamBlocked, setIsWebcamBlocked] = useState(false);

  // Load models with global caching to prevent repeated loading
  const loadModels = useCallback(async () => {
    // Check if models are already loaded globally
    if (globalModelsLoaded) {
      modelsLoadedRef.current = true;
      console.log('[ProctoringEngine] Using already loaded models');
      return true;
    }

    // If models are being loaded, wait for them
    if (globalModelsLoading) {
      console.log('[ProctoringEngine] Models are being loaded, waiting...');
      // Wait up to 30 seconds for models to load
      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (globalModelsLoaded) {
          modelsLoadedRef.current = true;
          return true;
        }
      }
      return false;
    }

    try {
      globalModelsLoading = true;
      
      console.log('[ProctoringEngine] Loading COCO-SSD models (first time only)...');
      
      await tf.ready();
      window.cocoSsdModel = await cocoSsd.load();
      
      globalModelsLoaded = true;
      modelsLoadedRef.current = true;
      globalModelsLoading = false;
      console.log('[ProctoringEngine] ✓ Models loaded successfully');
      return true;
    } catch (error) {
      globalModelsLoading = false;
      console.error('[ProctoringEngine] Error loading models:', error);
      setError(`Failed to load AI models: ${error.message}. Please check your internet connection or refresh the page.`);
      return false;
    }
  }, []);

  // Show alert toast
  const showAlert = useCallback((message, type = 'warning') => {
    const alert = {
      id: timeService.now(),
      message,
      type
    };
    
    setAlerts(prev => [...prev, alert]);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      setAlerts(prev => prev.filter(a => a.id !== alert.id));
    }, 3000);
  }, []);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.onended = null;
        track.stop();
      });
      streamRef.current = null;
    }

    if (window.cameraStream && window.cameraStream.active) {
      window.cameraStream.getTracks().forEach(track => track.stop());
      window.cameraStream = null;
    }
  }, []);

  const stopDetectionLoop = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
  }, []);

  const notifyViolationEvent = useCallback(
    (violationType, countOverride) => {
      if (!violationType || !onViolationUpdate) return;
      const payloadCount =
        typeof countOverride === 'number' ? countOverride : violationCount;
      onViolationUpdate({
        violationCount: payloadCount,
        violationType,
        timestamp: timeService.getNow().toISOString()
      });
    },
    [onViolationUpdate, violationCount]
  );

  // Initialize webcam - with duplicate prevention and reuse existing stream
  const initializeWebcam = useCallback(async (force = false) => {
    if (force) {
      console.log('[ProctoringEngine] Forcing webcam reinitialization...');
      stopDetectionLoop();
      cleanupStream();
    }

    // Check if we already have an active stream - reuse it instead of requesting again
    if (!force && streamRef.current && streamRef.current.active) {
      console.log('[ProctoringEngine] Webcam already initialized, reusing existing stream...');
      if (videoRef.current && !videoRef.current.srcObject) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.muted = true;
        videoRef.current.play().catch(() => {});
      }
      return true;
    }

    const attachTrackHandlers = (stream) => {
      stream.getTracks().forEach(track => {
        track.onended = () => {
          console.warn('[ProctoringEngine] Camera track ended. Attempting to reconnect...');
          setIsInitialized(false);
          setError('Camera disconnected. Attempting to reconnect...');
          setIsWebcamBlocked(true);
          retryCountRef.current = 0;
          initializeWebcam(true);
        };
      });
    };

    // Check if there's a global stream from instructions page
    if (window.cameraStream && window.cameraStream.active) {
      streamRef.current = window.cameraStream;
      attachTrackHandlers(window.cameraStream);
      if (videoRef.current) {
        videoRef.current.srcObject = window.cameraStream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.muted = true;
        videoRef.current.play().catch(() => {});
      }
      retryCountRef.current = 0;
      setIsWebcamBlocked(false);
      setError(null);
      return true;
    }

    try {
      console.log('[ProctoringEngine] Requesting webcam access...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });

      // Store stream globally so it can be reused
      window.cameraStream = stream;
      attachTrackHandlers(stream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.muted = true;
        videoRef.current.play().catch(() => {});
        streamRef.current = stream;
        retryCountRef.current = 0;
        setIsWebcamBlocked(false);
        setError(null);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[ProctoringEngine] Webcam access error:', error);
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setError('Webcam access denied. Please allow camera access to continue.');
        setIsWebcamBlocked(true);
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setError('No webcam found. Please connect a webcam to continue.');
        setIsWebcamBlocked(true);
      } else if (error.name === 'NotReadableError') {
        setError('Unable to start webcam. It may be in use by another application. Retrying...');
        setIsWebcamBlocked(true);
        if (retryCountRef.current < 3) {
          retryCountRef.current += 1;
          setTimeout(() => {
            initializeWebcam(force);
          }, 1500);
        }
      } else {
        setError('Failed to access webcam. Please check your camera settings.');
        setIsWebcamBlocked(true);
      }
      
      return false;
    }
  }, [cleanupStream, stopDetectionLoop]);

  // Single-frame detection helper (used in scheduled sequences)
  const detectFrame = useCallback(async () => {
    if (!isTestActive || !modelsLoadedRef.current || !videoRef.current || !streamRef.current || !window.cocoSsdModel) {
      return { violationType: null, faceCount: 0 };
    }
    if (detectionInProgressRef.current) {
      return { violationType: null, faceCount: 0 };
    }

    detectionInProgressRef.current = true;

    try {
      const video = videoRef.current;

      if (video.readyState < 2 || video.paused) {
        try {
          await video.play();
        } catch (_) {}
        if (video.readyState < 2) {
          return { violationType: null, faceCount: 0 };
        }
      }

      const predictions = await window.cocoSsdModel.detect(video);
      const personPredictions = predictions.filter(pred => pred.class === 'person' && pred.score > 0.4);
      
      const faceCount = personPredictions.length;
      let violationType = null;

      if (faceCount === 0) {
        violationType = 'no_face';
      } else if (faceCount > 1) {
        violationType = 'multiple_faces';
      }

      return { violationType, faceCount };
    } catch (error) {
      console.error('[ProctoringEngine] Detection error:', error);
      return { violationType: null, faceCount: 0 };
    } finally {
      detectionInProgressRef.current = false;
    }
  }, [isTestActive]);

  // Scheduled sequence: every 2 minutes, capture two frames 10s apart and compare
  const runPresenceCheckSequence = useCallback(async () => {
    if (!isTestActive || sequenceInProgressRef.current) return;
    if (!modelsLoadedRef.current || !videoRef.current || !streamRef.current) return;

    sequenceInProgressRef.current = true;
    try {
      const first = await detectFrame();
      if (first.violationType) {
        notifyViolationEvent(first.violationType);
      }

      await new Promise(resolve => setTimeout(resolve, SEQUENCE_GAP_MS));

      const second = await detectFrame();
      if (second.violationType) {
        notifyViolationEvent(second.violationType);
      }

      const noFaceFirst = first.violationType === 'no_face';
      const noFaceSecond = second.violationType === 'no_face';

      if (noFaceFirst && noFaceSecond) {
        setViolationCount(prev => {
          const newCount = prev + 1;

          showAlert('Person not detected in repeated checks - Please stay in front of camera', 'warning');
          notifyViolationEvent('no_face', newCount);

          if (newCount >= maxViolations && onAutoSubmit) {
            console.log('[ProctoringEngine] Violation count reached limit. Auto-submitting exam...');
            showAlert('Maximum violations reached. Exam will be auto-submitted.', 'error');

            setTimeout(() => {
              onAutoSubmit({ reason: 'proctoring_violations', violationCount: newCount });
            }, 2000);
          }

          return newCount;
        });
      }
    } finally {
      sequenceInProgressRef.current = false;
    }
  }, [detectFrame, isTestActive, notifyViolationEvent, onAutoSubmit, showAlert]);

  // Initialize proctoring system - with duplicate prevention
  useEffect(() => {
    if (!isTestActive) {
      // Stop camera and cleanup when test is not active
      console.log('[ProctoringEngine] Test not active, cleaning up...');
      
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
          console.log('[ProctoringEngine] Stopped camera track');
        });
        streamRef.current = null;
      }
      
      // Also stop global stream if it exists
      if (window.cameraStream && window.cameraStream.active) {
        window.cameraStream.getTracks().forEach(track => {
          track.stop();
          console.log('[ProctoringEngine] Stopped global camera stream');
        });
        window.cameraStream = null;
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      
      setIsInitialized(false);
      initializedRef.current = false;
      return;
    }

    if (initializedRef.current) {
      console.log('[ProctoringEngine] Already initialized, skipping...');
      return;
    }

    const init = async () => {
      // Mark as initializing to prevent duplicates
      initializedRef.current = true;
      
      try {
        // Load models first
        const modelsLoaded = await loadModels();
        if (!modelsLoaded) {
          initializedRef.current = false;
          return;
        }

        // Initialize webcam
        const webcamInitialized = await initializeWebcam();
        if (!webcamInitialized) {
          initializedRef.current = false;
          return;
        }

        // Wait for video to be ready
        if (videoRef.current) {
          const handleLoadedMetadata = () => {
            setIsInitialized(true);
            setError(null);
            setIsWebcamBlocked(false);
            
            stopDetectionLoop();
            // Run one check shortly after start, then every CHECK_INTERVAL_MS (2 minutes)
            runPresenceCheckSequence();
            detectionIntervalRef.current = setInterval(() => {
              runPresenceCheckSequence();
            }, CHECK_INTERVAL_MS);

            console.log('[ProctoringEngine] Scheduled proctoring checks started (every 2 minutes)');
          };

          if (videoRef.current.readyState >= 2) {
            // Video already loaded
            handleLoadedMetadata();
          } else {
            videoRef.current.onloadedmetadata = handleLoadedMetadata;
          }
        }
      } catch (error) {
        console.error('[ProctoringEngine] Initialization error:', error);
        setError('Failed to initialize proctoring system.');
        initializedRef.current = false;
      }
    };

    init();

    // Cleanup
    return () => {
      console.log('[ProctoringEngine] Cleanup running...');
      
      stopDetectionLoop();
      
      cleanupStream();
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      
      initializedRef.current = false;
    };
  }, [cleanupStream, isTestActive, loadModels, initializeWebcam, runPresenceCheckSequence, stopDetectionLoop]);

  // Restore violation count from localStorage on mount
  useEffect(() => {
    if (studentID && testID) {
      const key = `proctor_violations_${studentID}_${testID}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const count = parseInt(saved, 10) || 0;
          setViolationCount(count);
        } catch (error) {
          console.error('[ProctoringEngine] Error restoring violation count:', error);
        }
      }
    }
  }, [studentID, testID]);

  // Save violation count to localStorage
  useEffect(() => {
    if (studentID && testID) {
      const key = `proctor_violations_${studentID}_${testID}`;
      localStorage.setItem(key, violationCount.toString());
    }
  }, [studentID, testID, violationCount]);

  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) {
      return;
    }

    const handleDeviceChange = () => {
      if (!isTestActive) return;
      console.log('[ProctoringEngine] Media device change detected. Re-initializing camera...');
      retryCountRef.current = 0;
      initializeWebcam(true);
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [initializeWebcam, isTestActive]);

  // Block exam if webcam is not available
  if (isWebcamBlocked) {
    return (
      <div className="proctoring-blocked">
        <div className="blocked-content">
          <FaExclamationTriangle className="blocked-icon" />
          <h3>Webcam Required</h3>
          <p>{error || 'Webcam access is required to take this exam.'}</p>
          <p className="blocked-instructions">
            Please allow camera access and refresh the page to continue.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="proctoring-engine">
      {/* Top Section: Violation Counter and Camera Preview - Side by side */}
      <div className="proctoring-top-section">
        <div className="proctoring-top-row">
          <ViolationCounter count={violationCount} maxViolations={maxViolations} />
          
          {/* Mini Camera View - Next to violation counter */}
          <div className="mini-camera-view">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="mini-camera-video"
            />
            {/* Live recording indicator */}
            <div className="camera-label">
              <span className="camera-rec-dot" /> LIVE
            </div>
            {/* Violation count badge overlaid on camera */}
            <div className={`camera-violation-badge ${violationCount === 0 ? 'badge-safe' : violationCount >= Math.round(maxViolations * 0.8) ? 'badge-critical' : 'badge-warn'}`}>
              ⚠ {violationCount}/{maxViolations}
            </div>
          </div>
        </div>
      </div>

      {/* Alert Toasts */}
      <div className="proctor-alerts">
        {alerts.map(alert => (
          <div key={alert.id} className={`proctor-alert proctor-alert-${alert.type}`}>
            <FaExclamationTriangle />
            <span>{alert.message}</span>
            <button 
              className="alert-close"
              onClick={() => setAlerts(prev => prev.filter(a => a.id !== alert.id))}
            >
              <FaTimes />
            </button>
          </div>
        ))}
      </div>

      {/* Loading State */}
      {!isInitialized && (
        <div className="proctor-loading">
          <p>Initializing proctoring system...</p>
        </div>
      )}

      {/* Error State */}
      {error && !isWebcamBlocked && (
        <div className="proctor-error">
          <FaExclamationTriangle />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default ProctoringEngine;
