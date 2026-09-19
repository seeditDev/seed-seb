/**
 * learningEngineService.js
 * Comprehensive progress and progression state machine for the new Course Learning Model.
 * Manages sequential topic unlocking, activity completion checkpoints, mini-assessments,
 * and XP/Credits disbursement.
 */

import { db } from '../../lib/firebase-config';
import { doc, getDoc, setDoc, collection, getDocs, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { markQuestionSolved } from '../../services/codingProgressService';
import { awardUserXPAndCredits, COURSE_GAMIFICATION_SPEC, calculateCourseRewards } from '../../utils/gamificationService';
import { flushActiveSessionTime, recordDailyProblemMetric } from './courseSessionTracker';

const LOCAL_PROGRESS_PREFIX = 'seed_learning_progress_';
const LOCAL_ENROLLED_KEY = 'seed_enrolled_courses_';

/**
 * Idempotently awards course milestone XP and credits to the progress object and user profile.
 */
const awardCourseMilestone = (uid, progress, course, type, key, xp, credits) => {
  if (!progress) return;
  if (!progress.gamification) {
    progress.gamification = { xpEarned: 0, creditsEarned: 0, awardedMap: {} };
  }
  if (!progress.gamification.awardedMap) {
    progress.gamification.awardedMap = {};
  }
  const itemKey = `${type}_${key}`;
  if (progress.gamification.awardedMap[itemKey]) {
    return; // Already awarded, idempotent
  }
  progress.gamification.awardedMap[itemKey] = true;
  progress.gamification.xpEarned = (progress.gamification.xpEarned || 0) + xp;
  progress.gamification.creditsEarned = (progress.gamification.creditsEarned || 0) + credits;

  if (uid && (xp > 0 || credits > 0)) {
    awardUserXPAndCredits(uid, xp, credits, `COURSE_${type.toUpperCase()}`, {
      courseId: course?.courseId,
      title: course?.title,
      type,
      key
    }).catch(e => console.warn('[LearningEngineService] awardUserXPAndCredits error:', e));
  }
};

/**
 * Checks if course reached 100% completion and awards remaining graduation bonus to meet course reward target.
 */
const checkCourseGraduation = (uid, progress, course) => {
  if (!progress || !course) return;
  if (progress.percentage >= 100 && !progress.gamification?.awardedCourseCompletion) {
    if (!progress.gamification) {
      progress.gamification = { xpEarned: 0, creditsEarned: 0, awardedMap: {} };
    }
    progress.gamification.awardedCourseCompletion = true;
    const courseRewards = calculateCourseRewards(course);
    const targetXP = courseRewards.totalXP;
    const targetCredits = courseRewards.totalCredits;

    const remainingXP = Math.max(0, targetXP - (progress.gamification.xpEarned || 0));
    const remainingCredits = Math.max(0, targetCredits - (progress.gamification.creditsEarned || 0));
    progress.gamification.xpEarned = (progress.gamification.xpEarned || 0) + remainingXP;
    progress.gamification.creditsEarned = (progress.gamification.creditsEarned || 0) + remainingCredits;

    if (uid && (remainingXP > 0 || remainingCredits > 0)) {
      awardUserXPAndCredits(uid, remainingXP, remainingCredits, 'COURSE_GRADUATION', {
        courseId: course?.courseId,
        title: course?.title
      }).catch(e => console.warn('[LearningEngineService] Course graduation award error:', e));
    }
  }
};

/**
 * Get all courses the student has enrolled in (synchronous local cache).
 */
export const getEnrolledCourseIds = (uid) => {
  if (!uid) return [];
  try {
    const raw = localStorage.getItem(`${LOCAL_ENROLLED_KEY}${uid}`);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list;
    }
  } catch (_) {}
  return [];
};

/**
 * Asynchronously fetch enrolled course IDs from Firestore with local storage sync.
 */
export const fetchEnrolledCourseIds = async (uid) => {
  const localIds = getEnrolledCourseIds(uid);
  if (!uid || uid === 'demo' || uid === 'demo-student' || !navigator.onLine) {
    return localIds;
  }
  try {
    const colRef = collection(db, 'users', uid, 'courseProgress');
    const snap = await getDocs(colRef);
    const firestoreIds = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (data.isEnrolled !== false || data.progressPercent > 0 || (data.completedTopics && data.completedTopics.length > 0)) {
        firestoreIds.push(docSnap.id);
      }
    });
    const merged = Array.from(new Set([...localIds, ...firestoreIds]));
    try {
      localStorage.setItem(`${LOCAL_ENROLLED_KEY}${uid}`, JSON.stringify(merged));
    } catch (_) {}
    return merged;
  } catch (e) {
    console.warn('[LearningEngineService] fetchEnrolledCourseIds fallback to local:', e.message);
    return localIds;
  }
};

/**
 * Enroll student into a course with local cache and Firestore cloud persistence.
 */
export const enrollCourse = async (uid, courseId) => {
  if (!uid || !courseId) return;

  // Strict entitlement check: standard users cannot enroll unless mapped to their tenant!
  try {
    const { fetchUserEntitledCourseIds, checkCourseEntitlement } = await import('./courseEntitlementService');
    const entitledSet = await fetchUserEntitledCourseIds();
    const ent = checkCourseEntitlement({ courseId }, null, entitledSet);
    if (ent.isLocked) {
      console.warn(`[LearningEngineService] Enrollment blocked: course "${courseId}" is not entitled for user ${uid}`);
      throw new Error(ent.reason || 'This course is restricted to assigned college cohorts or SEED Premium members.');
    }
  } catch (err) {
    if (err.message && (err.message.includes('restricted') || err.message.includes('not mapped') || err.message.includes('unavailable') || err.message.includes('Restricted'))) {
      throw err;
    }
  }

  const current = getEnrolledCourseIds(uid);
  if (!current.includes(courseId)) {
    const updated = [...current, courseId];
    try {
      localStorage.setItem(`${LOCAL_ENROLLED_KEY}${uid}`, JSON.stringify(updated));
    } catch (_) {}
  }

  // Persist enrollment to Firestore and increment live course count
  if (uid && uid !== 'demo' && uid !== 'demo-student' && navigator.onLine) {
    try {
      await setDoc(doc(db, 'users', uid, 'courseProgress', courseId), {
        courseId,
        isEnrolled: true,
        enrolledAt: serverTimestamp(),
        status: 'NOT_STARTED',
        progressPercent: 0,
        updatedAt: serverTimestamp()
      }, { merge: true });
      console.log(`[LearningEngineService] Enrolled user ${uid} in course ${courseId} on Firestore`);
    } catch (e) {
      console.warn('[LearningEngineService] Firestore enrollment error (non-fatal):', e.message);
    }
  }

  // Live increment of course enrolled count in Firestore 'realCourses' collection
  try {
    const { incrementCourseEnrollment } = await import('./courseMetadataService');
    await incrementCourseEnrollment(courseId);
  } catch (_) {}
};

