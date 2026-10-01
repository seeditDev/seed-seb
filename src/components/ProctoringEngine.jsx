import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as faceapi from 'face-api.js';
import * as tf from '@tensorflow/tfjs';
import { FaExclamationTriangle, FaTimes } from 'react-icons/fa';
import '../styles/ProctoringEngine.css';
import timeService from '../services/timeService';
import { recordViolation, getViolations } from '../utils/proctorCache';

// Helper to resolve models directory path under both file:// and http/https protocols
const getModelsPath = (subPath) => {
  if (window.location.protocol === 'file:') {
    const path = window.location.pathname;
    const buildIndex = path.indexOf('/build/');
    if (buildIndex !== -1) {
      const basePath = path.substring(0, buildIndex + 7); // includes "/build/"
      return `file://${basePath}${subPath}`;
    }
    const lastSlash = path.lastIndexOf('/');
    if (lastSlash !== -1) {
      const basePath = path.substring(0, lastSlash + 1);
      return `file://${basePath}${subPath}`;
    }
  }
  return `/${subPath}`;
};

// Dream AI Proctoring Pipeline Timing Configuration
const TIER_1_INTERVAL_MS = 1000;       // Tier 1: Face Presence & 3D Head Pose (every 1s)
const TIER_2_INTERVAL_MS = 3000;       // Tier 2: YOLOv8 Unauthorized Object Detection (every 3s)
const TIER_3_INTERVAL_MS = 30000;      // Tier 3: Biometric Identity Verification (every 30s)
const STARTUP_GRACE_PERIOD_MS = 2500;  // 2.5s grace period upon test start / section switch
const VIOLATION_COOLDOWN_MS = 3000;    // 3s cooldown between same-type violations to prevent spamming
const MAX_VIOLATIONS = 5;

// Global model loading state to prevent multiple loads
let globalModelsLoaded = false;
let globalModelsLoading = false;

// CPU-based Non-Maximum Suppression (NMS) helper
const calculateIoU = (box1, box2) => {
  const [x1_1, y1_1, x2_1, y2_1] = box1;
  const [x1_2, y1_2, x2_2, y2_2] = box2;
  
  const xMin = Math.max(x1_1, x1_2);
  const yMin = Math.max(y1_1, y1_2);
  const xMax = Math.min(x2_1, x2_2);
  const yMax = Math.min(y2_1, y2_2);
  
  const intersectionArea = Math.max(0, xMax - xMin) * Math.max(0, yMax - yMin);
  const area1 = (x2_1 - x1_1) * (y2_1 - y1_1);
  const area2 = (x2_2 - x1_2) * (y2_2 - y1_2);
  const unionArea = area1 + area2 - intersectionArea;
  
  if (unionArea === 0) return 0;
  return intersectionArea / unionArea;
};

const cpuNMS = (candidates, iouThreshold = 0.5) => {
  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score);
  
  const selected = [];
  for (const candidate of candidates) {
    let keep = true;
    for (const active of selected) {
      if (candidate.classId === active.classId) {
        const iou = calculateIoU(candidate.box, active.box);
        if (iou > iouThreshold) {
          keep = false;
          break;
        }
      }
    }
    if (keep) {
      selected.push(candidate);
    }
  }
  return selected;
};

