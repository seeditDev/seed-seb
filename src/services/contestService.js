import { db } from '../lib/firebase-config';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  increment,
  getCountFromServer,
  limit,
} from 'firebase/firestore';

const CONTESTS = 'contests';
const ASSESSMENTS = 'assessments';

/**
 * Normalise contest document from Firestore
 */
export function normaliseContest(id, raw = {}) {
  const isGlobal = raw.isGlobal !== false && (raw.isGlobal === true || raw.tenantId === 'global' || !raw.tenantId);
  const startTime = raw.startTime || new Date().toISOString();
  const endTime = raw.endTime || new Date(Date.now() + 7200000).toISOString();
  const durationMinutes = Number(raw.durationMinutes || raw.duration || 120);
  const registrationStartTime = raw.registrationStartTime || '';
  const registrationEndTime = raw.registrationEndTime || '';
  const roundCount = Number(raw.roundCount || (Array.isArray(raw.rounds) ? raw.rounds.length : 1));
  const rounds = Array.isArray(raw.rounds) ? raw.rounds.map((r, idx) => ({
    ...r,
    roundNumber: r.roundNumber || idx + 1,
    roundName: r.roundName || r.name || `Round ${r.roundNumber || idx + 1}`,
    name: r.roundName || r.name || `Round ${r.roundNumber || idx + 1}`,
    durationMinutes: Number(r.durationMinutes || 60),
    passPercentage: r.passPercentage !== undefined ? Number(r.passPercentage) : 50,
    msaSlug: r.msaSlug || r.assessmentSlug || '',
    passkey: r.passkey || '',
    requiresSeb: r.requiresSeb !== undefined ? Boolean(r.requiresSeb) : (raw.requiresSeb !== false),
  })) : [];
  const currentRoundNumber = Number(raw.currentRoundNumber || 1);
  const rulesText = typeof raw.rulesText === 'string' ? raw.rulesText : '';
  const winners = Array.isArray(raw.winners) ? raw.winners : [];

  // Default sample problems if not provided
  const sampleProblems = Array.isArray(raw.sampleProblems) && raw.sampleProblems.length > 0
    ? raw.sampleProblems
    : [
        { id: 'sp1', order: 1, title: 'Array Transformation', difficulty: 'Easy', topics: 'Arrays, Implementation', points: 100 },
        { id: 'sp2', order: 2, title: 'Minimum Operations', difficulty: 'Medium', topics: 'Greedy, Math', points: 150 },
        { id: 'sp3', order: 3, title: 'Graph Connections', difficulty: 'Hard', topics: 'Graphs, DFS', points: 200 },
      ];

  // Default criteria
  const whoCanParticipate = Array.isArray(raw.whoCanParticipate) && raw.whoCanParticipate.length > 0
    ? raw.whoCanParticipate
    : [
        'Open to students and professionals worldwide',
        'No institution or country restrictions',
        'Individual participation only',
        'Use of external help or AI tools is not allowed',
        'Fair play policy strictly enforced',
      ];

  const whyParticipate = Array.isArray(raw.whyParticipate) && raw.whyParticipate.length > 0
    ? raw.whyParticipate
    : [
        'Test your skills against a global community',
        'Improve problem-solving and coding speed',
        'Get recognized on the global leaderboard',
        'Earn certificates and exciting prizes',
        'Be part of the SEED competitive community',
      ];

  const prizes = Array.isArray(raw.prizes) && raw.prizes.length > 0
    ? raw.prizes
    : [
        { rank: '1st Place', reward: '₹25,000 + Gold Trophy + Pro Membership', icon: 'gold' },
        { rank: '2nd Place', reward: '₹15,000 + Silver Trophy + Pro Membership', icon: 'silver' },
        { rank: '3rd Place', reward: '₹10,000 + Bronze Trophy + Pro Membership', icon: 'bronze' },
        { rank: 'Top 50', reward: 'Official SEED Certificate of Excellence + T-shirt', icon: 'medal' },
        { rank: 'All Participants', reward: 'Verifiable Certificate of Participation + Platform XP', icon: 'cert' },
      ];

  const rules = Array.isArray(raw.rules) && raw.rules.length > 0
    ? raw.rules
    : [
        { title: 'Contest Format', text: 'Timed multi-section contest consisting of algorithmic problem solving and coding challenges.' },
        { title: 'Scoring & Penalty', text: 'Score is calculated based on problems solved and completion speed. Wrong submissions incur a 20-minute time penalty.' },
        { title: 'SEB Lockdown & Proctoring', text: 'Full screen lockdown is enforced via SEED-SEB. Tab switching, secondary monitors, and unauthorized shortcuts are logged.' },
        { title: 'AI & External Help Policy', text: 'AI coding assistants (ChatGPT, Copilot, etc.) and external collaboration are strictly prohibited and result in immediate disqualification.' },
      ];

  const faqs = Array.isArray(raw.faqs) && raw.faqs.length > 0
    ? raw.faqs
    : [
        { q: 'Who is eligible to participate?', a: 'Any registered student or developer worldwide can participate in Global Arena contests.' },
        { q: 'What programming languages are supported?', a: 'C, C++, Java, and Python are supported with standard execution time and memory limits.' },
        { q: 'Do I need SEED-SEB desktop app?', a: 'Yes, competitive rated contests enforce secure desktop lockdown to ensure academic integrity.' },
        { q: 'When will certificates and ratings be published?', a: 'Official ratings and certificates are published within 24 hours after plagiarism and integrity audits.' },
      ];

  const organizer = raw.organizer || {
    name: 'SEED',
    tagline: 'Learn · Practice · Compete · Grow',
    verified: true,
  };

  return {
    id,
    title: raw.title || 'SEED Coding Challenges',
    slug: raw.slug || id,
    description: raw.description || 'Compete in real-time against coders worldwide, solve algorithmic challenges, and climb the global leaderboard.',
    bannerUrl: raw.bannerUrl || raw.imageUrl || '',
    imageUrl: raw.imageUrl || raw.bannerUrl || '',
    isGlobal,
    tenantId: isGlobal ? 'global' : (raw.tenantId || ''),
    tenantName: raw.tenantName || (isGlobal ? 'Global Arena' : 'College Hosted'),
    cohortIds: Array.isArray(raw.cohortIds) ? raw.cohortIds : [],
    departments: Array.isArray(raw.departments) ? raw.departments : [],
    accessTier: raw.accessTier || 'free',
    entryFee: Number(raw.entryFee || raw.entryFeeINR || 0),
    entryFeeINR: Number(raw.entryFeeINR || raw.entryFee || 0),
    prizePool: raw.prizePool || '₹25,000',
    contestType: raw.contestType || 'Algorithmic + Data Structures',
    passkey: raw.passkey || '',
    startTime,
    endTime,
    durationMinutes,
    duration: durationMinutes,
    registrationStartTime,
    registrationEndTime,
    roundCount,
    rounds,
    currentRoundNumber,
    rulesText,
    winners,
    status: raw.status || 'upcoming',
    isRated: raw.isRated !== false,
    scoringStrategy: raw.scoringStrategy || 'icpc',
    penaltyMinutes: Number(raw.penaltyMinutes || 20),
    leaderboardFrozen: Boolean(raw.leaderboardFrozen),
    freezeWindowMinutes: Number(raw.freezeWindowMinutes || 15),
    requiresSeb: raw.requiresSeb !== false,
    isProctored: raw.isProctored !== false,
    proctorConfig: raw.proctorConfig || {
      enabled: true,
      cameraRequired: true,
      audioRequired: false,
      tabSwitchLimit: 0,
      maxViolations: 200,
      maxCameraViolations: 200,
      maxAudioViolations: 200,
      autoSubmitOnViolation: true,
    },
    xpMultiplier: Number(raw.xpMultiplier || 1.5),
    seedCreditReward: Number(raw.seedCreditReward || 100),
    problemCount: Number(raw.problemCount || sampleProblems.length || 0),
    registeredCount: Number(raw.registeredCount || 0),
    registrationLimit: raw.registrationLimit !== undefined && raw.registrationLimit !== null && raw.registrationLimit !== '' ? Number(raw.registrationLimit) : undefined,
    isRegistrationClosed: Boolean(raw.isRegistrationClosed),
    showAttemptSummary: Boolean(raw.showAttemptSummary),
    submissionCount: Number(raw.submissionCount || 0),
    maxScore: Number(raw.maxScore || 600),
    sections: Array.isArray(raw.sections) ? raw.sections : [],
    assessmentId: raw.assessmentId || '',
    sampleProblems,
    whoCanParticipate,
    whyParticipate,
    prizes,
    rules,
    faqs,
    organizer,
    createdBy: raw.createdBy || '',
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
}

/**
 * Determine dynamic status based on time
 */
export function getContestDynamicStatus(contest) {
  if (!contest) return 'upcoming';
  if (contest.status === 'draft') return 'draft';
  if (contest.status === 'archived') return 'archived';
  if (contest.status === 'ended') return 'ended';

  const now = Date.now();
  const startMs = contest.startTime ? new Date(contest.startTime).getTime() : NaN;
  const endMs = contest.endTime ? new Date(contest.endTime).getTime() : NaN;

  if (!isNaN(endMs) && now > endMs) return 'ended';
  if (!isNaN(startMs) && now < startMs) return 'upcoming';
  if (!isNaN(startMs) && !isNaN(endMs) && now >= startMs && now <= endMs) return 'live';
  if (!isNaN(startMs) && isNaN(endMs) && now >= startMs) return 'live';

  return contest.status || 'upcoming';
}

/**
 * Fetch all available contests for student
 */
export async function listAvailableContests(tenantId = '', cohortId = '', isPremium = false) {
  try {
    const col = collection(db, CONTESTS);
    const snap = await getDocs(col);
    if (snap.empty) return [];

    const list = [];
    for (const d of snap.docs) {
      const c = normaliseContest(d.id, d.data());

      // Ignore drafts
      if (c.status === 'draft') continue;

      // Scoping filter
      if (c.isGlobal) {
        c.dynamicStatus = getContestDynamicStatus(c);
        list.push(c);
      } else if (tenantId && c.tenantId === tenantId) {
        if (c.cohortIds && c.cohortIds.length > 0) {
          if (cohortId && c.cohortIds.includes(cohortId)) {
            c.dynamicStatus = getContestDynamicStatus(c);
            list.push(c);
          }
        } else {
          c.dynamicStatus = getContestDynamicStatus(c);
          list.push(c);
        }
      }
    }

    // Sort: live first, then upcoming (closest first), then ended (most recent first)
    return list.sort((a, b) => {
      const order = { live: 0, upcoming: 1, ended: 2, archived: 3 };
      const rankA = order[a.dynamicStatus] ?? 99;
      const rankB = order[b.dynamicStatus] ?? 99;
      if (rankA !== rankB) return rankA - rankB;
      return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
    });
  } catch (err) {
    console.error('[contestService] listAvailableContests error:', err);
    return [];
  }
}

/**
 * Get a single contest by ID with accurate registration count
 */
export async function getContestById(contestId) {
  try {
    const ref = doc(db, CONTESTS, contestId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const c = normaliseContest(snap.id, snap.data());
    c.dynamicStatus = getContestDynamicStatus(c);

    // Reconcile registration count if needed
    try {
      const regCol = collection(db, CONTESTS, contestId, 'registrations');
      const countSnap = await getCountFromServer(regCol);
      const actualCount = countSnap.data().count;
      if (actualCount !== c.registeredCount) {
        c.registeredCount = actualCount;
        updateDoc(ref, { registeredCount: actualCount }).catch(() => {});
      }
    } catch (_) {}

    return c;
  } catch (err) {
    console.error('[contestService] getContestById error:', err);
    return null;
  }
}

/**
 * Real-time listener for a single contest
 */
export function subscribeToContest(contestId, onUpdate) {
  if (!contestId) return () => {};
  const ref = doc(db, CONTESTS, contestId);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      onUpdate(null);
      return;
    }
    const c = normaliseContest(snap.id, snap.data());
    c.dynamicStatus = getContestDynamicStatus(c);
    onUpdate(c);
  }, (err) => {
    console.warn('[contestService] subscribeToContest error:', err);
  });
}

