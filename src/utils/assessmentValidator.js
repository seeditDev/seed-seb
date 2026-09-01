/**
 * assessmentValidator.js
 *
 * Validates a CDN-loaded assessment payload against the Test document
 * resolved from Firestore (courses/{courseId}/series/{seriesId}/tests/{testId}).
 *
 * This guards against Scenario 5 (Wrong Test):
 *   Test document: assessmentId = A, cdnUrl → payload.assessmentId = B
 *   → SEB must reject and show configuration error. Never silently start.
 *
 * Called BEFORE creating an attempt or starting any assessment session.
 */


// ─────────────────────────────────────────────────────────────────────────────
// Supported assessment types
// ─────────────────────────────────────────────────────────────────────────────

const KNOWN_TYPES = new Set(['mcq', 'coding', 'sea', 'spoken-english', 'msa']);

const MCQ_REQUIRED_PAYLOAD_FIELDS     = ['questions'];
const CODING_REQUIRED_PAYLOAD_FIELDS  = ['questions'];
const MSA_REQUIRED_PAYLOAD_FIELDS     = ['sections'];


// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the assessment ID from a CDN payload in a tolerant way.
 * CDN payloads use different field names depending on who generated them.
 *
 * @param {object} payload
 * @returns {string}
 */
function resolvePayloadAssessmentId(payload) {
    // Prefer assessmentId; fall back to id (both field names appear across CDN
    // payload versions). Returns empty string if neither is present.
    return payload?.assessmentId ?? payload?.id ?? '';
}

/**
 * Resolve the assessment type from a CDN payload.
 *
 * @param {object} payload
 * @returns {string}
 */
function resolvePayloadType(payload) {
    return (
        payload?.assessmentType ||
        payload?.type           || (payload?.assessmentType  ?? '')
    ).toLowerCase();
}


// ─────────────────────────────────────────────────────────────────────────────
// Main validator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a CDN-loaded assessment payload against the resolved Test document.
 *
 * Returns { valid: true } if all checks pass.
 * Returns { valid: false, errors: string[], configurationError: true } if any check fails.
 *
 * SCENARIO 5 (WRONG TEST): if testDoc.assessmentId ≠ payload.assessmentId → FAIL.
 *
 * @param {import('../../lib/firestore/courses').TestDoc} testDoc
 *   The Firestore Test document (from courses/.../tests/{testId}).
 * @param {object} assessmentPayload
 *   The object loaded from testDoc.cdnUrl (JSON parsed).
 * @returns {{ valid: boolean, errors: string[], warnings: string[], configurationError?: boolean }}
 */
