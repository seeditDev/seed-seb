/**
 * hardwareTeardown.js
 * Comprehensive hardware and AI shutdown utility.
 * Stops all Camera streams, Microphone streams, AudioContexts, MediaRecorders,
 * SpeechRecognition engines, and AI Detection loops instantly upon test submission
 * or return to dashboard.
 */

// Initialize global active streams registry
if (typeof window !== 'undefined') {
  if (!window.__activeMediaStreams) {
    window.__activeMediaStreams = new Set();
  }

  // Intercept getUserMedia once to automatically track every media stream opened in the app
  if (navigator?.mediaDevices?.getUserMedia && !window.__sebGUMPatched) {
    const origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async function (constraints) {
      const stream = await origGUM(constraints);
      if (stream && typeof stream.getTracks === 'function') {
        window.__activeMediaStreams.add(stream);
        // Remove from set when all tracks end
        stream.getTracks().forEach((track) => {
          track.addEventListener('ended', () => {
            if (stream.getTracks().every((t) => t.readyState === 'ended')) {
              window.__activeMediaStreams.delete(stream);
            }
          });
        });
      }
      return stream;
    };
    window.__sebGUMPatched = true;
  }
}

export function registerActiveStream(stream) {
  if (typeof window !== 'undefined' && stream && typeof stream.getTracks === 'function') {
    window.__activeMediaStreams = window.__activeMediaStreams || new Set();
    window.__activeMediaStreams.add(stream);
  }
}

export function stopAllMediaAndAI() {
  if (typeof window === 'undefined') return;
  console.log('[hardwareTeardown] Stopping all camera, microphone, and AI proctoring engines...');

  // 1. Dispatch custom event so React components can synchronously clean up internal hooks/refs
  try {
    window.dispatchEvent(new CustomEvent('seb:stop-proctoring-hardware'));
  } catch (_) {}

  // 2. Stop all globally tracked active MediaStreams
  if (window.__activeMediaStreams && window.__activeMediaStreams.size > 0) {
    window.__activeMediaStreams.forEach((stream) => {
      try {
        if (stream && typeof stream.getTracks === 'function') {
          stream.getTracks().forEach((track) => {
            try {
              track.onended = null;
              track.stop();
              console.log('[hardwareTeardown] Stopped activeMediaStream track:', track.label || track.kind);
            } catch (_) {}
          });
        }
      } catch (err) {
        console.warn('[hardwareTeardown] Error stopping activeMediaStream:', err);
      }
    });
    window.__activeMediaStreams.clear();
  }

  // 3. Stop window.cameraStream
  if (window.cameraStream) {
    try {
      window.cameraStream.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
        console.log('[hardwareTeardown] Stopped cameraStream track:', track.label);
      });
    } catch (err) {
      console.warn('[hardwareTeardown] Error stopping window.cameraStream:', err);
    }
    window.cameraStream = null;
  }

  // 4. Stop window.audioStream / window.micStream if attached
  if (window.audioStream) {
    try {
      window.audioStream.getTracks().forEach((t) => {
        t.onended = null;
        t.stop();
      });
    } catch (_) {}
    window.audioStream = null;
  }

  if (window.micStream) {
    try {
      window.micStream.getTracks().forEach((t) => {
        t.onended = null;
        t.stop();
      });
    } catch (_) {}
    window.micStream = null;
  }

  // 5. Find all <video> and <audio> elements in DOM and stop their MediaStream tracks
  try {
    const mediaElements = document.querySelectorAll('video, audio');
    mediaElements.forEach((el) => {
      if (el.srcObject) {
        if (typeof el.srcObject.getTracks === 'function') {
          el.srcObject.getTracks().forEach((track) => {
            try {
              track.onended = null;
              track.stop();
              console.log('[hardwareTeardown] Stopped DOM media track:', track.label || track.kind);
            } catch (_) {}
          });
        }
        el.srcObject = null;
      }
      try {
        el.pause();
      } catch (_) {}
    });
  } catch (err) {
    console.warn('[hardwareTeardown] Error cleaning DOM media elements:', err);
  }

  // 6. Close any active AudioContexts on window
  if (window.__sebAudioContext && typeof window.__sebAudioContext.close === 'function') {
    try {
      window.__sebAudioContext.close().catch(() => {});
    } catch (_) {}
    window.__sebAudioContext = null;
  }

  // 7. Stop SpeechRecognition engines if active
  if (window.__sebSpeechRecognition) {
    try {
      window.__sebSpeechRecognition.abort();
    } catch (_) {}
    window.__sebSpeechRecognition = null;
  }

  // 8. Stop any global media streams tracked in window.__globalMediaStreams
  if (Array.isArray(window.__globalMediaStreams)) {
    window.__globalMediaStreams.forEach((stream) => {
      try {
        if (stream && typeof stream.getTracks === 'function') {
          stream.getTracks().forEach((t) => {
            t.onended = null;
            t.stop();
          });
        }
      } catch (_) {}
    });
    window.__globalMediaStreams = [];
  }
}

export default stopAllMediaAndAI;
