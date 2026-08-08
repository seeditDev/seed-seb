import { db } from '../firebase-config';
import {
    doc,
    setDoc,
    updateDoc,
    getDoc,
    serverTimestamp,
    increment,
    collectionGroup,
    query,
    where,
    getCountFromServer
} from 'firebase/firestore';
import timeService from './timeService';
import { resolveTenant } from '../utils/tenant';

const HEARTBEAT_MS = 30000;
const LIVE_COUNT_POLL_MS = 60000;
const LIVE_COUNT_MIN_INTERVAL_MS = 20000;

/**
 * Presence + live-user tracking.
 *
 * BUGS FIXED
 *  - P0 read fan-out: `subscribeToLiveCount` opened an `onSnapshot` on
 *    `collectionGroup('users')`. Every homepage/dashboard mount streamed one
 *    document per online student, and every heartbeat from every student
 *    re-delivered the whole result set to every listener — O(users^2) billed
 *    reads. It now uses `getCountFromServer`, which is billed as one read per
 *    1000 matched documents, on a slow poll with a shared subscriber list so N
 *    components cost one query.
 *  - P1 writes while hidden/idle: the 30s heartbeat fired regardless of tab
 *    visibility, so a backgrounded exam window kept writing forever and
 *    inflated DailyDuration with time the student was not present. Heartbeats
 *    are now skipped while the document is hidden and elapsed time is only
 *    accrued for visible periods.
 *  - P1 leaked timers: repeated `startTracking` calls stacked intervals. Start
 *    is now idempotent and listeners are torn down on stop.
 *  - P1 lost sessions: the browser/PyQt window closing left `IsOnline: true`
 *    forever, permanently over-counting. `pagehide` now flushes an offline mark.
 */
class TrackingService {
    constructor() {
        this.heartbeatTimer = null;
        this.currentUser = null;
        this.sessionStartTime = null;
        this.lastHeartbeatTime = null;
        this.visibleSinceLastBeat = 0;
        this.visibilityHandler = null;
        this.pagehideHandler = null;
        this.lastVisibleAt = null;

        // Shared live-count polling state.
        this.liveCountSubscribers = new Set();
        this.liveCountTimer = null;
        this.liveCountLastFetchedAt = 0;
        this.liveCountLastValue = 0;
        this.liveCountInFlight = null;
    }

    isHidden() {
        return typeof document !== 'undefined' && document.visibilityState === 'hidden';
    }

    // Helper to get date string in DD-MM-YYYY format
    getDateString() {
        const now = timeService.getNow();
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yyyy = now.getFullYear();
        return `${dd}-${mm}-${yyyy}`;
    }

    // Get the specific document path for a user
    getUserDocRef(dateStr, college, year, email) {
        const normalizedCollege = (college || 'OTHER').trim().toUpperCase();
        const normalizedYear = (year || 'OTHER').toString().trim().toUpperCase();
        const normalizedEmail = String(email).toLowerCase().replace(/[.#$[\]]/g, '_'); // Firestore safe keys

        return doc(db, 'LiveUsers', dateStr, 'colleges', normalizedCollege, 'years', normalizedYear, 'users', normalizedEmail);
    }

    currentUserDocRef() {
        if (!this.currentUser) return null;
        const tenant = resolveTenant(this.currentUser);
        return this.getUserDocRef(
            this.getDateString(),
            tenant.college || 'OTHER',
            tenant.year || 'OTHER',
            this.currentUser.Email
        );
    }

    async startTracking(userData) {
        if (!userData || !userData.Email) return;

        // Idempotent: restarting for the same student must not stack intervals.
        if (this.currentUser && this.currentUser.Email === userData.Email && this.heartbeatTimer) {
            return;
        }
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

        this.currentUser = userData;
        this.sessionStartTime = timeService.now();
        this.lastHeartbeatTime = timeService.now();
        this.lastVisibleAt = this.isHidden() ? null : timeService.now();
        this.visibleSinceLastBeat = 0;

        const userRef = this.currentUserDocRef();
        if (!userRef) return;

        try {
            const userDoc = await getDoc(userRef);

            if (!userDoc.exists()) {
                // First visit of the day
                await setDoc(userRef, {
                    Email: userData.Email,
                    Name: userData.Name || 'Anonymous',
                    RollNumber: userData["Roll Number"] || userData.rollNo || 'N/A',
                    Department: userData.Department || 'N/A',
                    Date: this.getDateString(), // Added for collection group filtering
                    VisitTime: serverTimestamp(),
                    LastActive: serverTimestamp(),
                    LoginCount: 1,
                    DailyDuration: 0, // in seconds
                    SessionDuration: 0, // in seconds
                    IsOnline: true
                }, { merge: true });
            } else {
                // Subsequent login/refresh
                await updateDoc(userRef, {
                    LoginCount: increment(1),
                    IsOnline: true,
                    LastActive: serverTimestamp()
                });
            }

            this.attachLifecycleListeners();
            this.startHeartbeat();
        } catch (error) {
            console.error('Error starting tracking:', error);
        }
    }

    attachLifecycleListeners() {
        if (typeof document === 'undefined') return;
        this.detachLifecycleListeners();

        this.visibilityHandler = () => {
            const now = timeService.now();
            if (this.isHidden()) {
                // Bank the visible time so far, then stop the clock.
                if (this.lastVisibleAt) {
                    this.visibleSinceLastBeat += Math.max(0, Math.floor((now - this.lastVisibleAt) / 1000));
                }
                this.lastVisibleAt = null;
            } else {
                this.lastVisibleAt = now;
                // Coming back is worth one immediate beat so the dashboard is fresh.
                this.heartbeat();
            }
        };
        document.addEventListener('visibilitychange', this.visibilityHandler);

        // `pagehide` fires on tab close, navigation and PyQt window teardown,
        // where `beforeunload` is unreliable. Without this, IsOnline stuck true.
        this.pagehideHandler = () => { this.stopTracking(); };
        window.addEventListener('pagehide', this.pagehideHandler);
    }

    detachLifecycleListeners() {
        if (this.visibilityHandler && typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this.visibilityHandler);
        }
        if (this.pagehideHandler && typeof window !== 'undefined') {
            window.removeEventListener('pagehide', this.pagehideHandler);
        }
        this.visibilityHandler = null;
        this.pagehideHandler = null;
    }

    startHeartbeat() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

        // Heartbeat every 30 seconds, but only while the window is visible.
        this.heartbeatTimer = setInterval(() => this.heartbeat(), HEARTBEAT_MS);
    }

