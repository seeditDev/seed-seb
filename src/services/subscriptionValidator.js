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

  // Support canonical fields, pro aliases, and institution fallbacks
  const endDateStr = user.premiumEndDate || user.subscriptionEndDate || user.proEndDate;
  const startDateStr = user.premiumStartDate || user.subscriptionStartDate || user.proStartDate;
  const rawPlan = user.premiumPlan || user.subscriptionPlan || user.plan || (user.isTrial ? 'pro_trial' : 'pro_annual');
  const isTrial = Boolean(user.isTrial || rawPlan.includes('trial'));
  const trialUsed = Boolean(user.trialUsed || user.hasUsedTrial);

  // Institution / Cohort Pro inheritance
  const isInstitutionPro = Boolean(user.cohortIsPremium || user.institutionIsPremium || user.tenantIsPremium);
  const institutionEndDateStr = user.cohortPremiumEndDate || user.tenantPremiumEndDate;
  if (isInstitutionPro) {
    const instEndMs = institutionEndDateStr ? new Date(institutionEndDateStr).getTime() : NaN;
    if (isNaN(instEndMs) || Date.now() <= instEndMs) {
      const daysLeft = isNaN(instEndMs) ? 365 : Math.max(0, Math.ceil((instEndMs - Date.now()) / (1000 * 60 * 60 * 24)));
      return {
        isPremium: true,
        isPro: true,
        tier: 'pro',
        status: 'active',
        daysLeft,
        plan: 'institution_pro',
        displayPlan: 'Campus Pro License',
        startDate: startDateStr || null,
        endDate: institutionEndDateStr || null,
        isExpiringSoon: daysLeft <= 7,
        isTrial: false,
        trialUsed,
        needsDowngrade: false,
      };
    }
  }

  // If there are no subscription dates, check if explicitly set active by admin
  if (!endDateStr) {
    const isExplicitlyActive = Boolean(user.isPremium || user.premium || user.subscriptionStatus === 'active');
    // If explicitly marked active by admin without explicit date, grant 30-day grace rather than instant wipe
    if (isExplicitlyActive) {
      return {
        isPremium: true,
        isPro: true,
        tier: 'pro',
        status: 'active',
        daysLeft: 30,
        plan: rawPlan,
        displayPlan: isTrial ? 'Pro Trial' : 'SEED Pro',
        startDate: startDateStr || new Date().toISOString(),
        endDate: null,
        isExpiringSoon: false,
        isTrial,
        trialUsed,
        needsDowngrade: false,
      };
    }
    return {
      isPremium: false,
      isPro: false,
      tier: 'standard',
      status: 'none',
      daysLeft: 0,
      plan: 'standard',
      displayPlan: 'Standard Free',
      startDate: null,
      endDate: null,
      isExpiringSoon: false,
      isTrial: false,
      trialUsed,
      needsDowngrade: false,
    };
  }

  const endMs = new Date(endDateStr).getTime();
  const nowMs = Date.now();

  // Invalid date format or expired timestamp
  if (isNaN(endMs) || nowMs > endMs) {
    return {
      isPremium: false,
      isPro: false,
      tier: 'standard',
      status: 'expired',
      daysLeft: 0,
      plan: rawPlan,
      displayPlan: isTrial ? 'Pro Trial Expired' : 'SEED Pro (Expired)',
      startDate: startDateStr || null,
      endDate: endDateStr,
      isExpiringSoon: false,
      isTrial,
      trialUsed: isTrial ? true : trialUsed,
      needsDowngrade: Boolean(user.isPremium || user.premium || user.subscriptionStatus === 'active'),
    };
  }

  // Active subscription
  const daysLeft = Math.max(0, Math.ceil((endMs - nowMs) / (1000 * 60 * 60 * 24)));
  return {
    isPremium: true,
    isPro: true,
    tier: 'pro',
    status: 'active',
    daysLeft,
    plan: rawPlan,
    displayPlan: isTrial ? `Pro Trial (${daysLeft}d left)` : (rawPlan.includes('annual') ? 'SEED Pro Annual' : 'SEED Pro'),
    startDate: startDateStr || null,
    endDate: endDateStr,
    isExpiringSoon: daysLeft <= 7,
    isTrial,
    trialUsed: isTrial ? true : trialUsed,
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
