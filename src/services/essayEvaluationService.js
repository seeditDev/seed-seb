/**
 * essayEvaluationService.js
 * Comprehensive Multi-Stage Evaluation Engine for SEED-IT Essay assessments.
 * Inspired by ETS e-rater automated scoring principles:
 * - Stage 1: Deterministic Submission Validation & Repetition Detection
 * - Stage 2: Quality Checks & Anomaly Flagging (ANOMALOUS_REPETITION, LOW_INFORMATION, OFF_TOPIC)
 * - Stage 3: Writing Analysis (Grammar, Mechanics, Style, Sentence Variety)
 * - Stage 4: Content Analysis (Topic Relevance & Concept Coverage)
 * - Stage 5: Independent Rubric Scoring (Eliminates artificial minimum clamping floors)
 * - Stage 6: Confidence Rating & Audit Dossier
 */

import { countWords, countSentences, countParagraphs } from '../utils/essayTextUtil.js';

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
  { regex: /\s{3,}/, message: 'Excessive whitespace detected', type: 'Mechanics' },
  { regex: /\b(its)\s+(a|an|the|very)\b/i, message: 'Potential confusion between "its" and "it\'s"', type: 'Mechanics' }
];

/**
 * Evaluates an essay against configured rubric and word boundaries with rigorous anomaly filtering.
 *
 * @param {string} studentTitle - Candidate's entered title.
 * @param {string} answerText - Candidate's typed essay body.
 * @param {object} prompt - Question/prompt configuration.
 * @param {object} rubric - Rubric weight configuration.
 * @returns {object} Structured multi-stage evaluation result.
 */
