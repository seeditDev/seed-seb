/**
 * canonicalModels.js
 * 
 * Central Canonical Normalization Layer & Single Source of Truth
 * 
 * Guarantees uniform parameter contracts across the entire application.
 * All ingress points (Firestore, LocalStorage, Static JSON, API responses)
 * must pass through these functions to eliminate fragmented fallback chains (`||`).
 */

// ── 1. User Entity Normalizer ───────────────────────────────────────────────────
/**
 * Normalizes any raw user / auth object into a CanonicalUser.
 * @param {Object} raw 
 * @returns {Object}
 */
export function normalizeUser(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return {
      uid: '',
      email: '',
      name: 'Student',
      displayName: 'Student',
      rollNumber: '',
      tenantId: 'SEED-SEB',
      college: 'SEED-SEB',
      cohortId: '',
      year: '',
      department: '',
      isPremium: false,
      seedCredits: 0,
      streak: 0,
      lastStreakDate: null,
      photoURL: '',
      role: 'student',
      isAuthenticated: false
    };
  }

  const uid = String(raw.uid || raw.UID || raw.userId || raw.id || '').trim();
  const email = String(raw.email || raw.Email || raw.userEmail || '').trim().toLowerCase();
  const name = String(raw.name || raw.Name || raw.displayName || 'Student').trim();
  
  const rollNumber = String(
    raw.rollNumber || raw['Roll Number'] || raw.rollNo || raw.RollNo || 
    raw.regNo || raw.registerNumber || raw.roll || ''
  ).trim();

  // Tenant Identifier / College Code (e.g. "KGKITE", "TN000026", "SEED-SEB")
  let candidateTenantId = String(
    raw.tenantId || raw.TenantId || raw.tenant_id || 
    raw.collegeCode || raw.CollegeCode || ''
  ).trim();

  if (candidateTenantId.includes(' ') && (raw.collegeCode || raw.CollegeCode)) {
    candidateTenantId = String(raw.collegeCode || raw.CollegeCode).trim();
  }

  const tenantId = (candidateTenantId && !candidateTenantId.includes(' ')) ? candidateTenantId : 'SEED-SEB';

  // Human-readable College Name (e.g. "KGISL Institute of Technology")
  const college = String(
    raw.college || raw.College || raw.collegeName || raw.CollegeName || 
    raw.tenantName || (candidateTenantId.includes(' ') ? candidateTenantId : tenantId) || 'SEED-SEB'
  ).trim();

  // Cohort / Batch (e.g. "2K27") and Graduation Year (e.g. "2027")
  let cohortId = String(raw.cohortId || raw.CohortId || '').trim();
  let year = String(raw.year || raw.Year || raw.graduationYear || '').trim();
  if (!year && cohortId) {
    const m = cohortId.match(/^2K(\d{2})/i);
    if (m) year = `20${m[1]}`;
  }
  if (!cohortId && year) {
    const m = year.match(/^20(\d{2})/);
    if (m) cohortId = `2K${m[1]}`;
  }

  const department = String(raw.department || raw.Department || raw.dept || '').trim();

  const isPremium = Boolean(
    raw.isPremium === true || raw.Premium === true || 
    raw.Premium === 'true' || raw.Premium === 1 || raw.Premium === 2 || raw.Premium === 'Yes'
  );

  const seedCredits = Number(raw.seedCredits ?? raw.credits ?? 0);
  const streak = Number(raw.streak ?? raw.currentStreak ?? 0);
  const lastStreakDate = raw.lastStreakDate || null;
  const photoURL = raw.photoURL || raw.photoUrl || '';
  const role = raw.role || 'student';

  return {
    ...raw,
    uid,
    email,
    name,
    displayName: name,
    rollNumber,
    tenantId,
    collegeCode: tenantId,
    college,
    cohortId,
    year,
    department,
    isPremium,
    seedCredits,
    streak,
    lastStreakDate,
    photoURL,
    photoUrl: photoURL,
    role,
    // Provide canonical uppercase aliases for backward compatibility without fallbacks
    Email: email,
    Name: name,
    College: college,
    Year: year,
    Department: department,
    TenantId: tenantId,
    isAuthenticated: Boolean(uid || email)
  };
}

// ── 2. Assessment Entity Normalizer ─────────────────────────────────────────────
/**
 * Normalizes any assessment / test object into a CanonicalAssessment.
 * @param {Object} raw 
 * @returns {Object}
 */
