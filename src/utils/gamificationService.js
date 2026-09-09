/**
 * gamificationService.js
 * Centralized Gamification, XP, Leveling, and SEED Credits Engine for SEED-IT.
 *
 * Rules:
 * - Non-linear, challenging leveling curve ("don't make XP gain too easy").
 * - Difficulty-scaled Question Bank XP & Credits rewards.
 * - Course gamification (1,000 XP & 500 Credits per course split across modules/submodules).
 * - Dual persistence across Firebase Firestore (users/{uid}), LocalStorage (auth_data),
 *   and Desktop Local Profile Folder.
 * - Reactive CustomEvent broadcasting for instant UI responsiveness.
 */

import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase-config';
import desktopBridge from './desktopBridge';

// ─── Level Title Brackets ───────────────────────────────────────────────────
// Level 1 to 15, Level 16 to 40, Level 41 to 70, Level 71 to 99, and Level 100+ (Highest title, level keeps increasing)
export const getLevelTitle = (level) => {
  const lvl = Math.max(1, Math.floor(Number(level) || 1));
  if (lvl >= 100) return 'SEED Grandmaster';         // Level 100+ (Highest Title, unbounded)
  if (lvl >= 71)  return 'System Architect';         // Level 71 to 99
  if (lvl >= 41)  return 'Senior Software Engineer';  // Level 41 to 70
  if (lvl >= 16)  return 'Software Engineer';        // Level 16 to 40
  return 'Novice Developer';                           // Level 1 to 15
};

export const LEVEL_TIERS = [
  { levelRange: 'Level 1 – 15',   minLevel: 1,   maxLevel: 15,  title: 'Novice Developer',         description: 'Master computational basics and coding syntax.' },
  { levelRange: 'Level 16 – 40',  minLevel: 16,  maxLevel: 40,  title: 'Software Engineer',        description: 'Build fluency in core data structures and algorithms.' },
  { levelRange: 'Level 41 – 70',  minLevel: 41,  maxLevel: 70,  title: 'Senior Software Engineer', description: 'Solve advanced algorithmic and competitive problems.' },
  { levelRange: 'Level 71 – 99',  minLevel: 71,  maxLevel: 99,  title: 'System Architect',         description: 'Architect scalable fullstack systems and backend infrastructure.' },
  { levelRange: 'Level 100+',     minLevel: 100, maxLevel: Infinity, title: 'SEED Grandmaster',   description: 'Supreme computational mastery with unbounded level progression.' }
];

/**
 * Returns minimum XP needed to attain a given level (L >= 1).
 * Formula: MinXP(L) = 20*L^2 + 390*L - 410 (for L=1: 0, L=2: 450, L=3: 940, etc.)
 */
export const getXPForLevel = (level) => {
  const lvl = Math.max(1, Math.floor(Number(level) || 1));
  if (lvl <= 1) return 0;
  return 20 * (lvl - 1) * (lvl + 20.5);
};

/**
 * Calculate user Level and progress details from total accumulated XP (unbounded, no ceiling).
 * Returns: { level, levelTitle, currentLevelMinXP, nextLevelXP, progressInLevelXP, neededForNextLevel, progressPercent, totalXP }
 */
export const calculateLevel = (totalXP = 0) => {
  const safeXP = Math.max(0, Number(totalXP) || 0);

  // Exact inverted closed-form level calculation with no upper limit
  const rawLevel = (-19.5 + Math.sqrt(462.25 + 0.2 * safeXP)) / 2;
  const level = Math.max(1, Math.floor(rawLevel + 1e-9));
  const levelTitle = getLevelTitle(level);

  const currentLevelMinXP = getXPForLevel(level);
  const nextLevelXP = getXPForLevel(level + 1);
  const span = Math.max(1, nextLevelXP - currentLevelMinXP);
  const progressInLevelXP = Math.max(0, safeXP - currentLevelMinXP);
  const neededForNextLevel = Math.max(0, nextLevelXP - safeXP);
  const progressPercent = Math.min(100, Math.max(0, Math.round((progressInLevelXP / span) * 100)));

  return {
    level,
    levelTitle,
    currentLevelMinXP,
    nextLevelXP,
    progressInLevelXP,
    neededForNextLevel,
    progressPercent,
    totalXP: safeXP
  };
};

