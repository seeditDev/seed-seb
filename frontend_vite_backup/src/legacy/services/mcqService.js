import { db } from '../firebase-config';
import { doc, setDoc, getDoc, serverTimestamp, collection, getDocs, writeBatch } from 'firebase/firestore';
import timeService from './timeService';


class MCQService {
    /**
     * Compute partialScore and fullScore from result data.
     * partialScore = actual score earned.
     * fullScore    = totalMarks only if 100% achieved, else 0.
     */
    static computeScoreFields(score, totalMarks, percentage) {
        const partialScore = score || 0;
        const fullScore = (percentage >= 100 || (totalMarks > 0 && score >= totalMarks)) ? (totalMarks || 0) : 0;
        return { partialScore, fullScore };
    }

    /** Canonical centralized Firestore path. */
    static canonicalPath(testID, college, year, email) {
        return `AssessmentResults/${testID}/colleges/${college}/years/${year}/students/${email}`;
    }

    /** Legacy student-centric path (kept for duplicate detection + backward compat). */
    static legacyPath(college, year, department, email, testID) {
        return `colleges/${college}/years/${year}/departments/${department}/students/${email}/mcq_results/${testID}`;
    }

    /**
     * Write the same payload to the canonical and legacy locations ATOMICALLY.
     *
     * BUG FIXED (P0 divergent results): every write path did
     * `await setDoc(canonical)` followed by a separate `await setDoc(legacy)`
     * wrapped in a swallow-everything try/catch. On a flaky exam-hall network
     * the first write could land and the second fail silently, leaving the two
     * copies of the same attempt with different scores — and the dashboard read
     * whichever one it found first. A batch either commits both or neither, and
     * it costs one round trip instead of two.
     */
    static async writeBothPaths(payload, { testID, college, year, department, email }) {
        const canonPath = this.canonicalPath(testID, college, year, email);
        const batch = writeBatch(db);
        batch.set(doc(db, canonPath), payload, { merge: true });
        if (college && year && department && email && testID) {
            batch.set(doc(db, this.legacyPath(college, year, department, email, testID)), payload, { merge: true });
        }
        await batch.commit();
        return canonPath;
    }

    /**
     * Check if student has already attempted the test
     * @param {string} email - Student email
     * @param {string} testID - Test ID
     * @param {string} college - College name
     * @param {string} year - Academic year
     * @param {string} department - Department name
     * @returns {Promise<{exists: boolean, data: object|null}>}
     */
    static async checkExistingAttempt(email, testID, college, year, department) {
        try {
            if (!navigator.onLine) {
                console.warn('[MCQService] Client is offline, cannot check existing attempt');
                return { exists: false, data: null, completed: false, offline: true };
            }

            // 1. Try canonical AssessmentResults path first
            try {
                const canonRef = doc(db, this.canonicalPath(testID, college, year, email));
                const canonSnap = await getDoc(canonRef);
                if (canonSnap.exists()) {
                    const data = canonSnap.data();
                    return {
                        exists: true,
                        data,
                        completed: data.completed === true || data.submitted === true || data.status === 'submitting' || data.status === 'submitted'
                    };
                }
            } catch (e) { /* fall through to legacy */ }

            // 2. Fall back to legacy student-centric path
            const legRef = doc(db, this.legacyPath(college, year, department, email, testID));
            const legSnap = await getDoc(legRef);
            if (legSnap.exists()) {
                const data = legSnap.data();
                return {
                    exists: true,
                    data,
                    completed: data.completed === true || data.submitted === true || data.status === 'submitting' || data.status === 'submitted'
                };
            }

            return { exists: false, data: null, completed: false };
        } catch (error) {
            console.error('[MCQService] Error checking existing attempt:', error);
            if (error.code === 'unavailable' || error.message?.includes('offline') || error.message?.includes('network')) {
                return { exists: false, data: null, completed: false, offline: true };
            }
            return { exists: false, data: null, completed: false, error: error.message };
        }
    }

