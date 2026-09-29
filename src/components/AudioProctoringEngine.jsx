import React, { useEffect, useRef, useCallback } from "react";

// AudioProctoringEngine
// Monitors student microphone using Web Audio API (AudioContext + AnalyserNode)
// and native Web Speech API (SpeechRecognition).
//
// CALIBRATED DESIGN:
// 1. RMS threshold 0.025 & Peak 0.080: Calibrated for human speech while ignoring keyboard clacks.
// 2. Hold Duration: 7 frames (700ms) sustained sound required to discard single clicks/taps/coughs.
// 3. Crest Factor Rejection: Discards sharp transient impulses (Peak/RMS > 4.5) caused by keyboard typing.
// 4. Acoustic Classifier: Categorizes noise (Speech, Music, Fan Hum, General Noise).
// 5. Speech Recognition: Transcribes spoken words and flags suspicious exam keywords in real time.
// 6. Clean Hardware Lifecycle: Keeps mic alive across test sections; tears down completely upon submission.

const DEFAULT_SAMPLE_INTERVAL_MS = 100;
const DEFAULT_NOISE_HOLD_FRAMES   = 7;      // 7 frames (~700ms) - human speech phonemes, rejects typing
const DEFAULT_NOISE_THRESHOLD     = 0.025;  // RMS threshold tuned for clear speech volume (~0.035+)
const DEFAULT_PEAK_THRESHOLD      = 0.080;  // Peak threshold (typing transients produce ~0.04-0.06)
const DEFAULT_COOLDOWN_MS         = 3000;   // 3s cooldown between reported violations
const DEFAULT_PREAMP_GAIN         = 1.2;    // Clean 1.2x digital preamp without room hiss distortion
const DEFAULT_BURST_MULTIPLIER    = 3.5;    // Shouting / loud music bypass multiplier
const DEFAULT_VOCAL_THRESHOLD     = 35;     // Energy threshold in 85Hz - 3000Hz band

