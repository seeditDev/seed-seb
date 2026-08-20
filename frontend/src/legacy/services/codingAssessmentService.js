/**
 * @deprecated codingAssessmentService.js
 *
 * This service is DEPRECATED as of the One Assessment Module consolidation.
 * Coding is no longer a top-level assessment type — it is a section type within
 * the unified Assessment runtime (MultiSectionAssessment.jsx).
 *
 * All new result writes go to:
 *   assessmentResults/{tenantId}/{assessmentId}/{uid}
 * via assessmentSessionService.js and MultiSectionAssessment.jsx.
 *
 * This file is kept in place for historical reference only.
 * Do NOT call these methods from any new code.
 */
import { db, auth } from '../firebase-config';
import { doc, setDoc, getDoc, serverTimestamp, collection, getDocs, writeBatch } from 'firebase/firestore';
import timeService from './timeService';


class CodingAssessmentService {
    /**
     * Helper: compute partialScore and fullScore
     * partialScore  = actual earned score
     * fullScore     = totalMarks only if student scored 100% (all hidden tests passed), else 0
     */
    static computeScoreFields(score, totalMarks, percentage) {
        const partialScore = score || 0;
        const fullScore = (percentage >= 100 || (totalMarks > 0 && score >= totalMarks)) ? (totalMarks || 0) : 0;
        return { partialScore, fullScore };
    }

    /**
     * Canonical Firestore path — tenant-first scoped (4 segments).
     * assessmentResults/{tenantId}/{assessmentId}/{userId}
     */
    static canonicalPath(assessmentId, userId, tenantId = 'SEED-SEB') {
        const rawTid = String(tenantId || '').trim();
        const tid = (rawTid && !rawTid.includes(' ') && rawTid !== '_unknown_') ? rawTid : 'SEED-SEB';
        return `assessmentResults/${tid}/${assessmentId}/${userId}`;
    }


    /**
     * Write result to the single canonical path.
     *
     * assessmentResults/{tenantId}/{assessmentId}/{userId}
     *
     * This is the ONLY Firestore write on submission. No secondary mirrors.
     */
    static async writeCanonicalResult(payload, { assessmentId, userId, userProfile }) {
        let tenantId = payload.tenantId || userProfile?.tenantId || userProfile?.TenantId || userProfile?.tenant_id || userProfile?.collegeCode || '';
        if (!tenantId || tenantId.includes(' ')) {
            tenantId = 'SEED-SEB';
        }
        const canonRef = doc(db, this.canonicalPath(assessmentId, userId, tenantId));
        await setDoc(canonRef, { ...payload, id: assessmentId, assessmentId, userId, tenantId }, { merge: true });
        return this.canonicalPath(assessmentId, userId, tenantId);
    }

    /**
     * Check if student has already completed the coding assessment.
     * Checks v2 path first (using Firebase Auth UID), then v1 legacy paths.
     */
    static async checkExistingAttempt(email, assessmentID, college, year, department) {
        try {
            if (!navigator.onLine) {
                console.warn('[CodingAssessmentService] Client is offline');
                return { exists: false, data: null, completed: false, offline: true };
            }

            // CANONICAL: Firebase Auth UID is the identity for Firestore paths
            const uid = auth?.currentUser?.uid;

            // 1. Try canonical path with Firebase Auth UID
            if (uid) {
                try {
                    const tenantId = college || '_unknown_';
                    const v2Ref = doc(db, this.canonicalPath(assessmentID, uid, tenantId));
                    const v2Snap = await getDoc(v2Ref);
                    if (v2Snap.exists()) {
                        const data = v2Snap.data();
                        return {
                            exists: true,
                            data,
                            completed: data.completed === true || data.submitted === true || data.status === 'submitting' || data.status === 'submitted'
                        };
                    }
                } catch (e) { /* fall through */ }
            }

            return { exists: false, data: null, completed: false };
        } catch (error) {
            console.error('[CodingAssessmentService] Error checking existing attempt:', error);
            if (error.code === 'unavailable' || error.message?.includes('offline') || error.message?.includes('network')) {
                return { exists: false, data: null, completed: false, offline: true };
            }
            return { exists: false, data: null, completed: false, error: error.message };
        }
    }

    /**
     * @deprecated  The legacy `colleges/.../coding_results` path is never written
     *   by the current system. Returns empty. Use attemptStatusService.fetchCompletionMap().
     */
    static async fetchUserAttempts(email, college, year, department) {
        console.warn(
            '[CodingAssessmentService] fetchUserAttempts() is deprecated and returns empty. ' +
            'Use attemptStatusService.fetchCompletionMap() instead.'
        );
        return {};
    }

