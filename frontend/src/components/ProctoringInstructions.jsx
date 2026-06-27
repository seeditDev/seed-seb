import React, { useState, useEffect, useRef } from 'react';
import { FaCheckCircle, FaTimesCircle, FaCamera, FaExclamationTriangle, FaSpinner } from 'react-icons/fa';
import '../styles/ProctoringInstructions.css';

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

  useEffect(() => {
    // Request camera access when component mounts
    requestCameraAccess();

    // Cleanup on unmount - but DON'T stop the stream, let ProctoringEngine use it
    return () => {
      if (verificationIntervalRef.current) {
        clearInterval(verificationIntervalRef.current);
      }
      // Don't stop stream here - it will be reused by ProctoringEngine
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

 

  const handleContinue = () => {
    if (canContinue && streamRef.current && hasScrolledToBottom && isAcknowledged) {
      console.log('[ProctoringInstructions] Continuing to test');
      // Don't stop the stream here - let ProctoringEngine use it
      onContinue();
    } else {
      console.warn('[ProctoringInstructions] Cannot continue:', {
        canContinue,
        hasStream: !!streamRef.current,
        hasScrolledToBottom,
        isAcknowledged
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
                <div className="camera-status-success">
                  <FaCheckCircle className="success-icon" />
                  <span>Camera access granted ✓</span>
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
            className={`instructions-btn continue-btn ${(!canContinue || !hasScrolledToBottom || !isAcknowledged) ? 'disabled' : ''}`}
            onClick={handleContinue}
            disabled={!canContinue || !hasScrolledToBottom || !isAcknowledged}
          >
            {canContinue && hasScrolledToBottom && isAcknowledged
              ? 'I Understand, Continue to Test' 
              : cameraStatus === 'requesting' 
                ? 'Waiting for Camera...' 
                : !hasScrolledToBottom
                  ? 'Scroll & Accept to Continue'
                  : !isAcknowledged
                    ? 'Please Accept Guidelines'
                    : 'Please Allow Camera Access First'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProctoringInstructions;
