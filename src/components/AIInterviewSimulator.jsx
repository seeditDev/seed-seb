import React, { useState, useEffect, useRef } from 'react';
import { 
  FaUserTie, 
  FaPaperPlane, 
  FaMicrophone, 
  FaVolumeUp, 
  FaVolumeMute, 
  FaArrowLeft, 
  FaChartLine, 
  FaAward, 
  FaHistory, 
  FaGraduationCap, 
  FaStar,
  FaCheckCircle,
  FaLightbulb,
  FaBug,
  FaKeyboard,
  FaEye,
  FaEyeSlash,
  FaListOl,
  FaShieldAlt,
  FaExclamationTriangle,
  FaLayerGroup
} from 'react-icons/fa';
import { aiInterviewService, getFilteredScenarios } from '../services/aiInterviewService';
import { toast } from 'sonner';
import '../styles/AIInterviewSimulator.css';

const DOMAINS = ['Backend', 'Frontend', 'Data Engineering', 'ML / AI', 'Software Engineering', 'System Design', 'Java', 'DSA', 'Python', 'SQL', 'HR'];
const DIFFICULTIES = ['Senior', 'Mid', 'Entry', 'Hard', 'Medium', 'Easy'];
const COMPANIES = ['Freshers', 'Zoho', 'TCS', 'Amazon', 'Google', 'Mixed'];

const QUICK_TRACK_PRESETS = [
  { label: 'Backend - Senior', domain: 'Backend', difficulty: 'Senior', count: 9, badge: '9 Scenarios' },
  { label: 'Backend - Mid', domain: 'Backend', difficulty: 'Mid', count: 11, badge: '11 Scenarios' },
  { label: 'Backend - Entry', domain: 'Backend', difficulty: 'Entry', count: 10, badge: '10 Scenarios' },
  { label: 'Frontend - Senior', domain: 'Frontend', difficulty: 'Senior', count: 9, badge: '9 Scenarios' },
  { label: 'Frontend - Mid', domain: 'Frontend', difficulty: 'Mid', count: 11, badge: '11 Scenarios' },
  { label: 'System Design - Senior', domain: 'System Design', difficulty: 'Senior', count: 10, badge: '10 Scenarios' },
  { label: 'ML / AI - Senior', domain: 'ML / AI', difficulty: 'Senior', count: 10, badge: '10 Scenarios' },
  { label: 'Data Engineering - Senior', domain: 'Data Engineering', difficulty: 'Senior', count: 10, badge: '10 Scenarios' }
];

