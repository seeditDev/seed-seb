/**
 * tenantResultsService.js
 *
 * Writes a denormalized copy of each assessment result to:
 *   tenantResults/{tenantId}/results/{autoId}
 *
 * This powers the staff-scoped Reports dashboard — staff only read
 * their college's sub-collection instead of scanning all 5000+ results.
 *
 * Called non-blocking (fire-and-forget) after every assessment submit:
 *   - MSA:    autoSubmitEntireExam()
 *   - Coding: writeCanonicalResult()
 *   - MCQ:    Assessment.jsx handleSubmit()
 *
 * Failure never blocks the student submit flow.
 */

import { db } from '../firebase-config';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

/**
 * Write one result row to tenantResults/{tenantId}/results.
 *
 * @param {string}  tenantId   - College code (e.g. "KGKITE", "TN000001")
 * @param {object}  payload    - Flat result fields (see schema below)
 *
 * Schema:
 *   userId           string   - Firebase Auth UID or email-derived key
 *   email            string
 *   name             string
 *   rollNumber       string
 *   assessmentId     string   - same as assessmentResults doc ID
 *   assessmentName   string
 *   type             string   - "mcq" | "coding" | "msa" | "multisection"
 *   score            number   - earned marks
 *   totalMarks       number   - max possible marks
 *   percentage       number   - 0-100
 *   status           string   - "submitted" | "partial"
 *   timeTakenSeconds number
 *   submittedAt      Timestamp
 *   cohortId         string   - year/batch (e.g. "2" for 2nd year)
 *   department       string
 *   violationCount   number
 *   sourceRef        string   - canonical path for cross-reference
 */
export async function writeTenantResult(tenantId, payload) {
    if (!tenantId || !payload?.assessmentId) return; // guard
    try {
        const col = collection(db, 'tenantResults', tenantId, 'results');
        await addDoc(col, {
            ...payload,
            tenantId,
            submittedAt: serverTimestamp(),
            writtenAt: serverTimestamp(),
        });
    } catch (err) {
        // Non-fatal — student submit is not blocked by this failure
        console.warn('[tenantResultsService] Write failed (non-fatal):', err?.message);
    }
}

/**
 * Build the standard payload from auth + result data.
 * Call this once per submit then pass to writeTenantResult().
 *
 * @param {object} authData    - localStorage auth_data
 * @param {object} resultData  - assessment result (from writeCanonicalResult / MSA submit)
 * @returns {object}
 */
export function buildTenantResultPayload(authData, resultData) {
    const tenantId = authData?.tenantId || authData?.College || authData?.college || '';
    const userId   = authData?.uid || (authData?.Email || '').replace(/[@.]/g, '_');

    const score      = Number(resultData.score      ?? resultData.totalScore ?? 0);
    const totalMarks = Number(resultData.totalMarks ?? resultData.maxScore   ?? 0);
    const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 1000) / 10 : 0;

    return {
        tenantId,
        userId,
        email:            authData?.Email || '',
        name:             authData?.Name  || '',
        rollNumber:       authData?.['Roll Number'] || authData?.rollNumber || '',
        cohortId:         authData?.Year  || authData?.cohortId || '',
        department:       authData?.Department || authData?.department || '',
        assessmentId:     resultData.assessmentId  || resultData.testID || '',
        assessmentName:   resultData.assessmentName || resultData.testName || '',
        type:             resultData.type || 'mcq',
        score,
        totalMarks,
        percentage,
        status:           resultData.status || 'submitted',
        timeTakenSeconds: Number(resultData.timeTakenSeconds ?? resultData.timeTaken ?? 0),
        violationCount:   Number(resultData.violationCount   ?? 0),
        sourceRef:        resultData.sourceRef || `assessmentResults/${resultData.assessmentId || ''}/students/${userId}`,
    };
}