export function normalizeAssessment(raw = {}) {
  if (!raw || typeof raw !== 'object') return null;

  const id = String(raw.id || raw.testID || raw.assessmentId || raw.testInfo?.id || raw._id || '').trim();
  const title = String(raw.title || raw.name || raw.testName || raw.assessmentTitle || 'Assessment').trim();
  const description = String(raw.description || raw.desc || '');
  const durationMinutes = Number(raw.durationMinutes || raw.duration || raw.timeLimit || 60);

  const sections = Array.isArray(raw.sections)
    ? raw.sections.map((s, idx) => normalizeSection(s, idx))
    : (Array.isArray(raw.sectionsList) ? raw.sectionsList.map((s, idx) => normalizeSection(s, idx)) : []);

  const totalMarks = Number(
    raw.totalMarks ?? raw.maxMarks ?? raw.totalScore ?? 
    (sections.reduce((acc, s) => acc + (s.totalMarks || 0), 0) || 100)
  );

  return {
    ...raw,
    id,
    testID: id,
    assessmentId: id,
    title,
    name: title,
    description,
    durationMinutes,
    durationSeconds: durationMinutes * 60,
    totalMarks,
    maxMarks: totalMarks,
    passkey: String(raw.passkey || raw.passKey || raw.password || raw.key || '').trim(),
    sections,
    proctored: Boolean(raw.proctored),
    audioProctored: Boolean(raw.audioProctored),
    maxViolations: Number(raw.maxViolations || 7),
    maxAudioViolations: Number(raw.maxAudioViolations || 5),
    timerRestrictedSubmit: Boolean(raw.timerRestrictedSubmit),
    forwardOnly: Boolean(raw.forwardOnly)
  };
}

// ── 3. Section Entity Normalizer ────────────────────────────────────────────────
export function normalizeSection(sec = {}, idx = 0) {
  const sectionId = String(sec.sectionId || sec.id || `sec_${idx + 1}`).trim();
  const name = String(sec.name || sec.title || `Section ${idx + 1}`).trim();
  const type = String(sec.type || 'mcq').toLowerCase().trim(); // 'mcq' | 'coding' | 'spoken_english'
  const durationMinutes = Number(sec.durationMinutes || sec.duration || 30);

  let rawQuestions = Array.isArray(sec.questions) ? sec.questions : [];
  let questions = [];

  if (type === 'mcq') {
    questions = rawQuestions.map((q, qIdx) => normalizeMCQQuestion(q, qIdx));
  } else if (type === 'coding') {
    questions = rawQuestions.map((q, qIdx) => normalizeCodingQuestion(q, qIdx));
  } else if (type === 'spoken_english') {
    questions = rawQuestions.map((q, qIdx) => normalizeSpokenEnglishQuestion(q, qIdx));
  } else {
    questions = rawQuestions;
  }

  const totalMarks = Number(sec.totalMarks || sec.maxMarks || (questions.length * (type === 'coding' ? 10 : 1)));

  return {
    ...sec,
    sectionId,
    id: sectionId,
    name,
    title: name,
    type,
    durationMinutes,
    durationSeconds: durationMinutes * 60,
    totalMarks,
    questions,
    proctored: Boolean(sec.proctored),
    audioProctored: Boolean(sec.audioProctored),
    forwardOnly: Boolean(sec.forwardOnly),
    timerRestrictedSubmit: Boolean(sec.timerRestrictedSubmit)
  };
}

// ── 4. MCQ Question Normalizer ──────────────────────────────────────────────────
export function normalizeMCQQuestion(q = {}, idx = 0) {
  const id = String(q.id || q.questionId || q.qid || `mcq_${idx + 1}`).trim();
  const prompt = String(q.prompt || q.question || q.questionText || q.text || q.title || '').trim();
  const options = Array.isArray(q.options) ? q.options : (Array.isArray(q.choices) ? q.choices : []);
  const correctAnswer = String(q.correctAnswer ?? q.correctOption ?? q.correct_option ?? q.answer ?? q.ans ?? '').trim();
  const topic = String(q.topic || q.tag || (Array.isArray(q.tags) ? q.tags[0] : q.tags) || 'General').trim();
  const marks = Number(q.marks || q.weight || 1);
  const negativeMarks = Number(q.negativeMarks || 0);
  const explanation = String(q.explanation || q.solution || q.hint || '').trim();

  return {
    ...q,
    id,
    questionId: id,
    prompt,
    question: prompt, // canonical + alias for template strings
    questionText: prompt,
    text: prompt,
    options,
    choices: options,
    correctAnswer,
    correctOption: correctAnswer,
    answer: correctAnswer,
    topic,
    difficulty: String(q.difficulty || 'Medium'),
    marks,
    negativeMarks,
    explanation,
    hint: explanation
  };
}

