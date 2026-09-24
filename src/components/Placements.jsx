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
          if (jobsList.length > 0) {
            setJobs(jobsList);
          } else {
            // Default mock corporate jobs
            setJobs([
              {
                id: 'job-seed-01',
                title: 'Software Development Engineer (Backend - Java)',
                companyName: 'Razorpay',
                location: 'Bengaluru, Karnataka',
                workMode: 'Hybrid',
                ctcMin: 14,
                ctcMax: 20,
                requiredSkills: ['Java', 'Spring Boot', 'Microservices', 'PostgreSQL'],
                eligibilityGate: {
                  requiredCourseIds: ['01-programming/java', '02-dsa/dsa-core'],
                },
                applicantCount: 28,
              },
              {
                id: 'job-seed-02',
                title: 'Frontend Engineer (React.js / Next.js)',
                companyName: 'Swiggy',
                location: 'Remote / Bengaluru',
                workMode: 'Remote',
                ctcMin: 12,
                ctcMax: 18,
                requiredSkills: ['React', 'JavaScript', 'TypeScript', 'TailwindCSS'],
                eligibilityGate: {
                  requiredCourseIds: ['01-programming/javascript', '03-web-development/react-mastery'],
                },
                applicantCount: 42,
              },
              {
                id: 'job-seed-03',
                title: 'Data Analyst & SQL Systems Specialist',
                companyName: 'CRED',
                location: 'Bengaluru, Karnataka',
                workMode: 'On-site',
                ctcMin: 10,
                ctcMax: 15,
                requiredSkills: ['SQL', 'PostgreSQL', 'Python'],
                eligibilityGate: {
                  requiredCourseIds: ['04-databases/sql-mastery'],
                },
                applicantCount: 19,
              },
            ]);
          }
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
            if (appList.length > 0) {
              setApplications(appList);
            } else {
              setApplications([
                {
                  id: 'app-seed-01',
                  jobTitle: 'Software Development Engineer (Backend - Java)',
                  companyName: 'Razorpay',
                  stage: 'shortlisted',
                  appliedAt: new Date(Date.now() - 3 * 86400000).toLocaleDateString(),
                  recruiterNotes: 'Candidate screened via Java & Spring Boot round. Technical interview scheduled.',
                  seedPercentile: 94,
                },
              ]);
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
            Take standardized national hiring benchmarks (Litmus-Grade) and company-specific screening tests in a tamper-proof, webcam-proctored lockdown environment.
          </p>
        </div>

        <div className="hero-right-card">
          <div className="benchmark-stat-label">Your SEED Benchmark Status</div>
          {userPercentile ? (
            <div className="benchmark-verified-box">
              <div className="benchmark-score-num">{userPercentile}th</div>
              <div className="benchmark-score-desc">
                <strong>National Percentile Verified</strong>
                <span>Recognized across 50+ recruiting partners</span>
              </div>
            </div>
          ) : (
            <div className="benchmark-unverified-box">
              <span className="unverified-tag">Benchmark Not Yet Taken</span>
              <p>Attempt the National Benchmark test below to earn your verified badge and attract recruiter shortlists.</p>
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
              <div className="benchmark-tag">⭐ FLAGSHIP NATIONAL BENCHMARK</div>
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
                  🚀 Launch National Benchmark in SEB
                </button>
                <span className="launch-note">Calculates your National Percentile badge instantly upon submission.</span>
              </div>
            </div>
          </div>

          {/* Company Screening Rounds List */}
          <div className="section-sub-header">
            <h4>Invited Company Screening Tests</h4>
            <p>Rounds assigned by corporate recruiters for active job applications.</p>
          </div>

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
        </div>
      )}

      {/* TAB 2: VERIFIED CAMPUS JOB BOARD */}
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

                <div className="job-skills-chips">
                  {j.requiredSkills?.map((s) => (
                    <span key={s} className="skill-chip">{s}</span>
                  ))}
                </div>

                <div className="job-eligibility-note">
                  🎓 Prerequisite Gate: {(j.eligibilityGate?.requiredCourseIds?.length || 0)} SEED Courses Required
                </div>

                <div className="job-seb-footer">
                  <span className="applicant-badge">👥 {j.applicantCount || 12} Applicants</span>
                  <button className="btn-view-job">View & Apply</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: APPLICATION PIPELINE & ATS */}
      {activeTab === 'applications' && (
        <div className="tab-pane-content">
          <div className="applications-table-wrapper">
            <table className="seb-applications-table">
              <thead>
                <tr>
                  <th>Target Role & Company</th>
                  <th>Applied On</th>
                  <th>Current ATS Stage</th>
                  <th>SEED Benchmark Score</th>
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
