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
    static canonicalPath(assessmentId, userId, tenantId = '_unknown_') {
        const tid = tenantId || '_unknown_';
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
        const tenantId = payload.tenantId || userProfile?.tenantId || userProfile?.College || userProfile?.college || '_unknown_';
        const canonRef = doc(db, this.canonicalPath(assessmentId, userId, tenantId));
        await setDoc(canonRef, { ...payload, userId, tenantId }, { merge: true });
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
            const assessmentID = assessmentData.id || 'unknown';

            // Check if already exists and is completed
            const existing = await this.checkExistingAttempt(Email, assessmentID, College, Year, Department);
            if (existing.exists && existing.completed) {
                throw new Error('DUPLICATE_SUBMISSION: Coding assessment already completed. Access is denied.');
            }

            const initialData = {
                rollNumber: rollNumber || '',
                name: Name || '',
                email: Email,
                college: College,
                year: Year,
                department: Department,
                assessmentID: assessmentID,
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

            const canonPath = await this.writeBothPaths(initialData, {
                assessmentID, college: College, year: Year, department: Department, email: Email
            });

            // Note: Supabase sync (coding_results / assessment_results tables) was removed.
            // Firestore at assessmentResults/{assessmentId}/students/{uid} is the single source of truth.

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
            // BUG FIXED: setting `completed: true` before the result existed
            // both locked the document under the new attempt-immutability rule
            // and left crashed submissions marked complete with no score.
            // `status: 'submitting'` already blocks the refresh re-attempt.
            const update = {
                status: 'submitting',
                submittingAt: serverTimestamp(),
                submittingAtISO: timeService.getNow().toISOString()
            };
            const canonPath = await this.writeBothPaths(update, {
                assessmentID, college, year, department, email
            });

            return true;
        } catch (error) {
            console.warn('[CodingAssessmentService] markAsSubmitting skipped (non-blocking):', error.message);
            return false;
        }
    }

    /**
     * Save result to Firestore — writes to canonical AssessmentResults path (primary)
     * and legacy colleges/... path (secondary for backward compat).
     */
    static async saveResultToFirestore(resultData) {
        try {
            const {
                email,
                college,
                year,
                department,
                assessmentID,
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

            const { partialScore, fullScore } = this.computeScoreFields(score, resultData.totalMarks || 0, percentage);

            const resultDocument = {
                rollNumber: rollNumber || '',
                name: name || '',
                email: email,
                college: college,
                year: year,
                department: department,
                assessmentID: assessmentID,
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

            // Canonical + legacy written atomically; see writeBothPaths.
            const canonPath = await this.writeBothPaths(resultDocument, {
                assessmentID, college, year, department, email
            });
            console.log('[CodingAssessmentService] Result saved atomically to:', canonPath);

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
                assessmentID,
                rollNumber,
                name,
                assessmentName,
                timeTaken,
                timeStarted,
                answers,
                codeMap
            } = progressData;

            // Derive userId the same way as writeCanonicalResult / checkExistingAttempt
            const authDataSync = JSON.parse(localStorage.getItem('auth_data') || '{}');
            const userId = authDataSync.uid || email.replace(/[@.]/g, '_');
            const canonPath = this.canonicalPath(assessmentID, userId);
            const canonRef = doc(db, canonPath);
            try {
                const docSnap = await getDoc(canonRef);
                if (docSnap.exists() && docSnap.data().completed) {
                    return { success: true, skipped: true };
                }
            } catch (e) { }

            const progressDocument = {
                rollNumber: rollNumber || '',
                name: name || '',
                email,
                college,
                year,
                department,
                assessmentID,
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

            await this.writeBothPaths(progressDocument, {
                assessmentID, college, year, department, email
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