    /**
     * Create initial coding attempt document when coding starts
     */
    static async createInitialAttempt(userData, assessmentData) {
        try {
            const { Email, College, Year, Department, Name, "Roll Number": rollNumber } = userData;
            const assessmentID = assessmentData.id || assessmentData.testId || assessmentData.testID || assessmentData.assessmentId || 'unknown';

            // Check if already exists and is completed
            const existing = await this.checkExistingAttempt(Email, assessmentID, College, Year, Department);
            if (existing.exists && existing.completed) {
                throw new Error('DUPLICATE_SUBMISSION: Coding assessment already completed. Access is denied.');
            }

            const initialData = {
                id: assessmentID,
                assessmentId: assessmentID,
                assessmentID: assessmentID,
                testId: assessmentID,
                testID: assessmentID,
                rollNumber: rollNumber || '',
                name: Name || '',
                email: Email,
                college: College,
                year: Year,
                department: Department,
                assessmentName: assessmentData.name || assessmentData.title || 'Unknown Coding Assessment',
                timeStarted: serverTimestamp(),
                timeStartedISO: timeService.getNow().toISOString(),
                completed: false,
                submitted: false,
                status: 'started',
                type: 'coding',
                attempts: 1,
                from: 'student',
                createdAt: serverTimestamp()
            };

            const authData = JSON.parse(localStorage.getItem('auth_data') || '{}');
            const liveUid = auth?.currentUser?.uid || authData.uid || authData.UID || Email.replace(/[@.]/g, '_');
            let tenantId = authData.tenantId || authData.TenantId || authData.tenant_id || userData?.tenantId || authData.collegeCode || '';
            if (!tenantId || tenantId.includes(' ')) {
                tenantId = 'SEED-SEB';
            }

            const canonPath = await this.writeCanonicalResult(initialData, {
                assessmentId: assessmentID,
                userId: liveUid,
                userProfile: { ...userData, tenantId }
            });

            console.log('[CodingAssessmentService] Initial attempt created:', canonPath);
            return { success: true, docPath: canonPath };
        } catch (error) {
            console.warn('[CodingAssessmentService] Could not register attempt in Firestore (non-blocking):', error.message);
            return { success: false, error: error.message };
        }
    }


    /**
     * Mark attempt as submitting/completed to prevent tab refresh exploit
     */
    static async markAsSubmitting(email, assessmentID, college, year, department) {
        try {
            const update = {
                status: 'submitting',
                submittingAt: serverTimestamp(),
                submittingAtISO: timeService.getNow().toISOString()
            };
            const authData = JSON.parse(localStorage.getItem('auth_data') || '{}');
            const liveUid = auth?.currentUser?.uid || authData.uid || authData.UID || email.replace(/[@.]/g, '_');
            const tenantId = authData.tenantId || authData.TenantId || authData.tenant_id || college || '';
            const canonPath = await this.writeCanonicalResult(update, {
                assessmentId: assessmentID,
                userId: liveUid,
                userProfile: { ...authData, tenantId, email }
            });

            return true;
        } catch (error) {
            console.warn('[CodingAssessmentService] markAsSubmitting skipped (non-blocking):', error.message);
            return false;
        }
    }

