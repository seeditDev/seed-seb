/**
 * resultTransformer.js
 *
 * Produces a SINGLE normalized result payload consumed by:
 *   • Firestore: assessmentResults/{assessmentId}/students/{uid}
 *   • Admin Hub Reports
 *   • Staff Dashboard
 *
 * Field-name contract (Admin Reports reads these exact fields):
 *   assessmentId     — NOT assessmentID, assessmentId, or testID
 *   assessmentTitle  — NOT assessmentName or testName
 *   assessmentType   — NOT testType or type
 *   userId           — Firebase Auth UID, NOT email / college / rollNumber
 *   totalScore       — NOT score
 *   maxScore         — NOT totalMarks
 *   sections         — normalized array (NOT sectionsArray)
 *
 * Backward-compatibility aliases are included so legacy dashboards continue
 * to work, but all new readers MUST use the canonical field names above.
 */

import { auth } from '../firebase-config';

/**
 * Normalize a raw assessment result payload to a single canonical schema.
 *
 * @param {object} rawPayload — raw data from MCQPage, CodingAssessmentPage, MSA, etc.
 * @returns {object} Normalized payload ready for Firestore write.
 */
export const buildUnifiedResultPayload = (rawPayload) => {
    // ── Identity ──────────────────────────────────────────────────────────────
    // userId MUST be Firebase Auth UID — never email / college / rollNumber
    const userId = auth?.currentUser?.uid || rawPayload.userId || rawPayload.uid || '';
    const email       = rawPayload.email       || rawPayload.Email       || '';
    const displayName = rawPayload.displayName || rawPayload.name        || rawPayload.Name || '';
    const rollNumber  = rawPayload.rollNumber  || rawPayload['Roll Number'] || '';

    // Institutional fields (kept for reporting — NOT used as Firestore identity)
    const college    = rawPayload.college    || rawPayload.College    || '';
    const department = rawPayload.department || rawPayload.Department || '';
    const year       = rawPayload.year       || rawPayload.Year       || '';
    const tenantId   = rawPayload.tenantId   || '';
    const cohortId   = rawPayload.cohortId   || '';

    // ── Assessment / Test Identifiers ─────────────────────────────────────────
    // Canonical field is 'id' / 'assessmentId' (prioritize 'id')
    const assessmentId    = rawPayload.id || rawPayload.assessmentId || rawPayload.assessmentID || rawPayload.testID || '';
    const assessmentTitle = rawPayload.assessmentTitle || rawPayload.assessmentName || rawPayload.testName || rawPayload.name || '';
    const assessmentType  = rawPayload.assessmentType  || rawPayload.testType || rawPayload.type || 'mcq';
    const testId          = rawPayload.id || rawPayload.testId || rawPayload.testID || assessmentId;
    const courseId        = rawPayload.courseId        || '';
    const seriesId        = rawPayload.seriesId        || '';
    const assessmentVersion = rawPayload.assessmentVersion || '';

    // ── Attempt Identity ──────────────────────────────────────────────────────
    const attemptId = rawPayload.attemptId || (userId && assessmentId ? `${userId}_${assessmentId}` : '');

    // ── Timing ────────────────────────────────────────────────────────────────
    const startedAt   = rawPayload.startedAt   || rawPayload.timeStartedISO || rawPayload.startTimeISO || new Date().toISOString();
    const submittedAt = rawPayload.submittedAt  || rawPayload.submittedAtISO || new Date().toISOString();

    let timeTakenSeconds = rawPayload.timeTakenSeconds;
    if (typeof timeTakenSeconds !== 'number') {
        if (typeof rawPayload.timeTaken === 'number') {
            timeTakenSeconds = rawPayload.timeTaken;
        } else {
            timeTakenSeconds = Math.max(0, Math.round(
                (new Date(submittedAt).getTime() - new Date(startedAt).getTime()) / 1000
            ));
        }
    }

    // ── Submission ────────────────────────────────────────────────────────────
    const autoSubmitted    = Boolean(rawPayload.autoSubmitted);
    const submissionReason = rawPayload.submissionReason || (autoSubmitted ? (rawPayload.autoSubmitReason || 'timer_expired') : 'manual');
    const status           = rawPayload.status || 'submitted';

    // ── Scores ────────────────────────────────────────────────────────────────
    // Canonical: totalScore + maxScore
    const totalScore = typeof rawPayload.totalScore === 'number' ? rawPayload.totalScore
                     : (typeof rawPayload.score === 'number' ? rawPayload.score : 0);
    const maxScore   = typeof rawPayload.maxScore  === 'number' ? rawPayload.maxScore
                     : (typeof rawPayload.totalMarks === 'number' ? rawPayload.totalMarks
                     : (rawPayload.totalQuestions || 0));
    const percentage = typeof rawPayload.percentage === 'number' ? rawPayload.percentage
                     : (maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0);
    const passed     = typeof rawPayload.passed === 'boolean' ? rawPayload.passed
                     : (percentage >= (rawPayload.passMark || 50));

    const partialScore = typeof rawPayload.partialScore === 'number' ? rawPayload.partialScore : totalScore;
    const fullScore    = typeof rawPayload.fullScore    === 'number' ? rawPayload.fullScore
                       : (percentage >= 100 ? maxScore : 0);

    // ── Proctoring ────────────────────────────────────────────────────────────
    const violationCount       = typeof rawPayload.violationCount === 'number' ? rawPayload.violationCount : 0;
    const totalNoFace          = typeof rawPayload.totalNoFace === 'number' ? rawPayload.totalNoFace : 0;
    const totalMultipleFaces   = typeof rawPayload.totalMultipleFaces === 'number' ? rawPayload.totalMultipleFaces : 0;
    const violations           = Array.isArray(rawPayload.violations) ? rawPayload.violations : [];
    const proctorSummary       = rawPayload.proctorSummary || null;

    let violationTime = rawPayload.violationTime || '—';
    if (violationTime === '—' && violations.length > 0) {
        const firstV = violations[0];
        violationTime = firstV?.timestamp || firstV?.time || '—';
    }

    // ── Sections (canonical: array not object) ────────────────────────────────
    let sections = [];
    const rawSections = Array.isArray(rawPayload.sections)
        ? rawPayload.sections
        : (Array.isArray(rawPayload.sectionsArray) ? rawPayload.sectionsArray : null);

    if (rawSections && rawSections.length > 0) {
        sections = rawSections.map((sec) => {
            const secTime = typeof sec.timeTaken === 'number' ? sec.timeTaken : (sec.timeSpentSeconds || 0);
            const secM    = Math.floor(secTime / 60);
            const secS    = secTime % 60;
            return {
                sectionName:       sec.sectionName  || sec.name || 'Section',
                name:              sec.sectionName  || sec.name || 'Section',
                type:              sec.type || '',
                score:             typeof sec.score === 'number' ? sec.score : 0,
                maxScore:          typeof sec.maxScore    === 'number' ? sec.maxScore
                                 : (typeof sec.totalMarks === 'number' ? sec.totalMarks : 0),
                totalMarks:        typeof sec.totalMarks  === 'number' ? sec.totalMarks
                                 : (typeof sec.maxScore   === 'number' ? sec.maxScore   : 0),
                timeTaken:         secTime,
                timeSpentSeconds:  secTime,
                timeTakenFormatted: sec.timeTakenFormatted || `${secM}:${secS < 10 ? '0' : ''}${secS}`,
                startedAtISO:      sec.startedAtISO   || sec.startTimeISO || sec.startTimeISO || '',
                submittedAtISO:    sec.submittedAtISO || sec.endTimeISO   || '',
            };
        });
    } else if (rawPayload.sections && typeof rawPayload.sections === 'object' && !Array.isArray(rawPayload.sections)) {
        // sections stored as object map — convert to array
        sections = Object.entries(rawPayload.sections).map(([key, sec]) => {
            const secData = sec?.data || sec;
            const secTime = secData.timeSpentSeconds || secData.timeTaken || 0;
            const secM    = Math.floor(secTime / 60);
            const secS    = secTime % 60;
            return {
                sectionName:       sec.sectionName  || sec.name || key,
                name:              sec.sectionName  || sec.name || key,
                type:              sec.type || '',
                score:             secData.score || 0,
                maxScore:          secData.totalMarks || secData.totalQuestions || secData.maxScore || 0,
                totalMarks:        secData.totalMarks || secData.totalQuestions || secData.maxScore || 0,
                timeTaken:         secTime,
                timeSpentSeconds:  secTime,
                timeTakenFormatted: sec.timeTakenFormatted || `${secM}:${secS < 10 ? '0' : ''}${secS}`,
                startedAtISO:      secData.startTimeISO || sec.startTimeISO || '',
                submittedAtISO:    secData.endTimeISO   || sec.endTimeISO   || '',
            };
        });
    }

    // ── Spoken / Speech CEFR metrics ──────────────────────────────────────────
    let cefrLevel   = rawPayload.cefrLevel   || '';
    let cefrName    = rawPayload.cefrName    || '';
    let wpm         = typeof rawPayload.wpm         === 'number' ? rawPayload.wpm         : 0;
    let fillerCount = typeof rawPayload.fillerCount === 'number' ? rawPayload.fillerCount : 0;

    if (rawPayload.sections && typeof rawPayload.sections === 'object') {
        const vals = Array.isArray(rawPayload.sections)
            ? rawPayload.sections
            : Object.values(rawPayload.sections);
        const spokenSec = vals.find(
            (s) => s.type === 'spoken' || s.sectionName?.toLowerCase().includes('spoken') || s.sectionName?.toLowerCase().includes('speech')
        );
        const spokenData = spokenSec?.data || spokenSec;
        if (spokenData) {
            if (spokenData.cefrLevel)                   cefrLevel   = spokenData.cefrLevel;
            if (spokenData.cefrName)                    cefrName    = spokenData.cefrName;
            if (typeof spokenData.wpm         === 'number') wpm     = spokenData.wpm;
            if (typeof spokenData.fillerCount === 'number') fillerCount = spokenData.fillerCount;
        }
    }

    // ── MCQ Questions list ────────────────────────────────────────────────────
    const rawQList = Array.isArray(rawPayload.questions)        ? rawPayload.questions
                   : (Array.isArray(rawPayload.questionsDetails) ? rawPayload.questionsDetails : []);
    const questions = rawQList.map((q) => ({
        question:       q.question || q.questionText || q.text || '',
        selectedAnswer: q.selectedAnswer || '',
        correctAnswer:  q.correctAnswer  || '',
        isCorrect:      Boolean(q.isCorrect),
        topic:          q.topic || q.tag || 'General',
        difficulty:     q.difficulty || 'Medium',
        timeSpent:      typeof q.timeSpent === 'number' ? q.timeSpent : (q.timeSpentSeconds || 0),
    }));

    // ── Coding Submissions list ───────────────────────────────────────────────
    const rawCodingList = Array.isArray(rawPayload.codingSubmissions) ? rawPayload.codingSubmissions
                        : (Array.isArray(rawPayload.coding) ? rawPayload.coding : []);
    const codingSubmissions = rawCodingList.map((c, idx) => ({
        questionNumber: c.questionNumber || (idx + 1),
        problemTitle:   c.problemTitle   || c.title || `Problem ${idx + 1}`,
        language:       c.language || 'Python 3',
        status:         c.status || (c.testsPassed === c.totalTests ? 'Accepted' : 'Wrong Answer'),
        testsPassed:    typeof c.testsPassed === 'number' ? c.testsPassed : 0,
        totalTests:     typeof c.totalTests  === 'number' ? c.totalTests  : 0,
        totalScore:     typeof c.score       === 'number' ? c.score       : 0,
        maxScore:       typeof c.maxScore    === 'number' ? c.maxScore    : (c.totalTests || 0),
        timeTaken:      typeof c.timeTaken   === 'number' ? c.timeTaken   : (c.timeSpentSeconds || 0),
        scoringAuthority: c.scoring_authority || 'client_provisional',
    }));

    // ── Canonical output ──────────────────────────────────────────────────────
    return {
        // Identity
        userId,
        uid:         userId,
        email,
        displayName,
        rollNumber,
        college,
        department,
        year,
        tenantId,
        cohortId,

        // Assessment identifiers
        id: assessmentId,
        assessmentId,
        assessmentTitle,
        assessmentType,
        testId,
        courseId,
        seriesId,
        assessmentVersion,

        // Attempt
        attemptId,

        // Timing
        startedAt,
        submittedAt,
        timeTakenSeconds,

        // Submission
        autoSubmitted,
        submissionReason,
        status,

        // Scores (canonical names)
        totalScore,
        maxScore,
        percentage,
        passed,
        partialScore,
        fullScore,

        // Sections (canonical array)
        sections,

        // Proctoring
        violationCount,
        totalNoFace,
        totalMultipleFaces,
        violations,
        violationTime,
        proctorSummary,

        // Speech
        cefrLevel,
        cefrName,
        wpm,
        fillerCount,

        // Detail lists
        questions,
        codingSubmissions,

        // ── Backward-compatibility aliases ────────────────────────────────────
        // Legacy Admin/Staff dashboards may read these old field names.
        // New code MUST use the canonical names above.
        testID:          assessmentId,
        testName:        assessmentTitle,
        assessmentName:  assessmentTitle,
        assessmentID:    assessmentId,
        type:            assessmentType,
        testType:        assessmentType,
        score:           totalScore,
        totalMarks:      maxScore,
        submittedAtISO:  submittedAt,
        timeStartedISO:  startedAt,
        totalQuestions:  maxScore,
        correctAnswers:  totalScore,
        incorrectAnswers: Math.max(0, maxScore - totalScore),
        sectionsArray:   sections,
        name:            displayName,
    };
};
