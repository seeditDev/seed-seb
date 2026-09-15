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

const LOCAL_BASE = '/seed-contents';

/**
 * Fetch a JSON file strictly from the local public directory.
 * @param {string} path - Relative path (e.g. 'coding/questions/Q1001.json')
 */
const fetchJson = async (path) => {
  const cleanPath = path.startsWith('/') ? path.substring(1) : path;
  const localUrl = `${LOCAL_BASE}/${cleanPath}`;
  try {
    const response = await fetch(localUrl);
    if (response.ok) {
      return await response.json();
    }
  } catch (_) {}

  throw new Error(`Failed to load ${cleanPath} from local storage (${localUrl})`);
};

export const isCompleteQuestion = (q) => {
  if (!q || typeof q !== 'object') return false;
  const hasStatement = Boolean(
    (typeof q.content?.problemStatement === 'string' && q.content.problemStatement.trim().length > 0) ||
    (typeof q.problemStatement === 'string' && q.problemStatement.trim().length > 0) ||
    (typeof q.description === 'string' && q.description.trim().length > 0) ||
    (typeof q.statement === 'string' && q.statement.trim().length > 0)
  );
  const hasSampleTestCases = Boolean(
    (Array.isArray(q.content?.sampleTestCases) && q.content.sampleTestCases.length > 0) ||
    (Array.isArray(q.sampleTestCases) && q.sampleTestCases.length > 0) ||
    (Array.isArray(q.sampleTests) && q.sampleTests.length > 0) ||
    (Array.isArray(q.testCases?.sample) && q.testCases.sample.length > 0) ||
    (Array.isArray(q.testCases) && q.testCases.some(tc => !tc.hidden && !tc.isHidden))
  );
  const hasHiddenTestCases = Boolean(
    (Array.isArray(q.testCases?.hidden) && q.testCases.hidden.length > 0) ||
    (Array.isArray(q.hiddenTestCases) && q.hiddenTestCases.length > 0) ||
    (Array.isArray(q.hiddenTests) && q.hiddenTests.length > 0) ||
    (Array.isArray(q.content?.testCases) && q.content.testCases.length > 0) ||
    (Array.isArray(q.testCases) && q.testCases.some(tc => tc.hidden || tc.isHidden)) ||
    (Array.isArray(q.hidden_test_cases) && q.hidden_test_cases.length > 0)
  );
  return hasStatement && hasSampleTestCases && hasHiddenTestCases;
};