export function validateAssessmentPayload(testDoc, assessmentPayload) {
    const errors   = [];
    const warnings = [];

    // ── 1. Test document integrity ────────────────────────────────────────────
    if (!testDoc) {
        errors.push('Test document is null or undefined.');
        return { valid: false, errors, warnings, configurationError: true };
    }

    if (!testDoc.id) {
        errors.push('Test document is missing required field: id');
    }

    if (!testDoc.assessmentId) {
        errors.push(
            `Test document (${testDoc.id ?? ''}) is missing required field: assessmentId. ` +
            'The Admin must set an assessmentId before this test can be started.'
        );
    }

    if (!testDoc.cdnUrl) {
        errors.push(
            `Test document (${testDoc.id ?? ''}) is missing required field: cdnUrl. ` +
            'The Admin must publish an assessment before this test can be started.'
        );
    }

    if (errors.length > 0) {
        return { valid: false, errors, warnings, configurationError: true };
    }

    // ── 2. Payload presence ───────────────────────────────────────────────────
    if (!assessmentPayload || typeof assessmentPayload !== 'object') {
        errors.push('Assessment payload is null, undefined, or not an object.');
        return { valid: false, errors, warnings, configurationError: true };
    }

    // ── 3. Assessment ID cross-check (SCENARIO 5 — WRONG TEST) ───────────────
    // HARD FAILURE: if the CDN payload's assessmentId does not match the Firestore
    // testDoc.assessmentId, we must not start the assessment. A wrong payload
    // could silently serve a different assessment's questions or answer keys.
    const payloadId = resolvePayloadAssessmentId(assessmentPayload);
    const testDocId = testDoc.assessmentId;

    if (!payloadId) {
        // No assessmentId field in payload — this is a configuration error.
        // An admin-published payload must always carry its own ID.
        errors.push(
            `ID_MISSING: Assessment payload loaded from "${testDoc.cdnUrl}" has no assessmentId field. ` +
            'The Admin must re-publish the assessment file with a valid assessmentId before launch.'
        );
    } else if (payloadId !== testDocId) {
        // Normalise for comparison to catch minor casing/punctuation differences
        // (e.g. "Asm_Alpha_1" vs "asm-alpha-1"), but a full mismatch is still
        // a hard error — we do NOT proceed with a mismatched payload.
        const normP = String(payloadId).toLowerCase().replace(/[^a-z0-9]/g, '');
        const normT = String(testDocId).toLowerCase().replace(/[^a-z0-9]/g, '');
        const isTolerantMatch = normP === normT;

        if (!isTolerantMatch) {
            errors.push(
                `ID_MISMATCH: CDN payload assessmentId "${payloadId}" does not match ` +
                `testDoc.assessmentId "${testDocId}". ` +
                'Refusing to launch to prevent serving a wrong assessment. ' +
                'An Admin must update the test document cdnUrl to point to the correct payload.'
            );
        } else {
            // Normalisation-only mismatch (casing/punctuation) — warn, allow.
            warnings.push(
                `ID_CASE_MISMATCH: Payload assessmentId "${payloadId}" matches testDoc assessmentId ` +
                `"${testDocId}" after normalisation. Proceeding.`
            );
        }
    }

    if (errors.length > 0) {
        return { valid: false, errors, warnings, configurationError: true };
    }

    // ── 4. Type compatibility ─────────────────────────────────────────────────
    const testDocType  = (testDoc.type ?? '').toLowerCase();
    const payloadType  = resolvePayloadType(assessmentPayload);

    if (testDocType && payloadType && testDocType !== payloadType) {
        // Allow msa → section type mismatch (MSA tests contain mixed-type sections)
        if (testDocType !== 'msa') {
            errors.push(
                `TYPE_MISMATCH: Test document type is "${testDocType}" ` +
                `but payload type is "${payloadType}". ` +
                'Ensure the correct assessment file is linked to this test.'
            );
        }
    }

    if (testDocType && !KNOWN_TYPES.has(testDocType)) {
        warnings.push(`Test document type "${testDocType}" is not a recognised assessment type.`);
    }

    // ── 5. Duration / marks compatibility ─────────────────────────────────────
    if (testDoc.duration_minutes != null && testDoc.duration_minutes <= 0) {
        errors.push(`Test document has invalid duration_minutes: ${testDoc.duration_minutes}. Must be > 0.`);
    }

    if (testDoc.maxScore != null && testDoc.maxScore <= 0) {
        warnings.push(`Test document has totalMarks = ${testDoc.maxScore}. This may cause scoring issues.`);
    }

    // ── 6. Required payload content by type ───────────────────────────────────
    const effectiveType = testDocType || payloadType;

    if (effectiveType === 'mcq') {
        const hasMcqContent =
            (Array.isArray(assessmentPayload.questions) && assessmentPayload.questions.length > 0) ||
            (Array.isArray(assessmentPayload.questionIds) && assessmentPayload.questionIds.length > 0) ||
            (Array.isArray(testDoc.questionIds) && testDoc.questionIds.length > 0) ||
            (Array.isArray(testDoc.questions) && testDoc.questions.length > 0);
        if (!hasMcqContent) {
            errors.push('MCQ payload is missing required content: "questions" (empty or absent).');
        }
    } else if (effectiveType === 'coding') {
        const hasCodingContent =
            (Array.isArray(assessmentPayload.questions)       && assessmentPayload.questions.length > 0)       ||
            (Array.isArray(assessmentPayload.codingQuestions) && assessmentPayload.codingQuestions.length > 0) ||
            (Array.isArray(assessmentPayload.challenges)      && assessmentPayload.challenges.length > 0)      || // Admin Hub StaffCodingCreator format
            (Array.isArray(assessmentPayload.questionIds)     && assessmentPayload.questionIds.length > 0)     ||
            (Array.isArray(assessmentPayload.items)           && assessmentPayload.items.length > 0)           ||
            (Array.isArray(testDoc.questionIds)               && testDoc.questionIds.length > 0)               ||
            (Array.isArray(testDoc.questions)                 && testDoc.questions.length > 0)                 ||
            Boolean(
                assessmentPayload.problemStatement || assessmentPayload.statement ||
                assessmentPayload.title            || assessmentPayload.sampleTestCases ||
                assessmentPayload.testCases        || assessmentPayload.question || assessmentPayload.code
            );

        if (!hasCodingContent) {
            errors.push('Coding payload is missing required content: "questions" or coding problem specification (empty or absent).');
        }
    } else if (effectiveType === 'msa') {
        // MSA: either top-level sections or individual section payloads
        if (!assessmentPayload.sections && !assessmentPayload.questions && !testDoc.sections?.length) {
            warnings.push('MSA payload has no sections or questions. Check Admin Hub configuration.');
        }
    }


    // ── 7. Schedule validity (Scenario 7: archived, Scenario 8: expired) ──────
    if (testDoc.schedule) {
        const { startDate, endDate } = parseScheduleWindow(testDoc.schedule);
        const now = new Date();

        if (startDate && now < startDate) {
            errors.push(
                `SCHEDULE_NOT_STARTED: The test is scheduled to start on ${startDate.toLocaleDateString()} at ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. ` +
                'This test cannot be started before its scheduled start time.'
            );
        }

        if (endDate && now > endDate) {
            errors.push(
                `SCHEDULE_EXPIRED: The test schedule ended on ${endDate.toLocaleDateString()} at ${endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. ` +
                'This test cannot be started after its scheduled end time.'
            );
        }
    }

    // ── Result ────────────────────────────────────────────────────────────────
    if (errors.length > 0) {
        return { valid: false, errors, warnings, configurationError: true };
    }

    return { valid: true, errors: [], warnings };
}