/**
 * Unenroll student from a course, resetting progress and decrementing count.
 */
export const unenrollCourse = async (uid, courseId) => {
  if (!uid || !courseId) return false;

  // 1. Remove from local enrolled list
  const current = getEnrolledCourseIds(uid);
  const updated = current.filter(id => id !== courseId);
  try {
    localStorage.setItem(`${LOCAL_ENROLLED_KEY}${uid}`, JSON.stringify(updated));
  } catch (_) {}

  // 2. Clear local course progress
  try {
    localStorage.removeItem(`${LOCAL_PROGRESS_PREFIX}${uid}_${courseId}`);
  } catch (_) {}

  // 3. Delete progress document in Firestore
  if (uid && uid !== 'demo' && uid !== 'demo-student' && navigator.onLine) {
    try {
      const progDocRef = doc(db, 'users', uid, 'courseProgress', courseId);
      await deleteDoc(progDocRef);
      console.log(`[LearningEngineService] Removed courseProgress for user ${uid}, course ${courseId} from Firestore`);
    } catch (e) {
      console.warn('[LearningEngineService] Firestore unenrollment notice:', e.message);
    }
  }

  return true;
};

/**
 * One-way sync from Course Practice completion to the global Question Bank.
 */
export const syncPracticeProblemToQuestionBank = async (uid, questionId, language = 'cpp', score = 100) => {
  if (!uid || uid === 'demo' || uid === 'demo-student') return;
  try {
    await markQuestionSolved(uid, questionId, language, score, 1, { source: 'course_practice' });
    console.log(`[LearningEngineService] Synced question ${questionId} solve to Question Bank for user ${uid}`);
  } catch (err) {
    console.warn('[LearningEngineService] Error syncing to Question Bank (non-fatal):', err);
  }
};

/**
 * Build default progress object for a course.
 */
export const createInitialCourseProgress = (course) => {
  const firstModule = course.modules?.[0];
  const firstTopic = firstModule?.topics?.[0];
  const firstActivity = firstTopic?.activities?.[0];

  const modulesProgress = {};
  course.modules?.forEach((m, idx) => {
    modulesProgress[m.moduleId] = {
      moduleId: m.moduleId,
      status: idx === 0 ? 'AVAILABLE' : 'LOCKED',
      isUnlocked: idx === 0,
      completed: false,
      miniAssessmentScore: null,
      msa: {
        status: idx === 0 ? 'AVAILABLE' : 'LOCKED',
        mcqScore: null,
        codingScore: null,
        passed: false,
        attempts: 0,
        completedAt: null
      }
    };
  });

  const topicsProgress = {};
  course.modules?.forEach((m) => {
    m.topics?.forEach((t) => {
      topicsProgress[t.topicId] = {
        topicId: t.topicId,
        completed: false,
        currentAllowedVideoTime: 0,
        currentPageIdx: 0,
        passedCheckpoints: [],
        checkpoints: {
          watchAiClass: false,
          quickCheck: false,
          exampleRun: false,
          practiceSolved: false,
          videoWatched: false,
          readingCompleted: false
        },
        completedAt: null
      };
    });
  });

  const totalTopics = Object.keys(topicsProgress).length;
  const completedTopics = 0;

  return {
    courseId: course.courseId,
    status: 'NOT_STARTED',
    hasStarted: false,
    currentModuleId: firstModule?.moduleId || '',
    currentTopicId: firstTopic?.topicId || '',
    currentActivityId: firstActivity?.activityId || '',
    percentage: 0,
    completedTopics: 0,
    totalTopics,
    completedModules: 0,
    totalModules: course.modules?.length || 1,
    modules: modulesProgress,
    topics: topicsProgress,
    gamification: {
      xpEarned: 0,
      creditsEarned: 0
    },
    startedAt: null,
    lastActivityAt: null
  };
};

/**
 * Accurately calculate live progress percentage based on completed topics and module MSAs.
 */
export const calculateLiveCoursePercentage = (progress, course) => {
  if (!progress || !course) return 0;
  const totalModules = course.modules?.length || 1;
  const completedMods = Object.values(progress.modules || {}).filter(m => m.completed).length;
  if (completedMods === totalModules && totalModules > 0) return 100;

  let totalActivities = 0;
  let completedActivities = 0;

  course.modules?.forEach(m => {
    m.topics?.forEach(t => {
      const status = getTopicActivityStatus(t, progress.topics?.[t.topicId]);
      totalActivities += status.totalCount;
      completedActivities += status.completedCount;
    });
  });

  if (totalActivities === 0) {
    const totalTopics = Object.keys(progress.topics || {}).length || 1;
    const completedTopics = Object.values(progress.topics || {}).filter(t => t.completed).length;
    totalActivities = totalTopics;
    completedActivities = completedTopics;
  }

  if (completedActivities === 0 && completedMods === 0) return 0;

  // Sub-activities represent 70% of curriculum progress, Module MSAs represent 30%
  const activityWeight = (completedActivities / Math.max(1, totalActivities)) * 70;
  const modWeight = (completedMods / totalModules) * 30;
  return Math.max(1, Math.min(99, Math.round(activityWeight + modWeight)));
};

/**
 * Build compact Firestore schema for course progress.
 * Stores only completed module IDs, ongoing module & topic state for resuming,
 * checkpoint IDs, and MSA/assessment marks.
 */
