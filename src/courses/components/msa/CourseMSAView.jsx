import React, { useState, useEffect, useMemo } from 'react';
import { 
  FaAward, FaCheckCircle, FaTimesCircle, FaLock, 
  FaArrowLeft, FaArrowRight, FaCode, FaListUl, 
  FaShieldAlt, FaTrophy, FaRedo, FaExclamationTriangle
} from 'react-icons/fa';
import CourseMSAMCQSection from './CourseMSAMCQSection';
import CourseMSACodingSection from './CourseMSACodingSection';
import learningEngineService from '../../services/learningEngineService';
import '../../styles/CourseMSA.css';

const CourseMSAView = ({
  module,
  course,
  user,
  onComplete,
  onBack,
  passingPercentage = 90
}) => {
  const uid = user?.uid || 'demo-student';

  // Normalize assessment data from module definition
  const msaConfig = useMemo(() => {
    const raw = module?.msa || module?.moduleAssessment || module?.miniAssessment || {};
    const title = raw.title || `${module?.title || 'Module'} Assessment (MSA)`;
    const passCutoff = raw.passPercent || raw.passingPercentage || passingPercentage;

    // 1. MCQ Section
    const mcqRaw = raw.mcqSection || raw.sections?.mcqSection || (raw.questions ? { questions: raw.questions } : null);
    const mcqQuestions = mcqRaw?.questions || raw.questions || [];
    const mcqSection = {
      sectionTitle: mcqRaw?.sectionTitle || 'Section 1: Conceptual & Technical MCQs',
      questions: mcqQuestions,
      durationMinutes: mcqRaw?.durationMinutes || raw.durationMinutes || 20,
      passCutoffPercent: passCutoff
    };

    // 2. Coding Section (Only if problems are actually defined)
    const codingRaw = raw.codingSection || raw.sections?.codingSection;
    const codingProblems = codingRaw?.problems || raw.problems || [];
    const hasCoding = Array.isArray(codingProblems) && codingProblems.length > 0;

    const codingSection = hasCoding ? {
      sectionTitle: codingRaw?.sectionTitle || 'Section 2: Hands-On Coding Challenges',
      problems: codingProblems,
      durationMinutes: codingRaw?.durationMinutes || 30,
      passCutoffPercent: 100 // Coding questions must clear all test cases
    } : null;

    return {
      title,
      passingPercentage: passCutoff,
      hasCoding,
      mcqSection,
      codingSection
    };
  }, [module, passingPercentage]);

  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'mcq' | 'coding' | 'verdict'
  const [mcqResult, setMcqResult] = useState(null);
  const [codingResult, setCodingResult] = useState(null);
  const [isSubmittingEngine, setIsSubmittingEngine] = useState(false);

  const passCutoff = msaConfig.passingPercentage;
  const hasCoding = msaConfig.hasCoding;

  const mcqScore = mcqResult?.scorePct ?? null;
  const codingScore = codingResult?.codingScore ?? null;
  const codingCleared = Boolean(codingResult?.allTestCasesPassed ?? (codingScore === 100));

  // Total MSA score:
  // - If MCQ only: MCQ Score %
  // - If MCQ + Coding: Combined average score
  const totalMsaScore = useMemo(() => {
    if (mcqScore === null) return null;
    if (!hasCoding) return mcqScore;
    if (codingScore === null) return mcqScore;
    return Math.round((mcqScore + codingScore) / 2);
  }, [mcqScore, codingScore, hasCoding]);

  // Overall Pass Condition:
  // - If MCQ only: MCQ Score >= 90%
  // - If MCQ + Coding: Coding questions must clear ALL test cases (100%), AND Total MSA Score >= 90%
  const isOverallPassed = useMemo(() => {
    if (!hasCoding) {
      return typeof mcqScore === 'number' && mcqScore >= passCutoff;
    }
    return Boolean(
      typeof totalMsaScore === 'number' &&
      totalMsaScore >= passCutoff &&
      codingCleared
    );
  }, [hasCoding, mcqScore, totalMsaScore, codingCleared, passCutoff]);

  // When MCQ is complete: seamlessly advance without intermediate score reveal or premature fail
  const handleMCQComplete = async (res) => {
    setMcqResult(res);
    if (hasCoding) {
      // In dual-section MSA, immediately advance to Section 2 (Coding)
      setActiveTab('coding');
    } else {
      // MCQ-Only Course: Submit to engine and advance to final verdict
      setIsSubmittingEngine(true);
      const passed = res.scorePct >= passCutoff;
      let submitRes = null;
      if (passed) {
        submitRes = await learningEngineService.submitCourseMSA(
          uid,
          course,
          module?.moduleId,
          {
            mcqScore: res.scorePct,
            codingScore: null,
            totalScore: res.scorePct,
            allTestCasesPassed: true,
            passingPercentage: passCutoff
          }
        );
      }
      setIsSubmittingEngine(false);
      setActiveTab('verdict');
      if (passed && submitRes) {
        onComplete?.(submitRes);
      }
    }
  };

  // When Coding is complete: submit combined score and show overall verdict
  const handleCodingComplete = async (res) => {
    setCodingResult(res);
    const mScore = mcqResult?.scorePct ?? 0;
    const cScore = res.codingScore ?? 0;
    const cCleared = Boolean(res.allTestCasesPassed ?? (cScore === 100));
    const combinedTotal = Math.round((mScore + cScore) / 2);
    const passed = cCleared && combinedTotal >= passCutoff;

    setIsSubmittingEngine(true);
    let submitRes = null;
    if (passed) {
      submitRes = await learningEngineService.submitCourseMSA(
        uid,
        course,
        module?.moduleId,
        {
          mcqScore: mScore,
          codingScore: cScore,
          totalScore: combinedTotal,
          allTestCasesPassed: cCleared,
          passingPercentage: passCutoff
        }
      );
    }
    setIsSubmittingEngine(false);
    setActiveTab('verdict');
    if (passed && submitRes) {
      onComplete?.(submitRes);
    }
  };

  const handleRetryFullAssessment = () => {
    setMcqResult(null);
    setCodingResult(null);
    setActiveTab('mcq');
  };

  return (
    <div className="course-msa-container">
      {/* Top Header Bar — Clean, Single Non-Duplicated Assessment Header */}
      <div className="msa-header-bar">
        <div className="msa-header-left">
          <button className="msa-back-btn" onClick={onBack} title="Return to Lesson Reading">
            <FaArrowLeft />
            <span>Back to Lessons</span>
          </button>
          <div className="msa-header-title-block">
            <span className="msa-header-course-tag">{course?.shortTitle || course?.title || 'Course'}</span>
            <span className="msa-header-divider">•</span>
            <h2 className="msa-header-mod-title">{module?.title || 'Module'} — Milestone Assessment</h2>
          </div>
        </div>

        <div className="msa-header-right">
          <div className="msa-pass-badge">
            <FaShieldAlt />
            <span>SEED-IT Certified Standard • Overall Mark ≥ {passCutoff}% to Pass</span>
          </div>
        </div>
      </div>

      {/* MSA Navigation Tabs */}
      <div className="msa-tabs-row">
        <button
          className={`msa-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <FaAward />
          <span>Assessment Overview</span>
        </button>

        <button
          className={`msa-tab-btn ${activeTab === 'mcq' ? 'active' : ''}`}
          onClick={() => setActiveTab('mcq')}
        >
          <FaListUl />
          <span>{hasCoding ? 'Section 1: MCQ Assessment' : 'MCQ Assessment'} ({msaConfig.mcqSection.questions.length})</span>
        </button>

        {hasCoding && (
          <button
            className={`msa-tab-btn ${activeTab === 'coding' ? 'active' : ''}`}
            onClick={() => setActiveTab('coding')}
          >
            <FaCode />
            <span>Section 2: Coding Challenges ({msaConfig.codingSection.problems.length})</span>
          </button>
        )}

        {activeTab === 'verdict' && (
          <button
            className="msa-tab-btn active"
            onClick={() => setActiveTab('verdict')}
          >
            <FaTrophy style={{ color: isOverallPassed ? '#10b981' : '#f59e0b' }} />
            <span>Final Milestone Evaluation</span>
          </button>
        )}
      </div>

      {/* Main Workspace Render */}
      <div className="msa-main-canvas">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="msa-overview-card">
            <div className="overview-hero-col">
              <div className="hero-icon-award">
                <FaTrophy />
              </div>
              <h2 className="overview-title">{msaConfig.title}</h2>
              <p className="overview-desc">
                {hasCoding
                  ? 'This comprehensive milestone assessment validates theoretical comprehension and hands-on coding. Complete all sections; your overall consolidated score will be evaluated at the end.'
                  : `This technical milestone assessment validates your conceptual comprehension. Achieve an overall score of at least ${passCutoff}% to clear this milestone.`}
              </p>
            </div>

            {/* Assessment Sections Preview Grid */}
            <div className="msa-sections-preview-grid" style={{ gridTemplateColumns: hasCoding ? '1fr 1fr' : '1fr' }}>
              {/* Card 1: MCQ Section */}
              <div className="section-preview-card">
                <div className="card-top">
                  <div className="section-type-icon blue">
                    <FaListUl />
                  </div>
                  <span className="status-pill pending">Required Section</span>
                </div>
                <h4 className="section-card-title">{msaConfig.mcqSection.sectionTitle}</h4>
                <ul className="section-specs-list">
                  <li><strong>Questions:</strong> {msaConfig.mcqSection.questions.length} Multiple Choice Questions</li>
                  <li><strong>Duration:</strong> {msaConfig.mcqSection.durationMinutes} Minutes</li>
                  <li><strong>Target:</strong> Conceptual & theoretical foundations</li>
                </ul>
                <button 
                  className="start-section-btn"
                  onClick={() => setActiveTab('mcq')}
                >
                  {mcqResult ? 'Retake MCQ Section' : 'Start MCQ Section'}
                </button>
              </div>

              {/* Card 2: Coding Section (Only if module has coding) */}
              {hasCoding && (
                <div className="section-preview-card">
                  <div className="card-top">
                    <div className="section-type-icon green">
                      <FaCode />
                    </div>
                    <span className="status-pill pending">Required Section</span>
                  </div>
                  <h4 className="section-card-title">{msaConfig.codingSection.sectionTitle}</h4>
                  <ul className="section-specs-list">
                    <li><strong>Challenges:</strong> {msaConfig.codingSection.problems.length} Hands-On Programming Problems</li>
                    <li><strong>Requirement:</strong> Test case verification in isolated sandbox</li>
                    <li><strong>Environment:</strong> SEED Sandboxed Compiler & Monaco Editor</li>
                  </ul>
                  <button 
                    className="start-section-btn"
                    onClick={() => setActiveTab('coding')}
                  >
                    {codingResult ? 'Retake Coding Section' : 'Start Coding Section'}
                  </button>
                </div>
              )}
            </div>

            {/* Gating Rule Alert Box */}
            <div className="msa-gating-rule-box">
              <FaShieldAlt className="gating-shield" />
              <div>
                <strong>SEED-IT Milestone Assessment Standard:</strong>
                <p>
                  Complete all sections thoroughly. You will not be quit early on individual sections. Your consolidated overall mark and milestone pass/fail status will be presented on the final evaluation screen upon finishing.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MCQ SECTION */}
        {activeTab === 'mcq' && (
          <CourseMSAMCQSection
            mcqData={msaConfig.mcqSection}
            moduleTitle={module?.title}
            passingPercentage={passCutoff}
            onComplete={handleMCQComplete}
          />
        )}

        {/* TAB 3: CODING SECTION */}
        {hasCoding && activeTab === 'coding' && (
          <CourseMSACodingSection
            codingData={msaConfig.codingSection}
            moduleTitle={module?.title}
            passingPercentage={100}
            onComplete={handleCodingComplete}
          />
        )}

        {/* TAB 4: FINAL VERDICT (Show only overall mark in the end) */}
        {activeTab === 'verdict' && (
          <div className="msa-final-celebration-card">
            <div className={`celebration-trophy-circle ${isOverallPassed ? 'passed' : 'incomplete'}`}>
              {isOverallPassed ? <FaTrophy /> : <FaExclamationTriangle />}
            </div>

            <h2 className="celebration-heading">
              {isOverallPassed ? 'Milestone Requirement Cleared!' : 'Milestone Assessment Incomplete'}
            </h2>

            <p className="celebration-subheading">
              {isOverallPassed
                ? `Congratulations! You scored an overall mark of ${totalMsaScore}%, clearing the strict ${passCutoff}% SEED-IT gating requirement for ${module?.title}.`
                : `Your overall mark was ${totalMsaScore}%. A consolidated score of at least ${passCutoff}% is required to clear this milestone and unlock the next module.`}
            </p>

            {/* Overall Mark & Section Summary */}
            <div className="celebration-metrics-row">
              <div className={`metric-box ${isOverallPassed ? 'highlight-green' : 'highlight-amber'}`}>
                <span className="metric-label">Consolidated Overall Mark</span>
                <span className={`metric-val ${isOverallPassed ? 'status-green' : 'status-amber'}`}>
                  {totalMsaScore}% {isOverallPassed ? `(≥ ${passCutoff}% Cleared)` : `(Need ≥ ${passCutoff}%)`}
                </span>
              </div>

              <div className="metric-box">
                <span className="metric-label">Section 1: MCQ</span>
                <span className="metric-val">{mcqResult?.scorePct ?? 0}%</span>
              </div>

              {hasCoding && (
                <div className="metric-box">
                  <span className="metric-label">Section 2: Coding</span>
                  <span className={`metric-val ${codingCleared ? 'status-green' : 'status-amber'}`}>
                    {codingResult?.codingScore ?? 0}% {codingCleared ? '(All Passed)' : ''}
                  </span>
                </div>
              )}

              <div className="metric-box">
                <span className="metric-label">Next Module</span>
                <span className={`metric-val ${isOverallPassed ? 'status-green' : 'status-locked'}`}>
                  {isOverallPassed ? 'Unlocked' : 'Locked'}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="msa-verdict-actions-row">
              {isOverallPassed ? (
                <button 
                  className="celebration-continue-btn"
                  onClick={onBack}
                >
                  <span>Continue to Next Module</span>
                  <FaArrowRight />
                </button>
              ) : (
                <>
                  <button 
                    className="celebration-retry-btn"
                    onClick={handleRetryFullAssessment}
                  >
                    <FaRedo />
                    <span>Retry Milestone Assessment</span>
                  </button>
                  <button 
                    className="celebration-back-lessons-btn"
                    onClick={onBack}
                  >
                    <FaArrowLeft />
                    <span>Review Lessons First</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CourseMSAView;
