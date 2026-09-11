/**
 * subscriptionValidator.js — Unified Subscription & Premium Lifecycle Engine
 *
 * Enforces strict temporal validation for SEED Premium:
 * - Requires explicit premiumStartDate and premiumEndDate.
 * - Dynamic validation: isPremium is strictly true ONLY while now <= premiumEndDate.
 * - If now > premiumEndDate, user is expired and automatically downgraded to Standard.
 * - Proactive renewal reminders when daysLeft <= 7.
 */

import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Validates a user object's subscription and returns a comprehensive status descriptor.
 *
 * @param {object} user - User document or authData
 * @returns {{
 *   isPremium: boolean,
 *   status: 'active' | 'expired' | 'none',
 *   daysLeft: number,
 *   plan: string,
 *   startDate: string | null,
 *   endDate: string | null,
 *   isExpiringSoon: boolean,
 *   needsDowngrade: boolean
 * }}
 */
export function checkSubscriptionStatus(user) {
  if (!user || (!user.uid && !user.email)) {
    return {
      isPremium: false,
      status: 'none',
      daysLeft: 0,
      plan: 'none',
      startDate: null,
      endDate: null,
      isExpiringSoon: false,
      needsDowngrade: false,
    };
  }

  // Support both canonical fields and legacy fallbacks if present
  const endDateStr = user.premiumEndDate || user.subscriptionEndDate;
  const startDateStr = user.premiumStartDate || user.subscriptionStartDate;
  const plan = user.premiumPlan || (user.subscriptionPlan || 'premium_annual');

  // If there are no subscription dates, user has no active validated subscription
  if (!endDateStr) {
    const hadLegacyFlag = Boolean(user.isPremium || user.premium);
    return {
      isPremium: false,
      status: hadLegacyFlag ? 'expired' : 'none',
      daysLeft: 0,
      plan: hadLegacyFlag ? plan : 'none',
      startDate: null,
      endDate: null,
      isExpiringSoon: false,
      needsDowngrade: hadLegacyFlag, // Downgrade legacy unverified flags
    };
  }

  const endMs = new Date(endDateStr).getTime();
  const nowMs = Date.now();

  // Invalid date format or expired timestamp
  if (isNaN(endMs) || nowMs > endMs) {
    return {
      isPremium: false,
      status: 'expired',
      daysLeft: 0,
      plan,
      startDate: startDateStr || null,
      endDate: endDateStr,
      isExpiringSoon: false,
      needsDowngrade: Boolean(user.isPremium || user.premium || user.subscriptionStatus === 'active'),
    };
  }

  // Active subscription
  const daysLeft = Math.max(0, Math.ceil((endMs - nowMs) / (1000 * 60 * 60 * 24)));
  return {
    isPremium: true,
    status: 'active',
    daysLeft,
    plan,
    startDate: startDateStr || null,
    endDate: endDateStr,
    isExpiringSoon: daysLeft <= 7,
    needsDowngrade: false,
  };
}

/**
 * Checks Firestore document data and downgrades expired users in the database.
 *
 * @param {object} user - Current user object
 * @param {import('firebase/firestore').Firestore} db - Firestore database instance
 * @returns {Promise<object>} Fresh validated status
 */
export async function syncAndValidateSubscription(user, db) {
  if (!user?.uid || !db) {
    return checkSubscriptionStatus(user);
  }

  const status = checkSubscriptionStatus(user);

  // If subscription has expired or user had an unverified isPremium flag, persist downgrade
  if (status.needsDowngrade) {
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        isPremium: false,
        premium: false,
        subscriptionStatus: 'expired',
        updatedAt: serverTimestamp(),
      });
      // Update local cache
      try {
        const cached = JSON.parse(localStorage.getItem('auth_data') || '{}');
        if (cached && (cached.uid === user.uid || cached.email === user.email)) {
          cached.isPremium = false;
          cached.premium = false;
          cached.subscriptionStatus = 'expired';
          localStorage.setItem('auth_data', JSON.stringify(cached));
        }
      } catch (_) {}
    } catch (err) {
      console.warn('[subscriptionValidator] Failed to write downgrade to Firestore:', err);
    }
  }

  return status;
}