/**
 * Real-time listener for user registration state on a contest
 */
export function subscribeToContestRegistration(contestId, userId, onUpdate) {
  if (!contestId || !userId) return () => {};
  const ref = doc(db, CONTESTS, contestId, 'registrations', userId);
  return onSnapshot(ref, (snap) => {
    onUpdate(snap.exists());
  }, (err) => {
    console.warn('[contestService] subscribeToContestRegistration error:', err);
    onUpdate(false);
  });
}

/**
 * Check if a user is registered for a contest
 */
export async function checkContestRegistration(contestId, userId) {
  if (!contestId || !userId) return false;
  try {
    const ref = doc(db, CONTESTS, contestId, 'registrations', userId);
    const snap = await getDoc(ref);
    return snap.exists();
  } catch (err) {
    console.warn('[contestService] checkContestRegistration error:', err);
    return false;
  }
}

/**
 * Register user for a contest with atomic count increment
 */
export async function registerForContest(contest, user, passkeyInput = '') {
  if (!contest?.id || !user?.uid) {
    throw new Error('Invalid contest or user');
  }

  // Validate manual registration closure
  if (contest.isRegistrationClosed) {
    throw new Error('Registration for this contest has been closed by the organizer.');
  }

  // Validate registration limit if configured
  if (contest.registrationLimit !== undefined && contest.registrationLimit !== null && Number(contest.registrationLimit) > 0) {
    const currentCount = Number(contest.registeredCount || 0);
    if (currentCount >= Number(contest.registrationLimit)) {
      throw new Error(`Registration limit reached (${contest.registrationLimit} seats). No more registrations are allowed.`);
    }
  }

  // Validate Pro tier if required
  if (contest.accessTier === 'pro_only' && !user.isPremium && !user.isPro) {
    throw new Error('This contest requires an active Pro subscription to register.');
  }

  // Validate Paid Entry if required
  const entryFee = Number(contest.entryFeeINR || contest.entryFee || 0);
  if (contest.accessTier === 'paid_entry' || entryFee > 0) {
    const hasPass = Boolean(
      user.isPremium ||
      user.isPro ||
      user.contestPasses?.[contest.id]
    );
    if (!hasPass) {
      throw new Error(`This contest requires an entry pass of ₹${entryFee}. Please complete payment to register.`);
    }
  }

  // Validate Passkey if required
  if (contest.passkey && contest.passkey.trim() !== '') {
    if (!passkeyInput || passkeyInput.trim() !== contest.passkey.trim()) {
      throw new Error('Invalid passkey. Please check with your instructor or event host.');
    }
  }

  const regRef = doc(db, CONTESTS, contest.id, 'registrations', user.uid);
  const existing = await getDoc(regRef);
  if (existing.exists()) {
    return { alreadyRegistered: true };
  }

  await setDoc(regRef, {
    userId: user.uid,
    displayName: user.displayName || user.name || 'Student',
    email: user.email || '',
    tenantId: user.tenantId || '',
    tenantName: user.tenantName || (user.tenantId ? user.tenantId.toUpperCase() : 'Student'),
    cohortId: user.cohortId || '',
    registeredAt: serverTimestamp(),
    status: 'registered',
  });

  // Atomically increment participant count
  try {
    await updateDoc(doc(db, CONTESTS, contest.id), {
      registeredCount: increment(1),
    });
  } catch (_) {}

  return { success: true };
}

