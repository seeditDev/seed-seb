/**
 * publicProfileService.js — SEED-IT Public Profile & Portfolio Engine
 *
 * Manages public profile publishing and retrieval for unauthenticated internet access
 * at `seedit.site/user/{username}`.
 *
 * Exposes ONLY safe public achievements:
 * - Full Name, @username, College, Department, Year/Cohort
 * - Solved problem statistics (Easy, Medium, Hard, Total)
 * - 365-day Activity Heatmap matrix
 * - Enrolled tracks & course completion progress
 * - Earned milestone badges & honors
 *
 * Strictly omits all sensitive PII (emails, phone numbers, passwords, auth tokens, proctor logs).
 */

import { db } from '../lib/firebase-config';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { sanitizeUsernameComponent } from './usernameService';
import { isQuestionBankProblem } from './codingProgressService';
import { calculateLevel } from '../utils/gamificationService';

const PUBLIC_PROFILES = 'publicProfiles';

/**
 * Computes standard 365-day (52-week) heatmap grid dates and daily counts.
 */
export function generateYearHeatmapData(activityMap = {}, problemDetails = {}) {
  const today = new Date();
  const days = [];
  const map = { ...(activityMap || {}) };

  // Overlay problemDetails dates if available (QuestionBank problems only)
  if (problemDetails && typeof problemDetails === 'object') {
    Object.entries(problemDetails).forEach(([qId, detail]) => {
      if (detail && detail.status === 'SOLVED' && detail.lastSolvedAt) {
        if (!isQuestionBankProblem(detail.questionId || qId)) return;
        const dStr = String(detail.lastSolvedAt).split('T')[0];
        if (dStr) {
          if (!map[dStr]) map[dStr] = { problemsSolved: 0 };
          map[dStr].problemsSolved = (map[dStr].problemsSolved || 0) + 1;
        }
      }
    });
  }

  // 52 weeks back = 364 days
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 364);
  // Shift to previous Sunday to align calendar weeks
  const dayOfWeek = startDate.getDay();
  startDate.setDate(startDate.getDate() - dayOfWeek);

  const curr = new Date(startDate);
  let totalContributions = 0;
  let activeDays = 0;
  let maxDayCount = 0;

  while (curr <= today) {
    const dateStr = curr.toISOString().split('T')[0];
    const act = map[dateStr];
    const count = typeof act === 'number' ? act : (act?.problemsSolved || act?.questionsAttempted || 0);

    totalContributions += count;
    if (count > 0) activeDays++;
    if (count > maxDayCount) maxDayCount = count;

    // Intensity level: 0 to 4
    let level = 0;
    if (count >= 1 && count <= 2) level = 1;
    else if (count >= 3 && count <= 5) level = 2;
    else if (count >= 6 && count <= 9) level = 3;
    else if (count >= 10) level = 4;

    days.push({
      date: dateStr,
      count,
      level,
      dayOfWeek: curr.getDay(),
    });

    curr.setDate(curr.getDate() + 1);
  }

  return {
    days,
    totalContributions,
    activeDays,
    maxDayCount,
    startDate: startDate.toISOString().split('T')[0],
    endDate: today.toISOString().split('T')[0],
  };
}

/**
 * Computes badges from user stats and solved count.
 */
