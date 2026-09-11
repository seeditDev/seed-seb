/**
 * feedbackService.js
 *
 * Dedicated service for persisting post-assessment feedback in SEED-SEB.
 * Splits student feedback into two distinct Firestore destinations for analytics and admin reporting:
 * 
 * A. assessmentFeedback
 *    - Collection path: assessments/{assessmentId}/assessmentFeedback/{docId}
 *    - Top-level path:  assessmentFeedback/{docId}
 *    - Covers: assessment difficulty, duration appropriateness, question quality,
 *      skill reflection/alignment, section-specific metrics (MCQ / Coding),
 *      most valuable aspect, and assessment improvement suggestion.
 *
 * B. platformFeedback
 *    - Collection path: assessments/{assessmentId}/platformFeedback/{docId}
 *    - Top-level path:  platformFeedback/{docId}
 *    - Covers: SEED-SEB interface usability, portal experience, performance,
 *      navigation, reliability, technical issues checklist & details,
 *      platform highlights, NPS score (0-10), and final remarks.
 */

import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase-config';

/**
 * Saves both assessment and platform feedback documents.
 * 
 * @param {Object} params
 * @param {string} params.assessmentId
 * @param {string} [params.assessmentTitle]
 * @param {string} [params.attemptId]
 * @param {string} params.userId
 * @param {string} [params.studentEmail]
 * @param {string} [params.studentName]
 * @param {string} [params.tenantId]
 * @param {Object} params.assessmentFeedbackData
 * @param {Object} params.platformFeedbackData
 * @returns {Promise<{ success: boolean, assessmentFeedbackId: string, platformFeedbackId: string }>}
 */
