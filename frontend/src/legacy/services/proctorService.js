import { db, storage } from '../firebase-config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

class ProctorService {
  /**
   * Upload snapshot to Firebase Storage
   * @param {string} studentID - Student email/ID
   * @param {string} testID - Test ID
   * @param {Blob} imageBlob - Image blob
   * @param {string} filename - Filename for the image
   * @returns {Promise<string>} Download URL
   */
  static async uploadSnapshot(studentID, testID, imageBlob, filename) {
    try {
      if (!imageBlob) {
        console.warn('[ProctorService] No image blob provided');
        return null;
      }

      // Create storage path: proctor_snapshots/{studentID}/{testID}/{filename}.jpg
      const sanitizedStudentID = studentID.replace(/[^a-zA-Z0-9]/g, '_');
      const sanitizedTestID = testID.replace(/[^a-zA-Z0-9]/g, '_');
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9]/g, '_');
      
      const storagePath = `proctor_snapshots/${sanitizedStudentID}/${sanitizedTestID}/${sanitizedFilename}.jpg`;
      const storageRef = ref(storage, storagePath);

      console.log('[ProctorService] Uploading snapshot to:', storagePath);

      // Upload blob
      const snapshot = await uploadBytes(storageRef, imageBlob, {
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000'
      });

      // Get download URL
      const downloadURL = await getDownloadURL(snapshot.ref);
      console.log('[ProctorService] Snapshot uploaded successfully:', downloadURL);

      return downloadURL;
    } catch (error) {
      console.error('[ProctorService] Error uploading snapshot:', error);
      
      // Save to localStorage for retry
      this.saveUnsyncedSnapshot(studentID, testID, imageBlob, filename);
      
      return null;
    }
  }

  /**
   * Log proctor event to Firestore
   * @param {string} studentID - Student email/ID
   * @param {string} testID - Test ID
   * @param {object} eventData - Event data
   * @returns {Promise<string>} Document ID
   */
  static async logProctorEvent(studentID, testID, eventData) {
    try {
      const { eventType, severity, misbehaviorCount, snapshotUrl, timestamp } = eventData;

      // Create document path: proctor_logs/{studentID}/{testID}/{timestamp}
      const sanitizedStudentID = studentID.replace(/[^a-zA-Z0-9]/g, '_');
      const sanitizedTestID = testID.replace(/[^a-zA-Z0-9]/g, '_');
      const eventTimestamp = timestamp || new Date().toISOString();
      const sanitizedTimestamp = eventTimestamp.replace(/[^a-zA-Z0-9]/g, '_');

      const logData = {
        studentID: studentID,
        testID: testID,
        eventType: eventType, // 'no_face' | 'multiple_faces' | 'looking_away'
        severity: severity || 1,
        misbehaviorCount: misbehaviorCount || 0,
        snapshotUrl: snapshotUrl || null,
        timestamp: serverTimestamp(),
        timestampISO: eventTimestamp,
        createdAt: serverTimestamp()
      };

      // Use collection reference with path segments
      const logRef = collection(db, 'proctor_logs', sanitizedStudentID, sanitizedTestID);
      const docRef = await addDoc(logRef, logData);

      console.log('[ProctorService] Proctor event logged:', docRef.id);
      return docRef.id;
    } catch (error) {
      console.error('[ProctorService] Error logging proctor event:', error);
      
      // Save to localStorage for retry
      this.saveUnsyncedLog(studentID, testID, eventData);
      
      throw error;
    }
  }

  /**
   * Save unsynced snapshot to localStorage
   */
  static saveUnsyncedSnapshot(studentID, testID, imageBlob, filename) {
    try {
      const key = 'proctor_unsynced_snapshots';
      const unsynced = JSON.parse(localStorage.getItem(key) || '[]');
      
      // Convert blob to base64 for storage
      const reader = new FileReader();
      reader.onloadend = () => {
        unsynced.push({
          studentID,
          testID,
          filename,
          imageData: reader.result, // base64
          timestamp: new Date().toISOString(),
          retryCount: 0
        });
        localStorage.setItem(key, JSON.stringify(unsynced));
        console.log('[ProctorService] Saved unsynced snapshot to localStorage');
      };
      reader.readAsDataURL(imageBlob);
    } catch (error) {
      console.error('[ProctorService] Error saving unsynced snapshot:', error);
    }
  }

  /**
   * Save unsynced log to localStorage
   */
  static saveUnsyncedLog(studentID, testID, eventData) {
    try {
      const key = 'proctor_unsynced_logs';
      const unsynced = JSON.parse(localStorage.getItem(key) || '[]');
      
      unsynced.push({
        studentID,
        testID,
        ...eventData,
        retryCount: 0,
        timestamp: eventData.timestamp || new Date().toISOString()
      });
      
      localStorage.setItem(key, JSON.stringify(unsynced));
      console.log('[ProctorService] Saved unsynced log to localStorage');
    } catch (error) {
      console.error('[ProctorService] Error saving unsynced log:', error);
    }
  }

  /**
   * Retry syncing unsynced snapshots and logs
   */
  static async retryUnsyncedData() {
    try {
      // Retry snapshots
      const unsyncedSnapshots = JSON.parse(localStorage.getItem('proctor_unsynced_snapshots') || '[]');
      const remainingSnapshots = [];

      for (const snapshot of unsyncedSnapshots) {
        try {
          // Convert base64 back to blob
          const response = await fetch(snapshot.imageData);
          const blob = await response.blob();
          
          const url = await this.uploadSnapshot(
            snapshot.studentID,
            snapshot.testID,
            blob,
            snapshot.filename
          );
          
          if (url) {
            console.log('[ProctorService] Retried snapshot upload successfully');
          } else {
            snapshot.retryCount++;
            if (snapshot.retryCount < 5) {
              remainingSnapshots.push(snapshot);
            }
          }
        } catch (error) {
          console.error('[ProctorService] Retry snapshot failed:', error);
          snapshot.retryCount++;
          if (snapshot.retryCount < 5) {
            remainingSnapshots.push(snapshot);
          }
        }
      }

      if (remainingSnapshots.length > 0) {
        localStorage.setItem('proctor_unsynced_snapshots', JSON.stringify(remainingSnapshots));
      } else {
        localStorage.removeItem('proctor_unsynced_snapshots');
      }

      // Retry logs
      const unsyncedLogs = JSON.parse(localStorage.getItem('proctor_unsynced_logs') || '[]');
      const remainingLogs = [];

      for (const log of unsyncedLogs) {
        try {
          await this.logProctorEvent(log.studentID, log.testID, log);
          console.log('[ProctorService] Retried log upload successfully');
        } catch (error) {
          console.error('[ProctorService] Retry log failed:', error);
          log.retryCount++;
          if (log.retryCount < 5) {
            remainingLogs.push(log);
          }
        }
      }

      if (remainingLogs.length > 0) {
        localStorage.setItem('proctor_unsynced_logs', JSON.stringify(remainingLogs));
      } else {
        localStorage.removeItem('proctor_unsynced_logs');
      }

      return {
        snapshotsRetried: unsyncedSnapshots.length - remainingSnapshots.length,
        logsRetried: unsyncedLogs.length - remainingLogs.length
      };
    } catch (error) {
      console.error('[ProctorService] Error retrying unsynced data:', error);
      return { snapshotsRetried: 0, logsRetried: 0 };
    }
  }
}

export default ProctorService;