// ─── Question Bank Reward Matrix ──────────────────────────────────────────────
// Harder reward matrix: XP and Coin Minting is disciplined and earned
export const QUESTION_BANK_REWARDS = {
  beginner: { xp: 5,  credits: 1 },
  easy:     { xp: 10, credits: 2 },
  medium:   { xp: 20, credits: 4 },
  hard:     { xp: 40, credits: 8 }
};

/**
 * Get Question Bank reward scaled by problem difficulty.
 */
export const getQuestionBankReward = (difficulty = 'easy') => {
  const clean = String(difficulty || 'easy').trim().toLowerCase();
  return QUESTION_BANK_REWARDS[clean] || QUESTION_BANK_REWARDS.easy;
};

// ─── Dynamic Course Reward Calculator ─────────────────────────────────────────
// Each course is calibrated strictly between 300 and 500 XP, and 50 to 90 Credits based on module count and hours.
export const calculateCourseRewards = (course) => {
  const moduleCount = Array.isArray(course?.modules)
    ? course.modules.length
    : (Number(course?.modulesCount) || 4);
  const estimatedHours = Number(course?.estimatedHours) || (moduleCount * 6);

  // Scaled XP: 300 to 500 XP maximum based on content scale
  const xpBonus = Math.min(200, Math.round((moduleCount * 18) + (estimatedHours * 1.5)));
  const totalXP = Math.min(500, Math.max(300, 300 + xpBonus));

  // Scaled SEED Credits: 50 to 90 Credits (500 was too much)
  const creditBonus = Math.min(40, Math.round((moduleCount * 3.5) + (estimatedHours * 0.3)));
  const totalCredits = Math.min(90, Math.max(50, 50 + creditBonus));

  return { totalXP, totalCredits };
};

// ─── Course Gamification Spec ─────────────────────────────────────────────────
export const COURSE_GAMIFICATION_SPEC = {
  DEFAULT_COURSE_XP: 400,
  DEFAULT_COURSE_CREDITS: 70,
  TOPIC_READING_XP: 5,
  TOPIC_PRACTICE_XP: 10,
  TOPIC_PRACTICE_CREDITS: 1,
  TOPIC_COMPLETION_XP: 5,
  TOPIC_COMPLETION_CREDITS: 1,
  MODULE_MSA_PASS_XP: 40,
  MODULE_MSA_PASS_CREDITS: 8
};

// ─── Get Current Gamification State for User ──────────────────────────────────
export const getUserGamification = (uid) => {
  let totalXP = 0;
  let seedCredits = 2450;

  // Try local auth_data
  try {
    const raw = localStorage.getItem('auth_data');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.totalXP === 'number') totalXP = parsed.totalXP;
      if (typeof parsed.seedCredits === 'number') seedCredits = parsed.seedCredits;
    }
  } catch (_) {}

  const levelInfo = calculateLevel(totalXP);
  return {
    ...levelInfo,
    seedCredits
  };
};

// ─── Centralized Award Function ───────────────────────────────────────────────
/**
 * Atomically or cleanly award XP and SEED Credits to user.
 * Syncs Firestore users/{uid}, LocalStorage auth_data, Desktop cache, and broadcasts window event.
 */