export const buildCompactFirestoreProgress = (progress, course, uid) => {
  if (!progress) return null;

  // 1. Completed Modules: Just an array of module IDs! (e.g. ['mod-01-arrays'])
  const completedModuleIds = Object.keys(progress.modules || {})
    .filter(mId => progress.modules[mId]?.completed);

  // 2. Ongoing module & topic position for continuing where user left off
  const ongoingModuleId = progress.currentModuleId || course?.modules?.[0]?.moduleId || '';
  const ongoingTopicId = progress.currentTopicId || course?.modules?.[0]?.topics?.[0]?.topicId || '';
  const ongoingTopicProg = progress.topics?.[ongoingTopicId] || {};

  // 3. Completed Topics: Array of completed topic IDs
  const completedTopicIds = Object.keys(progress.topics || {})
    .filter(tId => progress.topics[tId]?.completed);

  // 4. Passed Checkpoints & Sub-activity completions
  const passedCheckpoints = Object.values(progress.topics || {})
    .flatMap(t => t.passedCheckpoints || []);
  const completedReadings = Object.keys(progress.topics || {})
    .filter(tId => progress.topics[tId]?.checkpoints?.readingCompleted || progress.topics[tId]?.readingCompleted);
  const completedVideos = Object.keys(progress.topics || {})
    .filter(tId => progress.topics[tId]?.checkpoints?.videoWatched || progress.topics[tId]?.videoWatched);
  const completedExamples = Object.keys(progress.topics || {})
    .filter(tId => progress.topics[tId]?.checkpoints?.exampleRun || progress.topics[tId]?.checkpoints?.examplesViewed);

  // 5. Solved practice problems map per topic
  const solvedProblemsMap = {};
  Object.keys(progress.topics || {}).forEach(tId => {
    if (progress.topics[tId]?.solvedProblems?.length > 0) {
      solvedProblemsMap[tId] = progress.topics[tId].solvedProblems;
    }
  });

  // 6. MSA Results: ONLY marks and pass status
  const msaResults = {};
  Object.keys(progress.modules || {}).forEach(mId => {
    const modProg = progress.modules[mId];
    if (modProg?.msa && (modProg.msa.attempts > 0 || modProg.msa.passed)) {
      msaResults[mId] = {
        mcqScore: modProg.msa.mcqScore ?? null,
        codingScore: modProg.msa.codingScore ?? null,
        passed: Boolean(modProg.msa.passed),
        attempts: modProg.msa.attempts || 1,
        completedAt: modProg.msa.completedAt || null
      };
    }
  });

  // 7. Mini Assessment Results: ONLY marks
  const miniAssessments = {};
  Object.keys(progress.modules || {}).forEach(mId => {
    const modProg = progress.modules[mId];
    if (typeof modProg?.miniAssessmentScore === 'number') {
      miniAssessments[mId] = {
        score: modProg.miniAssessmentScore,
        passed: modProg.miniAssessmentScore >= 70
      };
    }
  });

  const totalMods = course?.modules?.length || 1;
  const isAllCompleted = completedModuleIds.length === totalMods;
  const hasStarted = Boolean(
    progress.hasStarted ||
    completedTopicIds.length > 0 ||
    completedReadings.length > 0 ||
    completedVideos.length > 0 ||
    completedModuleIds.length > 0 ||
    (progress.percentage && progress.percentage > 0)
  );

  return {
    courseId: progress.courseId,
    userId: uid || 'anonymous',
    status: isAllCompleted ? 'COMPLETED' : (hasStarted ? 'IN_PROGRESS' : 'NOT_STARTED'),
    progressPercent: progress.percentage || 0,
    completedModules: completedModuleIds,          // Just IDs! e.g. ['mod-01-arrays']
    ongoingModuleId,                               // Continuing location
    ongoingTopicId,                                // Continuing location
    ongoingAllowedVideoTime: ongoingTopicProg.currentAllowedVideoTime || 0,
    ongoingPageIdx: ongoingTopicProg.currentPageIdx || 0,
    completedTopics: completedTopicIds,
    completedReadings,
    completedVideos,
    completedExamples,
    passedCheckpoints,
    solvedProblems: solvedProblemsMap,
    msaResults,                                    // ONLY marks
    miniAssessments,                               // ONLY marks
    timeSpentSeconds: progress.timeSpentSeconds || 0,
    lastHeartbeatAt: progress.lastHeartbeatAt || null,
    lastActivityAt: progress.lastActivityAt || new Date().toISOString()
  };
};

export function formatTimestampToISO(val) {
  if (!val) return null;
  if (typeof val === 'string') {
    if (val.startsWith('[object') || val === 'Invalid Date' || val === 'undefined' || val === 'null') return null;
    return val;
  }
  if (typeof val === 'number') return new Date(val).toISOString();
  if (typeof val.toDate === 'function') {
    try { return val.toDate().toISOString(); } catch (_) {}
  }
  if (typeof val.seconds === 'number') {
    return new Date(val.seconds * 1000).toISOString();
  }
  if (typeof val._seconds === 'number') {
    return new Date(val._seconds * 1000).toISOString();
  }
  return null;
}

/**
 * Hydrate frontend progress state from compact Firestore document.
 */
export const hydrateProgressFromFirestore = (firestoreData, course) => {
  const base = createInitialCourseProgress(course);
  if (!firestoreData) return base;

  const completedModSet = new Set(firestoreData.completedModules || []);
  const safeLastActivity = formatTimestampToISO(firestoreData.lastActivityAt || firestoreData.lastActivityISO) || base.lastActivityAt;

  course.modules?.forEach((m, idx) => {
    const isCompleted = completedModSet.has(m.moduleId);
    const msaResult = firestoreData.msaResults?.[m.moduleId];
    const miniResult = firestoreData.miniAssessments?.[m.moduleId];

    // Unlocked if completed, first module, or previous module was completed
    const prevCompleted = idx === 0 || completedModSet.has(course.modules[idx - 1]?.moduleId);
    const isUnlocked = isCompleted || prevCompleted;

    base.modules[m.moduleId] = {
      moduleId: m.moduleId,
      completed: isCompleted,
      status: isCompleted ? 'COMPLETED' : (isUnlocked ? 'AVAILABLE' : 'LOCKED'),
      isUnlocked,
      miniAssessmentScore: miniResult?.score ?? null,
      msa: {
        status: isCompleted ? 'COMPLETED' : (isUnlocked ? 'AVAILABLE' : 'LOCKED'),
        mcqScore: msaResult?.mcqScore ?? null,
        codingScore: msaResult?.codingScore ?? null,
        passed: Boolean(msaResult?.passed || isCompleted),
        attempts: msaResult?.attempts || (isCompleted ? 1 : 0),
        completedAt: formatTimestampToISO(msaResult?.completedAt) || null
      }
    };
  });

  const completedTopicSet = new Set(firestoreData.completedTopics || []);
  const completedReadingSet = new Set(firestoreData.completedReading || firestoreData.completedReadings || []);
  const completedVideoSet = new Set(firestoreData.completedVideos || []);
  const completedExampleSet = new Set(firestoreData.completedExamples || []);
  const passedCpSet = new Set(firestoreData.passedCheckpoints || []);

  course.modules?.forEach((m) => {
    m.topics?.forEach((t) => {
      const isCompleted = completedTopicSet.has(t.topicId);
      const isOngoing = t.topicId === firestoreData.ongoingTopicId;
      const topicCps = [
        ...(t.checkpoints || []),
        ...(t.pages?.filter(p => p.checkpoint)?.map(p => p.checkpoint) || [])
      ];
      const topicSolved = firestoreData.solvedProblems?.[t.topicId] || [];
      const practiceList = t.practiceProblems || t.practiceQuestions || t.codingQuestions || [];

      base.topics[t.topicId] = {
        topicId: t.topicId,
        completed: isCompleted,
        readingCompleted: isCompleted || completedReadingSet.has(t.topicId),
        videoWatched: isCompleted || completedVideoSet.has(t.topicId),
        currentAllowedVideoTime: isOngoing ? (firestoreData.ongoingAllowedVideoTime || 0) : (isCompleted ? 999999 : 0),
        currentPageIdx: isOngoing ? (firestoreData.ongoingPageIdx || 0) : 0,
        passedCheckpoints: topicCps.map(cp => cp.checkpointId).filter(id => passedCpSet.has(id)),
        solvedProblems: topicSolved,
        checkpoints: {
          quickCheck: isCompleted || passedCpSet.has(`cp-${t.topicId}`),
          practiceSolved: isCompleted || (practiceList.length > 0 && topicSolved.length >= practiceList.length),
          videoWatched: isCompleted || completedVideoSet.has(t.topicId),
          readingCompleted: isCompleted || completedReadingSet.has(t.topicId),
          exampleRun: isCompleted || completedExampleSet.has(t.topicId),
          examplesViewed: isCompleted || completedExampleSet.has(t.topicId)
        },
        completedAt: isCompleted ? (formatTimestampToISO(firestoreData.completedAt || firestoreData.lastActivityAt) || safeLastActivity) : null
      };
    });
  });

  const hasStarted = firestoreData.status === 'IN_PROGRESS' || 
    firestoreData.status === 'COMPLETED' || 
    (firestoreData.progressPercent && firestoreData.progressPercent > 0) ||
    completedTopicSet.size > 0;

  base.currentModuleId = firestoreData.ongoingModuleId || base.currentModuleId;
  base.currentTopicId = firestoreData.ongoingTopicId || base.currentTopicId;
  base.percentage = firestoreData.progressPercent || 0;
  base.timeSpentSeconds = firestoreData.timeSpentSeconds || 0;
  base.lastHeartbeatAt = formatTimestampToISO(firestoreData.lastHeartbeatAt) || null;
  base.completedModules = (firestoreData.completedModules || []).length;
  base.completedTopics = (firestoreData.completedTopics || []).length;
  base.lastActivityAt = safeLastActivity;
  base.recentSessions = Array.isArray(firestoreData.recentSessions) ? firestoreData.recentSessions : [];
  base.hasStarted = hasStarted;
  base.status = firestoreData.status || (hasStarted ? 'IN_PROGRESS' : 'NOT_STARTED');

  return base;
};