/**
 * Unregister user from a contest with atomic count decrement
 */
export async function unregisterFromContest(contestId, userId) {
  if (!contestId || !userId) return false;
  try {
    const regRef = doc(db, CONTESTS, contestId, 'registrations', userId);
    const existing = await getDoc(regRef);
    if (!existing.exists()) return false;

    await deleteDoc(regRef);

    try {
      await updateDoc(doc(db, CONTESTS, contestId), {
        registeredCount: increment(-1),
      });
    } catch (_) {}

    return true;
  } catch (err) {
    console.error('[contestService] unregisterFromContest error:', err);
    return false;
  }
}

/**
 * List registered participants for a contest
 */
export async function listContestParticipants(contestId) {
  if (!contestId) return [];
  try {
    const col = collection(db, CONTESTS, contestId, 'registrations');
    const snap = await getDocs(query(col, orderBy('registeredAt', 'desc')));
    return snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
  } catch (err) {
    console.error('[contestService] listContestParticipants error:', err);
    return [];
  }
}

/**
 * List problems for a contest from Firestore
 */
export async function listContestProblems(contestId) {
  try {
    const col = collection(db, CONTESTS, contestId, 'problems');
    const snap = await getDocs(query(col, orderBy('order', 'asc')));
    if (snap.empty) return [];
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        contestId,
        title: data.title || 'Untitled Problem',
        slug: data.slug || d.id,
        order: Number(data.order || 1),
        difficulty: data.difficulty || 'Medium',
        points: Number(data.points || 100),
        description: data.description || '',
        constraints: data.constraints || '',
        inputFormat: data.inputFormat || '',
        outputFormat: data.outputFormat || '',
        sampleTestCases: Array.isArray(data.sampleTestCases) ? data.sampleTestCases : [],
        hiddenTestCases: Array.isArray(data.hiddenTestCases) ? data.hiddenTestCases : [],
        boilerplates: data.boilerplates || {
          python: '# Write your code here\n\ndef solve():\n    pass\n',
          cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    return 0;\n}\n',
          java: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n    }\n}\n',
          c: '#include <stdio.h>\n\nint main() {\n    return 0;\n}\n',
        },
      };
    });
  } catch (err) {
    console.error('[contestService] listContestProblems error:', err);
    return [];
  }
}

