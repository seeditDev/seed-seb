import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FaCheckCircle, FaTimesCircle, FaCamera, FaExclamationTriangle, FaSpinner, FaSync } from 'react-icons/fa';
import '../styles/ProctoringInstructions.css';
import * as faceapi from 'face-api.js';

const ProctoringInstructions = ({ onContinue, onCancel }) => {
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
  const [photoStatus, setPhotoStatus] = useState('searching'); // searching, captured, failed
  const [photoUrl, setPhotoUrl] = useState(null);  
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

  const checkCameraWorking = () => {
    if (!streamRef.current) {
      return false;
    }
    try {
      const streamActive = streamRef.current.active;
      const videoTracks = streamRef.current.getVideoTracks();
      const trackLive = videoTracks.length > 0 && videoTracks[0].readyState === 'live';
      return streamActive && trackLive;
    } catch (_) {
      return false;
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

      console.log('[ProctoringInstructions] Camera access granted, setting up video...');

      // Store stream globally so ProctoringEngine can reuse it
      window.cameraStream = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.muted = true;
        streamRef.current = stream;
        
        const video = videoRef.current;
        
        video.play().catch(() => {});
        
        // Set up event handler for when video is ready
        const handleVideoReady = () => {
          console.log('[ProctoringInstructions] Video event fired, readyState:', video.readyState);
          
          // Ensure video is playing
          video.play().then(() => {
            console.log('[ProctoringInstructions] Video play() successful');
            
            // Start checking if camera is working
            let checkCount = 0;
            const maxChecks = 20; // Check for up to 4 seconds (20 * 200ms)
            
            verificationIntervalRef.current = setInterval(() => {
              checkCount++;
              const isWorking = checkCameraWorking();
              
              if (isWorking) {
                clearInterval(verificationIntervalRef.current);
                setCameraStatus('granted');
                setCanContinue(true);
              } else if (checkCount >= maxChecks) {
                console.warn('[ProctoringInstructions] Camera verification timeout');
                clearInterval(verificationIntervalRef.current);
                setCameraStatus('denied');
                setCameraError('Camera preview is not working. Please check your camera and try again.');
                setCanContinue(false);
              }
            }, 200); // Check every 200ms
            
            // Also check immediately
            setTimeout(() => {
              const isWorking = checkCameraWorking();
              if (isWorking) {
                clearInterval(verificationIntervalRef.current);
                setCameraStatus('granted');
                setCanContinue(true);
              }
            }, 100);
          }).catch(error => {
            console.error('[ProctoringInstructions] Error playing video:', error);
            setCameraStatus('denied');
            setCameraError('Failed to start camera preview. Please try again.');
            setCanContinue(false);
          });
        };

        // Set up multiple event listeners
        video.addEventListener('loadedmetadata', handleVideoReady, { once: true });
        video.addEventListener('loadeddata', handleVideoReady, { once: true });
        video.addEventListener('canplay', handleVideoReady, { once: true });
        
        // If video is already ready, trigger immediately
        if (video.readyState >= 2) {
          console.log('[ProctoringInstructions] Video already ready, triggering immediately');
          handleVideoReady();
        }
      } else {
        // Video ref not available, but stream is good
        streamRef.current = stream;
        setCameraStatus('granted');
        setCanContinue(true);
      }
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

  const captureReferencePhoto = useCallback(async () => {
    if (!videoRef.current || !streamRef.current) {
      console.warn('[ProctoringInstructions] Cannot capture photo, video or stream is null');
      return;
    }
    
    setPhotoStatus('searching');
    setPhotoUrl(null);
    const modelsReady = await loadFaceApiForPhoto();
    if (!modelsReady) {
      setPhotoStatus('failed');
      return;
    }
    
    const video = videoRef.current;
    
    // Attempt to capture a face for up to 15 seconds (15 attempts, 1s apart)
    for (let attempt = 0; attempt < 15; attempt++) {
      if (!streamRef.current || !streamRef.current.active) return;
      
      try {
        console.log(`[ProctoringInstructions] Face capture attempt ${attempt + 1}...`);
        const detection = await faceapi.detectSingleFace(
          video,
          new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })
        ).withFaceLandmarks().withFaceDescriptor();
        
        if (detection) {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          
          localStorage.setItem('proctor_reference_photo', dataUrl);
          localStorage.setItem('proctor_reference_descriptor', JSON.stringify(Array.from(detection.descriptor)));
          
          setPhotoUrl(dataUrl);
          setPhotoStatus('captured');
          console.log('[ProctoringInstructions] ✓ Reference face photo captured and descriptor saved');
          return;
        }
      } catch (err) {
        console.error('[ProctoringInstructions] Error during face capture attempt:', err);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    setPhotoStatus('failed');
  }, []);

  useEffect(() => {
    if (cameraStatus === 'granted') {
      // Delay slightly to allow video track to start playing
      const timer = setTimeout(() => {
        captureReferencePhoto();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [cameraStatus, captureReferencePhoto]);

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
                    <div className="camera-preview-wrapper">
                      <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className="instructions-video-preview"
                      />
                      <div className="photo-capture-overlay">
                        {photoStatus === 'searching' && (
                          <div className="photo-scan-status scan-searching">
                            <FaSpinner className="spinner-icon pulse" />
                            <span>Scanning face for verification photo...</span>
                          </div>
                        )}
                        {photoStatus === 'captured' && (
                          <div className="photo-scan-status scan-captured">
                            <FaCheckCircle className="scan-success-icon" />
                            <span>✓ Identity Verified & Registered!</span>
                          </div>
                        )}
                        {photoStatus === 'failed' && (
                          <div className="photo-scan-status scan-failed">
                            <FaExclamationTriangle className="scan-failed-icon" />
                            <span>Face not detected. Keep your face centered.</span>
                            <button className="scan-retry-btn" onClick={captureReferencePhoto}>
                              <FaSync /> Retry Photo
                            </button>
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
                    <span className="badge-status">{photoStatus === 'captured' ? '✓ Registered' : photoStatus === 'searching' ? '⚡ Scanning...' : '○ Pending'}</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="instructions-right-column">
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
