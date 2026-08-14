/**
 * tenantResultsService.js
 *
 * Writes a denormalized copy of each assessment result to:
 *   tenantResults/{tenantId}/{assessmentId}/{userId}
 *
 * Path structure change (v3):
 *   OLD: tenantResults/{tenantId}/results/{autoId}     ← addDoc, flat list
 *   NEW: tenantResults/{tenantId}/{assessmentId}/{userId} ← setDoc, keyed by userId
 *
 * Benefits:
 *   - Admins can query a specific assessment directly: collection(db, 'tenantResults', tid, assessmentId)
 *   - setDoc prevents duplicate rows per student per assessment
 *   - Assessment filter in Reports dashboard works natively
 *
 * Failure never blocks the student submit flow.
 */

import { db } from '../firebase-config';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Write one result row to tenantResults/{tenantId}/{assessmentId}/{userId}.
 *
 * @param {string}  tenantId     - College code (e.g. "KGKITE", "TN000001")
 * @param {string}  assessmentId - Assessment ID (same as assessmentResults doc ID)
 * @param {string}  userId       - Firebase Auth UID (used as doc key — prevents duplicates)
 * @param {object}  payload      - Flat result fields (see schema below)
 *
 * Schema:
 *   userId           string   - Firebase Auth UID
 *   email            string
 *   name             string
 *   rollNumber       string
 *   assessmentId     string
 *   assessmentName   string
 *   type             string   - "mcq" | "coding" | "msa" | "multisection"
 *   score            number   - earned marks
 *   totalMarks       number   - max possible marks
 *   percentage       number   - 0-100
 *   status           string   - "submitted" | "partial"
 *   timeTakenSeconds number
 *   submittedAt      Timestamp
 *   cohortId         string
 *   department       string
 *   violationCount   number
 *   sourceRef        string   - canonical path for cross-reference
 */
export async function writeTenantResult(tenantId, assessmentId, userId, payload) {
    if (!tenantId || !assessmentId || !userId) return; // guard
    try {
        const docRef = doc(db, 'tenantResults', tenantId, assessmentId, userId);
        await setDoc(docRef, {
            ...payload,
            tenantId,
            assessmentId,
            userId,
            submittedAt: serverTimestamp(),
            writtenAt: serverTimestamp(),
        }, { merge: true });
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
