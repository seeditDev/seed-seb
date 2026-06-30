import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FaCheckCircle, FaTimesCircle, FaCamera, FaExclamationTriangle, FaSpinner, FaSync, FaClock, FaLaptopCode, FaClipboardList } from 'react-icons/fa';
import '../styles/ProctoringInstructions.css';
import * as faceapi from 'face-api.js';
import { setProctorCacheExpiry } from '../utils/proctorCache';

const ProctoringInstructions = ({ assessment, onContinue, onCancel }) => {
  const [cameraStatus, setCameraStatus] = useState('requesting'); // requesting, granted, denied, error
  const [cameraError, setCameraError] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [canContinue, setCanContinue] = useState(false);
  const verificationIntervalRef = useRef(null);
  const contentRef = useRef(null);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [isAcknowledged, setIsAcknowledged] = useState(false);
  
  // State for reference photo registration
  const [photoStatus, setPhotoStatus] = useState('pending'); // pending, captured, failed
  const [photoUrl, setPhotoUrl] = useState(null);  
  const [captureError, setCaptureError] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);
  // Track if we are proceeding to test
  const isProceedingRef = useRef(false);

  useEffect(() => {
    // Request camera access when component mounts
    requestCameraAccess();

    // Cleanup on unmount - stop stream if not proceeding to the test
    return () => {
      if (verificationIntervalRef.current) {
        clearInterval(verificationIntervalRef.current);
      }
      
      if (!isProceedingRef.current) {
        console.log('[ProctoringInstructions] Unmounting guidelines without proceeding. Shutting down camera...');
        if (streamRef.current) {
          try {
            streamRef.current.getTracks().forEach(track => {
              track.onended = null;
              track.stop();
            });
          } catch (_) {}
          streamRef.current = null;
        }
        if (window.cameraStream) {
          try {
            window.cameraStream.getTracks().forEach(track => {
              track.onended = null;
              track.stop();
            });
          } catch (_) {}
          window.cameraStream = null;
        }
      }
    };
  }, []);

  useEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl) {
      return;
    }
    // If content is short (no scroll), allow immediately
    if (contentEl.scrollHeight <= contentEl.clientHeight) {
      setHasScrolledToBottom(true);
    }
  }, []);

  const handleContentScroll = () => {
    const el = contentRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 16) {
      setHasScrolledToBottom(true);
    }
  };

  const requestCameraAccess = async () => {
    try {
      setCameraStatus('requesting');
      setCameraError(null);
      setCanContinue(false);

      console.log('[ProctoringInstructions] Requesting camera access...');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });

      console.log('[ProctoringInstructions] Camera access granted.');

      // Store stream globally so ProctoringEngine can reuse it
      window.cameraStream = stream;
      streamRef.current = stream;
      setCameraStatus('granted');
      setCanContinue(true);
    } catch (error) {
      console.error('[ProctoringInstructions] Camera access error:', error);
      setCameraStatus('denied');
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setCameraError('Camera access denied. Please allow camera access to continue.');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setCameraError('No camera found. Please connect a camera to continue.');
      } else {
        setCameraError('Failed to access camera. Please check your camera settings.');
      }
      setCanContinue(false);
    }
  };

 

  const loadFaceApiForPhoto = async () => {
    try {
      if (!window.faceApiLoaded) {
        console.log('[ProctoringInstructions] Loading faceapi models...');
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri('/models/face-api'),
          faceapi.nets.faceLandmark68Net.loadFromUri('/models/face-api'),
          faceapi.nets.faceRecognitionNet.loadFromUri('/models/face-api')
        ]);
        window.faceApiLoaded = true;
      }
      return true;
    } catch (err) {
      console.error('[ProctoringInstructions] Error loading faceapi models:', err);
      return false;
    }
  };

  // Bind stream to video element when videoRef becomes available after permission is granted
  useEffect(() => {
    if (cameraStatus === 'granted' && streamRef.current && videoRef.current) {
      const video = videoRef.current;
      
      if (video.srcObject !== streamRef.current) {
        console.log('[ProctoringInstructions] Binding stream to video preview element...');
        video.srcObject = streamRef.current;
        video.setAttribute('playsinline', 'true');
        video.muted = true;
        
        video.play().then(() => {
          console.log('[ProctoringInstructions] Video preview play() successful');
        }).catch(error => {
          console.error('[ProctoringInstructions] Video preview play() failed:', error);
        });
      }
    }
  }, [cameraStatus]);

  const captureReferencePhoto = useCallback(async () => {
    setCaptureError('');
    setIsCapturing(true);
    
    const modelsReady = await loadFaceApiForPhoto();
    if (!modelsReady) {
      setCaptureError("AI face-detection models failed to load. Please check your connection.");
      setIsCapturing(false);
      return;
    }
    
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCaptureError("Camera stream is not ready yet. Please wait.");
      setIsCapturing(false);
      return;
    }
    
    try {
      console.log('[ProctoringInstructions] Executing manual face capture...');
      const detection = await faceapi.detectSingleFace(
        video,
        new faceapi.SsdMobilenetv1Options({ minConfidence: 0.75 })
      ).withFaceLandmarks().withFaceDescriptor();
      
      if (!detection) {
        setCaptureError("No face detected in the frame. Please look directly at the camera and try again.");
        setPhotoStatus('failed');
        setIsCapturing(false);
        return;
      }
      
      const box = detection.detection.box;
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      
      // 1. Verify margins (Face too close to edges)
      const borderThresholdX = videoWidth * 0.05;
      const borderThresholdY = videoHeight * 0.05;
      if (
        box.x < borderThresholdX || 
        box.y < borderThresholdY || 
        (box.x + box.width) > (videoWidth - borderThresholdX) || 
        (box.y + box.height) > (videoHeight - borderThresholdY)
      ) {
        setCaptureError("Face is too close to boundaries. Please center your face inside the guide.");
        setPhotoStatus('failed');
        setIsCapturing(false);
        return;
      }

      // 2. Verify pose/symmetry (Looking straight check)
      const landmarks = detection.landmarks;
      const leftEye = landmarks.getLeftEye()[0];
      const rightEye = landmarks.getRightEye()[3];
      const nose = landmarks.getNose()[0];
      
      const distLeft = Math.abs(nose.x - leftEye.x);
      const distRight = Math.abs(rightEye.x - nose.x);
      
      if (distLeft > 0 && distRight > 0) {
        const ratio = distLeft / distRight;
        console.log('[ProctoringInstructions] Manual capture symmetry ratio:', ratio);
        if (ratio < 0.55 || ratio > 1.8) {
          setCaptureError("Please look straight at the camera. Side-facing photos are rejected.");
          setPhotoStatus('failed');
          setIsCapturing(false);
          return;
        }
      }
      
      // Draw image to canvas
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      
      localStorage.setItem('proctor_reference_photo', dataUrl);
      localStorage.setItem('proctor_reference_descriptor', JSON.stringify(Array.from(detection.descriptor)));
      
      const duration = assessment?.duration || 60;
      const testID = assessment?.id || 'unknown';
      setProctorCacheExpiry(duration, testID);
      
      setPhotoUrl(dataUrl);
      setPhotoStatus('captured');
      setCaptureError('');
      console.log('[ProctoringInstructions] ✓ Reference photo manually captured and validated!');
    } catch (err) {
      console.error('[ProctoringInstructions] Error during manual face capture:', err);
      setCaptureError("An error occurred during verification. Please try again.");
      setPhotoStatus('failed');
    } finally {
      setIsCapturing(false);
    }
  }, [assessment]);

  useEffect(() => {
    // Pre-load photo from cache if present
    const existingPhoto = localStorage.getItem('proctor_reference_photo');
    const existingDescriptor = localStorage.getItem('proctor_reference_descriptor');
    if (existingPhoto && existingDescriptor) {
      setPhotoUrl(existingPhoto);
      setPhotoStatus('captured');
    }
  }, []);

  const handleContinue = () => {
    if (canContinue && streamRef.current && hasScrolledToBottom && isAcknowledged && photoStatus === 'captured') {
      console.log('[ProctoringInstructions] Continuing to test');
      isProceedingRef.current = true;
      // Don't stop the stream here - let ProctoringEngine use it
      onContinue();
    } else {
      console.warn('[ProctoringInstructions] Cannot continue:', {
        canContinue,
        hasStream: !!streamRef.current,
        hasScrolledToBottom,
        isAcknowledged,
        photoStatus
      });
    }
  };

  const handleRetry = () => {
    if (verificationIntervalRef.current) {
      clearInterval(verificationIntervalRef.current);
      verificationIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (window.cameraStream) {
      window.cameraStream.getTracks().forEach(track => track.stop());
      window.cameraStream = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCanContinue(false);
    requestCameraAccess();
  };

  return (
    <div className="proctoring-instructions-overlay">
      <div className="proctoring-instructions-modal">
        <div className="instructions-header">
          <h2>
            <FaCamera className="header-icon" />
            Proctoring Guidelines
          </h2>
          <p className="instructions-subtitle">Please read the following instructions carefully before starting the test</p>
        </div>

        <div
          className="instructions-content"
          ref={contentRef}
          onScroll={handleContentScroll}
          tabIndex={0}
        >
          <div className="instructions-scroll-hint">
            <FaExclamationTriangle className="hint-icon" />
            <span>Scroll through the entire instructions and confirm acceptance to continue.</span>
          </div>

          <div className="instructions-grid-layout">
            <div className="instructions-left-column">
              {/* Camera Preview Section */}
              <div className="camera-preview-section">
                <h3>
                  <FaCamera className="section-icon" />
                  Camera Access & Verification
                </h3>
                <div className="camera-preview-container">
                  {cameraStatus === 'requesting' && (
                    <div className="camera-status-message">
                      <FaSpinner className="spinner-icon" />
                      <p>Requesting camera access...</p>
                      <p className="camera-status-hint">Please allow camera access when prompted</p>
                    </div>
                  )}
                                    {cameraStatus === 'granted' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      <div className="camera-preview-wrapper">
                        <video
                          ref={videoRef}
                          autoPlay
                          muted
                          playsInline
                          className="instructions-video-preview"
                        />
                        
                        {/* Live face guide oval */}
                        {photoStatus !== 'captured' && (
                          <div className="face-guide-oval">
                            <div className="guide-text">Position face inside oval</div>
                          </div>
                        )}

                        <div className="photo-capture-overlay">
                          {photoStatus === 'captured' && (
                            <div className="photo-scan-status scan-captured">
                              <FaCheckCircle className="scan-success-icon" />
                              <span>✓ Identity Verified & Registered!</span>
                            </div>
                          )}
                        </div>
                        {photoUrl && (
                          <div className="photo-thumbnail">
                            <img src={photoUrl} alt="Registered Identity" />
                            <span className="thumbnail-label">ID REGISTERED</span>
                          </div>
                        )}
                      </div>

                      {/* Manual Capture Button Panel */}
                      <div className="camera-controls-section" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {captureError && (
                          <div className="lw-error-row" style={{ marginTop: '0', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '8px', fontSize: '0.88rem', fontWeight: '600' }}>
                            <FaExclamationTriangle /> {captureError}
                          </div>
                        )}

                        {photoStatus !== 'captured' ? (
                          <button 
                            className="lw-btn-primary" 
                            style={{ width: '100%', justifyContent: 'center', gap: '8px', padding: '12px' }}
                            onClick={captureReferencePhoto}
                            disabled={isCapturing}
                          >
                            {isCapturing ? (
                              <>
                                <FaSpinner className="spinner-icon pulse" />
                                <span>Verifying face quality...</span>
                              </>
                            ) : (
                              <>
                                <FaCamera />
                                <span>Capture Registration Photo</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <button 
                            className="lw-btn-secondary" 
                            style={{ width: '100%', justifyContent: 'center', gap: '8px', padding: '12px', background: 'rgba(51, 65, 85, 0.65)', border: '1px solid rgba(100, 116, 139, 0.35)', color: '#cbd5e1' }}
                            onClick={() => {
                              setPhotoStatus('pending');
                              setPhotoUrl(null);
                              setCaptureError('');
                              localStorage.removeItem('proctor_reference_photo');
                              localStorage.removeItem('proctor_reference_descriptor');
                            }}
                          >
                            <FaSync />
                            <span>Recapture Photo</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {cameraStatus === 'denied' && (
                    <div className="camera-status-error">
                      <FaExclamationTriangle className="error-icon" />
                      <p>{cameraError || 'Camera access is required'}</p>
                      <button className="retry-camera-btn" onClick={handleRetry}>
                        Retry Camera Access
                      </button>
                    </div>
                  )}
                </div>
              </div>
 
              {/* Validation Checklist UI */}
              <div className="camera-verification-checklist">
                <h4>Verification Steps</h4>
                <ul>
                  <li className={cameraStatus === 'granted' ? 'passed' : 'pending'}>
                    <span className="badge-bullet"></span>
                    <span className="badge-text">Webcam Access Permission</span>
                    <span className="badge-status">{cameraStatus === 'granted' ? '✓ Passed' : '○ Pending'}</span>
                  </li>
                  <li className={photoStatus === 'captured' ? 'passed' : 'pending'}>
                    <span className="badge-bullet"></span>
                    <span className="badge-text">Offline Face Registration</span>
                    <span className="badge-status">{photoStatus === 'captured' ? '✓ Registered' : isCapturing ? '⚡ Verifying...' : '○ Pending'}</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="instructions-right-column">
              {assessment && (
                <div className="instructions-assessment-card" style={{
                  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                  borderRadius: '16px',
                  padding: '24px',
                  marginBottom: '24px',
                  boxShadow: '0 8px 24px rgba(79, 70, 229, 0.25)',
                  position: 'relative',
                  overflow: 'hidden',
                  color: '#ffffff'
                }}>
                  {/* Subtle background glow decorator */}
                  <div style={{
                    position: 'absolute',
                    top: '-50px',
                    right: '-50px',
                    width: '100px',
                    height: '100px',
                    background: 'rgba(255, 255, 255, 0.12)',
                    filter: 'blur(30px)',
                    borderRadius: '50%'
                  }}></div>
                  
                  <span style={{ 
                    fontSize: '0.72rem', 
                    color: '#c7d2fe', 
                    fontWeight: '700', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.15em',
                    display: 'block',
                    marginBottom: '8px',
                    textAlign: 'left'
                  }}>Selected Assessment</span>
                  
                  <h4 style={{
                    margin: '0 0 20px',
                    fontSize: '1.45rem',
                    color: '#ffffff',
                    fontWeight: '800',
                    lineHeight: '1.3',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.18)',
                    paddingBottom: '14px',
                    textAlign: 'left'
                  }}>{assessment.name}</h4>
                  
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '14px'
                  }}>
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      background: 'rgba(255, 255, 255, 0.15)',
                      padding: '12px 8px',
                      borderRadius: '12px',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      textAlign: 'center'
                    }}>
                      <FaLaptopCode style={{ fontSize: '1.25rem', color: '#ffffff', marginBottom: '6px' }} />
                      <span style={{ fontSize: '0.7rem', color: '#e0e7ff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</span>
                      <span style={{ fontSize: '0.9rem', color: '#ffffff', fontWeight: '700', marginTop: '4px', textTransform: 'capitalize' }}>{assessment.type}</span>
                    </div>
                    
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      background: 'rgba(255, 255, 255, 0.15)',
                      padding: '12px 8px',
                      borderRadius: '12px',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      textAlign: 'center'
                    }}>
                      <FaClock style={{ fontSize: '1.25rem', color: '#ffffff', marginBottom: '6px' }} />
                      <span style={{ fontSize: '0.7rem', color: '#e0e7ff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Duration</span>
                      <span style={{ fontSize: '0.9rem', color: '#ffffff', fontWeight: '700', marginTop: '4px' }}>{assessment.duration} Mins</span>
                    </div>
                    
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      background: 'rgba(255, 255, 255, 0.15)',
                      padding: '12px 8px',
                      borderRadius: '12px',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      textAlign: 'center'
                    }}>
                      <FaClipboardList style={{ fontSize: '1.25rem', color: '#ffffff', marginBottom: '6px' }} />
                      <span style={{ fontSize: '0.7rem', color: '#e0e7ff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Questions</span>
                      <span style={{ fontSize: '0.9rem', color: '#ffffff', fontWeight: '700', marginTop: '4px' }}>{assessment.questions || '—'} Qs</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="instructions-section">
                <h3>
                  <FaCheckCircle className="section-icon check-icon" />
                  What You MUST Do:
                </h3>
                <ul className="instructions-list do-list">
                  <li>Keep yourself clearly visible in front of the camera at all times</li>
                  <li>Ensure good lighting so you are clearly visible</li>
                  <li>Stay in front of the camera throughout the entire test</li>
                  <li>Make sure only you are visible in the camera view</li>
                  <li>Keep your eyes on the screen</li>
                  <li>Ensure a stable internet connection</li>
                </ul>
              </div>

              <div className="instructions-section">
                <h3>
                  <FaTimesCircle className="section-icon dont-icon" />
                  What You MUST NOT Do:
                </h3>
                <ul className="instructions-list dont-list">
                  <li>Do not leave your seat or move away from the camera</li>
                  <li>Do not allow anyone else to appear in the camera view</li>
                  <li>Do not cover yourself or turn away from the camera</li>
                  <li>Do not use mobile phones or other devices during the test</li>
                  <li>Do not switch tabs or minimize the browser window</li>
                  <li>Do not communicate with anyone during the test</li>
                </ul>
              </div>

              <div className="instructions-section warning-section">
                <h3>
                  <FaExclamationTriangle className="section-icon warning-icon" />
                  Important Notes:
                </h3>
                <ul className="instructions-list warning-list">
                  <li>Camera access is mandatory - the test cannot proceed without it</li>
                  <li>Violations are tracked automatically (no person detected, multiple people detected)</li>
                  <li>After 15 violations, your test will be automatically submitted</li>
                  <li>A mini camera view will be displayed during the test</li>
                  <li>Your test session is being monitored for integrity</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className={`instructions-acknowledgement ${!hasScrolledToBottom ? 'disabled' : ''}`}>
          <label>
            <input
              type="checkbox"
              checked={isAcknowledged}
              disabled={!hasScrolledToBottom}
              onChange={(e) => setIsAcknowledged(e.target.checked)}
            />
            I have read and accept the proctoring guidelines
          </label>
          {!hasScrolledToBottom && (
            <small>Scroll to the bottom of the instructions to enable this option.</small>
          )}
        </div>

        <div className="instructions-footer">
          <button 
            className="instructions-btn cancel-btn"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button 
            className={`instructions-btn continue-btn ${(!canContinue || !hasScrolledToBottom || !isAcknowledged || photoStatus !== 'captured') ? 'disabled' : ''}`}
            onClick={handleContinue}
            disabled={!canContinue || !hasScrolledToBottom || !isAcknowledged || photoStatus !== 'captured'}
          >
            {canContinue && hasScrolledToBottom && isAcknowledged && photoStatus === 'captured'
              ? 'I Understand, Continue to Test' 
              : cameraStatus === 'requesting' 
                ? 'Waiting for Camera...' 
                : !hasScrolledToBottom
                  ? 'Scroll & Accept to Continue'
                  : !isAcknowledged
                    ? 'Please Accept Guidelines'
                    : photoStatus === 'searching'
                      ? 'Registering Face Photo...'
                      : photoStatus === 'failed'
                        ? 'Face Not Detected (Retry)'
                        : 'Please Allow Camera Access First'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProctoringInstructions;
