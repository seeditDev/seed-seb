import { db } from '../firebase-config';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import timeService from './timeService';

class ProctoringService {
    /**
     * Log a proctoring event to Firestore
     * @param {string} studentEmail - Student email
     * @param {string} testID - Test ID
     * @param {string} college - College name
     * @param {string} year - Academic year
     * @param {string} department - Department name
     * @param {object} eventData - Event data
     * @returns {Promise<{success: boolean, docId: string}>}
     */
    static async logProctorEvent(studentEmail, testID, college, year, department, eventData) {
        try {
            const docPath = `colleges/${college}/years/${year}/departments/${department}/students/${studentEmail}/mcq_results/${testID}/proctor_events`;
            const eventsRef = collection(db, docPath);

            const eventDocument = {
                ...eventData,
                timestamp: serverTimestamp(),
                timestampISO: timeService.getNow().toISOString(),
                studentEmail,
                testID,
                college,
                year,
                department
            };

            const docRef = await addDoc(eventsRef, eventDocument);
            console.log('[ProctoringService] Event logged:', docRef.id);
            return { success: true, docId: docRef.id };
        } catch (error) {
            console.error('[ProctoringService] Error logging event:', error);
            
            // Save to localStorage for retry if offline
            if (!navigator.onLine || error.code === 'unavailable') {
                this.saveEventToLocalStorage(studentEmail, testID, college, year, department, eventData);
            }
            
            throw error;
        }
    }

    /**
     * Save event to localStorage for offline retry
     */
    static saveEventToLocalStorage(studentEmail, testID, college, year, department, eventData) {
        try {
            const key = `proctor_events_${studentEmail}_${testID}`;
            const existing = JSON.parse(localStorage.getItem(key) || '[]');
            existing.push({
                ...eventData,
                timestampISO: timeService.getNow().toISOString(),
                studentEmail,
                testID,
                college,
                year,
                department
            });
            localStorage.setItem(key, JSON.stringify(existing));
            console.log('[ProctoringService] Event saved to localStorage for retry');
        } catch (error) {
            console.error('[ProctoringService] Error saving to localStorage:', error);
        }
    }

    /**
     * Retry syncing offline events
     */
    static async syncOfflineEvents(studentEmail, testID) {
        try {
            const key = `proctor_events_${studentEmail}_${testID}`;
            const events = JSON.parse(localStorage.getItem(key) || '[]');
            if (events.length === 0) return { synced: 0, failed: 0 };

            let synced = 0;
            let failed = 0;
            const remaining = [];

            for (const event of events) {
                try {
                    await this.logProctorEvent(
                        event.studentEmail,
                        event.testID,
                        event.college,
                        event.year,
                        event.department,
                        {
                            eventType: event.eventType,
                            severity: event.severity,
                            count: event.count,
                            details: event.details,
                            snapshot: event.snapshot
                        }
                    );
                    synced++;
                } catch (error) {
                    console.error('[ProctoringService] Retry failed:', error);
                    remaining.push(event);
                    failed++;
                }
            }

            if (remaining.length > 0) {
                localStorage.setItem(key, JSON.stringify(remaining));
            } else {
                localStorage.removeItem(key);
            }

            return { synced, failed };
        } catch (error) {
            console.error('[ProctoringService] Error syncing offline events:', error);
            return { synced: 0, failed: 0 };
        }
    }

    /**
     * Update test result with proctoring summary
     * @param {string} studentEmail - Student email
     * @param {string} testID - Test ID
     * @param {string} college - College name
     * @param {string} year - Academic year
     * @param {string} department - Department name
     * @param {object} proctoringSummary - Summary data
     */
    static async updateTestResultWithProctoring(studentEmail, testID, college, year, department, proctoringSummary) {
        try {
            const { doc, setDoc } = await import('firebase/firestore');
            const docPath = `colleges/${college}/years/${year}/departments/${department}/students/${studentEmail}/mcq_results/${testID}`;
            const docRef = doc(db, docPath);

            await setDoc(docRef, {
                proctoring: {
                    ...proctoringSummary,
                    updatedAt: serverTimestamp(),
                    updatedAtISO: timeService.getNow().toISOString()
                }
            }, { merge: true });

            console.log('[ProctoringService] Proctoring summary updated');
        } catch (error) {
            console.error('[ProctoringService] Error updating proctoring summary:', error);
            throw error;
        }
    }
}

export default ProctoringService;