/**
 * PREPARE CONTEST MSA ASSESSMENT PAYLOAD
 *
 * Fetches sections and question data strictly from Firestore (never static JSON)
 * and initializes MultiSectionAssessment runtime storage.
 */
export async function prepareContestMSAAssessment(contest, user, preferredRoundNumber = null, userPasskey = '') {
  if (!contest?.id) throw new Error('Invalid contest provided');

  let sections = [];
  let targetRound = null;

  // 1. If contest has multi-rounds configured
  if (Array.isArray(contest.rounds) && contest.rounds.length > 0) {
    if (preferredRoundNumber) {
      targetRound = contest.rounds.find((r) => r.roundNumber === preferredRoundNumber);
    }
    if (!targetRound) {
      targetRound = contest.rounds.find((r) => r.status === 'live') ||
                    contest.rounds.find((r) => r.roundNumber === (contest.currentRoundNumber || 1)) ||
                    contest.rounds[0];
    }

    // Qualification check for subsequent rounds (Round 2+)
    if (targetRound && targetRound.roundNumber > 1) {
      const shortlisted = Array.isArray(targetRound.shortlistedUids) ? targetRound.shortlistedUids : [];
      if (shortlisted.length > 0 && user?.uid && !shortlisted.includes(user.uid)) {
        throw new Error(
          `You have not been shortlisted for Round ${targetRound.roundNumber} ("${targetRound.name || 'Next Round'}"). Only qualified candidates can enter this round.`
        );
      }
    }

    // Validate round passkey if configured
    if (targetRound?.passkey && targetRound.passkey.trim() !== '') {
      const entered = (userPasskey || '').trim();
      if (!entered || entered.toLowerCase() !== targetRound.passkey.trim().toLowerCase()) {
        throw new Error(`Round ${targetRound.roundNumber} is protected. Please enter the valid round passkey.`);
      }
    }

    // 1. If round has an msaSlug mapped directly in Firebase, fetch the assessment document
    if (targetRound?.msaSlug && targetRound.msaSlug.trim() !== '') {
      try {
        const slug = targetRound.msaSlug.trim();
        let msaData = null;
        const slugDocRef = doc(db, ASSESSMENTS, slug);
        const slugSnap = await getDoc(slugDocRef);
        if (slugSnap.exists()) {
          msaData = slugSnap.data();
        } else {
          const q = query(collection(db, ASSESSMENTS), where('slug', '==', slug));
          const qSnap = await getDocs(q);
          if (!qSnap.empty) {
            msaData = qSnap.docs[0].data();
          }
        }
        if (msaData) {
          if (Array.isArray(msaData.sections) && msaData.sections.length > 0) {
            sections = msaData.sections;
          } else {
            sections = [{
              sectionId: `${contest.id}_round_${targetRound.roundNumber}`,
              name: msaData.title || msaData.name || targetRound.name || 'Contest Assessment',
              type: msaData.contentCategory || (msaData.problem || msaData.challenges || msaData.qids ? 'coding' : 'mcq'),
              duration_minutes: msaData.durationMinutes || targetRound.durationMinutes || contest.durationMinutes || 60,
              maxScore: msaData.maxScore || targetRound.maxScore || 100,
              slug,
              assessmentId: slug,
              ...msaData,
            }];
          }
        }
      } catch (err) {
        console.warn('[contestService] Error fetching mapped round msaSlug from Firestore:', err);
      }
    }

    // 2. If sections not resolved via msaSlug, use round embedded sections
    if (sections.length === 0 && targetRound && Array.isArray(targetRound.sections) && targetRound.sections.length > 0) {
      sections = targetRound.sections;
    }
  }

  // 3. If contest links directly to an authored Assessment doc in Firestore
  if (sections.length === 0 && contest.assessmentId) {
    try {
      const assDocRef = doc(db, ASSESSMENTS, contest.assessmentId);
      const assSnap = await getDoc(assDocRef);
      if (assSnap.exists()) {
        const assData = assSnap.data();
        if (Array.isArray(assData.sections) && assData.sections.length > 0) {
          sections = assData.sections;
        } else if (assData.questions?.length || assData.challenges?.length || assData.qids?.length || assData.problem) {
          sections = [{
            sectionId: `${contest.id}_sec_1`,
            name: assData.title || contest.title || 'Contest Questions',
            type: assData.contentCategory || (assData.problem || assData.challenges || assData.qids ? 'coding' : 'mcq'),
            duration_minutes: assData.durationMinutes || contest.durationMinutes || 60,
            maxScore: assData.maxScore || 100,
            slug: contest.assessmentId,
            assessmentId: contest.assessmentId,
            ...assData,
          }];
        }
      }
    } catch (err) {
      console.warn('[contestService] Failed to load linked assessment doc:', err);
    }
  }

  // 4. If contest has embedded sections
  if (sections.length === 0 && Array.isArray(contest.sections) && contest.sections.length > 0) {
    sections = contest.sections;
  }

  // 5. If contest has a 'problems' subcollection in Firestore, build a Coding section
  if (sections.length === 0) {
    try {
      const firestoreProblems = await listContestProblems(contest.id);
      if (firestoreProblems.length > 0) {
        sections = [{
          sectionId: `${contest.id}_coding_sec`,
          name: 'Algorithmic Coding Challenges',
          type: 'coding',
          duration_minutes: contest.durationMinutes || 120,
          maxScore: contest.maxScore || 600,
          challenges: firestoreProblems,
          questions: firestoreProblems,
        }];
      }
    } catch (err) {
      console.warn('[contestService] Failed to query contest problems subcollection:', err);
    }
  }

  // Ensure each section maintains canonical ID, slug, and assessmentId mapping,
  // and enrich directly from Firestore assessments/{slug} if questions/challenges are not yet loaded.
  sections = await Promise.all(
    sections.map(async (sec, idx) => {
      const slugOrId = sec.slug || sec.assessmentId;
      let enriched = { ...sec };
      if (slugOrId && typeof slugOrId === 'string' && !slugOrId.startsWith('http') && !slugOrId.endsWith('.json')) {
        try {
          let assessData = null;
          let resolvedDocId = slugOrId;
          const docRef = doc(db, ASSESSMENTS, slugOrId);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            assessData = snap.data();
            resolvedDocId = snap.id;
          } else {
            const q = query(collection(db, ASSESSMENTS), where('slug', '==', slugOrId));
            const qSnap = await getDocs(q);
            if (!qSnap.empty) {
              assessData = qSnap.docs[0].data();
              resolvedDocId = qSnap.docs[0].id;
            }
          }
          if (assessData) {
            enriched = {
              ...sec,
              ...assessData,
              sectionId: sec.sectionId || sec.id || `${contest.id}_sec_${idx + 1}`,
              name: sec.name || assessData.title || assessData.name || `Section ${idx + 1}`,
              type: assessData.contentCategory || sec.type || assessData.type || 'coding',
              duration_minutes: sec.duration_minutes || assessData.durationMinutes || 30,
              maxScore: sec.maxScore || assessData.maxScore || 100,
              slug: slugOrId,
              assessmentId: resolvedDocId,
              questions: (Array.isArray(assessData.questions) && assessData.questions.length > 0)
                ? assessData.questions
                : (Array.isArray(sec.questions) && sec.questions.length > 0 ? sec.questions : []),
              challenges: (Array.isArray(assessData.challenges) && assessData.challenges.length > 0)
                ? assessData.challenges
                : (Array.isArray(sec.challenges) && sec.challenges.length > 0 ? sec.challenges : []),
              qids: (Array.isArray(assessData.qids) && assessData.qids.length > 0)
                ? assessData.qids
                : (Array.isArray(sec.qids) && sec.qids.length > 0 ? sec.qids : []),
            };
          }
        } catch (err) {
          console.warn(`[contestService] Failed to load section assessment doc for slug "${slugOrId}":`, err);
        }
      }
      return {
        ...enriched,
        sectionId: enriched.sectionId || enriched.id || `${contest.id}_sec_${idx + 1}`,
        slug: enriched.slug || enriched.assessmentId || '',
        assessmentId: enriched.assessmentId || enriched.slug || '',
      };
    })
  );

  // Determine active round duration, SEB, and proctoring overrides
  const effectiveDuration = targetRound?.durationMinutes || contest.durationMinutes || 120;
  const effectiveRequiresSeb = targetRound?.requiresSeb !== undefined ? targetRound.requiresSeb : (contest.requiresSeb !== false);
  const effectiveProctorConfig = targetRound?.proctorConfig || contest.proctorConfig || {
    enabled: true,
    cameraRequired: true,
    audioRequired: false,
    tabSwitchLimit: 0,
    maxViolations: 200,
    maxCameraViolations: 200,
    maxAudioViolations: 200,
    autoSubmitOnViolation: true,
  };

  const cameraLimit = Number(effectiveProctorConfig?.maxCameraViolations ?? effectiveProctorConfig?.maxViolations) || 200;
  const audioLimit = Number(effectiveProctorConfig?.maxAudioViolations) || 200;

  // Build canonical MSA Assessment payload
  const canonicalAss = {
    id: contest.id,
    name: targetRound ? `${contest.title} — ${targetRound.name}` : contest.title,
    title: targetRound ? `${contest.title} — ${targetRound.name}` : contest.title,
    slug: contest.slug || contest.id,
    duration: effectiveDuration,
    duration_minutes: effectiveDuration,
    proctored: effectiveRequiresSeb !== false && contest.isProctored !== false,
    audioProctored: Boolean(effectiveProctorConfig?.audioRequired),
    maxViolations: cameraLimit,
    maxCameraViolations: cameraLimit,
    maxAudioViolations: audioLimit,
    tabSwitchLimit: Number(effectiveProctorConfig?.tabSwitchLimit) || 3,
    autoSubmitOnViolation: effectiveProctorConfig?.autoSubmitOnViolation !== false,
    isMultiSection: true,
    sections,
    isContest: true,
    contestId: contest.id,
    roundNumber: targetRound?.roundNumber || 1,
    roundName: targetRound?.name || 'Main Round',
    tenantId: contest.tenantId || 'global',
    maxScore: contest.maxScore || 600,
    scoringStrategy: contest.scoringStrategy || 'icpc',
    requiresSeb: effectiveRequiresSeb,
    proctorConfig: {
      ...effectiveProctorConfig,
      maxViolations: cameraLimit,
      maxCameraViolations: cameraLimit,
      maxAudioViolations: audioLimit,
    },
  };

  // Securely store in session storage for MultiSectionAssessment runtime
  sessionStorage.setItem('multisectionAssessmentData', JSON.stringify(canonicalAss));
  sessionStorage.setItem('msaCourseCtx', JSON.stringify({
    contestId: contest.id,
    assessmentId: contest.id,
    totalMarks: canonicalAss.maxScore,
    isContest: true,
  }));
  sessionStorage.setItem('msaSlug', canonicalAss.slug);

  // Fallback persistent backup for refresh
  localStorage.setItem(`msaActiveAssessment_${contest.id}`, JSON.stringify(canonicalAss));

  return `/student/assessment/id/${contest.slug || contest.id}`;
}

