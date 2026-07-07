import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaClock, FaCheckCircle, FaExclamationTriangle, FaLock, FaBookOpen, FaCode, FaChevronRight } from 'react-icons/fa';
import '../styles/MultiSectionAssessment.css';
import MCQPage from './MCQPage';
import CodingAssessmentSandbox from './CodingAssessmentSandbox';
import { db } from '../firebase-config';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { supabase } from '../supabaseClient';
import AudioProctoringEngine from './AudioProctoringEngine';

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
  const [examResults, setExamResults] = useState({}); 
  const [examFinished, setExamFinished] = useState(false);
  const [mcqAnswers, setMcqAnswers] = useState({}); // { [secId]: { [questionIdx]: selectedOptionIdx } }
  const [codingSolutions, setCodingSolutions] = useState({}); // { [secId]: { [questionIdx]: codeString } }
  const [selectedLanguage, setSelectedLanguage] = useState('python');
  const [currentQIdx, setCurrentQIdx] = useState(0);

  // Proctoring Violations
  const [violationCount, setViolationCount] = useState(0);
  const timerRef = useRef(null);

  // Flag set when section timer hits 0 — avoids calling autoSubmitSection inside a state updater
  const [sectionTimedOut, setSectionTimedOut] = useState(false);

  // Holds partial progress restored from localStorage during crash recovery.
  // Set in the initial effect, consumed in a separate effect once `assessment` is loaded.
  const [restoredProgress, setRestoredProgress] = useState(null);

  useEffect(() => {
    const authData = JSON.parse(localStorage.getItem('auth_data') || '{}');
    const assessmentData = JSON.parse(localStorage.getItem('multisectionAssessmentData') || 'null');
    
    if (!authData.Email || !assessmentData) {
      navigate('/student/dashboard');
      return;
    }
    
    setUser(authData);
    setAssessment(assessmentData);

    // Crash recovery: check for a partial progress snapshot from a previous session
    const progressKey = `msaProgress_${assessmentData.id}`;
    const saved = JSON.parse(localStorage.getItem(progressKey) || 'null');
    if (saved && saved.email === authData.Email) {
      console.log('[MSA] Restoring partial progress from crash recovery:', saved);
      setExamResults(saved.examResults || {});
      setSecCompleted(saved.completedSections || {});
      // Store so the assessment-ready effect below can resume from next section
      setRestoredProgress(saved);
    }

    loadAllSections(assessmentData);
  }, []);

  // Resume from next uncompleted section after a crash/reload.
  // Runs once assessment and handleStartSection are both ready.
  // We split this into a separate effect because `assessment` is set async (via setState)
  // so we can't call handleStartSection in the initial effect above.
  useEffect(() => {
    if (!assessment || !restoredProgress) return;
    const nextIdx = (restoredProgress.lastSectionIdx ?? -1) + 1;
    console.log(`[MSA] Crash recovery: resuming from section index ${nextIdx}`);
    if (nextIdx < assessment.sections.length) {
      handleStartSection(nextIdx);
    } else {
      // All sections were already completed — show the finished screen
      setExamFinished(true);
    }
    setRestoredProgress(null); // consume so this effect doesn't re-fire
  }, [assessment, restoredProgress, handleStartSection]);

  // Block browser back/forward during the assessment (same guard as CodingAssessmentSandbox)
  useEffect(() => {
    // Push a dummy history entry so back-button hits it instead of leaving the page
    window.history.pushState({ msaActive: true }, '');

    const handlePopState = (e) => {
      // Immediately re-push so the student is never able to go back
      window.history.pushState({ msaActive: true }, '');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
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

  // Timer loop — IMPORTANT: do NOT call autoSubmitSection() inside the state updater.
  // Doing so causes React to throw ("Cannot update a component while rendering a different component"),
  // which triggers the ErrorBoundary's "Something went wrong" screen.
  // Instead we set a sectionTimedOut flag and handle it in a separate effect.
  useEffect(() => {
    if (secStarted && secTimer > 0) {
      timerRef.current = setInterval(() => {
        setSecTimer(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setSectionTimedOut(true); // signal without side-effect
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [secStarted, currentSecIdx, secTimer]);

  // Handle section timer expiry safely (outside state updater)
  useEffect(() => {
    if (sectionTimedOut) {
      setSectionTimedOut(false);
      autoSubmitSection();
    }
  }, [sectionTimedOut, autoSubmitSection]);

  // Section Countdown Timer Effect
  useEffect(() => {
    if (sectionCountdown === null) return;
    if (sectionCountdown <= 0) {
      // Start the section now!
      setSecStarted(true);
      setSectionCountdown(null);
      return;
    }
    const timer = setTimeout(() => {
      setSectionCountdown(prev => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [sectionCountdown]);


  const handleStartSection = useCallback((idx) => {
    setCountdownSecIdx(idx);
    setSectionCountdown(10);
    setCurrentSecIdx(idx);
    setCurrentQIdx(0);
    if (assessment && assessment.sections) {
      const section = assessment.sections[idx];
      if (section) {
        setSecTimer((section.duration_minutes || 30) * 60);
      }
    }
  }, [assessment]);

  const autoSubmitSection = useCallback((sectionResults) => {
    if (examFinished) return;
    if (currentSecIdx < 0 || !assessment?.sections || currentSecIdx >= assessment.sections.length) return;

    const activeSection = assessment.sections[currentSecIdx];
    if (!activeSection) return;
    
    const updatedResults = {
      ...examResults,
      [activeSection.sectionId]: {
        sectionName: activeSection.name,
        type: activeSection.type,
        data: sectionResults || {}
      }
    };

    // Save results for this section
    setExamResults(updatedResults);

    setSecCompleted(prev => ({ ...prev, [activeSection.sectionId]: true }));
    setSecStarted(false);
    
    // Find next uncompleted section
    const nextIdx = currentSecIdx + 1;
    if (nextIdx < assessment.sections.length) {
      // ── Persist partial progress so a crash/shutdown doesn't lose this section ──
      // 1. Save a localStorage snapshot for instant local recovery
      const progressKey = `msaProgress_${assessment.id}`;
      const progressSnapshot = {
        assessmentId: assessment.id,
        email: user?.Email || '',
        // Derive from updatedResults keys — guaranteed up-to-date in this call
        completedSections: Object.fromEntries(Object.keys(updatedResults).map(id => [id, true])),
        examResults: updatedResults,
        lastSectionIdx: currentSecIdx,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(progressKey, JSON.stringify(progressSnapshot));

      // 2. Write partial result to Firestore immediately (merge so it accumulates section by section)
      if (user?.Email) {
        const college = user.College || 'KGKITE';
        const year = user.Year || '2026';
        const assessmentDocPath = `AssessmentResults/${assessment.id}/colleges/${college}/years/${year}/students/${user.Email}`;
        setDoc(doc(db, assessmentDocPath), {
          email: user.Email,
          rollNumber: user['Roll Number'] || '',
          name: user.Name || '',
          college, year,
          department: user.Department || '',
          testID: assessment.id,
          testName: assessment.name,
          assessmentId: assessment.id,
          assessmentName: assessment.name,
          type: 'multisection',
          status: 'partial',
          sectionsCompleted: currentSecIdx + 1,
          totalSections: assessment.sections.length,
          sections: updatedResults,
          lastUpdatedAt: serverTimestamp(),
          lastUpdatedAtISO: new Date().toISOString()
        }, { merge: true })
          .then(() => console.log(`[MSA] Partial progress saved to Firestore after section ${currentSecIdx + 1}`))
          .catch(e => console.error('[MSA] Failed to save partial progress to Firestore:', e));
      }

      handleStartSection(nextIdx);
    } else {
      // Completed all sections!
      if (user && user.Email) {
        const college = user.College || 'KGKITE';
        const year = user.Year || '2026';
        
        const attemptData = {
          email: user.Email,
          rollNumber: user["Roll Number"] || '',
          name: user.Name || '',
          college: college,
          year: year,
          department: user.Department || '',
          testID: assessment.id,
          testName: assessment.name,
          assessmentId: assessment.id,
          assessmentName: assessment.name,
          submittedAt: serverTimestamp(),
          submittedAtISO: new Date().toISOString(),
          type: 'multisection',
          sections: updatedResults
        };

        // 1. Save to unified AssessmentResults collection
        const assessmentDocPath = `AssessmentResults/${assessment.id}/colleges/${college}/years/${year}/students/${user.Email}`;
        setDoc(doc(db, assessmentDocPath), attemptData, { merge: true })
          .then(() => console.log("Saved multisection results to AssessmentResults:", assessmentDocPath))
          .catch(e => console.error("Failed to write AssessmentResults:", e));

        // 2. Save to user attempts history
        setDoc(doc(db, "users", user.Email, "multiSectionAttempts", assessment.id), attemptData, { merge: true })
          .catch(e => console.error("Failed to write student-centric attempt:", e));

        // 3. Compute totals and upsert summary row into Supabase mcq_results so it renders in staff/admin lists
        const totalScore = Object.values(updatedResults).reduce((acc, sec) => acc + (sec.data?.score || 0), 0);
        const totalQ = Object.values(updatedResults).reduce((acc, sec) => acc + (sec.data?.totalQuestions || 0), 0);
        const pct = totalQ > 0 ? (totalScore / totalQ) : 0;
        // Sum violations across all sections — each section tracked independently (fresh proctoring per key remount)
        const totalViolations = Object.values(updatedResults).reduce((acc, sec) => acc + (sec.data?.violationCount || 0), 0);

        supabase
          .from('mcq_results')
          .upsert({
            roll_number: user["Roll Number"] || '',
            name: user.Name || '',
            email: user.Email,
            college: college,
            year: year,
            department: user.Department || '',
            test_id: assessment.id,
            test_name: assessment.name,
            score: totalScore,
            total_questions: totalQ,
            correct_answers: totalScore,
            incorrect_answers: totalQ - totalScore,
            percentage: pct,
            submitted_at: new Date().toISOString(),
            violation_count: totalViolations,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'email,test_id'
          })
          .then(() => console.log("Saved summary row to Supabase mcq_results"))
          .catch(supErr => console.warn("Failed to write summary to Supabase:", supErr));
      }
      setExamFinished(true);
      // Clean up both the assessment data and partial progress key
      localStorage.removeItem('multisectionAssessmentData');
      localStorage.removeItem(`msaProgress_${assessment.id}`);
    }
  }, [examFinished, currentSecIdx, assessment, examResults, handleStartSection, user]);

  const handleManualSubmitSection = () => {
    if (window.confirm("Are you sure you want to submit this section? You will not be able to return to it.")) {
      autoSubmitSection();
    }
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



  if (examFinished) {
    return (
      <div className="msa-finished-container" style={{
        maxWidth: '850px',
        margin: '60px auto',
        padding: '30px',
        background: '#1e293b',
        borderRadius: '12px',
        color: '#f8fafc',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
        fontFamily: "'Inter', sans-serif"
      }}>
        <div style={{ textAlign: 'center', marginBottom: '35px' }}>
          <FaCheckCircle style={{ color: '#10b981', fontSize: '4.5rem', marginBottom: '15px' }} />
          <h1 style={{ fontSize: '2.2rem', fontWeight: '800', color: 'white', marginBottom: '10px' }}>Assessment Completed!</h1>
          <p style={{ color: '#94a3b8', fontSize: '1.1rem' }}>
            Congratulations <strong>{user?.Name}</strong>, your answers have been successfully recorded and submitted.
          </p>
        </div>

        <div style={{ background: '#0f172a', borderRadius: '8px', padding: '20px', marginBottom: '30px' }}>
          <h3 style={{ borderBottom: '1px solid #334155', paddingBottom: '10px', marginBottom: '15px', color: '#38bdf8' }}>
            Summary of Time Spent per Question
          </h3>
          {assessment.sections.map((sec, sIdx) => {
            const secRes = examResults[sec.sectionId] || {};
            const qList = sectionData[sec.sectionId]?.questions || [];
            
            return (
              <div key={sec.sectionId} style={{ marginBottom: '25px' }}>
                <h4 style={{ color: '#e2e8f0', marginBottom: '8px', fontSize: '1.05rem' }}>
                  {sIdx + 1}. {sec.name} ({sec.type.toUpperCase()})
                </h4>
                
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b' }}>
                      <th style={{ padding: '8px 12px' }}>Question No.</th>
                      <th style={{ padding: '8px 12px' }}>Question Title / Text</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Time Spent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {qList.map((q, qIdx) => {
                      const qId = q.questionId || q.id || qIdx.toString();
                      const spent = sec.type === 'mcq'
                        ? (secRes.data?.timeSpentPerQ?.[qIdx] || 0)
                        : (secRes.data?.timeSpentPerQ?.[qId] || 0);

                      const formatSecs = (val) => {
                        const m = Math.floor(val / 60);
                        const s = val % 60;
                        return m > 0 ? `${m}m ${s}s` : `${s}s`;
                      };

                      return (
                        <tr key={qIdx} style={{ borderBottom: '1px solid #1e293b' }}>
                          <td style={{ padding: '10px 12px', color: '#94a3b8' }}>Q{qIdx + 1}</td>
                          <td style={{ padding: '10px 12px', color: '#cbd5e1', maxWidth: '400px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {q.title || q.question || 'Coding Challenge'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', color: '#10b981' }}>
                            {formatSecs(spent)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: 'center' }}>
          <button 
            onClick={() => navigate('/student/dashboard')}
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              border: 'none',
              padding: '12px 30px',
              fontSize: '1rem',
              fontWeight: '700',
              borderRadius: '6px',
              cursor: 'pointer',
              boxShadow: '0 4px 10px rgba(16, 185, 129, 0.25)',
              transition: 'transform 0.2s'
            }}
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (activeSection) {
    const codingQTimers = (() => {
      const qCount = questionsList.length;
      if (activeSection.questionTimerList) {
        const parts = activeSection.questionTimerList.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
        if (parts.length > 0) {
          return Array.from({ length: qCount }, (_, idx) => parts[idx] !== undefined ? parts[idx] : parts[parts.length - 1]);
        }
      }
      if (activeSection.questionTimer) {
        return Array(qCount).fill(activeSection.questionTimer);
      }
      return [];
    })();

    // IMPORTANT: key={activeSection.sectionId} forces React to UNMOUNT + REMOUNT the
    // embedded component each time the section changes. Without this, React reuses the
    // same instance and the old section's answers/state bleeds into the next section.
    const sectionElement = activeSection.type === 'mcq' ? (
      <MCQPage 
        key={`section-${activeSection.sectionId}`}
        isEmbedded={true}
        testData={activeSecData}
        secTimer={secTimer}
        onSectionSubmit={autoSubmitSection}
        settings={{
          timerRestrictedSubmit: !!activeSection.timerRestrictedSubmit,
          questionTimer: activeSection.questionTimer || 0,
          forwardOnly: !!activeSection.forwardOnly || (activeSection.questionTimer > 0),
          proctored: !!assessment.proctored || !!activeSection.proctored,
          audioProctored: !!assessment.audioProctored || !!activeSection.audioProctored
        }}
      />
    ) : (
      <CodingAssessmentSandbox 
        key={`section-${activeSection.sectionId}`}
        isEmbedded={true}
        testData={activeSecData}
        secTimer={secTimer}
        onSectionSubmit={autoSubmitSection}
        settings={{
          timerRestrictedSubmit: !!activeSection.timerRestrictedSubmit,
          questionTimers: codingQTimers,
          forwardOnly: !!activeSection.forwardOnly || (codingQTimers.length > 0)
        }}
      />
    );

    return (
      <>
        {sectionElement}
        {sectionCountdown !== null && (
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
                Entering Section: <strong style={{ color: 'white' }}>{assessment?.sections[countdownSecIdx]?.name}</strong>.
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
        )}
      </>
    );
  }

  return (
    <div className="msa-root">
      {/* Audio Proctoring — runs at MSA level across all sections when enabled */}
      {(!!assessment.audioProctored) && secStarted && user && (
        <AudioProctoringEngine
          studentID={user.Email}
          testID={assessment.id || 'msa-unknown'}
          isTestActive={secStarted}
          maxViolations={Number(assessment.maxAudioViolations) || 3}
          onViolationUpdate={(info) => {
            console.warn('[MSA AudioProctor] Violation:', info?.type, info?.timestamp);
          }}
        />
      )}
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
          ) : (
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
          )}
        </main>
      </div>
    </div>
  );
};

export default MultiSectionAssessment;
