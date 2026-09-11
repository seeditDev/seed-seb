import React, { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import { toast } from 'sonner';
import { useNavigate } from './router-compat';
import {
  FaStar,
  FaCheck,
  FaPaperPlane,
  FaArrowRight,
  FaDesktop,
  FaCode,
  FaListUl,
  FaTools,
  FaChartLine,
  FaHeart,
  FaRegLightbulb
} from 'react-icons/fa';
import { submitAssessmentAndPlatformFeedback } from '../services/feedbackService';
import '../styles/AssessmentFeedback.css';

// ── Star Rating Component ──
const StarRating = ({ value, onChange, label, max = 5 }) => {
  const [hover, setHover] = useState(0);

  const getRatingLabel = (val) => {
    switch (val) {
      case 1: return 'Very Poor';
      case 2: return 'Poor';
      case 3: return 'Average';
      case 4: return 'Good';
      case 5: return 'Excellent';
      default: return '';
    }
  };

  const activeVal = hover || value;

  return (
    <div className="af-stars-container">
      <div className="af-stars-row" role="radiogroup" aria-label={label}>
        {Array.from({ length: max }, (_, idx) => {
          const starNum = idx + 1;
          const isFilled = starNum <= activeVal;
          return (
            <button
              key={starNum}
              type="button"
              className={`af-star-btn ${isFilled ? 'af-star-active' : ''}`}
              onClick={() => onChange(starNum)}
              onMouseEnter={() => setHover(starNum)}
              onMouseLeave={() => setHover(0)}
              aria-label={`${starNum} of ${max} stars`}
            >
              <FaStar />
            </button>
          );
        })}
      </div>
      <span className="af-rating-label">
        {activeVal ? `${activeVal} / ${max} — ${getRatingLabel(activeVal)}` : 'Select rating'}
      </span>
    </div>
  );
};

StarRating.propTypes = {
  value: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string,
  max: PropTypes.number,
};

// ── Single Choice Pills ──
const PillGroup = ({ options, value, onChange, ariaLabel }) => (
  <div className="af-pills-row" role="radiogroup" aria-label={ariaLabel}>
    {options.map((opt) => {
      const isSelected = value === opt;
      return (
        <button
          key={opt}
          type="button"
          className={`af-pill-btn ${isSelected ? 'af-pill-active' : ''}`}
          onClick={() => onChange(opt)}
          aria-checked={isSelected}
          role="radio"
        >
          {opt}
        </button>
      );
    })}
  </div>
);

PillGroup.propTypes = {
  options: PropTypes.arrayOf(PropTypes.string).isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  ariaLabel: PropTypes.string,
};

// ── Multi-Select Chips ──
const ChipGroup = ({ options, selectedValues, onToggle, exclusiveNone = true }) => {
  const handleSelect = (item) => {
    if (exclusiveNone && item === 'None') {
      if (selectedValues.includes('None')) {
        onToggle([]);
      } else {
        onToggle(['None']);
      }
      return;
    }

    let next = selectedValues.filter(v => v !== 'None');
    if (next.includes(item)) {
      next = next.filter(v => v !== item);
    } else {
      next.push(item);
    }
    onToggle(next);
  };

  return (
    <div className="af-chips-grid">
      {options.map((opt) => {
        const isChecked = selectedValues.includes(opt);
        return (
          <div
            key={opt}
            className={`af-chip-item ${isChecked ? 'af-chip-selected' : ''}`}
            onClick={() => handleSelect(opt)}
            role="checkbox"
            aria-checked={isChecked}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                handleSelect(opt);
              }
            }}
          >
            <div className="af-chip-checkbox">
              {isChecked && <FaCheck />}
            </div>
            <span className="af-chip-text">{opt}</span>
          </div>
        );
      })}
    </div>
  );
};

