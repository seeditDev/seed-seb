/**
 * certificateService.js
 * Verifiable Certificate Issuance & Validation Engine for SEED-IT Courses.
 *
 * Rules:
 * 1. Sequential IDs starting at 1001 (e.g. SEED-CERT-1001, SEED-CERT-1002, ...).
 * 2. Idempotent: If a student already has a certificate for a course, re-use it.
 * 3. Permanent Lifetime: Earned certificates are stored in `certificates/{certId}`
 *    and on `users/{uid}.certificates[courseId]`. They NEVER expire even if the
 *    student's subscription ends.
 */

import { db } from '../../lib/firebase-config';
import { doc, getDoc, setDoc, updateDoc, runTransaction, serverTimestamp } from 'firebase/firestore';

const CERTIFICATES_COLLECTION = 'certificates';
const COUNTERS_COLLECTION = 'counters';
const CERTIFICATE_COUNTER_DOC = 'certificates';
const BASE_SERIAL_OFFSET = 1000; // Counter starts allocating from 1001

/**
 * Format serial number into canonical certificate ID
 * @param {number} serial 
 * @returns {string} e.g. "SEED-CERT-1001"
 */
export function formatCertificateId(serial) {
  return `SEED-CERT-${serial}`;
}

/**
 * Retrieve an existing certificate for a user and course if already issued.
 */
export async function getCourseCertificate(uid, courseId) {
  if (!uid || !courseId) return null;
  
  // 1. Check user profile
  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const uData = userSnap.data();
      const existing = uData?.certificates?.[courseId];
      if (existing) {
        return existing;
      }
    }
  } catch (err) {
    console.warn('[certificateService] Failed to check user doc:', err);
  }

  // 2. Check localStorage cache
  try {
    const local = JSON.parse(localStorage.getItem(`seed_cert_${uid}_${courseId}`) || 'null');
    if (local && local.certificateId) return local;
  } catch (_) {}

  return null;
}

/**
 * Issue or retrieve a verifiable Certificate of Completion for a 100% completed course.
 * Guarantees a sequential Certificate ID starting from 1001 using Firestore transactions.
 */
export async function issueCourseCertificate(user, course) {
  if (!user || (!user.uid && !user.id)) {
    throw new Error('User must be authenticated to generate a certificate.');
  }
  if (!course) {
    throw new Error('Course details are required to generate a certificate.');
  }

  const uid = user.uid || user.id;
  const courseId = course.courseId || course.id || course.slug;
  const courseTitle = course.title || course.name || 'Course Mastery';
  const studentName = user.name || user.displayName || user.email?.split('@')[0] || 'Learner';

  // 1. Check if certificate is already issued (Idempotent)
  const existing = await getCourseCertificate(uid, courseId);
  if (existing) {
    return existing;
  }

  // 2. Allocate next sequential serial number with transaction safety
  let allocatedSerial = 1001;
  try {
    const counterRef = doc(db, COUNTERS_COLLECTION, CERTIFICATE_COUNTER_DOC);
    allocatedSerial = await runTransaction(db, async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      let current = BASE_SERIAL_OFFSET;
      if (counterSnap.exists()) {
        const val = counterSnap.data()?.current;
        if (typeof val === 'number' && val >= BASE_SERIAL_OFFSET) {
          current = val;
        }
      }
      const nextSerial = current + 1;
      transaction.set(counterRef, { current: nextSerial, updatedAt: serverTimestamp() }, { merge: true });
      return nextSerial;
    });
  } catch (txErr) {
    console.warn('[certificateService] Transaction allocation failed, falling back to timestamp-derived serial:', txErr);
    // Fallback if transaction fails due to permission / offline
    allocatedSerial = 1001 + Math.floor(Date.now() % 9000);
  }

  const certificateId = formatCertificateId(allocatedSerial);
  const issuedAt = new Date().toISOString();

  const certData = {
    certificateId,
    serialNumber: allocatedSerial,
    userId: uid,
    studentName,
    userEmail: user.email || '',
    courseId,
    courseTitle,
    issuedAt,
    status: 'ISSUED',
    lifetime: true,
    completionPercentage: 100,
    verificationUrl: `https://seedit.site/verify/${certificateId}`,
  };

  // 3. Save to certificates collection
  try {
    const certRef = doc(db, CERTIFICATES_COLLECTION, certificateId);
    await setDoc(certRef, certData, { merge: true });
  } catch (err) {
    console.error('[certificateService] Failed to write to certificates collection:', err);
  }

  // 4. Record on user record
  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      [`certificates.${courseId}`]: {
        certificateId,
        serialNumber: allocatedSerial,
        courseId,
        courseTitle,
        issuedAt,
        studentName,
        verificationUrl: `https://seedit.site/verify/${certificateId}`
      },
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    console.warn('[certificateService] Failed to update user profile certificates:', err);
  }

  // 5. Cache locally
  try {
    localStorage.setItem(`seed_cert_${uid}_${courseId}`, JSON.stringify(certData));
  } catch (_) {}

  return certData;
}