const AIInterviewSimulator = ({ user }) => {
  // Navigation: 'setup' | 'interview' | 'evaluation' | 'history'
  const [stage, setStage] = useState('setup');
  
  // Setup config
  const [domain, setDomain] = useState('Backend');
  const [difficulty, setDifficulty] = useState('Senior');
  const [company, setCompany] = useState('Mixed');
  const [aiMode, setAiMode] = useState(() => {
    const savedKey = localStorage.getItem('ai_interview_api_key');
    return savedKey ? 'cloud' : 'static';
  });
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('ai_interview_api_key') || '');
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // Scenario & Rubrics state
  const [scenariosList, setScenariosList] = useState([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState('');
  const [activeScenario, setActiveScenario] = useState(null);
  const [loadingScenarios, setLoadingScenarios] = useState(false);
  const [showIdealAnswerPreview, setShowIdealAnswerPreview] = useState(false);
  const [showInSessionIdealAnswer, setShowInSessionIdealAnswer] = useState(false);
  const [isInspectorExpanded, setIsInspectorExpanded] = useState(true);
  
  // Active session
  const [chatHistory, setChatHistory] = useState([]);
  const [answerInput, setAnswerInput] = useState('');
  const [interviewerStatus, setInterviewerStatus] = useState('talking'); // 'talking' | 'listening' | 'evaluating'
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  
  // Progress tracker for WebLLM
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadingModel, setDownloadingModel] = useState(false);
  
  // Results / Evaluation
  const [evaluationScores, setEvaluationScores] = useState(null);
  const [historyAttempts, setHistoryAttempts] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [savingResult, setSavingResult] = useState(false);

  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);

  // Load scenarios whenever domain or difficulty changes
  useEffect(() => {
    let mounted = true;
    setLoadingScenarios(true);
    getFilteredScenarios(domain, difficulty)
      .then(scenarios => {
        if (!mounted) return;
        setScenariosList(scenarios);
        if (scenarios.length > 0) {
          setSelectedScenarioId(scenarios[0].id);
          setActiveScenario(scenarios[0]);
        } else {
          setSelectedScenarioId('');
          setActiveScenario(null);
        }
      })
      .catch(err => console.warn('Could not load scenarios for selection', err))
      .finally(() => {
        if (mounted) setLoadingScenarios(false);
      });

    return () => { mounted = false; };
  }, [domain, difficulty]);

  // When scenario selection changes
  const handleSelectScenario = (id) => {
    setSelectedScenarioId(id);
    const chosen = scenariosList.find(s => s.id === id);
    setActiveScenario(chosen || null);
    setShowIdealAnswerPreview(false);
  };

  // Quick preset click handler
  const handleApplyPreset = (preset) => {
    setDomain(preset.domain);
    setDifficulty(preset.difficulty);
    toast.success(`Switched track to ${preset.label}`);
  };

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // Load history attempts on mount/stage changes
  useEffect(() => {
    if (user && (stage === 'setup' || stage === 'history')) {
      const loadHistory = async () => {
        setLoadingHistory(true);
        const data = await aiInterviewService.fetchAttempts(user.email);
        setHistoryAttempts(data);
        setLoadingHistory(false);
      };
      loadHistory();
    }
  }, [user, stage]);

  // Handle Speech-to-Text setup
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onstart = () => setIsListening(true);
      rec.onend = () => setIsListening(false);
      rec.onresult = (event) => {
        const text = event.results[0][0].transcript;
        setAnswerInput(prev => (prev ? prev + ' ' : '') + text);
      };

      recognitionRef.current = rec;
    }
  }, []);

  // Browser Text-To-Speech Synthesis helper
  const speakText = (text) => {
    if (!voiceEnabled) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      const voices = window.speechSynthesis.getVoices();
      const bestVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) || voices.find(v => v.lang.startsWith('en'));
      if (bestVoice) {
        utterance.voice = bestVoice;
      }
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("TTS synthesis failed:", e);
    }
  };

  // Toggle Microphone
  const toggleListening = () => {
    if (!recognitionRef.current) {
      toast.error("Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setInterviewerStatus('listening');
      recognitionRef.current.start();
    }
  };

  // Start interview session
  const handleStartInterview = async () => {
    setLoading(true);
    setSessionStartTime(Date.now());
    
    // Save API key locally if entered and cloud mode active
    if (aiMode === 'cloud' && apiKey.trim()) {
      localStorage.setItem('ai_interview_api_key', apiKey.trim());
    } else if (aiMode !== 'cloud') {
      localStorage.removeItem('ai_interview_api_key');
    }

    setChatHistory([]);
    setInterviewerStatus('talking');
    setShowInSessionIdealAnswer(false);

    const useLocalModel = aiMode === 'local';
    
    // Trigger in-browser WASM download loader if local LLM selected
    if (useLocalModel) {
      setDownloadingModel(true);
      setDownloadProgress(0);
      try {
        await aiInterviewService.initLocalModel((progress) => {
          setDownloadProgress(progress);
        });
      } catch (err) {
        console.warn("Failed to load WASM model locally. Switching to static heuristics sandbox.", err);
        setAiMode('static');
      } finally {
        setDownloadingModel(false);
      }
    }

    setStage('interview');

    // Get the first question (prioritize chosen scenario)
    const firstQuestion = await aiInterviewService.getNextQuestion(
      [], 
      domain, 
      difficulty, 
      company, 
      apiKey, 
      useLocalModel, 
      (p) => setDownloadProgress(p),
      activeScenario
    );
    
    setChatHistory([{ role: 'assistant', content: firstQuestion }]);
    setLoading(false);
    speakText(firstQuestion);
  };

  // Handle user response submission
  const handleSendResponse = async () => {
    if (!answerInput.trim() || loading) return;

    const userText = answerInput.trim();
    setAnswerInput('');
    setInterviewerStatus('talking');
    
    const updatedHistory = [...chatHistory, { role: 'user', content: userText }];
    setChatHistory(updatedHistory);
    setLoading(true);

    const useLocalModel = aiMode === 'local';

    // Get next question or close prompt
    const nextQuestion = await aiInterviewService.getNextQuestion(
      updatedHistory, 
      domain, 
      difficulty, 
      company, 
      apiKey, 
      useLocalModel,
      (p) => setDownloadProgress(p),
      activeScenario
    );
    
    setChatHistory([...updatedHistory, { role: 'assistant', content: nextQuestion }]);
    setLoading(false);
    speakText(nextQuestion);

    // If final message, candidate triggers evaluation
    if (nextQuestion.toLowerCase().includes("evaluation report") || nextQuestion.toLowerCase().includes("interview is now complete")) {
      setInterviewerStatus('evaluating');
    }
  };

  // Submit and evaluate interview session
  const handleGenerateEvaluation = async () => {
    setLoading(true);
    const durationSeconds = Math.round((Date.now() - sessionStartTime) / 1000);
    
    const useLocalModel = aiMode === 'local';
    const evaluation = await aiInterviewService.getEvaluationReport(chatHistory, domain, difficulty, company, apiKey, useLocalModel, activeScenario);
    setEvaluationScores(evaluation);

    // Save results to local history
    setSavingResult(true);
    try {
      await aiInterviewService.saveResults(user, domain, difficulty, company, evaluation, chatHistory, durationSeconds);
    } catch (e) {
      console.error("Failed to auto-save placement scorecard:", e);
    } finally {
      setSavingResult(false);
    }

    setStage('evaluation');
    setLoading(false);
  };

  const handlePrintCertificate = () => {
    window.print();
  };

  return (
    <div className="ai-interview-container">
      {/* LOCAL MODEL DOWNLOAD OVERLAY */}
      {downloadingModel && (
        <div className="lw-overlay" style={{ zIndex: 1600 }}>
          <div className="lw-card" style={{ maxWidth: '520px', textAlign: 'center', padding: '30px' }}>
            <div className="lw-loader-container">
              <div className="lw-spinner-outer"></div>
              <div className="lw-spinner-inner" style={{ borderBottomColor: 'var(--accent-coding)' }}></div>
              <div className="lw-spinner-center" style={{ background: 'var(--accent-coding)' }}></div>
            </div>
            <h3 className="lw-title" style={{ marginTop: '24px', justifyContent: 'center' }}>
              Initializing AI Evaluation Engine
            </h3>
            <p className="lw-subtitle" style={{ marginTop: '10px', color: 'var(--text-muted)', fontSize: '13px' }}>
              Preparing AI model resources for intelligent interview evaluation.
            </p>
            <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '5px', marginTop: '20px', overflow: 'hidden' }}>
              <div style={{ width: `${downloadProgress}%`, height: '100%', background: 'var(--accent-coding)', transition: 'width 0.2s' }}></div>
            </div>
            <div style={{ marginTop: '10px', fontSize: '14px', fontWeight: 'bold', color: 'var(--text-main)' }}>
              Downloading weights: {downloadProgress}%
            </div>
          </div>
        </div>
      )}

      {/* HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ color: 'var(--text-main)', fontSize: '24px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🤖</span> AI Placement Interview Simulator
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0' }}>
            Real scenario questions, 5-point evaluation rubrics, and automated AI scoring calibrated to senior tech placements.
          </p>
        </div>

        {stage !== 'setup' && (
          <button 
            className="lw-btn-secondary" 
            onClick={() => {
              window.speechSynthesis.cancel();
              setStage('setup');
            }}
            style={{ padding: '8px 16px', fontSize: '12px' }}
          >
            <FaArrowLeft style={{ marginRight: '6px' }} /> Back to Setup
          </button>
        )}
      </div>

      {/* STAGE 1: SETUP SCREEN */}
      {stage === 'setup' && (
        <div className="ai-glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Configure Interview Track</h3>
            <button className="lw-btn-secondary" onClick={() => setStage('history')} style={{ fontSize: '12px', padding: '6px 14px' }}>
              <FaHistory style={{ marginRight: '6px' }} /> View Past Scorecards
            </button>
          </div>

          {/* QUICK PRESET TRACK PILLS */}
          <div className="quick-presets-container" style={{ marginBottom: '22px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              ⚡ Featured Role & Seniority Tracks:
            </span>
            <div className="presets-pill-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
              {QUICK_TRACK_PRESETS.map((p) => {
                const isActive = domain === p.domain && difficulty === p.difficulty;
                return (
                  <button
                    key={p.label}
                    onClick={() => handleApplyPreset(p)}
                    className={`track-preset-pill ${isActive ? 'active' : ''}`}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: isActive ? '1px solid #10b981' : '1px solid var(--border-color)',
                      background: isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.03)',
                      color: isActive ? '#10b981' : 'var(--text-main)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <span>{p.label}</span>
                    <span style={{ fontSize: '10px', opacity: 0.75, background: 'rgba(0,0,0,0.2)', padding: '2px 6px', borderRadius: '10px' }}>
                      {p.badge}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ai-config-grid">
            <div className="config-group">
              <label>Role / Specialization</label>
              <select value={domain} onChange={e => setDomain(e.target.value)} className="config-select">
                {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div className="config-group">
              <label>Seniority Level</label>
              <select value={difficulty} onChange={e => setDifficulty(e.target.value)} className="config-select">
                {DIFFICULTIES.map(diff => (
                  <option key={diff} value={diff}>
                    {diff === 'Senior' ? 'Senior (Staff / Principal L5+)' :
                     diff === 'Mid' ? 'Mid-Level (Software Engineer L4)' :
                     diff === 'Entry' ? 'Entry-Level (Junior / Campus Fresher)' : diff}
                  </option>
                ))}
              </select>
            </div>

            <div className="config-group">
              <label>Select Scenario ({scenariosList.length} Available)</label>
              <select 
                value={selectedScenarioId} 
                onChange={e => handleSelectScenario(e.target.value)} 
                className="config-select"
                disabled={loadingScenarios || scenariosList.length === 0}
              >
                {scenariosList.length === 0 ? (
                  <option value="">No custom scenarios (using standard question bank)</option>
                ) : (
                  scenariosList.map((sc, sIdx) => (
                    <option key={sc.id} value={sc.id}>
                      [{sIdx + 1}] {sc.title.replace(/^Backend senior /i, '').replace(/^Backend /i, '')}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="config-group">
              <label>Target Company Context</label>
              <select value={company} onChange={e => setCompany(e.target.value)} className="config-select">
                {COMPANIES.map(c => <option key={c} value={c}>{c === 'Mixed' ? 'General Placements' : `${c} Placement Round`}</option>)}
              </select>
            </div>

            <div className="config-group">
              <label>AI Interview Engine Mode</label>
              <select value={aiMode} onChange={e => setAiMode(e.target.value)} className="config-select">
                <option value="static">Static Simulation Mode (Instant Heuristics & Rubrics)</option>
                <option value="cloud">Cloud AI Mode (Groq Llama-3.3 / OpenAI GPT-4o)</option>
                <option value="local">Local Browser AI (WebAssembly WASM Model)</option>
              </select>
            </div>

            {aiMode === 'cloud' && (
              <div className="config-group">
                <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Cloud API Key</span>
                  <a href="https://console.groq.com/" target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: 'var(--accent-coding)', textDecoration: 'none' }}>Get Free Groq Key</a>
                </label>
                <input 
                  type="password" 
                  placeholder="Enter Groq Key gsk_... or OpenAI Key sk-..." 
                  value={apiKey} 
                  onChange={e => setApiKey(e.target.value)}
                  className="config-input"
                />
              </div>
            )}
          </div>

          {/* DEDICATED LIVE SCENARIO PREVIEW & IDEAL RUBRICS INSPECTOR */}
          {activeScenario && (
            <div className="scenario-preview-card" style={{
              marginTop: '24px',
              padding: '20px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.6) 100%)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.2)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ background: '#10b981', color: '#0f172a', fontWeight: 800, fontSize: '10px', padding: '3px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                    Active Scenario
                  </span>
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
                    {activeScenario.title}
                  </h4>
                </div>
                <span style={{ fontSize: '11px', color: '#94a3b8', fontMono: 'monospace' }}>
                  {activeScenario.role?.toUpperCase()} • {activeScenario.level?.toUpperCase()} • {activeScenario.track?.toUpperCase()}
                </span>
              </div>

              {/* SCENARIO QUESTION PROMPT */}
              <div style={{
                background: 'rgba(0,0,0,0.25)',
                borderLeft: '4px solid #3b82f6',
                padding: '14px 16px',
                borderRadius: '0 8px 8px 0',
                marginBottom: '14px'
              }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  Scenario Prompt:
                </span>
                <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, color: '#f1f5f9', fontWeight: 500 }}>
                  "{activeScenario.question}"
                </p>
              </div>

              {/* ARCHITECTURAL CONTEXT */}
              {activeScenario.raw?.context && (
                <div style={{
                  background: 'rgba(234, 179, 8, 0.08)',
                  border: '1px solid rgba(234, 179, 8, 0.25)',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'flex-start'
                }}>
                  <FaExclamationTriangle style={{ color: '#eab308', marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#fde047', textTransform: 'uppercase', display: 'block' }}>
                      Production Context:
                    </span>
                    <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#fef08a', lineHeight: 1.4 }}>
                      {activeScenario.raw.context}
                    </p>
                  </div>
                </div>
              )}

              {/* 5-POINT EVALUATION RUBRIC */}
              {Array.isArray(activeScenario.rubric) && activeScenario.rubric.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <FaListOl style={{ color: '#10b981', fontSize: '13px' }} />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase' }}>
                      5-Point Evaluation Rubric (Criteria Required for Passing Score):
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {activeScenario.rubric.map((point, pIdx) => (
                      <div 
                        key={pIdx}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          background: 'rgba(255,255,255,0.02)',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid rgba(255,255,255,0.04)'
                        }}
                      >
                        <span style={{
                          background: 'rgba(16, 185, 129, 0.2)',
                          color: '#34d399',
                          fontWeight: 700,
                          fontSize: '11px',
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          marginTop: '1px'
                        }}>
                          {pIdx + 1}
                        </span>
                        <span style={{ fontSize: '13px', color: '#e2e8f0', lineHeight: 1.4 }}>
                          {point}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* FOLLOW-UP INTERVIEW QUESTION */}
              {(activeScenario.followUps?.[0] || activeScenario.raw?.follow_up) && (
                <div style={{ marginBottom: '16px', padding: '10px 14px', background: 'rgba(99, 102, 241, 0.08)', borderRadius: '8px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#a5b4fc', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>
                    Follow-Up Question Probe:
                  </span>
                  <span style={{ fontSize: '13px', color: '#c7d2fe' }}>
                    "{activeScenario.followUps?.[0] || activeScenario.raw?.follow_up}"
                  </span>
                </div>
              )}

              {/* IDEAL ANSWER RUBRIC TOGGLE */}
              {activeScenario.idealAnswer && (
                <div style={{ marginTop: '14px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '14px' }}>
                  <button
                    onClick={() => setShowIdealAnswerPreview(!showIdealAnswerPreview)}
                    style={{
                      background: showIdealAnswerPreview ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      color: showIdealAnswerPreview ? '#34d399' : '#94a3b8',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.2s'
                    }}
                  >
                    {showIdealAnswerPreview ? <FaEyeSlash /> : <FaEye />}
                    <span>{showIdealAnswerPreview ? 'Hide Ideal Answer Rubric' : 'Reveal Ideal Answer Rubric'}</span>
                  </button>

                  {showIdealAnswerPreview && (
                    <div style={{
                      marginTop: '12px',
                      padding: '16px',
                      borderRadius: '8px',
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(16, 185, 129, 0.2)',
                      fontSize: '13px',
                      lineHeight: 1.6,
                      color: '#e2e8f0',
                      whiteSpace: 'pre-line'
                    }}>
                      <div style={{ fontWeight: 700, color: '#10b981', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FaCheckCircle /> Model Answer Reference & Senior Rubric Guide:
                      </div>
                      {activeScenario.idealAnswer}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* AUDIO CONTROLS & START BUTTON */}
          <div style={{ marginTop: '24px', display: 'flex', alignItems: 'center', gap: '20px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button 
                onClick={() => setVoiceEnabled(!voiceEnabled)} 
                className={`chat-action-btn ${voiceEnabled ? 'send' : 'mic'}`}
                style={{ width: '36px', height: '36px', borderRadius: '50%' }}
                title={voiceEnabled ? "Mute Voice" : "Enable Voice Output"}
              >
                {voiceEnabled ? <FaVolumeUp /> : <FaVolumeMute />}
              </button>
              <span style={{ fontSize: '13px', color: 'var(--text-main)', fontWeight: '600' }}>
                Text-to-Speech Output {voiceEnabled ? 'Activated' : 'Muted'}
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0, flex: 1 }}>
              {activeScenario 
                ? `Conducting realistic ${domain} (${difficulty}) simulation for "${activeScenario.title}".`
                : `Interactive ${domain} placement practice.`
              }
            </p>
          </div>

          <div style={{ marginTop: '28px', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="lw-btn-primary" onClick={handleStartInterview} disabled={loading} style={{ padding: '12px 32px', fontSize: '15px' }}>
              Launch AI Interview Session
            </button>
          </div>
        </div>
      )}

      {/* STAGE 2: ACTIVE INTERVIEW CHAT SESSION */}
      {stage === 'interview' && (
        <div className="ai-glass-card">
          <div className="interview-grid" style={{ gridTemplateColumns: activeScenario ? '260px 1fr 340px' : '260px 1fr' }}>
            {/* COLUMN 1: INTERVIEWER AVATAR PANEL */}
            <div className="interviewer-panel">
              <div className="interviewer-avatar">
                <FaUserTie />
                {interviewerStatus === 'talking' && <div className="avatar-pulse"></div>}
              </div>
              <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 4px' }}>AI Technical Panelist</h4>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 16px' }}>{domain} ({difficulty})</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', background: 'rgba(0,0,0,0.1)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>STATUS</span>
                {interviewerStatus === 'talking' && (
                  <span className="status-indicator talking">Interviewer Speaking</span>
                )}
                {interviewerStatus === 'listening' && (
                  <span className="status-indicator listening">Listening Response</span>
                )}
                {interviewerStatus === 'evaluating' && (
                  <span className="status-indicator evaluating">Evaluation Ready</span>
                )}
              </div>

              {activeScenario && (
                <div style={{ marginTop: '16px', width: '100%', textAlign: 'left', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Active Scenario</span>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }}>
                    {activeScenario.title}
                  </p>
                </div>
              )}
            </div>

            {/* COLUMN 2: CONVERSATIONAL CHAT */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="chat-window">
                <div className="chat-bubble-area">
                  {chatHistory.map((msg, index) => (
                    <div key={index} className={`chat-bubble ${msg.role}`}>
                      {msg.content}
                    </div>
                  ))}
                  {loading && (
                    <div className="chat-bubble assistant" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span className="lw-mini-spinner" style={{ margin: 0 }}></span> Generating bot reply...
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="chat-input-bar">
                  {interviewerStatus === 'evaluating' ? (
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                      <button className="lw-btn-success" onClick={handleGenerateEvaluation} style={{ padding: '12px 28px', fontSize: '14px' }}>
                        Compile Scorecard & Evaluation Report
                      </button>
                    </div>
                  ) : (
                    <>
                      <button 
                        className={`chat-action-btn mic ${isListening ? 'listening' : ''}`}
                        onClick={toggleListening}
                        title={isListening ? "Stop Microphone" : "Speak Response (Voice)"}
                        disabled={loading}
                      >
                        <FaMicrophone />
                      </button>
                      <textarea
                        className="chat-textarea"
                        placeholder={isListening ? "Listening to voice input..." : "Type your technical response here..."}
                        value={answerInput}
                        onChange={e => setAnswerInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendResponse();
                          }
                        }}
                        disabled={loading}
                        rows={2}
                      />
                      <button 
                        className="chat-action-btn send" 
                        onClick={handleSendResponse}
                        disabled={loading || !answerInput.trim()}
                        title="Send Message (Enter)"
                      >
                        <FaPaperPlane />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {chatHistory.length >= 3 && interviewerStatus !== 'evaluating' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="lw-btn-secondary" onClick={() => setInterviewerStatus('evaluating')} style={{ fontSize: '12px', padding: '6px 14px' }}>
                    Conclude Early & Evaluate
                  </button>
                </div>
              )}
            </div>

            {/* COLUMN 3: IN-SESSION SCENARIO & RUBRICS INSPECTOR */}
            {activeScenario && (
              <div className="in-session-inspector-panel" style={{
                background: 'rgba(15, 23, 42, 0.75)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                maxHeight: '620px',
                overflowY: 'auto'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Scenario Rubrics
                  </span>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                    5 Core Criteria
                  </span>
                </div>

                {/* CONTEXT */}
                {activeScenario.raw?.context && (
                  <div style={{ padding: '10px', background: 'rgba(234, 179, 8, 0.06)', border: '1px solid rgba(234, 179, 8, 0.2)', borderRadius: '8px', fontSize: '12px', color: '#fef08a' }}>
                    <span style={{ fontWeight: 700, display: 'block', fontSize: '10px', color: '#fde047', textTransform: 'uppercase' }}>Context</span>
                    {activeScenario.raw.context}
                  </div>
                )}

                {/* 5-POINT RUBRIC CHECKLIST */}
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                    Evaluation Checklist:
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {activeScenario.rubric?.map((rPoint, idx) => (
                      <div key={idx} style={{
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'flex-start',
                        padding: '8px',
                        background: 'rgba(255,255,255,0.02)',
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.04)',
                        fontSize: '12px',
                        color: '#e2e8f0',
                        lineHeight: 1.35
                      }}>
                        <span style={{ color: '#10b981', fontWeight: 700, flexShrink: 0, marginTop: '1px' }}>
                          [{idx + 1}]
                        </span>
                        <span>{rPoint}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* REVEAL MODEL ANSWER BUTTON */}
                {activeScenario.idealAnswer && (
                  <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px' }}>
                    <button
                      onClick={() => setShowInSessionIdealAnswer(!showInSessionIdealAnswer)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: showInSessionIdealAnswer ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        color: showInSessionIdealAnswer ? '#34d399' : '#cbd5e1',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      {showInSessionIdealAnswer ? <FaEyeSlash /> : <FaEye />}
                      <span>{showInSessionIdealAnswer ? 'Hide Model Answer' : 'Reveal Model Answer Rubric'}</span>
                    </button>

                    {showInSessionIdealAnswer && (
                      <div style={{
                        marginTop: '10px',
                        padding: '12px',
                        borderRadius: '8px',
                        background: 'rgba(0,0,0,0.4)',
                        border: '1px solid rgba(16, 185, 129, 0.2)',
                        fontSize: '11px',
                        lineHeight: 1.5,
                        color: '#e2e8f0',
                        whiteSpace: 'pre-line',
                        maxHeight: '200px',
                        overflowY: 'auto'
                      }}>
                        {activeScenario.idealAnswer}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* STAGE 3: EVALUATION REPORT */}
      {stage === 'evaluation' && evaluationScores && (
        <div className="ai-glass-card">
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <span style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '6px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 700 }}>
              ROUND EVALUATION COMPLETED
            </span>
            <h3 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-main)', margin: '14px 0 6px' }}>
              Placement Readiness Assessment
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>
              Performance summary evaluated for {domain} ({difficulty})
              {evaluationScores.activeScenarioTitle && ` on "${evaluationScores.activeScenarioTitle}"`}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
            <div className="eval-metric-card" style={{ background: 'rgba(255,255,255,0.02)', padding: '18px', borderRadius: '12px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Overall Score</span>
              <div style={{ fontSize: '32px', fontWeight: 800, color: evaluationScores.overallScore >= 70 ? '#10b981' : '#f59e0b', margin: '8px 0' }}>
                {evaluationScores.overallScore}%
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {evaluationScores.overallScore >= 80 ? 'Ready for Interviews' : 'Practice Recommended'}
              </span>
            </div>

            <div className="eval-metric-card" style={{ background: 'rgba(255,255,255,0.02)', padding: '18px', borderRadius: '12px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Technical Depth</span>
              <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--accent-coding)', margin: '8px 0' }}>
                {evaluationScores.technicalScore}/10
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Architecture & Correctness</span>
            </div>

            <div className="eval-metric-card" style={{ background: 'rgba(255,255,255,0.02)', padding: '18px', borderRadius: '12px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Rubric Criteria Hit</span>
              <div style={{ fontSize: '32px', fontWeight: 800, color: '#3b82f6', margin: '8px 0' }}>
                {evaluationScores.rubricHits || 4}/{evaluationScores.rubricTotal || 5}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>5-Point Scenario Rubric</span>
            </div>

            <div className="eval-metric-card" style={{ background: 'rgba(255,255,255,0.02)', padding: '18px', borderRadius: '12px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Communication</span>
              <div style={{ fontSize: '32px', fontWeight: 800, color: '#8b5cf6', margin: '8px 0' }}>
                {evaluationScores.communicationScore}/10
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Clarity & Structure</span>
            </div>
          </div>

          {/* RUBRIC CRITERIA RESULTS */}
          {Array.isArray(evaluationScores.rubricCriteria) && evaluationScores.rubricCriteria.length > 0 && (
            <div style={{ marginBottom: '24px', background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <h4 style={{ margin: '0 0 14px', fontSize: '15px', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FaCheckCircle style={{ color: '#10b981' }} /> Scenario Rubric Criteria Breakdown:
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {evaluationScores.rubricCriteria.map((rc, rIdx) => (
                  <div key={rIdx} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: rc.passed ? 'rgba(16, 185, 129, 0.06)' : 'rgba(239, 68, 68, 0.06)',
                    border: `1px solid ${rc.passed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                  }}>
                    <span style={{ color: rc.passed ? '#10b981' : '#ef4444', marginTop: '2px' }}>
                      {rc.passed ? <FaCheckCircle /> : <FaExclamationTriangle />}
                    </span>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', display: 'block' }}>
                        {rc.criterion}
                      </span>
                      <span style={{ fontSize: '12px', color: rc.passed ? '#34d399' : '#f87171' }}>
                        {rc.feedback}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STRENGTHS & IMPROVEMENTS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '28px' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '18px', borderRadius: '12px' }}>
              <h4 style={{ color: '#10b981', fontSize: '14px', fontWeight: 700, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FaStar /> Key Strengths
              </h4>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {evaluationScores.strengths?.map((s, idx) => <li key={idx}>{s}</li>)}
              </ul>
            </div>

            <div style={{ background: 'rgba(245, 158, 11, 0.04)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '18px', borderRadius: '12px' }}>
              <h4 style={{ color: '#f59e0b', fontSize: '14px', fontWeight: 700, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FaLightbulb /> Areas for Improvement
              </h4>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {evaluationScores.improvements?.map((imp, idx) => <li key={idx}>{imp}</li>)}
              </ul>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button className="lw-btn-secondary" onClick={() => setStage('setup')}>
              Start Another Round
            </button>
            <button className="lw-btn-primary" onClick={handlePrintCertificate}>
              Print Scorecard PDF
            </button>
          </div>
        </div>
      )}

      {/* STAGE 4: HISTORY VIEW */}
      {stage === 'history' && (
        <div className="ai-glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Past Mock Interview Scorecards</h3>
            <button className="lw-btn-secondary" onClick={() => setStage('setup')} style={{ fontSize: '12px', padding: '6px 14px' }}>
              Back to Configuration
            </button>
          </div>

          {loadingHistory ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              Loading past scores...
            </div>
          ) : historyAttempts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              No recorded interview sessions yet. Complete an interview round to see your placement scorecard here!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {historyAttempts.map((item, idx) => (
                <div key={idx} style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h5 style={{ margin: 0, fontSize: '15px', color: 'var(--text-main)', fontWeight: 700 }}>
                      {item.domain} ({item.difficulty})
                    </h5>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {new Date(item.timestamp).toLocaleDateString()} • {item.company}
                    </span>
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: item.overallScore >= 70 ? '#10b981' : '#f59e0b' }}>
                    {item.overallScore}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AIInterviewSimulator;