export const mergeQuestionObjects = (fullQ, stub) => {
  if (!fullQ) return stub || null;
  if (!stub || typeof stub !== 'object') return fullQ;

  // Resolve sample test cases from fullQ or stub
  const sampleTestCases = (Array.isArray(fullQ.sampleTestCases) && fullQ.sampleTestCases.length > 0)
    ? fullQ.sampleTestCases
    : (Array.isArray(fullQ.content?.sampleTestCases) && fullQ.content.sampleTestCases.length > 0
      ? fullQ.content.sampleTestCases
      : (Array.isArray(fullQ.testCases?.sample) && fullQ.testCases.sample.length > 0
        ? fullQ.testCases.sample
        : (Array.isArray(fullQ.testCases) && fullQ.testCases.some(tc => !tc.hidden && !tc.isHidden))
          ? fullQ.testCases.filter(tc => !tc.hidden && !tc.isHidden)
          : (Array.isArray(stub.sampleTestCases) && stub.sampleTestCases.length > 0
            ? stub.sampleTestCases
            : (Array.isArray(stub.content?.sampleTestCases) && stub.content.sampleTestCases.length > 0
              ? stub.content.sampleTestCases
              : (Array.isArray(stub.testCases?.sample) && stub.testCases.sample.length > 0
                ? stub.testCases.sample
                : (Array.isArray(stub.testCases) && stub.testCases.some(tc => !tc.hidden && !tc.isHidden))
                  ? stub.testCases.filter(tc => !tc.hidden && !tc.isHidden)
                  : [])))));

  // Resolve hidden test cases from fullQ or stub
  const hiddenTestCases = (Array.isArray(fullQ.testCases?.hidden) && fullQ.testCases.hidden.length > 0)
    ? fullQ.testCases.hidden
    : (Array.isArray(fullQ.hiddenTestCases) && fullQ.hiddenTestCases.length > 0)
      ? fullQ.hiddenTestCases
      : (Array.isArray(fullQ.hiddenTests) && fullQ.hiddenTests.length > 0)
        ? fullQ.hiddenTests
        : (Array.isArray(fullQ.content?.testCases) && fullQ.content.testCases.length > 0)
          ? fullQ.content.testCases
          : (Array.isArray(fullQ.testCases) && fullQ.testCases.some(tc => tc.hidden || tc.isHidden))
            ? fullQ.testCases.filter(tc => tc.hidden || tc.isHidden)
            : (Array.isArray(stub.testCases?.hidden) && stub.testCases.hidden.length > 0
              ? stub.testCases.hidden
              : (Array.isArray(stub.hiddenTestCases) && stub.hiddenTestCases.length > 0
                ? stub.hiddenTestCases
                : (Array.isArray(stub.hiddenTests) && stub.hiddenTests.length > 0
                  ? stub.hiddenTests
                  : (Array.isArray(stub.testCases) && stub.testCases.some(tc => tc.hidden || tc.isHidden))
                    ? stub.testCases.filter(tc => tc.hidden || tc.isHidden)
                    : [])));

  const resolvedTestCases = {
    ...(typeof fullQ.testCases === 'object' && !Array.isArray(fullQ.testCases) ? fullQ.testCases : {}),
    sample: sampleTestCases,
    hidden: hiddenTestCases,
  };

  return {
    ...fullQ,
    ...stub,
    id: fullQ.id || fullQ.questionId || stub.id || stub.questionId || '',
    questionId: fullQ.questionId || fullQ.id || stub.questionId || stub.id || '',
    title: stub.title || fullQ.title || '',
    content: {
      ...(fullQ.content || {}),
      ...(stub.content || {}),
      problemStatement: fullQ.content?.problemStatement || fullQ.problemStatement || stub.content?.problemStatement || stub.description || stub.problemStatement || '',
      sampleTestCases,
      testCases: hiddenTestCases,
    },
    description: fullQ.description || fullQ.content?.problemStatement || fullQ.problemStatement || stub.description || stub.statement || '',
    problemStatement: fullQ.problemStatement || fullQ.content?.problemStatement || stub.problemStatement || stub.statement || '',
    statement: fullQ.statement || fullQ.problemStatement || fullQ.content?.problemStatement || stub.statement || '',
    sampleTestCases,
    sampleTests: sampleTestCases,
    hiddenTestCases,
    hiddenTests: hiddenTestCases,
    testCases: resolvedTestCases,
    boilerPlates: fullQ.boilerPlates || fullQ.content?.boilerPlates || stub.boilerPlates || {},
    boilerplates: fullQ.boilerplates || fullQ.content?.boilerplates || stub.boilerplates || {},
    marks: Number(stub.marks || fullQ.marks || 100),
  };
};

// ── Question Bank ─────────────────────────────────────────────────────────────

/**
 * Fetch a single coding question by ID.
 * @param {string|object} questionId - e.g. 'Q1001'
 * @returns {Promise<Object>} Canonical Coding Question
 */
let questionMapCache = null;

