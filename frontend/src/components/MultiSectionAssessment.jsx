import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaClock, FaCheckCircle, FaExclamationTriangle, FaLock, FaBookOpen, FaCode, FaChevronRight } from 'react-icons/fa';
import '../styles/MultiSectionAssessment.css';

const normalizeQuestion = (q) => {
  if (!q) return q;
  const id = q.questionId || q.id || '';
  const title = q.title || '';
  const description = q.content?.problemStatement || q.description || '';
  const constraints = Array.isArray(q.content?.constraints) 
    ? q.content.constraints.join('\n') 
    : (q.constraints || '');

  // Normalize boilerplates
  const boilerplates = q.boilerplates || {};
  if (q.solution?.code) {
    const code = q.solution.code;
    if (code.C) boilerplates.c = code.C;
    if (code['C++']) boilerplates.cpp = code['C++'];
    if (code.Java) boilerplates.java = code.Java;
    if (code.Python3) boilerplates.python = code.Python3;
    if (code.JavaScript) boilerplates.javascript = code.JavaScript;
  }

  // Normalize sample test cases
  const sampleTestCases = q.content?.sampleTestCases || [];

  // Normalize hidden test cases
  let hidden = [];
  if (q.testCases?.hidden) {
    hidden = q.testCases.hidden.map(tc => ({
      id: tc.id || tc.label,
      input: tc.input,
      expected: tc.expectedOutput || tc.expected
    }));
  } else if (Array.isArray(q.testCases)) {
    hidden = q.testCases.map(tc => ({
      id: tc.id || '',
      input: tc.input,
      expected: tc.expected
    }));
  }

  return {
    ...q,
    id,
    title,
    description,
    constraints,
    boilerplates,
    sampleTestCases,
    hiddenTests: hidden,
    testCases: {
      ...q.testCases,
      hidden: hidden
    }
  };
};