export async function submitAssessmentAndPlatformFeedback({
  assessmentId,
  assessmentTitle = '',
  attemptId = '',
  userId,
  studentEmail = '',
  studentName = '',
  tenantId = 'default',
  assessmentFeedbackData = {},
  platformFeedbackData = {},
}) {
  if (!assessmentId || !userId) {
    throw new Error('assessmentId and userId are required to submit feedback');
  }

  // Generate a uniquely timestamped document identifier
  const timestamp = Date.now();
  const feedbackDocId = `${userId}_${assessmentId}_${timestamp}`;

  const baseMetadata = {
    assessmentId: String(assessmentId),
    assessmentTitle: String(assessmentTitle || ''),
    attemptId: String(attemptId || ''),
    studentId: String(userId),
    studentEmail: String(studentEmail || ''),
    studentName: String(studentName || ''),
    tenantId: String(tenantId || 'default'),
    submittedAt: serverTimestamp(),
    submittedAtISO: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  };

  // 1. Assessment feedback document payload
  const assessmentPayload = {
    ...baseMetadata,
    type: 'assessment_feedback',
    // Overall Assessment Experience
    overallExperienceRating: Number(assessmentFeedbackData.overallExperienceRating || 0),
    difficulty: assessmentFeedbackData.difficulty || 'Moderate',
    durationAppropriate: assessmentFeedbackData.durationAppropriate || 'Appropriate',
    questionQualityRating: Number(assessmentFeedbackData.questionQualityRating || 0),
    skillMatch: assessmentFeedbackData.skillMatch || 'Appropriate',
    confidenceRating: Number(assessmentFeedbackData.confidenceRating || 0),
    reflectedSkills: assessmentFeedbackData.reflectedSkills || 'Mostly',
    valuablePart: assessmentFeedbackData.valuablePart || '',
    improvementSuggestion: assessmentFeedbackData.improvementSuggestion?.trim() || '',
    
    // MCQ specific (if present)
    hasMCQ: Boolean(assessmentFeedbackData.hasMCQ),
    mcqFeedback: assessmentFeedbackData.hasMCQ ? {
      rating: Number(assessmentFeedbackData.mcqRating || 0),
      clarity: assessmentFeedbackData.mcqClarity || 'Clear',
      difficulty: assessmentFeedbackData.mcqDifficulty || 'Appropriate',
      issues: Array.isArray(assessmentFeedbackData.mcqIssues) ? assessmentFeedbackData.mcqIssues : [],
      problematicQuestions: assessmentFeedbackData.mcqProblematicQuestions?.trim() || '',
    } : null,

    // Coding specific (if present)
    hasCoding: Boolean(assessmentFeedbackData.hasCoding),
    codingFeedback: assessmentFeedbackData.hasCoding ? {
      rating: Number(assessmentFeedbackData.codingRating || 0),
      clarity: assessmentFeedbackData.codingClarity || 'Clear',
      difficulty: assessmentFeedbackData.codingDifficulty || 'Appropriate',
      editorRating: Number(assessmentFeedbackData.codingEditorRating || 0),
      issues: Array.isArray(assessmentFeedbackData.codingIssues) ? assessmentFeedbackData.codingIssues : [],
      issueDescription: assessmentFeedbackData.codingIssueDescription?.trim() || '',
    } : null,
  };

  // 2. Platform feedback document payload
  const platformPayload = {
    ...baseMetadata,
    type: 'platform_feedback',
    // SEED Portal / SEB Usability
    interfaceUsabilityRating: Number(platformFeedbackData.interfaceUsabilityRating || 0),
    portalOverallRating: Number(platformFeedbackData.portalOverallRating || 0),
    instructionClarityRating: Number(platformFeedbackData.instructionClarityRating || 0),
    navigationEaseRating: Number(platformFeedbackData.navigationEaseRating || 0),
    performanceRating: Number(platformFeedbackData.performanceRating || 0),
    reliability: platformFeedbackData.reliability || 'Yes, completely',

    // Technical Experience (Debugging SEED-SEB)
    hadTechnicalIssues: platformFeedbackData.hadTechnicalIssues || 'No',
    technicalIssues: Array.isArray(platformFeedbackData.technicalIssues) ? platformFeedbackData.technicalIssues : [],
    technicalIssueDetails: platformFeedbackData.technicalIssueDetails?.trim() || '',
    technicalIssueTiming: platformFeedbackData.technicalIssueTiming || '',

    // Portal-specific likes & dislikes
    platformLiked: Array.isArray(platformFeedbackData.platformLiked) 
      ? platformFeedbackData.platformLiked 
      : (platformFeedbackData.platformLiked ? [platformFeedbackData.platformLiked] : []),
    platformDisliked: Array.isArray(platformFeedbackData.platformDisliked)
      ? platformFeedbackData.platformDisliked
      : (platformFeedbackData.platformDisliked ? [platformFeedbackData.platformDisliked] : []),
    
    // Net Promoter Score (0 - 10)
    npsScore: platformFeedbackData.npsScore !== null && platformFeedbackData.npsScore !== undefined
      ? Number(platformFeedbackData.npsScore)
      : null,
    
    // Final Open Feedback
    additionalFeedback: platformFeedbackData.additionalFeedback?.trim() || '',
  };

  // Parallel writes to Firestore subcollections:
  // assessments/{assessmentId}/assessmentFeedback/{feedbackDocId}
  // assessments/{assessmentId}/platformFeedback/{feedbackDocId}
  const writePromises = [];

  // A. Subcollections under assessment
  writePromises.push(
    setDoc(
      doc(db, 'assessments', String(assessmentId), 'assessmentFeedback', feedbackDocId),
      assessmentPayload
    ).catch(err => {
      console.warn('[feedbackService] Failed subcollection write to assessmentFeedback:', err);
      throw err;
    })
  );

  writePromises.push(
    setDoc(
      doc(db, 'assessments', String(assessmentId), 'platformFeedback', feedbackDocId),
      platformPayload
    ).catch(err => {
      console.warn('[feedbackService] Failed subcollection write to platformFeedback:', err);
      throw err;
    })
  );

  // B. Top-level collections for global reporting (best effort)
  writePromises.push(
    setDoc(
      doc(db, 'assessmentFeedback', feedbackDocId),
      assessmentPayload
    ).catch(err => {
      console.warn('[feedbackService] Best-effort top-level assessmentFeedback write notice:', err?.message);
    })
  );

  writePromises.push(
    setDoc(
      doc(db, 'platformFeedback', feedbackDocId),
      platformPayload
    ).catch(err => {
      console.warn('[feedbackService] Best-effort top-level platformFeedback write notice:', err?.message);
    })
  );

  // Await primary subcollection writes
  await Promise.all(writePromises);

  return {
    success: true,
    assessmentFeedbackId: feedbackDocId,
    platformFeedbackId: feedbackDocId,
  };
}
