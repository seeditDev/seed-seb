import { db } from '../firebase-config';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  limit,
  documentId,
  getDocs,
  arrayUnion,
  serverTimestamp,
  runTransaction,
} from 'firebase/firestore';
import { requireTenant, tenantDepartment } from '../utils/tenant';

/**
 * Batched assessment-completion lookup.
 *
 * BUG FIXED (P0): StudentDashboard looped every assessment through a
 * Promise.all of per-item getDoc / MCQService.checkExistingAttempt /
 * CodingAssessmentService.checkExistingAttempt. 30 assessments cost 30-90
 * uncached Firestore reads on EVERY dashboard mount and every tab switch.
 *
 * This module replaces that with:
 *   1. a single read of the denormalised `completedAssessmentIds` array on the
 *      student's user document (fast path, 1 read), and
 *   2. a bounded fallback: at most one `documentId() in [...]` query per
 *      student-scoped result collection, chunked at 30 ids (Firestore's limit).
 *
 * A 60s sessionStorage cache stops tab switches from re-fetching at all.
 */

const CACHE_PREFIX = 'assessmentCompletion_';
const CACHE_TTL_MS = 60 * 1000;
const IN_CHUNK = 30;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const isCompletedDoc = (data) =>
  data?.completed === true ||
  data?.submitted === true ||
  data?.status === 'submitted' ||
  data?.status === 'submitting';

function cacheKey(email) {
  return `${CACHE_PREFIX}${String(email || '').toLowerCase()}`;
}

export function readCompletionCache(email) {
  try {
    const raw = sessionStorage.getItem(cacheKey(email));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.at || Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed.map || null;
  } catch (_) {
    return null;
  }
}

function writeCompletionCache(email, map) {
  try {
    sessionStorage.setItem(cacheKey(email), JSON.stringify({ at: Date.now(), map }));
  } catch (_) {}
}

export function invalidateCompletionCache(email) {
  try {
    sessionStorage.removeItem(cacheKey(email));
  } catch (_) {}
}

/** Collections (relative to the student document) that hold per-assessment results. */
function studentResultCollections(tenant) {
  const dept = tenantDepartment(tenant);
  const base = `colleges/${tenant.college}/years/${tenant.year}/departments/${dept}/students/${tenant.email}`;
  return [`${base}/mcq_results`, `${base}/coding_results`, `${base}/sea_results`];
}

async function queryCollectionForIds(path, ids) {
  const found = {};
  for (const ids30 of chunk(ids, IN_CHUNK)) {
    try {
      const snap = await getDocs(
        query(collection(db, path), where(documentId(), 'in', ids30), limit(IN_CHUNK))
      );
      snap.forEach((d) => {
        if (isCompletedDoc(d.data())) found[d.id] = true;
      });
    } catch (e) {
      // Missing collection / index issues must not break the dashboard.
      console.warn('[attemptStatusService] batch query skipped for', path, e?.message);
    }
  }
  return found;
}

/**
 * @param {object} userData signed-in profile
 * @param {string[]} assessmentIds ids shown on the dashboard
 * @param {{force?:boolean}} [options]
 * @returns {Promise<Record<string, boolean>>} id -> completed
 */
export async function fetchCompletionMap(userData, assessmentIds = [], options = {}) {
  const tenant = requireTenant(userData);
  const ids = Array.from(new Set(assessmentIds.filter(Boolean).map(String)));
  if (ids.length === 0) return {};

  if (!options.force) {
    const cached = readCompletionCache(tenant.email);
    if (cached) {
      const covered = ids.every((id) => id in cached);
      if (covered) return cached;
    }
  }

  const map = {};
  ids.forEach((id) => { map[id] = false; });

  // 1. Fast path — denormalised completion list on the user doc (1 read).
  let denormalisedComplete = false;
  try {
    const userSnap = await getDoc(doc(db, 'users', tenant.email));
    const list = userSnap.exists() ? userSnap.data()?.completedAssessmentIds : null;
    if (Array.isArray(list)) {
      list.forEach((id) => {
        if (id in map) map[id] = true;
      });
      denormalisedComplete = userSnap.data()?.completionIndexComplete === true;
    }
  } catch (e) {
    console.warn('[attemptStatusService] user completion index unavailable:', e?.message);
  }

  // 2. Bounded fallback for ids the index does not vouch for yet.
  if (!denormalisedComplete) {
    const unknown = ids.filter((id) => !map[id]);
    if (unknown.length > 0) {
      const paths = [...studentResultCollections(tenant), `users/${tenant.email}/contestAttempts`, `users/${tenant.email}/multiSectionAttempts`];
      const results = await Promise.all(paths.map((p) => queryCollectionForIds(p, unknown)));
      results.forEach((found) => {
        Object.keys(found).forEach((id) => { map[id] = true; });
      });
    }
  }

  writeCompletionCache(tenant.email, map);
  return map;
}

/**
 * Record completion on the student's user document so the dashboard never has
 * to fan out per-assessment reads again. Written transactionally at submission.
 */
export async function markAssessmentCompleted(userData, assessmentId) {
  if (!assessmentId) return false;
  let tenant;
  try {
    tenant = requireTenant(userData);
  } catch (e) {
    console.warn('[attemptStatusService] cannot index completion:', e.message);
    return false;
  }

  const ref = doc(db, 'users', tenant.email);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists() && Array.isArray(snap.data()?.completedAssessmentIds)
        ? snap.data().completedAssessmentIds
        : [];
      if (existing.includes(assessmentId)) return;
      tx.set(
        ref,
        {
          email: tenant.email,
          college: tenant.college,
          year: tenant.year,
          completedAssessmentIds: [...existing, assessmentId],
          completionIndexUpdatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
  } catch (e) {
    // Transaction contention / rules — fall back to a non-atomic arrayUnion.
    console.warn('[attemptStatusService] transaction failed, using arrayUnion:', e?.message);
    try {
      await setDoc(
        ref,
        {
          email: tenant.email,
          completedAssessmentIds: arrayUnion(assessmentId),
          completionIndexUpdatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e2) {
      console.warn('[attemptStatusService] completion index write failed:', e2?.message);
      return false;
    }
  }

  // Keep the local cache honest instead of waiting for the TTL.
  const cached = readCompletionCache(tenant.email);
  if (cached) writeCompletionCache(tenant.email, { ...cached, [assessmentId]: true });
  return true;
}

export default { fetchCompletionMap, markAssessmentCompleted, invalidateCompletionCache };
