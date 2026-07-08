import React, { useState, useEffect, useRef, useCallback } from "react";

// AudioProctoringEngine
// Monitors student microphone using Web Audio API (AudioContext + AnalyserNode).
// Flags violations for: sustained noise/talking, mic disconnected, permission denied.
// Prop interface matches ProctoringEngine for seamless use alongside camera proctoring.

const SAMPLE_INTERVAL_MS = 250;    // how often we read the analyser
const NOISE_HOLD_FRAMES = 4;      // ~1.0 second of sustained noise before flagging
const NOISE_THRESHOLD = 0.015;  // RMS energy threshold (increased to 0.050 as requested)
const COOLDOWN_MS = 6000;   // min gap between consecutive violations

const AudioProctoringEngine = ({
  studentID,
  testID,
  isTestActive = true,
  isProctorActive = true,
  maxViolations = 3,
  onViolationUpdate,
  onReady,
}) => {
  const [violationCount, setViolationCount] = useState(0);
  const [micStatus, setMicStatus] = useState("idle"); // idle|active|denied|disconnected|noise

  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const noiseFramesRef = useRef(0);
  const lastViolationRef = useRef(0);
  const violationCountRef = useRef(0);
  const onViolationRef = useRef(onViolationUpdate);
  const isInitializedRef = useRef(false);
  const onReadyRef = useRef(onReady);

  useEffect(() => { onViolationRef.current = onViolationUpdate; }, [onViolationUpdate]);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);

  const getRMS = useCallback(() => {
    if (!analyserRef.current) return 0;
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => { });
    }
    const bufLen = analyserRef.current.fftSize;
    const data = new Float32Array(bufLen);
    analyserRef.current.getFloatTimeDomainData(data);
    let sumSq = 0;
    for (let i = 0; i < bufLen; i++) sumSq += data[i] * data[i];
    const rms = Math.sqrt(sumSq / bufLen);
    console.log("[AudioProctor] Current RMS:", rms.toFixed(4));
    return rms;
  }, []);

  const reportViolation = useCallback((type) => {
    const now = Date.now();
    if (now - lastViolationRef.current < COOLDOWN_MS) return;
    lastViolationRef.current = now;
    const newCount = violationCountRef.current + 1;
    violationCountRef.current = newCount;
    setViolationCount(newCount);
    console.warn("[AudioProctor] Violation #" + newCount + ": " + type);
    if (onViolationRef.current) {
      onViolationRef.current({
        type, count: newCount, maxViolations,
        timestamp: new Date().toISOString(), studentID, testID,
      });
    }
  }, [maxViolations, studentID, testID]);

  const startSampling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      if (!isTestActive || !isProctorActive) return;
      if (streamRef.current) {
        const tracks = streamRef.current.getAudioTracks();
        if (!tracks.length || tracks[0].readyState === "ended") {
          setMicStatus("disconnected");
          reportViolation("audio-mic-disconnected");
          return;
        }
      }
      const rms = getRMS();
      if (rms > NOISE_THRESHOLD) {
        noiseFramesRef.current += 1;
        if (noiseFramesRef.current >= NOISE_HOLD_FRAMES) {
          setMicStatus("noise");
          reportViolation("audio-noise-detected");
          noiseFramesRef.current = 0;
        }
      } else {
        noiseFramesRef.current = Math.max(0, noiseFramesRef.current - 1);
        setMicStatus(prev => prev === "noise" ? "active" : prev);
      }
    }, SAMPLE_INTERVAL_MS);
  }, [getRMS, isTestActive, isProctorActive, reportViolation]);

  const initMicrophone = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") {
        await ctx.resume().catch(() => { });
      }
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      isInitializedRef.current = true;
      setMicStatus("active");
      startSampling();
      if (onReadyRef.current) {
        onReadyRef.current();
      }
    } catch (err) {
      console.error("[AudioProctor] Mic init failed:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setMicStatus("denied");
        reportViolation("audio-permission-denied");
      } else {
        setMicStatus("disconnected");
        reportViolation("audio-mic-disconnected");
      }
    }
  }, [startSampling, reportViolation]);

  useEffect(() => {
    if (!isTestActive || !isProctorActive) return;
    initMicrophone();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => { });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isTestActive || !isProctorActive) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    } else if (isInitializedRef.current && !intervalRef.current) {
      startSampling();
    }
  }, [isTestActive, isProctorActive, startSampling]);

  const statusConfig = {
    idle: { icon: "🎤", color: "#64748b", label: "Mic initializing..." },
    active: { icon: "🎤", color: "#10b981", label: "Mic active" },
    noise: { icon: "🔊", color: "#f59e0b", label: "Noise detected!" },
    denied: { icon: "🚫", color: "#ef4444", label: "Mic blocked" },
    disconnected: { icon: "❌", color: "#ef4444", label: "Mic disconnected" },
  };
  const cfg = statusConfig[micStatus] || statusConfig.idle;

  return null;
};

export default AudioProctoringEngine;