/**
 * Deep merge cloud progress and local progress so newer local updates (solved problems, checkpoints)
 * are never clobbered by lagging or stale cloud snapshots.
 */
export const mergeCourseProgress = (cloud, local, course) => {
  if (!cloud) return local;
  if (!local) return cloud;

  const merged = { ...cloud, ...local };
  merged.modules = { ...(cloud.modules || {}) };
  merged.topics = { ...(cloud.topics || {}) };

  // Merge modules
  const allModIds = Array.from(new Set([...Object.keys(cloud.modules || {}), ...Object.keys(local.modules || {})]));
  for (const mId of allModIds) {
    const cMod = cloud.modules?.[mId] || {};
    const lMod = local.modules?.[mId] || {};
    merged.modules[mId] = {
      ...cMod,
      ...lMod,
      completed: Boolean(cMod.completed || lMod.completed),
      isUnlocked: Boolean(cMod.isUnlocked || lMod.isUnlocked),
      msa: {
        ...(cMod.msa || {}),
        ...(lMod.msa || {}),
        passed: Boolean(cMod.msa?.passed || lMod.msa?.passed)
      }
    };
  }

  // Merge topics
  const allTopicIds = Array.from(new Set([...Object.keys(cloud.topics || {}), ...Object.keys(local.topics || {})]));
  for (const tId of allTopicIds) {
    const cTop = cloud.topics?.[tId] || {};
    const lTop = local.topics?.[tId] || {};
    const mergedSolved = Array.from(new Set([...(cTop.solvedProblems || []), ...(lTop.solvedProblems || [])]));
    const mergedPassedCps = Array.from(new Set([...(cTop.passedCheckpoints || []), ...(lTop.passedCheckpoints || [])]));

    merged.topics[tId] = {
      ...cTop,
      ...lTop,
      completed: Boolean(cTop.completed || lTop.completed),
      readingCompleted: Boolean(cTop.readingCompleted || lTop.readingCompleted),
      videoWatched: Boolean(cTop.videoWatched || lTop.videoWatched),
      currentAllowedVideoTime: Math.max(cTop.currentAllowedVideoTime || 0, lTop.currentAllowedVideoTime || 0),
      currentPageIdx: Math.max(cTop.currentPageIdx || 0, lTop.currentPageIdx || 0),
      solvedProblems: mergedSolved,
      passedCheckpoints: mergedPassedCps,
      checkpoints: {
        ...(cTop.checkpoints || {}),
        ...(lTop.checkpoints || {}),
        practiceSolved: Boolean(cTop.checkpoints?.practiceSolved || lTop.checkpoints?.practiceSolved)
      }
    };
  }

  merged.percentage = Math.max(cloud.percentage || 0, local.percentage || 0);
  merged.completedTopics = Object.values(merged.topics).filter(t => t.completed).length;
  merged.completedModules = Object.values(merged.modules).filter(m => m.completed).length;

  return merged;
};

/**
 * Fast synchronous reader for latest locally cached course progress.
 */