export const awardUserXPAndCredits = async (uid, xpDelta = 0, creditsDelta = 0, reason = '', metadata = {}) => {
  if (!uid || uid === 'guest' || uid === 'demo') {
    // For guest/demo users, update local cache and broadcast
    const current = getUserGamification(uid);
    const newXP = Math.max(0, current.totalXP + (Number(xpDelta) || 0));
    const newCredits = Math.max(0, current.seedCredits + (Number(creditsDelta) || 0));
    const newLevelInfo = calculateLevel(newXP);

    try {
      const raw = localStorage.getItem('auth_data');
      const authObj = raw ? JSON.parse(raw) : {};
      authObj.totalXP = newXP;
      authObj.seedCredits = newCredits;
      authObj.level = newLevelInfo.level;
      authObj.levelTitle = newLevelInfo.levelTitle;
      localStorage.setItem('auth_data', JSON.stringify(authObj));
    } catch (_) {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('user_gamification_updated', {
        detail: {
          uid,
          totalXP: newXP,
          seedCredits: newCredits,
          ...newLevelInfo,
          xpDelta,
          creditsDelta,
          reason,
          metadata
        }
      }));
    }
    return { totalXP: newXP, seedCredits: newCredits, ...newLevelInfo };
  }

  // 1. Read existing from LocalStorage first to calculate new totals immediately
  const existing = getUserGamification(uid);
  const nextXP = Math.max(0, existing.totalXP + (Number(xpDelta) || 0));
  const nextCredits = Math.max(0, existing.seedCredits + (Number(creditsDelta) || 0));
  const nextLevelInfo = calculateLevel(nextXP);

  // 2. Update LocalStorage auth_data immediately for zero UI latency
  try {
    const raw = localStorage.getItem('auth_data');
    const authObj = raw ? JSON.parse(raw) : {};
    authObj.totalXP = nextXP;
    authObj.seedCredits = nextCredits;
    authObj.level = nextLevelInfo.level;
    authObj.levelTitle = nextLevelInfo.levelTitle;
    localStorage.setItem('auth_data', JSON.stringify(authObj));
  } catch (_) {}

  // 3. Save to Desktop Profile Folder on disk
  try {
    desktopBridge.saveUserProfileCache(uid, 'gamification', {
      totalXP: nextXP,
      seedCredits: nextCredits,
      level: nextLevelInfo.level,
      levelTitle: nextLevelInfo.levelTitle,
      updatedAt: new Date().toISOString()
    });
  } catch (_) {}

  // 4. Update Firestore users/{uid} collection
  if (db && navigator.onLine) {
    try {
      const userRef = doc(db, 'users', uid);
      const updatePayload = {
        totalXP: nextXP,
        seedCredits: nextCredits,
        level: nextLevelInfo.level,
        levelTitle: nextLevelInfo.levelTitle,
        lastActiveDate: new Date().toISOString().split('T')[0],
        updatedAt: serverTimestamp()
      };

      await updateDoc(userRef, updatePayload).catch(async () => {
        return setDoc(userRef, updatePayload, { merge: true });
      });
    } catch (err) {
      console.warn('[gamificationService] Firestore update error:', err.message);
    }
  }

  // 5. Broadcast change event across window
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('user_gamification_updated', {
      detail: {
        uid,
        totalXP: nextXP,
        seedCredits: nextCredits,
        ...nextLevelInfo,
        xpDelta,
        creditsDelta,
        reason,
        metadata
      }
    }));
  }

  console.log(`[Gamification] Awarded user ${uid}: +${xpDelta} XP, +${creditsDelta} Credits (${reason}). Total: ${nextXP} XP (Lvl ${nextLevelInfo.level})`);
  return {
    totalXP: nextXP,
    seedCredits: nextCredits,
    ...nextLevelInfo
  };
};

export default {
  LEVEL_TIERS,
  getLevelTitle,
  getXPForLevel,
  calculateLevel,
  QUESTION_BANK_REWARDS,
  getQuestionBankReward,
  calculateCourseRewards,
  COURSE_GAMIFICATION_SPEC,
  getUserGamification,
  awardUserXPAndCredits
};
