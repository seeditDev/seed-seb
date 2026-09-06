/**
 * notificationService.js
 *
 * Real-time notification service for SEED-SEB frontend.
 * Supports time limits (automatic expiration), role & tenant scoping,
 * and persistent read/unread tracking for students.
 */

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from '../lib/firebase-config';

export const NOTIFICATION_TYPES = {
  ANNOUNCEMENT: 'announcement',
  EXAM: 'exam',
  URGENT: 'urgent',
  INFO: 'info',
};

export const NOTIFICATION_DURATIONS = [
  { label: '1 Hour', value: '1h', ms: 1 * 60 * 60 * 1000 },
  { label: '6 Hours', value: '6h', ms: 6 * 60 * 60 * 1000 },
  { label: '12 Hours', value: '12h', ms: 12 * 60 * 60 * 1000 },
  { label: '24 Hours (1 Day)', value: '1d', ms: 24 * 60 * 60 * 1000 },
  { label: '3 Days', value: '3d', ms: 3 * 24 * 60 * 60 * 1000 },
  { label: '7 Days', value: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: 'Permanent (No Expiry)', value: 'never', ms: null },
  { label: 'Custom Date & Time', value: 'custom', ms: null },
];

/**
 * Compute expiration ISO string based on duration option
 */
export function computeExpiresAt(durationValue, customDateStr = null) {
  if (durationValue === 'never') return null;
  if (durationValue === 'custom' && customDateStr) {
    const d = new Date(customDateStr);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const match = NOTIFICATION_DURATIONS.find((d) => d.value === durationValue);
  if (match && match.ms) {
    return new Date(Date.now() + match.ms).toISOString();
  }
  // Default fallback: 24 hours
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Checks if a notification document is currently active and within its time limit
 */
export function isNotificationActive(notif) {
  if (!notif) return false;
  if (notif.active === false) return false;
  if (notif.expiresAt) {
    const expTime = new Date(notif.expiresAt).getTime();
    if (isNaN(expTime) || expTime <= Date.now()) {
      return false;
    }
  }
  return true;
}

/**
 * Formats a friendly human-readable time remaining string for active notifications
 */
export function formatTimeRemaining(expiresAt) {
  if (!expiresAt) return 'Permanent';
  const exp = new Date(expiresAt).getTime();
  if (isNaN(exp)) return 'Unknown';
  const diff = exp - Date.now();
  if (diff <= 0) return 'Expired';

  const mins = Math.floor(diff / (60 * 1000));
  if (mins < 60) {
    return `Expires in ${mins <= 1 ? '< 1m' : `${mins}m`}`;
  }
  const hours = Math.floor(diff / (60 * 60 * 1000));
  if (hours < 24) {
    const remMins = mins % 60;
    return remMins > 0 ? `Expires in ${hours}h ${remMins}m` : `Expires in ${hours}h`;
  }
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days < 7) {
    return `Expires in ${days}d`;
  }
  return `Expires on ${new Date(expiresAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

/**
 * Local read IDs tracking
 */
export function getReadNotifIds(uid) {
  if (!uid) return [];
  try {
    const raw = localStorage.getItem(`seed_read_notifs_${uid}`);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

export function markAsRead(uid, notifId) {
  if (!uid || !notifId) return;
  try {
    const existing = getReadNotifIds(uid);
    if (!existing.includes(notifId)) {
      const updated = [...existing, notifId];
      localStorage.setItem(`seed_read_notifs_${uid}`, JSON.stringify(updated));
    }
  } catch (_) {}
}

export function markAllAsRead(uid, notifIds = []) {
  if (!uid || !Array.isArray(notifIds)) return;
  try {
    const existing = new Set(getReadNotifIds(uid));
    notifIds.forEach((id) => existing.add(id));
    localStorage.setItem(`seed_read_notifs_${uid}`, JSON.stringify(Array.from(existing)));
  } catch (_) {}
}

/**
 * Real-time subscription for student notifications
 * Automatically filters by role ('all' | 'student'), tenant ('all' | student's tenant),
 * cohort, active status, and time limit.
 */
export function subscribeStudentNotifications(studentUser, onUpdate) {
  if (!onUpdate) return () => {};

  const colRef = collection(db, 'notifications');
  const q = query(colRef, orderBy('createdAt', 'desc'));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const now = Date.now();
      const studentTenant = (studentUser?.tenantId || studentUser?.college || '').trim().toLowerCase();

      const items = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const id = docSnap.id;

        // 1. Check active status
        if (data.active === false) return;

        // 2. Check time limit / expiration
        if (data.expiresAt) {
          const expTime = new Date(data.expiresAt).getTime();
          if (!isNaN(expTime) && expTime <= now) return; // Expired!
        }

        // 3. Check target role
        const targetRole = (data.targetRole || 'all').toLowerCase();
        if (targetRole !== 'all' && targetRole !== 'student') return;

        // 4. Check target tenant / college (Strict college isolation)
        const targetTenant = (data.targetTenantId || 'all').toLowerCase();
        if (targetTenant !== 'all') {
          if (!studentTenant) return;
          if (targetTenant !== studentTenant && !studentTenant.includes(targetTenant) && !targetTenant.includes(studentTenant)) {
            return;
          }
        }

        // 5. Check target cohort / batch
        const targetCohort = (data.targetCohortId || data.targetBatch || 'all').toLowerCase();
        if (targetCohort !== 'all') {
          const sCohort = (studentUser?.cohortId || '').toLowerCase();
          const sYear = (studentUser?.year || '').toLowerCase();
          const sBatch = (studentUser?.batch || studentUser?.academicYear || '').toLowerCase();
          const cohortMatched =
            (sCohort && (sCohort === targetCohort || sCohort.includes(targetCohort) || targetCohort.includes(sCohort))) ||
            (sYear && (sYear === targetCohort || sYear.includes(targetCohort) || targetCohort.includes(sYear))) ||
            (sBatch && (sBatch === targetCohort || sBatch.includes(targetCohort) || targetCohort.includes(sBatch)));
          if (!cohortMatched) return;
        }

        items.push({ id, ...data });
      });

      onUpdate(items);
    },
    (err) => {
      console.warn('[notificationService] Student subscribe error:', err);
      onUpdate([]);
    }
  );

  return unsubscribe;
}

export default {
  NOTIFICATION_TYPES,
  NOTIFICATION_DURATIONS,
  computeExpiresAt,
  isNotificationActive,
  formatTimeRemaining,
  getReadNotifIds,
  markAsRead,
  markAllAsRead,
  subscribeStudentNotifications,
};
