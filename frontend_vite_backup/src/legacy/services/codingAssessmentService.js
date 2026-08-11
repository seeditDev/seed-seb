import { db } from '../firebase-config';
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
     * Canonical Firestore path for a coding assessment result.
     * AssessmentResults/{assessmentID}/colleges/{college}/years/{year}/students/{email}
     */
    static canonicalPath(assessmentID, college, year, email) {
        return `AssessmentResults/${assessmentID}/colleges/${college}/years/${year}/students/${email}`;
    }

    /**
     * Legacy student-centric path (kept for backward compat / duplicate-detection).
     */
    static legacyPath(college, year, department, email, assessmentID) {
        return `colleges/${college}/years/${year}/departments/${department}/students/${email}/coding_results/${assessmentID}`;
    }

    /**
     * Atomic canonical + legacy write.
     *
     * BUG FIXED (P0 divergent results): each write path issued two sequential
     * `setDoc` calls with the legacy one wrapped in a silent try/catch, so a
     * dropped connection between them left the two copies of an attempt holding
     * different scores. A batch commits both or neither, in one round trip.
     */
    static async writeBothPaths(payload, { assessmentID, college, year, department, email }) {
        const canonPath = this.canonicalPath(assessmentID, college, year, email);
        const batch = writeBatch(db);
        batch.set(doc(db, canonPath), payload, { merge: true });
        if (college && year && department && email && assessmentID) {
            batch.set(doc(db, this.legacyPath(college, year, department, email, assessmentID)), payload, { merge: true });
        }
        await batch.commit();
        return canonPath;
    }

    /**
     * Check if student has already completed the coding assessment
     * Reads from canonical AssessmentResults path, falls back to legacy path.
     */
    static async checkExistingAttempt(email, assessmentID, college, year, department) {
        try {
            if (!navigator.onLine) {
                console.warn('[CodingAssessmentService] Client is offline, cannot check existing attempt');
                return { exists: false, data: null, completed: false, offline: true };
            }

            // 1. Try canonical path first
            const canonPath = this.canonicalPath(assessmentID, college, year, email);
            const canonRef = doc(db, canonPath);
            try {
                const canonSnap = await getDoc(canonRef);
                if (canonSnap.exists()) {
                    const data = canonSnap.data();
                    return {
                        exists: true,
                        data: data,
                        completed: data.completed === true || data.submitted === true || data.status === 'submitting' || data.status === 'submitted'
                    };
                }
            } catch (e) { /* fall through to legacy */ }

            // 2. Fall back to legacy path
            const legPath = this.legacyPath(college, year, department, email, assessmentID);
            const legRef = doc(db, legPath);
            const legSnap = await getDoc(legRef);

            if (legSnap.exists()) {
                const data = legSnap.data();
                return {
                    exists: true,
                    data: data,
                    completed: data.completed === true || data.submitted === true || data.status === 'submitting' || data.status === 'submitted'
                };
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
     * Fetch all coding assessment attempts for a student
     */
    static async fetchUserAttempts(email, college, year, department) {
        try {
            if (!navigator.onLine) {
                console.warn('[CodingAssessmentService] Client is offline, cannot fetch user attempts');
                return {};
            }

            // Try legacy path first for backward compat
            const colPath = `colleges/${college}/years/${year}/departments/${department}/students/${email}/coding_results`;
            const colRef = collection(db, colPath);
            const querySnapshot = await getDocs(colRef);
            
            const attemptsMap = {};
            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                attemptsMap[docSnap.id] = {
                    completed: data.completed === true || data.submitted === true || data.status === 'submitting' || data.status === 'submitted',
                    score: data.score || 0,
                    percentage: data.percentage || 0,
                    data: data
                };
            });
            return attemptsMap;
        } catch (error) {
            console.error('[CodingAssessmentService] Error fetching user attempts:', error);
            return {};
        }
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

            // Write initial status to Supabase coding_results table
            try {
                const { error: supabaseError } = await safeUpsert('coding_results', {
                        roll_number: rollNumber || '',
                        name: Name || '',
                        email: Email,
                        college: College,
                        year: Year,
                        department: Department,
                        test_id: assessmentID,
                        test_name: initialData.assessmentName,
                        score: 0,
                        total_questions: Array.isArray(assessmentData.questions) ? assessmentData.questions.length : (parseInt(assessmentData.questions, 10) || 0),
                        correct_answers: 0,
                        incorrect_answers: 0,
                        percentage: 0,
                        partial_score: 0,
                        full_score: 0,
                        status: 'started',
                        time_taken: 0,
                        time_started: initialData.timeStartedISO,
                        updated_at: new Date().toISOString()
                    }, {
                        onConflict: 'email,test_id'
                    });
                if (supabaseError) throw supabaseError;
            } catch (supabaseErr) {
                console.warn('[CodingAssessmentService] Supabase coding_results initial attempt insert failed:', supabaseErr.message);
            }

            // Also write initial 'started' status to unified assessment_results table
            try {
                const { error: arErr } = await safeUpsert('assessment_results', {
                        type: 'coding',
                        test_id: assessmentID,
                        test_name: initialData.assessmentName,
                        roll_number: rollNumber || '',
                        name: Name || '',
                        email: Email,
                        college: College,
                        year: Year,
                        department: Department,
                        score: 0,
                        total_questions: Array.isArray(assessmentData.questions) ? assessmentData.questions.length : (parseInt(assessmentData.questions, 10) || 0),
                        correct_answers: 0,
                        incorrect_answers: 0,
                        percentage: 0,
                        partial_score: 0,
                        full_score: 0,
                        status: 'started',
                        time_taken: 0,
                        time_started: initialData.timeStartedISO,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'email,test_id,type' });
                if (arErr) console.warn('[CodingAssessmentService] assessment_results initial insert failed (non-blocking):', arErr.message);
            } catch (arEx) {
                console.warn('[CodingAssessmentService] assessment_results initial exception:', arEx.message);
            }

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

            // Check canonical path to ensure we don't overwrite completed status
            const canonPath = this.canonicalPath(assessmentID, college, year, email);
            const canonRef = doc(db, canonPath);
            try {
                const docSnap = await getDoc(canonRef);
                if (docSnap.exists() && docSnap.data().completed) {
                    return { success: true, skipped: true };
                }
            } catch (e) {}

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