/**
 * Validate that an MSA's sections array is correctly configured BEFORE
 * navigating to the MultiSectionAssessment route.
 *
 * Called in StudentDashboard.jsx launchAssessment() for all MSA-type assessments.
 * Returns specific per-section errors — never a generic "mismatch" message.
 *
 * @param {Array<{sectionId: string, name: string, type: string, cdnUrl: string, duration_minutes: number, totalMarks?: number}>} sections
 * @param {object} [testDoc]  — Optional parent test document for context in error messages.
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateMSASections(sections, testDoc = null) {
    const errors   = [];
    const warnings = [];
    const testName = testDoc?.name || testDoc?.id || 'this MSA assessment';

    if (!Array.isArray(sections) || sections.length === 0) {
        errors.push(
            `MSA configuration error: "${testName}" has no sections. ` +
            'An Admin must add at least one section (MCQ or Coding) before this test can be started.'
        );
        return { valid: false, errors, warnings };
    }

    const VALID_TYPES = new Set(['mcq', 'coding', 'sea', 'spoken-english']);

    sections.forEach((sec, idx) => {
        const secLabel = sec.name
            ? `Section ${idx + 1} ("${sec.name}")`
            : `Section ${idx + 1}`;

        // Required: sectionId
        if (!sec.sectionId) {
            errors.push(`${secLabel}: missing sectionId. Contact your administrator.`);
        }

        // Required: type
        if (!sec.type) {
            errors.push(`${secLabel}: missing section type (expected "mcq", "coding", or "sea").`);
        } else if (!VALID_TYPES.has(sec.type.toLowerCase())) {
            errors.push(
                `${secLabel}: unrecognised type "${sec.type}". ` +
                'Expected "mcq", "coding", or "sea".'
            );
        }

        // Required: cdnUrl — must be set and end with .json or be a valid URL
        if (!sec.cdnUrl || sec.cdnUrl.trim() === '') {
            errors.push(
                `${secLabel}: missing content URL (cdnUrl). ` +
                'An Admin must link a content file to this section before the test can be started.'
            );
        }

        // Required: positive duration
        if (sec.duration_minutes == null || sec.duration_minutes <= 0) {
            errors.push(
                `${secLabel}: invalid duration (${sec.duration_minutes} min). ` +
                'Duration must be greater than 0.'
            );
        }

        // Warning: zero marks
        if (sec.maxScore != null && sec.maxScore <= 0) {
            warnings.push(
                `${secLabel}: totalMarks is ${sec.maxScore}. ` +
                'This section will not contribute to the overall score.'
            );
        }
    });

    if (errors.length > 0) {
        return { valid: false, errors, warnings };
    }

    return { valid: true, errors: [], warnings };
}



/**
 * Validate that a Test document's required fields are present BEFORE fetching
 * its CDN payload. This is a lightweight pre-flight check.
 *
 * Catches:
 *   - Scenario 7 (Archived Test): testDoc has no assessmentId or cdnUrl
 *   - Missing configuration before a network fetch is attempted
 *
 * @param {import('../../lib/firestore/courses').TestDoc|null} testDoc
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateTestDoc(testDoc) {
    const errors = [];

    if (!testDoc) {
        errors.push('Test not found. It may have been removed or is not assigned to your cohort.');
        return { valid: false, errors };
    }

    if (!testDoc.id) {
        errors.push('Test document is missing its ID.');
    }

    if (!testDoc.assessmentId) {
        errors.push('Test is not yet configured: missing assessmentId. Please contact your administrator.');
    }

    if (!testDoc.cdnUrl) {
        errors.push('Test is not yet configured: missing cdnUrl. Please contact your administrator.');
    }

    if (!testDoc.duration_minutes || testDoc.duration_minutes <= 0) {
        errors.push(`Test has an invalid duration: ${testDoc.duration_minutes} minutes. Please contact your administrator.`);
    }

    if (!testDoc.type || !KNOWN_TYPES.has(testDoc.type.toLowerCase())) {
        errors.push(`Test has an unrecognised type: "${testDoc.type}". Please contact your administrator.`);
    }

    return { valid: errors.length === 0, errors };
}


/**
 * Validate that a student is permitted to START a specific test.
 *
 * Scenario 6 (Wrong Cohort): testId not in student's allowedModules → blocked.
 * Scenario 8 (Expired):      schedule.end in the past → blocked.
 *
 * @param {string} testId
/**
 * Parses schedule fields into start and end Date objects regardless of format.
 * Supports:
 * - { startDate: "YYYY-MM-DD", startTime: "HH:mm", endDate: "YYYY-MM-DD", endTime: "HH:mm" }
 * - { start: "ISO-String", end: "ISO-String" }
 * - Firestore Timestamps
 */
