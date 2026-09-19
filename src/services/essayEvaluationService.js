/**
 * essayEvaluationService.js
 * Comprehensive evaluation engine for SEED-IT Essay assessments.
 * Implements transparent multi-parameter rubric scoring, deterministic grammar/syntax analysis,
 * and immutable evaluation versioning ("essay-v1").
 */

import { countWords, countSentences, countParagraphs } from '../utils/essayTextUtil';

const TRANSITION_WORDS = [
  'furthermore', 'moreover', 'however', 'consequently', 'therefore',
  'nevertheless', 'nonetheless', 'in addition', 'in conclusion', 'firstly',
  'secondly', 'thirdly', 'finally', 'as a result', 'on the other hand',
  'in contrast', 'specifically', 'for instance', 'for example', 'similarly',
  'subsequently', 'in particular', 'ultimately', 'notably', 'in summary'
];

const INFORMAL_WORDS = [
  'wanna', 'gonna', 'kinda', 'gotta', 'dunno', 'lol', 'rofl', 'omg',
  'stuff', 'lots of', 'bunch of', 'huge', 'cool', 'guy', 'guys'
];

const GRAMMAR_RULES = [
  { regex: /\b(he|she|it)\s+(don't|do|have)\b/i, message: 'Subject-verb agreement mismatch (e.g. "he don\'t" -> "he doesn\'t")', type: 'Subject-Verb' },
  { regex: /\b(they|we|you)\s+(is|was|has)\b/i, message: 'Subject-verb agreement mismatch (e.g. "they is" -> "they are")', type: 'Subject-Verb' },
  { regex: /\b(a)\s+[aeiou][a-z]+/i, message: 'Incorrect article: use "an" before vowel sounds', type: 'Article' },
  { regex: /\b(an)\s+[bcdfghjklmnpqrstvwxyz][a-z]+/i, message: 'Incorrect article: use "a" before consonant sounds', type: 'Article' },
  { regex: /[,;]\s*[,;]/, message: 'Consecutive duplicate punctuation detected', type: 'Punctuation' },
  { regex: /\s{2,}/, message: 'Redundant consecutive whitespace', type: 'Mechanics' },
  { regex: /\b(its)\s+(a|an|the|very)\b/i, message: 'Potential confusion between "its" and "it\'s"', type: 'Mechanics' },
  { regex: /\b(their|there|they're)\b/i, check: (match, text) => false, type: 'Homophone' }
];

/**
 * Evaluates an essay against configured rubric and word boundaries.
 *
 * @param {string} studentTitle - Candidate's entered title.
 * @param {string} answerText - Candidate's typed essay body.
 * @param {object} prompt - Question/prompt configuration.
 * @param {object} rubric - Rubric weight configuration.
 * @returns {object} Structured evaluation result.
 */
export function evaluateEssay(studentTitle = '', answerText = '', prompt = {}, rubric = {}) {
  const text = (answerText || '').trim();
  const title = (studentTitle || '').trim();

  // Metrics
  const wordCount = countWords(text);
  const sentenceCount = countSentences(text);
  const paragraphCount = countParagraphs(text);

  const minWords = Number(prompt.minWords) || 300;
  const maxWords = Number(prompt.maxWords) || 500;

  // Rubric Max Weights
  const contentMax = Number(rubric.contentWeight) || 8;
  const grammarMax = Number(rubric.grammarWeight) || 4;
  const structureMax = Number(rubric.structureWeight) || 3;
  const coherenceMax = Number(rubric.coherenceWeight) || 3;
  const vocabularyMax = Number(rubric.vocabularyWeight) || 2;
  const totalMaxMarks = contentMax + grammarMax + structureMax + coherenceMax + vocabularyMax;

  // ── 1. Content & Relevance Evaluation ───────────────────────────────────────
  // A. Word Count Compliance (50% of content)
  let wordCountRatio = 1.0;
  if (wordCount < minWords) {
    wordCountRatio = Math.max(0.2, wordCount / minWords);
  } else if (wordCount > maxWords * 1.2) {
    wordCountRatio = Math.max(0.7, 1 - (wordCount - maxWords) / (maxWords * 2));
  }

  // B. Question Prompt Overlap / Keyword presence (30% of content)
  const promptTokens = (prompt.question || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3);
  
  const textLower = text.toLowerCase();
  let keywordHits = 0;
  const uniquePromptTokens = Array.from(new Set(promptTokens));
  uniquePromptTokens.forEach(k => {
    if (textLower.includes(k)) keywordHits += 1;
  });
  const keywordRatio = uniquePromptTokens.length > 0
    ? Math.min(1.0, (keywordHits / uniquePromptTokens.length) * 1.4)
    : 0.85;

  // C. Depth & Paragraph Elaboration (20% of content)
  const depthRatio = Math.min(1.0, (sentenceCount / Math.max(8, (minWords / 25))) * 0.7 + (paragraphCount >= 3 ? 0.3 : 0.15));

  const contentScoreRaw = (wordCountRatio * 0.5 + keywordRatio * 0.3 + depthRatio * 0.2) * contentMax;
  const contentScore = Math.min(contentMax, Math.round(contentScoreRaw * 10) / 10);

  // ── 2. Grammar & Mechanics Analysis ─────────────────────────────────────────
  const grammarIssuesList = [];
  let grammarIssuesCount = 0;

  // Rule-based checks
  GRAMMAR_RULES.forEach(rule => {
    if (rule.regex && rule.regex.test(text)) {
      grammarIssuesCount += 1;
      grammarIssuesList.push({
        type: rule.type,
        message: rule.message
      });
    }
  });

  // Capitalization check: First character of sentences
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
  let uncappedCount = 0;
  sentences.forEach(s => {
    const firstChar = s.charAt(0);
    if (firstChar && firstChar === firstChar.toLowerCase() && /[a-z]/.test(firstChar)) {
      uncappedCount += 1;
    }
  });
  if (uncappedCount > 0) {
    grammarIssuesCount += uncappedCount;
    grammarIssuesList.push({
      type: 'Capitalization',
      message: `${uncappedCount} sentence${uncappedCount > 1 ? 's do' : ' does'} not begin with a capital letter.`
    });
  }

  // Punctuation check: Ending of essay
  if (text.length > 0 && !/[.!?]$/.test(text)) {
    grammarIssuesCount += 1;
    grammarIssuesList.push({
      type: 'Punctuation',
      message: 'Essay does not conclude with terminating punctuation (. ! ?)'
    });
  }

  // Compute grammar score
  const errorTolerance = Math.max(1, sentenceCount * 0.5);
  const grammarRatio = Math.max(0.25, 1 - (grammarIssuesCount / (errorTolerance * 3)));
  const grammarScoreRaw = grammarRatio * grammarMax;
  const grammarScore = Math.min(grammarMax, Math.round(grammarScoreRaw * 10) / 10);

  // ── 3. Structure & Organization Evaluation ──────────────────────────────────
  // A. Paragraph structure (3+ paragraphs: intro, body, conclusion)
  let paraScore = 0.5;
  if (paragraphCount >= 4) paraScore = 1.0;
  else if (paragraphCount === 3) paraScore = 0.9;
  else if (paragraphCount === 2) paraScore = 0.7;

  // B. Title presence
  const titleScore = title.length > 3 ? 1.0 : (prompt.requireTitle ? 0.3 : 0.8);

  const structureScoreRaw = (paraScore * 0.7 + titleScore * 0.3) * structureMax;
  const structureScore = Math.min(structureMax, Math.round(structureScoreRaw * 10) / 10);

  // ── 4. Coherence & Transitions Evaluation ───────────────────────────────────
  let transitionCount = 0;
  TRANSITION_WORDS.forEach(tw => {
    const reg = new RegExp(`\\b${tw}\\b`, 'i');
    if (reg.test(text)) transitionCount += 1;
  });

  const transitionRatio = Math.min(1.0, Math.max(0.3, transitionCount / 4));
  const sentenceVariance = sentenceCount > 3 ? 0.9 : 0.6;

  const coherenceScoreRaw = (transitionRatio * 0.7 + sentenceVariance * 0.3) * coherenceMax;
  const coherenceScore = Math.min(coherenceMax, Math.round(coherenceScoreRaw * 10) / 10);

  // ── 5. Vocabulary & Lexical Diversity ───────────────────────────────────────
  const wordsArray = text.toLowerCase().match(/\b[a-z]{2,}\b/g) || [];
  const uniqueWords = new Set(wordsArray);
  const typeTokenRatio = wordsArray.length > 0 ? (uniqueWords.size / wordsArray.length) : 0.5;

  let informalCount = 0;
  INFORMAL_WORDS.forEach(iw => {
    if (new RegExp(`\\b${iw}\\b`, 'i').test(text)) informalCount += 1;
  });

  const ttrRatio = Math.min(1.0, Math.max(0.4, typeTokenRatio * 1.6));
  const formalityRatio = Math.max(0.3, 1 - (informalCount * 0.15));

  const vocabularyScoreRaw = (ttrRatio * 0.6 + formalityRatio * 0.4) * vocabularyMax;
  const vocabularyScore = Math.min(vocabularyMax, Math.round(vocabularyScoreRaw * 10) / 10);

  // ── Final Total & Grade ─────────────────────────────────────────────────────
  const totalScore = Math.min(
    totalMaxMarks,
    Math.round((contentScore + grammarScore + structureScore + coherenceScore + vocabularyScore) * 10) / 10
  );

  const percentage = totalMaxMarks > 0 ? Math.round((totalScore / totalMaxMarks) * 100) : 0;
  const passThreshold = Number(rubric.passThreshold) || 50;
  const passed = percentage >= passThreshold;

  // Diagnostic feedback array
  const feedback = [];
  if (paragraphCount >= 3) {
    feedback.push('✓ Well-formed structural division across paragraphs (Introduction, Body, Conclusion).');
  } else {
    feedback.push('⚠ Structure would benefit from distinct paragraphs separating central arguments.');
  }

  if (transitionCount >= 3) {
    feedback.push(`✓ Excellent logical transition markers utilized (${transitionCount} transition phrases).`);
  } else {
    feedback.push('⚠ Consider incorporating more transition linkers (e.g. "furthermore", "however", "consequently").');
  }

  if (grammarIssuesCount === 0) {
    feedback.push('✓ High grammatical accuracy with clean sentence mechanics.');
  } else {
    feedback.push(`⚠ ${grammarIssuesCount} potential grammar/mechanics issue${grammarIssuesCount > 1 ? 's' : ''} detected.`);
  }

  if (typeTokenRatio > 0.45) {
    feedback.push('✓ Strong lexical variety and academic vocabulary breadth.');
  }

  return {
    evaluationVersion: 'essay-v1',
    evaluatedAt: new Date().toISOString(),
    evaluator: 'RULES_PLUS_SYNTAX_V1',
    rubricScores: {
      content: contentScore,
      grammar: grammarScore,
      structure: structureScore,
      coherence: coherenceScore,
      vocabulary: vocabularyScore,
      total: totalScore,
    },
    rubricMax: {
      content: contentMax,
      grammar: grammarMax,
      structure: structureMax,
      coherence: coherenceMax,
      vocabulary: vocabularyMax,
      total: totalMaxMarks,
    },
    grammarAnalysis: {
      sentenceCount,
      wordCount,
      paragraphCount,
      grammarIssues: grammarIssuesCount,
      spellingIssues: 0,
      punctuationIssues: uncappedCount,
      issuesList: grammarIssuesList,
      feedback,
    },
    score: totalScore,
    maxScore: totalMaxMarks,
    percentage,
    passed,
  };
}
