/**
 * courseCatalogData.js
 * Canonical real courses loaded automatically from realCourses/*.json.
 * Dynamic eager loading via Vite import.meta.glob:
 * Whenever a new course JSON is added to ./realCourses, it appears in the catalog automatically!
 */

const courseModules = import.meta.glob('./realCourses/*.json', { eager: true });

// Alias mapping for legacy links or common variations
const SLUG_ALIASES = {
  'cpp-programming-mastery': 'cpp',
  'c-programming-mastery': 'c',
  'java-programming-mastery': 'java',
  'operating-systems-mastery': 'operating-system',
  'operating-systems-course': 'operating-system',
  'aptitude-reasoning-mastery': 'aptitude-and-reasoning',
  'aptitude_reasoning_course': 'aptitude-and-reasoning',
  'dsa-mastery': 'dsa',
  'dsa-mastery-course': 'dsa',
  'react-frontend-architecture': 'react-js',
  'python-mastery': 'python-beginner-v2-p1',
  'python-mastery-course': 'python-beginner-v2-p1',
  'sql-database-mastery': 'sql-intermediate',
  'sql-database-systems-course': 'sql-intermediate',
  'web-dev-fullstack-course': 'web-dev-js',
  'system-design-mastery-course': 'operating-system'
};

// Priority slugs to pin flagship courses to the top
const FLAGSHIP_PRIORITY = [
  'cpp',
  'dsa',
  'java',
  'c',
  'operating-system',
  'python-beginner-v2-p1',
  'react-js',
  'nodejs',
  'springboot',
  'sql-intermediate',
  'git-github',
  'machine-learning',
  'deep-learning-ai',
  'aptitude-and-reasoning',
  'html',
  'css',
  'javascript',
  'advanced-javascript',
  'django',
  'flask',
  'c-sharp',
  'kotlin',
  'rust',
  'go',
  'php',
  'r'
];

export const COURSE_CATALOG = Object.entries(courseModules)
  .map(([filepath, mod]) => {
    const course = mod.default || mod;
    if (!course) return null;
    const fileName = filepath.split('/').pop().replace(/\.json$/, '');
    const courseId = course.courseId || course.id || course.slug || fileName;
    const slug = course.slug || courseId;
    return {
      ...course,
      courseId,
      id: courseId,
      slug,
      sourceFileName: fileName
    };
  })
  .filter(Boolean)
  .sort((a, b) => {
    const aPri = FLAGSHIP_PRIORITY.indexOf(a.slug);
    const bPri = FLAGSHIP_PRIORITY.indexOf(b.slug);
    if (aPri !== -1 && bPri !== -1) return aPri - bPri;
    if (aPri !== -1) return -1;
    if (bPri !== -1) return 1;
    return (b.reviewsCount || 0) - (a.reviewsCount || 0);
  });

export const getCourseById = (courseIdOrSlug) => {
  if (!COURSE_CATALOG || COURSE_CATALOG.length === 0) return null;
  if (!courseIdOrSlug) return COURSE_CATALOG[0] || null;

  let query = String(courseIdOrSlug).toLowerCase().replace(/_/g, '-');
  if (SLUG_ALIASES[query]) {
    query = SLUG_ALIASES[query];
  }

  return COURSE_CATALOG.find(c =>
    (c.courseId && c.courseId.toLowerCase() === query) ||
    (c.slug && c.slug.toLowerCase() === query) ||
    (c.courseId && c.courseId.toLowerCase() === courseIdOrSlug.toLowerCase()) ||
    (c.slug && c.slug.toLowerCase() === courseIdOrSlug.toLowerCase()) ||
    (c.id && c.id.toLowerCase() === query)
  ) || COURSE_CATALOG[0] || null;
};

export default {
  COURSE_CATALOG,
  getCourseById
};

