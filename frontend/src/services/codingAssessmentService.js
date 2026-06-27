import { db } from '../firebase-config';
import { doc, setDoc, getDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import timeService from './timeService';
import { supabase } from '../supabaseClient';


class CodingAssessmentService {
    /**
     * Check if student has already completed the coding assessment
     */
    static async checkExistingAttempt(email, assessmentID, college, year, department) {
        try {
            if (!navigator.onLine) {
                console.warn('[CodingAssessmentService] Client is offline, cannot check existing attempt');
                return { exists: false, data: null, completed: false, offline: true };
            }

            const docPath = `colleges/${college}/years/${year}/departments/${department}/students/${email}/coding_results/${assessmentID}`;
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

            const colPath = `colleges/${college}/years/${year}/departments/${department}/students/${email}/coding_results`;
            const colRef = collection(db, colPath);
            const querySnapshot = await getDocs(colRef);
            
            const attemptsMap = {};
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                attemptsMap[doc.id] = {
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

            const docPath = `colleges/${College}/years/${Year}/departments/${Department}/students/${Email}/coding_results/${assessmentID}`;
            const docRef = doc(db, docPath);

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
                attempts: 1,
                from: 'student',
                createdAt: serverTimestamp()
            };

            // Write initial status to Supabase coding_results table
            try {
                const { error: supabaseError } = await supabase
                    .from('coding_results')
                    .upsert({
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
                const { error: arErr } = await supabase
                    .from('assessment_results')
                    .upsert({
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
                        status: 'started',
                        time_taken: 0,
                        time_started: initialData.timeStartedISO,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'email,test_id,type' });
                if (arErr) console.warn('[CodingAssessmentService] assessment_results initial insert failed (non-blocking):', arErr.message);
            } catch (arEx) {
                console.warn('[CodingAssessmentService] assessment_results initial exception:', arEx.message);
            }

            await setDoc(docRef, initialData, { merge: true });
            console.log('[CodingAssessmentService] Initial attempt created:', docPath);
            return { success: true, docPath };
        } catch (error) {
            console.warn('[CodingAssessmentService] Could not register attempt in Firestore (non-blocking):', error.message);
            // Do NOT re-throw — Firestore permission issues must never block the test from starting.
            // The student's progress is always saved to localStorage as primary backup.
            return { success: false, error: error.message };
        }
    }

    /**
     * Mark attempt as submitting/completed to prevent tab refresh exploit
     */
    static async markAsSubmitting(email, assessmentID, college, year, department) {
        try {
            const docPath = `colleges/${college}/years/${year}/departments/${department}/students/${email}/coding_results/${assessmentID}`;
            const docRef = doc(db, docPath);
            await setDoc(docRef, { completed: true, status: 'submitting' }, { merge: true });

            // Also write status: 'submitting' to Supabase
            try {
                await supabase
                    .from('coding_results')
                    .upsert({
                        email,
                        test_id: assessmentID,
                        status: 'submitting',
                        updated_at: new Date().toISOString()
                    }, {
                        onConflict: 'email,test_id'
                    });
            } catch (supErr) {
                console.warn('[CodingAssessmentService] Supabase markAsSubmitting status update failed:', supErr.message);
            }

            return true;
        } catch (error) {
            // Non-critical — silently ignore permission or network errors
            console.warn('[CodingAssessmentService] markAsSubmitting skipped (non-blocking):', error.message);
            return false;
        }
    }

    /**
     * Save result to Firestore
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

            const docPath = `colleges/${college}/years/${year}/departments/${department}/students/${email}/coding_results/${assessmentID}`;
            const docRef = doc(db, docPath);

            const resultDocument = {
                rollNumber: rollNumber || '',
                name: name || '',
                email: email,
                college: college,
                year: year,
                department: department,
                assessmentID: assessmentID,
                assessmentName: assessmentName || 'Unknown Coding Assessment',
                score: score || 0,
                totalQuestions: totalQuestions || 0,
                correctAnswers: correctAnswers || 0,
                incorrectAnswers: incorrectAnswers || 0,
                percentage: percentage || 0,
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
                violations: violations || [],
                violationCount: violationCount || 0,
                updatedAt: serverTimestamp()
            };

            await setDoc(docRef, resultDocument, { merge: true });

            // Also write to assessment-centric path: AssessmentResults/{assessmentID}/colleges/{college}/years/{year}/students/{email}
            try {
                const assessmentDocPath = `AssessmentResults/${assessmentID}/colleges/${college}/years/${year}/students/${email}`;
                const assessmentDocRef = doc(db, assessmentDocPath);
                await setDoc(assessmentDocRef, {
                    ...resultDocument,
                    type: 'coding',
                    assessmentCentricPath: assessmentDocPath
                }, { merge: true });
                console.log('[CodingAssessmentService] Result also saved to AssessmentResults:', assessmentDocPath);
            } catch (assessErr) {
                console.warn('[CodingAssessmentService] AssessmentResults write failed (non-blocking):', assessErr.message);
            }

            console.log('[CodingAssessmentService] Result saved to Firestore:', docPath);
            return { success: true, docId: docPath, docRef };
        } catch (error) {
            console.error('[CodingAssessmentService] Error saving to Firestore:', error);
            throw error;
        }
    }


    /**
     * Save result to Supabase
     */
    static async saveResultToSupabase(resultData) {
        try {
            // Check if coding_results table exists, if not fallback gracefully.
            const { error } = await supabase
                .from('coding_results')
                .upsert({
                    roll_number: resultData.rollNumber || '',
                    name: resultData.name || '',
                    email: resultData.email || '',
                    college: resultData.college || '',
                    year: resultData.year || '',
                    department: resultData.department || '',
                    test_id: resultData.assessmentID || '',
                    test_name: resultData.assessmentName || 'Unknown Coding Assessment',
                    score: resultData.score || 0,
                    total_questions: resultData.totalQuestions || 0,
                    correct_answers: resultData.correctAnswers || 0,
                    incorrect_answers: resultData.incorrectAnswers || 0,
                    percentage: resultData.percentage ? (resultData.percentage / 100) : 0,
                    status: resultData.status || 'submitted',
                    time_taken: resultData.timeTaken || 0,
                    time_started: resultData.timeStartedISO || new Date().toISOString(),
                    time_ended: resultData.timeEndedISO || new Date().toISOString(),
                    submitted_at: resultData.submittedAtISO || new Date().toISOString(),
                    auto_submitted: resultData.autoSubmitted || false,
                    auto_submit_reason: resultData.autoSubmitReason || '',
                    violation_count: resultData.violationCount || 0,
                    language_used: resultData.languageUsed || '',
                    execution_stats: resultData.executionStats || {},
                    violations: resultData.violations || [],
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'email,test_id'
                });

            if (error) {
                console.warn('[CodingAssessmentService] Supabase coding_results upload failed. Continuing...', error);
            }

            // Also upsert into unified assessment_results table
            try {
                const { error: arErr } = await supabase
                    .from('assessment_results')
                    .upsert({
                        type: 'coding',
                        test_id: resultData.assessmentID || '',
                        test_name: resultData.assessmentName || 'Unknown Coding Assessment',
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
                        time_taken_formatted: CodingAssessmentService.formatTime(resultData.timeTaken || 0),
                        time_started: resultData.timeStartedISO || new Date().toISOString(),
                        time_ended: resultData.timeEndedISO || new Date().toISOString(),
                        submitted_at: resultData.submittedAtISO || new Date().toISOString(),
                        auto_submitted: resultData.autoSubmitted || false,
                        auto_submit_reason: resultData.autoSubmitReason || '',
                        violation_count: resultData.violationCount || 0,
                        violations: resultData.violations || [],
                        language_used: resultData.languageUsed || '',
                        execution_stats: resultData.executionStats || {},
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'email,test_id,type' });
                if (arErr) console.warn('[CodingAssessmentService] assessment_results upsert failed (non-blocking):', arErr.message);
            } catch (arEx) {
                console.warn('[CodingAssessmentService] assessment_results exception (non-blocking):', arEx.message);
            }

            return { success: true };
        } catch (error) {
            console.error('[CodingAssessmentService] Supabase exception:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Complete multi-channel submission
     */
    static async submitCodingResult(resultData) {
        let firestoreOk = false;
        let supabaseOk = false;

        // 1. Try Firestore (best-effort, never blocks)
        try {
            await this.saveResultToFirestore(resultData);
            firestoreOk = true;
        } catch (err) {
            console.warn('[CodingAssessmentService] Firestore submission failed (non-blocking):', err.message);
        }

        // 2. Try Supabase (best-effort backup)
        try {
            await this.saveResultToSupabase(resultData);
            supabaseOk = true;
        } catch (err) {
            console.warn('[CodingAssessmentService] Supabase backup failed:', err.message);
        }

        console.log(`[CodingAssessmentService] Submission channels — Firestore: ${firestoreOk}, Supabase: ${supabaseOk}`);

        // Always succeed from the student's perspective — at least one channel is enough
        return { success: true, firestoreOk, supabaseOk };
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

            const docPath = `colleges/${college}/years/${year}/departments/${department}/students/${email}/coding_results/${assessmentID}`;
            const docRef = doc(db, docPath);

            // Fetch to ensure we don't overwrite completed status
            try {
                const docSnap = await getDoc(docRef);
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

            await setDoc(docRef, progressDocument, { merge: true });
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