// ── 5. Coding Question Normalizer ───────────────────────────────────────────────
export function normalizeCodingQuestion(q = {}, idx = 0) {
  if (!q || typeof q !== 'object') return q;
  const id = String(q.id || q.questionId || q.challengeId || q._id || `code_${idx + 1}`).trim();
  const title = String(q.title || q.name || q.problemTitle || q.content?.title || 'Coding Challenge').trim();
  
  let description = String(
    q.content?.problemStatement || q.description || 
    q.problemStatement || q.statement || q.prompt || ''
  ).trim();

  const instructions = String(
    q.content?.inputFormat || q.instructions || 
    q.inputFormat || ''
  ).trim();

  const rawConstraints = q.content?.constraints || q.constraints || [];
  const constraintsArray = Array.isArray(rawConstraints)
    ? rawConstraints
    : (typeof rawConstraints === 'string' && rawConstraints.trim() ? rawConstraints.split('\n') : []);
  const constraintsStr = Array.isArray(rawConstraints) ? rawConstraints.join('\n') : String(rawConstraints || '');

  // Parse sample tests
  const rawSampleTests = (
    q.content?.sampleTestCases || q.sampleTestCases || 
    q.sampleTests || q.testCases?.sample || 
    (Array.isArray(q.testCases) ? q.testCases.filter(tc => !tc.hidden && !tc.isHidden) : [])
  );

  const sampleTestCases = Array.isArray(rawSampleTests) ? rawSampleTests.map((tc, tcIdx) => {
    const input = String(tc.input ?? tc.sampleInput ?? tc.sample_input ?? tc.stdin ?? '');
    const expected = String(tc.expected ?? tc.expectedOutput ?? tc.output ?? tc.sample_output ?? tc.stdout ?? '');
    return {
      ...tc,
      id: String(tc.id || `tc_${tcIdx + 1}`),
      input,
      expected,
      expectedOutput: expected,
      weight: Number(tc.weight || tc.marks || 10),
      isHidden: false,
      hidden: false
    };
  }) : [];

  // Parse hidden tests
  const rawHiddenTests = (
    q.content?.hiddenTestCases || q.hiddenTestCases || 
    q.hiddenTests || q.testCases?.hidden || 
    (Array.isArray(q.testCases) ? q.testCases.filter(tc => tc.hidden || tc.isHidden) : [])
  );

  const hiddenTestCases = Array.isArray(rawHiddenTests) ? rawHiddenTests.map((tc, tcIdx) => {
    const input = String(tc.input ?? tc.sampleInput ?? tc.sample_input ?? tc.stdin ?? '');
    const expected = String(tc.expected ?? tc.expectedOutput ?? tc.output ?? tc.sample_output ?? tc.stdout ?? '');
    return {
      ...tc,
      id: String(tc.id || `tc_hidden_${tcIdx + 1}`),
      input,
      expected,
      expectedOutput: expected,
      weight: Number(tc.weight || tc.marks || 10),
      isHidden: true,
      hidden: true
    };
  }) : [];

  // Parse boilerplates
  const rawBoilerplates = (
    q.boilerplates || q.boilerPlates || 
    q.content?.boilerplates || q.content?.boilerPlates || 
    q.content?.code_templates || q.code_templates || q.templates || {}
  );

  const VALID_LANG_NAMES = new Set(['c', 'cpp', 'c++', 'java', 'python', 'python3', 'javascript', 'js', 'csharp', 'cs', 'ruby', 'go', 'rust', 'kotlin', 'swift', 'typescript', 'ts']);
  const cleanBoilerplates = {};
  Object.entries(rawBoilerplates).forEach(([lang, val]) => {
    if (!VALID_LANG_NAMES.has(String(lang).trim().toLowerCase())) return;
    if (typeof val !== 'string') return;
    const l = String(lang).trim().toLowerCase();
    cleanBoilerplates[l] = val;
    if (l === 'python' || l === 'python3') {
      cleanBoilerplates.python = val;
      cleanBoilerplates.python3 = val;
    }
    if (l === 'cpp' || l === 'c++') {
      cleanBoilerplates.cpp = val;
      cleanBoilerplates['c++'] = val;
    }
    if (l === 'javascript' || l === 'js') {
      cleanBoilerplates.javascript = val;
      cleanBoilerplates.js = val;
    }
  });

  const defaultBoilerplates = {
    c: '#include <stdio.h>\n\nint main() {\n    // Write your code here\n    return 0;\n}',
    cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your code here\n    return 0;\n}',
    'c++': '#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your code here\n    return 0;\n}',
    java: 'import java.util.*;\n\npublic class Solution {\n    public static void main(String[] args) {\n        // Write your code here\n    }\n}',
    python: '# Write your code here\n',
    python3: '# Write your code here\n',
    javascript: '// Write your code here\n',
    js: '// Write your code here\n',
  };

  const finalBoilerplates = {
    ...defaultBoilerplates,
    ...cleanBoilerplates
  };

  const isPremium = Boolean(q.isPremium || q.metadata?.isPremium);

  const content = {
    ...(q.content || {}),
    title,
    problemStatement: description,
    inputFormat: instructions,
    outputFormat: q.content?.outputFormat || q.outputFormat || '',
    constraints: constraintsArray,
    sampleTestCases,
    hiddenTestCases,
    boilerplates: finalBoilerplates,
    boilerPlates: finalBoilerplates
  };

  return {
    ...q,
    id,
    questionId: id,
    title,
    name: title,
    description,
    statement: description,
    problemStatement: description,
    instructions,
    constraints: constraintsStr,
    difficulty: String(q.difficulty || q.metadata?.difficulty || 'Medium'),
    category: String(q.category || q.metadata?.category || 'Algorithms'),
    content,
    testCases: {
      ...(typeof q.testCases === 'object' && !Array.isArray(q.testCases) ? q.testCases : {}),
      sample: sampleTestCases,
      hidden: hiddenTestCases
    },
    sampleTestCases,
    sampleTests: sampleTestCases,
    hiddenTests: hiddenTestCases,
    hiddenTestCases,
    boilerplates: finalBoilerplates,
    boilerPlates: finalBoilerplates,
    isPremium,
    judging: q.judging || { supportedLanguages: ['C', 'C++', 'Java', 'Python3', 'JavaScript'] },
    metadata: {
      ...(q.metadata || {}),
      difficulty: String(q.difficulty || q.metadata?.difficulty || 'Medium'),
      category: String(q.category || q.metadata?.category || 'Algorithms'),
      isPremium
    }
  };
}