/**
 * Submit solution for a contest problem
 */
export async function submitContestSolution(contestId, arg2, arg3) {
  let userId, problemId, submissionData;
  if (typeof arg2 === 'string' && arg3 && typeof arg3 === 'object') {
    if (arg3.userId) {
      userId = arg3.userId;
      problemId = arg2;
      submissionData = { ...arg3, problemId };
    } else {
      userId = arg2;
      submissionData = arg3;
      problemId = arg3.problemId || '';
    }
  } else {
    submissionData = arg2 || {};
    userId = submissionData.userId;
    problemId = submissionData.problemId || '';
  }

  if (!contestId || !userId) return null;

  const subDoc = doc(db, CONTESTS, contestId, 'submissions', userId);

  await setDoc(subDoc, {
    submissionId: userId,
    contestId,
    problemId,
    userId,
    displayName: submissionData.displayName || 'Student',
    tenantId: submissionData.tenantId || 'global',
    tenantName: submissionData.tenantName || 'Global Arena',
    code: submissionData.code || '',
    language: submissionData.language || '',
    status: submissionData.status || 'accepted',
    passedTestCases: submissionData.passedTestCases || 0,
    totalTestCases: submissionData.totalTestCases || 0,
    executionTimeMs: submissionData.executionTimeMs || 0,
    score: submissionData.score || 0,
    submittedAt: serverTimestamp(),
  }, { merge: true });

  // Increment contest submission count
  try {
    await updateDoc(doc(db, CONTESTS, contestId), {
      submissionCount: increment(1),
    });
  } catch (_) {}

  // Update Live Leaderboard
  await updateLeaderboardEntry(contestId, userId, {
    displayName: submissionData.displayName,
    tenantId: submissionData.tenantId,
    tenantName: submissionData.tenantName,
    problemId,
    isAccepted: submissionData.status === 'accepted',
    scoreDelta: submissionData.score || 0,
  });

  return userId;
}

