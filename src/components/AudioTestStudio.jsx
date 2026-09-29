import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sliders,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  Info,
  ShieldAlert,
  Radio,
  Keyboard,
  Ear,
  Wind,
  Music,
  Headphones,
  Laptop,
  MessageSquare,
  Search,
  Tag
} from "lucide-react";

// Preset configurations
const PRESETS = {
  currentProduction: {
    name: "Current Production (High False-Positives)",
    description: "Current settings in SEED-SEB: 3.5x preamp, 0.0045 RMS threshold, 200ms hold, raw mic, AGC ON. Triggers on typing & room fan, but steady music gets absorbed into the noise floor.",
    badge: "Exploding Violations",
    badgeColor: "bg-red-500/20 text-red-400 border-red-500/30",
    gain: 3.5,
    noiseThreshold: 0.0045,
    peakThreshold: 0.015,
    holdFrames: 2,
    burstMultiplier: 2.2,
    vocalEnergyThreshold: 24,
    enableTypingFilter: false,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: true,
    cooldownMs: 3000,
  },
  recommendedBalanced: {
    name: "Recommended Balanced (Production Fix)",
    description: "1.2x preamp, 0.025 RMS threshold, 700ms sustained hold, browser noise suppression ON, typing transient rejection ON.",
    badge: "Recommended",
    badgeColor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    gain: 1.2,
    noiseThreshold: 0.025,
    peakThreshold: 0.080,
    holdFrames: 7,
    burstMultiplier: 3.5,
    vocalEnergyThreshold: 35,
    enableTypingFilter: true,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: false,
    cooldownMs: 3000,
  },
  musicAndSpeechDetection: {
    name: "Music + Speech Detector (Anti-Cheating)",
    description: "Tuned to detect songs, music, and spoken answers from phones or background speakers, while ignoring typing. Fixed baseline floor.",
    badge: "Music & Voice",
    badgeColor: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
    gain: 2.0,
    noiseThreshold: 0.012,
    peakThreshold: 0.045,
    holdFrames: 5,
    burstMultiplier: 3.0,
    vocalEnergyThreshold: 28,
    enableTypingFilter: true,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    cooldownMs: 3000,
  },
  examHallLab: {
    name: "Exam Hall / College Lab",
    description: "Designed for shared computer labs with 50+ students typing. 1.0x gain, higher 0.040 RMS, 900ms hold.",
    badge: "High-Noise Lab",
    badgeColor: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    gain: 1.0,
    noiseThreshold: 0.040,
    peakThreshold: 0.120,
    holdFrames: 9,
    burstMultiplier: 3.5,
    vocalEnergyThreshold: 45,
    enableTypingFilter: true,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: false,
    cooldownMs: 4000,
  },
};

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
  "what is",
  "next",
  "submit"
];