// ── 6. Spoken English Question Normalizer ────────────────────────────────────────
export function normalizeSpokenEnglishQuestion(q = {}, idx = 0) {
  const id = String(q.id || q.questionId || `speak_${idx + 1}`).trim();
  const prompt = String(q.prompt || q.text || q.sentence || q.question || '').trim();
  const moduleType = String(q.moduleType || q.type || 'read_aloud').toLowerCase().trim();
  const maxAttempts = Number(q.maxAttempts || q.attemptsAllowed || 3);
  const durationSeconds = Number(q.durationSeconds || q.duration || 60);

  return {
    id,
    questionId: id,
    prompt,
    text: prompt,
    question: prompt,
    moduleType,
    type: moduleType,
    maxAttempts,
    durationSeconds
  };
}

// ── 7. Submission Result Normalizer ──────────────────────────────────────────────
export function normalizeSubmissionResult(raw = {}) {
  if (!raw || typeof raw !== 'object') return null;

  const score = Number(raw.score ?? raw.totalScore ?? raw.marksObtained ?? 0);
  const maxMarks = Number(raw.maxMarks ?? raw.totalMarks ?? raw.maxScore ?? 100);
  const percentage = maxMarks > 0 ? Math.round((score / maxMarks) * 100) : score;

  return {
    userId: String(raw.userId || raw.uid || '').trim(),
    assessmentId: String(raw.assessmentId || raw.testID || raw.id || '').trim(),
    tenantId: String(raw.tenantId || raw.college || 'SEED-SEB').trim(),
    score,
    maxMarks,
    percentage,
    passed: Boolean(raw.passed ?? percentage >= 50),
    status: 'submitted',
    submittedAt: raw.submittedAt || new Date().toISOString(),
    violations: Array.isArray(raw.violations) ? raw.violations : [],
    violationCount: Number(raw.violationCount || 0),
    sectionResults: raw.sectionResults || {}
  };
}

// ── 8. Proctor Event Normalizer ──────────────────────────────────────────────
export function normalizeProctorEvent(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return {
      type: 'unknown',
      severity: 'low',
      confidence: null,
      timestamp: Date.now(),
      details: ''
    };
  }

  const type = String(raw.type || raw.eventType || raw.event || 'violation').trim();
  const severity = String(raw.severity || 'low').toLowerCase().trim();
  const confidence = raw.confidence !== undefined && raw.confidence !== null ? Number(raw.confidence) : null;
  const timestamp = Number(raw.timestamp || raw.time || Date.now());
  const details = String(raw.details || raw.message || raw.description || '').trim();

  return {
    type,
    severity: ['low', 'medium', 'high', 'critical'].includes(severity) ? severity : 'low',
    confidence: confidence !== null && !isNaN(confidence) ? confidence : null,
    timestamp,
    details
  };
}