export function evaluateEssay(studentTitle = '', answerText = '', prompt = {}, rubric = {}) {
  const text = (answerText || '').trim();
  const title = (studentTitle || '').trim();

  // Basic Metrics
  const wordCount = countWords(text);
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

  // ── Stage 1: Deterministic Sentence & Lexical Repetition Analysis ─────────────
  const rawSentences = text
    .split(/[.!?\n]+/)
    .map(s => s.trim().replace(/\s+/g, ' '))
    .filter(s => s.split(' ').length >= 3);

  const sentenceCount = rawSentences.length;

  // Track sentence uniqueness and maximum repetition of any single sentence
  const sentenceFreq = new Map();
  rawSentences.forEach(s => {
    const norm = s.toLowerCase().replace(/[^a-z0-9 ]/g, '');
    if (norm.length > 5) {
      sentenceFreq.set(norm, (sentenceFreq.get(norm) || 0) + 1);
    }
  });

  const uniqueSentenceCount = sentenceFreq.size;
  const uniqueSentenceRatio = sentenceCount > 0 ? (uniqueSentenceCount / sentenceCount) : 1.0;

  let maxSentenceRepeat = 0;
  sentenceFreq.forEach(cnt => {
    if (cnt > maxSentenceRepeat) maxSentenceRepeat = cnt;
  });

  // Lexical Diversity: Type-Token Ratio (TTR)
  const wordsOnly = text.toLowerCase().match(/\b[a-z]{2,}\b/g) || [];
  const uniqueWords = new Set(wordsOnly);
  const typeTokenRatio = wordsOnly.length > 0 ? (uniqueWords.size / wordsOnly.length) : 0;

  // 3-Gram Phrase Cycling Analysis (detects cycling loops of phrases)
  const triGrams = new Map();
  for (let i = 0; i <= wordsOnly.length - 3; i++) {
    const tri = `${wordsOnly[i]} ${wordsOnly[i + 1]} ${wordsOnly[i + 2]}`;
    triGrams.set(tri, (triGrams.get(tri) || 0) + 1);
  }
  let repeatedTriGrams = 0;
  triGrams.forEach(count => {
    if (count > 2) repeatedTriGrams += (count - 1);
  });
  const triGramRepeatRatio = wordsOnly.length >= 3 ? ((repeatedTriGrams * 3) / wordsOnly.length) : 0;

  // ── Stage 2: Quality Checks & Anomaly Detection ──────────────────────────────
  const qualityFlags = [];
  let isRepetitiveAnomaly = false;
  let isLowInformation = false;
  let isOffTopic = false;

  // A. Check for duplicate sentence abuse (e.g. copy-pasting 2 lines 10 times)
  if (sentenceCount >= 4 && (uniqueSentenceRatio < 0.55 || (sentenceCount >= 6 && maxSentenceRepeat >= 3))) {
    qualityFlags.push('ANOMALOUS_REPETITION');
    isRepetitiveAnomaly = true;
  }

  // B. Check for low information or vocabulary collapse
  if (wordCount >= 60 && (typeTokenRatio < 0.22 || triGramRepeatRatio > 0.45)) {
    qualityFlags.push('LOW_INFORMATION_RESPONSE');
    isLowInformation = true;
  }

  // C. Check for character-level spam or gibberish
  const longestWord = wordsOnly.reduce((max, w) => Math.max(max, w.length), 0);
  if (longestWord > 30 || /([a-z]{3,})\1{3,}/i.test(text)) {
    qualityFlags.push('NONSENSE_OR_GIBBERISH');
    isLowInformation = true;
  }

  // D. Insufficient Substance
  if (wordCount < minWords * 0.35) {
    qualityFlags.push('INSUFFICIENT_SUBSTANCE');
  }

  // ── Stage 3: Topic & Concept Alignment Analysis ──────────────────────────────
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
    ? Math.min(1.0, (keywordHits / uniquePromptTokens.length) * 1.3)
    : 0.85;

  if (uniquePromptTokens.length >= 4 && keywordRatio < 0.15 && wordCount >= minWords * 0.5) {
    qualityFlags.push('OFF_TOPIC');
    isOffTopic = true;
  }

  const isAnomalous = isRepetitiveAnomaly || isLowInformation;

  // ── Stage 4: Grammar, Mechanics & Sentence Variety Analysis ──────────────────
  const grammarIssuesList = [];
  let grammarIssuesCount = 0;

  GRAMMAR_RULES.forEach(rule => {
    if (rule.regex && rule.message && rule.regex.test(text)) {
      grammarIssuesCount += 1;
      grammarIssuesList.push({
        type: rule.type || 'Grammar',
        message: rule.message || 'Grammar warning'
      });
    }
  });

  // Capitalization check: First character of sentences
  let uncappedCount = 0;
  rawSentences.forEach(s => {
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

  // ── Stage 5: Independent Rubric Scoring Engine ───────────────────────────────

  // A. Content & Relevance (8 marks max)
  let contentScore = 0;
  if (isAnomalous) {
    // Zero / negligible content score for copy-paste loops or gibberish
    contentScore = Math.min(0.5, contentMax * 0.06);
  } else {
    // Genuine submissions: word count compliance ONLY applies when text is substantively unique
    let wordCountRatio = 0.0;
    if (wordCount >= minWords && wordCount <= maxWords * 1.25) {
      wordCountRatio = 1.0;
    } else if (wordCount < minWords) {
      wordCountRatio = (wordCount / minWords) * 0.8;
    } else {
      wordCountRatio = Math.max(0.7, 1 - ((wordCount - maxWords) / (maxWords * 2)));
    }

    // Weight uniqueness factor into content compliance
    const uniquenessWeight = Math.min(1.0, uniqueSentenceRatio * 1.1);
    const effectiveWordRatio = wordCountRatio * uniquenessWeight;

    const topicWeight = isOffTopic ? 0.15 : keywordRatio;
    const depthRatio = Math.min(1.0, (uniqueSentenceCount / Math.max(6, (minWords / 30))) * 0.8 + (paragraphCount >= 3 ? 0.2 : 0.05));

    const contentScoreRaw = (effectiveWordRatio * 0.45 + topicWeight * 0.35 + depthRatio * 0.20) * contentMax;
    contentScore = Math.min(contentMax, Math.max(0, Math.round(contentScoreRaw * 10) / 10));
  }

  // B. Grammar & Mechanics (4 marks max)
  let grammarScore = 0;
  if (isAnomalous) {
    // If anomalous repetition, grammar cannot exceed 1.0 even if single pasted line has valid syntax
    grammarScore = Math.min(1.0, grammarMax * 0.25);
  } else {
    const errorTolerance = Math.max(1, sentenceCount * 0.4);
    const grammarRatio = Math.max(0, 1 - (grammarIssuesCount / (errorTolerance * 2.5)));
    grammarScore = Math.min(grammarMax, Math.round(grammarRatio * grammarMax * 10) / 10);
  }

  // C. Structure & Organization (3 marks max)
  let structureScore = 0;
  if (isAnomalous) {
    structureScore = Math.min(0.5, structureMax * 0.15);
  } else {
    let paraRatio = 0.4;
    if (paragraphCount >= 4) paraRatio = 1.0;
    else if (paragraphCount === 3) paraRatio = 0.85;
    else if (paragraphCount === 2) paraRatio = 0.65;

    const titleRatio = title.length > 3 ? 1.0 : (prompt.requireTitle ? 0.2 : 0.7);
    const structureScoreRaw = (paraRatio * 0.7 + titleRatio * 0.3) * structureMax;
    structureScore = Math.min(structureMax, Math.max(0, Math.round(structureScoreRaw * 10) / 10));
  }

  // D. Coherence & Flow (3 marks max)
  let coherenceScore = 0;
  let transitionCount = 0;
  TRANSITION_WORDS.forEach(tw => {
    const reg = new RegExp(`\\b${tw}\\b`, 'i');
    if (reg.test(text)) transitionCount += 1;
  });

  if (isAnomalous) {
    coherenceScore = Math.min(0.5, coherenceMax * 0.15);
  } else {
    const transitionRatio = Math.min(1.0, transitionCount / 4);
    const sentenceVariance = uniqueSentenceCount > 4 ? 0.9 : (uniqueSentenceCount / 5);
    const coherenceScoreRaw = (transitionRatio * 0.65 + sentenceVariance * 0.35) * coherenceMax;
    coherenceScore = Math.min(coherenceMax, Math.max(0, Math.round(coherenceScoreRaw * 10) / 10));
  }

  // E. Vocabulary & Lexical Resource (2 marks max)
  let vocabularyScore = 0;
  let informalCount = 0;
  INFORMAL_WORDS.forEach(iw => {
    if (new RegExp(`\\b${iw}\\b`, 'i').test(text)) informalCount += 1;
  });

  if (isAnomalous) {
    vocabularyScore = Math.min(0.2, vocabularyMax * 0.1);
  } else {
    const ttrRatio = Math.min(1.0, typeTokenRatio * 1.8);
    const formalityRatio = Math.max(0, 1 - (informalCount * 0.15));
    const vocabularyScoreRaw = (ttrRatio * 0.7 + formalityRatio * 0.3) * vocabularyMax;
    vocabularyScore = Math.min(vocabularyMax, Math.max(0, Math.round(vocabularyScoreRaw * 10) / 10));
  }

  // ── Stage 6: Total Score, Confidence & Review Status ─────────────────────────
  let totalScore = Math.round((contentScore + grammarScore + structureScore + coherenceScore + vocabularyScore) * 10) / 10;

  // Strict cap on anomalous submissions: cannot exceed 2.5 marks (12.5%)
  if (isAnomalous) {
    totalScore = Math.min(2.5, totalScore);
  }

  totalScore = Math.min(totalMaxMarks, Math.max(0, totalScore));
  const percentage = totalMaxMarks > 0 ? Math.round((totalScore / totalMaxMarks) * 100) : 0;
  const passThreshold = Number(rubric.passThreshold) || 50;
  const passed = !isAnomalous && !isOffTopic && (percentage >= passThreshold);

  // Confidence assessment
  let confidence = 'HIGH';
  if (isAnomalous || isOffTopic) {
    confidence = 'LOW';
  } else if (wordCount < minWords || uniqueSentenceRatio < 0.75) {
    confidence = 'MEDIUM';
  }

  // Review status
  const reviewStatus = isAnomalous
    ? 'FLAGGED_FOR_MANUAL_AUDIT'
    : isOffTopic
    ? 'REVIEW_RECOMMENDED'
    : 'NOT_REQUIRED';

  // Comprehensive diagnostic feedback
  const feedback = [];
  if (isRepetitiveAnomaly) {
    feedback.push(`⚠ CRITICAL ANOMALY: Excessive sentence repetition detected (${uniqueSentenceCount} unique out of ${sentenceCount} sentences, ${Math.round(uniqueSentenceRatio * 100)}% uniqueness). Score penalized.`);
  }
  if (isLowInformation) {
    feedback.push(`⚠ CRITICAL ANOMALY: Low lexical diversity detected (TTR: ${Math.round(typeTokenRatio * 100)}%). Content exhibits characteristics of duplicate phrases or low-information text.`);
  }
  if (isOffTopic) {
    feedback.push('⚠ TOPIC ADHERENCE: Content appears disconnected from the assigned prompt keywords and core concepts.');
  }

  if (!isAnomalous) {
    if (paragraphCount >= 3) {
      feedback.push('✓ Well-formed structural division across paragraphs (Introduction, Body, Conclusion).');
    } else {
      feedback.push('⚠ Structure would benefit from distinct paragraphs separating central arguments.');
    }

    if (transitionCount >= 3) {
      feedback.push(`✓ Good transition linkers utilized (${transitionCount} transition phrases).`);
    } else {
      feedback.push('⚠ Consider incorporating more transition linkers (e.g. "furthermore", "however", "consequently").');
    }

    if (grammarIssuesCount === 0) {
      feedback.push('✓ High grammatical accuracy with clean sentence mechanics.');
    } else {
      feedback.push(`⚠ ${grammarIssuesCount} potential grammar/mechanics issue${grammarIssuesCount > 1 ? 's' : ''} detected.`);
    }

    if (typeTokenRatio > 0.42) {
      feedback.push(`✓ Strong lexical variety (${Math.round(typeTokenRatio * 100)}% unique word ratio).`);
    }
  }

  return {
    evaluationVersion: 'essay-v2',
    evaluatedAt: new Date().toISOString(),
    evaluator: 'MULTI_STAGE_E_RATER_V2',
    qualityFlags: qualityFlags.length > 0 ? qualityFlags : ['CLEAN'],
    confidence,
    reviewStatus,
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
      uniqueSentenceCount,
      uniqueSentenceRatio: Math.round(uniqueSentenceRatio * 100) / 100,
      wordCount,
      paragraphCount,
      typeTokenRatio: Math.round(typeTokenRatio * 100) / 100,
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
