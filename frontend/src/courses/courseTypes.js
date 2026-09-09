/**
 * courseTypes.js
 * Canonical definitions for the SEED Learning Experience Model:
 * Course → Teaching (AI Class) → Interaction (Quick Check) → Practice → Verification → Assessment → Mastery → Unlock
 */

export const ACTIVITY_TYPES = {
  AI_CLASS: 'AI_CLASS',
  AI_INTERACTION: 'AI_INTERACTION',
  NOTES: 'NOTES',
  EXAMPLE: 'EXAMPLE',
  CODE_DEMO: 'CODE_DEMO',
  PRACTICE_CODE: 'PRACTICE_CODE',
  PRACTICE_MCQ: 'PRACTICE_MCQ',
  PRACTICE_APTITUDE: 'PRACTICE_APTITUDE',
  MINI_ASSESSMENT: 'MINI_ASSESSMENT',
  RESOURCE: 'RESOURCE'
};

export const EVALUATION_MODES = {
  EXACT: 'EXACT',
  MULTIPLE_CHOICE: 'MULTIPLE_CHOICE',
  NUMERIC: 'NUMERIC',
  KEYWORD: 'KEYWORD',
  CODE: 'CODE',
  AI_SEMANTIC: 'AI_SEMANTIC',
  HYBRID: 'HYBRID'
};

export const PROGRESS_STATUS = {
  LOCKED: 'LOCKED',
  AVAILABLE: 'AVAILABLE',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED'
};

export const COURSE_CATEGORIES = [
  'All',
  'Data Structures & Algorithms',
  'Programming Languages',
  'Core CS Subjects',
  'Web Development',
  'Aptitude & Reasoning'
];

export const COURSE_LEVELS = [
  'All',
  'Beginner',
  'Intermediate',
  'Advanced'
];
