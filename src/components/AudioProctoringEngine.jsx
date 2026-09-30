import React, { useEffect, useRef, useCallback } from "react";

// AudioProctoringEngine
// Monitors student microphone using Web Audio API (AudioContext + AnalyserNode).
// Flags violations for: sustained noise/talking, mic disconnected, permission denied.
//
// KEY DESIGN:
// 1. Hardware Lifecycle (isTestActive): mic permission requested once on session mount.
//    Stream kept alive across sections; torn down completely upon final submission.
// 2. Monitoring State (isProctorActive): Sampling ONLY runs when the test is actively
//    being taken. During loading screens, instruction views, or start countdowns,
//    isProctorActive is FALSE, so zero audio samples or violations are recorded.
// 3. Calibrated Acoustic Thresholds:
//    - DEFAULT_PREAMP_GAIN: 1.0 (Neutral unity gain, preventing fan noise amplification)
//    - DEFAULT_NOISE_THRESHOLD: 0.025 (Far above room ambient ~0.003-0.006 and typing ~0.008)
//    - DEFAULT_PEAK_THRESHOLD: 0.120 (Rejects key clacks ~0.04-0.07)
//    - DEFAULT_NOISE_HOLD_FRAMES: 5 (500ms sustained sound required; key clicks last <50ms)
//    - 2-Second Grace Period: Discards initial mic clicks/pops upon entering the test

const DEFAULT_SAMPLE_INTERVAL_MS = 100;
const DEFAULT_NOISE_HOLD_FRAMES   = 5;      // 5 frames (~500ms) sustained sound rejects single key clicks
const DEFAULT_NOISE_THRESHOLD     = 0.025;  // RMS threshold tuned for human speech (>0.030)
const DEFAULT_PEAK_THRESHOLD      = 0.120;  // Peak threshold (typing transients produce ~0.04-0.07)
const DEFAULT_COOLDOWN_MS         = 3000;   // 3s cooldown between reported violations
const DEFAULT_PREAMP_GAIN         = 1.0;    // Neutral 1.0x gain (clean, no fan noise boost)

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

  const isProctorActiveRef  = useRef(isProctorActive);
  const activeStartTimeRef  = useRef(0);
  useEffect(() => {
    isProctorActiveRef.current = isProctorActive;
    if (isProctorActive) {
      activeStartTimeRef.current = Date.now();
    }
  }, [isProctorActive]);

  // Internal resources
  const audioCtxRef    = useRef(null);
  const analyserRef    = useRef(null);
  const streamRef      = useRef(null);
  const intervalRef    = useRef(null);

  // Counters / guards
  const noiseFramesRef    = useRef(0);
  const lastViolationRef  = useRef(0);
  const violationCountRef = useRef(0);
  const noiseFloorRef     = useRef(0.003);  // Dynamic ambient noise floor tracking (EMA)
  const initializedRef    = useRef(false);  // mic stream acquired
  const initStartedRef    = useRef(false);  // getUserMedia in-flight

  // ── Violation reporter ────────────────────────────────────────────────────
  const reportViolation = useCallback((type, extra = {}) => {
    // Hard guard: never report if proctoring is not active
    if (!isProctorActiveRef.current) return;

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
    if (intervalRef.current) return; // already running
    intervalRef.current = setInterval(() => {
      // 1. Hard gate: never sample if proctoring is not active
      if (!isProctorActiveRef.current) {
        noiseFramesRef.current = 0;
        return;
      }

      // 2. Initial 2-second grace period when test becomes active
      if (Date.now() - activeStartTimeRef.current < 2000) {
        noiseFramesRef.current = 0;
        return;
      }

      // 3. Track disconnected check
      if (streamRef.current) {
        const tracks = streamRef.current.getAudioTracks();
        if (!tracks.length || tracks[0].readyState === "ended") {
          reportViolation("audio-mic-disconnected");
          return;
        }
      }

      const { rms, peak, vocalEnergy } = getAudioMetrics();

      // Dynamically adapt ambient noise baseline during quiet periods
      if (rms < noiseThreshold * 1.5) {
        noiseFloorRef.current = noiseFloorRef.current * 0.95 + rms * 0.05;
      }

      // Detection condition (calibrated for speech capture, rejecting fan noise & keystrokes):
      // - RMS must exceed base threshold (0.025) AND 1.75x ambient baseline (genuine elevated volume)
      // - AND human vocal range energy must be present (vocalEnergy > 32) OR high peak
      const isElevatedRms = rms > Math.max(noiseThreshold, noiseFloorRef.current * 1.75);
      const isVocalPattern = vocalEnergy > 32 && rms > (noiseThreshold * 0.85);

      const isVoiceOrNoise = isElevatedRms && (isVocalPattern || peak > peakThreshold);

      if (isVoiceOrNoise) {
        noiseFramesRef.current += 1;
        // Sustained sound (e.g. 5 frames = 500ms) OR immediate loud burst (loud shouting/blaring sound)
        const isSustained = noiseFramesRef.current >= holdFrames;
        const isLoudBurst = rms > (noiseThreshold * 2.5);

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

  // ── Mic initialisation (runs once per test session) ───────────────────────
  const initMicrophone = useCallback(async () => {
    try {
      console.log("[AudioProctor] Requesting mic permission for session...");
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

      // Digital Preamp Gain Node (1.0x neutral gain)
      const source = ctx.createMediaStreamSource(stream);
      const gainNode = ctx.createGain();
      gainNode.gain.value = DEFAULT_PREAMP_GAIN;
      source.connect(gainNode);
      gainNode.connect(analyser);

      audioCtxRef.current = ctx;
      window.__sebAudioContext = ctx;
      analyserRef.current = analyser;
      initializedRef.current = true;

      console.log("[AudioProctor] Mic initialized successfully, firing onReady");
      setTimeout(() => {
        onReadyRef.current?.();
      }, 0);

      // Only start sampling immediately if proctoring is already active
      if (isProctorActiveRef.current) {
        startSampling();
      }
    } catch (err) {
      console.error("[AudioProctor] Mic init failed:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        if (isProctorActiveRef.current) {
          reportViolation("audio-permission-denied");
        }
      } else {
        if (isProctorActiveRef.current) {
          reportViolation("audio-mic-disconnected");
        }
      }
      // Always fire onReady so prelaunch countdown does not hang forever
      console.log("[AudioProctor] Mic init failed, still firing onReady to unblock prelaunch");
      setTimeout(() => {
        onReadyRef.current?.();
      }, 0);
    }
    initStartedRef.current = false;
  }, [startSampling, reportViolation]);

  // ── Effect: initialize mic when test session starts; release when session ends
  useEffect(() => {
    if (isTestActive) {
      if (!initializedRef.current && !initStartedRef.current) {
        initStartedRef.current = true;
        initMicrophone();
      }
    } else {
      stopSampling();
      // Exam finished: completely release mic hardware
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
  }, [isTestActive, initMicrophone, stopSampling]);

  // ── Effect: start/stop sampling loop based on isProctorActive ──────────────
  useEffect(() => {
    if (isTestActive && isProctorActive && initializedRef.current) {
      startSampling();
    } else {
      stopSampling();
      noiseFramesRef.current = 0;
    }
  }, [isTestActive, isProctorActive, startSampling, stopSampling]);

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
