/**
 * codingQuestionBankService.js
 *
 * Client-side service for fetching coding content from local public folder.
 * All data is stored as static JSON in the frontend/public/seed-contents directory.
 *
 * Data flow:
 *   Local public path → fetch → JSON parse → return data
 */
import { fetchArticleFile } from '../utils/articleFetcher';

const LOCAL_BASE = '/seed-contents'; // Served from React public folder

/**
 * Fetch a JSON file from the local public seed-contents directory.
 * @param {string} path - Relative path (e.g. 'coding/questions/Q1001.json')
 */
const fetchJson = async (path) => {
  const cleanPath = path.startsWith('/') ? path.substring(1) : path;
  const localUrl = `${LOCAL_BASE}/${cleanPath}`;
  const response = await fetch(localUrl);
  if (!response.ok) throw new Error(`Failed to load ${localUrl}: HTTP ${response.status}`);
  return await response.json();
};

// ── Question Bank ─────────────────────────────────────────────────────────────

/**
 * Fetch a single coding question by ID.
 * @param {string} questionId - e.g. 'Q1001'
 * @returns {Promise<Object>} Question data object
 */
let questionMapCache = null;

export const fetchQuestion = async (questionId) => {
  if (questionId.startsWith('Q_apt_')) {
    try {
      const res = await fetchArticleFile(`course/AptitudeCourses/${questionId}.json`);
      if (res.ok) {
        return await res.json();
      }
    } catch (_) {}
  }

  if (questionId.startsWith('Q0.') || /^[Q]\d+$/.test(questionId)) {
    try {
      return await fetchJson(`coding/questions/${questionId}.json`);
    } catch (_) {}
  }

  if (!questionMapCache) {
    try {
      const mapRes = await fetchArticleFile('course/TechnicalCourses/question_map.json');
      if (mapRes.ok) {
        questionMapCache = await mapRes.json();
      }
    } catch (_) {}
  }

  const mappedFolder = questionMapCache?.[questionId];
  if (mappedFolder) {
    try {
      const res = await fetchArticleFile(`course/TechnicalCourses/${mappedFolder}/Questionbank/${questionId}.json`);
      if (res.ok) {
        return await res.json();
      }
    } catch (_) {}
  }

  const folders = ['c', 'java', 'cpp', 'dsa'];
  for (const f of folders) {
    try {
      const res = await fetchArticleFile(`course/TechnicalCourses/${f}/Questionbank/${questionId}.json`);
      if (res.ok) {
        return await res.json();
      }
    } catch (_) {}
  }
  return fetchJson(`coding/questions/${questionId}.json`);
};

/**
 * Fetch the central coding questions index manifest.
 */
export const fetchQuestionsIndex = async () => {
  try {
    return await fetchJson('coding/questions_index.json');
  } catch (_) {
    return [];
  }
};

/**
 * Fetch multiple questions by ID in parallel.
 * Failed fetches return null (graceful degradation).
 * @param {string[]} questionIds - Array of question IDs
 * @returns {Promise<Object[]>} Array of question data (nulls filtered out)
 */
export const fetchQuestionsForContest = async (questionIds = []) => {
  const results = await Promise.allSettled(questionIds.map(qid => fetchQuestion(qid)));
  return results
    .map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      console.warn(`[QuestionBankService] Failed to fetch ${questionIds[i]}:`, r.reason?.message);
      return null;
    })
    .filter(Boolean);
};

/**
 * Fetch a category collection (list of question IDs for a category).
 * @param {string} category - e.g. 'Arrays'
 */
export const fetchCategoryCollection = async (category) => {
  return fetchJson(`coding/categories/${category}.json`);
};

// ── Practice Courses ──────────────────────────────────────────────────────────

/**
 * Fetch the practice courses index.
 * @returns {Promise<Object>} { courses: [{courseId, title, order, isPremium}] }
 */
export const fetchCoursesIndex = async () => {
  try {
    return await fetchJson('coding/courses/index.json');
  } catch (_) {
    return { courses: [] };
  }
};