export function computeStudentBadges(solvedCount = 0, assessmentsCount = 0, streak = 0) {
  const badges = [];

  if (solvedCount >= 1) {
    badges.push({
      id: 'first_steps',
      title: 'First Problem Solved',
      desc: 'Solved their first coding challenge on SEED-IT.',
      icon: 'Rocket',
      color: '#38bdf8',
    });
  }
  if (solvedCount >= 10) {
    badges.push({
      id: 'coding_scholar',
      title: 'Coding Scholar',
      desc: 'Solved 10+ algorithmic coding challenges.',
      icon: 'BookOpen',
      color: '#a78bfa',
    });
  }
  if (solvedCount >= 30) {
    badges.push({
      id: 'dsa_expert',
      title: 'DSA Master',
      desc: 'Solved 30+ complex data structure problems.',
      icon: 'Trophy',
      color: '#fb923c',
    });
  }
  if (solvedCount >= 50) {
    badges.push({
      id: 'grandmaster',
      title: 'SEED Grandmaster',
      desc: 'Solved 50+ challenges across multi-language tracks.',
      icon: 'Crown',
      color: '#f43f5e',
    });
  }
  if (streak >= 7) {
    badges.push({
      id: 'streak_warrior',
      title: '7-Day Streak',
      desc: 'Maintained consistent coding consistency for 7 days.',
      icon: 'Flame',
      color: '#ef4444',
    });
  }
  if (assessmentsCount >= 3) {
    badges.push({
      id: 'exam_veteran',
      title: 'Assessment Veteran',
      desc: 'Completed 3+ institutional proctored exams.',
      icon: 'Award',
      color: '#10b981',
    });
  }

  return badges;
}

/**
 * Publishes or updates the public profile document at `publicProfiles/{username}`.
 */
export async function publishPublicProfile(uid, userProfile = {}, progressData = {}, assessments = []) {
  if (!uid) return null;
  const username = sanitizeUsernameComponent(userProfile.username);
  if (!username) return null;

  const solvedProblems = (progressData.completedQuestions || progressData.solvedProblems || []).filter(isQuestionBankProblem);
  const solvedCount = solvedProblems.length;
  const attemptedCount = (progressData.attemptedQuestions || []).filter(isQuestionBankProblem).length;

  // Approximate difficulty breakdown (QuestionBank only)
  let easySolved = 0;
  let mediumSolved = 0;
  let hardSolved = 0;

  if (progressData.problemDetails) {
    Object.entries(progressData.problemDetails).forEach(([qId, detail]) => {
      if (detail.status === 'SOLVED' && isQuestionBankProblem(detail.questionId || qId)) {
        const diff = String(detail.difficulty || '').toLowerCase();
        if (diff === 'hard') hardSolved++;
        else if (diff === 'medium') mediumSolved++;
        else easySolved++;
      }
    });
  } else {
    // Default proportional split
    easySolved = Math.ceil(solvedCount * 0.6);
    mediumSolved = Math.floor(solvedCount * 0.3);
    hardSolved = Math.max(0, solvedCount - easySolved - mediumSolved);
  }

  const completedAssessments = Array.isArray(assessments)
    ? assessments.filter((a) => a.completed).length
    : 0;

  const streak = typeof userProfile.streak === 'number' 
    ? userProfile.streak 
    : (typeof progressData.streak === 'number' ? progressData.streak : 0);
  const heatmap = generateYearHeatmapData(progressData.activity, progressData.problemDetails);
  const badges = computeStudentBadges(solvedCount, completedAssessments, streak);

  // Fetch authentic course curriculum and enrolled courses from users/{uid}/courseProgress
  const tracks = [];
  try {
    const cpCol = collection(db, 'users', uid, 'courseProgress');
    const cpSnap = await getDocs(cpCol);
    if (!cpSnap.empty) {
      cpSnap.forEach(d => {
        const cData = d.data();
        const pct = Math.min(100, Math.max(0, Math.round(Number(cData.progressPercent ?? cData.progress ?? 0))));
        tracks.push({
          id: d.id,
          name: cData.title || cData.courseTitle || cData.name || d.id,
          category: cData.category || 'Curriculum',
          progress: pct,
          completedModules: Number(cData.completedModulesCount ?? (Array.isArray(cData.completedModules) ? cData.completedModules.length : 0)),
          status: cData.status || (pct >= 100 ? 'COMPLETED' : 'IN_PROGRESS'),
          certificateId: cData.certificateId || ''
        });
      });
    }
  } catch (cpErr) {
    console.warn('[publicProfileService] Failed to load genuine courseProgress in seed-seb:', cpErr.message);
  }

  if (tracks.length === 0 && Array.isArray(userProfile.enrolledCourses) && userProfile.enrolledCourses.length > 0) {
    for (const cItem of userProfile.enrolledCourses) {
      const cId = typeof cItem === 'string' ? cItem : (cItem?.id || cItem?.courseId || '');
      if (cId) {
        tracks.push({
          id: cId,
          name: typeof cItem === 'object' && cItem.title ? cItem.title : cId,
          category: 'Curriculum',
          progress: typeof cItem === 'object' && typeof cItem.progress === 'number' ? cItem.progress : 0,
          completedModules: 0,
          status: 'ENROLLED',
          certificateId: ''
        });
      }
    }
  }

  const publicPayload = {
    username,
    uid,
    name: userProfile.name || 'SEED-IT Student',
    college: userProfile.college || userProfile.tenant?.name || 'Partner Engineering College',
    department: userProfile.department || '',
    year: userProfile.year || '',
    cohortId: userProfile.cohortId || '',
    bio: userProfile.bio || 'Computer Science student pursuing software excellence on SEED-IT.',
    avatarUrl: userProfile.photoURL || '',
    streak,
    lastStreakDate: typeof userProfile.lastStreakDate === 'string' ? userProfile.lastStreakDate.split('T')[0] : '',
    seedCredits: userProfile.seedCredits || 0,
    totalXP: userProfile.totalXP || 0,
    level: userProfile.level || calculateLevel(userProfile.totalXP || 0).level,
    levelTitle: userProfile.levelTitle || calculateLevel(userProfile.totalXP || 0).levelTitle,
    linkedin: userProfile.linkedin || userProfile.linkedIn || '',
    github: userProfile.github || userProfile.githubUrl || '',
    portfolio: userProfile.portfolio || userProfile.portfolioUrl || userProfile.website || '',
    leetcode: userProfile.leetcode || userProfile.leetcodeUrl || '',
    codechef: userProfile.codechef || userProfile.codechefUrl || '',
    stats: {
      solvedCount,
      totalQuestions: 9328,
      totalQuestionsDisplay: '9,000+',
      attemptedCount,
      easySolved,
      mediumSolved,
      hardSolved,
      completedAssessments,
      totalContributions: heatmap.totalContributions,
      activeDays: heatmap.activeDays,
    },
    activity: progressData.activity || {},
    heatmapData: heatmap,
    tracks,
    badges,
    updatedAt: new Date().toISOString(),
    publishedAt: serverTimestamp(),
  };

  await setDoc(doc(db, PUBLIC_PROFILES, username), publicPayload, { merge: true });
  console.log('[publicProfileService] Published public profile for @' + username);
  return publicPayload;
}