export function parseScheduleWindow(schedule) {
    if (!schedule) return { startDate: null, endDate: null };

    let startDate = null;
    let endDate = null;

    // 1. Start parsing
    if (schedule.start) {
        startDate = schedule.start.toDate ? schedule.start.toDate() : new Date(schedule.start);
    } else if (schedule.startDate) {
        if (schedule.startDate.toDate) {
            startDate = schedule.startDate.toDate();
        } else if (typeof schedule.startDate === "string" && schedule.startDate.trim()) {
            const timeStr = schedule.startTime && schedule.startTime.trim() ? schedule.startTime.trim() : "00:00:00";
            startDate = new Date(`${schedule.startDate.trim()}T${timeStr}`);
            if (isNaN(startDate.getTime())) {
                startDate = new Date(schedule.startDate.trim());
            }
        }
    } else if (schedule.scheduledStart) {
        startDate = schedule.scheduledStart.toDate ? schedule.scheduledStart.toDate() : new Date(schedule.scheduledStart);
    }

    // 2. End parsing
    if (schedule.end) {
        endDate = schedule.end.toDate ? schedule.end.toDate() : new Date(schedule.end);
    } else if (schedule.endDate) {
        if (schedule.endDate.toDate) {
            endDate = schedule.endDate.toDate();
        } else if (typeof schedule.endDate === "string" && schedule.endDate.trim()) {
            const timeStr = schedule.endTime && schedule.endTime.trim() ? schedule.endTime.trim() : "23:59:59";
            endDate = new Date(`${schedule.endDate.trim()}T${timeStr}`);
            if (isNaN(endDate.getTime())) {
                endDate = new Date(schedule.endDate.trim());
            }
        }
    } else if (schedule.scheduledEnd) {
        endDate = schedule.scheduledEnd.toDate ? schedule.scheduledEnd.toDate() : new Date(schedule.scheduledEnd);
    }

    return {
        startDate: startDate && !isNaN(startDate.getTime()) ? startDate : null,
        endDate: endDate && !isNaN(endDate.getTime()) ? endDate : null,
    };
}

/**
 * Validate that a student is permitted to START a specific test.
 *
 * Scenario 6 (Wrong Cohort): testId not in student's allowedModules → blocked.
 * Scenario 8 (Expired):      schedule.endDate in the past → blocked.
 * Scenario 9 (Not started):  schedule.startDate in the future → blocked.
 *
 * @param {string} testId
 * @param {string} courseId
 * @param {string} seriesId
 * @param {string[]} allowedModules — cohort.allowedModules (format: "courseId::seriesId::testId")
 * @param {object} [schedule]       — testDoc.schedule
 * @returns {{ allowed: boolean, reason: string }}
 */
export function validateStudentTestAccess(testId, courseId, seriesId, allowedModules, schedule) {
    // Scenario 6: Cohort assignment check
    if (courseId && seriesId && Array.isArray(allowedModules) && allowedModules.length > 0) {
        const expectedKey = `${courseId}::${seriesId}::${testId}`;
        const hasDirect = allowedModules.includes(expectedKey);
        const hasLegacy = allowedModules.includes(testId);
        if (!hasDirect && !hasLegacy) {
            return {
                allowed: false,
                reason: `This test is not assigned to your cohort. (Expected key: ${expectedKey})`
            };
        }
    }

    // Scenario 8 & 9: Schedule check
    if (schedule) {
        const { startDate, endDate } = parseScheduleWindow(schedule);
        const now = new Date();

        if (startDate && now < startDate) {
            return {
                allowed: false,
                reason: `This test has not started yet. It is scheduled to start on ${startDate.toLocaleDateString()} at ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
            };
        }

        if (endDate && now > endDate) {
            return {
                allowed: false,
                reason: `This test schedule has expired. The access window closed on ${endDate.toLocaleDateString()} at ${endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
            };
        }
    }

    return { allowed: true, reason: '' };
}
