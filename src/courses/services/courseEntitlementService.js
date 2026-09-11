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
export const fetchUserEntitledCourseIds = async (user = null) => {
  const effectiveUser = user || getCurrentAuthUser();
  const uid = effectiveUser?.uid || effectiveUser?.id || 'anonymous';

  // Check session cache
  try {
    const cached = sessionStorage.getItem(`${CACHE_KEY_PREFIX}${uid}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      memoryCache = new Set(parsed);
      memoryCacheUid = uid;
      return memoryCache;
    }
  } catch (_) {}

  // 1. Strict Subscription Validation: Check if user has active, unexpired SEED Premium
  const subStatus = checkSubscriptionStatus(effectiveUser);
  const isSuperOrAdmin = effectiveUser?.role === 'superadmin' || effectiveUser?.role === 'admin';
  const hasActivePremium = (subStatus.isPremium && subStatus.status === 'active') || isSuperOrAdmin;

  if (hasActivePremium) {
    const allSet = new Set(['*']);
    memoryCache = allSet;
    memoryCacheUid = uid;
    try {
      sessionStorage.setItem(`${CACHE_KEY_PREFIX}${uid}`, JSON.stringify(['*']));
    } catch (_) {}
    return allSet;
  }

  let tenantId = effectiveUser?.tenantId || effectiveUser?.college || effectiveUser?.institutionId;
  let userCohort = effectiveUser?.cohortId || effectiveUser?.year;
  
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
            sessionStorage.setItem(`${CACHE_KEY_PREFIX}${uid}`, JSON.stringify(['*']));
          } catch (_) {}
          return allSet;
        }
        tenantId = tenantId || uData.tenantId || uData.college || uData.collegeCode;
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
      const q = query(
        colRef,
        where('tenantId', '==', tenantId),
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
          if (uCohortNorm && eCohortNorm && uCohortNorm === eCohortNorm) {
            entitledSet.add(courseId);
          }
        }
      });
    } catch (err) {
      console.warn('[courseEntitlementService] Failed to fetch tenant entitlements:', err);
    }
  }

  memoryCache = entitledSet;
  memoryCacheUid = uid;
  try {
    sessionStorage.setItem(`${CACHE_KEY_PREFIX}${uid}`, JSON.stringify(Array.from(entitledSet)));
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

  // 3. Standard user: Check institutional tenant/cohort assignment
  const rawSet = entitledCourseIds || memoryCache;
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

  // Standard user without mapping or expired premium
  return {
    entitled: false,
    reason: subStatus.status === 'expired'
      ? 'Your SEED Premium has expired. Upgrade on seedit.site or purchase this course individually for lifetime access.'
      : 'Restricted: This course is not mapped to your institution. Purchase individually on seedit.site or subscribe to SEED Premium.',
    badge: '🔒 Locked',
    isLocked: true,
  };
};

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