const SUSPICIOUS_EXAM_KEYWORDS = [
  "answer",
  "question",
  "option",
  "code",
  "solution",
  "help",
  "solve",
  "google",
  "chatgpt",
  "copy",
  "paste",
  "select",
  "choice",
  "tell me",
  "what is"
];

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
  preampGain = DEFAULT_PREAMP_GAIN,
  vocalEnergyThreshold = DEFAULT_VOCAL_THRESHOLD,
  burstMultiplier = DEFAULT_BURST_MULTIPLIER,
  enableTypingFilter = true,
  enableSpeechRecognition = true,
  onViolationUpdate,
  onReady,
}) => {
  // Keep latest callbacks in refs so closures never go stale
  const onViolationRef = useRef(onViolationUpdate);
  const onReadyRef     = useRef(onReady);
  useEffect(() => { onViolationRef.current = onViolationUpdate; }, [onViolationUpdate]);
  useEffect(() => { onReadyRef.current = onReady; },             [onReady]);

  // Internal resources
  const audioCtxRef       = useRef(null);
  const analyserRef       = useRef(null);
  const streamRef         = useRef(null);
  const intervalRef       = useRef(null);
  const recognitionRef    = useRef(null);
  const speechActiveRef   = useRef(false);

  // Counters / guards
  const noiseFramesRef       = useRef(0);
  const lastViolationRef     = useRef(0);
  const violationCountRef    = useRef(0);
  const noiseFloorRef        = useRef(0.005); // Dynamic ambient noise floor tracking (EMA)
  const initializedRef       = useRef(false); // mic stream acquired
  const initStartedRef       = useRef(false); // getUserMedia in-flight
  const latestTranscriptRef  = useRef("");
  const recentKeywordsRef    = useRef([]);

  // ── Violation reporter ────────────────────────────────────────────────────
  const reportViolation = useCallback((type, extra = {}) => {
    const now = Date.now();
    if (now - lastViolationRef.current < cooldownMs) return;
    lastViolationRef.current = now;
    const newCount = ++violationCountRef.current;

    const wordsSpoken = latestTranscriptRef.current || null;
    const flaggedKeywords = recentKeywordsRef.current.length > 0 ? [...recentKeywordsRef.current] : null;

    const payload = {
      type,
      count: newCount,
      maxViolations,
      timestamp: new Date().toISOString(),
      uid,
      assessmentId,
      wordsSpoken,
      flaggedKeywords,
      ...extra
    };

    console.warn(`[AudioProctor] Violation #${newCount}: ${type}`, payload);

    // Clear transcript buffer once reported
    latestTranscriptRef.current = "";
    recentKeywordsRef.current = [];

    setTimeout(() => {
      onViolationRef.current?.(payload);
    }, 0);
  }, [maxViolations, uid, assessmentId, cooldownMs]);

  // ── Multi-Band Audio Metrics (RMS + Peak + Spectral Bands) ───────────────────
  const getAudioMetrics = useCallback(() => {
    if (!analyserRef.current) return { rms: 0, peak: 0, vocalEnergy: 0, subBassEnergy: 0, highBandEnergy: 0 };
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

    // 2. Frequency domain analysis (Multi-band spectral energy)
    let subBassEnergy = 0; // 30Hz - 150Hz: Fan hum / room rumble
    let vocalEnergy = 0;   // 85Hz - 3000Hz: Human vocal formants
    let highBandEnergy = 0; // 3500Hz - 10000Hz: Key clicks, mouse clicks

    try {
      const freqData = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(freqData);
      const binSize = (audioCtxRef.current?.sampleRate ? audioCtxRef.current.sampleRate / 2 : 24000) / freqData.length;

      // Sub-bass band (30 - 150 Hz)
      const bSubStart = Math.max(0, Math.floor(30 / binSize));
      const bSubEnd   = Math.min(freqData.length - 1, Math.ceil(150 / binSize));
      let subSum = 0, subCount = 0;
      for (let b = bSubStart; b <= bSubEnd; b++) { subSum += freqData[b]; subCount++; }
      subBassEnergy = subCount > 0 ? (subSum / subCount) : 0;

      // Vocal band (85 - 3000 Hz)
      const bVocStart = Math.max(0, Math.floor(85 / binSize));
      const bVocEnd   = Math.min(freqData.length - 1, Math.ceil(3000 / binSize));
      let vocSum = 0, vocCount = 0;
      for (let b = bVocStart; b <= bVocEnd; b++) { vocSum += freqData[b]; vocCount++; }
      vocalEnergy = vocCount > 0 ? (vocSum / vocCount) : 0;

      // High transient band (3500 - 10000 Hz)
      const bHighStart = Math.max(0, Math.floor(3500 / binSize));
      const bHighEnd   = Math.min(freqData.length - 1, Math.ceil(10000 / binSize));
      let highSum = 0, highCount = 0;
      for (let b = bHighStart; b <= bHighEnd; b++) { highSum += freqData[b]; highCount++; }
      highBandEnergy = highCount > 0 ? (highSum / highCount) : 0;
    } catch (_) {}

    return { rms, peak, vocalEnergy, subBassEnergy, highBandEnergy };
  }, []);

  // ── Speech Recognition Lifecycle ──────────────────────────────────────────
  const startSpeechRecognition = useCallback(() => {
    if (!enableSpeechRecognition) return;
    const SpeechRecognition = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
    if (!SpeechRecognition) return;

    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (_) {}
      }

      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onresult = (event) => {
        let transcript = "";
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript + " ";
        }
        const clean = transcript.trim();
        if (clean) {
          latestTranscriptRef.current = clean;

          // Check for suspicious exam keywords
          const lower = clean.toLowerCase();
          const matched = SUSPICIOUS_EXAM_KEYWORDS.filter(k => lower.includes(k));
          if (matched.length > 0) {
            recentKeywordsRef.current = Array.from(new Set([...recentKeywordsRef.current, ...matched]));
          }
        }
      };

      rec.onerror = (e) => {
        if (e.error !== "no-speech") {
          console.log("[AudioProctor] SpeechRecognition info:", e.error);
        }
      };

      rec.onend = () => {
        // Keep listening as long as test is active
        if (speechActiveRef.current && recognitionRef.current) {
          try { rec.start(); } catch (_) {}
        }
      };

      rec.start();
      recognitionRef.current = rec;
      speechActiveRef.current = true;
      window.__sebSpeechRecognition = rec;
    } catch (err) {
      console.warn("[AudioProctor] SpeechRecognition initialization notice:", err);
    }
  }, [enableSpeechRecognition]);

  const stopSpeechRecognition = useCallback(() => {
    speechActiveRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (_) {}
      recognitionRef.current = null;
    }
    if (window.__sebSpeechRecognition) {
      try { window.__sebSpeechRecognition.abort(); } catch (_) {}
      window.__sebSpeechRecognition = null;
    }
    latestTranscriptRef.current = "";
    recentKeywordsRef.current = [];
  }, []);

  // ── Sampling Loop (100ms interval) ────────────────────────────────────────
  const startSampling = useCallback(() => {
    if (intervalRef.current) return;

    intervalRef.current = setInterval(() => {
      // 1. Check if mic track is still active
      if (streamRef.current) {
        const tracks = streamRef.current.getAudioTracks();
        if (!tracks.length || tracks[0].readyState === "ended") {
          reportViolation("audio-mic-disconnected");
          return;
        }
      }

      const { rms, peak, vocalEnergy, subBassEnergy, highBandEnergy } = getAudioMetrics();

      // 2. Dynamically adapt ambient noise baseline during quiet periods
      if (rms < noiseThreshold * 1.5) {
        noiseFloorRef.current = noiseFloorRef.current * 0.95 + rms * 0.05;
      }

      // 3. Crest Factor = Peak / RMS (ratio of instantaneous spike to continuous power)
      // Keystrokes & mouse clicks: Crest Factor > 4.5 (sharp spike, fast decay)
      // Voiced speech: Crest Factor 1.8 - 3.5 (sustained harmonics)
      const crestFactor = rms > 0.001 ? (peak / rms) : 0;

      // 4. Typing rejection filter
      const isTypingTransient = enableTypingFilter && crestFactor > 4.5 && vocalEnergy < (vocalEnergyThreshold * 1.15);

      // 5. Sound presence conditions
      const requiredRms = Math.max(noiseThreshold, noiseFloorRef.current * 1.75);
      const isElevatedRms = rms > requiredRms;
      const isVocalPattern = vocalEnergy > vocalEnergyThreshold;
      const hasSpokenWords = !!latestTranscriptRef.current;

      // Ignore if it's purely a keyboard transient attack
      let isVoiceOrNoise = false;
      let noiseType = "noise";

      if (!isTypingTransient) {
        if (hasSpokenWords || (isVocalPattern && rms > noiseThreshold * 0.8)) {
          isVoiceOrNoise = true;
          noiseType = "speech";
        } else if (isElevatedRms) {
          isVoiceOrNoise = true;
          // Classify whether it's broad-spectrum media/song or ambient noise
          if (subBassEnergy > 20 && vocalEnergy > 20 && highBandEnergy > 15) {
            noiseType = "music";
          } else if (subBassEnergy > vocalEnergy * 1.4 && subBassEnergy > 25) {
            noiseType = "fan_hum";
          } else {
            noiseType = "ambient_noise";
          }
        }
      }

      if (isVoiceOrNoise) {
        noiseFramesRef.current += 1;
        // Sustained phonation (7 frames = 700ms) OR extreme loud burst (shouting / loud speakers)
        const isSustained = noiseFramesRef.current >= holdFrames;
        const isLoudBurst = rms > (noiseThreshold * burstMultiplier);

        if (isSustained || isLoudBurst) {
          reportViolation("audio-noise-detected", {
            rms,
            peak,
            vocalEnergy,
            noiseFloor: noiseFloorRef.current,
            crestFactor,
            noiseType,
            rule: isLoudBurst ? "loud_burst" : `sustained_${holdFrames * 100}ms`
          });
          noiseFramesRef.current = 0;
        }
      } else {
        noiseFramesRef.current = Math.max(0, noiseFramesRef.current - 1);
      }
    }, sampleIntervalMs);
  }, [
    getAudioMetrics,
    reportViolation,
    noiseThreshold,
    holdFrames,
    sampleIntervalMs,
    vocalEnergyThreshold,
    burstMultiplier,
    enableTypingFilter
  ]);

  const stopSampling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // ── Mic initialisation (runs once) ────────────────────────────────────────
  const initMicrophone = useCallback(async () => {
    try {
      console.log("[AudioProctor] Initializing calibrated microphone proctoring...");
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false, // Prevents ducking/choking speech and background audio
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
      analyser.fftSize = 2048; // High resolution 43ms window
      analyser.smoothingTimeConstant = 0.2;

      // Digital Preamp Gain Node (1.2x gain) - calibrated to avoid clipping and ambient amplification
      const source = ctx.createMediaStreamSource(stream);
      const gainNode = ctx.createGain();
      gainNode.gain.value = preampGain;
      source.connect(gainNode);
      gainNode.connect(analyser);

      audioCtxRef.current = ctx;
      window.__sebAudioContext = ctx;
      analyserRef.current = analyser;
      initializedRef.current = true;

      console.log(`[AudioProctor] Mic initialized with ${preampGain}x preamp gain & noise cancellation. Firing onReady.`);
      setTimeout(() => {
        onReadyRef.current?.();
      }, 0);

      startSampling();
      startSpeechRecognition();
    } catch (err) {
      console.error("[AudioProctor] Mic init failed:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        reportViolation("audio-permission-denied");
      } else {
        reportViolation("audio-mic-disconnected");
      }
      // Always fire onReady so prelaunch countdown does not hang
      setTimeout(() => {
        onReadyRef.current?.();
      }, 0);
    }
    initStartedRef.current = false;
  }, [startSampling, startSpeechRecognition, reportViolation, preampGain]);

  // ── Effect: start mic on first activation, pause/resume sampling ──────────
  useEffect(() => {
    const active = isTestActive && isProctorActive;

    if (active) {
      if (!initializedRef.current && !initStartedRef.current) {
        initStartedRef.current = true;
        initMicrophone();
      } else if (initializedRef.current) {
        startSampling();
        startSpeechRecognition();
      }
    } else {
      stopSampling();
      stopSpeechRecognition();
      if (!isTestActive) {
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
    }
  }, [isTestActive, isProctorActive, initMicrophone, startSampling, stopSampling, startSpeechRecognition, stopSpeechRecognition]);

  // ── Teardown on unmount or submission event ──────────────────────────────
  useEffect(() => {
    const handleHardwareTeardown = () => {
      console.log("[AudioProctor] Hardware teardown event received — stopping microphone and speech engine");
      stopSampling();
      stopSpeechRecognition();
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
      console.log("[AudioProctor] Unmounting — releasing mic and speech resources");
      window.removeEventListener('seb:stop-proctoring-hardware', handleHardwareTeardown);
      stopSampling();
      stopSpeechRecognition();
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
  }, [stopSampling, stopSpeechRecognition]);

  return null;
};

export default React.memo(AudioProctoringEngine);
