/**
 * articleToCourseAdapter.js
 * Transforms existing course mapping files, articles, and syllabi
 * into the modern Topic & Universal Activity Model.
 */

import { fetchArticleFile } from '../../utils/articleFetcher';

/**
 * Adapt an existing syllabus JSON (e.g. learn-c-syllabus.json) into the canonical Course object.
 */
export const adaptSyllabusToCourse = (syllabus, courseMeta = {}) => {
  if (!syllabus || !Array.isArray(syllabus.modules)) return null;

  const slug = syllabus.slug || courseMeta.slug || 'custom-course';
  const courseId = `COURSE_${slug.toUpperCase().replace(/-/g, '_')}`;

  const adaptedModules = syllabus.modules.map((mod, mIdx) => {
    const moduleId = `MOD_${slug.toUpperCase()}_${String(mIdx + 1).padStart(2, '0')}`;

    const adaptedTopics = (mod.submodules || []).map((sub, sIdx) => {
      const topicId = `TOP_${slug.toUpperCase()}_${sub.id || `${mIdx + 1}_${sIdx + 1}`}`;

      // Extract coding questions vs concepts
      const problems = sub.problems || [];
      const codingProblems = problems.filter(p => p.contentType !== 'mcq');
      const mcqProblems = problems.filter(p => p.contentType === 'mcq');
      const primaryProblem = codingProblems[0] || problems[0];

      // Build activities list
      const activities = [
        {
          activityId: `ACT_${topicId}_CLASS`,
          type: 'AI_CLASS',
          title: `Mastering ${sub.name}`,
          duration: '08:25',
          script: {
            segments: [
              {
                id: 'SEG_1',
                text: `Welcome! Today we are exploring ${sub.name}. Understanding this concept is essential for writing efficient, structured programs.`,
                type: 'teaching'
              },
              {
                id: 'SEG_2',
                text: `Let's break down the underlying logic. Consider how data is stored and operated upon step-by-step.`,
                type: 'explanation'
              },
              {
                id: 'SEG_3',
                text: `Before we proceed to coding, let's do a quick checkpoint to test your understanding!`,
                type: 'checkpoint'
              }
            ]
          },
          quickCheck: {
            question: `In ${sub.name}, what is the fundamental principle behind indexing or state evaluation?`,
            expectedAnswer: 'zero-based indexing',
            acceptedAnswers: ['0-indexed', 'zero based', 'zero', '0', 'continuous memory'],
            onCorrect: {
              message: 'Spot on! You have nailed the core concept.'
            }
          }
        },
        {
          activityId: `ACT_${topicId}_NOTES`,
          type: 'NOTES',
          title: `${sub.name} Study Notes & Summary`,
          content: `### ${sub.name}\n\nKey principles for this lesson:\n- **Definition**: Core programming concept ensuring optimal operations.\n- **Complexity**: Aim for constant $O(1)$ lookup or linear $O(N)$ traversal.\n- **Best Practice**: Always check boundaries and initialize variables cleanly.`
        }
      ];

      // Attach Practice Code activity if coding problem exists
      if (primaryProblem) {
        activities.push({
          activityId: `ACT_${topicId}_PRACTICE`,
          type: 'PRACTICE_CODE',
          title: primaryProblem.name || sub.name,
          questionId: primaryProblem.id,
          difficulty: primaryProblem.difficulty || 'Easy'
        });
      }

      // Attach Resources
      activities.push({
        activityId: `ACT_${topicId}_RESOURCES`,
        type: 'RESOURCE',
        title: `${sub.name} Cheat Sheet & Reference`,
        links: [
          { title: `${sub.name} Documentation`, url: '#' },
          { title: 'Standard Syntax Cheat Sheet (PDF)', url: '#' }
        ]
      });

      return {
        topicId,
        moduleId,
        order: sIdx + 1,
        title: sub.name,
        slug: sub.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description: `Learn the fundamentals and practical implementations of ${sub.name}.`,
        estimatedMinutes: 20,
        activities
      };
    });

    return {
      moduleId,
      courseId,
      order: mIdx + 1,
      title: mod.name,
      description: mod.description || `Master the concepts in ${mod.name}.`,
      topics: adaptedTopics,
      miniAssessment: {
        assessmentId: `ASSESS_${moduleId}`,
        title: `${mod.name} Mini Assessment`,
        questionCount: 5,
        durationMinutes: 10,
        passingPercentage: 70,
        questions: [
          {
            id: 'q1',
            text: `What is the primary advantage of mastering ${mod.name}?`,
            options: ['Faster execution', 'Clean memory management', 'Better algorithmic scaling', 'All of the above'],
            correctIndex: 3
          },
          {
            id: 'q2',
            text: 'What is the default index of the first item in contiguous sequences?',
            options: ['0', '1', '-1', 'Undefined'],
            correctIndex: 0
          },
          {
            id: 'q3',
            text: 'Which time complexity represents direct constant time access?',
            options: ['O(1)', 'O(N)', 'O(log N)', 'O(N^2)'],
            correctIndex: 0
          },
          {
            id: 'q4',
            text: 'What happens if you read outside allocated sequence boundaries?',
            options: ['Automatic resize', 'Segmentation fault or undefined behavior', 'Returns 0 silently', 'Throws syntax error'],
            correctIndex: 1
          },
          {
            id: 'q5',
            text: 'Which practice is recommended when iterating through data structures?',
            options: ['Infinite while loop', 'Strict boundary checking on length', 'Ignoring null checks', 'Skipping terminal return'],
            correctIndex: 1
          }
        ]
      }
    };
  });

  return {
    courseId,
    slug,
    title: syllabus.title || courseMeta.title || 'Interactive Course',
    description: syllabus.description || courseMeta.description || 'Master modern concepts through interactive learning.',
    category: courseMeta.category || 'Data Structures & Algorithms',
    level: courseMeta.level || 'Intermediate',
    estimatedHours: courseMeta.estimatedHours || 40,
    modules: adaptedModules,
    credits: {
      completion: 500,
      xp: 5000
    }
  };
};

/**
 * Fetch and convert an existing course syllabus dynamically by slug.
 */
export const loadAndAdaptExistingCourse = async (courseSlug) => {
  try {
    const res = await fetchArticleFile(`CourseMappingFiles/learn-${courseSlug}-syllabus.json`);
    if (res && res.ok) {
      const data = await res.json();
      return adaptSyllabusToCourse(data, { slug: courseSlug });
    }
  } catch (err) {
    console.warn(`[ArticleToCourseAdapter] Failed to adapt learn-${courseSlug}:`, err.message);
  }
  return null;
};

export default {
  adaptSyllabusToCourse,
  loadAndAdaptExistingCourse
};