    async heartbeat() {
        if (!this.currentUser) return;
        // Do not burn a write (or credit idle time) while the window is hidden.
        if (this.isHidden()) return;

        const now = timeService.now();
        if (this.lastVisibleAt) {
            this.visibleSinceLastBeat += Math.max(0, Math.floor((now - this.lastVisibleAt) / 1000));
        }
        this.lastVisibleAt = now;

        const visibleSeconds = this.visibleSinceLastBeat;
        // Nothing meaningful accrued (e.g. two beats in the same second).
        if (visibleSeconds <= 0) return;
        this.visibleSinceLastBeat = 0;
        this.lastHeartbeatTime = now;

        const userRef = this.currentUserDocRef();
        if (!userRef) return;

        const sessionDuration = Math.floor((now - this.sessionStartTime) / 1000);

        try {
            await updateDoc(userRef, {
                LastActive: serverTimestamp(),
                DailyDuration: increment(visibleSeconds),
                SessionDuration: sessionDuration,
                IsOnline: true
            });
        } catch (error) {
            // Put the time back so it is not silently lost on a transient failure.
            this.visibleSinceLastBeat += visibleSeconds;
            console.error('Heartbeat failed:', error);
        }
    }

    async stopTracking() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
        this.detachLifecycleListeners();

        if (!this.currentUser) return;

        const userRef = this.currentUserDocRef();
        const now = timeService.now();
        if (this.lastVisibleAt) {
            this.visibleSinceLastBeat += Math.max(0, Math.floor((now - this.lastVisibleAt) / 1000));
        }
        const trailing = this.visibleSinceLastBeat;
        this.visibleSinceLastBeat = 0;
        this.lastVisibleAt = null;
        this.currentUser = null;

        if (!userRef) return;

        try {
            await updateDoc(userRef, {
                LastActive: serverTimestamp(),
                ...(trailing > 0 ? { DailyDuration: increment(trailing) } : {}),
                IsOnline: false
            });
        } catch (error) {
            console.error('Error stopping tracking:', error);
        }
    }

    // ---------------- live count ----------------

    async fetchLiveCount() {
        const dateStr = this.getDateString();
        const q = query(
            collectionGroup(db, 'users'),
            where('IsOnline', '==', true),
            where('Date', '==', dateStr)
        );
        const snapshot = await getCountFromServer(q);
        return snapshot.data().count;
    }

    async refreshLiveCount(force = false) {
        const now = Date.now();
        if (!force && now - this.liveCountLastFetchedAt < LIVE_COUNT_MIN_INTERVAL_MS) {
            return this.liveCountLastValue;
        }
        // Coalesce concurrent callers into a single query.
        if (this.liveCountInFlight) return this.liveCountInFlight;

        this.liveCountInFlight = (async () => {
            try {
                const count = await this.fetchLiveCount();
                this.liveCountLastValue = count;
                this.liveCountLastFetchedAt = Date.now();
                this.liveCountSubscribers.forEach((cb) => {
                    try { cb(count); } catch (_) {}
                });
                return count;
            } catch (error) {
                console.error('Live count query failed:', error);
                this.liveCountSubscribers.forEach((cb) => {
                    try { cb(this.liveCountLastValue); } catch (_) {}
                });
                return this.liveCountLastValue;
            } finally {
                this.liveCountInFlight = null;
            }
        })();

        return this.liveCountInFlight;
    }

    /**
     * Subscribe to the live-user count. Signature is unchanged (returns an
     * unsubscribe function) so existing call sites keep working, but the
     * transport is now a shared, visibility-aware poll rather than a realtime
     * collection-group snapshot.
     */
    subscribeToLiveCount(callback) {
        if (typeof callback !== 'function') return () => {};

        this.liveCountSubscribers.add(callback);
        // Serve the cached value instantly so the UI never flashes 0.
        if (this.liveCountLastFetchedAt) callback(this.liveCountLastValue);
        this.refreshLiveCount();

        if (!this.liveCountTimer) {
            this.liveCountTimer = setInterval(() => {
                if (this.isHidden()) return; // no polling for a hidden tab
                this.refreshLiveCount();
            }, LIVE_COUNT_POLL_MS);
        }

        let active = true;
        return () => {
            if (!active) return;
            active = false;
            this.liveCountSubscribers.delete(callback);
            if (this.liveCountSubscribers.size === 0 && this.liveCountTimer) {
                clearInterval(this.liveCountTimer);
                this.liveCountTimer = null;
            }
        };
    }
}

export default new TrackingService();