ChipGroup.propTypes = {
  options: PropTypes.arrayOf(PropTypes.string).isRequired,
  selectedValues: PropTypes.arrayOf(PropTypes.string).isRequired,
  onToggle: PropTypes.func.isRequired,
  exclusiveNone: PropTypes.bool,
};

// ── NPS 0-10 Selector ──
const NPSSelector = ({ value, onChange }) => {
  const getScoreClass = (score) => {
    if (score <= 6) return 'af-nps-detractor';
    if (score <= 8) return 'af-nps-passive';
    return 'af-nps-promoter';
  };

  return (
    <div className="af-nps-container">
      <div className="af-nps-bar" role="radiogroup" aria-label="NPS score from 0 to 10">
        {Array.from({ length: 11 }, (_, i) => {
          const isSelected = value === i;
          return (
            <button
              key={i}
              type="button"
              className={`af-nps-btn ${isSelected ? getScoreClass(i) : ''}`}
              onClick={() => onChange(i)}
              aria-checked={isSelected}
              role="radio"
            >
              {i}
            </button>
          );
        })}
      </div>
      <div className="af-nps-labels">
        <span>0 — Not at all likely</span>
        <span>5 — Neutral</span>
        <span>10 — Extremely likely</span>
      </div>
    </div>
  );
};

NPSSelector.propTypes = {
  value: PropTypes.number,
  onChange: PropTypes.func.isRequired,
};

