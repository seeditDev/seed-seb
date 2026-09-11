/**
 * courseEntitlementService.js
 * Multi-tenant access control and entitlement resolver for RealCourses.
 * 
 * Rules:
 * 1. Disabled check: Disabled courses (enabled === false) are completely inaccessible.
 * 2. SEED Premium check: Users with verified isPremium === true (or admin/superadmin role)
 *    get unrestricted access to all RealCourses.
 * 3. Standard users: CANNOT enroll in or access any RealCourse UNLESS it is explicitly
 *    mapped to their tenant (via active realCourseEntitlements for their tenant/cohort).
 */

import { db } from '../../lib/firebase-config';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

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
 * Returns a Set of courseIds, or a Set containing '*' for premium/admin users.
 */
export const fetchUserEntitledCourseIds = async (user = null) => {
  const effectiveUser = user || getCurrentAuthUser();
  const uid = effectiveUser?.uid || effectiveUser?.id || 'anonymous';

  if (memoryCache && memoryCacheUid === uid) {
    return memoryCache;
  }

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

  // 1. Premium & Admin users have unrestricted access to all courses
  if (effectiveUser?.isPremium === true || effectiveUser?.role === 'superadmin' || effectiveUser?.role === 'admin') {
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
  let userAllocatedCourses = Array.isArray(effectiveUser?.assignedRealCourses) ? effectiveUser.assignedRealCourses : [];

  // If user metadata is missing from local session, fetch live profile from users/{uid}
  if ((!tenantId || effectiveUser?.isPremium === undefined || userAllocatedCourses.length === 0) && uid && uid !== 'anonymous' && navigator.onLine) {
    try {
      const userSnap = await getDoc(doc(db, 'users', uid));
      if (userSnap.exists()) {
        const uData = userSnap.data();
        if (uData.isPremium === true || uData.role === 'admin' || uData.role === 'superadmin') {
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
      }
    } catch (_) {}
  }

  const entitledSet = new Set();

  // 2. Direct User Allocation (Directly assigned courses bypass tenant mapping)
  userAllocatedCourses.forEach((cId) => {
    if (cId) entitledSet.add(cId);
  });

  // 3. Standard Users: Entitled if course is mapped to their tenant/cohort
  if (tenantId && navigator.onLine) {
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
          const normECohort = normalizeYear(eCohort);
          const normUCohort = normalizeYear(userCohort);
          if (normECohort === normUCohort || eCohort === String(userCohort).trim().toUpperCase()) {
            entitledSet.add(courseId);
          }
        } else {
          // If no specific cohort is assigned to the student, allow all courses mapped to their tenant
          entitledSet.add(courseId);
        }
      });
    } catch (e) {
      console.warn('[courseEntitlementService] Entitlements fetch warning:', e.message);
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
 * Determine entitlement for a single course against a user profile and entitled set.
 * Standard users can ONLY enroll if course is mapped to their tenant.
 */
export const checkCourseEntitlement = (course, user = null, entitledCourseIds = null) => {
  if (!course) return { entitled: false, reason: 'Course not found', badge: 'Unavailable', isLocked: true };

  if (course.enabled === false) {
    return {
      entitled: false,
      reason: 'Course is temporarily unavailable',
      badge: 'Inactive',
      isLocked: true,
    };
  }

  const effectiveUser = user || getCurrentAuthUser();

  // 1. Premium / Superadmin
  if (effectiveUser?.isPremium === true || effectiveUser?.role === 'superadmin' || effectiveUser?.role === 'admin') {
    return {
      entitled: true,
      reason: 'Included with SEED Premium',
      badge: 'Premium Access',
      isLocked: false,
    };
  }

  const courseId = course.courseId || course.id;

  // 2. Direct User-Specific Allocation
  const userAllocatedCourses = Array.isArray(effectiveUser?.assignedRealCourses) 
    ? effectiveUser.assignedRealCourses 
    : (Array.isArray(effectiveUser?.assignedCourses) ? effectiveUser.assignedCourses : []);
  if (userAllocatedCourses.includes(courseId)) {
    return {
      entitled: true,
      reason: 'Directly allocated to your student account',
      badge: 'Directly Allocated',
      isLocked: false,
    };
  }

  // 3. Standard user: Check institutional tenant/cohort assignment
  const set = entitledCourseIds || memoryCache;

  if (set && (set.has('*') || set.has(courseId))) {
    return {
      entitled: true,
      reason: 'Assigned to your College Institution',
      badge: 'Institution Enrolled',
      isLocked: false,
    };
  }

  // Standard user without tenant mapping is locked
  return {
    entitled: false,
    reason: 'Restricted: This course is not mapped to your institution. Contact your faculty or upgrade to SEED Premium to unlock.',
    badge: '🔒 Institutional Access Only',
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