/**
 * Update Leaderboard entry for a participant
 */
async function updateLeaderboardEntry(contestId, userId, event) {
  const lbRef = doc(db, CONTESTS, contestId, 'leaderboard', userId);
  const snap = await getDoc(lbRef);

  const prev = snap.exists() ? snap.data() : {
    userId,
    displayName: event.displayName || 'Coder',
    tenantId: event.tenantId || 'global',
    tenantName: event.tenantName || 'Global Arena',
    totalScore: 0,
    totalPenaltyMinutes: 0,
    solvedCount: 0,
    problemStats: {},
  };

  const problemStats = prev.problemStats || {};
  const pStat = problemStats[event.problemId] || { solved: false, attempts: 0, penalty: 0 };

  if (!pStat.solved) {
    pStat.attempts += 1;
    if (event.isAccepted) {
      pStat.solved = true;
      pStat.solvedAt = new Date().toISOString();
      prev.solvedCount = (prev.solvedCount || 0) + 1;
      prev.totalScore = (prev.totalScore || 0) + (event.scoreDelta || 100);
      const wrongAttempts = pStat.attempts - 1;
      const penaltyForWrong = wrongAttempts * 20;
      prev.totalPenaltyMinutes = (prev.totalPenaltyMinutes || 0) + penaltyForWrong;
    }
  }

  problemStats[event.problemId] = pStat;

  await setDoc(lbRef, {
    ...prev,
    problemStats,
    lastActivity: serverTimestamp(),
  }, { merge: true });
}

