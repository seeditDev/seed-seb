import React, { useEffect, useRef, useCallback } from "react";

// AudioProctoringEngine
// Monitors student microphone using Web Audio API (AudioContext + AnalyserNode).
// Flags violations for: sustained noise/talking, mic disconnected, permission denied.
//
// KEY DESIGN: mic permission is requested once when isTestActive first becomes true.
// The stream is kept alive for the entire exam. Sampling is paused when !isTestActive
// but the mic is NOT torn down – avoids repeated permission prompts between sections.

const DEFAULT_SAMPLE_INTERVAL_MS = 100;
const DEFAULT_NOISE_HOLD_FRAMES   = 2;      // 2 frames (~200ms) captures spoken words like 'hello'
const DEFAULT_NOISE_THRESHOLD     = 0.0045; // RMS threshold tuned for far-field audio with preamp
const DEFAULT_PEAK_THRESHOLD      = 0.015;  // Peak threshold for consonants, whispers, sharp sounds
const DEFAULT_COOLDOWN_MS         = 3000;   // 3s cooldown between reported violations

const AudioProctoringEngine = ({
  uid,
  assessmentId,
  isTestActive = true,
  isProctorActive = true,
  maxViolations = 200,
  noiseThreshold = DEFAULT_NOISE_THRESHOLD,
  peakThreshold = DEFAULT_PEAK_THRESHOLD,
  holdFrames = DEFAULT_NOISE_HOLD_FRAMES,
  sampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  onViolationUpdate,
  onReady,
}) => {
  // Keep latest callbacks in refs so closures never go stale
  const onViolationRef = useRef(onViolationUpdate);
  const onReadyRef     = useRef(onReady);
  useEffect(() => { onViolationRef.current = onViolationUpdate; }, [onViolationUpdate]);
  useEffect(() => { onReadyRef.current = onReady; },             [onReady]);

  // Internal resources
  const audioCtxRef    = useRef(null);
  const analyserRef    = useRef(null);
  const streamRef      = useRef(null);
  const intervalRef    = useRef(null);

  // Counters / guards
  const noiseFramesRef    = useRef(0);
  const lastViolationRef  = useRef(0);
  const violationCountRef = useRef(0);
  const noiseFloorRef     = useRef(0.0015); // Dynamic ambient noise floor tracking (EMA)
  const initializedRef    = useRef(false);  // mic stream acquired
  const initStartedRef    = useRef(false);  // getUserMedia in-flight

  // ── Violation reporter ────────────────────────────────────────────────────
  const reportViolation = useCallback((type, extra = {}) => {
    const now = Date.now();
    if (now - lastViolationRef.current < cooldownMs) return;
    lastViolationRef.current = now;
    const newCount = ++violationCountRef.current;
    console.warn(`[AudioProctor] Violation #${newCount}: ${type}`, extra);
    setTimeout(() => {
      onViolationRef.current?.({
        type,
        count: newCount,
        maxViolations,
        timestamp: new Date().toISOString(),
        uid,
        assessmentId,
        ...extra
      });
    }, 0);
  }, [maxViolations, uid, assessmentId, cooldownMs]);

  // ── Audio Metrics (RMS + Peak + Vocal Band Energy) ─────────────────────────
  const getAudioMetrics = useCallback(() => {
    if (!analyserRef.current) return { rms: 0, peak: 0, vocalEnergy: 0 };
    if (audioCtxRef.current?.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }

    // 1. Time domain (RMS & Peak)
    const timeData = new Float32Array(analyserRef.current.fftSize);
    analyserRef.current.getFloatTimeDomainData(timeData);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < timeData.length; i++) {
      const absVal = Math.abs(timeData[i]);
      if (absVal > peak) peak = absVal;
      sum += absVal * absVal;
    }
    const rms = Math.sqrt(sum / timeData.length);

    // 2. Frequency domain (Human voice range ~85Hz - 3000Hz)
    let vocalEnergy = 0;
    try {
      const freqData = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(freqData);
      const startBin = Math.max(0, Math.floor(85 / 23.4));
      const endBin = Math.min(freqData.length - 1, Math.ceil(3000 / 23.4));
      let freqSum = 0;
      let count = 0;
      for (let b = startBin; b <= endBin; b++) {
        freqSum += freqData[b];
        count++;
      }
      vocalEnergy = count > 0 ? (freqSum / count) : 0;
    } catch (_) {}

    return { rms, peak, vocalEnergy };
  }, []);

  // ── Sampling loop ─────────────────────────────────────────────────────────
  const startSampling = useCallback(() => {
    if (intervalRef.current) return;   // already running
    intervalRef.current = setInterval(() => {
      // Track disconnected?
      if (streamRef.current) {
        const tracks = streamRef.current.getAudioTracks();
        if (!tracks.length || tracks[0].readyState === "ended") {
          reportViolation("audio-mic-disconnected");
          return;
        }
      }

      const { rms, peak, vocalEnergy } = getAudioMetrics();

      // Dynamically adapt ambient noise baseline during quiet periods
      if (rms < noiseThreshold * 1.6) {
        noiseFloorRef.current = noiseFloorRef.current * 0.95 + rms * 0.05;
      }

      // Detection condition (optimized for far-field capture up to 10m):
      // 1. RMS exceeds base threshold AND 1.75x ambient baseline (catches distant speaking)
      // 2. OR peak transient exceeds peak threshold (catches consonant attacks and whispers)
      // 3. OR human vocal range energy exceeds baseline 24
      const isDistantVoice = rms > Math.max(noiseThreshold, noiseFloorRef.current * 1.75);
      const isSharpTransient = peak > peakThreshold;
      const isVocalPattern = vocalEnergy > 24;

      const isVoiceOrNoise = isDistantVoice || isSharpTransient || isVocalPattern;

      if (isVoiceOrNoise) {
        noiseFramesRef.current += 1;
        // Sustained sound (e.g. 2 frames = 200ms) OR immediate loud burst (loud speech/noise)
        const isSustained = noiseFramesRef.current >= holdFrames;
        const isLoudBurst = rms > (noiseThreshold * 2.2) || peak > (peakThreshold * 2.2);

        if (isSustained || isLoudBurst) {
          reportViolation("audio-noise-detected", { rms, peak, vocalEnergy, noiseFloor: noiseFloorRef.current });
          noiseFramesRef.current = 0;
        }
      } else {
        noiseFramesRef.current = Math.max(0, noiseFramesRef.current - 1);
      }
    }, sampleIntervalMs);
  }, [getAudioMetrics, reportViolation, noiseThreshold, peakThreshold, holdFrames, sampleIntervalMs]);

  const stopSampling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // ── Mic initialisation (runs once) ────────────────────────────────────────
  const initMicrophone = useCallback(async () => {
    try {
      console.log("[AudioProctor] Requesting mic permission with raw acoustic sensitivity...");
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: true,
          },
          video: false
        });
      } catch (_) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }
      streamRef.current = stream;
      window.micStream = stream;

      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048; // Rich 43ms window (captures fine voice details)
      analyser.smoothingTimeConstant = 0.2;

      // Digital Preamp Gain Node (3.5x gain / +11dB) to capture far-field speech up to 10m
      const source = ctx.createMediaStreamSource(stream);
      const gainNode = ctx.createGain();
      gainNode.gain.value = 3.5;
      source.connect(gainNode);
      gainNode.connect(analyser);

      audioCtxRef.current = ctx;
      window.__sebAudioContext = ctx;
      analyserRef.current = analyser;
      initializedRef.current = true;

      console.log("[AudioProctor] Mic initialized with 3.5x preamp gain, firing onReady");
      setTimeout(() => {
        onReadyRef.current?.();
      }, 0);
      startSampling();
    } catch (err) {
      console.error("[AudioProctor] Mic init failed:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        reportViolation("audio-permission-denied");
      } else {
        reportViolation("audio-mic-disconnected");
      }
      // Always fire onReady so prelaunch countdown does not hang forever
      console.log("[AudioProctor] Mic init failed, still firing onReady to unblock prelaunch");
      setTimeout(() => {
        onReadyRef.current?.();
      }, 0);
    }
    initStartedRef.current = false;
  }, [startSampling, reportViolation]);

  // ── Effect: start mic on first activation, pause/resume sampling ──────────
  useEffect(() => {
    const active = isTestActive && isProctorActive;

    if (active) {
      if (!initializedRef.current && !initStartedRef.current) {
        initStartedRef.current = true;
        initMicrophone();
      } else if (initializedRef.current) {
        startSampling();
      }
    } else {
      stopSampling();
      if (!isTestActive) {
        // Exam finished or not active: completely release mic hardware
        streamRef.current?.getTracks().forEach(t => {
          t.onended = null;
          t.stop();
        });
        streamRef.current = null;
        if (window.micStream) {
          try { window.micStream.getTracks().forEach(t => t.stop()); } catch (_) {}
          window.micStream = null;
        }
        audioCtxRef.current?.close().catch(() => {});
        audioCtxRef.current = null;
        if (window.__sebAudioContext) {
          try { window.__sebAudioContext.close().catch(() => {}); } catch (_) {}
          window.__sebAudioContext = null;
        }
        analyserRef.current = null;
        initializedRef.current = false;
        initStartedRef.current = false;
      }
    }
  }, [isTestActive, isProctorActive, initMicrophone, startSampling, stopSampling]);

  // ── Teardown on unmount or submission event ──────────────────────────────
  useEffect(() => {
    const handleHardwareTeardown = () => {
      console.log("[AudioProctor] Hardware teardown event received — stopping microphone");
      stopSampling();
      streamRef.current?.getTracks().forEach(t => {
        t.onended = null;
        t.stop();
      });
      streamRef.current = null;
      if (window.micStream) {
        try { window.micStream.getTracks().forEach(t => t.stop()); } catch (_) {}
        window.micStream = null;
      }
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      if (window.__sebAudioContext) {
        try { window.__sebAudioContext.close().catch(() => {}); } catch (_) {}
        window.__sebAudioContext = null;
      }
      analyserRef.current = null;
      initializedRef.current = false;
      initStartedRef.current = false;
    };

    window.addEventListener('seb:stop-proctoring-hardware', handleHardwareTeardown);

    return () => {
      console.log("[AudioProctor] Unmounting — releasing mic resources");
      window.removeEventListener('seb:stop-proctoring-hardware', handleHardwareTeardown);
      stopSampling();
      streamRef.current?.getTracks().forEach(t => {
        t.onended = null;
        t.stop();
      });
      streamRef.current = null;
      if (window.micStream) {
        try { window.micStream.getTracks().forEach(t => t.stop()); } catch (_) {}
        window.micStream = null;
      }
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      if (window.__sebAudioContext) {
        try { window.__sebAudioContext.close().catch(() => {}); } catch (_) {}
        window.__sebAudioContext = null;
      }
      analyserRef.current = null;
      initializedRef.current = false;
      initStartedRef.current = false;
    };
  }, [stopSampling]);

  return null;
};

export default React.memo(AudioProctoringEngine);