// Helper to execute YOLOv8 model inference and post-process on the GPU with CPU-NMS
const runYolov8Inference = async (videoElement, model) => {
  let result = { personCount: 0, phoneDetected: false, bookDetected: false };
  
  // Helper to verify if object is a tf.Tensor without using instanceof (obfuscation safe)
  const isTensor = (obj) => {
    return obj && typeof obj.reshape === 'function' && typeof obj.dispose === 'function';
  };

  // 1. Preprocess the image and get predictions from the model
  const tensors = tf.tidy(() => {
    const img = tf.browser.fromPixels(videoElement);
    const resized = tf.image.resizeBilinear(img, [640, 640]);
    const normalized = resized.div(255.0);
    const input = normalized.expandDims(0); // Shape [1, 640, 640, 3]
    
    // Fallback between execute and predict to prevent function errors on compiled graph models
    let output;
    if (typeof model.execute === 'function') {
      output = model.execute(input);
    } else if (typeof model.predict === 'function') {
      output = model.predict(input);
    } else {
      throw new Error("Model has no execute or predict methods");
    }
    
    // Safely unpack output if it's an array or dictionary
    let outputTensor = output;
    if (Array.isArray(output)) {
      outputTensor = output[0];
    } else if (output && !isTensor(output)) {
      const keys = Object.keys(output);
      if (keys.length > 0) {
        outputTensor = output[keys[0]];
      }
    }
    
    if (!outputTensor || !isTensor(outputTensor)) {
      throw new Error("Failed to retrieve a valid tensor output from YOLOv8 model");
    }
    
    const shape = outputTensor.shape;
    let transposed;
    
    if (shape.length === 3) {
      const [, d1, d2] = shape;
      if (d1 === 84 && d2 === 8400) {
        // Format [1, 84, 8400]
        transposed = outputTensor.reshape([84, 8400]).transpose([1, 0]);
      } else if (d1 === 8400 && d2 === 84) {
        // Format [1, 8400, 84] (Already transposed)
        transposed = outputTensor.reshape([8400, 84]);
      } else {
        transposed = outputTensor.reshape([d1, d2]);
        if (d1 < d2) {
          transposed = transposed.transpose([1, 0]);
        }
      }
    } else if (shape.length === 2) {
      const [d1, d2] = shape;
      transposed = outputTensor;
      if (d1 === 84 && d2 === 8400) {
        transposed = transposed.transpose([1, 0]);
      }
    } else {
      throw new Error(`Unexpected output tensor shape: ${shape}`);
    }
    
    const boxes = transposed.slice([0, 0], [-1, 4]); // [8400, 4]
    const scores = transposed.slice([0, 4], [-1, 80]); // [8400, 80]
    const maxScores = scores.max(1); // [8400]
    const classIds = scores.argMax(1); // [8400]
    const mask = maxScores.greater(0.40); // [8400]
    
    return { boxes, maxScores, classIds, mask };
  });

  try {
    // 2. Perform async GPU-to-CPU masking
    const [filteredBoxes, filteredScores, filteredClasses] = await Promise.all([
      tf.booleanMaskAsync(tensors.boxes, tensors.mask),
      tf.booleanMaskAsync(tensors.maxScores, tensors.mask),
      tf.booleanMaskAsync(tensors.classIds, tensors.mask)
    ]);
    
    const boxesArray = await filteredBoxes.array();
    const scoresArray = await filteredScores.array();
    const classesArray = await filteredClasses.array();
    
    const candidates = [];
    
    for (let i = 0; i < classesArray.length; i++) {
      const classId = classesArray[i];
      if (classId === 0 || classId === 67 || classId === 73) {
        const [x_center, y_center, w, h] = boxesArray[i];
        const x1 = x_center - w / 2;
        const y1 = y_center - h / 2;
        const x2 = x_center + w / 2;
        const y2 = y_center + h / 2;
        
        candidates.push({
          box: [x1, y1, x2, y2],
          score: scoresArray[i],
          classId
        });
      }
    }
    
    // 3. Apply NMS
    const suppressed = cpuNMS(candidates, 0.45);
    
    let personCount = 0;
    let phoneDetected = false;
    let bookDetected = false;
    
    for (const item of suppressed) {
      if (item.classId === 0 && item.score >= 0.40) {
        personCount++;
      } else if (item.classId === 67 && item.score >= 0.42) {
        phoneDetected = true;
      } else if (item.classId === 73 && item.score >= 0.45) {
        bookDetected = true;
      }
    }
    
    result = { personCount, phoneDetected, bookDetected };
    
    filteredBoxes.dispose();
    filteredScores.dispose();
    filteredClasses.dispose();
  } catch (err) {
    console.error('[ProctoringEngine] YOLOv8 post-processing error:', err);
  } finally {
    tensors.boxes.dispose();
    tensors.maxScores.dispose();
    tensors.classIds.dispose();
    tensors.mask.dispose();
  }
  
  return result;
};