/**
 * Subscribe to real-time contest leaderboard
 */
export function subscribeContestLeaderboard(contestId, onUpdate, maxLimit = 100) {
  const col = collection(db, CONTESTS, contestId, 'leaderboard');
  const q = query(col, limit(maxLimit));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({
      userId: d.id,
      ...d.data(),
    }));

    list.sort((a, b) => {
      // 1. Total score (strictly all testcase pass score for each question)
      const scoreDiff = (b.totalScore || 0) - (a.totalScore || 0);
      if (scoreDiff !== 0) return scoreDiff;

      // 2. Candidate assessment timing (how fast they solved all questions: timeTakenSeconds asc)
      const timeA = typeof a.timeTakenSeconds === 'number' ? a.timeTakenSeconds : Infinity;
      const timeB = typeof b.timeTakenSeconds === 'number' ? b.timeTakenSeconds : Infinity;
      if (timeA !== timeB) return timeA - timeB;

      // 3. Solved count (count of problems with all testcases passed)
      const solvedDiff = (b.solvedCount || 0) - (a.solvedCount || 0);
      if (solvedDiff !== 0) return solvedDiff;

      // 4. Partial score
      const partialDiff = (b.partialScore || 0) - (a.partialScore || 0);
      if (partialDiff !== 0) return partialDiff;

      // 5. Total penalty minutes
      return (a.totalPenaltyMinutes || 0) - (b.totalPenaltyMinutes || 0);
    });

    const ranked = list.map((item, idx) => ({
      ...item,
      rank: idx + 1,
    }));

    onUpdate(ranked);
  }, (err) => {
    console.warn('[contestService] subscribeContestLeaderboard error:', err);
  });
}