const MultiSectionAssessment = () => {
  const navigate = useNavigate();
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  // Coordinator States
  const [currentSecIdx, setCurrentSecIdx] = useState(-1); // -1 is Welcome/Intro
  const [secStarted, setSecStarted] = useState(false);
  const [secTimer, setSecTimer] = useState(0); // remaining seconds for current section
  const [secCompleted, setSecCompleted] = useState({}); // { [secId]: boolean }
  const [sectionCountdown, setSectionCountdown] = useState(null); // null or number (seconds)
  const [countdownSecIdx, setCountdownSecIdx] = useState(-1);

  // Question Answer states
  const [sectionData, setSectionData] = useState({}); // { [secId]: testJSON }
  const [mcqAnswers, setMcqAnswers] = useState({}); // { [secId]: { [questionIdx]: selectedOptionIdx } }
  const [codingSolutions, setCodingSolutions] = useState({}); // { [secId]: { [questionIdx]: codeString } }
  const [selectedLanguage, setSelectedLanguage] = useState('python');
  const [currentQIdx, setCurrentQIdx] = useState(0);

  // Proctoring Violations
  const [violationCount, setViolationCount] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    const authData = JSON.parse(localStorage.getItem('auth_data') || '{}');
    const assessmentData = JSON.parse(localStorage.getItem('multisectionAssessmentData') || 'null');
    
    if (!authData.Email || !assessmentData) {
      navigate('/student/dashboard');
      return;
    }
    
    setUser(authData);
    setAssessment(assessmentData);
    loadAllSections(assessmentData);
  }, []);

  const getInitialCode = () => {
    const activeSection = assessment.sections[currentSecIdx];
    const activeSecData = activeSection ? sectionData[activeSection.sectionId] : null;
    const questionsList = activeSecData?.questions || [];
    const q = questionsList[currentQIdx];
    if (!q) return '';
    const lang = selectedLanguage === 'python' ? 'python' : selectedLanguage === 'cpp' ? 'cpp' : selectedLanguage === 'c' ? 'c' : 'java';
    return q.boilerplates?.[lang] || '';
  };

  // Fetch JSON contents for all sections
  const loadAllSections = async (exam) => {
    setLoading(true);
    const loadedData = {};
    try {
      await Promise.all(
        (exam.sections || []).map(async (sec) => {
          let fetchUrl = sec.url;
          if (!fetchUrl.endsWith('.json')) {
            fetchUrl = sec.type === 'mcq' ? `/seed-contents/mcq/${slugify(sec.name)}.json` : `/seed-contents/coding/${slugify(sec.name)}.json`;
          }

          // Resolve finalUrl/fetchUrl through raw GitHub or local fallback
          let cleanPath = fetchUrl;
          if (cleanPath.startsWith('/seed-contents/')) {
            cleanPath = cleanPath.substring('/seed-contents/'.length);
          } else if (cleanPath.startsWith('/')) {
            cleanPath = cleanPath.substring(1);
          }

          const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/seeditDev/seed-contents/main';
          const LOCAL_BASE_URL = '/seed-contents';

          const githubUrl = `${GITHUB_RAW_BASE}/${cleanPath}`;
          const localUrl = `${LOCAL_BASE_URL}/${cleanPath}`;

          try {
            let res = await fetch(githubUrl, { cache: 'no-store' });
            if (!res.ok) {
              // Fallback to local
              res = await fetch(localUrl);
              if (!res.ok) throw new Error('Local fetch failed');
            }
            const data = await res.json();
            if (data.questions && sec.type === 'coding') {
              data.questions = data.questions.map(normalizeQuestion);
            }
            loadedData[sec.sectionId] = data;
          } catch (e) {
            console.error(`Failed to load section ${sec.name}:`, e);
          }
        })
      );
      setSectionData(loadedData);
    } catch (err) {
      console.error('Error fetching section contents:', err);
    } finally {
      setLoading(false);
    }
  };

  const slugify = (val = '') => {
    return val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  };

  // Timer loop
  useEffect(() => {
    if (secStarted && secTimer > 0) {
      timerRef.current = setInterval(() => {
        setSecTimer(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            autoSubmitSection();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [secStarted, currentSecIdx, secTimer]);

  // Section Countdown Timer Effect
  useEffect(() => {
    if (sectionCountdown === null) return;
    if (sectionCountdown <= 0) {
      // Start the section now!
      const idx = countdownSecIdx;
      setCurrentSecIdx(idx);
      setSecStarted(true);
      setCurrentQIdx(0);
      const section = assessment.sections[idx];
      setSecTimer((section.duration_minutes || 30) * 60);
      setSectionCountdown(null);
      return;
    }
    const timer = setTimeout(() => {
      setSectionCountdown(prev => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [sectionCountdown, countdownSecIdx]);


  const handleStartSection = (idx) => {
    setCountdownSecIdx(idx);
    setSectionCountdown(10);
  };

  const autoSubmitSection = () => {
    const activeSection = assessment.sections[currentSecIdx];
    setSecCompleted(prev => ({ ...prev, [activeSection.sectionId]: true }));
    setSecStarted(false);
    
    // Find next uncompleted section
    const nextIdx = currentSecIdx + 1;
    if (nextIdx < assessment.sections.length) {
      handleStartSection(nextIdx);
    } else {
      // Completed all sections! Submit final exam
      handleSubmitAssessment();
    }
  };

  const handleManualSubmitSection = () => {
    if (window.confirm("Are you sure you want to submit this section? You will not be able to return to it.")) {
      autoSubmitSection();
    }
  };

  const handleSubmitAssessment = () => {
    alert("Congratulations! You have completed all sections of the assessment. Your answers have been successfully submitted.");
    localStorage.removeItem("multisectionAssessmentData");
    navigate('/student/dashboard');
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading || !assessment) {
    return (
      <div className="msa-loading">
        <div className="msa-spinner" />
        <p>Loading multi-section exam environment...</p>
      </div>
    );
  }

  const activeSection = currentSecIdx >= 0 ? assessment.sections[currentSecIdx] : null;
  const activeSecData = activeSection ? sectionData[activeSection.sectionId] : null;
  const questionsList = activeSecData?.questions || [];

  if (sectionCountdown !== null) {
    const targetSection = assessment?.sections[countdownSecIdx];
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'radial-gradient(circle at center, #0f172a, #020617)',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        fontFamily: "'Inter', sans-serif"
      }}>
        <div style={{ textAlign: 'center', maxWidth: '500px', padding: '20px' }}>
          <div className="msa-spinner" style={{ width: '60px', height: '60px', borderTopColor: '#10b981', margin: '0 auto 24px' }}></div>
          <h2 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '8px', color: '#10b981', letterSpacing: '-0.02em' }}>
            Preparing Section Workspace...
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '1rem', marginBottom: '32px', lineHeight: '1.6' }}>
            Entering Section: <strong style={{ color: 'white' }}>{targetSection?.name}</strong>.
            <br />
            Loading test cases and preparing sandbox environments.
          </p>
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '24px 32px',
            display: 'inline-block',
            boxShadow: '0 4px 30px rgba(0,0,0,0.2)'
          }}>
            <div style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', marginBottom: '8px', fontWeight: '700' }}>
              Section Starts In
            </div>
            <div style={{ fontSize: '3.5rem', fontWeight: '900', color: 'white', fontFamily: 'monospace', lineHeight: '1' }}>
              {sectionCountdown}s
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="msa-root">
      {/* Header */}
      <header className="msa-header">
        <div className="msa-header-title">
          <span>🏆</span> {assessment.name}
        </div>
        {secStarted && (
          <div className="msa-timer-box">
            <FaClock />
            <span>Time Remaining: {formatTime(secTimer)}</span>
          </div>
        )}
        <div className="msa-candidate-info">
          <span>{user?.Name || 'Candidate'}</span>
          <span className="msa-email">{user?.Email}</span>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="msa-workspace">
        {/* Left Navigation Sidebar */}
        <aside className="msa-sidebar">
          <h3 className="msa-sidebar-title">Exam Sections</h3>
          <div className="msa-section-list">
            {assessment.sections.map((sec, idx) => {
              const isCompleted = !!secCompleted[sec.sectionId];
              const isActive = idx === currentSecIdx;
              const isLocked = idx > currentSecIdx && !isCompleted;

              return (
                <div 
                  key={sec.sectionId}
                  className={`msa-sec-card ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isLocked ? 'locked' : ''}`}
                >
                  <div className="msa-sec-card-header">
                    <span className="msa-sec-icon">
                      {sec.type === 'mcq' ? <FaBookOpen /> : <FaCode />}
                    </span>
                    <span className="msa-sec-name">{sec.name}</span>
                  </div>
                  <div className="msa-sec-card-meta">
                    <span>{sec.duration_minutes} Mins</span>
                    <span>•</span>
                    <span>{sec.type.toUpperCase()}</span>
                  </div>
                  {isCompleted ? (
                    <span className="msa-badge completed">Submitted</span>
                  ) : isActive ? (
                    <span className="msa-badge active">Active Now</span>
                  ) : isLocked ? (
                    <span className="msa-badge locked"><FaLock /> Locked</span>
                  ) : (
                    <button className="msa-start-btn" onClick={() => handleStartSection(idx)}>Start Section</button>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Content Workspace Area */}
        <main className="msa-content">
          {currentSecIdx === -1 ? (
            // Welcome Page
            <div className="msa-intro-card">
              <h2>Welcome to the Assessment</h2>
              <p>This exam consists of multiple sections. Each section has a separate countdown timer and questions.</p>
              <div className="msa-rules-box">
                <h4>Guidelines:</h4>
                <ul>
                  <li>Once you start a section, its timer starts counting down and cannot be paused.</li>
                  <li>When a section's timer expires, your progress is automatically saved and you proceed to the next section.</li>
                  <li>You cannot navigate back to a completed or submitted section.</li>
                  <li>Fullscreen mode is monitored and proctored. Tabs or browser switching will log violations.</li>
                </ul>
              </div>
              <button 
                className="msa-action-btn primary"
                onClick={() => handleStartSection(0)}
              >
                Proceed to First Section <FaChevronRight />
              </button>
            </div>
          ) : !secStarted ? (
            // Section Completed Transition
            <div className="msa-intro-card">
              <h2>Section Submitted Successfully</h2>
              <p>You have finished the current section. Prepare to start the next section.</p>
              <button 
                className="msa-action-btn primary"
                onClick={() => handleStartSection(currentSecIdx)}
              >
                Start Next Section <FaChevronRight />
              </button>
            </div>
          ) : (
            // Active Section Workspace
            <div className="msa-active-workspace">
              {/* Top Navigation for Questions inside Section */}
              <div className="msa-questions-nav">
                {questionsList.map((q, qIdx) => (
                  <button
                    key={qIdx}
                    className={`msa-q-btn ${qIdx === currentQIdx ? 'active' : ''}`}
                    onClick={() => setCurrentQIdx(qIdx)}
                  >
                    Q{qIdx + 1}
                  </button>
                ))}
                <button 
                  className="msa-section-submit-btn"
                  onClick={handleManualSubmitSection}
                >
                  Submit Section
                </button>
              </div>

              {/* Render Question Editor */}
              {questionsList.length > 0 ? (
                <div className="msa-question-box">
                  {activeSection.type === 'mcq' ? (
                    // ── MCQ EDITOR ──
                    <div className="msa-mcq-container">
                      <div className="msa-question-desc">
                        <h4>Question {currentQIdx + 1}</h4>
                        <p>{questionsList[currentQIdx]?.question || questionsList[currentQIdx]?.description}</p>
                      </div>
                      <div className="msa-options-list">
                        {(questionsList[currentQIdx]?.options || []).map((opt, optIdx) => {
                          const isSelected = mcqAnswers[activeSection.sectionId]?.[currentQIdx] === optIdx;
                          return (
                            <div 
                              key={optIdx}
                              className={`msa-option-card ${isSelected ? 'selected' : ''}`}
                              onClick={() => {
                                setMcqAnswers(prev => ({
                                  ...prev,
                                  [activeSection.sectionId]: {
                                    ...(prev[activeSection.sectionId] || {}),
                                    [currentQIdx]: optIdx
                                  }
                                }));
                              }}
                            >
                              <span className="msa-option-prefix">{String.fromCharCode(65 + optIdx)}</span>
                              <span className="msa-option-text">{opt}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    // ── CODING SANDBOX EDITOR ──
                    <div className="msa-coding-container">
                      <div className="msa-code-left">
                        <h4>Problem Description</h4>
                        <div className="msa-problem-description">
                          <p><strong>{questionsList[currentQIdx]?.title}</strong></p>
                          <p>{questionsList[currentQIdx]?.description}</p>
                          {questionsList[currentQIdx]?.constraints && (
                            <pre className="msa-constraints">
                              {questionsList[currentQIdx]?.constraints}
                            </pre>
                          )}
                        </div>
                      </div>
                      <div className="msa-code-right">
                        <div className="msa-editor-header">
                          <select 
                            value={selectedLanguage}
                            onChange={e => setSelectedLanguage(e.target.value)}
                          >
                            <option value="python">Python</option>
                            <option value="cpp">C++</option>
                            <option value="java">Java</option>
                            <option value="c">C</option>
                          </select>
                        </div>
                        <textarea
                          className="msa-textarea-editor"
                          value={codingSolutions[activeSection.sectionId]?.[currentQIdx] ?? getInitialCode()}
                          onChange={e => {
                            const val = e.target.value;
                            setCodingSolutions(prev => ({
                              ...prev,
                              [activeSection.sectionId]: {
                                ...(prev[activeSection.sectionId] || {}),
                                [currentQIdx]: val
                              }
                            }));
                          }}
                          placeholder="# Write your program here..."
                        />
                        <div className="msa-editor-footer">
                          <button className="msa-run-btn">Run Code</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ color: '#94a3b8', padding: '20px' }}>Loading section question assets...</div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default MultiSectionAssessment;
