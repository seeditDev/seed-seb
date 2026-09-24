import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  getCorporateAssessmentsForStudent,
  prepareCorporateAssessmentForLaunch,
  SEED_BENCHMARK_ASSESSMENT,
} from '../services/corporateAssessmentService';
import { db } from '../lib/firebase-config';
import { collection, getDocs, query, where } from 'firebase/firestore';
import '../styles/Placements.css';

const Placements = ({ user }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('corporate-tests'); // 'corporate-tests' | 'jobs' | 'applications'
  const [corporateTests, setCorporateTests] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);

  // Student benchmark status
  const userPercentile = user?.seedPercentile || (user?.seedVerified ? 92 : null);
  const userScore = user?.seedBenchmarkScore || null;

  useEffect(() => {
    let mounted = true;
    const loadAll = async () => {
      setLoading(true);
      try {
        // 1. Load Corporate & Benchmark Assessments
        const assessments = await getCorporateAssessmentsForStudent(user?.uid);
        if (mounted) setCorporateTests(assessments);

        // 2. Load Jobs from Firestore
        const jobsSnap = await getDocs(collection(db, 'jobs'));
        const jobsList = [];
        jobsSnap.forEach((d) => {
          jobsList.push({ id: d.id, ...d.data() });
        });
        if (mounted) {
          setJobs(jobsList);
        }

        // 3. Load Student Applications
        if (user?.uid) {
          const appQuery = query(collection(db, 'jobApplications'), where('studentUid', '==', user.uid));
          const appSnap = await getDocs(appQuery);
          const appList = [];
          appSnap.forEach((d) => {
            appList.push({ id: d.id, ...d.data() });
          });
          if (mounted) {
            setApplications(appList);
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
  }, [user]);

  const handleLaunchAssessment = (test) => {
    try {
      const url = prepareCorporateAssessmentForLaunch(test, user);
      navigate({ to: url });
    } catch (err) {
      alert(`Could not launch assessment: ${err.message}`);
    }
  };

  return (
    <div className="placements-container">
      {/* Top Banner & Header */}
      <div className="placements-header-hero">
        <div className="hero-left">
          <div className="hero-badge">
            <span>🛡️ SEED Lockdown Examination Engine</span>
          </div>
          <h2>Corporate Placements & Proctored Assessments</h2>
          <p>
            Take standardized qualifier benchmarking assessments (SEED QBeA) and company-specific screening tests in a tamper-proof, webcam-proctored lockdown environment.
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
              <p>Attempt the SEED Qualifier Benchmarking Assessment (SEED QBeA) below to earn your verified badge and attract recruiter shortlists.</p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="placements-nav-tabs">
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
          <span>💼 Verified Campus Job Board ({jobs.length})</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'applications' ? 'active' : ''}`}
          onClick={() => setActiveTab('applications')}
        >
          <span>📊 My Application Pipeline ({applications.length})</span>
        </button>
      </div>

      {/* TAB 1: CORPORATE & BENCHMARK PROCTORED ASSESSMENTS */}
      {activeTab === 'corporate-tests' && (
        <div className="tab-pane-content">
          {/* Flagship Benchmark Featured Card */}
          <div className="litmus-benchmark-card">
            <div className="benchmark-card-header">
              <div className="benchmark-tag">⭐ FLAGSHIP BENCHMARK (SEED QBeA)</div>
              <div className="benchmark-proctor-pill">🔒 Full SEB Lockdown & Webcam Proctoring Enforced</div>
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
                  <div className="meta-item">
                    <span className="meta-label">Sections</span>
                    <span className="meta-val">📚 Quant, Core CS, Coding Sandbox</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Anti-Cheat</span>
                    <span className="meta-val">🛡️ Fullscreen, Tab-Lock, Webcam</span>
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
                <span className="launch-note">Calculates your verified SEED QBeA Percentile badge instantly upon submission.</span>
              </div>
            </div>
          </div>

          {/* Company Screening Rounds List */}
          <div className="section-sub-header">
            <h4>Invited Company Screening Tests</h4>
            <p>Rounds assigned by corporate recruiters for active job applications.</p>
          </div>

          {corporateTests.filter((t) => t.category === 'recruiter').length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', background: 'rgba(30, 41, 59, 0.4)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)', color: '#94a3b8', fontSize: '13px' }}>
              No custom company screening tests assigned at this moment. Complete the National Benchmark above to earn your verified score.
            </div>
          ) : (
            <div className="corporate-tests-grid">
              {corporateTests
                .filter((t) => t.category === 'recruiter')
                .map((test) => (
                  <div key={test.id} className="corporate-test-card">
                    <div className="test-card-top">
                      <div className="company-logo-placeholder">
                        {test.companyName?.slice(0, 2)?.toUpperCase() || 'CO'}
                      </div>
                      <div>
                        <div className="test-company-name">{test.companyName}</div>
                        <h4 className="test-title">{test.title}</h4>
                      </div>
                    </div>

                    <p className="test-desc">{test.description}</p>

                    <div className="test-metrics-row">
                      <span>⏱️ {test.duration} Mins</span>
                      <span>🎯 {test.maxScore} Marks</span>
                      <span>🔒 Webcam Proctored</span>
                    </div>

                    <div className="test-card-footer">
                      <button
                        className="btn-launch-corporate"
                        onClick={() => handleLaunchAssessment(test)}
                      >
                        Start Screening Test
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: VERIFIED CAMPUS JOB BOARD */}
      {activeTab === 'jobs' && (
        <div className="tab-pane-content">
          {jobs.length === 0 ? (
            <div style={{ padding: '3.5rem 2rem', textAlign: 'center', background: 'rgba(30, 41, 59, 0.6)', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8' }}>
              <div style={{ fontSize: '2rem', marginBottom: '8px' }}>💼</div>
              <h4 style={{ color: '#fff', margin: '0 0 6px 0', fontSize: '16px' }}>No Campus Job Postings Available</h4>
              <p style={{ margin: 0, fontSize: '13px' }}>There are currently no active corporate job openings. New verified employer roles will appear here.</p>
            </div>
          ) : (
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

                  <div className="job-skills-chips">
                    {j.requiredSkills?.map((s) => (
                      <span key={s} className="skill-chip">{s}</span>
                    ))}
                  </div>

                  <div className="job-eligibility-note">
                    🎓 Prerequisite Gate: {(j.eligibilityGate?.requiredCourseIds?.length || 0)} SEED Courses Required
                  </div>

                  <div className="job-seb-footer">
                    <span className="applicant-badge">👥 {j.applicantCount || 0} Applicants</span>
                    <button className="btn-view-job">View & Apply</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: APPLICATION PIPELINE & ATS */}
      {activeTab === 'applications' && (
        <div className="tab-pane-content">
          {applications.length === 0 ? (
            <div style={{ padding: '3.5rem 2rem', textAlign: 'center', background: 'rgba(30, 41, 59, 0.6)', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8' }}>
              <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📊</div>
              <h4 style={{ color: '#fff', margin: '0 0 6px 0', fontSize: '16px' }}>No Job Applications Submitted Yet</h4>
              <p style={{ margin: 0, fontSize: '13px' }}>Explore verified jobs or take the SEED National Benchmark to unlock corporate interview shortlists.</p>
            </div>
          ) : (
            <div className="applications-table-wrapper">
              <table className="seb-applications-table">
                <thead>
                  <tr>
                    <th>Target Role & Company</th>
                    <th>Applied On</th>
                    <th>Current ATS Stage</th>
                    <th>SEED QBeA Score</th>
                    <th>Recruiter Evaluation Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app) => (
                    <tr key={app.id}>
                      <td>
                        <strong>{app.jobTitle}</strong>
                        <div className="cell-sub">{app.companyName}</div>
                      </td>
                      <td>{app.appliedAt}</td>
                      <td>
                        <span className={`stage-tag ${app.stage}`}>
                          {app.stage?.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <span className="percentile-text">
                          {app.seedPercentile ? `Top ${app.seedPercentile}th Percentile` : 'Evaluated in SEB'}
                        </span>
                      </td>
                      <td>
                        <div className="remarks-text">
                          {app.recruiterNotes || 'Assessment passed. Profile under technical review.'}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Job Details Modal */}
      {selectedJob && (
        <div className="preview-overlay" onClick={() => setSelectedJob(null)}>
          <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="preview-header">
              <h3>{selectedJob.companyName} • {selectedJob.title}</h3>
              <button className="btn-close-modal" onClick={() => setSelectedJob(null)}>✕</button>
            </div>
            <div className="preview-body">
              <div className="preview-row">
                <h4>Compensation & Terms</h4>
                <p>₹{selectedJob.ctcMin} to ₹{selectedJob.ctcMax} LPA • {selectedJob.workMode} • {selectedJob.location}</p>
              </div>

              <div className="preview-row">
                <h4>Required Competencies</h4>
                <div className="job-skills-chips">
                  {selectedJob.requiredSkills?.map((s) => (
                    <span key={s} className="skill-chip">{s}</span>
                  ))}
                </div>
              </div>

              <div className="preview-row">
                <h4>SEED Course Prerequisite Gate</h4>
                <p>To qualify for 1-click apply, candidates must complete prerequisite learning paths in SEED:</p>
                <ul>
                  {selectedJob.eligibilityGate?.requiredCourseIds?.map((cId) => (
                    <li key={cId}>{cId}</li>
                  ))}
                </ul>
              </div>

              <div className="modal-actions-bar">
                <button
                  className="btn-apply-seb"
                  onClick={() => {
                    alert('Application successfully submitted with your SEED Verified Lockdown Profile!');
                    setSelectedJob(null);
                  }}
                >
                  ✓ Submit SEED-Verified Application
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Placements;