export const fetchQuestion = async (questionId) => {
  if (!questionId) return null;

  let originalObj = null;
  // If already a full question object passed in
  if (typeof questionId === 'object') {
    originalObj = questionId;
    if (isCompleteQuestion(questionId)) {
      return questionId;
    }
    // If cdnUrl is present directly on the object, try fetching it first
    if (originalObj.cdnUrl) {
      try {
        const cleanPath = String(originalObj.cdnUrl)
          .replace(/^https?:\/\/raw\.githubusercontent\.com\/seeditDev\/seed-contents\/main\//, '')
          .replace(/^\/seed-contents\//, '')
          .replace(/^seed-contents\//, '');
        const cdnRes = await fetchJson(cleanPath);
        if (cdnRes) {
          return mergeQuestionObjects(cdnRes, originalObj);
        }
      } catch (_) {}
    }
    questionId = originalObj.qid || originalObj.id || originalObj.questionId || originalObj.challengeId || originalObj._id || originalObj.slug || '';
  }

  const rawId = String(questionId).trim();
  if (!rawId) return originalObj ? originalObj : null;

  // Normalized ID forms
  let normId = rawId;
  if (/^\d+(\.\d+)?$/.test(rawId)) {
    normId = `Q${rawId}`;
  } else if (/^q\d+/i.test(rawId)) {
    normId = `Q${rawId.slice(1)}`;
  }

  let result = null;

  // 1. Aptitude questions
  if (normId.startsWith('Q_apt_')) {
    try {
      const res = await fetchArticleFile(`course/AptitudeCourses/${normId}.json`);
      if (res.ok) result = await res.json();
    } catch (_) {}
  }

  // 2. Direct coding/questions/ path
  if (!result) {
    try {
      result = await fetchJson(`coding/questions/${normId}.json`);
    } catch (_) {}
  }

  // Try rawId if different from normId
  if (!result && rawId !== normId) {
    try {
      result = await fetchJson(`coding/questions/${rawId}.json`);
    } catch (_) {}
  }

  // 3. Technical courses mapped lookup
  if (!result) {
    if (!questionMapCache) {
      try {
        const mapRes = await fetchArticleFile('course/TechnicalCourses/question_map.json');
        if (mapRes.ok) {
          questionMapCache = await mapRes.json();
        }
      } catch (_) {}
    }

    const mappedFolder = questionMapCache?.[normId] || questionMapCache?.[rawId];
    if (mappedFolder) {
      try {
        const res = await fetchArticleFile(`course/TechnicalCourses/${mappedFolder}/Questionbank/${normId}.json`);
        if (res.ok) result = await res.json();
      } catch (_) {}
    }
  }

  // 4. Search technical courses folders
  if (!result) {
    const folders = ['c', 'java', 'cpp', 'dsa'];
    for (const f of folders) {
      try {
        const res = await fetchArticleFile(`course/TechnicalCourses/${f}/Questionbank/${normId}.json`);
        if (res.ok) {
          result = await res.json();
          break;
        }
      } catch (_) {}
    }
  }

  // 5. Lookup in questions_index.json by slug or title if normId didn't yield a direct file
  if (!result && (originalObj?.title || originalObj?.slug || rawId)) {
    try {
      const index = await fetchQuestionsIndex();
      if (Array.isArray(index)) {
        const match = index.find(item => 
          (item.questionId && (item.questionId === normId || item.questionId === rawId)) ||
          (originalObj?.slug && item.slug && item.slug.toLowerCase() === String(originalObj.slug).toLowerCase()) ||
          (originalObj?.title && item.title && item.title.trim().toLowerCase() === String(originalObj.title).trim().toLowerCase()) ||
          (item.slug && item.slug.toLowerCase() === rawId.toLowerCase())
        );
        if (match?.questionId && match.questionId !== normId) {
          try {
            result = await fetchJson(`coding/questions/${match.questionId}.json`);
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  // 6. Last resort fetch
  if (!result) {
    try {
      result = await fetchJson(`coding/questions/${normId}.json`);
    } catch (_) {}
  }

  if (result && originalObj) {
    return mergeQuestionObjects(result, originalObj);
  }

  return result ? result : (originalObj || null);
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
 * Accepts either plain string IDs, {id, cdnUrl} objects, or full question objects.
 * Failed fetches return null (graceful degradation).
 * @param {string[]|object[]} questionIds
 * @returns {Promise<Object[]>} Array of question data (nulls filtered out)
 */
export const fetchQuestionsForContest = async (questionIds = []) => {
  const results = await Promise.allSettled(questionIds.map(item => {
    if (item && typeof item === 'object') {
      // If already a complete question object, return immediately
      if (isCompleteQuestion(item)) {
        return Promise.resolve(item);
      }
      // New slim slug format: { id, cdnUrl, title, difficulty, category }
      const qId = item.qid || item.id || item.questionId || item.challengeId || item._id || (typeof item.slug === 'string' ? item.slug : '');
      const { cdnUrl } = item;
      if (cdnUrl) {
        const cleanPath = String(cdnUrl)
          .replace(/^https?:\/\/raw\.githubusercontent\.com\/seeditDev\/seed-contents\/main\//, '')
          .replace(/^\/seed-contents\//, '')
          .replace(/^seed-contents\//, '');
        return fetchJson(cleanPath)
          .then(res => mergeQuestionObjects(res, item))
          .catch(() => fetchQuestion(qId || item));
      }
      return fetchQuestion(qId || item);
    }
    return fetchQuestion(item); // plain string or number ID
  }));

  return results
    .map((r, i) => {
      const originalItem = questionIds[i];
      if (r.status === 'fulfilled' && r.value) {
        return mergeQuestionObjects(r.value, originalItem);
      }
      if (originalItem && typeof originalItem === 'object' && (originalItem.title || originalItem.id)) {
        return originalItem; // preserve inline object if fetch failed
      }
      const id = typeof originalItem === 'object' ? (originalItem?.id ?? originalItem?.questionId) : originalItem;
      console.warn(`[QuestionBankService] Failed to fetch question ${id}:`, r.reason?.message);
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