    /**
     * Fetch all MCQ attempts/results for a student
     * @param {string} email - Student email
     * @param {string} college - College name
     * @param {string} year - Academic year
     * @param {string} department - Department name
     * @returns {Promise<object>} Map of testID -> attempt data
     */
    static async fetchUserAttempts(email, college, year, department) {
        try {
            if (!navigator.onLine) {
                console.warn('[MCQService] Client is offline, cannot fetch user attempts');
                return {};
            }

            const colPath = `colleges/${college}/years/${year}/departments/${department}/students/${email}/mcq_results`;
            const colRef = collection(db, colPath);
            const querySnapshot = await getDocs(colRef);
            
            const attemptsMap = {};
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                attemptsMap[doc.id] = {
                    completed: data.completed === true || data.submitted === true || data.status === 'submitting' || data.status === 'submitted',
                    percentage: data.percentage || 0,
                    correctAnswers: data.correctAnswers || 0,
                    totalQuestions: data.totalQuestions || 0,
                    data: data
                };
            });
            return attemptsMap;
        } catch (error) {
            console.error('[MCQService] Error fetching user attempts:', error);
            return {};
        }
    }

    /**
     * Create initial test attempt document when test starts
     * @param {object} userData - User data from auth_data
     * @param {object} testData - Test information
     * @returns {Promise<void>}
     */
    static async createInitialAttempt(userData, testData) {
        try {
            const { Email, College, Year, Department, Name, "Roll Number": rollNumber } = userData;
            const testID = testData.testInfo?.id || testData.id || 'unknown';

            // Check if already exists
            const existing = await this.checkExistingAttempt(Email, testID, College, Year, Department);
            if (existing.exists && existing.completed) {
                throw new Error('DUPLICATE_SUBMISSION: Test already completed. You cannot retake this test.');
            }

            const initialData = {
                rollNumber: rollNumber || '',
                name: Name || '',
                email: Email,
                college: College,
                year: Year,
                department: Department,
                testID: testID,
                testName: testData.name || testData.testInfo?.name || 'Unknown Test',
                totalQuestions: testData.questions?.length || testData.totalQuestions || 0,
                type: 'mcq',
                timeStarted: serverTimestamp(),
                timeStartedISO: timeService.getNow().toISOString(),
                completed: false,
                submitted: false,
                attempts: 1,
                from: 'student',
                syncedToSheets: false,
                createdAt: serverTimestamp()
            };

            const canonPath = await this.writeBothPaths(initialData, {
                testID, college: College, year: Year, department: Department, email: Email
            });

            console.log('[MCQService] Initial attempt created:', canonPath);
            return { success: true, docPath: canonPath };
        } catch (error) {
            console.error('[MCQService] Error creating initial attempt:', error);
            throw error;
        }
    }

    /**
     * Mark attempt as submitting/completed immediately to prevent refresh reattempts
     * @returns {Promise<boolean>}
     */
    static async markTestAsSubmitting(email, testID, college, year, department) {
        try {
            // BUG FIXED: this used to set `completed: true` *before* the result
            // was written. With attempt-immutability enforced in firestore.rules
            // that would lock the document and make the real result write fail;
            // it also meant a crash mid-submit left a "completed" attempt with
            // no score at all. `status: 'submitting'` is enough to block a
            // refresh re-attempt (checkExistingAttempt treats it as taken),
            // while leaving the document writable for the final result.
            const update = {
                status: 'submitting',
                submittingAt: serverTimestamp(),
                submittingAtISO: timeService.getNow().toISOString()
            };
            await this.writeBothPaths(update, { testID, college, year, department, email });
            console.log('[MCQService] Marked test as submitting to prevent refresh reattempts');
            return true;
        } catch (error) {
            console.error('[MCQService] Error marking test as submitting:', error);
            return false;
        }
    }

    /**
     * Save MCQ result to Firestore
     * @param {object} resultData - Result data object
     * @returns {Promise<{success: boolean, docId: string}>}
     */
    static async saveResultToFirestore(resultData) {
        try {
            const {
                email,
                college,
                year,
                department,
                testID,
                rollNumber,
                name,
                testName,
                score,
                totalQuestions,
                correctAnswers,
                incorrectAnswers,
                percentage,
                timeTaken,
                timeStarted,
                timeEnded,
                answers,
                autoSubmitted
            } = resultData;

            // Check if document already exists and is completed
            try {
                const existing = await this.checkExistingAttempt(email, testID, college, year, department);
                if (existing.exists && existing.completed && !existing.offline && existing.data?.status !== 'submitting') {
                    throw new Error('DUPLICATE_SUBMISSION: Test has already been submitted. Multiple submissions are not allowed.');
                }
            } catch (checkError) {
                // If offline, allow to proceed (will be saved to localStorage for retry)
                if (checkError.message?.includes('NETWORK_ERROR') || !navigator.onLine) {
                    throw new Error('NETWORK_ERROR: No internet connection. Your answers will be saved locally and submitted when connection is restored.');
                }
                // If duplicate submission error, re-throw it
                if (checkError.message?.includes('DUPLICATE_SUBMISSION')) {
                    throw checkError;
                }
                // For other errors, log and continue (Firestore will handle duplicate check)
                console.warn('[MCQService] Error checking existing attempt during save, continuing:', checkError);
            }

            // Get existing data if available (for attempts count)
            let existingData = null;
            try {
                const existingCheck = await this.checkExistingAttempt(email, testID, college, year, department);
                if (existingCheck.exists) {
                    existingData = existingCheck.data;
                }
            } catch (e) { /* ignore */ }

            const { partialScore, fullScore } = this.computeScoreFields(
                score, resultData.totalMarks || resultData.totalQuestions || 0, percentage
            );

            const resultDocument = {
                rollNumber: rollNumber || '',
                name: name || '',
                email: email,
                college: college,
                year: year,
                department: department,
                testID: testID,
                testName: testName || 'Unknown Test',
                type: 'mcq',
                score: score || 0,
                totalQuestions: totalQuestions || 0,
                correctAnswers: correctAnswers || 0,
                incorrectAnswers: incorrectAnswers || 0,
                percentage: percentage || 0,
                partialScore,
                fullScore,
                timeTaken: timeTaken || 0,
                timeTakenFormatted: this.formatTime(timeTaken || 0),
                timeStarted: timeStarted || serverTimestamp(),
                timeStartedISO: resultData.timeStartedISO || timeService.getNow().toISOString(),
                timeEnded: timeEnded || serverTimestamp(),
                timeEndedISO: timeService.getNow().toISOString(),
                submittedAt: serverTimestamp(),
                submittedAtISO: timeService.getNow().toISOString(),
                completed: true,
                submitted: true,
                status: 'submitted',
                attempts: existingData?.attempts || 1,
                from: 'student',
                syncedToSheets: false,
                autoSubmitted: autoSubmitted || false,
                autoSubmitReason: resultData.autoSubmitReason || '',
                answers: answers || {},
                totalMarks: resultData.totalMarks || resultData.totalQuestions || 0,
                questions: resultData.questions || [],
                violationCount: resultData.violationCount || 0,
                totalNoFace: resultData.totalNoFace || 0,
                totalMultipleFaces: resultData.totalMultipleFaces || 0,
                violations: resultData.violations || [],
                updatedAt: serverTimestamp()
            };

            // Canonical + legacy written atomically; see writeBothPaths.
            const canonPath = await this.writeBothPaths(resultDocument, {
                testID, college, year, department, email
            });
            console.log('[MCQService] Result saved atomically to:', canonPath);

            return { success: true, docId: canonPath };
        } catch (error) {
            console.error('[MCQService] Error saving to Firestore:', error);
            throw error;
        }
    }


    /**
     * Save MCQ result to Supabase
     * @param {object} resultData - Result data object
     * @returns {Promise<{success: boolean}>}
     */
    static async saveResultToSupabase(resultData) {
        try {
            const { partialScore: ps, fullScore: fs } = this.computeScoreFields(
                resultData.score, resultData.totalMarks || resultData.totalQuestions || 0, resultData.percentage
            );
            const { data, error } = await safeUpsert('mcq_results', {
                    roll_number: resultData.rollNumber || '',
                    name: resultData.name || '',
                    email: resultData.email || '',
                    college: resultData.college || '',
                    year: resultData.year || '',
                    department: resultData.department || '',
                    test_id: resultData.testID || '',
                    test_name: resultData.testName || 'Unknown Test',
                    score: resultData.score || 0,
                    total_questions: resultData.totalQuestions || 0,
                    correct_answers: resultData.correctAnswers || 0,
                    incorrect_answers: resultData.incorrectAnswers || 0,
                    percentage: resultData.percentage ? (resultData.percentage / 100) : 0,
                    partial_score: ps,
                    full_score: fs,
                    time_taken: resultData.timeTaken || 0,
                    time_taken_formatted: resultData.timeTakenFormatted || this.formatTime(resultData.timeTaken || 0),
                    time_started: resultData.timeStartedISO || new Date().toISOString(),
                    time_ended: resultData.timeEndedISO || new Date().toISOString(),
                    submitted_at: resultData.submittedAtISO || new Date().toISOString(),
                    auto_submitted: resultData.autoSubmitted || false,
                    auto_submit_reason: resultData.autoSubmitReason || '',
                    violation_count: resultData.violationCount || 0,
                    total_no_face: resultData.totalNoFace || 0,
                    total_multiple_faces: resultData.totalMultipleFaces || 0,
                    violations: resultData.violations || [],
                    total_marks: resultData.totalMarks || resultData.totalQuestions || 0,
                    questions: resultData.questions || [],
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'email,test_id'
                });

            if (error) throw error;

            // Also upsert into unified assessment_results table
            try {
                const { error: arErr } = await safeUpsert('assessment_results', {
                        type: 'mcq',
                        test_id: resultData.testID || '',
                        test_name: resultData.testName || 'Unknown Test',
                        roll_number: resultData.rollNumber || '',
                        name: resultData.name || '',
                        email: resultData.email || '',
                        college: resultData.college || '',
                        year: resultData.year || '',
                        department: resultData.department || '',
                        score: resultData.score || 0,
                        total_questions: resultData.totalQuestions || 0,
                        correct_answers: resultData.correctAnswers || 0,
                        incorrect_answers: resultData.incorrectAnswers || 0,
                        percentage: resultData.percentage ? (resultData.percentage / 100) : 0,
                        partial_score: ps,
                        full_score: fs,
                        status: 'submitted',
                        time_taken: resultData.timeTaken || 0,
                        time_taken_formatted: resultData.timeTakenFormatted || this.formatTime(resultData.timeTaken || 0),
                        time_started: resultData.timeStartedISO || new Date().toISOString(),
                        time_ended: resultData.timeEndedISO || new Date().toISOString(),
                        submitted_at: resultData.submittedAtISO || new Date().toISOString(),
                        auto_submitted: resultData.autoSubmitted || false,
                        auto_submit_reason: resultData.autoSubmitReason || '',
                        violation_count: resultData.violationCount || 0,
                        total_no_face: resultData.totalNoFace || 0,
                        total_multiple_faces: resultData.totalMultipleFaces || 0,
                        violations: resultData.violations || [],
                        total_marks: resultData.totalMarks || resultData.totalQuestions || 0,
                        questions: resultData.questions || [],
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'email,test_id,type' });
                if (arErr) console.warn('[MCQService] assessment_results upsert failed (non-blocking):', arErr.message);
            } catch (arEx) {
                console.warn('[MCQService] assessment_results exception (non-blocking):', arEx.message);
            }

            return { success: true };
        } catch (error) {
            console.error('[MCQService] Error saving to Supabase:', error);
            throw error;
        }
    }

    /**
     * Save in-progress MCQ data to Firestore
     * @param {object} progressData
     */
    static async saveProgressToFirestore(progressData) {
        const {
            email,
            college,
            year,
            department,
            testID,
            rollNumber,
            name,
            testName,
            score,
            totalQuestions,
            correctAnswers,
            incorrectAnswers,
            percentage,
            timeTaken,
            timeStarted,
            answers
        } = progressData;

        // Check canonical path to avoid overwriting submitted status
        const canonPath = this.canonicalPath(testID, college, year, email);
        const docRef = doc(db, canonPath);

        // Fetch existing document to prevent overwriting completed status
        try {
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const existingData = docSnap.data();
                if (existingData.completed === true || existingData.submitted === true) {
                    console.warn('[MCQService] Skipping progress sync: Test already marked as completed/submitted in Firestore');
                    return { success: true, skipped: true };
                }
            }
        } catch (e) {
            console.warn('[MCQService] Error checking existing status during progress sync, proceeding with caution:', e);
        }

        const progressDocument = {
            rollNumber: rollNumber || '',
            name: name || '',
            email,
            college,
            year,
            department,
            testID,
            testName: testName || 'Unknown Test',
            totalQuestions: totalQuestions || 0,
            inProgressScore: score || 0,
            inProgressPercentage: percentage || 0,
            correctAnswers: correctAnswers || 0,
            incorrectAnswers: incorrectAnswers || 0,
            progressTimeTaken: timeTaken || 0,
            progressTimeTakenFormatted: this.formatTime(timeTaken || 0),
            timeStarted: timeStarted || serverTimestamp(),
            timeStartedISO: progressData.timeStartedISO || timeService.getNow().toISOString(),
            lastProgressAt: serverTimestamp(),
            lastProgressAtISO: timeService.getNow().toISOString(),
            answers: answers || {},
            completed: false,
            submitted: false,
            syncedToSheets: false,
            updatedAt: serverTimestamp(),
            autoSubmitReason: progressData.autoSubmitReason || ''
        };

        await this.writeBothPaths(progressDocument, { testID, college, year, department, email });
        return { success: true };
    }


    /**
     * Sync in-progress MCQ data to Firestore and Sheets
     * @param {object} progressData
     */
    static async syncProgress(progressData) {
        try {
            await this.saveProgressToFirestore(progressData);
            // Disabled saving progress to sheets to reduce API calls and prevent duplicate rows
            // await this.saveProgressToSheets(progressData);
            return { success: true };
        } catch (error) {
            console.error('[MCQService] Progress sync failed:', error);
            throw error;
        }
    }


    /**
     * Mark Firestore document as synced to Supabase
     * @param {string} email - Student email
     * @param {string} testID - Test ID
     * @param {string} college - College name
     * @param {string} year - Academic year
     * @param {string} department - Department name
     * @returns {Promise<void>}
     */
    static async markSyncedToSupabase(email, testID, college, year, department) {
        try {
            const docRef = doc(db, this.canonicalPath(testID, college, year, email));

            await setDoc(docRef, {
                syncedToSupabase: true,
                syncedToSheets: true, // Keep syncedToSheets for compatibility
                syncedAt: serverTimestamp(),
                syncedAtISO: timeService.getNow().toISOString()
            }, { merge: true });

            console.log('[MCQService] Marked as synced to Supabase');
        } catch (error) {
            console.error('[MCQService] Error marking as synced to Supabase:', error);
            throw error;
        }
    }

    /**
     * Save unsynced result to localStorage for retry
     * @param {object} resultData - Result data
     */
    static saveUnsyncedResult(resultData) {
        try {
            const unsynced = JSON.parse(localStorage.getItem('mcq_unsynced_results') || '[]');
            unsynced.push({
                ...resultData,
                retryCount: 0,
                lastRetry: null
            });
            localStorage.setItem('mcq_unsynced_results', JSON.stringify(unsynced));
            console.log('[MCQService] Saved unsynced result to localStorage');
        } catch (error) {
            console.error('[MCQService] Error saving unsynced result:', error);
        }
    }

    /**
     * Retry syncing unsynced results
     * @returns {Promise<{synced: number, failed: number}>}
     */
    static async syncUnsyncedResults() {
        try {
            const unsynced = JSON.parse(localStorage.getItem('mcq_unsynced_results') || '[]');
            if (unsynced.length === 0) return { synced: 0, failed: 0 };

            let synced = 0;
            let failed = 0;
            const remaining = [];

            for (const result of unsynced) {
                try {


                    // Try to sync to Supabase
                    await this.saveResultToSupabase(result);

                    // Mark as synced in Firestore (Supabase version)
                    await this.markSyncedToSupabase(
                        result.email,
                        result.testID,
                        result.college,
                        result.year,
                        result.department
                    );

                    synced++;
                } catch (error) {
                    console.error('[MCQService] Retry failed for result:', error);
                    result.retryCount = (result.retryCount || 0) + 1;
                    result.lastRetry = new Date().toISOString();

                    // Only keep if retry count < 5
                    if (result.retryCount < 5) {
                        remaining.push(result);
                    } else {
                        failed++;
                    }
                }
            }

            // Update localStorage
            if (remaining.length > 0) {
                localStorage.setItem('mcq_unsynced_results', JSON.stringify(remaining));
            } else {
                localStorage.removeItem('mcq_unsynced_results');
            }

            return { synced, failed };
        } catch (error) {
            console.error('[MCQService] Error syncing unsynced results:', error);
            return { synced: 0, failed: 0 };
        }
    }

    /**
     * Format time in seconds to readable format
     * @param {number} seconds - Time in seconds
     * @returns {string} Formatted time string
     */
    static formatTime(seconds) {
        if (!seconds || seconds < 0) return '0s';

        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hrs > 0) {
            return `${hrs}h ${mins}m ${secs}s`;
        } else if (mins > 0) {
            return `${mins}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    }

    /**
     * Fetch MCQ results for a specific college from Supabase (Google Sheets logic commented out)
     * @param {string} college - College name
     * @returns {Promise<{success: boolean, data: Array}>}
     */
    static async fetchMCQResults(college) {
        return { success: true, data: [] };
    }

    /**
     * Submit MCQ test result (saves to Firestore)
     * @param {object} resultData - Complete result data
     * @returns {Promise<{success: boolean, firestore: boolean}>}
     */
    static async submitMCQResult(resultData) {
        let firestoreSuccess = false;

        try {
            await this.saveResultToFirestore(resultData);
            firestoreSuccess = true;
            console.log('[MCQService] ✅ Firestore save successful');

            return {
                success: firestoreSuccess,
                firestore: firestoreSuccess
            };
        } catch (error) {
            console.error('[MCQService] ❌ Submission failed:', error);
            throw error;
        }
    }
}

export default MCQService;

