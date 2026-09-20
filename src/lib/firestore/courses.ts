/**
 * courses.ts — SEB Firestore course/series/test reader
 *
 * Mirrors the schema written by SEED Admin Portal:
 *   courses/{courseId}/series/{seriesId}/tests/{testId}
 *
 * Module key format (stored in cohort.allowedModules):
 *   "courseId::seriesId::testId"
 */

import { getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  collection,
  collectionGroup,
  query,
  where,
  Timestamp,
} from "firebase/firestore";

function getDb() {
  const apps = getApps();
  if (!apps.length) throw new Error("[courses.ts] Firebase not initialised");
  return getFirestore(apps[0]!);
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ScheduleConfig {
  start: string | null;
  end: string | null;
  autoClose: boolean;
}

export interface TestSettings {
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  allowLanguageSwitch: boolean;
  showResultAfterSubmit: boolean;
  allowedLanguages: string[];
  forwardOnly: boolean;
  autoSubmit: boolean;
  questionTimer: number;
  questionTimerList: string;
  timerRestrictedSubmit: boolean;
}

export interface MSASection {
  id: string;
  name: string;
  type: "mcq" | "coding" | "sea";
  cdnUrl: string;
  assessmentId: string;
  duration_minutes: number;
  totalMarks: number;
  questionTimer: number;
  allowLanguageSwitch: boolean;
  questionTimerList: string;
  timerRestrictedSubmit: boolean;
  forwardOnly: boolean;
}

export interface AssessmentTargeting {
  tenantIds?: string[];
  years?: string[];
  departments?: string[];
  targetType?: "all_in_cohort" | "specific_students";
  allowedEmails?: string[];
  allowedRollNumbers?: string[];
  allowedUserIds?: string[];
}

export interface TestDoc {
  id: string;
  courseId: string;
  seriesId: string;
  name: string;
  description: string;
  type: "mcq" | "coding" | "sea" | "spoken-english" | "msa";
  cdnUrl: string;
  assessmentId: string;
  sections: MSASection[];
  duration_minutes: number;
  totalMarks: number;
  difficulty: "Easy" | "Medium" | "Hard";
  proctored: boolean;
  audioProctored: boolean;
  maxViolations: number;
  maxAudioViolations: number;
  maxAttempts: number;
  passkey: string;
  isPremium: boolean;
  isGlobal?: boolean;
  accessTier?: "free" | "premium" | "paid_entry";
  entryFeeINR?: number;
  display_order: number;
  schedule: ScheduleConfig;
  settings: TestSettings;
  targeting?: AssessmentTargeting | null;
  /** Populated at runtime with course/series metadata for UI display */
  courseTitle?: string;
  seriesTitle?: string;
}

export interface CourseDoc {
  id: string;
  title: string;
  description: string;
  display_order: number;
  active: boolean;
}

export interface SeriesDoc {
  id: string;
  courseId: string;
  title: string;
  description: string;
  type: string;
  display_order: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module key parsing
// ─────────────────────────────────────────────────────────────────────────────

export interface NewModuleKey {
  isNew: true;
  courseId: string;
  seriesId: string;
  testId: string;
}

export function parseModuleKey(key: string): NewModuleKey | null {
  const parts = key.split("::");
  if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    return { isNew: true, courseId: parts[0], seriesId: parts[1], testId: parts[2] };
  }
  return null; // Unrecognised key format — skip
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapping helper
// ─────────────────────────────────────────────────────────────────────────────

function mapTest(
  id: string,
  courseId: string,
  seriesId: string,
  d: Record<string, unknown>,
): TestDoc {
  const s = (d["settings"] ?? {}) as Record<string, unknown>;
  return {
    id,
    courseId,
    seriesId,
    name: String(d["name"] ?? id),
    description: String(d["description"] ?? ""),
    type: (d["type"] as TestDoc["type"]) ?? "mcq",
    cdnUrl: String(d["cdnUrl"] ?? ""),
    assessmentId: String(d["assessmentId"] ?? ""),
    sections: Array.isArray(d["sections"]) ? (d["sections"] as MSASection[]) : [],
    duration_minutes: Number(d["duration_minutes"] ?? 60),
    totalMarks: Number(d["totalMarks"] ?? 100),
    difficulty: (d["difficulty"] as TestDoc["difficulty"]) ?? "Medium",
    proctored: Boolean(d["proctored"]),
    audioProctored: Boolean(d["audioProctored"]),
    maxViolations: Number(d["maxViolations"] ?? 200),
    maxAudioViolations: Number(d["maxAudioViolations"] ?? 200),
    maxAttempts: Number(d["maxAttempts"] ?? 1),
    passkey: String(d["passkey"] ?? ""),
    isPremium: Boolean(d["isPremium"] || d["accessTier"] === "premium"),
    isGlobal: Boolean(d["isGlobal"]),
    accessTier: (d["accessTier"] as TestDoc["accessTier"]) ?? (d["isPremium"] ? "premium" : "free"),
    entryFeeINR: d["entryFeeINR"] != null ? Number(d["entryFeeINR"]) : 0,
    display_order: Number(d["display_order"] ?? 999),
    schedule: (d["schedule"] as ScheduleConfig) ?? { start: null, end: null, autoClose: false },
    targeting: (d["targeting"] as AssessmentTargeting) || null,
    settings: {
      shuffleQuestions: Boolean(s["shuffleQuestions"]),
      shuffleOptions: Boolean(s["shuffleOptions"]),
      allowLanguageSwitch: s["allowLanguageSwitch"] !== false,
      showResultAfterSubmit: s["showResultAfterSubmit"] !== false,
      allowedLanguages: Array.isArray(s["allowedLanguages"])
        ? (s["allowedLanguages"] as string[])
        : ["C", "C++", "Java", "Python3"],
      forwardOnly: Boolean(s["forwardOnly"]),
      autoSubmit: Boolean(s["autoSubmit"]),
      questionTimer: Number(s["questionTimer"] ?? 0),
      questionTimerList: String(s["questionTimerList"] ?? ""),
      timerRestrictedSubmit: Boolean(s["timerRestrictedSubmit"]),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch a single test from courses/{courseId}/series/{seriesId}/tests/{testId}. */
export async function getTest(
  courseId: string,
  seriesId: string,
  testId: string,
): Promise<TestDoc | null> {
  try {
    const snap = await getDoc(
      doc(getDb(), "courses", courseId, "series", seriesId, "tests", testId),
    );
    if (!snap.exists()) return null;
    return mapTest(snap.id, courseId, seriesId, snap.data() as Record<string, unknown>);
  } catch (err) {
    console.error("[courses.ts] getTest error:", err);
    return null;
  }
}

/** Fetch all tests in a series ordered by display_order. */
export async function getSeriesTests(courseId: string, seriesId: string): Promise<TestDoc[]> {
  try {
    const snap = await getDocs(
      collection(getDb(), "courses", courseId, "series", seriesId, "tests"),
    );
    return snap.docs
      .map((d) => mapTest(d.id, courseId, seriesId, d.data() as Record<string, unknown>))
      .sort((a, b) => a.display_order - b.display_order);
  } catch (err) {
    console.error("[courses.ts] getSeriesTests error:", err);
    return [];
  }
}

// In-memory memoization caches for course and series titles
const courseTitleCache = new Map<string, string>();
const seriesTitleCache = new Map<string, string>();

/**
 * Given allowedModules from a cohort, fetch all TestDocs.
 * Also fetches course + series titles for UI display.
 * Keys must be in "courseId::seriesId::testId" format. Unrecognised keys are skipped.
 */
export async function getAllowedTests(allowedModules: string[]): Promise<TestDoc[]> {
  const db = getDb();
  const parsed = allowedModules.map(parseModuleKey).filter(Boolean) as NewModuleKey[];
  if (!parsed.length) return [];

  // Collect unique courseId+seriesId pairs for title enrichment
  const seriesSet = new Map<string, { courseId: string; seriesId: string }>();
  const courseSet = new Set<string>();
  for (const k of parsed) {
    if (!seriesTitleCache.has(`${k.courseId}::${k.seriesId}`)) {
      seriesSet.set(`${k.courseId}::${k.seriesId}`, { courseId: k.courseId, seriesId: k.seriesId });
    }
    if (!courseTitleCache.has(k.courseId)) {
      courseSet.add(k.courseId);
    }
  }

  // Fetch missing course titles
  await Promise.all(
    Array.from(courseSet).map(async (cId) => {
      try {
        const snap = await getDoc(doc(db, "courses", cId));
        if (snap.exists()) courseTitleCache.set(cId, String(snap.data()["title"] ?? cId));
      } catch {
        /* skip */
      }
    }),
  );

  // Fetch missing series titles
  await Promise.all(
    Array.from(seriesSet.values()).map(async ({ courseId, seriesId }) => {
      const pairKey = `${courseId}::${seriesId}`;
      try {
        const snap = await getDoc(doc(db, "courses", courseId, "series", seriesId));
        if (snap.exists())
          seriesTitleCache.set(pairKey, String(snap.data()["title"] ?? seriesId));
      } catch {
        /* skip */
      }
    }),
  );

  // Fetch each test
  const results: TestDoc[] = [];
  await Promise.all(
    parsed.map(async ({ courseId, seriesId, testId }) => {
      const t = await getTest(courseId, seriesId, testId);
      if (t) {
        t.courseTitle = courseTitleCache.get(courseId) ?? courseId;
        t.seriesTitle = seriesTitleCache.get(`${courseId}::${seriesId}`) ?? seriesId;
        results.push(t);
      }
    }),
  );

  return results.sort((a, b) => a.display_order - b.display_order);
}

/**
 * Fetch all active global contests (isGlobal == true) across all courses.
 * Available to every SEED-IT user (free or premium).
 */
export async function getGlobalTests(): Promise<TestDoc[]> {
  try {
    const db = getDb();
    const q = query(collectionGroup(db, "tests"), where("isGlobal", "==", true));
    const snap = await getDocs(q);
    if (snap.empty) return [];

    const results: TestDoc[] = [];
    const courseTitles = new Map<string, string>();
    const seriesTitles = new Map<string, string>();

    for (const d of snap.docs) {
      const pathParts = d.ref.path.split("/");
      // courses/{courseId}/series/{seriesId}/tests/{testId}
      const courseId = pathParts[1] || "";
      const seriesId = pathParts[3] || "";
      const test = mapTest(d.id, courseId, seriesId, d.data() as Record<string, unknown>);
      test.isGlobal = true;
      results.push(test);
    }

    // Enrich titles
    await Promise.all(
      results.map(async (t) => {
        try {
          if (t.courseId && !courseTitles.has(t.courseId)) {
            const cSnap = await getDoc(doc(db, "courses", t.courseId));
            if (cSnap.exists()) courseTitles.set(t.courseId, String(cSnap.data()["title"] ?? t.courseId));
          }
          if (t.courseId && t.seriesId && !seriesTitles.has(`${t.courseId}::${t.seriesId}`)) {
            const sSnap = await getDoc(doc(db, "courses", t.courseId, "series", t.seriesId));
            if (sSnap.exists()) seriesTitles.set(`${t.courseId}::${t.seriesId}`, String(sSnap.data()["title"] ?? t.seriesId));
          }
          t.courseTitle = courseTitles.get(t.courseId) ?? "Global Contests";
          t.seriesTitle = seriesTitles.get(`${t.courseId}::${t.seriesId}`) ?? "Open Challenges";
        } catch {
          t.courseTitle = "Global Contests";
          t.seriesTitle = "Open Challenges";
        }
      }),
    );

    return results.sort((a, b) => a.display_order - b.display_order);
  } catch (err) {
    console.warn("[courses.ts] getGlobalTests query fallback/error:", err);
    return [];
  }
}

/**
 * Fetch tests directly targeted to a specific candidate email
 * via targeting.allowedEmails array-contains query.
 */
export async function getCandidateDirectTests(email: string, rollNumber?: string): Promise<TestDoc[]> {
  try {
    const db = getDb();
    const cleanEmail = email ? String(email).trim().toLowerCase() : "";
    const cleanRoll = rollNumber ? String(rollNumber).trim().toUpperCase() : "";
    if (!cleanEmail && !cleanRoll) return [];

    const docSnaps = new Map<string, any>();

    if (cleanEmail) {
      try {
        const qEmail = query(
          collectionGroup(db, "tests"),
          where("targeting.allowedEmails", "array-contains", cleanEmail)
        );
        const snapEmail = await getDocs(qEmail);
        snapEmail.docs.forEach((d) => docSnaps.set(d.id, d));
      } catch (eErr) {
        console.warn("[courses.ts] getCandidateDirectTests email query error:", eErr);
      }
    }

    if (cleanRoll) {
      try {
        const qRoll = query(
          collectionGroup(db, "tests"),
          where("targeting.allowedRollNumbers", "array-contains", cleanRoll)
        );
        const snapRoll = await getDocs(qRoll);
        snapRoll.docs.forEach((d) => docSnaps.set(d.id, d));
      } catch (rErr) {
        console.warn("[courses.ts] getCandidateDirectTests roll query error:", rErr);
      }
    }

    if (docSnaps.size === 0) return [];

    const results: TestDoc[] = [];
    const courseTitles = new Map<string, string>();
    const seriesTitles = new Map<string, string>();

    for (const d of docSnaps.values()) {
      const pathParts = d.ref.path.split("/");
      const courseId = pathParts[1] || "";
      const seriesId = pathParts[3] || "";
      const test = mapTest(d.id, courseId, seriesId, d.data() as Record<string, unknown>);
      results.push(test);
    }

    await Promise.all(
      results.map(async (t) => {
        try {
          if (t.courseId && !courseTitles.has(t.courseId)) {
            const cSnap = await getDoc(doc(db, "courses", t.courseId));
            if (cSnap.exists()) courseTitles.set(t.courseId, String(cSnap.data()["title"] ?? t.courseId));
          }
          if (t.courseId && t.seriesId && !seriesTitles.has(`${t.courseId}::${t.seriesId}`)) {
            const sSnap = await getDoc(doc(db, "courses", t.courseId, "series", t.seriesId));
            if (sSnap.exists()) seriesTitles.set(`${t.courseId}::${t.seriesId}`, String(sSnap.data()["title"] ?? t.seriesId));
          }
          t.courseTitle = courseTitles.get(t.courseId) ?? "Assigned Course";
          t.seriesTitle = seriesTitles.get(`${t.courseId}::${t.seriesId}`) ?? "Special Allocation";
        } catch {
          t.courseTitle = "Assigned Course";
          t.seriesTitle = "Special Allocation";
        }
      })
    );

    return results.sort((a, b) => a.display_order - b.display_order);
  } catch (err) {
    console.warn("[courses.ts] getCandidateDirectTests query error:", err);
    return [];
  }
}

