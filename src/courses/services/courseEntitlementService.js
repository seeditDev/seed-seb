/**
 * courseEntitlementService.js
 * Multi-tenant access control and entitlement resolver for RealCourses.
 * 
 * Rules:
 * 1. Disabled check: Disabled courses (enabled === false) are completely inaccessible.
 * 2. Lifetime access: Individually purchased or directly assigned courses (assignedRealCourses,
 *    purchasedCourses) belong to the user permanently (lifetime) — accessible to standard users
 *    regardless of premium status.
 * 3. SEED Premium check: Users with an active, unexpired SEED Premium subscription
 *    (or admin/superadmin role) get unrestricted access to all courses while active.
 * 4. Standard users: If not purchased and not premium, access depends on institutional
 *    tenant/cohort mappings (only active if user's tenant is enabled).
 */

import React from 'react';
import { db } from '../../lib/firebase-config';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { checkSubscriptionStatus } from '../../services/subscriptionValidator';

const ENTITLEMENTS_COLLECTION = 'realCourseEntitlements';
const CACHE_KEY_PREFIX = 'seed_entitled_courses_';
let memoryCache = null;
let memoryCacheUid = null;

export const getCurrentAuthUser = () => {
  try {
    const raw = localStorage.getItem('auth_data');
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  try {
    const rawUser = localStorage.getItem('user');
    if (rawUser) return JSON.parse(rawUser);
  } catch (_) {}
  return null;
};

// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Normalizes year strings (e.g. "2026", "2K26", "2k26" -> "2026")
 */
function normalizeYear(val) {
  if (!val) return '';
  const s = String(val).trim().toUpperCase();
  if (s.startsWith('2K')) return '20' + s.slice(2);
  return s;
}

/**
 * Fetch all entitled course IDs for the user.
 * Returns a Set of courseIds, or a Set containing '*' for active premium/admin users.
 */
export const fetchUserEntitledCourseIds = async (user = null, forceRefresh = false) => {
  const effectiveUser = user || getCurrentAuthUser();
  const uid = effectiveUser?.uid || effectiveUser?.id || 'anonymous';

  // Check session cache with TTL
  if (!forceRefresh) {
    try {
      const cached = sessionStorage.getItem(`${CACHE_KEY_PREFIX}${uid}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        const timestamp = parsed.timestamp || 0;
        const items = parsed.items || (Array.isArray(parsed) ? parsed : null);
        if (items && (Date.now() - timestamp < CACHE_TTL_MS || !parsed.timestamp)) {
          memoryCache = new Set(items);
          memoryCacheUid = uid;
          return memoryCache;
        }
      }
    } catch (_) {}
  }

  // 1. Strict Subscription Validation: Check if user has active, unexpired SEED Premium
  const subStatus = checkSubscriptionStatus(effectiveUser);
  const isSuperOrAdmin = effectiveUser?.role === 'superadmin' || effectiveUser?.role === 'admin';
  const hasActivePremium = (subStatus.isPremium && subStatus.status === 'active') || isSuperOrAdmin;

  if (hasActivePremium) {
    const allSet = new Set(['*']);
    memoryCache = allSet;
    memoryCacheUid = uid;
    try {
      sessionStorage.setItem(`${CACHE_KEY_PREFIX}${uid}`, JSON.stringify({
        timestamp: Date.now(),
        items: ['*']
      }));
    } catch (_) {}
    return allSet;
  }

  let tenantId = effectiveUser?.tenantId || effectiveUser?.college || effectiveUser?.institutionId || effectiveUser?.collegeCode;
  let userCohort = effectiveUser?.cohortId || effectiveUser?.year;
  const userDept = String(effectiveUser?.department || '').trim().toUpperCase();
  
  // Extract all directly owned / purchased courses (LIFETIME)
  let userAllocatedCourses = Array.isArray(effectiveUser?.assignedRealCourses) ? [...effectiveUser.assignedRealCourses] : [];
  if (Array.isArray(effectiveUser?.assignedCourses)) {
    userAllocatedCourses.push(...effectiveUser.assignedCourses);
  }
  if (effectiveUser?.purchasedCourses && typeof effectiveUser.purchasedCourses === 'object') {
    Object.keys(effectiveUser.purchasedCourses).forEach((cId) => {
      if (cId && !userAllocatedCourses.includes(cId)) userAllocatedCourses.push(cId);
    });
  }

  // If user metadata is missing from local session, fetch live profile from users/{uid}
  if ((!tenantId || userAllocatedCourses.length === 0) && uid && uid !== 'anonymous' && navigator.onLine) {
    try {
      const userSnap = await getDoc(doc(db, 'users', uid));
      if (userSnap.exists()) {
        const uData = userSnap.data();
        const liveSub = checkSubscriptionStatus(uData);
        if ((liveSub.isPremium && liveSub.status === 'active') || uData.role === 'admin' || uData.role === 'superadmin') {
          const allSet = new Set(['*']);
          memoryCache = allSet;
          memoryCacheUid = uid;
          try {
            sessionStorage.setItem(`${CACHE_KEY_PREFIX}${uid}`, JSON.stringify({
              timestamp: Date.now(),
              items: ['*']
            }));
          } catch (_) {}
          return allSet;
        }
        tenantId = tenantId || uData.tenantId || uData.college || uData.collegeCode || uData.institutionId;
        userCohort = userCohort || uData.cohortId || uData.year;
        if (Array.isArray(uData.assignedRealCourses)) {
          userAllocatedCourses = Array.from(new Set([...userAllocatedCourses, ...uData.assignedRealCourses]));
        }
        if (uData.purchasedCourses && typeof uData.purchasedCourses === 'object') {
          Object.keys(uData.purchasedCourses).forEach((cId) => {
            if (cId && !userAllocatedCourses.includes(cId)) userAllocatedCourses.push(cId);
          });
        }
      }
    } catch (_) {}
  }

  const entitledSet = new Set();

  // 2. Direct User Allocation (Purchased Lifetime Courses bypass tenant mapping completely)
  userAllocatedCourses.forEach((cId) => {
    if (cId) entitledSet.add(cId);
  });

  // 3. Standard Users: Entitled if course is mapped to their tenant/cohort (ONLY if tenant is active)
  const isTenantActive = !effectiveUser?.isTenantDisabled && effectiveUser?.tenantActive !== false;
  if (tenantId && isTenantActive && navigator.onLine) {
    try {
      const colRef = collection(db, ENTITLEMENTS_COLLECTION);
      
      // Query candidate tenant IDs (exact, trimmed, lowercase/uppercase)
      const candidateTenants = Array.from(new Set([
        String(tenantId).trim(),
        String(effectiveUser?.tenantId || '').trim(),
        String(effectiveUser?.collegeCode || '').trim(),
      ].filter(Boolean)));

      for (const tId of candidateTenants) {
        const q = query(
          colRef,
          where('tenantId', '==', tId),
          where('status', '==', 'ACTIVE')
        );
        const snap = await getDocs(q);
        snap.forEach((d) => {
          const data = d.data();
          const courseId = data.courseId;
          if (!courseId) return;

          const eCohort = String(data.cohortId || '').trim().toUpperCase();
          if (!eCohort || eCohort === 'ALL') {
            entitledSet.add(courseId);
          } else if (userCohort) {
            const uCohortNorm = normalizeYear(userCohort);
            const eCohortNorm = normalizeYear(eCohort);
            const rawUserCohort = String(userCohort).trim().toUpperCase();
            
            // 1. Direct equality or normalized year equality
            const exactMatch = rawUserCohort === eCohort || (uCohortNorm && eCohortNorm && uCohortNorm === eCohortNorm);
            
            // 2. Department or cohort substring match (e.g. 2K27-CSE vs 2027)
            const prefixMatch = uCohortNorm && (eCohortNorm.startsWith(uCohortNorm) || eCohort.startsWith(rawUserCohort));
            const deptMatch = !userDept || eCohort.includes(userDept) || !eCohort.includes('-');

            if (exactMatch || (prefixMatch && deptMatch)) {
              entitledSet.add(courseId);
            }
          }
        });
      }
    } catch (err) {
      console.warn('[courseEntitlementService] Failed to fetch tenant entitlements:', err);
    }
  }

  memoryCache = entitledSet;
  memoryCacheUid = uid;
  try {
    sessionStorage.setItem(`${CACHE_KEY_PREFIX}${uid}`, JSON.stringify({
      timestamp: Date.now(),
      items: Array.from(entitledSet)
    }));
  } catch (_) {}

  return entitledSet;
};

/**
 * Synchronously checks whether a specific course is entitled.
 *
 * @param {object} course - The course object
 * @param {Set<string>} entitledCourseIds - Pre-fetched entitled IDs
 * @param {object} user - Optional user object override
 * @returns {{ entitled: boolean, reason: string, badge: string, isLocked: boolean, isLifetime?: boolean }}
 */
export const checkCourseEntitlement = (course, arg2 = null, arg3 = null) => {
  if (!course) {
    return {
      entitled: false,
      reason: 'Course metadata unavailable',
      badge: 'Unavailable',
      isLocked: true,
    };
  }

  // Polymorphic argument normalization: supports (course, user, entitledSet) and (course, entitledSet, user)
  let entitledCourseIds = null;
  let userOverride = null;

  if (arg2 instanceof Set || (arg2 && typeof arg2.has === 'function')) {
    entitledCourseIds = arg2;
    userOverride = arg3 && typeof arg3 === 'object' && !(arg3 instanceof Set) ? arg3 : null;
  } else if (Array.isArray(arg2)) {
    entitledCourseIds = new Set(arg2);
    userOverride = arg3 && typeof arg3 === 'object' && !(arg3 instanceof Set) ? arg3 : null;
  } else if (arg2 && typeof arg2 === 'object') {
    userOverride = arg2;
    if (arg3 instanceof Set || (arg3 && typeof arg3.has === 'function')) {
      entitledCourseIds = arg3;
    } else if (Array.isArray(arg3)) {
      entitledCourseIds = new Set(arg3);
    }
  }

  // 0. Course Disabled Check (Global Kill Switch)
  if (course.enabled === false) {
    return {
      entitled: false,
      reason: 'This track is currently under maintenance or disabled by administrator.',
      badge: 'Course Disabled',
      isLocked: true,
    };
  }

  const effectiveUser = userOverride || getCurrentAuthUser();
  const uid = effectiveUser?.uid || effectiveUser?.id || 'anonymous';
  const courseId = course.courseId || course.id;

  // 1. LIFETIME ACCESS: Check if course was individually purchased or directly allocated
  const userAllocated = Array.isArray(effectiveUser?.assignedRealCourses)
    ? effectiveUser.assignedRealCourses
    : (Array.isArray(effectiveUser?.assignedCourses) ? effectiveUser.assignedCourses : []);
  const hasPurchasedDict = Boolean(effectiveUser?.purchasedCourses?.[courseId]);

  if (userAllocated.includes(courseId) || hasPurchasedDict) {
    return {
      entitled: true,
      reason: 'Lifetime access — individually purchased / allocated course',
      badge: 'Lifetime Access',
      isLocked: false,
      isLifetime: true,
    };
  }

  // 2. ACTIVE PREMIUM CHECK: Only grants full library access while subscription is unexpired
  const subStatus = checkSubscriptionStatus(effectiveUser);
  const isSuperOrAdmin = effectiveUser?.role === 'superadmin' || effectiveUser?.role === 'admin';
  if ((subStatus.isPremium && subStatus.status === 'active') || isSuperOrAdmin) {
    return {
      entitled: true,
      reason: 'Included with active SEED Premium',
      badge: 'Premium Access',
      isLocked: false,
    };
  }

  // 3. Free Track Check
  if (course.isFree) {
    return {
      entitled: true,
      reason: 'Free track provided by SEED-IT Academy',
      badge: 'Free Track',
      isLocked: false,
    };
  }

  // 4. Standard user: Check institutional tenant/cohort assignment
  let rawSet = entitledCourseIds || memoryCache;
  if (!rawSet && typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const cached = sessionStorage.getItem(`${CACHE_KEY_PREFIX}${uid}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        const items = parsed.items || (Array.isArray(parsed) ? parsed : null);
        if (items) {
          memoryCache = new Set(items);
          memoryCacheUid = uid;
          rawSet = memoryCache;
        }
      }
    } catch (_) {}
  }

  const set = (rawSet instanceof Set || (rawSet && typeof rawSet.has === 'function'))
    ? rawSet
    : (Array.isArray(rawSet) ? new Set(rawSet) : null);

  if (set && (set.has('*') || set.has(courseId))) {
    return {
      entitled: true,
      reason: 'Assigned to your College Institution',
      badge: 'Institution Enrolled',
      isLocked: false,
    };
  }

  // 5. Standard user without full access: FREEMIUM PREVIEW (Module 1 Free)
  return {
    entitled: false,
    isLocked: false, // Accessible in preview mode
    isPreview: true,
    previewMaxModuleIndex: 0, // Module 1 (index 0) is completely free
    reason: subStatus.status === 'expired'
      ? 'Your SEED Premium has expired. Module 1 is available as Free Preview. Renew or buy lifetime access to continue.'
      : 'Free Preview: Module 1 is unlocked for you. Upgrade to SEED Premium or buy lifetime access to continue to Module 2 and beyond.',
    badge: '✨ Free Preview',
  };
};

/**
 * Checks whether a student can access a specific module by index (0-based).
 * @param {number} moduleIndex - 0-based module index (Module 1 is index 0).
 * @param {object} entitlement - Result from checkCourseEntitlement().
 * @returns {{ canAccess: boolean, reason?: string }}
 */
export function checkModuleAccess(moduleIndex, entitlement) {
  if (!entitlement) return { canAccess: true };
  if (entitlement.entitled || !entitlement.isPreview) {
    return { canAccess: true };
  }
  // Freemium preview: only Module 1 (index 0) is allowed
  if (moduleIndex === 0) {
    return { canAccess: true };
  }
  return {
    canAccess: false,
    reason: 'Module locked. Free preview covers Module 1. Upgrade to SEED Premium or purchase lifetime access to unlock Module 2 and beyond.'
  };
}

/**
 * Invalidate cached entitlements (e.g. on user login, logout, or refresh).
 */
export const invalidateEntitlementsCache = () => {
  memoryCache = null;
  memoryCacheUid = null;
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(CACHE_KEY_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    }
  } catch (_) {}
};

/**
 * React hook to reactively resolve and update course entitlement state.
 */
export function useCourseEntitlement(course, user = null) {
  const [entitlement, setEntitlement] = React.useState(() => checkCourseEntitlement(course, user));
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true;
    const effectiveUser = user || getCurrentAuthUser();
    
    // Immediate initial sync from memory/sessionStorage
    setEntitlement(checkCourseEntitlement(course, effectiveUser));

    // Live background resolution
    fetchUserEntitledCourseIds(effectiveUser)
      .then((entitledSet) => {
        if (isMounted) {
          setEntitlement(checkCourseEntitlement(course, effectiveUser, entitledSet));
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [course?.courseId || course?.id, user?.uid, user?.tenantId, user?.cohortId]);

  return { entitlement, loading };
}