export const getLatestLocalProgress = (uid, course) => {
  if (!course) return null;
  const courseId = course.courseId;
  const localKey = `${LOCAL_PROGRESS_PREFIX}${uid}_${courseId}`;
  try {
    const raw = localStorage.getItem(localKey);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return null;
};

/**
 * Load course progress for a user with local fallback and cloud sync.
 */
export const getCourseProgress = async (uid, course) => {
  if (!course) return null;
  const courseId = course.courseId;
  const localKey = `${LOCAL_PROGRESS_PREFIX}${uid}_${courseId}`;

  // 1. Read local cache first (instant 0ms)
  let localProgress = null;
  try {
    const raw = localStorage.getItem(localKey);
    if (raw) {
      localProgress = JSON.parse(raw);
    }
  } catch (_) {}

  let progress = localProgress;

  // 2. Attempt Firestore read if authenticated and online, then merge safely
  if (uid && uid !== 'demo' && uid !== 'demo-student' && navigator.onLine) {
    try {
      const snap = await getDoc(doc(db, 'users', uid, 'courseProgress', courseId));
      if (snap.exists()) {
        const firestoreData = snap.data();
        const cloudProgress = hydrateProgressFromFirestore(firestoreData, course);
        if (localProgress) {
          progress = mergeCourseProgress(cloudProgress, localProgress, course);
        } else {
          progress = cloudProgress;
        }
        saveLocalCourseProgress(uid, courseId, progress);
      }
    } catch (e) {
      console.warn('[LearningEngineService] Firestore load notice:', e.message);
    }
  }

  // 3. Create initial progress if none exists
  if (!progress) {
    progress = createInitialCourseProgress(course);
    saveLocalCourseProgress(uid, courseId, progress);
  }

  return progress;
};

/**
 * Asynchronously fetch enrolled course IDs and hydrated course progress map
 * in a SINGLE Firestore getDocs call (eliminates the N+1 duplicate read).
 */
export const fetchUserCourseProgressMap = async (uid, catalog = []) => {
  const localIds = getEnrolledCourseIds(uid);
  const catalogList = Array.isArray(catalog) ? catalog : [];
  const catalogMap = new Map();
  catalogList.forEach(c => {
    if (c.courseId) catalogMap.set(c.courseId, c);
    if (c.slug) catalogMap.set(c.slug, c);
  });

  const progressMap = {};

  // 1. Populate from local storage cache first for instant response
  for (const cid of localIds) {
    try {
      const raw = localStorage.getItem(`${LOCAL_PROGRESS_PREFIX}${uid}_${cid}`);
      if (raw) {
        progressMap[cid] = JSON.parse(raw);
      }
    } catch (_) {}
  }

  if (!uid || uid === 'demo' || uid === 'demo-student' || !navigator.onLine) {
    for (const cid of localIds) {
      if (!progressMap[cid]) {
        const catCourse = catalogMap.get(cid);
        if (catCourse) progressMap[cid] = createInitialCourseProgress(catCourse);
      }
    }
    return { enrolledIds: localIds, progressMap };
  }

  try {
    const colRef = collection(db, 'users', uid, 'courseProgress');
    const snap = await getDocs(colRef);
    const firestoreIds = [];

    snap.forEach(docSnap => {
      const data = docSnap.data();
      const cid = docSnap.id;
      if (data.isEnrolled !== false || data.progressPercent > 0 || (data.completedTopics && data.completedTopics.length > 0)) {
        firestoreIds.push(cid);
      }

      // Hydrate progress directly from the fetched document!
      const catCourse = catalogMap.get(cid);
      if (catCourse) {
        const hydrated = hydrateProgressFromFirestore(data, catCourse);
        progressMap[cid] = hydrated;
        saveLocalCourseProgress(uid, cid, hydrated);
      }
    });

    const mergedIds = Array.from(new Set([...localIds, ...firestoreIds]));
    try {
      localStorage.setItem(`${LOCAL_ENROLLED_KEY}${uid}`, JSON.stringify(mergedIds));
    } catch (_) {}

    // Ensure all enrolled courses have a baseline progress object
    for (const cid of mergedIds) {
      if (!progressMap[cid]) {
        const catCourse = catalogMap.get(cid);
        if (catCourse) {
          progressMap[cid] = createInitialCourseProgress(catCourse);
          saveLocalCourseProgress(uid, cid, progressMap[cid]);
        }
      }
    }

    return { enrolledIds: mergedIds, progressMap };
  } catch (e) {
    console.warn('[LearningEngineService] fetchUserCourseProgressMap fallback to local:', e.message);
    return { enrolledIds: localIds, progressMap };
  }
};

/**
 * Save course progress locally.
 */
export const saveLocalCourseProgress = (uid, courseId, progress) => {
  if (!courseId || !progress) return;
  const localKey = `${LOCAL_PROGRESS_PREFIX}${uid}_${courseId}`;
  try {
    localStorage.setItem(localKey, JSON.stringify(progress));
  } catch (_) {}
};

/**
 * Save course progress to Firestore asynchronously using compact schema.
 */
export const syncCourseProgressToFirestore = async (uid, courseId, progress, course) => {
  if (!uid || uid === 'demo' || !navigator.onLine) return;
  try {
    const compactData = buildCompactFirestoreProgress(progress, course, uid);
    if (!compactData) return;

    await setDoc(doc(db, 'users', uid, 'courseProgress', courseId), {
      ...compactData,
      updatedAt: serverTimestamp()
    }, { merge: true });
    console.log('[LearningEngineService] Synced course progress to Firestore:', courseId);
  } catch (e) {
    console.warn('[LearningEngineService] Firestore sync notice:', e.message);
  }
};

// Bounded topic sync debouncer to eliminate rapid-fire setDoc calls on sidebar browsing
const topicSyncTimers = new Map();
const debounceTopicSync = (uid, courseId, progress, course) => {
  if (!uid || uid === 'demo' || !navigator.onLine) return;
  const key = `${uid}_${courseId}`;
  if (topicSyncTimers.has(key)) {
    clearTimeout(topicSyncTimers.get(key));
  }
  topicSyncTimers.set(key, setTimeout(() => {
    topicSyncTimers.delete(key);
    syncCourseProgressToFirestore(uid, courseId, progress, course);
  }, 10000));
};

/**
 * Update the ongoing module & topic so user can resume exactly where they left off.
 * Uses in-memory progress or local cache to avoid Firestore getDoc on topic clicks.
 */
export const updateOngoingTopic = async (uid, course, moduleId, topicId, currentProgress = null) => {
  if (!course || !moduleId || !topicId) return null;
  const courseId = course.courseId;
  const progress = currentProgress || getLatestLocalProgress(uid, course) || await getCourseProgress(uid, course);
  if (!progress) return null;

  progress.currentModuleId = moduleId;
  progress.currentTopicId = topicId;
  progress.lastActivityAt = new Date().toISOString();

  saveLocalCourseProgress(uid, courseId, progress);
  debounceTopicSync(uid, courseId, progress, course);

  return progress;
};

/**
 * Update a topic activity checkpoint (e.g. watchAiClass, quickCheck, exampleRun, practiceSolved).
 */
export const updateTopicCheckpoint = async (uid, course, moduleId, topicId, checkpointKey, value = true) => {
  if (!course || !topicId) return null;
  const courseId = course.courseId;
  const progress = getLatestLocalProgress(uid, course) || await getCourseProgress(uid, course);

  if (!progress.topics[topicId]) {
    progress.topics[topicId] = {
      topicId,
      completed: false,
      currentAllowedVideoTime: 0,
      currentPageIdx: 0,
      passedCheckpoints: [],
      checkpoints: {}
    };
  }

  if (!progress.topics[topicId].checkpoints) {
    progress.topics[topicId].checkpoints = {};
  }

  progress.topics[topicId].checkpoints[checkpointKey] = value;
  if (checkpointKey === 'readingCompleted') progress.topics[topicId].readingCompleted = value;
  if (checkpointKey === 'videoWatched') progress.topics[topicId].videoWatched = value;
  if (checkpointKey === 'exampleRun' || checkpointKey === 'examplesViewed') {
    progress.topics[topicId].examplesCompleted = value;
    progress.topics[topicId].checkpoints.exampleRun = value;
  }

  // Check if topic is now completed based on its available requirements
  const topicObj = findTopicInCourse(course, topicId)?.topic;
  const isNowCompleted = isTopicRequirementsSatisfied(topicObj, progress.topics[topicId]);

  if (isNowCompleted && !progress.topics[topicId].completed) {
    progress.topics[topicId].completed = true;
    progress.topics[topicId].completedAt = new Date().toISOString();
    awardCourseMilestone(uid, progress, course, 'topic_complete', topicId, COURSE_GAMIFICATION_SPEC.TOPIC_COMPLETION_XP, COURSE_GAMIFICATION_SPEC.TOPIC_COMPLETION_CREDITS);
    flushActiveSessionTime('topic_complete');
  } else if (checkpointKey === 'readingCompleted' || checkpointKey === 'videoWatched') {
    awardCourseMilestone(uid, progress, course, 'checkpoint', `${topicId}_${checkpointKey}`, COURSE_GAMIFICATION_SPEC.TOPIC_READING_XP, 0);
  }

  // Recalculate totals
  const allCourseTopicsCount = course?.modules?.reduce((sum, m) => sum + (m.topics?.length || 0), 0) || Object.keys(progress.topics).length || 1;
  const completedTopics = Object.values(progress.topics).filter(t => t.completed).length;
  progress.completedTopics = completedTopics;
  progress.totalTopics = allCourseTopicsCount;
  progress.percentage = calculateLiveCoursePercentage(progress, course);
  progress.hasStarted = true;
  progress.status = progress.percentage >= 100 ? 'COMPLETED' : 'IN_PROGRESS';
  progress.lastActivityAt = new Date().toISOString();

  checkCourseGraduation(uid, progress, course);

  saveLocalCourseProgress(uid, courseId, progress);
  syncCourseProgressToFirestore(uid, courseId, progress, course);

  return progress;
};

/**
 * Explicitly mark a submodule (topic) as completed with live Firestore synchronization.
 */
export const markTopicCompleted = async (uid, course, moduleId, topicId) => {
  if (!course || !topicId) return null;
  const courseId = course.courseId;
  const progress = getLatestLocalProgress(uid, course) || await getCourseProgress(uid, course);

  if (!progress.topics[topicId]) {
    progress.topics[topicId] = {
      topicId,
      completed: true,
      completedAt: new Date().toISOString(),
      currentAllowedVideoTime: 9999,
      currentPageIdx: 99,
      passedCheckpoints: [],
      checkpoints: { readingCompleted: true }
    };
  } else {
    progress.topics[topicId].completed = true;
    progress.topics[topicId].completedAt = new Date().toISOString();
    if (!progress.topics[topicId].checkpoints) progress.topics[topicId].checkpoints = {};
    progress.topics[topicId].checkpoints.readingCompleted = true;
  }

  // Check if all topics in module are done
  const mod = course.modules?.find(m => m.moduleId === moduleId);
  if (mod && mod.topics?.every(t => progress.topics[t.topicId]?.completed)) {
    if (!progress.modules[moduleId]) {
      progress.modules[moduleId] = { moduleId, completed: false, isUnlocked: true };
    }
  }

  // Recalculate totals
  const totalTopics = Object.keys(progress.topics).length;
  const completedTopics = Object.values(progress.topics).filter(t => t.completed).length;
  progress.completedTopics = completedTopics;
  progress.totalTopics = totalTopics;
  progress.percentage = calculateLiveCoursePercentage(progress, course);
  progress.hasStarted = true;
  progress.status = progress.percentage >= 100 ? 'COMPLETED' : 'IN_PROGRESS';
  progress.lastActivityAt = new Date().toISOString();

  saveLocalCourseProgress(uid, courseId, progress);
  syncCourseProgressToFirestore(uid, courseId, progress, course);

  return progress;
};

/**
 * Record passed in-video or in-text checkpoint and advance allowed seek window.
 */
export const passTopicCheckpoint = async (uid, course, moduleId, topicId, checkpointId, newAllowedTime = 0) => {
  if (!course || !topicId || !checkpointId) return null;
  const courseId = course.courseId;
  const progress = getLatestLocalProgress(uid, course) || await getCourseProgress(uid, course);

  if (!progress.topics[topicId]) {
    progress.topics[topicId] = {
      topicId,
      completed: false,
      currentAllowedVideoTime: 0,
      currentPageIdx: 0,
      passedCheckpoints: [],
      checkpoints: {}
    };
  }

  const topicProg = progress.topics[topicId];
  if (!topicProg.passedCheckpoints) topicProg.passedCheckpoints = [];
  if (!topicProg.passedCheckpoints.includes(checkpointId)) {
    topicProg.passedCheckpoints.push(checkpointId);
  }

  if (newAllowedTime > (topicProg.currentAllowedVideoTime || 0)) {
    topicProg.currentAllowedVideoTime = newAllowedTime;
  }

  if (!topicProg.checkpoints) topicProg.checkpoints = {};
  topicProg.checkpoints.quickCheck = true;

  // Check if topic is now completed
  const topicObj = findTopicInCourse(course, topicId)?.topic;
  if (isTopicRequirementsSatisfied(topicObj, topicProg) && !topicProg.completed) {
    topicProg.completed = true;
    topicProg.completedAt = new Date().toISOString();
    progress.gamification.xpEarned = (progress.gamification.xpEarned || 0) + 50;
    progress.gamification.creditsEarned = (progress.gamification.creditsEarned || 0) + 5;
  }

  // Recalculate totals
  const totalTopics = Object.keys(progress.topics).length;
  const completedTopics = Object.values(progress.topics).filter(t => t.completed).length;
  progress.completedTopics = completedTopics;
  progress.totalTopics = totalTopics;
  progress.percentage = calculateLiveCoursePercentage(progress, course);
  progress.hasStarted = true;
  progress.status = progress.percentage >= 100 ? 'COMPLETED' : 'IN_PROGRESS';
  progress.lastActivityAt = new Date().toISOString();

  saveLocalCourseProgress(uid, courseId, progress);
  syncCourseProgressToFirestore(uid, courseId, progress, course);

  return progress;
};

/**
 * Update text-reading progress (page index reached).
 */
export const updateTextPageProgress = async (uid, course, moduleId, topicId, pageIdx) => {
  if (!course || !topicId) return null;
  const courseId = course.courseId;
  const progress = getLatestLocalProgress(uid, course) || await getCourseProgress(uid, course);

  if (!progress.topics[topicId]) {
    progress.topics[topicId] = {
      topicId,
      completed: false,
      currentAllowedVideoTime: 0,
      currentPageIdx: 0,
      passedCheckpoints: [],
      checkpoints: {}
    };
  }

  progress.topics[topicId].currentPageIdx = Math.max(progress.topics[topicId].currentPageIdx || 0, pageIdx);
  progress.topics[topicId].checkpoints = progress.topics[topicId].checkpoints || {};
  progress.topics[topicId].checkpoints.readingCompleted = true;

  const topicObj = findTopicInCourse(course, topicId)?.topic;
  awardCourseMilestone(uid, progress, course, 'reading', topicId, COURSE_GAMIFICATION_SPEC.TOPIC_READING_XP, 0);

  if (isTopicRequirementsSatisfied(topicObj, progress.topics[topicId]) && !progress.topics[topicId].completed) {
    progress.topics[topicId].completed = true;
    progress.topics[topicId].completedAt = new Date().toISOString();
    awardCourseMilestone(uid, progress, course, 'topic_complete', topicId, COURSE_GAMIFICATION_SPEC.TOPIC_COMPLETION_XP, COURSE_GAMIFICATION_SPEC.TOPIC_COMPLETION_CREDITS);
    progress.percentage = calculateLiveCoursePercentage(progress, course);
    checkCourseGraduation(uid, progress, course);
  }

  saveLocalCourseProgress(uid, courseId, progress);
  syncCourseProgressToFirestore(uid, courseId, progress, course);

  return progress;
};

/**
 * Helper to find a topic in course structure.
 */
export const findTopicInCourse = (course, topicId) => {
  if (!course?.modules) return null;
  for (const m of course.modules) {
    const t = m.topics?.find(top => top.topicId === topicId);
    if (t) return { topic: t, module: m };
  }
  return null;
};

/**
 * Get available requirement keys for a given topic.
 * Topics without practice or code examples will NOT require them.
 */
export const getTopicAvailableRequirements = (topic) => {
  if (!topic) return [];
  const reqs = ['lesson'];

  const hasExamples = 
    (topic.codeExamples && topic.codeExamples.length > 0) ||
    (topic.pages && topic.pages.some(p => p.codeCard)) ||
    (topic.lessonContent?.codeExamples && topic.lessonContent.codeExamples.length > 0);
  if (hasExamples) reqs.push('examples');

  const hasPractice = 
    (topic.practiceProblems && topic.practiceProblems.length > 0) ||
    (topic.practiceQuestions && topic.practiceQuestions.length > 0) ||
    (topic.codingQuestions && topic.codingQuestions.length > 0);
  if (hasPractice) reqs.push('practice');

  return reqs;
};

/**
 * Check whether all available requirements for a topic are satisfied.
 */
export const isTopicRequirementsSatisfied = (topic, topicProgress) => {
  if (!topic) return false;
  if (topicProgress?.completed) return true;
  const status = getTopicActivityStatus(topic, topicProgress);
  return status.isCompleted;
};

/**
 * Return structured status of each sub-activity for the Course Content tree.
 * Embedded checkpoints are validated as criteria for Lesson Content completion.
 * Each sub-activity (lesson, examples, practice) is evaluated independently.
 */
export const getTopicActivityStatus = (topic, topicProgress) => {
  if (!topic) return { completedCount: 0, totalCount: 0, items: [], isCompleted: false };
  const reqs = getTopicAvailableRequirements(topic);
  const cp = topicProgress?.checkpoints || {};
  const passedCps = topicProgress?.passedCheckpoints || [];
  const solved = topicProgress?.solvedProblems || [];

  const isTopicMarkedCompleted = Boolean(topicProgress?.completed);

  const totalCps = (topic.checkpoints?.length || 0) + (topic.pages?.filter(p => p.checkpoint)?.length || 0);
  const allCpsPassed = totalCps === 0 || passedCps.length >= totalCps;

  const items = [];
  let completedCount = 0;

  for (const req of reqs) {
    if (req === 'lesson') {
      const isLessonDone = isTopicMarkedCompleted || Boolean(
        cp.readingCompleted || 
        cp.videoWatched || 
        cp.watchAiClass || 
        cp.sqlExercisePassed ||
        (totalCps > 0 && passedCps.length >= totalCps)
      );
      if (isLessonDone) completedCount++;
      items.push({
        key: 'lesson',
        label: (topic.sqlExercise || topic.mode === 'SQL_INTERACTIVE') ? 'SQL Exercise' : (topic.mode === 'VIDEO' ? 'Video Lesson' : 'Lesson Content'),
        done: isLessonDone,
        type: (topic.sqlExercise || topic.mode === 'SQL_INTERACTIVE') ? 'sql' : (topic.mode === 'VIDEO' ? 'video' : 'reading')
      });
    } else if (req === 'examples') {
      const done = isTopicMarkedCompleted || Boolean(cp.exampleRun || cp.examplesViewed);
      if (done) completedCount++;
      items.push({
        key: 'examples',
        label: 'Code Examples',
        done
      });
    } else if (req === 'practice') {
      const practiceList = topic.practiceProblems || topic.practiceQuestions || topic.codingQuestions || [];
      const allPracticeListSolved = practiceList.length > 0 && practiceList.every(q => {
        const ids = [q.id, q.problemId, q.questionId, (typeof q === 'string' ? q : null)].filter(Boolean);
        return ids.some(id => solved.includes(id));
      });
      const done = isTopicMarkedCompleted || Boolean(
        cp.practiceSolved ||
        allPracticeListSolved ||
        (practiceList.length > 0 ? solved.length >= practiceList.length : false)
      );
      if (done) completedCount++;

      let countSolved = 0;
      if (practiceList.length > 0) {
        if (done) {
          countSolved = practiceList.length;
        } else {
          practiceList.forEach(q => {
            const ids = [q.id, q.problemId, q.questionId, (typeof q === 'string' ? q : null)].filter(Boolean);
            if (ids.some(id => solved.includes(id))) countSolved++;
          });
          countSolved = Math.max(countSolved, Math.min(solved.length, practiceList.length));
        }
      }

      items.push({
        key: 'practice',
        label: 'Practice Questions',
        done,
        count: practiceList.length > 0 ? `${countSolved}/${practiceList.length}` : undefined
      });
    }
  }

  const isCompleted = isTopicMarkedCompleted || (items.length > 0 && items.every(i => i.done));

  return {
    isCompleted,
    completedCount,
    totalCount: items.length,
    items
  };
};

/**
 * Record a solved coding practice problem for a topic.
 */
export const recordTopicPracticeSolved = async (uid, course, moduleId, topicId, problemIdOrIds) => {
  if (!course || !topicId) return null;
  const courseId = course.courseId;
  const progress = getLatestLocalProgress(uid, course) || await getCourseProgress(uid, course);
  if (!progress.topics[topicId]) {
    progress.topics[topicId] = {
      topicId,
      completed: false,
      currentAllowedVideoTime: 0,
      currentPageIdx: 0,
      passedCheckpoints: [],
      solvedProblems: [],
      checkpoints: {}
    };
  }

  const topicProg = progress.topics[topicId];
  if (!topicProg.solvedProblems) topicProg.solvedProblems = [];

  const incomingIds = Array.isArray(problemIdOrIds) ? problemIdOrIds : [problemIdOrIds].filter(Boolean);
  incomingIds.forEach(id => {
    if (id && !topicProg.solvedProblems.includes(id)) {
      topicProg.solvedProblems.push(id);
    }
  });

  const topicObj = findTopicInCourse(course, topicId)?.topic;
  const practiceList = topicObj?.practiceProblems || topicObj?.practiceQuestions || topicObj?.codingQuestions || [];

  const allProblemsSolved = practiceList.length > 0
    ? practiceList.every(q => {
        const ids = [q.id, q.problemId, q.questionId, (typeof q === 'string' ? q : null)].filter(Boolean);
        return ids.some(id => topicProg.solvedProblems.includes(id));
      }) || (topicProg.solvedProblems.length >= practiceList.length)
    : true;

  if (!topicProg.checkpoints) topicProg.checkpoints = {};
  if (allProblemsSolved) {
    topicProg.checkpoints.practiceSolved = true;
  }

  const primaryId = incomingIds[0] || 'p';
  awardCourseMilestone(uid, progress, course, 'practice', `${topicId}_${primaryId}`, COURSE_GAMIFICATION_SPEC.TOPIC_PRACTICE_XP, COURSE_GAMIFICATION_SPEC.TOPIC_PRACTICE_CREDITS);

  if (isTopicRequirementsSatisfied(topicObj, topicProg)) {
    topicProg.completed = true;
    if (!topicProg.completedAt) topicProg.completedAt = new Date().toISOString();
    awardCourseMilestone(uid, progress, course, 'topic_complete', topicId, COURSE_GAMIFICATION_SPEC.TOPIC_COMPLETION_XP, COURSE_GAMIFICATION_SPEC.TOPIC_COMPLETION_CREDITS);
  }

  const totalTopics = Object.keys(progress.topics).length;
  const completedTopics = Object.values(progress.topics).filter(t => t.completed).length;
  progress.completedTopics = completedTopics;
  progress.totalTopics = totalTopics;
  progress.percentage = calculateLiveCoursePercentage(progress, course);
  progress.hasStarted = true;
  progress.status = progress.percentage >= 100 ? 'COMPLETED' : 'IN_PROGRESS';
  progress.lastActivityAt = new Date().toISOString();

  checkCourseGraduation(uid, progress, course);

  saveLocalCourseProgress(uid, courseId, progress);
  syncCourseProgressToFirestore(uid, courseId, progress, course);

  flushActiveSessionTime('practice_solved');
  try {
    const authData = JSON.parse(localStorage.getItem('auth_data') || '{}');
    recordDailyProblemMetric(authData.tenantId, authData.cohortId, courseId, true);
  } catch (_) {}

  return progress;
};

/**
 * Submit Course MSA (Multi-Section Assessment).
 * Enforces strict Total MSA Gating:
 * - Coding questions MUST clear all test cases (100%).
 * - Overall Total MSA result must be >= 90%.
 * - Supports MCQ-only courses seamlessly (codingScore: null).
 */
export const submitCourseMSA = async (uid, course, moduleId, {
  mcqScore,
  codingScore = null,
  totalScore = null,
  allTestCasesPassed = true,
  passingPercentage = 90
}) => {
  if (!course || !moduleId) return { success: false, passed: false };
  const courseId = course.courseId;
  const progress = await getCourseProgress(uid, course);

  if (!progress.modules[moduleId]) {
    progress.modules[moduleId] = { 
      moduleId, 
      status: 'AVAILABLE', 
      isUnlocked: true,
      completed: false,
      msa: {}
    };
  }

  const modProg = progress.modules[moduleId];
  if (!modProg.msa) modProg.msa = {};

  const hasCoding = typeof codingScore === 'number';
  const computedTotalScore = typeof totalScore === 'number'
    ? totalScore
    : (hasCoding ? Math.round(((mcqScore || 0) + codingScore) / 2) : (mcqScore || 0));

  // Strict criteria:
  // - If MCQ only: MCQ score >= passingPercentage (90%)
  // - If MCQ + Coding: Coding questions MUST clear ALL test cases (100%), AND overall totalScore >= 90%
  const mcqPassed = typeof mcqScore === 'number' && mcqScore >= passingPercentage;
  const codingPassed = !hasCoding || (codingScore === 100 && allTestCasesPassed);
  const msaPassed = codingPassed && (computedTotalScore >= passingPercentage);

  modProg.msa.mcqScore = mcqScore;
  modProg.msa.codingScore = codingScore;
  modProg.msa.totalScore = computedTotalScore;
  modProg.msa.attempts = (modProg.msa.attempts || 0) + 1;
  modProg.msa.lastAttemptAt = new Date().toISOString();
  modProg.miniAssessmentScore = computedTotalScore;

  if (msaPassed) {
    modProg.completed = true;
    modProg.status = 'COMPLETED';
    modProg.msa.passed = true;
    modProg.msa.completedAt = new Date().toISOString();

    awardCourseMilestone(uid, progress, course, 'msa_pass', moduleId, COURSE_GAMIFICATION_SPEC.MODULE_MSA_PASS_XP, COURSE_GAMIFICATION_SPEC.MODULE_MSA_PASS_CREDITS);

    // Unlock subsequent module in strict sequence
    const moduleIdx = course.modules?.findIndex(m => m.moduleId === moduleId);
    if (moduleIdx !== -1 && moduleIdx + 1 < (course.modules?.length || 0)) {
      const nextModule = course.modules[moduleIdx + 1];
      if (progress.modules[nextModule.moduleId]) {
        progress.modules[nextModule.moduleId].isUnlocked = true;
        progress.modules[nextModule.moduleId].status = 'AVAILABLE';
        if (!progress.modules[nextModule.moduleId].msa) {
          progress.modules[nextModule.moduleId].msa = { status: 'AVAILABLE', passed: false, attempts: 0 };
        } else {
          progress.modules[nextModule.moduleId].msa.status = 'AVAILABLE';
        }
      }
    }
  } else {
    modProg.msa.passed = false;
  }

  progress.completedModules = Object.values(progress.modules).filter(m => m.completed).length;
  progress.percentage = calculateLiveCoursePercentage(progress, course);
  progress.hasStarted = true;
  progress.status = progress.percentage >= 100 ? 'COMPLETED' : 'IN_PROGRESS';
  progress.lastActivityAt = new Date().toISOString();

  checkCourseGraduation(uid, progress, course);

  saveLocalCourseProgress(uid, courseId, progress);
  syncCourseProgressToFirestore(uid, courseId, progress, course);
  flushActiveSessionTime('msa_submitted');

  return {
    success: true,
    passed: msaPassed,
    mcqPassed,
    codingPassed,
    mcqScore,
    codingScore,
    totalScore: computedTotalScore,
    passingPercentage,
    unlockedNext: msaPassed,
    progress
  };
};

/**
 * Backward-compatible wrapper for mini-assessment.
 */
export const submitMiniAssessment = async (uid, course, moduleId, score, passingPercentage = 70) => {
  return submitCourseMSA(uid, course, moduleId, {
    mcqScore: score,
    codingScore: score,
    passingPercentage
  });
};

export default {
  getEnrolledCourseIds,
  fetchEnrolledCourseIds,
  fetchUserCourseProgressMap,
  enrollCourse,
  unenrollCourse,
  syncPracticeProblemToQuestionBank,
  getCourseProgress,
  saveLocalCourseProgress,
  updateTopicCheckpoint,
  markTopicCompleted,
  passTopicCheckpoint,
  updateTextPageProgress,
  updateOngoingTopic,
  submitCourseMSA,
  submitMiniAssessment,
  buildCompactFirestoreProgress,
  hydrateProgressFromFirestore,
  calculateLiveCoursePercentage,
  findTopicInCourse,
  getTopicAvailableRequirements,
  isTopicRequirementsSatisfied,
  getTopicActivityStatus,
  recordTopicPracticeSolved
};
