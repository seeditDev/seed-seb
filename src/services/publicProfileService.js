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
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { sanitizeUsernameComponent } from './usernameService';

const PUBLIC_PROFILES = 'publicProfiles';

/**
 * Computes standard 365-day (52-week) heatmap grid dates and daily counts.
 */
export function generateYearHeatmapData(activityMap = {}, problemDetails = {}) {
  const today = new Date();
  const days = [];
  const map = { ...(activityMap || {}) };

  // Overlay problemDetails dates if available
  if (problemDetails && typeof problemDetails === 'object') {
    Object.values(problemDetails).forEach((detail) => {
      if (detail && detail.status === 'SOLVED' && detail.lastSolvedAt) {
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

  const solvedProblems = progressData.completedQuestions || progressData.solvedProblems || [];
  const solvedCount = solvedProblems.length || progressData.solvedCount || 0;
  const attemptedCount = (progressData.attemptedQuestions || []).length || progressData.attemptedCount || 0;

  // Approximate difficulty breakdown
  let easySolved = 0;
  let mediumSolved = 0;
  let hardSolved = 0;

  if (progressData.problemDetails) {
    Object.entries(progressData.problemDetails).forEach(([qId, detail]) => {
      if (detail.status === 'SOLVED') {
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

  const streak = typeof userProfile.streak === 'number' ? userProfile.streak : 0;
  const heatmap = generateYearHeatmapData(progressData.activity, progressData.problemDetails);
  const badges = computeStudentBadges(solvedCount, completedAssessments, streak);

  // Common Curriculum tracks
  const tracks = [
    {
      id: 'c_programming',
      name: 'C Programming & Pointers',
      category: 'Systems',
      progress: Math.min(100, Math.round((solvedCount / 25) * 100)),
    },
    {
      id: 'dsa_core',
      name: 'Data Structures & Algorithms',
      category: 'Core Computer Science',
      progress: Math.min(100, Math.round((solvedCount / 40) * 100)),
    },
    {
      id: 'java_oops',
      name: 'Java & Object Oriented Design',
      category: 'Backend',
      progress: Math.min(100, Math.round((solvedCount / 30) * 100)),
    },
  ];

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
    seedCredits: userProfile.seedCredits || 0,
    linkedin: userProfile.linkedin || userProfile.linkedIn || '',
    portfolio: userProfile.portfolio || userProfile.portfolioUrl || userProfile.website || '',
    leetcode: userProfile.leetcode || userProfile.leetcodeUrl || '',
    codechef: userProfile.codechef || userProfile.codechefUrl || '',
    stats: {
      solvedCount,
      attemptedCount,
      easySolved,
      mediumSolved,
      hardSolved,
      completedAssessments,
      totalContributions: heatmap.totalContributions,
      activeDays: heatmap.activeDays,
    },
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
