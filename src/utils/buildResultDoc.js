/**
 * buildResultDoc.js — Canonical Result Document Builder
 *
 * Enforces the single canonical schema for all assessment results written to:
 * assessmentResults/{tenantId}/{assessmentId}/{userId}
 *
 * Strict validation: Missing required fields fail fast. No alias fallbacks.
 */

/**
 * Builds the canonical Firestore result document.
 *
 * @param {object} params
 * @param {object} params.user       - Canonical user profile ({ uid, email, name, rollNumber, tenantId, college, department, year, cohortId })
 * @param {object} params.assessment - Canonical assessment object ({ id, title, type })
 * @param {object} params.scores     - { totalScore, maxScore, percentage, passed }
 * @param {object} params.timing     - { startedAt (ISO), timeTakenSeconds }
 * @param {object} params.submission - { autoSubmitted, submissionReason }
 * @param {Array}  [params.sections] - Array of SectionResult objects
 * @param {Array}  [params.questions] - Array of QuestionResult objects (MCQ)
 * @param {Array}  [params.codingSubmissions] - Array of CodingSubmission objects
 * @param {object} [params.proctoring] - { violationCount, totalNoFace, totalMultipleFaces, violations }
 * @param {object} [params.speech]     - { cefrLevel, cefrName, wpm, fillerCount } (SEA only)
 * @param {string} [params.appVersion] - Desktop installer/app version (e.g. '1.0.4')
 * @param {string} [params.engineVersion] - Core execution engine version (e.g. '1.4.0')
 * @param {string} [params.packageVersion] - Assessment package format version (e.g. '1.0.0')
 * @returns {object} Strict Canonical Firestore result document
 */
export function buildResultDoc({
  user,
  assessment,
  scores,
  timing,
  submission,
  sections = [],
  questions = [],
  codingSubmissions = [],
  proctoring = {},
  speech = {},
  appVersion = '1.0.4',
  engineVersion = '1.4.0',
  packageVersion = '1.0.0',
  /**
   * sessionAttemptId — canonical attempt document ID from the active session.
   * Format: {assessmentId}_{uid}  (from attemptDocId() in attemptStateMachine.js)
   *
   * When provided, this value is used directly for the result's attemptId so that:
   *   result.attemptId === session attempt doc ID
   * This makes proctoring joins, reconciliation, and support queries reliable.
   *
   * If not provided, falls back to the canonical {assessmentId}_{uid} format.
   * The old timestamp-suffixed format ({assessmentId}_{uid}_{timestamp}) is retired:
   * it created a different ID on every submission, making attempt↔result linkage impossible.
   */
  sessionAttemptId = null,
}) {
  if (!user || !user.uid) {
    throw new Error('[buildResultDoc] Missing required user.uid');
  }
  if (!user?.tenantId) {
    throw new Error('[buildResultDoc] Missing required user.tenantId');
  }
  if (!assessment || !assessment.id) {
    throw new Error('[buildResultDoc] Missing required assessment.id');
  }
  const assessmentType = assessment.assessmentType || assessment.type;
  if (!assessmentType) {
    throw new Error('[buildResultDoc] Missing required assessment.assessmentType');
  }
  const submissionReason = submission?.submissionReason;
  if (!submissionReason) {
    throw new Error('[buildResultDoc] Missing required submission.submissionReason');
  }

  const uid = user.uid;
  const submittedAt = new Date().toISOString();
  const startedAt = timing?.startedAt || submittedAt;
  const timeTakenSeconds = typeof timing?.timeTakenSeconds === 'number' ? timing.timeTakenSeconds : 0;

  return {
    // Identity
    userId:      uid,
    email:       user.email || '',
    name:        user.name || '',
    rollNumber:  user.rollNumber || '',
    tenantId:    user.tenantId,
    college:     user.college || '',
    department:  user.department || '',
    year:        user.year || '',
    cohortId:    user.cohortId || '',

    // Assessment reference
    id:              assessment.id,
    assessmentId:    assessment.id,
    assessmentTitle: assessment.title || assessment.name || '',
    assessmentType:  assessmentType,
    // [Fix Audit-6 P1] Use canonical session attemptId so result.attemptId === attempt doc ID.
    // The old {assessment.id}_{uid}_{timestamp} format created a different ID on every
    // submission, making proctoring joins and attempt↔result reconciliation unreliable.
    attemptId: sessionAttemptId || `${assessment.id}_${uid}`,

    // Timing
    startedAt:        startedAt,
    submittedAt:      submittedAt,
    timeTakenSeconds: timeTakenSeconds,

    // Submission State
    status:            'submitted',
    autoSubmitted:     Boolean(submission?.autoSubmitted),
    submissionReason:  submissionReason,
    completed:         true,
    evaluationSource:  'client',
    evaluationStatus:  'completed',
    scoring_authority: 'client_provisional',

    // Scores
    totalScore: typeof scores?.totalScore === 'number' ? scores.totalScore : 0,
    maxScore:   typeof scores?.maxScore === 'number' ? scores.maxScore : 0,
    percentage: typeof scores?.percentage === 'number' ? scores.percentage : 0,
    passed:     Boolean(scores?.passed),

    // Detail arrays
    sections,
    questions,
    codingSubmissions,

    // Proctoring
    violationCount:      typeof proctoring?.violationCount === 'number' ? proctoring.violationCount : 0,
    totalNoFace:         typeof proctoring?.totalNoFace === 'number' ? proctoring.totalNoFace : 0,
    totalMultipleFaces:  typeof proctoring?.totalMultipleFaces === 'number' ? proctoring.totalMultipleFaces : 0,
    violations:          Array.isArray(proctoring?.violations) ? proctoring.violations : [],

    // Spoken English (SEA only)
    cefrLevel:   speech?.cefrLevel ?? '',
    cefrName:    speech?.cefrName ?? '',
    wpm:         typeof speech?.wpm === 'number' ? speech.wpm : 0,
    fillerCount: typeof speech?.fillerCount === 'number' ? speech.fillerCount : 0,

    // Provenance & Versioning (Auditable multi-system version stamps)
    // NOTE: appVersion/engineVersion/packageVersion come from the destructured parameters above,
    // NOT from a `params` object (which does not exist in this scope).
    appVersion:         appVersion || '1.0.4',
    engineVersion:      engineVersion || '1.4.0',
    packageVersion:     packageVersion || '1.0.0',
    assessmentVersion:  assessment.version || assessment.assessmentVersion || '1.0.0',
  };
}

