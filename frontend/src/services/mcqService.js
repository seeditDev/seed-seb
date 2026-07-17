import { db } from '../firebase-config';
import { doc, setDoc, getDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import timeService from './timeService';
import { supabase, safeUpsert } from '../supabaseClient';


class MCQService {
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
            // Check if online first
            if (!navigator.onLine) {
                console.warn('[MCQService] Client is offline, cannot check existing attempt');
                // Return safe default - allow test to proceed, Firestore will handle duplicate on submit
                return { exists: false, data: null, completed: false, offline: true };
            }

            const docPath = `colleges/${college}/years/${year}/departments/${department}/students/${email}/mcq_results/${testID}`;
            const docRef = doc(db, docPath);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                return {
                    exists: true,
                    data: data,
                    completed: data.completed === true || data.submitted === true || data.status === 'submitting' || data.status === 'submitted'
                };
            }

            return { exists: false, data: null, completed: false };
        } catch (error) {
            console.error('[MCQService] Error checking existing attempt:', error);

            // Handle offline errors gracefully
            if (error.code === 'unavailable' || error.message?.includes('offline') || error.message?.includes('network')) {
                console.warn('[MCQService] Network error, allowing test to proceed');
                return { exists: false, data: null, completed: false, offline: true };
            }

            // For other errors, still allow test to proceed (Firestore will catch duplicates on submit)
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

            const docPath = `colleges/${College}/years/${Year}/departments/${Department}/students/${Email}/mcq_results/${testID}`;
            const docRef = doc(db, docPath);

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
                timeStarted: serverTimestamp(),
                timeStartedISO: timeService.getNow().toISOString(),
                completed: false,
                submitted: false,
                attempts: 1,
                from: 'student',
                syncedToSheets: false,
                createdAt: serverTimestamp()
            };

            // Use setDoc with merge to avoid overwriting if document exists
            await setDoc(docRef, initialData, { merge: true });

            console.log('[MCQService] Initial attempt created:', docPath);
            return { success: true, docPath };
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
            const docPath = `colleges/${college}/years/${year}/departments/${department}/students/${email}/mcq_results/${testID}`;
            const docRef = doc(db, docPath);
            await setDoc(docRef, { completed: true, status: 'submitting' }, { merge: true });
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

            const docPath = `colleges/${college}/years/${year}/departments/${department}/students/${email}/mcq_results/${testID}`;
            const docRef = doc(db, docPath);

            // Get existing data if available (for attempts count)
            let existingData = null;
            try {
                const existingCheck = await this.checkExistingAttempt(email, testID, college, year, department);
                if (existingCheck.exists) {
                    existingData = existingCheck.data;
                }
            } catch (e) {
                // Ignore errors, use default
            }

            const resultDocument = {
                rollNumber: rollNumber || '',
                name: name || '',
                email: email,
                college: college,
                year: year,
                department: department,
                testID: testID,
                testName: testName || 'Unknown Test',
                score: score || 0,
                totalQuestions: totalQuestions || 0,
                correctAnswers: correctAnswers || 0,
                incorrectAnswers: incorrectAnswers || 0,
                percentage: percentage || 0,
                timeTaken: timeTaken || 0, // in seconds
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
                // Proctoring data
                violationCount: resultData.violationCount || 0,
                totalNoFace: resultData.totalNoFace || 0,
                totalMultipleFaces: resultData.totalMultipleFaces || 0,
                violations: resultData.violations || [],
                updatedAt: serverTimestamp()
            };

            // Use setDoc to create/update the document (student-centric path)
            await setDoc(docRef, resultDocument, { merge: true });

            // Also write to assessment-centric collection: AssessmentResults/{testID}/colleges/{college}/years/{year}/students/{email}
            try {
                const assessmentDocPath = `AssessmentResults/${testID}/colleges/${college}/years/${year}/students/${email}`;
                const assessmentDocRef = doc(db, assessmentDocPath);
                await setDoc(assessmentDocRef, {
                    ...resultDocument,
                    type: 'mcq',
                    assessmentCentricPath: assessmentDocPath
                }, { merge: true });
                console.log('[MCQService] Result also saved to AssessmentResults:', assessmentDocPath);
            } catch (assessErr) {
                console.warn('[MCQService] AssessmentResults write failed (non-blocking):', assessErr.message);
            }

            console.log('[MCQService] Result saved to Firestore:', docPath);
            return { success: true, docId: docPath, docRef: docRef };
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

        const docPath = `colleges/${college}/years/${year}/departments/${department}/students/${email}/mcq_results/${testID}`;
        const docRef = doc(db, docPath);

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

        await setDoc(docRef, progressDocument, { merge: true });
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
            const docPath = `colleges/${college}/years/${year}/departments/${department}/students/${email}/mcq_results/${testID}`;
            const docRef = doc(db, docPath);

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
        /*
        // --- GOOGLE SHEETS FETCH LOGIC (COMMENTED OUT) ---
        try {
            const payload = {
                action: 'getMCQResults',
                college: college
            };

            const response = await fetch(GAS_ENDPOINT, {
                method: 'POST',
                mode: 'no-cors', // In no-cors mode, fetch won't return data. 
                // Wait, if we need to READ data, we CANNOT use no-cors.
                // Google Apps Script web apps return data if they use CORS.
                // However, GAS often redirect which causes issues with no-cors.
                // For GETTING data, we usually use a GET request or a POST with redirect handled.
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            // Note: If the GAS is set up as a Web App with access 'Anyone', 
            // responding with JSON usually works with fetch if mode is 'cors' (default).
            // Let's try standard fetch first. If it fails, we might need to use a different approach.

            // Actually, to get data back from GAS, we should NOT use no-cors.
            // Using standard fetch:
            const corsResponse = await fetch(GAS_ENDPOINT, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            const result = await corsResponse.json();
            return result;
        } catch (error) {
            console.error('[MCQService] Error fetching MCQ results:', error);
            throw error;
        }
        // --------------------------------------------------
        */

        // --- SUPABASE FETCH LOGIC ---
        try {
            const { data, error } = await supabase
                .from('mcq_results')
                .select('*')
                .eq('college', college);

            if (error) throw error;

            // Map the Supabase snake_case fields back to the format expected by the frontend
            const mappedData = data.map(r => ({
                'Timestamp': r.created_at || r.submitted_at || new Date().toISOString(),
                'Roll Number': r.roll_number || '',
                'Name': r.name || '',
                'Email': r.email || '',
                'College': r.college || '',
                'Year': r.year || '',
                'Department': r.department || '',
                'Test ID': r.test_id || '',
                'Test Name': r.test_name || 'Unknown Test',
                'Score': r.score || 0,
                'Total Questions': r.total_questions || 0,
                'Correct Answers': r.correct_answers || 0,
                'Incorrect Answers': r.incorrect_answers || 0,
                'Percentage': r.percentage || 0,
                'Time Taken': r.time_taken_formatted || '',
                'Time Started': r.time_started || '',
                'Time Ended': r.time_ended || '',
                'Submitted At': r.submitted_at || '',
                'Auto Submitted': r.auto_submitted ? 'Yes' : 'No',
                'Auto Submit Reason': r.auto_submit_reason || '',
                'Violation Count': r.violation_count || 0,
                'Total No Face': r.total_no_face || 0,
                'Total Multiple Faces': r.total_multiple_faces || 0,
                'Violations Details': typeof r.violations === 'string' ? r.violations : JSON.stringify(r.violations || [])
            }));

            return { success: true, data: mappedData };
        } catch (error) {
            console.error('[MCQService] Error fetching MCQ results from Supabase:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * Submit MCQ test result (saves to both Firestore and Supabase, Sheets commented out)
     * @param {object} resultData - Complete result data
     * @returns {Promise<{success: boolean, firestore: boolean, supabase: boolean}>}
     */
    static async submitMCQResult(resultData) {
        let firestoreSuccess = false;

        try {
            // Step 1: Save to Firestore first (prevents duplicate submissions)
            try {
                await this.saveResultToFirestore(resultData);
                firestoreSuccess = true;
                console.log('[MCQService] ✅ Firestore save successful');
            } catch (firestoreError) {
                console.error('[MCQService] ❌ Firestore save failed:', firestoreError);

                // If it's a duplicate submission error, throw it immediately
                if (firestoreError.message.includes('DUPLICATE_SUBMISSION')) {
                    throw firestoreError;
                }

                // For other errors, continue to try Supabase
                throw new Error(`Firestore save failed: ${firestoreError.message}`);
            }



            // --- SUPABASE SAVE LOGIC ---
            // Step 2: Save to Supabase (Non-blocking)
            this.saveResultToSupabase(resultData).then(async () => {
                // Mark as synced in Firestore (using Supabase flag)
                if (firestoreSuccess) {
                    await this.markSyncedToSupabase(
                        resultData.email,
                        resultData.testID,
                        resultData.college,
                        resultData.year,
                        resultData.department
                    );
                }
                console.log('[MCQService] ✅ Supabase save successful');
            }).catch(supabaseError => {
                console.error('[MCQService] ⚠️ Supabase save failed:', supabaseError);
                // Save to localStorage for retry
                if (firestoreSuccess) {
                    this.saveUnsyncedResult(resultData);
                }
            });

            return {
                success: firestoreSuccess, // Success if at least Firestore worked
                firestore: firestoreSuccess,
                supabase: false // Pending
            };
        } catch (error) {
            console.error('[MCQService] ❌ Submission failed:', error);
            throw error;
        }
    }
}

export default MCQService;