/**
 * Fetches a public profile for any visitor on the internet.
 * Accessible without authentication.
 */
export async function getPublicProfileByUsername(username) {
  if (!username) return null;
  const clean = sanitizeUsernameComponent(username);

  try {
    const snap = await getDoc(doc(db, PUBLIC_PROFILES, clean));
    if (snap.exists()) {
      return snap.data();
    }

    // Fallback: check if handle exists in usernames collection
    const uSnap = await getDoc(doc(db, 'usernames', clean));
    if (uSnap.exists()) {
      const uData = uSnap.data();
      return {
        username: clean,
        name: uData.name || 'SEED-IT Student',
        college: uData.college || '',
        department: uData.department || '',
        bio: 'Computer Science student pursuing software excellence on SEED-IT.',
        streak: 0,
        stats: {
          solvedCount: 0,
          easySolved: 0,
          mediumSolved: 0,
          hardSolved: 0,
          totalContributions: 0,
          activeDays: 0,
        },
        heatmapData: generateYearHeatmapData(),
        tracks: [],
        badges: [],
      };
    }
    return null;
  } catch (err) {
    console.error('[publicProfileService] getPublicProfileByUsername failed:', err);
    return null;
  }
}

export default {
  generateYearHeatmapData,
  computeStudentBadges,
  publishPublicProfile,
  getPublicProfileByUsername,
};