/**
 * Builds a canonical SectionResult object.
 */
export function buildSectionResult({ sectionName, type, totalScore, maxScore, timeTakenSeconds, startedAt, submittedAt }) {
  return {
    sectionName: sectionName ?? '',
    type: type ?? '',
    totalScore: typeof totalScore === 'number' ? totalScore : 0,
    maxScore: typeof maxScore === 'number' ? maxScore : 0,
    timeTakenSeconds: typeof timeTakenSeconds === 'number' ? timeTakenSeconds : 0,
    startedAt: startedAt ?? '',
    submittedAt: submittedAt ?? '',
  };
}

/**
 * Builds a canonical QuestionResult object for MCQ detail.
 */
export function buildQuestionResult({ questionId, selectedOption, isCorrect, timeSpentSeconds }) {
  return {
    questionId: questionId ?? '',
    selectedOption: selectedOption ?? null,
    isCorrect: Boolean(isCorrect),
    timeSpentSeconds: typeof timeSpentSeconds === 'number' ? timeSpentSeconds : 0,
  };
}

/**
 * Builds a canonical CodingSubmission object for coding detail.
 */
export function buildCodingSubmission({
  questionId,
  questionNumber,
  problemTitle,
  title,
  difficulty,
  language,
  code,
  solution,
  testsPassed,
  totalTests,
  score,
  maxScore,
  percentage,
  status,
  compilationCount,
  attempts,
  testResults,
  timeSpentSeconds,
  startedAt,
  submittedAt
}) {
  const finalCode = code ?? solution ?? '';
  const passed = typeof testsPassed === 'number' ? testsPassed : 0;
  const total = typeof totalTests === 'number' ? totalTests : 0;
  return {
    questionId: questionId ?? '',
    questionNumber: typeof questionNumber === 'number' ? questionNumber : 1,
    problemTitle: problemTitle || title || '',
    title: title || problemTitle || '',
    difficulty: difficulty ?? 'Easy',
    language: language ?? '',
    code: finalCode,
    solution: finalCode,
    testsPassed: passed,
    totalTests: total,
    score: typeof score === 'number' ? score : 0,
    maxScore: typeof maxScore === 'number' ? maxScore : 0,
    percentage: typeof percentage === 'number' ? percentage : (total > 0 ? Math.round((passed / total) * 100) : 0),
    status: status || (total > 0 ? (passed === total ? 'Accepted' : (passed > 0 ? 'Partial' : 'Wrong Answer')) : 'Wrong Answer'),
    compilationCount: typeof compilationCount === 'number' ? compilationCount : 0,
    attempts: typeof attempts === 'number' ? attempts : (typeof compilationCount === 'number' ? compilationCount : 0),
    timeSpentSeconds: typeof timeSpentSeconds === 'number' ? timeSpentSeconds : 0,
    startedAt: startedAt ?? '',
    submittedAt: submittedAt ?? new Date().toISOString(),
    testResults: Array.isArray(testResults) ? testResults : []
  };
}

