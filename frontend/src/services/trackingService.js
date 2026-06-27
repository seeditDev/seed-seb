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
    onSnapshot
} from 'firebase/firestore';
import timeService from './timeService';

class TrackingService {
    constructor() {
        this.heartbeatTimer = null;
        this.currentUser = null;
        this.sessionStartTime = null;
        this.lastHeartbeatTime = null;
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
        const normalizedEmail = email.toLowerCase().replace(/[.#$[\]]/g, '_'); // Firestore safe keys

        return doc(db, 'LiveUsers', dateStr, 'colleges', normalizedCollege, 'years', normalizedYear, 'users', normalizedEmail);
    }

    async startTracking(userData) {
        if (!userData || !userData.Email) return;
        this.currentUser = userData;
        this.sessionStartTime = timeService.now();
        this.lastHeartbeatTime = timeService.now();
        const dateStr = this.getDateString();

        const college = userData.College || 'OTHER';
        const year = userData.Year || 'OTHER';
        const userRef = this.getUserDocRef(dateStr, college, year, userData.Email);

        try {
            const userDoc = await getDoc(userRef);
            
            if (!userDoc.exists()) {
                // First visit of the day
                await setDoc(userRef, {
                    Email: userData.Email,
                    Name: userData.Name || 'Anonymous',
                    RollNumber: userData["Roll Number"] || userData.rollNo || 'N/A',
                    Department: userData.Department || 'N/A',
                    Date: dateStr, // Added for collection group filtering
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

            this.startHeartbeat();
        } catch (error) {
            console.error('Error starting tracking:', error);
        }
    }

    startHeartbeat() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        
        // Heartbeat every 30 seconds
        this.heartbeatTimer = setInterval(() => this.heartbeat(), 30000);
    }

    async heartbeat() {
        if (!this.currentUser) return;

        const now = timeService.now();
        const diffSeconds = Math.floor((now - this.lastHeartbeatTime) / 1000);
        this.lastHeartbeatTime = now;

        const dateStr = this.getDateString();
        const college = this.currentUser.College || 'OTHER';
        const year = this.currentUser.Year || 'OTHER';
        const userRef = this.getUserDocRef(dateStr, college, year, this.currentUser.Email);

        const sessionDuration = Math.floor((now - this.sessionStartTime) / 1000);

        try {
            await updateDoc(userRef, {
                LastActive: serverTimestamp(),
                DailyDuration: increment(diffSeconds),
                SessionDuration: sessionDuration,
                IsOnline: true
            });
        } catch (error) {
            console.error('Heartbeat failed:', error);
        }
    }

    async stopTracking() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        
        if (!this.currentUser) return;

        const now = timeService.now();
        const dateStr = this.getDateString();
        const college = this.currentUser.College || 'OTHER';
        const year = this.currentUser.Year || 'OTHER';
        const userRef = this.getUserDocRef(dateStr, college, year, this.currentUser.Email);

        try {
            await updateDoc(userRef, {
                LastActive: serverTimestamp(),
                IsOnline: false
            });
            this.currentUser = null;
            this.heartbeatTimer = null;
        } catch (error) {
            console.error('Error stopping tracking:', error);
        }
    }

    // Subscribe to total live users for the current date
    subscribeToLiveCount(callback) {
        const dateStr = this.getDateString();
        
        // Collection group query to find all 'users' docs across the hierarchy
        const q = query(
            collectionGroup(db, 'users'),
            where('IsOnline', '==', true),
            where('Date', '==', dateStr)
        );

        return onSnapshot(q, (snapshot) => {
            callback(snapshot.size);
        }, (error) => {
            console.error("Live count subscription error:", error);
            // Fallback to 0 if permission error (or index needed)
            callback(0);
        });
    }
}

export default new TrackingService();
