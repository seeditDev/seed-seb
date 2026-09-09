/**
 * courseDurationCalculator.js
 * Content-driven dynamic duration calculator for SEED-IT courses and modules.
 * Calculates true learning time based on:
 * - Video duration or Reading time
 * - Interactive checkpoints (~2 min each)
 * - Coding practice estimate (~12 min each)
 * - Module assessment duration
 */

/**
 * Estimate reading time in minutes based on text content (assumes ~180-200 WPM).
 */
export const estimateReadingMinutes = (content) => {
  if (!content) return 5;
  if (typeof content !== 'string') return 5;
  const wordCount = content.trim().split(/\s+/).length;
  return Math.max(2, Math.ceil(wordCount / 180));
};

/**
 * Calculate dynamic duration breakdown for a single topic.
 */
export const calculateTopicDuration = (topic) => {
  if (!topic) return { totalMinutes: 15, videoMinutes: 0, readingMinutes: 0, checkMinutes: 0, practiceMinutes: 0 };

  const mode = topic.mode || (topic.videoUrl || topic.lessonContent?.videoUrl ? 'VIDEO' : 'TEXT');
  let videoMinutes = 0;
  let readingMinutes = 0;

  // 1. Video Duration
  const vidSec = topic.duration || topic.lessonContent?.durationSeconds || (topic.videoUrl ? 600 : 0);
  if (vidSec > 0) {
    videoMinutes = Math.ceil(vidSec / 60);
  }

  // 2. Reading Duration
  if (topic.pages && Array.isArray(topic.pages)) {
    readingMinutes = topic.pages.reduce((acc, p) => acc + estimateReadingMinutes(p.content || p.body), 0);
  } else if (topic.lessonContent?.textAndVisuals?.content) {
    readingMinutes = estimateReadingMinutes(topic.lessonContent.textAndVisuals.content);
  } else if (mode === 'TEXT') {
    readingMinutes = topic.estimatedMinutes || 15;
  }

  // 3. Interactive Checkpoints (~2 min each)
  const checkpointsCount = (topic.checkpoints?.length || 0) + 
    (topic.lessonContent?.midVideoCheckpoints?.length || 0) +
    (topic.pages?.filter(p => p.checkpoint)?.length || 0) +
    (topic.activities?.filter(a => a.type === 'AI_CLASS' && a.quickCheck)?.length || 0);
  const checkMinutes = checkpointsCount * 2;

  // 4. Practice Problems (~12 min each)
  const practiceCount = (topic.practiceProblem ? 1 : 0) + 
    (topic.activities?.filter(a => a.type === 'PRACTICE_CODE')?.length || 0);
  const practiceMinutes = practiceCount * 12;

  const totalMinutes = (mode === 'VIDEO' ? videoMinutes : (mode === 'TEXT' ? readingMinutes : Math.max(videoMinutes, readingMinutes))) +
    checkMinutes + practiceMinutes;

  return {
    mode,
    totalMinutes: Math.max(totalMinutes, 10),
    videoMinutes,
    readingMinutes,
    checkMinutes,
    practiceMinutes
  };
};

/**
 * Calculate dynamic duration breakdown for an entire module.
 */
export const calculateModuleDuration = (module) => {
  if (!module) return { totalMinutes: 45, breakdown: {} };

  let totalVideoMins = 0;
  let totalReadingMins = 0;
  let totalCheckMins = 0;
  let totalPracticeMins = 0;

  (module.topics || []).forEach(t => {
    const td = calculateTopicDuration(t);
    totalVideoMins += td.videoMinutes;
    totalReadingMins += td.readingMinutes;
    totalCheckMins += td.checkMinutes;
    totalPracticeMins += td.practiceMinutes;
  });

  // Assessment time (from moduleAssessment or miniAssessment)
  const msa = module.moduleAssessment || module.miniAssessment || {};
  const assessmentMins = msa.durationMinutes || (
    (msa.sections?.mcqSection?.questions?.length || 0) * 1.5 + 
    (msa.sections?.codingSection?.problems?.length || 0) * 20
  ) || 20;

  const primaryContentMins = totalVideoMins > 0 ? totalVideoMins : totalReadingMins;
  const totalMinutes = Math.round(primaryContentMins + totalCheckMins + totalPracticeMins + assessmentMins);

  return {
    totalMinutes: Math.max(totalMinutes, 20),
    breakdown: {
      learningContent: primaryContentMins,
      videoMinutes: totalVideoMins,
      readingMinutes: totalReadingMins,
      interactiveChecks: totalCheckMins,
      codingPractice: totalPracticeMins,
      assessmentMinutes: Math.round(assessmentMins)
    }
  };
};

/**
 * Calculate total course duration across all modules.
 */
export const calculateCourseDuration = (course) => {
  if (!course?.modules) return { totalHours: course?.estimatedHours || 30, modules: [] };

  let courseTotalMins = 0;
  const moduleBreakdowns = (course.modules || []).map(m => {
    const md = calculateModuleDuration(m);
    courseTotalMins += md.totalMinutes;
    return {
      moduleId: m.moduleId,
      title: m.title,
      ...md
    };
  });

  const totalHours = Math.max(1, Math.round(courseTotalMins / 60));

  return {
    totalMinutes: courseTotalMins,
    totalHours,
    modules: moduleBreakdowns
  };
};

export default {
  estimateReadingMinutes,
  calculateTopicDuration,
  calculateModuleDuration,
  calculateCourseDuration
};