export default function AudioTestStudio() {
  // Mic state
  const [isMicActive, setIsMicActive] = useState(false);
  const [micError, setMicError] = useState(null);
  const [selectedPreset, setSelectedPreset] = useState("currentProduction");

  // Calibratable parameters
  const [gain, setGain] = useState(PRESETS.currentProduction.gain);
  const [noiseThreshold, setNoiseThreshold] = useState(PRESETS.currentProduction.noiseThreshold);
  const [peakThreshold, setPeakThreshold] = useState(PRESETS.currentProduction.peakThreshold);
  const [holdFrames, setHoldFrames] = useState(PRESETS.currentProduction.holdFrames);
  const [burstMultiplier, setBurstMultiplier] = useState(PRESETS.currentProduction.burstMultiplier);
  const [vocalEnergyThreshold, setVocalEnergyThreshold] = useState(PRESETS.currentProduction.vocalEnergyThreshold);
  const [enableTypingFilter, setEnableTypingFilter] = useState(PRESETS.currentProduction.enableTypingFilter);
  const [echoCancellation, setEchoCancellation] = useState(PRESETS.currentProduction.echoCancellation);
  const [noiseSuppression, setNoiseSuppression] = useState(PRESETS.currentProduction.noiseSuppression);
  const [autoGainControl, setAutoGainControl] = useState(PRESETS.currentProduction.autoGainControl);
  const [cooldownMs, setCooldownMs] = useState(PRESETS.currentProduction.cooldownMs);
  const [isBeepEnabled, setIsBeepEnabled] = useState(true);

  // Speech Recognition state (What word was spoken?)
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [detectedKeywords, setDetectedKeywords] = useState([]);
  const [lastSpokenPhrase, setLastSpokenPhrase] = useState("");

  // Acoustic Noise Classification (What noise is this?)
  const [acousticCategory, setAcousticCategory] = useState({
    type: "silence",
    label: "Silence / Standby",
    description: "Background ambient room noise",
    icon: "🤫",
    badgeColor: "bg-slate-800 text-slate-300 border-slate-700",
  });

  // Real-time live audio stats
  const [liveStats, setLiveStats] = useState({
    rms: 0,
    peak: 0,
    vocalEnergy: 0,
    subBassEnergy: 0,
    highBandEnergy: 0,
    noiseFloor: 0.002,
    requiredDistantRms: 0.0045,
    snrDb: 0,
    crestFactor: 0,
    holdProgress: 0,
    isVoiceOrNoise: false,
    triggerReason: null,
    isDistantVoice: false,
    isSharpTransient: false,
    isVocalPattern: false,
    isLikelyKeystroke: false,
  });

  // Violation log
  const [violations, setViolations] = useState([]);
  const [copiedType, setCopiedType] = useState(null);

  // Web Audio refs
  const audioCtxRef = useRef(null);
  const streamRef = useRef(null);
  const gainNodeRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const samplingIntervalRef = useRef(null);
  const recognitionRef = useRef(null);

  // Real-time ref flags for canvas drawing without stale closure issues
  const isVoiceActiveRef = useRef(false);

  // Check speech recognition capability
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      setIsSpeechSupported(!!SR);
    }
  }, []);

  // State refs for the sampling loop to read without recreating interval
  const paramsRef = useRef({
    gain,
    noiseThreshold,
    peakThreshold,
    holdFrames,
    burstMultiplier,
    vocalEnergyThreshold,
    enableTypingFilter,
    cooldownMs,
    isBeepEnabled,
  });

  // Keep paramsRef up to date
  useEffect(() => {
    paramsRef.current = {
      gain,
      noiseThreshold,
      peakThreshold,
      holdFrames,
      burstMultiplier,
      vocalEnergyThreshold,
      enableTypingFilter,
      cooldownMs,
      isBeepEnabled,
    };
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = gain;
    }
  }, [
    gain,
    noiseThreshold,
    peakThreshold,
    holdFrames,
    burstMultiplier,
    vocalEnergyThreshold,
    enableTypingFilter,
    cooldownMs,
    isBeepEnabled,
  ]);

  // Canvas visualizer refs
  const waveformCanvasRef = useRef(null);
  const spectrumCanvasRef = useRef(null);

  // Audio processing tracking refs
  const noiseFramesRef = useRef(0);
  const noiseFloorRef = useRef(0.002);
  const lastViolationRef = useRef(0);
  const violationCountRef = useRef(0);
  const liveTranscriptRef = useRef("");

  // Play warning beep
  const playAlertBeep = useCallback(() => {
    if (!paramsRef.current.isBeepEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      g.gain.setValueAtTime(0.12, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch (_) {}
  }, []);

  // Teardown microphone and speech recognition
  const stopMicrophone = useCallback(() => {
    if (samplingIntervalRef.current) {
      clearInterval(samplingIntervalRef.current);
      samplingIntervalRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (_) {}
      recognitionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    gainNodeRef.current = null;
    analyserRef.current = null;
    isVoiceActiveRef.current = false;
    setIsMicActive(false);
    noiseFramesRef.current = 0;
    setLiveTranscript("");
  }, []);

  // Initialize microphone and speech recognition
  const startMicrophone = useCallback(async () => {
    stopMicrophone();
    setMicError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation,
          noiseSuppression,
          autoGainControl,
        },
        video: false,
      });
      streamRef.current = stream;

      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") await ctx.resume();
      audioCtxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.2;
      analyserRef.current = analyser;

      const source = ctx.createMediaStreamSource(stream);
      const gainNode = ctx.createGain();
      gainNode.gain.value = gain;
      gainNodeRef.current = gainNode;

      source.connect(gainNode);
      gainNode.connect(analyser);

      setIsMicActive(true);

      // Start Speech Recognition (What words were spoken?)
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const rec = new SpeechRecognition();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = "en-US";

          rec.onresult = (event) => {
            let fullTranscript = "";
            for (let i = 0; i < event.results.length; i++) {
              fullTranscript += event.results[i][0].transcript + " ";
            }
            const clean = fullTranscript.trim();
            setLiveTranscript(clean);
            liveTranscriptRef.current = clean;
            setLastSpokenPhrase(clean);

            // Scan for suspicious exam keywords
            const matched = SUSPICIOUS_EXAM_KEYWORDS.filter((k) =>
              clean.toLowerCase().includes(k)
            );
            if (matched.length > 0) {
              setDetectedKeywords((prev) => Array.from(new Set([...prev, ...matched])));
            }
          };

          rec.onerror = (e) => {
            if (e.error !== "no-speech") {
              console.log("[SpeechRecognition] Info:", e.error);
            }
          };

          rec.onend = () => {
            // Keep speech recognition continuously listening if mic is still active
            if (isVoiceActiveRef.current && recognitionRef.current) {
              try {
                rec.start();
              } catch (_) {}
            }
          };

          rec.start();
          recognitionRef.current = rec;
        } catch (e) {
          console.warn("[SpeechRecognition] Note:", e);
        }
      }

      // Start Sampling Loop (every 100ms)
      samplingIntervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;

        const p = paramsRef.current;
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

        // Acoustic Spectral Energy Bands (Classifier for Noise Type):
        // 1. Sub-bass (30Hz - 150Hz): Room rumble, AC, fan hum
        // 2. Vocal band (85Hz - 3000Hz): Human voice vowels and formants
        // 3. High band (3500Hz - 10000Hz): Mechanical keyboard clacks, mouse clicks, hiss
        let subBassEnergy = 0;
        let vocalEnergy = 0;
        let highBandEnergy = 0;

        try {
          const freqData = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(freqData);
          const binSize = (ctx.sampleRate / 2) / freqData.length;

          const bSubStart = Math.max(0, Math.floor(30 / binSize));
          const bSubEnd = Math.min(freqData.length - 1, Math.ceil(150 / binSize));
          let subSum = 0;
          let subCount = 0;
          for (let b = bSubStart; b <= bSubEnd; b++) {
            subSum += freqData[b];
            subCount++;
          }
          subBassEnergy = subCount > 0 ? subSum / subCount : 0;

          const bVocStart = Math.max(0, Math.floor(85 / binSize));
          const bVocEnd = Math.min(freqData.length - 1, Math.ceil(3000 / binSize));
          let vocSum = 0;
          let vocCount = 0;
          for (let b = bVocStart; b <= bVocEnd; b++) {
            vocSum += freqData[b];
            vocCount++;
          }
          vocalEnergy = vocCount > 0 ? vocSum / vocCount : 0;

          const bHighStart = Math.max(0, Math.floor(3500 / binSize));
          const bHighEnd = Math.min(freqData.length - 1, Math.ceil(10000 / binSize));
          let highSum = 0;
          let highCount = 0;
          for (let b = bHighStart; b <= bHighEnd; b++) {
            highSum += freqData[b];
            highCount++;
          }
          highBandEnergy = highCount > 0 ? highSum / highCount : 0;
        } catch (_) {}

        // Ambient noise floor tracker (EMA during quiet periods)
        if (rms < p.noiseThreshold * 1.6) {
          noiseFloorRef.current = noiseFloorRef.current * 0.95 + rms * 0.05;
        }

        // Crest factor = Peak / RMS (measures spikiness vs smoothness)
        // Keystrokes typically have Crest Factor > 4.5
        // Vowel phonation / speech has Crest Factor 2.0 - 3.5
        const crestFactor = rms > 0.001 ? peak / rms : 0;
        const snrDb = noiseFloorRef.current > 0 ? Math.max(0, 20 * Math.log10(rms / noiseFloorRef.current)) : 0;

        // Dynamic threshold for distant voice
        const requiredDistantRms = Math.max(p.noiseThreshold, noiseFloorRef.current * 1.75);
        const isDistantVoice = rms > requiredDistantRms;
        const isSharpTransient = peak > p.peakThreshold;
        const isVocalPattern = vocalEnergy > p.vocalEnergyThreshold;

        // Typing / Sharp Transient Rejection Filter
        const isLikelyKeystroke = p.enableTypingFilter && crestFactor > 4.5 && vocalEnergy < (p.vocalEnergyThreshold * 1.2);

        // Acoustic Noise Classifier Logic (What noise is this?)
        if (rms < 0.002) {
          setAcousticCategory({
            type: "silence",
            label: "Silence / Quiet Room",
            description: "Ambient baseline room noise",
            icon: "🤫",
            badgeColor: "bg-slate-800 text-slate-300 border-slate-700",
          });
        } else if (crestFactor > 4.5 && highBandEnergy > vocalEnergy * 0.6) {
          setAcousticCategory({
            type: "typing",
            label: "Keyboard Typing / Transient Click",
            description: `Sharp impulse detected (Crest: ${crestFactor.toFixed(1)} > 4.5 | High-Freq Spike)`,
            icon: "⌨️",
            badgeColor: "bg-amber-950/60 text-amber-300 border-amber-800",
          });
        } else if (liveTranscriptRef.current || (vocalEnergy > 26 && crestFactor < 4.0)) {
          setAcousticCategory({
            type: "speech",
            label: "Human Voice / Speech",
            description: `Sustained vocal harmonics (85Hz-3kHz: ${vocalEnergy.toFixed(0)} | Crest: ${crestFactor.toFixed(1)})`,
            icon: "🗣️",
            badgeColor: "bg-emerald-950/60 text-emerald-300 border-emerald-800",
          });
        } else if (rms > 0.010 && subBassEnergy > 20 && vocalEnergy > 20 && highBandEnergy > 15) {
          setAcousticCategory({
            type: "music",
            label: "Music / Song / Audio Playback",
            description: "Broad-spectrum continuous audio spanning bass, mids, and highs",
            icon: "🎵",
            badgeColor: "bg-indigo-950/60 text-indigo-300 border-indigo-800",
          });
        } else if (subBassEnergy > vocalEnergy * 1.4 && subBassEnergy > 25) {
          setAcousticCategory({
            type: "fan",
            label: "Fan / AC / Stationary Hum",
            description: "Low-frequency monotone rumble (< 150 Hz)",
            icon: "💨",
            badgeColor: "bg-purple-950/60 text-purple-300 border-purple-800",
          });
        } else {
          setAcousticCategory({
            type: "noise",
            label: "General Acoustic Noise",
            description: "Ambient room acoustic activity",
            icon: "🔊",
            badgeColor: "bg-blue-950/60 text-blue-300 border-blue-800",
          });
        }

        let isVoiceOrNoise = false;
        let triggerReason = null;

        if (p.enableTypingFilter) {
          if (!isLikelyKeystroke && (isDistantVoice || (isVocalPattern && rms > p.noiseThreshold * 0.8))) {
            isVoiceOrNoise = true;
            triggerReason = isVocalPattern ? "Vocal Pattern (85-3000Hz)" : "RMS Exceeded Baseline";
          }
        } else {
          isVoiceOrNoise = isDistantVoice || isSharpTransient || isVocalPattern;
          if (isSharpTransient) triggerReason = "Sharp Peak Transient";
          else if (isVocalPattern) triggerReason = "Vocal Range Energy";
          else if (isDistantVoice) triggerReason = "RMS Above Threshold";
        }

        isVoiceActiveRef.current = isVoiceOrNoise;

        if (isVoiceOrNoise) {
          noiseFramesRef.current += 1;
          const isSustained = noiseFramesRef.current >= p.holdFrames;
          const isLoudBurst = rms > (p.noiseThreshold * p.burstMultiplier) || (
            !p.enableTypingFilter && peak > (p.peakThreshold * p.burstMultiplier)
          );

          if (isSustained || isLoudBurst) {
            const now = Date.now();
            if (now - lastViolationRef.current >= p.cooldownMs) {
              lastViolationRef.current = now;
              violationCountRef.current += 1;
              const rule = isLoudBurst ? "Loud Burst Event" : `Sustained Sound (${p.holdFrames} frames / ${p.holdFrames * 100}ms)`;

              playAlertBeep();

              const capturedWords = liveTranscriptRef.current || null;

              setViolations((prev) => [
                {
                  id: Date.now() + Math.random(),
                  count: violationCountRef.current,
                  time: new Date().toLocaleTimeString(),
                  rule,
                  reason: triggerReason || "Audio Threshold Triggered",
                  rms: rms.toFixed(4),
                  peak: peak.toFixed(4),
                  vocalEnergy: vocalEnergy.toFixed(1),
                  noiseFloor: noiseFloorRef.current.toFixed(4),
                  crestFactor: crestFactor.toFixed(2),
                  wordsSpoken: capturedWords,
                },
                ...prev.slice(0, 49),
              ]);
            }
            noiseFramesRef.current = 0;
          }
        } else {
          noiseFramesRef.current = Math.max(0, noiseFramesRef.current - 1);
        }

        setLiveStats({
          rms,
          peak,
          vocalEnergy,
          subBassEnergy,
          highBandEnergy,
          noiseFloor: noiseFloorRef.current,
          requiredDistantRms,
          snrDb,
          crestFactor,
          holdProgress: Math.min(100, (noiseFramesRef.current / p.holdFrames) * 100),
          isVoiceOrNoise,
          triggerReason,
          isDistantVoice,
          isSharpTransient,
          isVocalPattern,
          isLikelyKeystroke,
        });
      }, 100);

      // Start Canvas Oscilloscope & Spectrum Renderer
      const drawCanvas = () => {
        if (!analyserRef.current) return;

        // 1. Draw Waveform
        const waveCanvas = waveformCanvasRef.current;
        if (waveCanvas) {
          const wCtx = waveCanvas.getContext("2d");
          const width = waveCanvas.width;
          const height = waveCanvas.height;
          const timeData = new Uint8Array(analyserRef.current.fftSize);
          analyserRef.current.getByteTimeDomainData(timeData);

          wCtx.fillStyle = "#090d16";
          wCtx.fillRect(0, 0, width, height);

          wCtx.strokeStyle = "rgba(255, 255, 255, 0.08)";
          wCtx.lineWidth = 1;
          wCtx.beginPath();
          wCtx.moveTo(0, height / 2);
          wCtx.lineTo(width, height / 2);
          wCtx.stroke();

          const active = isVoiceActiveRef.current;
          wCtx.lineWidth = 2;
          wCtx.strokeStyle = active ? "#ef4444" : "#10b981";
          wCtx.shadowBlur = 8;
          wCtx.shadowColor = active ? "rgba(239, 68, 68, 0.6)" : "rgba(16, 185, 129, 0.6)";
          wCtx.beginPath();

          const sliceWidth = width / timeData.length;
          let x = 0;
          for (let i = 0; i < timeData.length; i++) {
            const v = timeData[i] / 128.0;
            const y = (v * height) / 2;
            if (i === 0) wCtx.moveTo(x, y);
            else wCtx.lineTo(x, y);
            x += sliceWidth;
          }
          wCtx.lineTo(width, height / 2);
          wCtx.stroke();
          wCtx.shadowBlur = 0;
        }

        // 2. Draw Spectrum
        const specCanvas = spectrumCanvasRef.current;
        if (specCanvas) {
          const sCtx = specCanvas.getContext("2d");
          const width = specCanvas.width;
          const height = specCanvas.height;
          const freqData = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(freqData);

          sCtx.fillStyle = "#090d16";
          sCtx.fillRect(0, 0, width, height);

          const barCount = 64;
          const barWidth = width / barCount;
          const binStep = Math.floor(freqData.length / barCount);

          for (let i = 0; i < barCount; i++) {
            const val = freqData[i * binStep];
            const barHeight = (val / 255) * height;

            const isVocalBin = i >= 3 && i <= 22;

            if (isVocalBin) {
              sCtx.fillStyle = val > 40 ? "#38bdf8" : "#0284c7";
            } else {
              sCtx.fillStyle = "#334155";
            }

            sCtx.fillRect(i * barWidth, height - barHeight, barWidth - 1.5, barHeight);
          }

          sCtx.fillStyle = "rgba(56, 189, 248, 0.25)";
          sCtx.fillRect(3 * barWidth, 0, (22 - 3) * barWidth, 18);
          sCtx.fillStyle = "#bae6fd";
          sCtx.font = "10px sans-serif";
          sCtx.fillText("Human Vocal Band (85Hz - 3kHz)", 3 * barWidth + 6, 12);
        }

        animationFrameRef.current = requestAnimationFrame(drawCanvas);
      };

      animationFrameRef.current = requestAnimationFrame(drawCanvas);
    } catch (err) {
      console.error("[AudioTestStudio] Mic access error:", err);
      setMicError(err.message || "Failed to access microphone. Please allow microphone permissions.");
      setIsMicActive(false);
    }
  }, [echoCancellation, noiseSuppression, autoGainControl, gain, stopMicrophone, playAlertBeep]);

  // Restart mic when hardware toggles change if mic is active
  useEffect(() => {
    if (isMicActive) {
      startMicrophone();
    }
  }, [echoCancellation, noiseSuppression, autoGainControl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMicrophone();
    };
  }, [stopMicrophone]);

  // Apply a preset
  const applyPreset = (key) => {
    const p = PRESETS[key];
    if (!p) return;
    setSelectedPreset(key);
    setGain(p.gain);
    setNoiseThreshold(p.noiseThreshold);
    setPeakThreshold(p.peakThreshold);
    setHoldFrames(p.holdFrames);
    setBurstMultiplier(p.burstMultiplier);
    setVocalEnergyThreshold(p.vocalEnergyThreshold);
    setEnableTypingFilter(p.enableTypingFilter);
    setEchoCancellation(p.echoCancellation);
    setNoiseSuppression(p.noiseSuppression);
    setAutoGainControl(p.autoGainControl);
    setCooldownMs(p.cooldownMs);
  };

  // Copy values to clipboard
  const copyJSON = () => {
    const config = {
      gainNode_gain_value: gain,
      DEFAULT_NOISE_THRESHOLD: noiseThreshold,
      DEFAULT_PEAK_THRESHOLD: peakThreshold,
      DEFAULT_NOISE_HOLD_FRAMES: holdFrames,
      DEFAULT_COOLDOWN_MS: cooldownMs,
      BURST_MULTIPLIER: burstMultiplier,
      VOCAL_ENERGY_THRESHOLD: vocalEnergyThreshold,
      ENABLE_TYPING_FILTER: enableTypingFilter,
      BROWSER_CONSTRAINTS: {
        echoCancellation,
        noiseSuppression,
        autoGainControl,
      },
    };
    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    setCopiedType("json");
    setTimeout(() => setCopiedType(null), 2500);
  };

  const copyCodeSnippet = () => {
    const snippet = `// Calibrated Audio Proctoring Parameters
const DEFAULT_SAMPLE_INTERVAL_MS = 100;
const DEFAULT_NOISE_HOLD_FRAMES   = ${holdFrames};       // ${holdFrames * 100}ms sustained vocal phonation required
const DEFAULT_NOISE_THRESHOLD     = ${noiseThreshold};  // RMS threshold
const DEFAULT_PEAK_THRESHOLD      = ${peakThreshold};   // Peak threshold
const DEFAULT_COOLDOWN_MS         = ${cooldownMs};    // Cooldown between warnings
const PREAMP_GAIN                 = ${gain};         // Digital preamp multiplier
const BURST_MULTIPLIER            = ${burstMultiplier};       // Burst multiplier for shouting
const VOCAL_ENERGY_THRESHOLD      = ${vocalEnergyThreshold};        // Energy threshold in 85-3000Hz band
const ENABLE_TYPING_FILTER        = ${enableTypingFilter};      // Filter sharp transient clicks (Crest Factor > 4.5)`;

    navigator.clipboard.writeText(snippet);
    setCopiedType("code");
    setTimeout(() => setCopiedType(null), 2500);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Radio className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-2">
                  Audio Proctoring & Speech AI Studio
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                    Live Tuning
                  </span>
                </h1>
                <p className="text-sm text-slate-400">
                  Calibrate acoustic thresholds, classify noise types, and transcribe spoken words in real time.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsBeepEnabled(!isBeepEnabled)}
              className={`p-2.5 rounded-xl border text-sm transition-all flex items-center gap-2 ${
                isBeepEnabled
                  ? "bg-slate-900 border-slate-700 text-slate-300 hover:text-white"
                  : "bg-slate-900/50 border-slate-800 text-slate-500 hover:text-slate-400"
              }`}
              title={isBeepEnabled ? "Violation warning sound enabled" : "Violation warning sound muted"}
            >
              {isBeepEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
              <span className="hidden sm:inline">{isBeepEnabled ? "Sound On" : "Muted"}</span>
            </button>

            {isMicActive ? (
              <button
                onClick={stopMicrophone}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium text-sm transition-all flex items-center gap-2 shadow-lg shadow-red-900/20"
              >
                <MicOff className="w-4 h-4" />
                Stop Microphone
              </button>
            ) : (
              <button
                onClick={startMicrophone}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-all flex items-center gap-2 shadow-lg shadow-emerald-900/20"
              >
                <Mic className="w-4 h-4" />
                Start Live Microphone
              </button>
            )}
          </div>
        </header>

        {/* Mic Error Banner */}
        {micError && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-sm">Microphone Access Notice</p>
              <p className="text-xs text-red-300/90 mt-0.5">{micError}</p>
            </div>
          </div>
        )}

        {/* NEW: Acoustic Classifier & Word-Recognition Banner */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1: What Noise is This? (Acoustic Noise Classifier) */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4.5 backdrop-blur-md space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                Acoustic Noise Classification
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Real-time Spectral AI</span>
            </div>

            <div className="flex items-center gap-3.5 p-3 rounded-xl bg-slate-950/80 border border-slate-800">
              <div className="text-3xl shrink-0 p-1">{acousticCategory.icon}</div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-white">{acousticCategory.label}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${acousticCategory.badgeColor}`}>
                    {acousticCategory.type.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-slate-400">{acousticCategory.description}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-[10px] pt-1">
              <div className="p-1.5 rounded bg-slate-950 border border-slate-800/80">
                <div className="text-slate-500">Sub-Bass (Fan)</div>
                <div className="font-mono text-slate-300 font-semibold">{liveStats.subBassEnergy.toFixed(0)}</div>
              </div>
              <div className="p-1.5 rounded bg-slate-950 border border-slate-800/80">
                <div className="text-slate-500">Vocal (Voice)</div>
                <div className="font-mono text-cyan-400 font-semibold">{liveStats.vocalEnergy.toFixed(0)}</div>
              </div>
              <div className="p-1.5 rounded bg-slate-950 border border-slate-800/80">
                <div className="text-slate-500">Highs (Typing)</div>
                <div className="font-mono text-amber-400 font-semibold">{liveStats.highBandEnergy.toFixed(0)}</div>
              </div>
            </div>
          </div>

          {/* Card 2: What Word Was Spoken? (Speech-to-Text Recognition) */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4.5 backdrop-blur-md space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                Spoken Word Recognition (Speech-to-Text)
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                {isSpeechSupported ? "Web Speech API Active" : "Requires Chrome / Edge"}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 min-h-[72px] flex flex-col justify-between">
              <div className="space-y-1">
                <div className="text-[11px] text-slate-500">Live Transcript:</div>
                <p className="text-sm font-medium text-emerald-300 italic leading-relaxed">
                  {liveTranscript ? `"${liveTranscript}"` : isMicActive ? "Speak into your mic to transcribe words..." : "Mic standby..."}
                </p>
              </div>
            </div>

            {/* Suspicious Keywords Matcher */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] text-slate-500 flex items-center gap-1 shrink-0">
                <Tag className="w-3 h-3 text-red-400" /> Flagged Words:
              </span>
              {detectedKeywords.length === 0 ? (
                <span className="text-[10px] text-slate-600">None detected yet (say 'answer', 'question', 'option')</span>
              ) : (
                detectedKeywords.map((kw, i) => (
                  <span
                    key={i}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-red-950/80 text-red-300 border border-red-800 font-mono font-semibold animate-pulse"
                  >
                    🚨 {kw}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Preset Selector Banner */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-5 backdrop-blur-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              Quick Calibration Presets
            </div>
            <span className="text-xs text-slate-400">Click a preset to instantly test different acoustic scenarios</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(PRESETS).map(([key, preset]) => {
              const isSelected = selectedPreset === key;
              return (
                <button
                  key={key}
                  onClick={() => applyPreset(key)}
                  className={`text-left p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                    isSelected
                      ? "bg-slate-800/90 border-emerald-500 shadow-md shadow-emerald-950/40 ring-1 ring-emerald-500/30"
                      : "bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-xs text-white">{preset.name}</span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${preset.badgeColor}`}>
                        {preset.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{preset.description}</p>
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-300">
                    <span>Gain: {preset.gain}x</span>
                    <span>Hold: {preset.holdFrames * 100}ms</span>
                    <span>RMS: {preset.noiseThreshold}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Grid: Visualizers & Meters (Left 7 cols) + Sliders (Right 5 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT COLUMN: Visualizers & Live Telemetry (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Visualizer Canvases */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-semibold text-white">Live Acoustic Visualizer</h2>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isMicActive ? (liveStats.isVoiceOrNoise ? "bg-red-500 animate-ping" : "bg-emerald-500") : "bg-slate-600"
                    }`}
                  />
                  <span className="text-xs text-slate-400 font-mono">
                    {isMicActive ? (liveStats.isVoiceOrNoise ? "SOUND ACTIVE" : "LISTENING") : "MIC STANDBY"}
                  </span>
                </div>
              </div>

              {/* Waveform Canvas */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Time-Domain Oscilloscope (Waveform)</span>
                  <span className="font-mono text-[11px]">
                    Status:{" "}
                    <span className={liveStats.isVoiceOrNoise ? "text-red-400 font-semibold" : "text-emerald-400"}>
                      {liveStats.triggerReason || "Ambient Normal"}
                    </span>
                  </span>
                </div>
                <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-[#090d16] h-28">
                  <canvas ref={waveformCanvasRef} width={640} height={112} className="w-full h-full block" />
                  {!isMicActive && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs">
                      <p className="text-xs text-slate-400 flex items-center gap-2">
                        <Mic className="w-4 h-4 text-slate-500" /> Click "Start Live Microphone" above to stream
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Frequency Spectrum Canvas */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Frequency Spectrum (FFT 0Hz - 24kHz)</span>
                  <span className="font-mono text-[11px] text-cyan-400">Human Voice Formants Highlighted</span>
                </div>
                <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-[#090d16] h-28">
                  <canvas ref={spectrumCanvasRef} width={640} height={112} className="w-full h-full block" />
                  {!isMicActive && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs">
                      <p className="text-xs text-slate-400">Mic inactive</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Real-time Acoustic Metrics Gauges */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                Live Acoustic Telemetry vs Active Thresholds
              </h2>

              <div className="space-y-4">
                {/* 1. Live RMS Meter */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium text-slate-300 flex items-center gap-1.5">
                      RMS Amplitude (Loudness Volume)
                      <span className="text-[10px] text-slate-500">(Threshold: {noiseThreshold.toFixed(4)})</span>
                    </span>
                    <span
                      className={`font-mono text-xs font-semibold ${
                        liveStats.rms > noiseThreshold ? "text-red-400" : "text-emerald-400"
                      }`}
                    >
                      {liveStats.rms.toFixed(4)}
                    </span>
                  </div>
                  <div className="relative h-4 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-75 ${
                        liveStats.rms > noiseThreshold ? "bg-red-500" : "bg-emerald-500"
                      }`}
                      style={{ width: `${Math.min(100, (liveStats.rms / 0.1) * 100)}%` }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-yellow-400 shadow-sm z-10"
                      style={{ left: `${Math.min(100, (noiseThreshold / 0.1) * 100)}%` }}
                      title={`RMS Threshold Marker: ${noiseThreshold}`}
                    />
                  </div>
                </div>

                {/* 2. Live Peak Meter */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium text-slate-300 flex items-center gap-1.5">
                      Peak Transient (Instant Spike)
                      <span className="text-[10px] text-slate-500">(Threshold: {peakThreshold.toFixed(3)})</span>
                    </span>
                    <span
                      className={`font-mono text-xs font-semibold ${
                        liveStats.peak > peakThreshold ? "text-red-400" : "text-cyan-400"
                      }`}
                    >
                      {liveStats.peak.toFixed(4)}
                    </span>
                  </div>
                  <div className="relative h-4 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-75 ${
                        liveStats.peak > peakThreshold ? "bg-amber-500" : "bg-cyan-500"
                      }`}
                      style={{ width: `${Math.min(100, (liveStats.peak / 0.3) * 100)}%` }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-yellow-400 shadow-sm z-10"
                      style={{ left: `${Math.min(100, (peakThreshold / 0.3) * 100)}%` }}
                      title={`Peak Threshold Marker: ${peakThreshold}`}
                    />
                  </div>
                </div>

                {/* 3. Hold Buffer (Sustained Speech Counter) */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium text-slate-300 flex items-center gap-1.5">
                      Sustained Frame Buffer
                      <span className="text-[10px] text-slate-500">
                        ({Math.round((liveStats.holdProgress / 100) * holdFrames)} / {holdFrames} frames)
                      </span>
                    </span>
                    <span className="font-mono text-xs text-purple-400">
                      {liveStats.holdProgress >= 100 ? "VIOLATION TRIGGERED" : `${Math.round(liveStats.holdProgress)}%`}
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-100 ${
                        liveStats.holdProgress >= 100 ? "bg-red-500" : "bg-purple-500"
                      }`}
                      style={{ width: `${liveStats.holdProgress}%` }}
                    />
                  </div>
                </div>

                {/* Telemetry Chips */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                    <div className="text-[11px] text-slate-400">Noise Floor (EMA)</div>
                    <div className="text-sm font-bold font-mono text-slate-200 mt-0.5">
                      {liveStats.noiseFloor.toFixed(4)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                    <div className="text-[11px] text-slate-400">SNR (dB above room)</div>
                    <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
                      +{liveStats.snrDb.toFixed(1)} dB
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                    <div className="text-[11px] text-slate-400">Vocal Energy (85-3k)</div>
                    <div
                      className={`text-sm font-bold font-mono mt-0.5 ${
                        liveStats.vocalEnergy > vocalEnergyThreshold ? "text-amber-400" : "text-slate-200"
                      }`}
                    >
                      {liveStats.vocalEnergy.toFixed(1)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                    <div className="text-[11px] text-slate-400 flex items-center justify-between">
                      <span>Crest Factor</span>
                      <span className="text-[9px] text-slate-500">P/RMS</span>
                    </div>
                    <div
                      className={`text-sm font-bold font-mono mt-0.5 ${
                        liveStats.crestFactor > 4.5 ? "text-amber-400" : "text-slate-200"
                      }`}
                    >
                      {liveStats.crestFactor.toFixed(1)}
                      <span className="text-[10px] text-slate-500 font-normal ml-1">
                        {liveStats.crestFactor > 4.5 ? "(Click/Tap)" : "(Voiced)"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Real-time Violation Event Stream */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-400" />
                  <h2 className="text-sm font-semibold text-white">Simulated Violation Event Stream</h2>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-950 text-red-300 border border-red-800 font-mono">
                    {violations.length} logged
                  </span>
                </div>
                {violations.length > 0 && (
                  <button
                    onClick={() => setViolations([])}
                    className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" /> Clear Log
                  </button>
                )}
              </div>

              {violations.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                  No audio violations triggered yet. Speak or play audio to test detection.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {violations.map((v) => (
                    <div
                      key={v.id}
                      className="p-3 rounded-xl bg-red-950/20 border border-red-900/40 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-red-400">Violation #{v.count}</span>
                          <span className="text-slate-400 text-[11px] font-mono">{v.time}</span>
                          <span className="px-1.5 py-0.2 rounded bg-red-900/40 text-red-200 text-[10px]">
                            {v.rule}
                          </span>
                        </div>
                        <p className="text-slate-300 text-[11px]">{v.reason}</p>
                        {v.wordsSpoken && (
                          <p className="text-emerald-400 text-[11px] font-mono mt-0.5">
                            Spoken: "{v.wordsSpoken}"
                          </p>
                        )}
                      </div>
                      <div className="font-mono text-[11px] text-slate-400 flex items-center gap-3 shrink-0">
                        <span>RMS: <strong className="text-slate-200">{v.rms}</strong></span>
                        <span>Peak: <strong className="text-slate-200">{v.peak}</strong></span>
                        <span>Crest: <strong className="text-slate-200">{v.crestFactor}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Interactive Threshold Sliders & Settings (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-semibold text-white">Threshold Calibration Controls</h2>
                </div>
                <button
                  onClick={() => applyPreset("currentProduction")}
                  className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Reset to Current
                </button>
              </div>

              {/* Slider 1: Preamp Gain */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-slate-300">Digital Preamp Gain</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.1"
                      min="0.5"
                      max="5.0"
                      value={gain}
                      onChange={(e) => setGain(parseFloat(e.target.value) || 1.0)}
                      className="w-16 px-1.5 py-0.5 text-right font-mono text-emerald-400 font-semibold bg-slate-950 border border-slate-800 rounded text-xs"
                    />
                    <span className="text-xs text-slate-400">x</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="4.0"
                  step="0.1"
                  value={gain}
                  onChange={(e) => setGain(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Slider 2: RMS Threshold */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-slate-300">RMS Loudness Threshold</span>
                  <input
                    type="number"
                    step="0.0005"
                    min="0.001"
                    max="0.100"
                    value={noiseThreshold}
                    onChange={(e) => setNoiseThreshold(parseFloat(e.target.value) || 0.0045)}
                    className="w-20 px-1.5 py-0.5 text-right font-mono text-emerald-400 font-semibold bg-slate-950 border border-slate-800 rounded text-xs"
                  />
                </div>
                <input
                  type="range"
                  min="0.002"
                  max="0.080"
                  step="0.0005"
                  value={noiseThreshold}
                  onChange={(e) => setNoiseThreshold(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span className="text-red-400">0.0045 (Current)</span>
                  <span>0.0150 (Music)</span>
                  <span>0.0250 (Speech)</span>
                </div>
              </div>

              {/* Slider 3: Peak Threshold */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-slate-300">Peak Transient Threshold</span>
                  <input
                    type="number"
                    step="0.005"
                    min="0.005"
                    max="0.300"
                    value={peakThreshold}
                    onChange={(e) => setPeakThreshold(parseFloat(e.target.value) || 0.015)}
                    className="w-20 px-1.5 py-0.5 text-right font-mono text-emerald-400 font-semibold bg-slate-950 border border-slate-800 rounded text-xs"
                  />
                </div>
                <input
                  type="range"
                  min="0.010"
                  max="0.250"
                  step="0.005"
                  value={peakThreshold}
                  onChange={(e) => setPeakThreshold(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span className="text-red-400">0.015 (Keys trigger)</span>
                  <span>0.050 (Balanced)</span>
                  <span>0.100 (Safe)</span>
                </div>
              </div>

              {/* Slider 4: Sustained Hold Duration */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-slate-300">Hold Duration (Frames / Time)</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={holdFrames}
                      onChange={(e) => setHoldFrames(parseInt(e.target.value) || 2)}
                      className="w-14 px-1.5 py-0.5 text-right font-mono text-emerald-400 font-semibold bg-slate-950 border border-slate-800 rounded text-xs"
                    />
                    <span className="text-[11px] text-slate-400">({holdFrames * 100}ms)</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  value={holdFrames}
                  onChange={(e) => setHoldFrames(parseInt(e.target.value))}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Slider 5: Loud Burst Multiplier */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-slate-300">Loud Burst Multiplier</span>
                  <span className="font-mono text-emerald-400 font-semibold">{burstMultiplier.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="1.5"
                  max="5.0"
                  step="0.1"
                  value={burstMultiplier}
                  onChange={(e) => setBurstMultiplier(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Slider 6: Vocal Energy Threshold */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-slate-300">Vocal Energy (85Hz-3kHz)</span>
                  <input
                    type="number"
                    min="10"
                    max="100"
                    value={vocalEnergyThreshold}
                    onChange={(e) => setVocalEnergyThreshold(parseInt(e.target.value) || 24)}
                    className="w-14 px-1.5 py-0.5 text-right font-mono text-emerald-400 font-semibold bg-slate-950 border border-slate-800 rounded text-xs"
                  />
                </div>
                <input
                  type="range"
                  min="15"
                  max="80"
                  step="1"
                  value={vocalEnergyThreshold}
                  onChange={(e) => setVocalEnergyThreshold(parseInt(e.target.value))}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Smart Typing & Hardware Constraint Toggles */}
              <div className="pt-2 border-t border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                      <Keyboard className="w-3.5 h-3.5 text-emerald-400" />
                      Filter Keystroke Transients (Crest Factor)
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Rejects sharp single-click keyboard attacks when Crest Factor &gt; 4.5
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableTypingFilter}
                    onChange={(e) => setEnableTypingFilter(e.target.checked)}
                    className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                  />
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-300">Browser WebRTC Audio Constraints</span>
                  <div className="grid grid-cols-1 gap-2 text-xs">
                    <label className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer">
                      <span className="text-[11px] text-slate-300">Auto Gain Control (Attenuates Music)</span>
                      <input
                        type="checkbox"
                        checked={autoGainControl}
                        onChange={(e) => setAutoGainControl(e.target.checked)}
                        className="accent-emerald-500 w-3.5 h-3.5 rounded"
                      />
                    </label>

                    <label className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer">
                      <span className="text-[11px] text-slate-300">Echo Cancellation</span>
                      <input
                        type="checkbox"
                        checked={echoCancellation}
                        onChange={(e) => setEchoCancellation(e.target.checked)}
                        className="accent-emerald-500 w-3.5 h-3.5 rounded"
                      />
                    </label>

                    <label className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer">
                      <span className="text-[11px] text-slate-300">Noise Suppression</span>
                      <input
                        type="checkbox"
                        checked={noiseSuppression}
                        onChange={(e) => setNoiseSuppression(e.target.checked)}
                        className="accent-emerald-500 w-3.5 h-3.5 rounded"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Code Generator & Export */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Copy className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-semibold text-white">Export Calibrated Parameters</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyJSON}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-medium transition-colors flex items-center gap-1.5"
                  >
                    {copiedType === "json" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedType === "json" ? "Copied JSON" : "Copy JSON"}
                  </button>
                  <button
                    onClick={copyCodeSnippet}
                    className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-xs text-white font-medium transition-colors flex items-center gap-1.5"
                  >
                    {copiedType === "code" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedType === "code" ? "Copied JS" : "Copy JS Code"}
                  </button>
                </div>
              </div>

              <div className="relative">
                <pre className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-x-auto">
{`{
  "gainNode_gain_value": ${gain.toFixed(2)},
  "DEFAULT_NOISE_THRESHOLD": ${noiseThreshold.toFixed(4)},
  "DEFAULT_PEAK_THRESHOLD": ${peakThreshold.toFixed(3)},
  "DEFAULT_NOISE_HOLD_FRAMES": ${holdFrames},
  "DEFAULT_COOLDOWN_MS": ${cooldownMs},
  "BURST_MULTIPLIER": ${burstMultiplier.toFixed(1)},
  "VOCAL_ENERGY_THRESHOLD": ${vocalEnergyThreshold},
  "ENABLE_TYPING_FILTER": ${enableTypingFilter},
  "BROWSER_CONSTRAINTS": {
    "echoCancellation": ${echoCancellation},
    "noiseSuppression": ${noiseSuppression},
    "autoGainControl": ${autoGainControl}
  }
}`}
                </pre>
              </div>
              <p className="text-[11px] text-slate-400">
                You can copy these calibrated values and provide them directly, or apply them to{" "}
                <code className="text-slate-300 bg-slate-800 px-1 py-0.5 rounded">AudioProctoringEngine.jsx</code>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