/**
 * Fetch a specific course's metadata.
 * @param {string} courseId
 */
export const fetchCourse = async (courseId) => {
  return fetchJson(`coding/courses/${courseId}/course.json`);
};

/**
 * Fetch all courses (index + full data).
 */
export const fetchAllCourses = async () => {
  const { courses } = await fetchCoursesIndex();
  const results = await Promise.allSettled(courses.map(c => fetchCourse(c.courseId)));
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);
};

/**
 * Fetch a module's metadata.
 * @param {string} courseId
 * @param {string} moduleId
 */
export const fetchModule = async (courseId, moduleId) => {
  return fetchJson(`coding/courses/${courseId}/modules/${moduleId}/module.json`);
};

/**
 * Fetch all modules for a course.
 * @param {Object} course - Course object with moduleIds array
 */
export const fetchModulesForCourse = async (course) => {
  const results = await Promise.allSettled(
    (course.moduleIds || []).map(mid => fetchModule(course.courseId, mid))
  );
  return results.filter(r => r.status === 'fulfilled').map(r => r.value);
};

/**
 * Fetch a practice contest.
 * @param {string} courseId
 * @param {string} moduleId
 * @param {string} contestId
 */
export const fetchPracticeContest = async (courseId, moduleId, contestId) => {
  return fetchJson(`coding/courses/${courseId}/modules/${moduleId}/contests/${contestId}.json`);
};

/**
 * Fetch all contests for a module.
 */
export const fetchContestsForModule = async (courseId, module) => {
  const results = await Promise.allSettled(
    (module.contestIds || []).map(cid => fetchPracticeContest(courseId, module.moduleId, cid))
  );
  return results.filter(r => r.status === 'fulfilled').map(r => r.value);
};

// ── Assessment Portal ──────────────────────────────────────────────────────────

/**
 * Fetch an assessment test JSON.
 * @param {string} seriesId
 * @param {string} testId
 */
export const fetchAssessmentTest = async (seriesId, testId) => {
  return fetchJson(`coding/assessments/series/${seriesId}/tests/${testId}.json`);
};

/**
 * Fetch an assessment assignment JSON.
 * @param {string} assignmentId
 */
export const fetchAssessmentAssignment = async (assignmentId) => {
  return fetchJson(`coding/assessments/assignments/${assignmentId}.json`);
};

/**
 * Fetch the assessment series index.
 */
export const fetchAssessmentSeriesIndex = async () => {
  try {
    return await fetchJson('coding/assessments/series/index.json');
  } catch (_) {
    return { series: [] };
  }
};

// ── Utility ────────────────────────────────────────────────────────────────────

/**
 * Given an assessment object with questionIds[], fetch and return all question data.
 * Applies premiumOverride: if true, skips the isPremium check.
 * @param {Object} assessment - Assessment test object
 * @param {boolean} premiumOverride - If true, premium questions are accessible
 * @param {boolean} userIsPremium - Whether the user has premium access
 * @returns {Promise<Object[]>} Array of question objects
 */
export const fetchQuestionsForAssessment = async (assessment, premiumOverride = false, userIsPremium = false) => {
  const questionIds = assessment.questionIds || [];
  const questions = await fetchQuestionsForContest(questionIds);

  // Filter based on premium access
  return questions.filter(q => {
    if (!q.metadata?.isPremium) return true;     // Free question — always accessible
    if (premiumOverride) return true;             // Assessment-level override
    if (userIsPremium) return true;               // User has premium subscription
    return false;                                 // Lock premium question for free user in practice
  });
};

export default {
  fetchQuestion,
  fetchQuestionsIndex,
  fetchQuestionsForContest,
  fetchQuestionsForAssessment,
  fetchCategoryCollection,
  fetchCoursesIndex,
  fetchCourse,
  fetchAllCourses,
  fetchModule,
  fetchModulesForCourse,
  fetchPracticeContest,
  fetchContestsForModule,
  fetchAssessmentTest,
  fetchAssessmentAssignment,
  fetchAssessmentSeriesIndex,
};