const ProctoringEngine = ({ 
  uid, 
  assessmentId, 
  onAutoSubmit,
  isTestActive = true,
  maxViolations = 200,
  onViolationUpdate,
  isProctorActive = true,
  onReady,
  // [Fix Audit-5 P1] required: when true, face model + YOLO model must both load
  // successfully. If either fails, onLoadFailed is called and the exam launch is blocked.
  // In practice/non-required mode (required=false), degraded camera-only mode is acceptable.
  required = false,
  onLoadFailed,
}) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const modelsLoadedRef = useRef(false);
  const initializedRef = useRef(false);
  const retryCountRef = useRef(0);
  const selectedDeviceIdRef = useRef(null);

  // Dream AI Pipeline Interval & Concurrency Guards
  const tier1IntervalRef = useRef(null);
  const tier2IntervalRef = useRef(null);
  const tier3IntervalRef = useRef(null);
  const tier1RunningRef = useRef(false);
  const tier2RunningRef = useRef(false);
  const tier3RunningRef = useRef(false);

  // Debounce & Streak Counters
  const noFaceStreakRef = useRef(0);
  const lookingAwayStreakRef = useRef(0);
  const multiFaceStreakRef = useRef(0);
  const yoloMultiPersonStreakRef = useRef(0);
  const mismatchStreakRef = useRef(0);

  // Cross-Model Corroboration & Gating
  const lastYoloPersonCountRef = useRef(0);
  const lastYoloTimeRef = useRef(0);
  const lastViolationTimeRef = useRef({});
  const isProctorActiveRef = useRef(isProctorActive);
  const activeStartTimeRef = useRef(0);

  const [violationCount, setViolationCount] = useState(() => {
    // Guarded: proctorCache is a plain localStorage utility — no async deps.
    // The try/catch protects against circular-import TDZ races in ESM bundlers.
    try {
      if (assessmentId && uid) {
        const cached = getViolations(assessmentId, uid);
        return (cached && typeof cached.violationCount === 'number') ? cached.violationCount : 0;
      }
    } catch (_) {}
    return 0;
  });
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [isWebcamBlocked, setIsWebcamBlocked] = useState(false);
  const [modelStatus, setModelStatus] = useState(globalModelsLoaded ? 'active' : 'loading');

  const onViolationUpdateRef = useRef(onViolationUpdate);
  const onAutoSubmitRef = useRef(onAutoSubmit);
  const maxViolationsRef = useRef(maxViolations);
  const violationCountRef = useRef(violationCount);
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    // Guarded: wrap in try/catch to prevent ESM TDZ or localStorage errors from
    // crashing the effect and triggering the React ErrorBoundary.
    try {
      if (assessmentId && uid) {
        const cached = getViolations(assessmentId, uid);
        const count = (cached && typeof cached.violationCount === 'number') ? cached.violationCount : 0;
        if (count > 0) {
          setViolationCount(count);
          violationCountRef.current = count;
          if (onViolationUpdateRef.current) {
            setTimeout(() => {
              onViolationUpdateRef.current?.({
                violationCount: count,
                violationType: 'init_sync',
                timestamp: new Date().toISOString()
              });
            }, 0);
          }
          if (maxViolations > 0 && count >= maxViolations && onAutoSubmitRef.current) {
            console.warn(`[ProctoringEngine] Cached violation count (${count}) already meets limit (${maxViolations}). Auto-submitting...`);
            setTimeout(() => {
              if (onAutoSubmitRef.current) {
                onAutoSubmitRef.current({ reason: 'proctoring_violations', violationCount: count, violations: cached.violations || [] });
              }
            }, 1000);
          }
        }
      }
    } catch (err) {
      console.warn('[ProctoringEngine] Could not restore cached violation count:', err);
    }
  }, [assessmentId, uid, maxViolations]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);


  useEffect(() => {
    onViolationUpdateRef.current = onViolationUpdate;
  }, [onViolationUpdate]);

  useEffect(() => {
    onAutoSubmitRef.current = onAutoSubmit;
  }, [onAutoSubmit]);

  useEffect(() => {
    maxViolationsRef.current = maxViolations;
  }, [maxViolations]);

  useEffect(() => {
    violationCountRef.current = violationCount;
  }, [violationCount]);

  // Load models with global caching to prevent repeated loading
  const loadModels = useCallback(async () => {
    // Check if models are already loaded globally and both succeeded
    if (globalModelsLoaded && window.faceApiLoaded && window.yolov8Loaded) {
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
        await new Promise(r => setTimeout(r, 1000));
        if (globalModelsLoaded) {
          modelsLoadedRef.current = true;
          setModelStatus(window.yolov8Loaded && window.faceApiLoaded ? 'active' : window.faceApiLoaded ? 'face_only' : 'camera_only');
          return modelsLoadedRef.current;
        }
      }
      setModelStatus('failed');
      return false;
    }

    globalModelsLoading = true;
    setModelStatus('loading');
    try {
      console.log('[ProctoringEngine] Loading offline YOLOv8 and Face-API models independently...');
      await tf.ready();

      // 1. Load Face-API models offline (Primary Guard)
      try {
        console.log('[ProctoringEngine] Loading Face-API models offline...');
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(getModelsPath('models/face-api')),
          faceapi.nets.faceLandmark68Net.loadFromUri(getModelsPath('models/face-api')),
          faceapi.nets.faceRecognitionNet.loadFromUri(getModelsPath('models/face-api'))
        ]);
        window.faceApiLoaded = true;
        console.log('[ProctoringEngine] Face-API loaded successfully');
      } catch (faceErr) {
        window.faceApiLoaded = false;
        console.warn('[ProctoringEngine] Face-API loading failed:', faceErr);
      }

      // 2. Load YOLOv8 model — LOCAL PACKAGED MODEL ONLY
      // [Fix Audit-5 P1] Removed the https://hyuto.github.io/yolov8-tfjs/... online CDN fallback.
      // In SEB/assessment mode, loading AI models from a third-party CDN is not acceptable:
      //   - Violates the network-isolation principle for controlled assessments
      //   - Equivalent risk to the Piston remote-execution block already in desktopBridge
      //   - Students on restricted networks would get unpredictable behavior
      // Practice/non-required mode also uses local-only; simply warns on failure.
      try {
        console.log('[ProctoringEngine] Loading YOLOv8 from local packaged model...');
        window.yolov8Model = await tf.loadGraphModel(getModelsPath('models/yolov8/model.json'));
        window.yolov8Loaded = true;
        console.log('[ProctoringEngine] YOLOv8 loaded from local model successfully');
      } catch (yoloErr) {
        window.yolov8Loaded = false;
        console.warn('[ProctoringEngine] YOLOv8 local model load failed:', yoloErr.message);
        // No CDN fallback — fail is surfaced via modelStatus and the required-guard below
      }

      globalModelsLoaded = true;
      globalModelsLoading = false;

      const currentStatus = window.yolov8Loaded && window.faceApiLoaded 
        ? 'active' 
        : window.faceApiLoaded 
          ? 'face_only' 
          : window.yolov8Loaded 
            ? 'objects_only' 
            : 'failed';

      // [Fix Audit-5 P1] Fail-closed for required proctoring:
      // If proctoring is required and either critical model failed, call onLoadFailed
      // to block exam launch rather than silently degrading to camera-only mode.
      if (required && (!window.faceApiLoaded || !window.yolov8Loaded)) {
        const failedModels = [];
        if (!window.faceApiLoaded) failedModels.push('Face Detection');
        if (!window.yolov8Loaded) failedModels.push('YOLO Object Detection');
        const failMsg = `Required proctoring model(s) failed to load: ${failedModels.join(', ')}. Exam launch blocked.`;
        console.error('[ProctoringEngine] FAIL-CLOSED:', failMsg);
        setModelStatus('failed');
        setError(failMsg);
        modelsLoadedRef.current = false;
        if (typeof onLoadFailed === 'function') {
          onLoadFailed({ reason: 'model_load_failed', failedModels, message: failMsg });
        }
        return false;
      }

      modelsLoadedRef.current = window.faceApiLoaded || window.yolov8Loaded;
      setModelStatus(currentStatus);
      console.log(`[ProctoringEngine] AI initialization complete. Status: ${currentStatus}`);
      return modelsLoadedRef.current;
    } catch (error) {
      globalModelsLoading = false;
      modelsLoadedRef.current = false;
      setModelStatus('failed');
      const errMsg = `Critical model loader error: ${error?.message || 'Unknown error'}. ${
        required ? 'Proctoring is required — exam launch blocked.' : 'Running in Camera-Only mode.'
      }`;
      console.warn('[ProctoringEngine]', errMsg, error);
      setError(required ? errMsg : null);
      if (required && typeof onLoadFailed === 'function') {
        onLoadFailed({ reason: 'model_loader_exception', message: errMsg });
      }
      return false;
    }
  }, [required, onLoadFailed]);

  // Show alert toast
  const showAlert = useCallback((message, type = 'warning') => {
    const alertId = `${timeService.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const alert = {
      id: alertId,
      message,
      type
    };
    
    setAlerts(prev => [...prev, alert]);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      setAlerts(prev => prev.filter(a => a.id !== alertId));
    }, 3000);
  }, []);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => {
          track.onended = null;
          track.stop();
          console.log('[ProctoringEngine] Stopped streamRef track:', track.label);
        });
      } catch (err) {
        console.error('[ProctoringEngine] Error stopping streamRef track:', err);
      }
      streamRef.current = null;
    }

    if (window.cameraStream) {
      try {
        window.cameraStream.getTracks().forEach(track => {
          track.onended = null;
          track.stop();
          console.log('[ProctoringEngine] Explicitly stopped window.cameraStream track:', track.label);
        });
      } catch (err) {
        console.error('[ProctoringEngine] Error stopping window.cameraStream track:', err);
      }
      window.cameraStream = null;
    }
  }, []);

  const stopTieredEngine = useCallback(() => {
    if (tier1IntervalRef.current) {
      clearInterval(tier1IntervalRef.current);
      tier1IntervalRef.current = null;
    }
    if (tier2IntervalRef.current) {
      clearInterval(tier2IntervalRef.current);
      tier2IntervalRef.current = null;
    }
    if (tier3IntervalRef.current) {
      clearInterval(tier3IntervalRef.current);
      tier3IntervalRef.current = null;
    }
    tier1RunningRef.current = false;
    tier2RunningRef.current = false;
    tier3RunningRef.current = false;
  }, []);

  // Initialize webcam - with duplicate prevention and reuse existing stream
  const initializeWebcam = useCallback(async (force = false) => {
    if (force) {
      console.log('[ProctoringEngine] Forcing webcam reinitialization...');
      stopTieredEngine();
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
      
      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
          ...(selectedDeviceIdRef.current ? { deviceId: { exact: selectedDeviceIdRef.current } } : {})
        },
        audio: false
      };

      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (deviceConstraintErr) {
        if (selectedDeviceIdRef.current && (deviceConstraintErr.name === 'OverconstrainedError' || deviceConstraintErr.name === 'NotFoundError')) {
          console.warn('[ProctoringEngine] Specific camera deviceId not found, falling back to default camera:', deviceConstraintErr.message);
          selectedDeviceIdRef.current = null;
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              facingMode: 'user'
            },
            audio: false
          });
        } else {
          throw deviceConstraintErr;
        }
      }

      // Save active camera deviceId for consistent reconnection
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = typeof videoTrack.getSettings === 'function' ? videoTrack.getSettings() : {};
        if (settings.deviceId) {
          selectedDeviceIdRef.current = settings.deviceId;
          console.log('[ProctoringEngine] Saved active camera deviceId:', settings.deviceId);
        }
      }

      // Store stream globally so it can be reused
      window.cameraStream = stream;
      attachTrackHandlers(stream);
      
      if (videoRef.current) {
        if (videoRef.current.srcObject !== stream) {
          videoRef.current.srcObject = stream;
        }
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
  }, [cleanupStream, stopTieredEngine]);

  // Helper to handle and increment violation events
  const handleViolation = useCallback((type) => {
    // 1. Strict Gating: Zero checks or violations if proctoring is inactive (e.g. countdown / instructions / loading)
    if (!isProctorActiveRef.current) return;

    // 2. Startup Grace Period: 2.5s to settle in upon entering test or switching sections
    if (Date.now() - activeStartTimeRef.current < STARTUP_GRACE_PERIOD_MS) return;

    // 3. Cooldown throttle per violation type to avoid cascading spam
    const now = Date.now();
    if (lastViolationTimeRef.current[type] && (now - lastViolationTimeRef.current[type] < VIOLATION_COOLDOWN_MS)) {
      return;
    }
    lastViolationTimeRef.current[type] = now;

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
      } else if (type === 'face_mismatch') {
        msg = 'Face verification failed: Different person detected in camera view!';
      }

      // Record to local cache for Firestore write-through audit trail
      const record = recordViolation(assessmentId, uid, type, { message: msg }, uid);

      // Defer side effects to prevent updating other React components during this state transition
      setTimeout(() => {
        showAlert(msg, 'warning');
        if (onViolationUpdateRef.current) {
          onViolationUpdateRef.current({
            violationCount: newCount,
            violationType: type,
            violations: record.violations,
            timestamp: new Date().toISOString()
          });
        }

        if (newCount >= maxViolationsRef.current && onAutoSubmitRef.current) {
          console.log('[ProctoringEngine] Violation count reached limit. Auto-submitting exam...');
          showAlert('Maximum violations reached. Exam will be auto-submitted.', 'error');

          setTimeout(() => {
            if (onAutoSubmitRef.current) {
              onAutoSubmitRef.current({ reason: 'proctoring_violations', violationCount: newCount, violations: record.violations });
            }
          }, 2000);
        }
      }, 0);

      return newCount;
    });
  }, [assessmentId, uid, showAlert]);

  // ── Tier 1: High Frequency (1000ms) - Face Presence & 3D Head Pose ─────────
  const runTier1FaceCheck = useCallback(async () => {
    if (!isTestActive || !isProctorActiveRef.current) return;
    if (Date.now() - activeStartTimeRef.current < STARTUP_GRACE_PERIOD_MS) return;
    if (!videoRef.current || !streamRef.current || tier1RunningRef.current) return;

    const track = streamRef.current?.getVideoTracks()?.[0] || window.cameraStream?.getVideoTracks()?.[0];
    if (!track || !track.enabled || track.readyState !== 'live') return;

    const video = videoRef.current;
    if (video.readyState < 2 || video.paused) {
      try { await video.play(); } catch (_) {}
      if (video.readyState < 2) return;
    }

    if (!window.faceApiLoaded) return;

    tier1RunningRef.current = true;
    try {
      // SsdMobilenetv1 + 68 Landmarks (No face descriptors in Tier 1 to save CPU!)
      const faceDetections = await faceapi.detectAllFaces(
        video,
        new faceapi.SsdMobilenetv1Options({ minConfidence: 0.35 })
      ).withFaceLandmarks();

      const faceCount = faceDetections ? faceDetections.length : 0;

      if (faceCount === 0) {
        // Hybrid corroboration: check if YOLO recently confirmed person is seated at desk
        const yoloHasPerson = (Date.now() - lastYoloTimeRef.current < 6000) && (lastYoloPersonCountRef.current >= 1);
        const requiredStreak = yoloHasPerson ? 5 : 3;

        noFaceStreakRef.current += 1;
        lookingAwayStreakRef.current = 0;
        multiFaceStreakRef.current = 0;

        if (noFaceStreakRef.current >= requiredStreak) {
          handleViolation('no_face');
          noFaceStreakRef.current = 0;
        }
      } else if (faceCount > 1) {
        multiFaceStreakRef.current += 1;
        noFaceStreakRef.current = 0;
        lookingAwayStreakRef.current = 0;

        if (multiFaceStreakRef.current >= 2) {
          handleViolation('multiple_faces');
          multiFaceStreakRef.current = 0;
        }
      } else {
        // Exactly 1 face detected
        noFaceStreakRef.current = 0;
        multiFaceStreakRef.current = 0;

        // 3D Head Pose Estimation (Yaw, Pitch & Roll from 68 landmarks)
        const landmarks = faceDetections[0].landmarks;
        const jawOutline = landmarks.getJawOutline();
        const nose = landmarks.getNose();
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();

        let isLookingAway = false;

        if (jawOutline && jawOutline.length >= 17 && nose && nose.length >= 7 && leftEye && rightEye) {
          const leftEdge = jawOutline[0];
          const rightEdge = jawOutline[16];
          const noseTip = nose[6];

          // 1. Yaw (Horizontal left/right rotation)
          const distLeft = noseTip.x - leftEdge.x;
          const distRight = rightEdge.x - noseTip.x;
          if (distLeft > 0 && distRight > 0) {
            const yawRatio = distLeft / distRight;
            if (yawRatio < 0.28 || yawRatio > 3.4) {
              isLookingAway = true;
            }
          }

          // 2. Pitch (Vertical looking down at desk/lap/phone or up at ceiling)
          if (!isLookingAway && leftEye.length >= 6 && rightEye.length >= 6) {
            const leftEyeY = (leftEye[1].y + leftEye[2].y + leftEye[4].y + leftEye[5].y) / 4;
            const rightEyeY = (rightEye[1].y + rightEye[2].y + rightEye[4].y + rightEye[5].y) / 4;
            const eyeMidY = (leftEyeY + rightEyeY) / 2;
            const chinY = jawOutline[8].y;
            const noseTipY = noseTip.y;

            const upperDist = noseTipY - eyeMidY;
            const lowerDist = chinY - noseTipY;

            if (upperDist > 0 && lowerDist > 0) {
              const pitchRatio = upperDist / lowerDist;
              // Pitch ratio > 2.1 = looking down at lap/cellphone; < 0.35 = looking up away
              if (pitchRatio > 2.1 || pitchRatio < 0.35) {
                isLookingAway = true;
              }
            }
          }

          // 3. Roll (Head tilt)
          if (!isLookingAway && leftEye.length >= 6 && rightEye.length >= 6) {
            const leftEyeY = (leftEye[1].y + leftEye[4].y) / 2;
            const rightEyeY = (rightEye[1].y + rightEye[4].y) / 2;
            const eyeDeltaY = rightEyeY - leftEyeY;
            const eyeDeltaX = rightEye[3].x - leftEye[0].x;
            const rollAngle = Math.abs(Math.atan2(eyeDeltaY, eyeDeltaX) * (180 / Math.PI));
            if (rollAngle > 35) {
              isLookingAway = true;
            }
          }
        }

        if (isLookingAway) {
          lookingAwayStreakRef.current += 1;
          if (lookingAwayStreakRef.current >= 3) {
            handleViolation('looking_away');
            lookingAwayStreakRef.current = 0;
          }
        } else {
          lookingAwayStreakRef.current = 0;
        }
      }
    } catch (err) {
      console.warn('[ProctoringEngine] Tier 1 detection error:', err);
    } finally {
      tier1RunningRef.current = false;
    }
  }, [isTestActive, handleViolation]);

  // ── Tier 2: Medium Frequency (3000ms) - YOLOv8 Unauthorized Objects ────────
  const runTier2YoloCheck = useCallback(async () => {
    if (!isTestActive || !isProctorActiveRef.current) return;
    if (Date.now() - activeStartTimeRef.current < STARTUP_GRACE_PERIOD_MS) return;
    if (!videoRef.current || !streamRef.current || tier2RunningRef.current) return;
    if (!window.yolov8Loaded || !window.yolov8Model || window.yoloModelBroken) return;

    const track = streamRef.current?.getVideoTracks()?.[0] || window.cameraStream?.getVideoTracks()?.[0];
    if (!track || !track.enabled || track.readyState !== 'live') return;

    const video = videoRef.current;
    if (video.readyState < 2 || video.paused) return;

    tier2RunningRef.current = true;
    try {
      const yoloResult = await runYolov8Inference(video, window.yolov8Model);
      lastYoloTimeRef.current = Date.now();
      lastYoloPersonCountRef.current = yoloResult.personCount;

      // 1. Mobile Phone Detection (Instant violation)
      if (yoloResult.phoneDetected) {
        handleViolation('cell_phone');
        return;
      }

      // 2. Prohibited Material / Book Detection (Instant violation)
      if (yoloResult.bookDetected) {
        handleViolation('prohibited_object');
        return;
      }

      // 3. Secondary Person Detection via YOLO
      if (yoloResult.personCount > 1) {
        yoloMultiPersonStreakRef.current += 1;
        if (yoloMultiPersonStreakRef.current >= 2) {
          handleViolation('multiple_faces');
          yoloMultiPersonStreakRef.current = 0;
        }
      } else {
        yoloMultiPersonStreakRef.current = 0;
      }

      // Fallback if Face-API failed to load offline: use YOLO personCount
      if (!window.faceApiLoaded) {
        if (yoloResult.personCount === 0) {
          noFaceStreakRef.current += 1;
          if (noFaceStreakRef.current >= 3) {
            handleViolation('no_face');
            noFaceStreakRef.current = 0;
          }
        } else {
          noFaceStreakRef.current = 0;
        }
      }
    } catch (err) {
      console.error('[ProctoringEngine] Tier 2 YOLO error:', err);
      window.yoloModelBroken = true;
    } finally {
      tier2RunningRef.current = false;
    }
  }, [isTestActive, handleViolation]);

  // ── Tier 3: Low Frequency (30000ms) - Biometric Identity Verification ──────
  const runTier3IdentityCheck = useCallback(async () => {
    if (!isTestActive || !isProctorActiveRef.current) return;
    if (Date.now() - activeStartTimeRef.current < STARTUP_GRACE_PERIOD_MS) return;
    if (!videoRef.current || !streamRef.current || tier3RunningRef.current) return;
    if (!window.faceApiLoaded) return;

    const track = streamRef.current?.getVideoTracks()?.[0] || window.cameraStream?.getVideoTracks()?.[0];
    if (!track || !track.enabled || track.readyState !== 'live') return;

    const savedDescriptorStr = localStorage.getItem('proctor_reference_descriptor_' + assessmentId);
    if (!savedDescriptorStr) return;

    const video = videoRef.current;
    if (video.readyState < 2 || video.paused) return;

    tier3RunningRef.current = true;
    try {
      let referenceDescriptor;
      try {
        referenceDescriptor = new Float32Array(JSON.parse(savedDescriptorStr));
      } catch (_) {
        return;
      }

      const detection = await faceapi.detectSingleFace(
        video,
        new faceapi.SsdMobilenetv1Options({ minConfidence: 0.40 })
      ).withFaceLandmarks().withFaceDescriptor();

      if (detection && detection.descriptor) {
        const distance = faceapi.euclideanDistance(referenceDescriptor, detection.descriptor);
        console.log(`[ProctoringEngine] Tier 3 Identity verification distance: ${distance.toFixed(3)} (threshold: 0.62)`);

        if (distance > 0.62) {
          mismatchStreakRef.current += 1;
          if (mismatchStreakRef.current >= 2) {
            handleViolation('face_mismatch');
            mismatchStreakRef.current = 0;
          }
        } else {
          mismatchStreakRef.current = 0;
        }
      }
    } catch (err) {
      console.warn('[ProctoringEngine] Tier 3 Identity verification error:', err);
    } finally {
      tier3RunningRef.current = false;
    }
  }, [isTestActive, assessmentId, handleViolation]);

  const startTieredEngine = useCallback(() => {
    stopTieredEngine();

    // Tier 1: 1000ms cadence
    tier1IntervalRef.current = setInterval(() => {
      runTier1FaceCheck();
    }, TIER_1_INTERVAL_MS);

    // Tier 2: 3000ms cadence (staggered start by 1500ms)
    setTimeout(() => {
      if (isProctorActiveRef.current) {
        runTier2YoloCheck();
        tier2IntervalRef.current = setInterval(() => {
          runTier2YoloCheck();
        }, TIER_2_INTERVAL_MS);
      }
    }, 1500);

    // Tier 3: 30000ms cadence (staggered start by 10000ms)
    setTimeout(() => {
      if (isProctorActiveRef.current) {
        runTier3IdentityCheck();
        tier3IntervalRef.current = setInterval(() => {
          runTier3IdentityCheck();
        }, TIER_3_INTERVAL_MS);
      }
    }, 10000);

    console.log('[ProctoringEngine] Dream AI Tiered Pipeline started (T1: 1s, T2: 3s, T3: 30s)');
  }, [stopTieredEngine, runTier1FaceCheck, runTier2YoloCheck, runTier3IdentityCheck]);

  // Gating Effect: start or stop tiered detection loop strictly based on isProctorActive
  useEffect(() => {
    isProctorActiveRef.current = isProctorActive;
    if (isProctorActive) {
      activeStartTimeRef.current = Date.now();
      noFaceStreakRef.current = 0;
      lookingAwayStreakRef.current = 0;
      multiFaceStreakRef.current = 0;
      yoloMultiPersonStreakRef.current = 0;
      mismatchStreakRef.current = 0;
      if (isInitialized && modelsLoadedRef.current) {
        startTieredEngine();
      }
    } else {
      stopTieredEngine();
      noFaceStreakRef.current = 0;
      lookingAwayStreakRef.current = 0;
      multiFaceStreakRef.current = 0;
      yoloMultiPersonStreakRef.current = 0;
      mismatchStreakRef.current = 0;
    }
  }, [isProctorActive, isInitialized, startTieredEngine, stopTieredEngine]);

  // Initialize proctoring system - with duplicate prevention
  useEffect(() => {
    if (!isTestActive) {
      // Stop camera and cleanup when test is not active
      console.log('[ProctoringEngine] Test not active, cleaning up...');
      
      stopTieredEngine();
      cleanupStream();
      
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

    // Safety timer: Fire onReady within 4.5s regardless of model downloading latency or camera delay
    const safetyTimer = setTimeout(() => {
      if (onReadyRef.current) {
        console.log('[ProctoringEngine] Safety timer fired onReady to prevent prelaunch hang');
        onReadyRef.current();
      }
    }, 4500);

    const init = async () => {
      // Mark as initializing to prevent duplicates
      initializedRef.current = true;
      
      try {
        // 1. Initialize webcam first so camera view is visible immediately
        const webcamInitialized = await initializeWebcam();
        if (!webcamInitialized) {
          initializedRef.current = false;
          if (onReadyRef.current) {
            setTimeout(() => {
              onReadyRef.current?.();
            }, 0);
          }
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
              if (isProctorActiveRef.current) {
                startTieredEngine();
              }
              console.log('[ProctoringEngine] Dream AI proctoring pipeline ready');
            }
            // Always fire onReady whether modelsLoaded was true or false, so prelaunch is unblocked
            if (onReadyRef.current) {
              setTimeout(() => {
                onReadyRef.current?.();
              }, 0);
            }
          };

          if (videoRef.current.readyState >= 2) {
            // Video already loaded
            handleLoadedMetadata();
          } else {
            videoRef.current.onloadedmetadata = handleLoadedMetadata;
          }
        } else {
          if (onReadyRef.current) {
            onReadyRef.current();
          }
        }
      } catch (error) {
        console.error('[ProctoringEngine] Initialization error:', error);
        setError('Failed to initialize proctoring system.');
        initializedRef.current = false;
        if (onReadyRef.current) {
          onReadyRef.current();
        }
      }
    };

    init();

    const handleHardwareTeardown = () => {
      console.log('[ProctoringEngine] Hardware teardown event received, stopping camera and AI...');
      stopTieredEngine();
      cleanupStream();
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      initializedRef.current = false;
      setIsInitialized(false);
    };

    window.addEventListener('seb:stop-proctoring-hardware', handleHardwareTeardown);

    // Cleanup
    return () => {
      console.log('[ProctoringEngine] Cleanup running...');
      clearTimeout(safetyTimer);
      window.removeEventListener('seb:stop-proctoring-hardware', handleHardwareTeardown);
      stopTieredEngine();
      cleanupStream();
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      
      initializedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTestActive]);


  // Save violation count to localStorage
  useEffect(() => {
    if (uid && assessmentId) {
      const key = `proctor_violations_${uid}_${assessmentId}`;
      localStorage.setItem(key, violationCount.toString());
    }
  }, [uid, assessmentId, violationCount]);

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

  // Draggable camera preview state
  const containerRef = useRef(null);
  const [position, setPosition] = useState(() => {
    try {
      const saved = sessionStorage.getItem('proctoring_camera_pos');
      return saved ? JSON.parse(saved) : null;
    } catch (_) {
      return null;
    }
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, elemX: 0, elemY: 0 });

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    const elemX = rect ? rect.left : (window.innerWidth - 200);
    const elemY = rect ? rect.top : 65;

    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      elemX,
      elemY
    };
    setIsDragging(true);
  }, []);

  const handleTouchStart = useCallback((e) => {
    if (!e.touches || e.touches.length === 0) return;
    const touch = e.touches[0];
    const rect = containerRef.current?.getBoundingClientRect();
    const elemX = rect ? rect.left : (window.innerWidth - 200);
    const elemY = rect ? rect.top : 65;

    dragStartRef.current = {
      mouseX: touch.clientX,
      mouseY: touch.clientY,
      elemX,
      elemY
    };
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      const deltaX = e.clientX - dragStartRef.current.mouseX;
      const deltaY = e.clientY - dragStartRef.current.mouseY;

      const rect = containerRef.current?.getBoundingClientRect();
      const width = rect ? rect.width : 200;
      const height = rect ? rect.height : 150;

      const rawX = dragStartRef.current.elemX + deltaX;
      const rawY = dragStartRef.current.elemY + deltaY;

      const clampedX = Math.max(10, Math.min(window.innerWidth - width - 10, rawX));
      const clampedY = Math.max(10, Math.min(window.innerHeight - height - 10, rawY));

      const newPos = { x: clampedX, y: clampedY };
      setPosition(newPos);
      try {
        sessionStorage.setItem('proctoring_camera_pos', JSON.stringify(newPos));
      } catch (_) {}
    };

    const handleTouchMove = (e) => {
      if (!e.touches || e.touches.length === 0) return;
      const touch = e.touches[0];
      const deltaX = touch.clientX - dragStartRef.current.mouseX;
      const deltaY = touch.clientY - dragStartRef.current.mouseY;

      const rect = containerRef.current?.getBoundingClientRect();
      const width = rect ? rect.width : 200;
      const height = rect ? rect.height : 150;

      const rawX = dragStartRef.current.elemX + deltaX;
      const rawY = dragStartRef.current.elemY + deltaY;

      const clampedX = Math.max(10, Math.min(window.innerWidth - width - 10, rawX));
      const clampedY = Math.max(10, Math.min(window.innerHeight - height - 10, rawY));

      const newPos = { x: clampedX, y: clampedY };
      setPosition(newPos);
      try {
        sessionStorage.setItem('proctoring_camera_pos', JSON.stringify(newPos));
      } catch (_) {}
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging]);

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
      {/* Top Section: Violation Counter and Camera Preview - Draggable */}
      <div 
        ref={containerRef}
        className={`proctoring-top-section ${isDragging ? 'is-dragging' : ''}`}
        style={position ? { top: `${position.y}px`, left: `${position.x}px`, right: 'auto', bottom: 'auto' } : {}}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <div className="proctoring-top-row">
          {/* Mini Camera View */}
          <div className="mini-camera-view">
            {/* Drag Handle Overlay */}
            <div className="camera-drag-handle" title="Click and drag to move camera preview anywhere on screen">
              <span className="drag-dots">⋮⋮</span>
              <span>DRAG TO MOVE</span>
            </div>
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
                | {modelStatus === 'active' ? 'AI ACTIVE (TIERED)' : modelStatus === 'face_only' ? 'AI ACTIVE (FACE ONLY)' : modelStatus === 'objects_only' ? 'AI ACTIVE (OBJECTS)' : modelStatus === 'loading' ? 'LOADING AI...' : 'CAMERA ONLY'}
              </span>
            </div>
            {/* Violation count badge overlaid on camera */}
            <div className={`camera-violation-badge ${violationCount === 0 ? 'badge-safe' : violationCount >= Math.round(maxViolations * 0.8) ? 'badge-critical' : 'badge-warn'}`}>
               {violationCount}/{maxViolations}
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

export default React.memo(ProctoringEngine);
