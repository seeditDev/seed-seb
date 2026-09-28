import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  getCorporateAssessmentsForStudent,
  prepareCorporateAssessmentForLaunch,
  SEED_BENCHMARK_ASSESSMENT,
} from '../services/corporateAssessmentService';
import { db } from '../lib/firebase-config';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import '../styles/Placements.css';

const CURATED_SKILLS = [
  'Python',
  'Java',
  'C++',
  'JavaScript',
  'TypeScript',
  'React',
  'Node.js',
  'SQL / MySQL',
  'Data Structures & Algorithms',
  'Object Oriented Programming (OOP)',
  'Machine Learning',
  'Git & GitHub',
  'AWS Cloud',
  'Problem Solving',
];

const Placements = ({ user }) => {
  const navigate = useNavigate();
  // Tabs: 'drives' | 'corporate-tests' | 'jobs' | 'applications'
  const [activeTab, setActiveTab] = useState('drives');
  const [drives, setDrives] = useState([]);
  const [corporateTests, setCorporateTests] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [jobApplications, setJobApplications] = useState([]);
  const [driveApplications, setDriveApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);
  const [tenants, setTenants] = useState([]);

  // Apply Modal state for Drives
  const [applyingDrive, setApplyingDrive] = useState(null);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [submittingApp, setSubmittingApp] = useState(false);

  // Application Form State (with two-way profile sync)
  const [appForm, setAppForm] = useState({
    studentName: '',
    studentEmail: '',
    studentPhone: '',
    collegeName: '',
    graduationBatch: '2026',
    department: 'Computer Science',
    tenthPercentage: '',
    twelfthPercentage: '',
    degreeCgpa: '',
    activeBacklogs: 0,
    resumeDriveLink: '',
    skills: [],
    coverNote: '',
  });

  // Student benchmark status
  const userPercentile = user?.seedPercentile || (user?.seedVerified ? 92 : null);

  useEffect(() => {
    let mounted = true;
    const loadAll = async () => {
      setLoading(true);
      try {
        // 1. Load Recruitment Drives from Firestore
        const drivesSnap = await getDocs(collection(db, 'recruitment_drives'));
        const drivesList = [];
        drivesSnap.forEach((d) => {
          const data = d.data();
          drivesList.push({ id: d.id, ...data });
        });
        if (mounted) setDrives(drivesList);

        // 2. Load Partner Tenants for college selection
        try {
          const tenantsSnap = await getDocs(collection(db, 'tenants'));
          const tList = [];
          tenantsSnap.forEach(d => {
            const data = d.data() || {};
            tList.push({ id: d.id, name: data.name || d.id });
          });
          if (tList.length === 0) {
            tList.push(
              { id: 'SEEDIT', name: 'SEED Innovating Technologies and Educational Services (SEED-IT)' },
              { id: 'KITE', name: 'KGiSL Institute of Technology (KITE)' }
            );
          }
          if (mounted) setTenants(tList);
        } catch (_) {}

        // 3. Load Corporate & Benchmark Assessments
        const assessments = await getCorporateAssessmentsForStudent(user?.uid);
        if (mounted) setCorporateTests(assessments);

        // 3. Load Jobs from Firestore
        const jobsSnap = await getDocs(collection(db, 'jobs'));
        const jobsList = [];
        jobsSnap.forEach((d) => {
          jobsList.push({ id: d.id, ...d.data() });
        });
        if (mounted) setJobs(jobsList);

        // 4. Load Student Applications (both job and drive applications)
        if (user?.uid) {
          const appQuery = query(collection(db, 'jobApplications'), where('studentUid', '==', user.uid));
          const appSnap = await getDocs(appQuery);
          const appList = [];
          appSnap.forEach((d) => {
            appList.push({ id: d.id, ...d.data() });
          });
          if (mounted) setJobApplications(appList);

          const driveAppQuery = query(collection(db, 'drive_applications'), where('studentUid', '==', user.uid));
          const driveAppSnap = await getDocs(driveAppQuery);
          const driveAppList = [];
          driveAppSnap.forEach((d) => {
            driveAppList.push({ id: d.id, ...d.data() });
          });
          if (mounted) setDriveApplications(driveAppList);

          // 5. Pre-fill application form with user's stored profile
          const userSnap = await getDoc(doc(db, 'users', user.uid));
          if (userSnap.exists()) {
            const u = userSnap.data();
            if (mounted) {
              setAppForm((prev) => ({
                ...prev,
                studentName: u.name || user?.name || '',
                studentEmail: u.email || user?.email || '',
                studentPhone: u.phone || '',
                collegeName: u.college || user?.college || '',
                graduationBatch: u.year || user?.year || '2026',
                department: u.department || user?.department || 'Computer Science',
                tenthPercentage: u.tenthPercentage !== undefined ? String(u.tenthPercentage) : '',
                twelfthPercentage: u.twelfthPercentage !== undefined ? String(u.twelfthPercentage) : '',
                degreeCgpa: u.degreeCgpa !== undefined ? String(u.degreeCgpa) : '',
                activeBacklogs: u.activeBacklogs || 0,
                resumeDriveLink: u.resumeDriveLink || '',
                skills: Array.isArray(u.skills) && u.skills.length > 0 ? u.skills : ['Python', 'Problem Solving'],
              }));
            }
          }
        }
      } catch (err) {
        console.warn('[Placements] Error loading placement data:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadAll();
    return () => {
      mounted = false;
    };
  }, [user?.uid]);

  const handleLaunchAssessment = (test) => {
    try {
      const url = prepareCorporateAssessmentForLaunch(test, user);
      navigate({ to: url });
    } catch (err) {
      alert(`Could not launch assessment: ${err.message}`);
    }
  };

  const handleLaunchDriveRound = (round, drive) => {
    if (!round.assessmentMapping) {
      alert(`Round ${round.roundNumber} is a direct interview stage. Your recruiter will contact you directly.`);
      return;
    }

    try {
      const canonicalAss = {
        id: round.assessmentMapping.testId,
        slug: round.assessmentMapping.testId,
        name: round.assessmentMapping.testTitle || round.roundName,
        title: round.assessmentMapping.testTitle || round.roundName,
        duration: round.assessmentMapping.durationMinutes || 60,
        maxScore: round.assessmentMapping.maxScore || 100,
        isCorporate: true,
        proctoring: {
          enabled: true,
          webcam: true,
          fullScreen: true,
          tabLock: true,
          maxViolations: 3,
        },
        passkey: round.assessmentMapping.passkey || '',
        courseId: round.assessmentMapping.courseId,
        seriesId: round.assessmentMapping.seriesId,
      };

      const url = prepareCorporateAssessmentForLaunch(canonicalAss, user);
      navigate({ to: url });
    } catch (err) {
      alert(`Could not launch round assessment: ${err.message}`);
    }
  };

  // ─────────────────────────────────────────────────────────
  // DRIVE APPLICATION SUBMIT WITH 2-WAY PROFILE SYNC
  // ─────────────────────────────────────────────────────────
  const handleOpenApplyDrive = (drive) => {
    setApplyingDrive(drive);
    setShowApplyModal(true);
  };

  const handleToggleSkill = (skill) => {
    const current = appForm.skills;
    const next = current.includes(skill)
      ? current.filter((s) => s !== skill)
      : [...current, skill];
    setAppForm({ ...appForm, skills: next });
  };

  const handleSubmitDriveApplication = async (e) => {
    e.preventDefault();
    if (!user?.uid) {
      alert('Please sign in to apply.');
      return;
    }
    if (!applyingDrive) return;

    const resumeLink = appForm.resumeDriveLink.trim();
    if (applyingDrive.eligibility?.requireResumeLink && !resumeLink) {
      alert('Please enter your Google Drive resume link.');
      return;
    }

    try {
      setSubmittingApp(true);
      const appId = `app_${applyingDrive.id}_${user.uid}`;
      const appPayload = {
        id: appId,
        driveId: applyingDrive.id,
        companyId: applyingDrive.companyId,
        companyName: applyingDrive.companyName,
        driveTitle: applyingDrive.title,
        role: applyingDrive.role,

        studentUid: user.uid,
        studentName: appForm.studentName.trim() || user.name || 'Candidate',
        studentEmail: appForm.studentEmail.trim() || user.email || '',
        studentPhone: appForm.studentPhone.trim(),
        collegeName: appForm.collegeName.trim() || user.college || 'Direct Learner',
        tenantId: user.tenantId || '',
        isGlobalStudent: !user.tenantId || user.tenantId === 'global',

        tenthPercentage: Number(appForm.tenthPercentage || 0),
        twelfthPercentage: Number(appForm.twelfthPercentage || 0),
        degreeCgpa: Number(appForm.degreeCgpa || 0),
        activeBacklogs: Number(appForm.activeBacklogs || 0),
        graduationBatch: appForm.graduationBatch,
        department: appForm.department,
        resumeDriveLink: resumeLink,
        skills: appForm.skills,
        coverNote: appForm.coverNote.trim(),

        currentRoundNumber: 1,
        stage: 'applied',
        appliedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // 1. Write to drive_applications
      await setDoc(doc(db, 'drive_applications', appId), appPayload, { merge: true });

      // 2. Increment applicant counter on drive
      try {
        await updateDoc(doc(db, 'recruitment_drives', applyingDrive.id), {
          applicantCount: increment(1),
          updatedAt: serverTimestamp(),
        });
      } catch (_) {}

      // 3. 2-Way Profile Sync back to users/{uid}
      const profilePatch = {
        tenthPercentage: Number(appPayload.tenthPercentage || 0),
        twelfthPercentage: Number(appPayload.twelfthPercentage || 0),
        degreeCgpa: Number(appPayload.degreeCgpa || 0),
        activeBacklogs: Number(appPayload.activeBacklogs || 0),
        resumeDriveLink: resumeLink,
        skills: appPayload.skills,
        updatedAt: serverTimestamp(),
      };
      if (appPayload.collegeName) profilePatch.college = appPayload.collegeName;
      if (appPayload.graduationBatch) profilePatch.year = appPayload.graduationBatch;
      if (appPayload.department) profilePatch.department = appPayload.department;

      await setDoc(doc(db, 'users', user.uid), profilePatch, { merge: true });

      setDriveApplications((prev) => [appPayload, ...prev.filter((a) => a.id !== appId)]);
      setShowApplyModal(false);
      setApplyingDrive(null);
      setActiveTab('applications');
      alert(`Application submitted successfully for ${applyingDrive.title}! Your academic marks and resume link have been synced to your profile.`);
    } catch (err) {
      console.error('[Placements] Application submit error:', err);
      alert(`Could not submit application: ${err.message}`);
    } finally {
      setSubmittingApp(false);
    }
  };

  const isDriveApplied = (driveId) => {
    return driveApplications.some((a) => a.driveId === driveId);
  };

  const filteredDrives = useMemo(() => {
    return drives.filter((d) => {
      // Tenant filtering
      if (user?.tenantId && user.tenantId !== 'global') {
        const matchesTenant = d.isGlobal || d.targetTenantIds?.includes('all') || d.targetTenantIds?.includes(user.tenantId);
        if (!matchesTenant) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const hay = [d.title, d.companyName, d.role, d.location].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [drives, user?.tenantId, searchQuery]);

  return (
    <div className="placements-container">
      {/* Top Banner & Header */}
      <div className="placements-header-hero">
        <div className="hero-left">
          <div className="hero-badge">
            <span>🛡️ SEED Lockdown Examination Engine</span>
          </div>
          <h2>Corporate Placements &amp; Recruitment Drives</h2>
          <p>
            Participate in multi-round campus recruitment drives, complete proctored assessments in SEB lockdown mode, and track transparent qualification cutoffs.
          </p>
        </div>

        <div className="hero-right-card">
          <div className="benchmark-stat-label">Your SEED QBeA Benchmark Status</div>
          {userPercentile ? (
            <div className="benchmark-verified-box">
              <div className="benchmark-score-num">{userPercentile}th</div>
              <div className="benchmark-score-desc">
                <strong>SEED QBeA Percentile Verified</strong>
                <span>Recognized across 50+ recruiting partners</span>
              </div>
            </div>
          ) : (
            <div className="benchmark-unverified-box">
              <span className="unverified-tag">SEED QBeA Not Yet Taken</span>
              <p>Attempt the SEED Qualifier Benchmarking Assessment below to earn your verified badge and attract recruiter shortlists.</p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="placements-nav-tabs">
        <button
          className={`tab-btn ${activeTab === 'drives' ? 'active' : ''}`}
          onClick={() => setActiveTab('drives')}
        >
          <span>🎓 Campus Recruitment Drives ({drives.length})</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'applications' ? 'active' : ''}`}
          onClick={() => setActiveTab('applications')}
        >
          <span>📊 My Application Pipeline ({driveApplications.length + jobApplications.length})</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'corporate-tests' ? 'active' : ''}`}
          onClick={() => setActiveTab('corporate-tests')}
        >
          <span>🎯 Proctored Screening Tests ({corporateTests.length})</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'jobs' ? 'active' : ''}`}
          onClick={() => setActiveTab('jobs')}
        >
          <span>💼 Verified Job Board ({jobs.length})</span>
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────
         TAB 1: CAMPUS RECRUITMENT DRIVES
         ───────────────────────────────────────────────────────── */}
      {activeTab === 'drives' && (
        <div className="tab-pane-content">
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
              Loading recruitment drives...
            </div>
          ) : filteredDrives.length === 0 ? (
            <div style={{ padding: '3.5rem 2rem', textAlign: 'center', background: 'rgba(30, 41, 59, 0.4)', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🎓</div>
              <h4 style={{ color: '#fff', margin: '0 0 6px 0', fontSize: '16px' }}>No Active Recruitment Drives Available</h4>
              <p style={{ margin: 0, fontSize: '13px' }}>There are currently no open recruitment drives for your batch or college. New drives will appear here once published.</p>
            </div>
          ) : (
            <div className="corporate-tests-grid">
              {filteredDrives.map((d) => {
                const applied = isDriveApplied(d.id);
                return (
                  <div key={d.id} className="corporate-test-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div className="test-card-top">
                        <div className="company-logo-placeholder">
                          {d.companyName?.slice(0, 2)?.toUpperCase() || 'CO'}
                        </div>
                        <div>
                          <div className="test-company-name">{d.companyName}</div>
                          <h4 className="test-title">{d.title}</h4>
                        </div>
                      </div>

                      <p className="test-desc">{d.role} • {d.location} • ₹{d.ctcMin} - ₹{d.ctcMax} LPA</p>

                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', margin: '8px 0' }}>
                        <span style={{ background: 'rgba(124, 58, 237, 0.2)', color: '#c4b5fd', padding: '2px 8px', borderRadius: 4, fontSize: '11px' }}>
                          🎓 Batches: {d.targetBatches?.includes('all') ? '2026–2032' : d.targetBatches?.join(', ')}
                        </span>
                        <span style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#7dd3fc', padding: '2px 8px', borderRadius: 4, fontSize: '11px' }}>
                          {d.isGlobal ? '🌐 Open to All Colleges' : '🏛️ Partner College Drive'}
                        </span>
                        <span style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#86efac', padding: '2px 8px', borderRadius: 4, fontSize: '11px' }}>
                          {d.rounds?.length || 4} Rounds
                        </span>
                      </div>

                      <div style={{ fontSize: '12px', color: '#94a3b8', background: 'rgba(15, 23, 42, 0.5)', padding: '6px 10px', borderRadius: 6, margin: '8px 0' }}>
                        <div><strong>Eligibility:</strong> Min CGPA {d.eligibility?.minDegreeCgpa} • 10th/12th {d.eligibility?.minTenthPercentage}%</div>
                        <div><strong>Backlogs:</strong> {d.eligibility?.maxBacklogsAllowed === 0 ? 'Strictly No Backlogs' : `Max ${d.eligibility?.maxBacklogsAllowed} Backlogs`}</div>
                      </div>
                    </div>

                    <div className="test-card-footer" style={{ marginTop: '12px' }}>
                      {applied ? (
                        <button
                          className="btn-launch-corporate"
                          style={{ background: 'rgba(34, 197, 94, 0.2)', borderColor: '#22c55e', color: '#86efac' }}
                          onClick={() => setActiveTab('applications')}
                        >
                          ✓ View Applied Progress
                        </button>
                      ) : (
                        <button
                          className="btn-launch-corporate"
                          onClick={() => handleOpenApplyDrive(d)}
                        >
                          Apply for Drive →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
         TAB 2: MY APPLICATION PIPELINE (Transparent Status Stepper)
         ───────────────────────────────────────────────────────── */}
      {activeTab === 'applications' && (
        <div className="tab-pane-content">
          {driveApplications.length === 0 && jobApplications.length === 0 ? (
            <div style={{ padding: '3.5rem 2rem', textAlign: 'center', background: 'rgba(30, 41, 59, 0.6)', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8' }}>
              <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📊</div>
              <h4 style={{ color: '#fff', margin: '0 0 6px 0', fontSize: '16px' }}>No Applications Submitted Yet</h4>
              <p style={{ margin: 0, fontSize: '13px' }}>Explore active recruitment drives or jobs to submit applications and unlock SEB screening rounds.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Drive Applications */}
              {driveApplications.map((app) => {
                const d = drives.find((item) => item.id === app.driveId);
                const activeRound = d?.rounds?.find((r) => r.roundNumber === (app.currentRoundNumber || 1));
                const mappedTest = activeRound?.assessmentMapping;

                return (
                  <div key={app.id} style={{ background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '12px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: '10px' }}>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#c4b5fd', textTransform: 'uppercase' }}>
                          {app.companyName}
                        </div>
                        <h4 style={{ margin: '2px 0 0', fontSize: '16px', color: '#fff' }}>
                          {app.driveTitle}
                        </h4>
                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                          Role: {app.role} • Batch: {app.graduationBatch || '2026'}
                        </div>
                      </div>

                      <span style={{
                        background: app.stage === 'round_failed' ? 'rgba(239, 68, 68, 0.2)' : app.stage === 'selected' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(124, 58, 237, 0.2)',
                        color: app.stage === 'round_failed' ? '#fca5a5' : app.stage === 'selected' ? '#86efac' : '#c4b5fd',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        padding: '4px 10px',
                        borderRadius: 999,
                        fontSize: '11px',
                        fontWeight: 700,
                      }}>
                        {app.stage?.replace(/_/g, ' ')?.toUpperCase()}
                      </span>
                    </div>

                    {/* Multi-round Pipeline Stepper */}
                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '12px' }}>
                      {(d?.rounds || [
                        { roundNumber: 1, roundName: 'Round 1: Online Assessment' },
                        { roundNumber: 2, roundName: 'Round 2: Technical Interview' },
                      ]).map((r) => {
                        const isDone = (app.currentRoundNumber || 1) > r.roundNumber;
                        const isCurrent = (app.currentRoundNumber || 1) === r.roundNumber;
                        return (
                          <div
                            key={r.roundNumber}
                            style={{
                              flex: 1,
                              minWidth: 140,
                              background: isCurrent ? 'rgba(124, 58, 237, 0.2)' : isDone ? 'rgba(34, 197, 94, 0.15)' : 'rgba(15, 23, 42, 0.5)',
                              border: isCurrent ? '1px solid #7c3aed' : isDone ? '1px solid #22c55e' : '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: 8,
                              padding: '8px 10px',
                            }}
                          >
                            <div style={{ fontSize: '10px', fontWeight: 700, color: isCurrent ? '#c4b5fd' : isDone ? '#86efac' : '#94a3b8', textTransform: 'uppercase' }}>
                              Round {r.roundNumber} {isDone ? '✓ Cleared' : isCurrent ? '● Active' : ''}
                            </div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {r.roundName?.split('—')?.[0] || `Round ${r.roundNumber}`}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Launch SEB Test Action */}
                    {mappedTest && app.stage !== 'round_failed' && (
                      <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: 8, padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <div style={{ color: '#fff', fontWeight: 700, fontSize: '14px' }}>
                            🎯 {mappedTest.testTitle}
                          </div>
                          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: 2 }}>
                            Duration: {mappedTest.durationMinutes} Mins • Max Marks: {mappedTest.maxScore}
                            {mappedTest.passkey ? ` • Passkey: ${mappedTest.passkey}` : ''}
                          </div>
                        </div>

                        <button
                          className="btn-launch-benchmark"
                          style={{ padding: '8px 16px', fontSize: '13px' }}
                          onClick={() => handleLaunchDriveRound(activeRound, d)}
                        >
                          🚀 Launch in SEB
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
         TAB 3: PROCTORED SCREENING TESTS (Legacy)
         ───────────────────────────────────────────────────────── */}
      {activeTab === 'corporate-tests' && (
        <div className="tab-pane-content">
          <div className="litmus-benchmark-card">
            <div className="benchmark-card-header">
              <div className="benchmark-tag">⭐ FLAGSHIP BENCHMARK (SEED QBeA)</div>
              <div className="benchmark-proctor-pill">🔒 Full SEB Lockdown &amp; Webcam Proctoring Enforced</div>
            </div>

            <div className="benchmark-card-body">
              <div className="benchmark-info">
                <h3>{SEED_BENCHMARK_ASSESSMENT.name}</h3>
                <p>{SEED_BENCHMARK_ASSESSMENT.description}</p>
                <div className="benchmark-meta-grid">
                  <div className="meta-item">
                    <span className="meta-label">Total Duration</span>
                    <span className="meta-val">⏱️ {SEED_BENCHMARK_ASSESSMENT.duration} Mins</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Total Score</span>
                    <span className="meta-val">🎯 {SEED_BENCHMARK_ASSESSMENT.maxScore} Marks</span>
                  </div>
                </div>
              </div>

              <div className="benchmark-action-box">
                <button
                  className="btn-launch-benchmark"
                  onClick={() => handleLaunchAssessment(SEED_BENCHMARK_ASSESSMENT)}
                >
                  🚀 Launch SEED QBeA in SEB
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
         TAB 4: VERIFIED JOB BOARD (Legacy)
         ───────────────────────────────────────────────────────── */}
      {activeTab === 'jobs' && (
        <div className="tab-pane-content">
          <div className="job-board-grid">
            {jobs.map((j) => (
              <div key={j.id} className="job-card-seb" onClick={() => setSelectedJob(j)}>
                <div className="job-seb-header">
                  <div>
                    <h4 className="job-role">{j.title}</h4>
                    <span className="job-comp">{j.companyName} • 📍 {j.location}</span>
                  </div>
                  <span className="job-ctc">₹{j.ctcMin} - ₹{j.ctcMax} LPA</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────
         MODAL: GUIDED DRIVE APPLICATION (2-Way Profile Sync)
         ───────────────────────────────────────────────────────── */}
      {showApplyModal && applyingDrive && (
        <div className="preview-overlay" onClick={() => setShowApplyModal(false)}>
          <div className="preview-modal" style={{ maxWidth: 640, background: '#1e293b', color: '#fff' }} onClick={(e) => e.stopPropagation()}>
            <div className="preview-header" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <div>
                <h3 style={{ margin: 0, color: '#fff' }}>Apply for {applyingDrive.title}</h3>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                  {applyingDrive.companyName} • {applyingDrive.role}
                </div>
              </div>
              <button className="btn-close-modal" onClick={() => setShowApplyModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSubmitDriveApplication}>
              <div className="preview-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
                <div style={{ background: 'rgba(124, 58, 237, 0.15)', border: '1px solid rgba(124, 58, 237, 0.4)', borderRadius: 8, padding: '10px 12px', fontSize: '12px', color: '#c4b5fd', marginBottom: '10px' }}>
                  ✨ <strong>Two-Way Profile Sync Active:</strong> Details entered here are automatically saved to your master student profile in Firestore.
                </div>

                {/* Live Eligibility Verification Banner */}
                {applyingDrive.eligibility && (() => {
                  const minCgpa = Number(applyingDrive.eligibility.minDegreeCgpa || 0);
                  const minTenth = Number(applyingDrive.eligibility.minTenthPercentage || 0);
                  const minTwelfth = Number(applyingDrive.eligibility.minTwelfthPercentage || 0);
                  const maxBacklogs = Number(applyingDrive.eligibility.maxBacklogsAllowed ?? 99);

                  const studentCgpa = Number(appForm.degreeCgpa || 0);
                  const studentTenth = Number(appForm.tenthPercentage || 0);
                  const studentTwelfth = Number(appForm.twelfthPercentage || 0);
                  const studentBacklogs = Number(appForm.activeBacklogs || 0);

                  const unmet = [];
                  if (minCgpa > 0 && studentCgpa > 0 && studentCgpa < minCgpa) {
                    unmet.push(`CGPA: ${studentCgpa} (Required: ≥ ${minCgpa})`);
                  }
                  if (minTenth > 0 && studentTenth > 0 && studentTenth < minTenth) {
                    unmet.push(`10th: ${studentTenth}% (Required: ≥ ${minTenth}%)`);
                  }
                  if (minTwelfth > 0 && studentTwelfth > 0 && studentTwelfth < minTwelfth) {
                    unmet.push(`12th: ${studentTwelfth}% (Required: ≥ ${minTwelfth}%)`);
                  }
                  if (maxBacklogs !== 99 && studentBacklogs > maxBacklogs) {
                    unmet.push(`Backlogs: ${studentBacklogs} (Allowed: ≤ ${maxBacklogs})`);
                  }

                  if (unmet.length > 0) {
                    return (
                      <div style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.4)', padding: '10px 12px', borderRadius: 8, fontSize: '12px', color: '#fde68a', marginBottom: '12px' }}>
                        ⚠️ <strong>Eligibility Notice:</strong> Your current profile does not meet: {unmet.join(', ')}. You may still submit for recruiter evaluation.
                      </div>
                    );
                  } else if (studentCgpa >= minCgpa && studentTenth >= minTenth && studentTwelfth >= minTwelfth) {
                    return (
                      <div style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.4)', padding: '10px 12px', borderRadius: 8, fontSize: '12px', color: '#86efac', marginBottom: '12px' }}>
                        ✓ <strong>Eligibility Verified:</strong> You meet the academic qualification criteria for this drive.
                      </div>
                    );
                  }
                  return null;
                })()}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: 4 }}>Full Name *</label>
                    <input
                      type="text"
                      style={{ width: '100%', padding: '8px 10px', background: '#0f172a', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: 6, color: '#fff' }}
                      value={appForm.studentName}
                      onChange={(e) => setAppForm({ ...appForm, studentName: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: 4 }}>Email Address *</label>
                    <input
                      type="email"
                      style={{ width: '100%', padding: '8px 10px', background: '#0f172a', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: 6, color: '#fff' }}
                      value={appForm.studentEmail}
                      onChange={(e) => setAppForm({ ...appForm, studentEmail: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: 4 }}>College / Institution Name *</label>
                  <input
                    type="text"
                    list="seb-tenant-colleges-datalist"
                    style={{ width: '100%', padding: '8px 10px', background: '#0f172a', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: 6, color: '#fff' }}
                    placeholder="Select from partner colleges or enter your college name"
                    value={appForm.collegeName}
                    onChange={(e) => setAppForm({ ...appForm, collegeName: e.target.value })}
                    required
                  />
                  <datalist id="seb-tenant-colleges-datalist">
                    {tenants.map(t => (
                      <option key={t.id} value={t.name}>
                        {t.id} - {t.name}
                      </option>
                    ))}
                  </datalist>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: 2 }}>
                    Direct learners can choose from partner colleges or type their own institution name without altering their global learner status.
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: 2 }}>10th % *</label>
                    <input
                      type="number"
                      step="0.1"
                      style={{ width: '100%', padding: '6px 8px', background: '#0f172a', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: 6, color: '#fff' }}
                      value={appForm.tenthPercentage}
                      onChange={(e) => setAppForm({ ...appForm, tenthPercentage: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: 2 }}>12th % *</label>
                    <input
                      type="number"
                      step="0.1"
                      style={{ width: '100%', padding: '6px 8px', background: '#0f172a', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: 6, color: '#fff' }}
                      value={appForm.twelfthPercentage}
                      onChange={(e) => setAppForm({ ...appForm, twelfthPercentage: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: 2 }}>Degree CGPA *</label>
                    <input
                      type="number"
                      step="0.01"
                      style={{ width: '100%', padding: '6px 8px', background: '#0f172a', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: 6, color: '#fff' }}
                      value={appForm.degreeCgpa}
                      onChange={(e) => setAppForm({ ...appForm, degreeCgpa: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: 2 }}>Backlogs</label>
                    <select
                      style={{ width: '100%', padding: '6px 8px', background: '#0f172a', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: 6, color: '#fff' }}
                      value={appForm.activeBacklogs}
                      onChange={(e) => setAppForm({ ...appForm, activeBacklogs: Number(e.target.value) })}
                    >
                      <option value={0}>0</option>
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3+</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: 4 }}>Google Drive Resume Link *</label>
                  <input
                    type="url"
                    style={{ width: '100%', padding: '8px 10px', background: '#0f172a', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: 6, color: '#fff' }}
                    placeholder="https://drive.google.com/file/d/.../view?usp=sharing"
                    value={appForm.resumeDriveLink}
                    onChange={(e) => setAppForm({ ...appForm, resumeDriveLink: e.target.value })}
                    required={Boolean(applyingDrive.eligibility?.requireResumeLink)}
                  />
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: 2 }}>
                    Please verify link sharing is set to "Anyone with the link can view".
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: 4 }}>Skills</label>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {CURATED_SKILLS.map((s) => {
                      const active = appForm.skills.includes(s);
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleToggleSkill(s)}
                          style={{
                            background: active ? '#7c3aed' : 'rgba(255, 255, 255, 0.08)',
                            border: active ? '1px solid #7c3aed' : '1px solid rgba(255, 255, 255, 0.15)',
                            color: '#fff',
                            borderRadius: 999,
                            padding: '2px 8px',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          {active ? '✓ ' : '+ '} {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="preview-header" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn-close-modal" onClick={() => setShowApplyModal(false)} style={{ padding: '6px 12px', borderRadius: 6 }}>
                  Cancel
                </button>
                <button type="submit" className="btn-launch-benchmark" style={{ padding: '8px 16px', fontSize: '13px' }} disabled={submittingApp}>
                  {submittingApp ? 'Submitting...' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Placements;