    /**
     * Save result to Firestore — writes to canonical AssessmentResults path
     */
    static async saveResultToFirestore(resultData) {
        try {
            const {
                email,
                college,
                year,
                department,
                rollNumber,
                name,
                assessmentName,
                score,
                totalQuestions,
                correctAnswers,
                incorrectAnswers,
                percentage,
                timeTaken,
                timeStarted,
                timeEnded,
                autoSubmitted,
                autoSubmitReason,
                violations,
                violationCount,
                languageUsed,
                executionStats
            } = resultData;

            const targetId = resultData.id || resultData.testId || resultData.testID || resultData.assessmentId || resultData.assessmentID || 'unknown';
            const { partialScore, fullScore } = this.computeScoreFields(score, resultData.totalMarks || 0, percentage);

            const resultDocument = {
                id: targetId,
                assessmentId: targetId,
                assessmentID: targetId,
                testId: targetId,
                testID: targetId,
                rollNumber: rollNumber || '',
                name: name || '',
                email: email,
                college: college,
                year: year,
                department: department,
                assessmentName: assessmentName || 'Unknown Coding Assessment',
                type: 'coding',
                score: score || 0,
                totalQuestions: totalQuestions || 0,
                correctAnswers: correctAnswers || 0,
                incorrectAnswers: incorrectAnswers || 0,
                percentage: percentage || 0,
                partialScore,
                fullScore,
                timeTaken: timeTaken || 0,
                timeStarted: timeStarted || serverTimestamp(),
                timeStartedISO: resultData.timeStartedISO || timeService.getNow().toISOString(),
                timeEnded: timeEnded || serverTimestamp(),
                timeEndedISO: timeService.getNow().toISOString(),
                submittedAt: serverTimestamp(),
                submittedAtISO: timeService.getNow().toISOString(),
                completed: true,
                submitted: true,
                status: 'submitted',
                autoSubmitted: autoSubmitted || false,
                autoSubmitReason: autoSubmitReason || '',
                languageUsed: languageUsed || '',
                executionStats: executionStats || {},
                totalMarks: resultData.totalMarks || 0,
                coding: resultData.coding || [],
                violations: violations || [],
                violationCount: violationCount || 0,
                updatedAt: serverTimestamp()
            };

            const authData = JSON.parse(localStorage.getItem('auth_data') || '{}');
            const liveUid = auth?.currentUser?.uid || authData.uid || authData.UID || email.replace(/[@.]/g, '_');
            let tenantId = authData.tenantId || authData.TenantId || authData.tenant_id || resultData.tenantId || authData.collegeCode || '';
            if (!tenantId || tenantId.includes(' ')) {
                tenantId = 'SEED-SEB';
            }
            const canonPath = await this.writeCanonicalResult(resultDocument, {
                assessmentId: targetId,
                userId: liveUid,
                userProfile: { ...authData, tenantId, email }
            });
            console.log('[CodingAssessmentService] Result saved to canonical path:', canonPath);

            return { success: true, docId: canonPath };
        } catch (error) {
            console.error('[CodingAssessmentService] Error saving to Firestore:', error);
            throw error;
        }
    }


    /**
     * Complete submission (saves to Firestore)
     */
    static async submitCodingResult(resultData) {
        let firestoreOk = false;

        try {
            await this.saveResultToFirestore(resultData);
            firestoreOk = true;
        } catch (err) {
            console.warn('[CodingAssessmentService] Firestore submission failed (non-blocking):', err.message);
        }

        return { success: true, firestoreOk };
    }

    /**
     * Sync progress code backing up to Firestore during the assessment
     */
    static async syncProgress(progressData) {
        try {
            const {
                email,
                college,
                year,
                department,
                rollNumber,
                name,
                assessmentName,
                timeTaken,
                timeStarted,
                answers,
                codeMap
            } = progressData;

            const targetId = progressData.id || progressData.testId || progressData.testID || progressData.assessmentId || progressData.assessmentID || 'unknown';
            const authDataSync = JSON.parse(localStorage.getItem('auth_data') || '{}');
            const liveUid = auth?.currentUser?.uid || authDataSync.uid || authDataSync.UID || email.replace(/[@.]/g, '_');
            let tenantId = authDataSync.tenantId || authDataSync.TenantId || authDataSync.tenant_id || authDataSync.collegeCode || '';
            if (!tenantId || tenantId.includes(' ')) {
                tenantId = 'SEED-SEB';
            }
            const canonPath = this.canonicalPath(targetId, liveUid, tenantId);
            const canonRef = doc(db, canonPath);
            try {
                const docSnap = await getDoc(canonRef);
                if (docSnap.exists() && docSnap.data().completed) {
                    return { success: true, skipped: true };
                }
            } catch (e) { }

            const progressDocument = {
                id: targetId,
                assessmentId: targetId,
                assessmentID: targetId,
                testId: targetId,
                testID: targetId,
                rollNumber: rollNumber || '',
                name: name || '',
                email,
                college,
                year,
                department,
                assessmentName: assessmentName || 'Unknown Coding Assessment',
                type: 'coding',
                progressTimeTaken: timeTaken || 0,
                timeStarted: timeStarted || serverTimestamp(),
                timeStartedISO: progressData.timeStartedISO || timeService.getNow().toISOString(),
                lastProgressAt: serverTimestamp(),
                lastProgressAtISO: timeService.getNow().toISOString(),
                answers: answers || {},
                codeMap: codeMap || {},
                completed: false,
                submitted: false,
                status: 'in_progress',
                updatedAt: serverTimestamp()
            };

            await this.writeCanonicalResult(progressDocument, {
                assessmentId: targetId,
                userId: liveUid,
                userProfile: { ...authDataSync, tenantId, email }
            });

            return { success: true };
        } catch (error) {
            console.error('[CodingAssessmentService] Progress backup failed:', error);
            throw error;
        }
    }

    /**
     * Helper to format seconds into HH:MM:SS
     */
    static formatTime(seconds) {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return [
            hrs.toString().padStart(2, '0'),
            mins.toString().padStart(2, '0'),
            secs.toString().padStart(2, '0')
        ].join(':');
    }
}

export default CodingAssessmentService;