/**
 * Subscribe to live announcements
 */
export function subscribeContestAnnouncements(contestId, onUpdate) {
  const col = collection(db, CONTESTS, contestId, 'announcements');
  return onSnapshot(col, (snap) => {
    const list = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    list.sort((a, b) => {
      const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
      const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
      return tB - tA;
    });
    onUpdate(list);
  }, (err) => {
    console.warn('[contestService] subscribeContestAnnouncements error:', err);
  });
}

/**
 * Save draft code locally and remotely
 */
export async function saveDraftCode(contestId, problemId, code, language, userId) {
  if (!contestId || !problemId || !userId) return;
  const localKey = `seed_contest_draft_${contestId}_${problemId}_${userId}`;
  try {
    localStorage.setItem(localKey, JSON.stringify({ code, language, savedAt: Date.now() }));
  } catch (_) {}

  try {
    const draftRef = doc(db, CONTESTS, contestId, 'drafts', userId);
    await setDoc(draftRef, {
      [problemId]: { code, language, updatedAt: serverTimestamp() },
    }, { merge: true });
  } catch (_) {}
}

/**
 * Retrieve saved draft code
 */
export async function getDraftCode(contestId, problemId, userId) {
  if (!contestId || !problemId || !userId) return null;
  const localKey = `seed_contest_draft_${contestId}_${problemId}_${userId}`;
  try {
    const local = localStorage.getItem(localKey);
    if (local) return JSON.parse(local);
  } catch (_) {}

  try {
    const draftRef = doc(db, CONTESTS, contestId, 'drafts', userId);
    const snap = await getDoc(draftRef);
    if (snap.exists()) {
      return snap.data()?.[problemId] || null;
    }
  } catch (_) {}
  return null;
}
