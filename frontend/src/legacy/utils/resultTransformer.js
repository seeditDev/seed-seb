/**
 * resultTransformer.js
 * Standardizes assessment result payloads across MultiSection, Coding, and MCQ tests
 * into a single unified JSON schema compatible with Firebase.
 */

export const buildUnifiedResultPayload = (rawPayload) => {
  const email = rawPayload.email || rawPayload.Email || '';
  const name = rawPayload.name || rawPayload.Name || '';
  const rollNumber = rawPayload.rollNumber || rawPayload['Roll Number'] || '';
  const college = rawPayload.college || rawPayload.College || '';
  const department = rawPayload.department || rawPayload.Department || '';
  const year = rawPayload.year || rawPayload.Year || '';

  const assessmentID = rawPayload.assessmentID || rawPayload.assessmentId || rawPayload.testID || rawPayload.id || '';
  const assessmentName = rawPayload.assessmentName || rawPayload.testName || rawPayload.name || '';
  const testType = rawPayload.testType || rawPayload.type || 'multisection';

  const startedAt = rawPayload.startedAt || rawPayload.timeStartedISO || rawPayload.startTimeISO || new Date().toISOString();
  const submittedAt = rawPayload.submittedAtISO || rawPayload.submittedAt || new Date().toISOString();

  let timeTakenSeconds = rawPayload.timeTakenSeconds;
  if (typeof timeTakenSeconds !== 'number') {
    if (typeof rawPayload.timeTaken === 'number') {
      timeTakenSeconds = rawPayload.timeTaken;
    } else {
      timeTakenSeconds = Math.max(0, Math.round((new Date(submittedAt).getTime() - new Date(startedAt).getTime()) / 1000));
    }
  }

  const autoSubmitted = Boolean(rawPayload.autoSubmitted);
  const violationCount = typeof rawPayload.violationCount === 'number' ? rawPayload.violationCount : 0;

  // Extract first violation timestamp if available
  let violationTime = rawPayload.violationTime || '—';
  if (violationTime === '—' && Array.isArray(rawPayload.violations) && rawPayload.violations.length > 0) {
    const firstV = rawPayload.violations[0];
    violationTime = firstV.timestamp || firstV.time || '—';
  }

  const score = typeof rawPayload.score === 'number' ? rawPayload.score : 0;
  const totalMarks = typeof rawPayload.totalMarks === 'number' ? rawPayload.totalMarks : (rawPayload.totalQuestions || 0);
  const percentage = typeof rawPayload.percentage === 'number' ? rawPayload.percentage : (totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0);

  const initialScore = typeof rawPayload.initialScore === 'number' ? rawPayload.initialScore : score;
  const partialScore = typeof rawPayload.partialScore === 'number' ? rawPayload.partialScore : score;
  const fullScore = typeof rawPayload.fullScore === 'number' ? rawPayload.fullScore : (percentage >= 100 ? totalMarks : 0);

  // Normalize sectionsArray
  let sectionsArray = [];
  if (Array.isArray(rawPayload.sectionsArray) && rawPayload.sectionsArray.length > 0) {
    sectionsArray = rawPayload.sectionsArray.map(sec => {
      const secTime = typeof sec.timeTaken === 'number' ? sec.timeTaken : (sec.timeSpentSeconds || 0);
      const secM = Math.floor(secTime / 60);
      const secS = secTime % 60;
      return {
        sectionName: sec.sectionName || sec.name || 'Section',
        name: sec.sectionName || sec.name || 'Section',
        score: typeof sec.score === 'number' ? sec.score : 0,
        totalMarks: typeof sec.totalMarks === 'number' ? sec.totalMarks : (sec.maxScore || 0),
        maxScore: typeof sec.totalMarks === 'number' ? sec.totalMarks : (sec.maxScore || 0),
        timeTaken: secTime,
        timeSpentSeconds: secTime,
        timeTakenFormatted: sec.timeTakenFormatted || `${secM}:${secS < 10 ? '0' : ''}${secS}`,
        startTimeISO: sec.startTimeISO || sec.startedAtISO || '',
        endTimeISO: sec.endTimeISO || sec.submittedAtISO || ''
      };
    });
  } else if (rawPayload.sections && typeof rawPayload.sections === 'object') {
    sectionsArray = Object.entries(rawPayload.sections).map(([key, sec]) => {
      const secTime = sec.data?.timeSpentSeconds || sec.timeSpentSeconds || sec.timeTaken || 0;
      const secM = Math.floor(secTime / 60);
      const secS = secTime % 60;
      return {
        sectionName: sec.sectionName || sec.name || key,
        name: sec.sectionName || sec.name || key,
        score: sec.data?.score || sec.score || 0,
        totalMarks: sec.data?.totalMarks || sec.data?.totalQuestions || sec.totalMarks || 0,
        maxScore: sec.data?.totalMarks || sec.data?.totalQuestions || sec.totalMarks || 0,
        timeTaken: secTime,
        timeSpentSeconds: secTime,
        timeTakenFormatted: sec.timeTakenFormatted || `${secM}:${secS < 10 ? '0' : ''}${secS}`,
        startTimeISO: sec.startTimeISO || sec.data?.startTimeISO || '',
        endTimeISO: sec.endTimeISO || sec.data?.endTimeISO || ''
      };
    });
  }

  // Spoken / Speech CEFR metrics
  let cefrLevel = rawPayload.cefrLevel || '';
  let cefrName = rawPayload.cefrName || '';
  let wpm = typeof rawPayload.wpm === 'number' ? rawPayload.wpm : 0;
  let fillerCount = typeof rawPayload.fillerCount === 'number' ? rawPayload.fillerCount : 0;

  // Extract from spoken section if available
  if (rawPayload.sections) {
    const spokenSec = Object.values(rawPayload.sections).find(s => s.type === 'spoken' || s.sectionName?.toLowerCase().includes('spoken') || s.sectionName?.toLowerCase().includes('speech'));
    if (spokenSec?.data) {
      if (spokenSec.data.cefrLevel) cefrLevel = spokenSec.data.cefrLevel;
      if (spokenSec.data.cefrName) cefrName = spokenSec.data.cefrName;
      if (typeof spokenSec.data.wpm === 'number') wpm = spokenSec.data.wpm;
      if (typeof spokenSec.data.fillerCount === 'number') fillerCount = spokenSec.data.fillerCount;
    }
  }

  // Normalize MCQ questions list
  let questions = [];
  const rawQList = Array.isArray(rawPayload.questions) ? rawPayload.questions : (Array.isArray(rawPayload.questionsDetails) ? rawPayload.questionsDetails : []);
  questions = rawQList.map(q => ({
    question: q.question || q.questionText || q.text || '',
    selectedAnswer: q.selectedAnswer || '',
    correctAnswer: q.correctAnswer || '',
    isCorrect: Boolean(q.isCorrect),
    topic: q.topic || q.tag || 'General',
    difficulty: q.difficulty || 'Medium',
    timeSpent: typeof q.timeSpent === 'number' ? q.timeSpent : (q.timeSpentSeconds || 0)
  }));

  // Normalize Coding Submissions list
  let codingSubmissions = [];
  const rawCodingList = Array.isArray(rawPayload.codingSubmissions) ? rawPayload.codingSubmissions : (Array.isArray(rawPayload.coding) ? rawPayload.coding : []);
  codingSubmissions = rawCodingList.map((c, idx) => ({
    questionNumber: c.questionNumber || (idx + 1),
    problemTitle: c.problemTitle || c.title || `Problem ${idx + 1}`,
    language: c.language || 'Python 3',
    status: c.status || (c.testsPassed === c.totalTests ? 'Accepted' : 'Wrong Answer'),
    testsPassed: typeof c.testsPassed === 'number' ? c.testsPassed : 0,
    totalTests: typeof c.totalTests === 'number' ? c.totalTests : 0,
    score: typeof c.score === 'number' ? c.score : 0,
    timeTaken: typeof c.timeTaken === 'number' ? c.timeTaken : (c.timeSpentSeconds || 0)
  }));

  return {
    rollNumber,
    name,
    email,
    college,
    department,
    year,

    assessmentID,
    assessmentName,
    testType,

    startedAt,
    submittedAt,
    timeTakenSeconds,
    autoSubmitted,
    violationCount,
    violationTime,
    initialScore,

    score,
    totalMarks,
    percentage,
    partialScore,
    fullScore,

    sectionsArray,

    cefrLevel,
    cefrName,
    wpm,
    fillerCount,

    questions,
    codingSubmissions,

    // Backward-compatibility aliases for legacy reporting tools
    testID: assessmentID,
    testName: assessmentName,
    assessmentId: assessmentID,
    type: testType,
    submittedAtISO: submittedAt,
    timeStartedISO: startedAt,
    totalQuestions: totalMarks,
    correctAnswers: score,
    incorrectAnswers: Math.max(0, totalMarks - score)
  };
};