// ────────────────────────── MAIN COMPONENT ───────────────────────────────────
export default function AssessmentFeedback({
  assessment,
  user,
  tenant,
  attemptId,
  onComplete,
}) {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  // Resolve fallbacks if mounted in standalone route mode
  const effectiveUser = useMemo(() => {
    if (user?.uid || user?.email) return user;
    try {
      return JSON.parse(localStorage.getItem('auth_data') || '{}');
    } catch (_) {
      return {};
    }
  }, [user]);

  const effectiveAssessment = useMemo(() => {
    if (assessment?.id) return assessment;
    try {
      return JSON.parse(sessionStorage.getItem('multisectionAssessmentData') || 'null');
    } catch (_) {
      return null;
    }
  }, [assessment]);

  const effectiveTenant = useMemo(() => {
    if (tenant?.tenantId) return tenant;
    return { tenantId: effectiveUser?.tenantId || 'default' };
  }, [tenant, effectiveUser]);

  const effectiveAttemptId = useMemo(() => {
    if (attemptId) return attemptId;
    const uid = effectiveUser?.uid || effectiveUser?.email || 'unknown';
    const assId = effectiveAssessment?.id || 'unknown';
    return `${uid}_${assId}`;
  }, [attemptId, effectiveUser, effectiveAssessment]);

  const handleFinish = () => {
    if (onComplete) {
      onComplete();
    } else {
      navigate('/student/dashboard', { replace: true, state: { justCompleted: true } });
    }
  };

  // Determine section types present in this assessment
  const hasMCQ = useMemo(() => {
    return effectiveAssessment?.sections?.some(s => s.type === 'mcq' || s.sectionType === 'mcq') || false;
  }, [effectiveAssessment]);

  const hasCoding = useMemo(() => {
    return effectiveAssessment?.sections?.some(s => s.type === 'coding' || s.sectionType === 'coding') || false;
  }, [effectiveAssessment]);

  // Form State: Overall Experience
  const [overallExperienceRating, setOverallExperienceRating] = useState(5);
  const [difficulty, setDifficulty] = useState('Moderate');
  const [durationAppropriate, setDurationAppropriate] = useState('Appropriate');
  const [questionQualityRating, setQuestionQualityRating] = useState(5);
  const [skillMatch, setSkillMatch] = useState('Appropriate');

  // Form State: MCQ Experience (if hasMCQ)
  const [mcqRating, setMcqRating] = useState(5);
  const [mcqClarity, setMcqClarity] = useState('Clear');
  const [mcqDifficulty, setMcqDifficulty] = useState('Appropriate');
  const [mcqIssues, setMcqIssues] = useState(['None']);
  const [mcqProblematicQuestions, setMcqProblematicQuestions] = useState('');

  // Form State: Coding Experience (if hasCoding)
  const [codingRating, setCodingRating] = useState(5);
  const [codingClarity, setCodingClarity] = useState('Clear');
  const [codingDifficulty, setCodingDifficulty] = useState('Appropriate');
  const [codingEditorRating, setCodingEditorRating] = useState(5);
  const [codingIssues, setCodingIssues] = useState(['None']);
  const [codingIssueDescription, setCodingIssueDescription] = useState('');

  // Form State: Platform Experience
  const [interfaceUsabilityRating, setInterfaceUsabilityRating] = useState(5);
  const [performanceRating, setPerformanceRating] = useState(5);
  const [portalOverallRating, setPortalOverallRating] = useState(5);
  const [reliability, setReliability] = useState('Yes, completely');

  // Form State: Technical Experience
  const [hadTechnicalIssues, setHadTechnicalIssues] = useState('No');
  const [technicalIssues, setTechnicalIssues] = useState([]);
  const [technicalIssueTiming, setTechnicalIssueTiming] = useState('During assessment');
  const [technicalIssueDetails, setTechnicalIssueDetails] = useState('');

  // Form State: Student Confidence & Value
  const [confidenceRating, setConfidenceRating] = useState(4);
  const [reflectedSkills, setReflectedSkills] = useState('Mostly');
  const [valuablePart, setValuablePart] = useState('Practical application');

  // Form State: Improvement & Highlights
  const [improvementSuggestion, setImprovementSuggestion] = useState('');
  const [platformLiked, setPlatformLiked] = useState(['Coding environment', 'Simple interface']);

  // Form State: NPS & Open Feedback
  const [npsScore, setNpsScore] = useState(9);
  const [additionalFeedback, setAdditionalFeedback] = useState('');

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setSubmitting(true);

    try {
      const assessmentFeedbackData = {
        overallExperienceRating,
        difficulty,
        durationAppropriate,
        questionQualityRating,
        skillMatch,
        confidenceRating,
        reflectedSkills,
        valuablePart,
        improvementSuggestion,
        hasMCQ,
        mcqRating,
        mcqClarity,
        mcqDifficulty,
        mcqIssues,
        mcqProblematicQuestions,
        hasCoding,
        codingRating,
        codingClarity,
        codingDifficulty,
        codingEditorRating,
        codingIssues,
        codingIssueDescription,
      };

      const platformFeedbackData = {
        interfaceUsabilityRating,
        performanceRating,
        portalOverallRating,
        reliability,
        hadTechnicalIssues,
        technicalIssues,
        technicalIssueTiming,
        technicalIssueDetails,
        platformLiked,
        npsScore,
        additionalFeedback,
      };

      await submitAssessmentAndPlatformFeedback({
        assessmentId: effectiveAssessment?.id || 'unknown',
        assessmentTitle: effectiveAssessment?.title || effectiveAssessment?.name || '',
        attemptId: effectiveAttemptId,
        userId: effectiveUser?.uid || effectiveUser?.email || 'anonymous',
        studentEmail: effectiveUser?.email || '',
        studentName: effectiveUser?.name || '',
        tenantId: effectiveTenant?.tenantId || 'default',
        assessmentFeedbackData,
        platformFeedbackData,
      });

      toast.success('Thank you! Your feedback helps us continuously improve.', { duration: 4000 });
      handleFinish();
    } catch (err) {
      console.error('[AssessmentFeedback] Failed to submit feedback:', err);
      toast.error('Unable to sync feedback. Redirecting to dashboard…', { duration: 3000 });
      // Proceed to dashboard regardless of non-fatal write error
      handleFinish();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    handleFinish();
  };

  return (
    <div className="af-container">
      <div className="af-wrapper">
        {/* ── 1. Hero Celebration Card ── */}
        <div className="af-hero-card">
          <div className="af-celebration-badge">
            Assessment Completed 🎉
          </div>
          <h1 className="af-hero-title">Your Assessment Has Been Submitted!</h1>
          <p className="af-hero-subtitle">
            Help us improve SEED. This quick feedback takes less than 2 minutes.
          </p>
          <div className="af-assessment-badge">
            <span>Assessment:</span>
            <strong>{effectiveAssessment?.title || effectiveAssessment?.name || 'Assessment'}</strong>
            {effectiveUser?.name && <span>• Student: <strong>{effectiveUser.name}</strong></span>}
          </div>
        </div>

        {/* ── 2. Overall Assessment Experience ── */}
        <div className="af-section-card">
          <div className="af-section-header">
            <div className="af-section-icon">
              <FaStar />
            </div>
            <div>
              <h2 className="af-section-title">Overall Assessment Experience</h2>
              <p className="af-section-desc">Rate your test experience, difficulty, and question pacing</p>
            </div>
          </div>

          <div className="af-field-group">
            <label className="af-field-label">How would you rate your overall assessment experience?</label>
            <StarRating
              value={overallExperienceRating}
              onChange={setOverallExperienceRating}
              label="Overall assessment experience"
            />
          </div>

          <div className="af-field-group">
            <label className="af-field-label">How difficult was the assessment?</label>
            <PillGroup
              options={['Very Easy', 'Easy', 'Moderate', 'Difficult', 'Very Difficult']}
              value={difficulty}
              onChange={setDifficulty}
              ariaLabel="Assessment difficulty"
            />
          </div>

          <div className="af-field-group">
            <label className="af-field-label">Was the assessment duration appropriate?</label>
            <PillGroup
              options={['Much too short', 'Slightly too short', 'Appropriate', 'Slightly too long', 'Much too long']}
              value={durationAppropriate}
              onChange={setDurationAppropriate}
              ariaLabel="Assessment duration appropriateness"
            />
          </div>

          <div className="af-field-group">
            <label className="af-field-label">Question Quality</label>
            <StarRating
              value={questionQualityRating}
              onChange={setQuestionQualityRating}
              label="Question Quality"
            />
          </div>

          <div className="af-field-group">
            <label className="af-field-label">Did the questions match your expected skill level?</label>
            <PillGroup
              options={['Much below my level', 'Slightly below my level', 'Appropriate', 'Slightly above my level', 'Much above my level']}
              value={skillMatch}
              onChange={setSkillMatch}
              ariaLabel="Skill match level"
            />
          </div>
        </div>

        {/* ── 3. MCQ Experience (Conditional) ── */}
        {hasMCQ && (
          <div className="af-section-card">
            <div className="af-section-header">
              <div className="af-section-icon">
                <FaListUl />
              </div>
              <div>
                <h2 className="af-section-title">MCQ Experience</h2>
                <p className="af-section-desc">Feedback on multiple-choice questions, clarity, and options</p>
              </div>
            </div>

            <div className="af-field-group">
              <label className="af-field-label">How would you rate the MCQ questions?</label>
              <StarRating
                value={mcqRating}
                onChange={setMcqRating}
                label="MCQ rating"
              />
            </div>

            <div className="af-field-group">
              <label className="af-field-label">How clear were the MCQ questions?</label>
              <PillGroup
                options={['Very unclear', 'Unclear', 'Neutral', 'Clear', 'Very clear']}
                value={mcqClarity}
                onChange={setMcqClarity}
                ariaLabel="MCQ clarity"
              />
            </div>

            <div className="af-field-group">
              <label className="af-field-label">How would you rate the difficulty of the MCQs?</label>
              <PillGroup
                options={['Too Easy', 'Slightly Easy', 'Appropriate', 'Slightly Difficult', 'Too Difficult']}
                value={mcqDifficulty}
                onChange={setMcqDifficulty}
                ariaLabel="MCQ difficulty"
              />
            </div>

            <div className="af-field-group">
              <label className="af-field-label">Did you experience any issue with:</label>
              <ChipGroup
                options={[
                  'Question loading',
                  'Options not displaying',
                  'Selecting an option',
                  'Changing an answer',
                  'Moving between questions',
                  'Timer',
                  'Navigation',
                  'None'
                ]}
                selectedValues={mcqIssues}
                onToggle={setMcqIssues}
              />
            </div>

            <div className="af-field-group">
              <label className="af-field-label">
                <span>Which MCQ question(s) did you find unclear or problematic?</span>
                <span className="af-field-hint">(Optional)</span>
              </label>
              <textarea
                className="af-textarea"
                placeholder="e.g. Question 4 had conflicting options, Question 9 typo in code snippet…"
                value={mcqProblematicQuestions}
                onChange={(e) => setMcqProblematicQuestions(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* ── 4. Coding Experience (Conditional) ── */}
        {hasCoding && (
          <div className="af-section-card">
            <div className="af-section-header">
              <div className="af-section-icon">
                <FaCode />
              </div>
              <div>
                <h2 className="af-section-title">Coding Experience</h2>
                <p className="af-section-desc">Feedback on coding problems, Monaco editor, and test cases</p>
              </div>
            </div>

            <div className="af-field-group">
              <label className="af-field-label">How would you rate the coding questions?</label>
              <StarRating
                value={codingRating}
                onChange={setCodingRating}
                label="Coding questions rating"
              />
            </div>

            <div className="af-field-group">
              <label className="af-field-label">How clear were the coding problem statements?</label>
              <PillGroup
                options={['Very unclear', 'Unclear', 'Neutral', 'Clear', 'Very clear']}
                value={codingClarity}
                onChange={setCodingClarity}
                ariaLabel="Coding problem clarity"
              />
            </div>

            <div className="af-field-group">
              <label className="af-field-label">How appropriate was the coding difficulty?</label>
              <PillGroup
                options={['Too Easy', 'Slightly Easy', 'Appropriate', 'Slightly Difficult', 'Too Difficult']}
                value={codingDifficulty}
                onChange={setCodingDifficulty}
                ariaLabel="Coding difficulty"
              />
            </div>

            <div className="af-field-group">
              <label className="af-field-label">How was the coding editor experience?</label>
              <StarRating
                value={codingEditorRating}
                onChange={setCodingEditorRating}
                label="Coding editor rating"
              />
            </div>

            <div className="af-field-group">
              <label className="af-field-label">Did you experience any coding-related issues?</label>
              <ChipGroup
                options={[
                  'Code editor not loading',
                  'Code execution failed',
                  'Compilation error unrelated to my code',
                  'Test case not running',
                  'Output not displaying',
                  'Program got stuck',
                  'Editor became slow/frozen',
                  'Submission issue',
                  'Timer issue',
                  'None'
                ]}
                selectedValues={codingIssues}
                onToggle={setCodingIssues}
              />
            </div>

            <div className="af-field-group">
              <label className="af-field-label">
                <span>Please describe any coding issue you experienced</span>
                <span className="af-field-hint">(Optional)</span>
              </label>
              <textarea
                className="af-textarea"
                placeholder="e.g. Test case 2 output took 10s, auto-complete felt laggy in C++…"
                value={codingIssueDescription}
                onChange={(e) => setCodingIssueDescription(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* ── 5. SEED Portal / SEB Experience ── */}
        <div className="af-section-card">
          <div className="af-section-header">
            <div className="af-section-icon">
              <FaDesktop />
            </div>
            <div>
              <h2 className="af-section-title">SEED Portal & SEB Platform Experience</h2>
              <p className="af-section-desc">Help us make the SEED exam platform faster, smoother, and more reliable</p>
            </div>
          </div>

          <div className="af-field-group">
            <label className="af-field-label">How easy was it to use the SEED assessment interface?</label>
            <StarRating
              value={interfaceUsabilityRating}
              onChange={setInterfaceUsabilityRating}
              label="Interface ease of use"
            />
          </div>

          <div className="af-field-group">
            <label className="af-field-label">How was the overall platform performance?</label>
            <StarRating
              value={performanceRating}
              onChange={setPerformanceRating}
              label="Platform performance"
            />
          </div>

          <div className="af-field-group">
            <label className="af-field-label">How would you rate the overall portal experience?</label>
            <StarRating
              value={portalOverallRating}
              onChange={setPortalOverallRating}
              label="Overall portal experience"
            />
          </div>

          <div className="af-field-group">
            <label className="af-field-label">Did the application behave reliably?</label>
            <PillGroup
              options={['Yes, completely', 'Mostly', 'Sometimes there were issues', 'Frequently had issues', 'Major problems']}
              value={reliability}
              onChange={setReliability}
              ariaLabel="Application reliability"
            />
          </div>
        </div>

        {/* ── 6. Technical Experience (Smart Conditional) ── */}
        <div className="af-section-card">
          <div className="af-section-header">
            <div className="af-section-icon">
              <FaTools />
            </div>
            <div>
              <h2 className="af-section-title">Technical Experience</h2>
              <p className="af-section-desc">Report any glitches or technical friction for SEED engineering</p>
            </div>
          </div>

          <div className="af-field-group">
            <label className="af-field-label">Did you face any technical problem?</label>
            <PillGroup
              options={['No', 'Yes, minor', 'Yes, major']}
              value={hadTechnicalIssues}
              onChange={setHadTechnicalIssues}
              ariaLabel="Faced technical issues"
            />
          </div>

          {/* Conditional expander if Yes */}
          {hadTechnicalIssues !== 'No' && (
            <div className="af-conditional-box">
              <div className="af-field-group">
                <label className="af-field-label">What happened?</label>
                <ChipGroup
                  options={[
                    'Login problem',
                    'Assessment didn\'t start',
                    'Application crashed',
                    'Application became slow',
                    'Screen froze',
                    'Questions didn\'t load',
                    'Internet/network issue',
                    'Coding execution problem',
                    'Submission problem',
                    'Timer problem',
                    'Proctoring issue',
                    'Other'
                  ]}
                  selectedValues={technicalIssues}
                  onToggle={setTechnicalIssues}
                  exclusiveNone={false}
                />
              </div>

              <div className="af-field-group">
                <label className="af-field-label">Approximately when did this happen?</label>
                <PillGroup
                  options={['Before assessment', 'During MCQ', 'During coding', 'During submission', 'At the end']}
                  value={technicalIssueTiming}
                  onChange={setTechnicalIssueTiming}
                  ariaLabel="When technical issue happened"
                />
              </div>

              <div className="af-field-group">
                <label className="af-field-label">Please describe what happened</label>
                <textarea
                  className="af-textarea"
                  placeholder="Describe the technical issue in detail so our dev team can resolve it…"
                  value={technicalIssueDetails}
                  onChange={(e) => setTechnicalIssueDetails(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── 7. Student Confidence & Value ── */}
        <div className="af-section-card">
          <div className="af-section-header">
            <div className="af-section-icon">
              <FaChartLine />
            </div>
            <div>
              <h2 className="af-section-title">Student Confidence & Assessment Value</h2>
              <p className="af-section-desc">Understanding your perception of skills and valuable learnings</p>
            </div>
          </div>

          <div className="af-field-group">
            <label className="af-field-label">
              After completing this assessment, how confident are you about your performance?
            </label>
            <StarRating
              value={confidenceRating}
              onChange={setConfidenceRating}
              label="Performance confidence"
            />
          </div>

          <div className="af-field-group">
            <label className="af-field-label">Did the assessment reflect your actual skills?</label>
            <PillGroup
              options={['Not at all', 'Slightly', 'Moderately', 'Mostly', 'Very accurately']}
              value={reflectedSkills}
              onChange={setReflectedSkills}
              ariaLabel="Reflected actual skills"
            />
          </div>

          <div className="af-field-group">
            <label className="af-field-label">Which part of the assessment was most valuable to you?</label>
            <PillGroup
              options={[
                'MCQ',
                'Coding',
                'Problem-solving',
                'Time management',
                'Practical application',
                'Overall assessment experience',
                'Other'
              ]}
              value={valuablePart}
              onChange={setValuablePart}
              ariaLabel="Most valuable part"
            />
          </div>
        </div>

        {/* ── 8. Actionable Improvements & Portal Highlights ── */}
        <div className="af-section-card">
          <div className="af-section-header">
            <div className="af-section-icon">
              <FaRegLightbulb />
            </div>
            <div>
              <h2 className="af-section-title">Your Suggestions & Highlights</h2>
              <p className="af-section-desc">Direct feedback to shape future assessments and portal features</p>
            </div>
          </div>

          <div className="af-field-group">
            <label className="af-field-label">
              <span>What is the one thing we should improve in the next assessment?</span>
              <span className="af-field-hint">(Recommended)</span>
            </label>
            <textarea
              className="af-textarea"
              placeholder="e.g. Provide clearer sample test cases, more time for coding section, clearer diagrams…"
              value={improvementSuggestion}
              onChange={(e) => setImprovementSuggestion(e.target.value)}
            />
          </div>

          <div className="af-field-group">
            <label className="af-field-label">What did you like most about the SEED assessment platform?</label>
            <ChipGroup
              options={[
                'Simple interface',
                'Easy navigation',
                'Coding environment',
                'Question presentation',
                'Timer',
                'Assessment instructions',
                'Performance',
                'Security/proctoring',
                'Other'
              ]}
              selectedValues={platformLiked}
              onToggle={setPlatformLiked}
              exclusiveNone={false}
            />
          </div>
        </div>

        {/* ── 9. Net Promoter Score & Open Remarks ── */}
        <div className="af-section-card">
          <div className="af-section-header">
            <div className="af-section-icon">
              <FaHeart />
            </div>
            <div>
              <h2 className="af-section-title">Recommendation & Final Thoughts</h2>
              <p className="af-section-desc">Net Promoter Score and any extra thoughts</p>
            </div>
          </div>

          <div className="af-field-group">
            <label className="af-field-label">
              How likely are you to recommend the SEED Assessment Platform to another student?
            </label>
            <NPSSelector
              value={npsScore}
              onChange={setNpsScore}
            />
          </div>

          <div className="af-field-group">
            <label className="af-field-label">
              <span>Anything else you'd like us to know?</span>
              <span className="af-field-hint">(Optional)</span>
            </label>
            <textarea
              className="af-textarea"
              placeholder="Share any other feedback, shoutouts, or observations…"
              value={additionalFeedback}
              onChange={(e) => setAdditionalFeedback(e.target.value)}
            />
          </div>
        </div>

        {/* ── 10. Actions / Submit ── */}
        <div className="af-footer-card">
          <button
            type="button"
            className="af-submit-btn"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? (
              <>
                <span className="af-spinner"></span>
                <span>Submitting Feedback…</span>
              </>
            ) : (
              <>
                <FaPaperPlane />
                <span>Submit Feedback & Finish</span>
              </>
            )}
          </button>

          <button
            type="button"
            className="af-skip-btn"
            disabled={submitting}
            onClick={handleSkip}
          >
            Skip & Return to Dashboard <FaArrowRight style={{ fontSize: '0.8rem', marginLeft: '4px' }} />
          </button>
        </div>
      </div>
    </div>
  );
}

AssessmentFeedback.propTypes = {
  assessment: PropTypes.object,
  user: PropTypes.object,
  tenant: PropTypes.object,
  attemptId: PropTypes.string,
  onComplete: PropTypes.func.isRequired,
};
