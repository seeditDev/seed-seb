import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as faceapi from 'face-api.js';
import { FaExclamationTriangle, FaTimes } from 'react-icons/fa';
import ViolationCounter from './ViolationCounter';
import '../styles/ProctoringEngine.css';
import timeService from '../services/timeService';

const DETECTION_INTERVAL_MS = 2000; // no longer used for tight loop, kept for reference
const CONSECUTIVE_DETECTIONS_REQUIRED = 2; // legacy, not used in new strategy
const VIOLATION_RESET_WINDOW_MS = 6000; // legacy, not used in new strategy
const CHECK_INTERVAL_MS = 10000; // 10 seconds between proctor checks
const SEQUENCE_GAP_MS = 3000; // 3 seconds between the 2 images in a sequence
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
  const [modelStatus, setModelStatus] = useState(globalModelsLoaded ? 'active' : 'loading');

  // Load models with global caching to prevent repeated loading
  const loadModels = useCallback(async () => {
    // Check if models are already loaded globally
    if (globalModelsLoaded) {
      modelsLoadedRef.current = true;
      setModelStatus('active');
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
          setModelStatus('active');
          return true;
        }
      }
      setModelStatus('failed');
      return false;
    }

    try {
      globalModelsLoading = true;
      setModelStatus('loading');
      
      console.log('[ProctoringEngine] Loading offline COCO-SSD and Face-API models...');
      
      await tf.ready();
      
      // Load COCO-SSD model with offline url
      const cocoPromise = cocoSsd.load({
        modelUrl: '/models/coco-ssd/model.json'
      });
      
      // Load Face-API models from public folder uri
      const faceApiPromise = Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri('/models/face-api'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models/face-api')
      ]);
      
      // 12-second timeout race
      const loadAllPromise = Promise.all([cocoPromise, faceApiPromise]);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('AI model loading timed out after 12s')), 12000)
      );
      
      const [cocoModelInstance] = await Promise.race([loadAllPromise, timeoutPromise]);
      window.cocoSsdModel = cocoModelInstance;
      
      globalModelsLoaded = true;
      modelsLoadedRef.current = true;
      globalModelsLoading = false;
      setModelStatus('active');
      console.log('[ProctoringEngine] ✓ All models loaded successfully');
      return true;
    } catch (error) {
      globalModelsLoading = false;
      modelsLoadedRef.current = false;
      setModelStatus('failed');
      console.warn('[ProctoringEngine] Model loading failed/timed out, running in Camera-Only mode:', error);
      // Clean up error state since we fall back to camera-only gracefully
      setError(null);
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

  // Helper to handle and increment violation events
  const handleViolation = useCallback((type) => {
    setViolationCount(prev => {
      const newCount = prev + 1;
      
      let msg = 'Malpractice violation detected!';
      if (type === 'no_face') {
        msg = 'Face not detected - Please stay in front of the camera';
      } else if (type === 'multiple_faces') {
        msg = 'Multiple faces / people detected in camera feed';
      } else if (type === 'cell_phone') {
        msg = 'Mobile phone detected in camera feed - Unauthorized device!';
      } else if (type === 'prohibited_object') {
        msg = 'Prohibited object (book/material) detected';
      } else if (type === 'looking_away') {
        msg = 'Suspicious activity: Student looking away from screen repeatedly';
      }

      showAlert(msg, 'warning');
      notifyViolationEvent(type, newCount);

      if (newCount >= maxViolations && onAutoSubmit) {
        console.log('[ProctoringEngine] Violation count reached limit. Auto-submitting exam...');
        showAlert('Maximum violations reached. Exam will be auto-submitted.', 'error');

        setTimeout(() => {
          onAutoSubmit({ reason: 'proctoring_violations', violationCount: newCount });
        }, 2000);
      }

      return newCount;
    });
  }, [maxViolations, onAutoSubmit, notifyViolationEvent, showAlert]);

  // Single-frame detection helper (used in scheduled sequences)
  const detectFrame = useCallback(async () => {
    if (!isTestActive || !videoRef.current || !streamRef.current) {
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

      let faceCount = 0;
      let violationType = null;
      let lookingAway = false;

      // 1. Run Face-API detection (Offline Primary Guard)
      if (window.faceApiLoaded) {
        try {
          const faceDetections = await faceapi.detectAllFaces(
            video, 
            new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 })
          ).withFaceLandmarks();

          faceCount = faceDetections.length;
          console.log('[ProctoringEngine] Face-API detections count:', faceCount);

          if (faceCount === 0) {
            violationType = 'no_face';
          } else if (faceCount > 1) {
            violationType = 'multiple_faces';
          } else {
            // Check head pose (Looking Away detection)
            const landmarks = faceDetections[0].landmarks;
            const nose = landmarks.getNose();
            const jawOutline = landmarks.getJawOutline();
            
            if (jawOutline && jawOutline.length >= 17 && nose && nose.length >= 7) {
              const leftEdge = jawOutline[0];
              const rightEdge = jawOutline[16];
              const noseTip = nose[6];
              
              const distLeft = noseTip.x - leftEdge.x;
              const distRight = rightEdge.x - noseTip.x;
              
              if (distLeft > 0 && distRight > 0) {
                const ratio = distLeft / distRight;
                console.log('[ProctoringEngine] Face ratio (nose/jaw):', ratio);
                if (ratio < 0.35 || ratio > 2.8) {
                  lookingAway = true;
                  violationType = 'looking_away';
                }
              }
            }
          }
        } catch (faceErr) {
          console.error('[ProctoringEngine] Face-API runtime error:', faceErr);
        }
      }

      // 2. Run COCO-SSD detection (Object Detection Guard)
      if (window.cocoSsdModel && window.cocoSsdLoaded) {
        try {
          const predictions = await window.cocoSsdModel.detect(video);
          console.log('[ProctoringEngine] COCO-SSD raw predictions:', predictions);
          
          const phonePredictions = predictions.filter(pred => pred.class === 'cell phone' && pred.score > 0.4);
          const bookPredictions = predictions.filter(pred => pred.class === 'book' && pred.score > 0.4);
          const personPredictions = predictions.filter(pred => pred.class === 'person' && pred.score > 0.4);
          
          if (!window.faceApiLoaded) {
            faceCount = personPredictions.length;
            if (faceCount === 0) {
              violationType = 'no_face';
            } else if (faceCount > 1) {
              violationType = 'multiple_faces';
            }
          }

          if (phonePredictions.length > 0) {
            violationType = 'cell_phone';
          } else if (bookPredictions.length > 0 && !violationType) {
            violationType = 'prohibited_object';
          }
        } catch (cocoErr) {
          console.error('[ProctoringEngine] COCO-SSD runtime error:', cocoErr);
        }
      }

      return { violationType, faceCount };
    } catch (error) {
      console.error('[ProctoringEngine] Detection error:', error);
      return { violationType: null, faceCount: 0 };
    } finally {
      detectionInProgressRef.current = false;
    }
  }, [isTestActive]);

  // Scheduled sequence: capture two frames and compare
  const runPresenceCheckSequence = useCallback(async () => {
    if (!isTestActive || sequenceInProgressRef.current) return;
    if (!videoRef.current || !streamRef.current) return;

    sequenceInProgressRef.current = true;
    try {
      const first = await detectFrame();
      
      // Handle instant critical violations immediately
      if (first.violationType && (first.violationType === 'cell_phone' || first.violationType === 'multiple_faces' || first.violationType === 'prohibited_object')) {
        handleViolation(first.violationType);
        return;
      }

      if (first.violationType) {
        notifyViolationEvent(first.violationType);
      }

      await new Promise(resolve => setTimeout(resolve, SEQUENCE_GAP_MS));

      const second = await detectFrame();
      
      // Handle instant critical violations immediately
      if (second.violationType && (second.violationType === 'cell_phone' || second.violationType === 'multiple_faces' || second.violationType === 'prohibited_object')) {
        handleViolation(second.violationType);
        return;
      }

      if (second.violationType) {
        notifyViolationEvent(second.violationType);
      }

      const noFaceFirst = first.violationType === 'no_face';
      const noFaceSecond = second.violationType === 'no_face';
      const lookingAwayFirst = first.violationType === 'looking_away';
      const lookingAwaySecond = second.violationType === 'looking_away';

      if (noFaceFirst && noFaceSecond) {
        handleViolation('no_face');
      } else if (lookingAwayFirst && lookingAwaySecond) {
        handleViolation('looking_away');
      }
    } catch (err) {
      console.error('[ProctoringEngine] Error in presence check sequence:', err);
    } finally {
      sequenceInProgressRef.current = false;
    }
  }, [detectFrame, isTestActive, notifyViolationEvent, handleViolation]);

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
        // 1. Initialize webcam first so camera view is visible immediately
        const webcamInitialized = await initializeWebcam();
        if (!webcamInitialized) {
          initializedRef.current = false;
          return;
        }

        // 2. Wait for video to be ready and play it
        if (videoRef.current) {
          const handleLoadedMetadata = async () => {
            setIsInitialized(true);
            setError(null);
            setIsWebcamBlocked(false);
            
            // 3. Load TensorFlow models in background while video is already rendering
            const modelsLoaded = await loadModels();
            if (modelsLoaded) {
              stopDetectionLoop();
              // Run presence checks
              runPresenceCheckSequence();
              detectionIntervalRef.current = setInterval(() => {
                runPresenceCheckSequence();
              }, CHECK_INTERVAL_MS);
              console.log('[ProctoringEngine] Scheduled proctoring AI checks started');
            }
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
              <span style={{ marginLeft: '4px', fontSize: '9px', opacity: 0.85, fontWeight: '700' }}>
                | {modelStatus === 'active' ? 'AI ACTIVE' : modelStatus === 'face_only' ? 'AI ACTIVE (FACE ONLY)' : modelStatus === 'objects_only' ? 'AI ACTIVE (OBJECTS)' : modelStatus === 'loading' ? 'LOADING AI...' : 'CAMERA ONLY'}
              </span>
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
