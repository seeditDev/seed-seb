import React, { useState, useEffect, useRef, useCallback } from 'react';
import { buildResultDoc, buildSectionResult, buildQuestionResult, buildCodingSubmission } from '../utils/buildResultDoc.js';
import QuestionTimingTracker from '../utils/questionTimingTracker.js';
import { useNavigate, useParams, Link } from './router-compat';
import Editor from '@monaco-editor/react';
import { MONACO_FONT_OPTIONS, remeasureMonacoFonts } from '../utils/monacoFontFix';
import { 
    FaArrowLeft, FaArrowRight, FaPlay, FaCheck, FaTimes, FaUndo, FaBookmark, 
    FaClock, FaLock, FaExclamationTriangle, FaCheckCircle, FaTimesCircle,
    FaSearch, FaChevronLeft, FaChevronRight, FaChevronDown, FaChevronUp,
    FaSignOutAlt, FaUser, FaShieldAlt, FaFlag, FaFileAlt, FaListUl, 
    FaCode, FaTerminal, FaCog, FaExpand, FaCompress, FaBookOpen, FaComments,
    FaRegCheckCircle, FaRegCircle, FaLightbulb, FaSyncAlt, FaThList, FaFont, FaEdit
} from 'react-icons/fa';
import desktopBridge, { isEngineDisconnected } from '../utils/desktopBridge';
import CodingAssessmentService from '../services/codingAssessmentService';
import DataService from '../services/dataService';
import timeService from '../services/timeService';
import { clearAllProctorCache, getViolations, recordViolation } from '../utils/proctorCache';
import { auth, db } from '../lib/firebase-config';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import ProctoringEngine from './ProctoringEngine';
import AudioProctoringEngine from './AudioProctoringEngine';
import ProctoringInstructions from './ProctoringInstructions';
import { normalizeTestCaseArray, isTestCasePassed, getQuestionHiddenTestCases, getQuestionSampleTestCases, getQuestionVisibleAllTestCases } from '../utils/testCaseUtils';
import ProblemMarkdownRenderer, { ProblemImage } from './common/ProblemMarkdownRenderer';
import '../styles/CodingAssessmentPage.css';
import { fetchContentJSON } from '../utils/contentApi';
import { useTabSwitchGuard } from '../utils/tabSwitchGuard';
import { createSubmitGuard } from '../utils/submitGuard';
import { readJSON } from '../utils/safeStorage';
import { throttledLocalStorageSet, flushThrottledWrites } from '../utils/throttle';
import { markAssessmentCompleted } from '../services/attemptStatusService';
import SecurityWatermark from './SecurityWatermark';
import { stopAllMediaAndAI } from '../utils/hardwareTeardown';
import { toast } from 'sonner';

import { isCompleteQuestion } from '../services/codingQuestionBankService';

const LOCAL_BASE_URL = '/seed-contents';


const FREE_BOILERPLATES = {
  c: `#include <stdio.h>

int main() {
    // Write your code here
    return 0;
}`,
  cpp: `#include <iostream>
using namespace std;

int main() {
    // Write your code here
    return 0;
}`,
  'c++': `#include <iostream>
using namespace std;

int main() {
    // Write your code here
    return 0;
}`,
  java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        // Write your code here
    }
}`,
  python: `# Write your code here
`,
  python3: `# Write your code here
`,
  javascript: `// Write your code here
console.log("Hello, World!");
`
};

/**
 * Helper to retrieve language boilerplate from question or global defaults
 */
export function getQuestionBoilerplate(q, lang) {
  if (!lang) return "";
  const standardLang = lang === 'python3' ? 'python' : (lang === 'c++' ? 'cpp' : (lang === 'js' ? 'javascript' : lang.toLowerCase()));
  const altLang = standardLang === 'python' ? 'python3' : (standardLang === 'cpp' ? 'c++' : (standardLang === 'javascript' ? 'js' : standardLang));
  
  const searchInObj = (obj) => {
    if (!obj || typeof obj !== 'object') return null;
    // 1. Direct standard keys
    const direct = obj[standardLang] || obj[altLang] || obj[lang];
    if (typeof direct === 'string' && direct.trim() !== '') return direct;

    // 2. Case-insensitive & alias scan (matches "C++", "Python3", "Java", "C", "JavaScript")
    const targets = new Set([
      standardLang.toLowerCase(),
      altLang.toLowerCase(),
      lang.toLowerCase(),
      standardLang.toLowerCase().replace(/[^a-z0-9]/g, ''),
      altLang.toLowerCase().replace(/[^a-z0-9]/g, '')
    ]);
    if (standardLang === 'cpp') {
      targets.add('c++');
      targets.add('cpp');
    }
    if (standardLang === 'python') {
      targets.add('python3');
      targets.add('py');
    }
    if (standardLang === 'javascript') {
      targets.add('js');
      targets.add('node');
    }

    for (const [k, v] of Object.entries(obj)) {
      if (typeof v !== 'string' || !v.trim()) continue;
      const kClean = String(k).trim().toLowerCase();
      const kAlpha = kClean.replace(/[^a-z0-9]/g, '');
      if (targets.has(kClean) || targets.has(kAlpha)) {
        return v;
      }
    }
    return null;
  };

  if (q) {
    const candidates = [
      q.boilerplates,
      q.boilerPlates,
      q.boilerplate,
      q.content?.boilerplates,
      q.content?.boilerPlates,
      q.content?.boilerplate,
      q.starterCode,
      q.starter_code,
      q.content?.starterCode,
      q.templates,
      q.codeTemplates,
      q.codeSnippet,
      q.codeSnippets,
      q.defaultCode
    ];

    for (const source of candidates) {
      if (source && typeof source === 'object') {
        const found = searchInObj(source);
        if (found) return found;
      } else if (typeof source === 'string' && source.trim() !== '' && candidates.indexOf(source) <= 2) {
        return source;
      }
    }
  }
  return FREE_BOILERPLATES[standardLang] || FREE_BOILERPLATES[altLang] || FREE_BOILERPLATES[lang] || "";
}

const slugify = (value = '') => {
    if (!value) return 'coding-test';
    return value
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'coding-test';
};

const normalizeQuestion = (q, idx = 0) => {
    if (!q) return q;
    const rawId = q.id || q.questionId || q.challengeId || q._id;
    const id = String(rawId !== undefined && rawId !== null && String(rawId).trim() !== '' ? rawId : `q_${idx}`).trim();
    const title = q.title || q.name || (q.content?.title  ?? '');
    const description = q.content?.problemStatement || q.description || q.problemStatement || q.statement || '';
    const constraints = Array.isArray(q.content?.constraints) 
        ? q.content.constraints.join('\n') 
        : (q.constraints ?? '');

    // Normalize boilerPlates robustly supporting camelCase, lowerCase, uppercase, and standard language keys
    const getNormalizedLangKey = (k) => {
        const clean = String(k).trim().toLowerCase();
        if (clean === 'c') return 'c';
        if (clean === 'cpp' || clean === 'c++') return 'cpp';
        if (clean === 'java') return 'java';
        if (clean === 'python' || clean === 'python3') return 'python';
        if (clean === 'javascript' || clean === 'js') return 'javascript';
        return clean;
    };

    const VALID_LANG_NAMES = new Set(['c', 'cpp', 'c++', 'java', 'python', 'python3', 'javascript', 'js', 'csharp', 'cs', 'ruby', 'go', 'rust', 'kotlin', 'swift', 'typescript', 'ts']);
    const rawBoilerplates = {
        ...(q.content?.boilerPlates || {}),
        ...(q.content?.boilerplates || {}),
        ...(q.boilerplates || {}),
        ...(q.boilerPlates || {})
    };
    const boilerPlates = {};

    Object.entries(rawBoilerplates).forEach(([lang, val]) => {
        const clean = String(lang).trim().toLowerCase();
        if (!VALID_LANG_NAMES.has(clean) && !VALID_LANG_NAMES.has(clean.replace(/[^a-z0-9]/g, ''))) return;
        if (typeof val !== 'string') return;
        const norm = getNormalizedLangKey(lang);
        boilerPlates[norm] = val;
        if (norm === 'cpp') boilerPlates['c++'] = val;
        if (norm === 'python') boilerPlates.python3 = val;
        if (norm === 'javascript') boilerPlates.js = val;
    });

    // Normalize sample test cases
    const rawSample = q.testCases?.sample ||
        (Array.isArray(q.testCases) ? q.testCases.filter(tc => !tc.hidden && !tc.isHidden) : null) ||
        q.content?.sampleTestCases || q.sampleTestCases || q.sampleTests || [];
    const sampleTestCases = normalizeTestCaseArray(rawSample);

    // Normalize hidden test cases from all potential schemas
    let hidden = [];
    if (Array.isArray(q.testCases?.hidden) && q.testCases.hidden.length > 0) {
        hidden = normalizeTestCaseArray(q.testCases.hidden);
    } else if (Array.isArray(q.hiddenTestCases) && q.hiddenTestCases.length > 0) {
        hidden = normalizeTestCaseArray(q.hiddenTestCases);
    } else if (Array.isArray(q.hiddenTests) && q.hiddenTests.length > 0) {
        hidden = normalizeTestCaseArray(q.hiddenTests);
    } else if (Array.isArray(q.content?.testCases) && q.content.testCases.length > 0) {
        hidden = normalizeTestCaseArray(q.content.testCases);
    } else if (Array.isArray(q.testCases)) {
        const hList = q.testCases.filter(tc => tc.hidden || tc.isHidden);
        if (hList.length > 0) {
            hidden = normalizeTestCaseArray(hList);
        }
    } else if (Array.isArray(q.test_cases)) {
        const hList = q.test_cases.filter(tc => tc.hidden || tc.isHidden);
        if (hList.length > 0) {
            hidden = normalizeTestCaseArray(hList);
        }
    } else if (Array.isArray(q.hidden_test_cases) && q.hidden_test_cases.length > 0) {
        hidden = normalizeTestCaseArray(q.hidden_test_cases);
    }

    if (hidden.length === 0 && sampleTestCases.length > 0) {
        // Fallback: if no hidden test cases exist, use sample test cases for official grading
        hidden = sampleTestCases;
    }

    return {
        ...q,
        id,
        title,
        description,
        constraints,
        boilerPlates,
        boilerplates: boilerPlates,
        sampleTestCases,
        sampleTests: sampleTestCases,
        hiddenTestCases: hidden,
        hiddenTests: hidden,
        testCases: {
            ...(typeof q.testCases === 'object' && !Array.isArray(q.testCases) ? q.testCases : {}),
            sample: sampleTestCases,
            hidden: hidden
        }
    };
};

const CODING_ROUTE_BASE = '/student/coding';
const AUTO_SUBMIT_NOTICE_KEY = 'codingAutoSubmitNotice';

/**
 * DEFAULT_QUESTION_WEIGHT — Product default when assessment has no explicit per-question weight.
 *
 * WHEN THIS APPLIES:
 *   Assessment document supplies questions as plain string IDs: ["Q1","Q2","Q3"]
 *   No {id, weight} object provided in the assessment definition.
 *
 * WHEN IT MUST NOT BE USED:
 *   Admin creates a test with explicit per-question weights: [{id:"Q1",weight:10},{id:"Q2",weight:20}]
 *   In that case, collectIds() in loadAssessment() builds a weightMap and merges weights
 *   back onto resolvedQuestions BEFORE normalizeQuestion() runs. q.weight will be set,
 *   so q.weight || DEFAULT_QUESTION_WEIGHT uses q.weight correctly.
 *
 * SCORING FORMULA (per question):
 *   passes  = count of hidden test cases whose output matches expected
 *   total   = total hidden test cases for this question
 *   qScore  = (passes / total) × q.weight     ← NOT scoring.maxScore, NOT tc.weight sum
 *
 * THREE DIFFERENT WEIGHT CONCEPTS (must NOT be mixed):
 *   A. testCases.hidden[i].weight — per-test-case weight used ONLY in Practice scoring
 *   B. scoring.maxScore           — Q{id}.json intrinsic total (e.g. 117 for Q1)
 *   C. q.weight (this constant)   — assessment-level question marks, set by Admin
 *
 * @type {number}
 */
const DEFAULT_QUESTION_WEIGHT = 20;

export const isCodeBlankOrEmpty = (code) => {
    if (!code || typeof code !== 'string') return true;
    const trimmed = code.trim();
    if (trimmed === '') return true;
    const noComments = trimmed
        .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
        .replace(/#.*/g, '')
        .trim();
    return noComments === '';
};

const CodingAssessmentPage = ({ isEmbedded = false, testData = null, assessmentId = '', sectionId = '', secTimer = 0, onSectionSubmit = null, settings = {}, parentProctoringData = null, parentSettings = null }) => {
    const navigate = useNavigate();
    const { assessmentSlug } = useParams();

    // User data
    const [user, setUser] = useState(null);
    const [accessControl, setAccessControl] = useState(null);
    const [userAttempts, setUserAttempts] = useState({});



    // List view states
    const [availableAssessments, setAvailableAssessments] = useState([]);
    const [filteredAssessments, setFilteredAssessments] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterDifficulty, setFilterDifficulty] = useState('All');
    const [filterStatus, setFilterStatus] = useState('All');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Passkey states
    const [selectedAssessment, setSelectedAssessment] = useState(null);
    const [showPasskeyModal, setShowPasskeyModal] = useState(false);
    const [passkey, setPasskey] = useState('');
    const [passkeyError, setPasskeyError] = useState('');
    const [isValidatingPasskey, setIsValidatingPasskey] = useState(false);
    const [showInstructions, setShowInstructions] = useState(false);

    // Active workspace states
    const [currentAssessment, setCurrentAssessment] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
    const currentQuestion = questions[activeQuestionIndex] || null;

    // Canonical Question Identity: assessmentId + sectionId + questionId
    const getCanonicalQKey = useCallback((q = currentQuestion, idx = activeQuestionIndex) => {
        if (!q) return `q_${idx}`;
        const baseId = q.id || q.questionId || `q_${idx}`;
        const aId = testData?.assessmentId || assessmentId || currentAssessment?.id || assessmentSlug || 'exam';
        const sId = testData?.sectionId || sectionId || 'coding';
        return `${aId}__${sId}__${baseId}`;
    }, [currentQuestion, activeQuestionIndex, testData?.assessmentId, testData?.sectionId, assessmentId, sectionId, currentAssessment?.id, assessmentSlug]);

    // Isolated question state map: { [canonicalQKey]: { codeByLang, selectedLanguage, samplesPassedAll, sampleRunCode, runResults, evalResults, stdout, stderr, activeResultTab, isRunning, isEvaluating } }
    const [codingStateByQuestion, setCodingStateByQuestion] = useState({});
    const codingStateByQuestionRef = useRef({});
    codingStateByQuestionRef.current = codingStateByQuestion;

    const activeCanonicalQKeyRef = useRef('');
    const isSubmittingQuestionRef = useRef(false);
    const isRunningQuestionRef = useRef(false);

    const currentCanonicalQKey = getCanonicalQKey(currentQuestion, activeQuestionIndex);
    useEffect(() => {
        activeCanonicalQKeyRef.current = currentCanonicalQKey;
    }, [currentCanonicalQKey]);

    const [language, setLanguage] = useState('cpp');

    // Derived active question state
    const activeQState = codingStateByQuestion[currentCanonicalQKey] || {
        codeByLang: {},
        selectedLanguage: language || 'cpp',
        samplesPassedAll: false,
        sampleRunCode: '',
        runResults: null,
        evalResults: null,
        stdout: '',
        stderr: '',
        activeResultTab: 'output',
        isRunning: false,
        isEvaluating: false,
    };

    const editorRef = useRef(null);
    const [codeMap, setCodeMap] = useState({}); // Key: questionId_language -> Code text
    const codeMapRef = useRef(codeMap);
    const isSwitchingQuestionRef = useRef(false);
    const questionRunHistoryRef = useRef({});

    const getCodeStorageKey = useCallback(() => {
        const aId = testData?.assessmentId || assessmentId || testData?.id || currentAssessment?.id || assessmentSlug || 'default';
        const sId = testData?.sectionId || sectionId || 'coding';
        return `codingAssessmentCode_${aId}_${sId}`;
    }, [testData?.assessmentId, testData?.sectionId, assessmentId, sectionId, testData?.id, currentAssessment?.id, assessmentSlug]);

    useEffect(() => {
        codeMapRef.current = { ...codeMap, ...codeMapRef.current };
    }, [codeMap]);

    const [visitedQuestions, setVisitedQuestions] = useState({}); // questionId -> boolean
    const [bookmarkedQuestions, setBookmarkedQuestions] = useState({}); // questionId -> boolean
    const [questionScores, setQuestionScores] = useState({}); // questionId -> { score, passed, total }
    const [customInput, setCustomInput] = useState('');
    const [useCustomInput, setUseCustomInput] = useState(false);

    // Execution logs
    const [stdout, setStdout] = useState('');
    const [stderr, setStderr] = useState('');
    const [exitCode, setExitCode] = useState(null);
    const [isRunning, setIsRunning] = useState(false);
    const [isEvaluating, setIsEvaluating] = useState(false);
    const [evalProgressText, setEvalProgressText] = useState('');
    const [runResults, setRunResults] = useState(null); // Results for sample test runs
    const [evalResults, setEvalResults] = useState(null); // Results for hidden test runs
    const [activeResultTab, setActiveResultTab] = useState('output'); // 'output', 'console', 'input', 'results'

    // Reference UI States
    const [expandedTestCaseIndex, setExpandedTestCaseIndex] = useState(0);
    const [activeRightTab, setActiveRightTab] = useState('testcases'); // 'testcases' | 'solution'
    const [selectedTestCaseSet, setSelectedTestCaseSet] = useState('sample');
    const [editorTheme, setEditorTheme] = useState('vs-dark'); // 'vs-dark' | 'light'
    const [isEditorFullscreen, setIsEditorFullscreen] = useState(false);
    const [sampleRunBanner, setSampleRunBanner] = useState(null);
    const [showEditorialModal, setShowEditorialModal] = useState(false);
    const [showDiscussModal, setShowDiscussModal] = useState(false);

    // Timer & Proctoring
    const [startTime, setStartTime] = useState(null);
    const [remainingTime, setRemainingTime] = useState(0);
    const [testDuration, setTestDuration] = useState(0); // in seconds
    const [violationCount, setViolationCount] = useState(0);
    const [proctorWarning, setProctorWarning] = useState(null);
    const [isLockedOut, setIsLockedOut] = useState(false);
    const [lockoutReason, setLockoutReason] = useState('tab_switch');
    const [showSubmitModal, setShowSubmitModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    // 'evaluating' | 'submitting' | null — tracks which phase of the submit flow is active
    const [submitPhase, setSubmitPhase] = useState(null);
    const [autoSubmitNotice, setAutoSubmitNotice] = useState(null);
    const [proctoringData, setProctoringData] = useState({
        violationCount: 0,
        audioViolationCount: 0,
        violations: []
    });
    const [submissionSuccess, setSubmissionSuccess] = useState(null); // { score, percentage, perQuestion }

    /**
     * BUG FIXED (P0 duplicate submission): both autoSubmitAttempt and
     * handleFinalSubmit guarded only on the async `isSubmitting` state, and
     * autoSubmitAttempt is invoked from the countdown timer, the tab-switch
     * lockout AND the proctoring callback. Two of those firing in the same tick
     * both passed the check and ran the whole evaluate+submit pipeline twice.
     */
    const submitGuard = useRef(createSubmitGuard()).current;
    const [startCountdown, setStartCountdown] = useState(null); // null or number (seconds)

    // Custom Alert State
    const [alertConfig, setAlertConfig] = useState(null);

    // Question-Specific Output States
    const [questionResults, setQuestionResults] = useState({});
    const prevQuestionIndexRef = useRef(0);

    // Resizable pane & collapsible sidebar state
    const [isQuestionsCollapsed, setIsQuestionsCollapsed] = useState(false);
    const [leftPaneWidth, setLeftPaneWidth] = useState(38); // percentage for problem statement pane
    const [outputPaneHeight, setOutputPaneHeight] = useState(240); // pixels for test cases pane
    const isDraggingVertRef = useRef(false);
    const isDraggingHorizRef = useRef(false);
    const workspaceBodyRef = useRef(null);
    const rightPaneRef = useRef(null);

    const timingTrackerRef = useRef(null);
    if (!timingTrackerRef.current) {
        const initialTimings = readJSON("codingQuestionTiming", null) || readJSON("codingTimeSpentPerQ", {}) || {};
        timingTrackerRef.current = new QuestionTimingTracker(initialTimings, "codingQuestionTiming");
    }

    const [timeSpentPerQ, setTimeSpentPerQ] = useState(() => {
        // BUG FIXED (P1): a corrupt/truncated blob used to be swallowed here and
        // silently reset progress. readJSON validates and falls back explicitly.
        return readJSON("codingTimeSpentPerQ", {}) || {};
    });

    const [compilationCounts, setCompilationCounts] = useState(() => {
        // BUG FIXED (P1): a corrupt/truncated blob used to be swallowed here and
        // silently reset progress. readJSON validates and falls back explicitly.
        return readJSON("codingCompilationCounts", {}) || {};
    });

    const [questionSubmitTimes, setQuestionSubmitTimes] = useState(() => {
        // BUG FIXED (P1): a corrupt/truncated blob used to be swallowed here and
        // silently reset progress. readJSON validates and falls back explicitly.
        return readJSON("codingQuestionSubmitTimes", {}) || {};
    });

    const [questionStartTimes, setQuestionStartTimes] = useState(() => {
        // BUG FIXED (P1): a corrupt/truncated blob used to be swallowed here and
        // silently reset progress. readJSON validates and falls back explicitly.
        return readJSON("codingQuestionStartTimes", {}) || {};
    });

    useEffect(() => {
        // Throttled: these fire on every keystroke-driven state update and
        // synchronous localStorage writes were stalling the Monaco editor.
        throttledLocalStorageSet("codingTimeSpentPerQ", JSON.stringify(timeSpentPerQ), 3000);
    }, [timeSpentPerQ]);

    useEffect(() => {
        // Throttled: these fire on every keystroke-driven state update and
        // synchronous localStorage writes were stalling the Monaco editor.
        throttledLocalStorageSet("codingCompilationCounts", JSON.stringify(compilationCounts), 3000);
    }, [compilationCounts]);

    useEffect(() => {
        // Throttled: these fire on every keystroke-driven state update and
        // synchronous localStorage writes were stalling the Monaco editor.
        throttledLocalStorageSet("codingQuestionSubmitTimes", JSON.stringify(questionSubmitTimes), 3000);
    }, [questionSubmitTimes]);

    useEffect(() => {
        // Throttled: these fire on every keystroke-driven state update and
        // synchronous localStorage writes were stalling the Monaco editor.
        throttledLocalStorageSet("codingQuestionStartTimes", JSON.stringify(questionStartTimes), 3000);
    }, [questionStartTimes]);

    useEffect(() => {
        return () => {
            // Stop camera, mic, and AI when CodingAssessmentPage unmounts standalone
            if (!isEmbedded) {
                console.log('[CodingAssessmentPage] Component unmounted standalone. Cleaning up media & AI...');
                stopAllMediaAndAI();
            }
        };
    }, [isEmbedded]);

    useEffect(() => {
        // Delta-based question timing tracker:
        // When active question changes or test runs, tracker resumes for activeQuestionIndex.
        // Flushes elapsed delta on switch or unmount without causing 1000ms re-render churn.
        const isExamActive = !submissionSuccess && questions.length > 0 && activeQuestionIndex !== undefined;
        if (isExamActive && timingTrackerRef.current) {
            timingTrackerRef.current.start(activeQuestionIndex);
        }
        return () => {
            if (timingTrackerRef.current) {
                timingTrackerRef.current.flushCurrent();
            }
        };
    }, [submissionSuccess, questions.length, activeQuestionIndex]);

    useEffect(() => {
        const handleFlush = () => {
            if (timingTrackerRef.current) {
                timingTrackerRef.current.flushCurrent();
            }
        };
        window.addEventListener('beforeunload', handleFlush);
        document.addEventListener('visibilitychange', handleFlush);
        return () => {
            window.removeEventListener('beforeunload', handleFlush);
            document.removeEventListener('visibilitychange', handleFlush);
        };
    }, []);

    // Ref to latest onSectionSubmit
    const onSectionSubmitRef = useRef(onSectionSubmit);
    useEffect(() => {
        onSectionSubmitRef.current = onSectionSubmit;
    }, [onSectionSubmit]);

    // Embedded Mode helper to submit scores and code map
    const handleEmbeddedSectionSubmit = async (reason = '') => {
        try {
            saveCurrentEditorToMap();
            const finalScores = { ...questionScores };
            const allAnswers = {};
            let totalEarnedWeight = 0;
            let totalMaxWeight = 0;

            for (const q of questions) {
                const qId = q.id || q.questionId;
                const qWeight = q.weight || DEFAULT_QUESTION_WEIGHT;
                totalMaxWeight += qWeight;

                const qKey = getCanonicalQKey(q);
                const qLang = codingStateByQuestionRef.current[qKey]?.selectedLanguage || language || 'cpp';
                const code = (editorRef.current && currentQuestion?.id === qId)
                    ? editorRef.current.getValue()
                    : (codingStateByQuestionRef.current[qKey]?.codeByLang?.[qLang] ||
                       codeMapRef.current[`${qId}_${language}`] ||
                       codeMapRef.current[`${qId}_cpp`] ||
                       codeMapRef.current[`${qId}_c`] ||
                       codeMapRef.current[`${qId}_python`] ||
                       codeMapRef.current[`${qId}_java`] ||
                       codeMapRef.current[`${qId}_javascript`] ||
                       codeMap[`${qId}_${language}`] || "");
                allAnswers[qId] = code;

                const hasEvaluatedScore = finalScores[qId] && 
                                          finalScores[qId].testResults && 
                                          finalScores[qId].testResults.length > 0 && 
                                          finalScores[qId].submitted && 
                                          typeof finalScores[qId].score === 'number' && 
                                          finalScores[qId].total > 0;
                
                if (hasEvaluatedScore) {
                    totalEarnedWeight += finalScores[qId].score;
                } else {
                    // Unsubmitted question: no final evaluation needed. Recorded with 0 score instantly.
                    const hidden = getQuestionHiddenTestCases(q);
                    finalScores[qId] = {
                        score: 0,
                        percentage: 0,
                        passed: 0,
                        total: hidden.length,
                        submitted: false,
                        status: 'Unattempted',
                        code: code || "",
                        solution: code || "",
                        language: language,
                        testResults: []
                    };
                }
            }

            const targetSubmit = onSectionSubmitRef.current || onSectionSubmit;
            if (typeof targetSubmit === 'function') {
                totalEarnedWeight = 0;
                totalMaxWeight = 0;

                // Stop question timing tracker and capture final per-question elapsed timings
                if (timingTrackerRef.current) {
                    timingTrackerRef.current.stop();
                }
                const questionTiming = timingTrackerRef.current
                    ? timingTrackerRef.current.getQuestionTiming(questions)
                    : {};
                const activeTimeSpentMap = timingTrackerRef.current
                    ? timingTrackerRef.current.getRawTimeMap(questions)
                    : timeSpentPerQ;

                const codingDetails = questions.map((q, idx) => {
                    const qId = q.id || q.questionId || `q_${idx}`;
                    const qKey = `Q${idx + 1}`;
                    const scoreObj = finalScores[qId] || questionScores[qId] || { score: 0, percentage: 0, passed: 0, total: 0 };
                    const passed = scoreObj.passed || scoreObj.testPassedCount || 0;
                    const total = scoreObj.total || scoreObj.totalTestCases || (q.testCases ? q.testCases.length : 0);
                    const status = scoreObj.status || (total > 0 ? (passed === total ? "Accepted" : (passed > 0 ? "Partial" : "Wrong Answer")) : "Wrong Answer");
                    
                    const userCode = scoreObj.code || scoreObj.solution || allAnswers[qId] || getCurrentCode(qId, language) || codeMapRef.current[`${qId}_${language}`] || codeMap[`${qId}_${language}`] || "";
                    const qLang = scoreObj.language || language || 'c';
                    const testResults = scoreObj.testResults || questionRunHistoryRef.current[qId]?.results || [];

                    totalEarnedWeight += scoreObj.score || 0;
                    totalMaxWeight += q.weight || DEFAULT_QUESTION_WEIGHT;

                    const qTimeSpent = questionTiming[qKey]?.timeSpentSeconds ?? (activeTimeSpentMap[qId] || 0);
                    const qTimeFormatted = questionTiming[qKey]?.timeSpentFormatted;

                    return buildCodingSubmission({
                        questionId: qId,
                        questionNumber: idx + 1,
                        questionKey: qKey,
                        problemTitle: q.name || q.title || `Question ${idx + 1}`,
                        title: q.name || q.title || `Question ${idx + 1}`,
                        difficulty: q.difficulty || 'Easy',
                        language: qLang,
                        code: userCode,
                        solution: userCode,
                        status,
                        testsPassed: passed,
                        totalTests: total,
                        score: scoreObj.score || 0,
                        maxScore: q.weight || DEFAULT_QUESTION_WEIGHT,
                        percentage: scoreObj.percentage || 0,
                        compilationCount: compilationCounts[qId] || 0,
                        attempts: compilationCounts[qId] || 0,
                        timeComplexity: q.timeComplexity ?? '',
                        spaceComplexity: q.spaceComplexity ?? '',
                        testResults: testResults,
                        timeSpentSeconds: qTimeSpent,
                        timeSpentFormatted: qTimeFormatted,
                        submittedAt: questionSubmitTimes[qId] || scoreObj.submittedAt || new Date().toISOString()
                    });
                });

                // ── Timing data ──
                const sectionEndISO = new Date().toISOString();
                const elapsedSecs = getElapsedSeconds();
                const sectionStartISO = (() => {
                    const stored = sessionStorage.getItem('codingSecStartTime');
                    if (stored) return stored;
                    const elapsedMs = elapsedSecs * 1000;
                    return new Date(Date.now() - elapsedMs).toISOString();
                })();
                sessionStorage.removeItem('codingSecStartTime');

                await targetSubmit({
                    answers: allAnswers,
                    timeSpentPerQ: activeTimeSpentMap,
                    questionTiming: questionTiming,
                    completed: finalScores,
                    coding: codingDetails,
                    questions: codingDetails,
                    score: totalEarnedWeight,
                    maxScore: totalMaxWeight,
                    totalQuestions: questions.length,
                    autoSubmitted: reason ? true : false,
                    tabViolation: reason === 'navigation' ? true : false,
                    // Timing fields for reports and MSA section aggregation
                    timeTaken: elapsedSecs,
                    timeTakenSeconds: elapsedSecs,
                    startedAt: sectionStartISO,
                    timeEndedISO: sectionEndISO,
                });
            }
        } catch (err) {
            console.error("Embedded submit failure:", err);
            toast.error(`Section submission error: ${err.message}`);
        }
    };

    // Sync embedded questions and assessment settings
    useEffect(() => {
        if (isEmbedded && testData && testData.questions) {
            let isCancelled = false;
            const syncEmbeddedQuestions = async () => {
                if (!Array.isArray(testData.questions) || testData.questions.length === 0) return;

                let fullQuestions = testData.questions;
                const isStub = fullQuestions.some(q => !isCompleteQuestion(q));
                if (isStub) {
                    try {
                        const { fetchQuestionsForContest } = await import('../services/codingQuestionBankService');
                        const resolved = await fetchQuestionsForContest(fullQuestions);
                        if (resolved && resolved.length > 0) {
                            fullQuestions = resolved;
                        }
                    } catch (e) {
                        console.warn('[CodingAssessmentPage] Error resolving embedded question stubs:', e);
                    }
                }

                if (isCancelled) return;
                const normalized = fullQuestions.map(normalizeQuestion);
                setQuestions(normalized);
                if (normalized.length > 0) {
                    setVisitedQuestions(prev => ({ ...prev, [normalized[0].id]: true }));
                }
                setLoading(false);
            };

            if (testData.questions.length > 0) {
                const currIds = (questions || []).map(q => q.id || q.questionId).join('|');
                const nextIds = (testData.questions || []).map(q => q.id || q.questionId).join('|');
                if (!currIds || currIds !== nextIds) {
                    syncEmbeddedQuestions();
                }
            }

            // Sync user details if not set
            if (!user) {
                const authData = JSON.parse(localStorage.getItem('auth_data') ?? '{}');
                setUser(authData);
            }

            // Sync settings to currentAssessment avoiding loops
            const proctored = settings.proctored || false;
            const audioProctored = settings.audioProctored || false;
            const maxViolations = settings.maxViolations || 200;

            if (!currentAssessment ||
                currentAssessment.proctored !== proctored ||
                currentAssessment.audioProctored !== audioProctored ||
                currentAssessment.maxViolations !== maxViolations) {
                setCurrentAssessment({
                    id: 'embedded-section',
                    name: 'Coding Section',
                    maxViolations,
                    proctored,
                    audioProctored
                });
            }

            return () => { isCancelled = true; };
        }
    }, [isEmbedded, testData?.questions, settings, user, currentAssessment]);

    // Initialize question coding states & boilerplates (both embedded and standalone)
    useEffect(() => {
        if (questions.length === 0) return;

        const storageKey = getCodeStorageKey();
        let savedStateMap = {};
        try {
            const raw = localStorage.getItem(storageKey);
            if (raw) savedStateMap = JSON.parse(raw);
        } catch (_) {}

        const availableLanguages = ["cpp", "c", "python", "java", "javascript"];
        // Priority: current in-memory ref takes precedence over saved localStorage state!
        const nextCodingState = { ...savedStateMap, ...codingStateByQuestionRef.current };
        const nextCodeMap = { ...codeMapRef.current };

        questions.forEach((q, idx) => {
            const qKey = getCanonicalQKey(q, idx);
            const existingQState = nextCodingState[qKey] || {};
            const existingCodes = existingQState.codeByLang || {};
            const populatedCodes = { ...existingCodes };

            availableLanguages.forEach(lang => {
                const legacyKey = `${q.id}_${lang}`;
                if (!populatedCodes[lang]) {
                    if (existingCodes[lang]) {
                        populatedCodes[lang] = existingCodes[lang];
                    } else if (nextCodeMap[legacyKey]) {
                        populatedCodes[lang] = nextCodeMap[legacyKey];
                    } else {
                        populatedCodes[lang] = getQuestionBoilerplate(q, lang);
                    }
                }
                nextCodeMap[legacyKey] = populatedCodes[lang];
                nextCodeMap[`${qKey}_${lang}`] = populatedCodes[lang];
            });

            nextCodingState[qKey] = {
                codeByLang: populatedCodes,
                selectedLanguage: (codingStateByQuestionRef.current[qKey]?.selectedLanguage) || existingQState.selectedLanguage || language || 'cpp',
                samplesPassedAll: existingQState.samplesPassedAll || false,
                sampleRunCode: existingQState.sampleRunCode || '',
                runResults: existingQState.runResults || null,
                evalResults: existingQState.evalResults || null,
                stdout: existingQState.stdout || '',
                stderr: existingQState.stderr || '',
                activeResultTab: existingQState.activeResultTab || 'output',
                isRunning: false,
                isEvaluating: false,
            };
        });

        codingStateByQuestionRef.current = nextCodingState;
        setCodingStateByQuestion(nextCodingState);
        codeMapRef.current = nextCodeMap;
        setCodeMap(nextCodeMap);
    }, [questions, getCanonicalQKey, getCodeStorageKey]);

    const hasTimerStartedRef = useRef(false);
    const autoSubmitAttemptRef = useRef(null);

    // Synchronize section timer in embedded mode
    useEffect(() => {
        if (isEmbedded) {
            setRemainingTime(secTimer);
            if (secTimer > 0) {
                hasTimerStartedRef.current = true;
            }
            if (secTimer <= 0 && hasTimerStartedRef.current) {
                handleFinalSubmit();
            }
        }
    }, [secTimer, isEmbedded]);

    // Vertical divider drag (problem pane vs right workspace split)
    const startVertDrag = useCallback((e) => {
        e.preventDefault();
        isDraggingVertRef.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        const startX = e.clientX;
        const startWidth = leftPaneWidth;
        const body = workspaceBodyRef.current;
        const totalW = body ? body.getBoundingClientRect().width : window.innerWidth;

        const onMove = (mv) => {
            if (!isDraggingVertRef.current) return;
            const delta = mv.clientX - startX;
            const newPct = Math.min(70, Math.max(20, startWidth + (delta / totalW) * 100));
            setLeftPaneWidth(newPct);
        };
        const onUp = () => {
            isDraggingVertRef.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [leftPaneWidth]);

    useEffect(() => {
        if (currentQuestion && currentQuestion.id) {
            setQuestionStartTimes(prev => {
                if (prev[currentQuestion.id]) return prev;
                return { ...prev, [currentQuestion.id]: new Date().toISOString() };
            });
        }
    }, [currentQuestion]);

    // Horizontal divider drag (editor vs test cases split within right pane)
    const startHorizDrag = useCallback((e) => {
        e.preventDefault();
        isDraggingHorizRef.current = true;
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
        const startY = e.clientY;
        const startH = outputPaneHeight;
        const rp = rightPaneRef.current;
        const totalH = rp ? rp.getBoundingClientRect().height : 600;

        const onMove = (mv) => {
            if (!isDraggingHorizRef.current) return;
            const delta = startY - mv.clientY; // dragging up = larger testcases
            const newH = Math.min(totalH * 0.75, Math.max(100, startH + delta));
            setOutputPaneHeight(Math.round(newH));
        };
        const onUp = () => {
            isDraggingHorizRef.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [outputPaneHeight]);

    const showCustomAlert = useCallback((title, message, type = 'info', onClose = null) => {
        setAlertConfig({ title, message, type, onClose });
    }, []);

    // Synchronize console logs and results for the current active question from isolated state
    useEffect(() => {
        const qState = codingStateByQuestion[currentCanonicalQKey];
        if (qState) {
            setStdout(qState.stdout || '');
            setStderr(qState.stderr || '');
            setRunResults(qState.runResults || null);
            setEvalResults(qState.evalResults || null);
            setActiveResultTab(qState.activeResultTab || 'output');
            if (qState.selectedLanguage && qState.selectedLanguage !== language) {
                setLanguage(qState.selectedLanguage);
            }
        } else {
            setStdout('');
            setStderr('');
            setRunResults(null);
            setEvalResults(null);
            setActiveResultTab('output');
        }
    }, [currentCanonicalQKey, codingStateByQuestion, language]);

    // Set auto-submit notice message
    const setAutoSubmitMessage = useCallback((msg) => {
        sessionStorage.setItem(AUTO_SUBMIT_NOTICE_KEY, msg);
        localStorage.setItem(AUTO_SUBMIT_NOTICE_KEY, msg);
        setAutoSubmitNotice(msg);
    }, []);

    // Get time taken so far
    const getElapsedSeconds = useCallback(() => {
        if (!startTime) return 0;
        return Math.round((timeService.now() - startTime) / 1000);
    }, [startTime]);

    // Restore state from reload / exit with 5-minute grace check
    const restoreAssessmentState = useCallback(() => {
        try {
            const storedStartTime = localStorage.getItem("codingAssessmentStartTime");
            const storedDuration = localStorage.getItem("codingAssessmentTimer");
            const storedData = localStorage.getItem("codingAssessmentData");
            const storedCodeMap = localStorage.getItem("codingAssessmentCode");
            const storedLastActive = localStorage.getItem("codingLastActiveTime");

            if (!storedStartTime || !storedDuration || !storedData) {
                return;
            }

            const now = timeService.now();
            const lastActiveMs = parseInt(storedLastActive || storedStartTime, 10);
            const elapsedOfflineSec = Math.floor((now - lastActiveMs) / 1000);

            if (elapsedOfflineSec > 300) {
                console.warn(`[CodingAssessmentPage] Offline exit (${elapsedOfflineSec}s) exceeded 5-minute grace period (300s).`);
                toast.warning("Your assessment was auto-submitted because your offline window exceeded the 5-minute grace period.");
                autoSubmitAttemptRef.current?.("grace-period-exceeded-5min");
                return;
            }

            const startTimeMs = parseInt(storedStartTime, 10);
            const durationSec = parseInt(storedDuration, 10);
            const { assessment, questions } = JSON.parse(storedData);

            const totalElapsed = Math.floor((now - startTimeMs) / 1000);
            const remaining = Math.max(0, durationSec - totalElapsed);

            if (remaining <= 0) {
                autoSubmitAttemptRef.current?.("grace-expired");
                return;
            }

            const normalizedQuestions = (questions || []).map(normalizeQuestion);

            setCurrentAssessment(assessment);
            setQuestions(normalizedQuestions);
            setStartTime(startTimeMs);
            setTestDuration(durationSec);
            setRemainingTime(remaining);
            
            if (storedCodeMap) {
                try {
                    setCodeMap(typeof storedCodeMap === 'string' ? JSON.parse(storedCodeMap) : storedCodeMap);
                } catch (_) {
                    setCodeMap({});
                }
            } else {
                // Initialize default boilerplate codes for all questions and all languages
                const initialCodeMap = {};
                const availableLanguages = ["cpp", "c", "python", "java", "javascript"];
                normalizedQuestions.forEach(q => {
                    const qId = q.id || q.questionId;
                    availableLanguages.forEach(lang => {
                        initialCodeMap[`${qId}_${lang}`] = getQuestionBoilerplate(q, lang);
                    });
                });
                setCodeMap(initialCodeMap);
            }

            // Restore active indexes and color visited questions
            setActiveQuestionIndex(0);
            if (normalizedQuestions && normalizedQuestions.length > 0) {
                const firstQId = normalizedQuestions[0]?.id || normalizedQuestions[0]?.questionId;
                if (firstQId) {
                    setVisitedQuestions({ [firstQId]: true });
                }
            }
        } catch (e) {
            console.error("Error restoring local state:", e);
        }
    }, []);

    // Load initial data
    useEffect(() => {
        if (isEmbedded) return; // Skip standard loading flow
        
        const loadInitialData = async () => {
            try {
                const authData = JSON.parse(localStorage.getItem("auth_data") ?? "{}");
                if (!authData.Email) {
                    navigate("/login");
                    return;
                }
                setUser(authData);

                // Redirect to unified student dashboard if no active session exists
                let hasPending = localStorage.getItem("codingAssessmentData");

                // If local storage was cleared (e.g. system power off / reboot in PyQt SEB), attempt Firestore restore
                if (!hasPending && assessmentSlug) {
                    const liveUid = auth?.currentUser?.uid ?? authData.uid ?? '';
                    const tenantId = authData.tenantId || authData.tenantId || authData.tenantId || (authData.College  ?? '');
                    if (liveUid && tenantId) {
                        try {
                            const canonDocPath = `assessmentResults/${tenantId}/${assessmentSlug}/${liveUid}`;
                            const remoteSnap = await getDoc(doc(db, canonDocPath));
                            if (remoteSnap.exists() && !remoteSnap.data().completed) {
                                const remoteData = remoteSnap.data();
                                const now = timeService.now();
                                const startedAtMs = remoteData.timeStarted?.toDate 
                                    ? remoteData.timeStarted.toDate().getTime() 
                                    : (remoteData.timeStarted || (remoteData.startedAt ? new Date(remoteData.startedAt).getTime() : now));
                                const lastProgressAtMs = remoteData.lastProgressAt?.toDate
                                    ? remoteData.lastProgressAt.toDate().getTime()
                                    : (remoteData.lastProgressAtISO ? new Date(remoteData.lastProgressAtISO).getTime() : startedAtMs);
                                const elapsedOfflineSec = Math.floor((now - lastProgressAtMs) / 1000);

                                if (elapsedOfflineSec <= 300) {
                                    console.log('[CodingAssessmentPage] Restoring remote attempt from Firestore:', canonDocPath);
                                    let resolvedQuestions = [];
                                    try {
                                        const lookupKey = remoteData.assessmentId || assessmentSlug;
                                        const directSnap = await getDoc(doc(db, 'assessments', lookupKey));
                                        if (directSnap.exists()) {
                                            const aData = directSnap.data();
                                            resolvedQuestions = aData.challenges || aData.questions || [];
                                        } else {
                                            const cdnRes = await fetchContentJSON(remoteData.url || remoteData.cdnUrl || `coding/testbank/${assessmentSlug}.json`);
                                            if (cdnRes) {
                                                resolvedQuestions = cdnRes.questions || cdnRes.challenges || [];
                                            }
                                        }
                                    } catch (_) {}

                                    const durationSec = (remoteData.duration || 30) * 60;
                                    localStorage.setItem("codingAssessmentStartTime", startedAtMs.toString());
                                    localStorage.setItem("codingAssessmentTimer", durationSec.toString());
                                    localStorage.setItem("codingLastActiveTime", now.toString());
                                    if (remoteData.codeMap) {
                                        localStorage.setItem("codingAssessmentCode", JSON.stringify(remoteData.codeMap));
                                    }
                                    localStorage.setItem("codingAssessmentData", JSON.stringify({
                                        assessment: {
                                            id: remoteData.assessmentId || assessmentSlug,
                                            name: remoteData.assessmentTitle || 'Coding Assessment',
                                            duration: remoteData.duration || 30
                                        },
                                        questions: resolvedQuestions
                                    }));
                                    hasPending = localStorage.getItem("codingAssessmentData");
                                }
                            }
                        } catch (remoteErr) {
                            console.warn('[CodingAssessmentPage] Remote restore error:', remoteErr);
                        }
                    }
                }

                if (!hasPending) {
                    navigate("/student/dashboard", { replace: true });
                    return;
                }

                // If active test session exists, restore immediately for zero-latency launch
                if (hasPending && assessmentSlug) {
                    const isNewLaunch = localStorage.getItem("codingAssessmentNewLaunch") === "true";
                    if (isNewLaunch) {
                        localStorage.removeItem("codingAssessmentNewLaunch");
                        const now = timeService.now();
                        localStorage.setItem("codingAssessmentStartTime", (now + 10000).toString());
                        setStartCountdown(10);
                    }
                    restoreAssessmentState();
                    setLoading(false);
                }

                // Background fetch access control (non-blocking)
                DataService.getAccessControl().then(accessControlData => {
                    setAccessControl(accessControlData);
                }).catch(() => {});
            } catch (err) {
                console.error("Error initializing coding assessment list:", err);
                setError("Failed to load assessments. Please try again.");
            } finally {
                setLoading(false);
            }
        };

        loadInitialData();

        // Check for any auto-submit notices
        const notice = localStorage.getItem(AUTO_SUBMIT_NOTICE_KEY);
        if (notice) {
            setAutoSubmitNotice(notice);
            localStorage.removeItem(AUTO_SUBMIT_NOTICE_KEY);
        }
    }, [navigate, assessmentSlug, restoreAssessmentState]);

    // Start countdown timer effect
    useEffect(() => {
        if (startCountdown === null) return;

        if (startCountdown <= 0) {
            // Countdown finished! Start the actual test timer
            setStartTime(timeService.now());
            setStartCountdown(null);
            return;
        }

        const timer = setTimeout(() => {
            setStartCountdown(prev => prev - 1);
        }, 1000);

        return () => clearTimeout(timer);
    }, [startCountdown]);


    // Fetch and filter coding assessments based on allowed modules
    const loadAvailableAssessments = async (accessControlData, userData) => {
        try {
            if (!accessControlData?.courses?.assessments) {
                setAvailableAssessments([]);
                setFilteredAssessments([]);
                return;
            }

            const departmentAccess = accessControlData?.access_control?.colleges?.[userData.College]?.[userData.Year]?.[userData.Department];
            if (!departmentAccess) {
                setAvailableAssessments([]);
                setFilteredAssessments([]);
                return;
            }

            const allowedModuleIds = departmentAccess.allowed_modules || [];

            const extractAllModules = (course) => {
                if (!course) return {};
                const modules = {};
                if (course.modules) {
                    Object.assign(modules, course.modules);
                }
                if (course.subcourses) {
                    Object.values(course.subcourses).forEach(sub => {
                        if (sub.modules) {
                            Object.assign(modules, sub.modules);
                        }
                    });
                }
                return modules;
            };

            const codingModules = extractAllModules(accessControlData?.courses?.assessments);

            const accessible = Object.entries(codingModules)
                .filter(([key, module]) => {
                    const isPremiumUser = Boolean(userData?.isPremium);
                    const isPremiumModule = !!module.isPremium;
                    const premiumAccess = !isPremiumModule || isPremiumUser;
                    return allowedModuleIds.includes(module.id) && premiumAccess;
                })
                .map(([key, module]) => {
                    // Derive the JSON file path for fetching questions
                    let finalUrl;
                    const moduleSlug = module.slug;
                    const moduleUrl = module.url ?? '';

                    if (moduleUrl.endsWith('.json')) {
                        // Already a direct JSON path (e.g. HackerRank-style stored locally)
                        finalUrl = moduleUrl;
                    } else if (moduleSlug) {
                        // Internal coding assessment: use the slug to build local JSON path
                        finalUrl = `/coding/testbank/${moduleSlug}.json`;
                    } else if (moduleUrl.startsWith('/student/coding/')) {
                        // URL is the routing path — derive slug from the last segment
                        const slugFromUrl = moduleUrl.split('/').filter(Boolean).pop();
                        finalUrl = `/coding/testbank/${slugFromUrl}.json`;
                    } else {
                        // Fallback: slugify the module name (for older HackerRank entries)
                        finalUrl = `/coding/testbank/${slugify(module.name || key)}.json`;
                    }

                    return {
                        key,
                        id: module.id,
                        name: module.name,
                        url: finalUrl,
                        passkey: module.passkey,
                        schedule: module.schedule,
                        difficulty: module.difficulty || 'Medium',
                        duration: module.duration_minutes || 60,
                        slug: module.slug || slugify(module.id || module.name || key),
                        languages: module.languages || ["c", "cpp", "java", "python"],
                        proctored: module.proctored,
                        audioProctored: module.audioProctored,
                        maxViolations: module.maxViolations,
                        maxAudioViolations: module.maxAudioViolations,
                        questionIds: module.questionIds || (Array.isArray(module.questions) ? module.questions : []),
                        questions: Array.isArray(module.questions) ? module.questions.length : (typeof module.questions === 'number' ? module.questions : (module.questionIds?.length || 0))
                    };
                });

            setAvailableAssessments(accessible);
            setFilteredAssessments(accessible);
        } catch (err) {
            console.error("Error mapping allowed modules:", err);
        }
    };

    // Filter available assessments
    useEffect(() => {
        let filtered = [...availableAssessments];

        if (searchTerm.trim()) {
            const query = searchTerm.toLowerCase();
            filtered = filtered.filter(a => 
                a.name.toLowerCase().includes(query) || 
                a.difficulty.toLowerCase().includes(query)
            );
        }

        if (filterDifficulty !== 'All') {
            filtered = filtered.filter(a => a.difficulty.toLowerCase() === filterDifficulty.toLowerCase());
        }

        if (filterStatus !== 'All') {
            filtered = filtered.filter(a => {
                const isCompleted = userAttempts[a.id]?.completed === true;
                if (filterStatus === 'Completed') return isCompleted;
                if (filterStatus === 'Available') return !isCompleted;
                return true;
            });
        }

        setFilteredAssessments(filtered);
    }, [searchTerm, filterDifficulty, filterStatus, availableAssessments, userAttempts]);

    // Fetch assessment questions JSON or load from Firestore
    const fetchAssessmentJSON = async (url, assessmentObj = null) => {
        try {
            // 1. Primary Source of Truth: Check Firebase Firestore assessments/{slug} or assessments/{id}
            const candidateKey = assessmentObj?.slug || assessmentObj?.test_slug || assessmentObj?.id || assessmentObj?.assessmentId || (url && !url.includes('/') && !url.endsWith('.json') ? url : null);
            if (candidateKey && typeof candidateKey === 'string' && !candidateKey.startsWith('http')) {
                try {
                    const directSnap = await getDoc(doc(db, 'assessments', candidateKey));
                    if (directSnap.exists()) {
                        const data = directSnap.data();
                        console.log(`[CodingAssessmentPage] Loaded assessment "${candidateKey}" directly from Firestore`);
                        const rawQ = data.challenges || data.questions || data.content?.questions || [];
                        return {
                            ...data,
                            questions: rawQ,
                            challenges: rawQ
                        };
                    }
                    const qSnap = await getDocs(query(collection(db, 'assessments'), where('slug', '==', candidateKey)));
                    if (!qSnap.empty) {
                        const data = qSnap.docs[0].data();
                        console.log(`[CodingAssessmentPage] Loaded assessment by slug "${candidateKey}" from Firestore`);
                        const rawQ = data.challenges || data.questions || data.content?.questions || [];
                        return {
                            ...data,
                            questions: rawQ,
                            challenges: rawQ
                        };
                    }
                } catch (fsErr) {
                    console.warn(`[CodingAssessmentPage] Firestore assessment fetch error for "${candidateKey}":`, fsErr);
                }
            }

            let cleanUrl = url;
            if (url && url.startsWith('http')) {
                if (url.includes('/seed-contents/main/')) {
                    cleanUrl = url.split('/seed-contents/main/')[1];
                } else if (url.includes('/SEEDDB/main/')) {
                    cleanUrl = url.split('/SEEDDB/main/')[1];
                } else if (url.includes('/contents/')) {
                    cleanUrl = url.split('/contents/')[1];
                }
            }
            // 2. Try local fetch first
            if (cleanUrl) {
                const localUrl = `${LOCAL_BASE_URL}${cleanUrl.startsWith('/') ? '' : '/'}${cleanUrl}`;
                try {
                    const response = await fetch(localUrl);
                    if (response.ok) return await response.json();
                } catch (err) {
                    console.log("Local JSON fetch failed, trying GitHub repository fallback");
                }

                // 3. Authenticated fallback via the server-side content proxy.
                try {
                    const proxied = await fetchContentJSON(cleanUrl, { localFirst: false });
                    if (proxied !== undefined) return proxied;
                } catch (_) {}
            }

            // 4. Try local contents as last resort if url looks like a path
            if (url && (url.includes('/') || url.endsWith('.json'))) {
                const cleanUrl = url.startsWith('/') ? url.substring(1) : url;
                const localRes = await fetch(`${LOCAL_BASE_URL}/${cleanUrl}`);
                if (localRes.ok) return await localRes.json();
            }

            return {};
        } catch (err) {
            console.error("All assessment fetch attempts failed:", err);
            return {};
        }
    };

    // Check Schedule
    const checkSchedule = (schedule) => {
        if (!schedule || !schedule.startDate || !schedule.startTime) return { allowed: true };
        
        const now = timeService.getNow();
        const start = new Date(schedule.startDate + 'T' + schedule.startTime);
        const end = new Date(schedule.endDate + 'T' + schedule.endTime);

        if (now < start) {
            return {
                allowed: false,
                reason: `This assessment will unlock on ${start.toLocaleDateString()} at ${start.toLocaleTimeString()}`
            };
        }
        if (now > end) {
            return {
                allowed: false,
                reason: `This assessment ended on ${end.toLocaleDateString()} at ${end.toLocaleTimeString()}`
            };
        }
        return { allowed: true };
    };

    // Handle selection and trigger passkey modal or start directly
    const handleSelectAssessment = async (assessment) => {
        setSelectedAssessment(assessment);
        setError(null);
        setPasskey('');
        setPasskeyError('');

        // Block if already completed (from cached userAttempts)
        if (userAttempts[assessment.id]?.completed) {
            setError("You have already completed this assessment. Multiple attempts are not allowed.");
            return;
        }

        // Live check against Firestore (catches edge cases where cache may be stale)
        try {
            const check = await CodingAssessmentService.checkExistingAttempt(
                user.email,
                assessment.id,
                user.college,
                user.year,
                user.department
            );
            if (check.exists && check.completed) {
                // Update local cache so UI reflects this immediately
                setUserAttempts(prev => ({ ...prev, [assessment.id]: { ...prev[assessment.id], completed: true } }));
                setError("You have already completed this assessment. Multiple attempts are not allowed.");
                return;
            }
        } catch (checkErr) {
            // Non-blocking — network errors should not prevent the student from starting
            console.warn('[CodingAssessmentPage] Pre-selection attempt check failed (non-blocking):', checkErr.message);
        }

        // Verify schedule bounds
        const scheduleCheck = checkSchedule(assessment.schedule);
        if (!scheduleCheck.allowed) {
            setError(scheduleCheck.reason);
            return;
        }

        if (assessment.passkey) {
            setShowPasskeyModal(true);
        } else {
            // If no passkey but proctored, show camera instructions first
            const isProctored = assessment && (
                assessment.proctored === true ||
                assessment.proctored === 1 ||
                assessment.proctored === "1" ||
                assessment.proctored === "true"
            );
            if (isProctored) {
                setSelectedAssessment(assessment);
                setShowInstructions(true);
            } else {
                await startAssessment(assessment);
            }
        }
    };

    // Validate passkey
    const handleValidatePasskey = async () => {
        if (!passkey.trim()) {
            setPasskeyError("Please enter the passkey");
            return;
        }
        
        console.log('[CodingAssessmentPage] Validating passkey for:', selectedAssessment?.name);
        console.log('[CodingAssessmentPage] Selected Assessment Object:', selectedAssessment);
        
        if (passkey.trim() === selectedAssessment.passkey) {
            console.log('[CodingAssessmentPage] Passkey matched successfully!');
            setShowPasskeyModal(false);
            
            // If the assessment is proctored, show camera/guidelines instructions first
            const isProctored = selectedAssessment && (
                selectedAssessment.proctored === true ||
                selectedAssessment.proctored === 1 ||
                selectedAssessment.proctored === "1" ||
                selectedAssessment.proctored === "true"
            );
            
            console.log('[CodingAssessmentPage] Proctoring check result (isProctored):', isProctored);
            
            if (isProctored) {
                console.log('[CodingAssessmentPage] Showing proctoring guidelines instructions modal...');
                setShowInstructions(true);
            } else {
                console.log('[CodingAssessmentPage] Proctoring disabled. Launching test workspace directly...');
                await startAssessment(selectedAssessment);
            }
        } else {
            console.warn('[CodingAssessmentPage] Passkey validation failed. Incorrect passkey entered.');
            setPasskeyError("Incorrect passkey. Please try again.");
            setPasskey('');
        }
    };

    const handleCancelPrelaunch = () => {
        // Stop camera stream
        if (window.cameraStream) {
            try {
                window.cameraStream.getTracks().forEach(track => {
                    track.onended = null;
                    track.stop();
                });
            } catch (e) {
                console.warn('[CodingAssessmentPage] Error stopping camera stream on cancel:', e);
            }
            window.cameraStream = null;
        }
        setStartCountdown(null);
        setCurrentAssessment(null);
        setQuestions([]);
        setLoading(false);
    };

    // Start assessment workspace
    const startAssessment = async (assessment) => {
        setLoading(true);
        setError(null);

        try {
            // 1. Double check duplicate attempts (best-effort — permission errors are non-blocking)
            try {
                const check = await CodingAssessmentService.checkExistingAttempt(
                    user.email,
                    assessment.id,
                    user.college,
                    user.year,
                    user.department
                );
                if (check.exists && check.completed) {
                    setError("You have already completed this coding assessment. Access is denied.");
                    setLoading(false);
                    return;
                }
            } catch (dupErr) {
                // Firestore permission / network error — allow test to proceed offline
                console.warn('[CodingAssessmentPage] Duplicate check failed (non-blocking):', dupErr.message);
            }

            // 2. Fetch assessment question set JSON
            let data = {};
            try {
                if (assessment.url || assessment.id || assessment.slug) {
                    data = await fetchAssessmentJSON(assessment.url, assessment);
                }
            } catch (err) {
                console.warn("Failed to fetch assessment JSON file, using access_control data:", err.message);
            }

            // Collect questionIds from all sources, preserving assessment-level weights.
            // Q{id}.json files do NOT have a top-level `weight` field — weight is always
            // supplied by the assessment/test document. collectIds() builds a weightMap
            // so that assessment weights survive the fetchQuestionsForContest() round-trip.
            let questionIds = [];
            const weightMap = {}; // questionId -> weight from assessment config

            const collectIds = (src) => {
                if (!src) return;
                if (Array.isArray(src)) {
                    src.forEach(item => {
                        if (typeof item === 'string') {
                            questionIds.push(item);
                        } else if (item && (item.id || item.questionId)) {
                            const qId = item.id || item.questionId;
                            questionIds.push(qId);
                            // Preserve assessment-level weight if provided
                            if (typeof item.weight === 'number' || typeof item.weight === 'string') {
                                weightMap[qId] = Number(item.weight);
                            }
                        }
                    });
                }
            };

            collectIds(assessment.questionIds);
            collectIds(assessment.questions);
            collectIds(assessment.challenges);
            collectIds(data.questionIds);
            collectIds(data.questions);
            collectIds(data.challenges);

            questionIds = [...new Set(questionIds)].filter(Boolean);

            let resolvedQuestions = [];
            if (questionIds.length > 0) {
                try {
                    const { fetchQuestionsForContest } = await import('../services/codingQuestionBankService');
                    resolvedQuestions = await fetchQuestionsForContest(questionIds);
                } catch (resErr) {
                    console.error("Failed to resolve assessment questions from bank:", resErr);
                }
            }

            // Fallback to inline questions if bank resolving returned nothing
            if (resolvedQuestions.length === 0) {
                const inline = [];
                const addInline = (src) => {
                    if (Array.isArray(src)) {
                        src.forEach(item => {
                            if (item && typeof item === 'object' && (item.id || item.questionId || item.title)) {
                                inline.push(item);
                            }
                        });
                    }
                };
                addInline(data.challenges);
                addInline(data.questions);
                addInline(assessment.challenges);
                addInline(assessment.questions);
                resolvedQuestions = inline;
            }

            // Merge assessment-level weights back into resolved Q{id}.json questions.
            // The canonical Q{id}.json does NOT have a top-level weight; weight is
            // supplied by the assessment definition. We apply it here so that
            // q.weight || DEFAULT_QUESTION_WEIGHT evaluates correctly downstream.
            if (Object.keys(weightMap).length > 0) {
                resolvedQuestions = resolvedQuestions.map(q => {
                    const qId = q.questionId || q.id;
                    const assessmentWeight = weightMap[qId];
                    if (assessmentWeight !== undefined && !q.weight) {
                        return { ...q, weight: assessmentWeight };
                    }
                    return q;
                });
            }

            // Set resolved questions on data object for further processing
            data.questions = resolvedQuestions;
            
            // 3. Register initial attempt in Firestore (awaited so duplicate-submission errors block the test)
            const initResult = await CodingAssessmentService.createInitialAttempt(user, assessment);
            if (initResult && initResult.error && initResult.error.includes('DUPLICATE_SUBMISSION')) {
                setError("You have already completed this coding assessment. Access is denied.");
                setLoading(false);
                return;
            }

            // 4. Initialize states
            const now = timeService.now();
            const durationSec = (data.duration || assessment.duration || 60) * 60;
            const parsedQuestions = (data.questions || []).map(normalizeQuestion);

            setCurrentAssessment(assessment);
            setQuestions(parsedQuestions);
            setActiveQuestionIndex(0);
            
            // Set start countdown to 10 seconds and offset startTime
            setStartCountdown(10);
            setStartTime(now + 10000);
            
            setTestDuration(durationSec);
            setRemainingTime(durationSec);
            setViolationCount(0);
            setIsLockedOut(false);
            setVisitedQuestions({ [parsedQuestions[0]?.id]: true });

            // Initialize default boilerplate codes for all questions and all languages
            const initialCodeMap = {};
            const availableLanguages = ["cpp", "c", "python", "java", "javascript"];
            parsedQuestions.forEach(q => {
                availableLanguages.forEach(lang => {
                    initialCodeMap[`${q.id}_${lang}`] = getQuestionBoilerplate(q, lang);
                });
            });
            setCodeMap(initialCodeMap);

            // 5. Store session backup state in localstorage
            localStorage.setItem("codingAssessmentStartTime", now.toString());
            localStorage.setItem("codingAssessmentTimer", durationSec.toString());
            localStorage.setItem("codingAssessmentData", JSON.stringify({
                assessment,
                questions: parsedQuestions
            }));

            // Sync navigation to slug
            navigate(`${CODING_ROUTE_BASE}/${assessment.slug}`);
        } catch (err) {
            console.error("[CodingAssessmentPage] Error starting assessment:", err);
            setError(err?.message || "Failed to initialize coding workspace.");
            setLoading(false);
        }
    };

    // Timer Tick
    useEffect(() => {
        if (!startTime || !currentAssessment || isLockedOut) return;

        const interval = setInterval(() => {
            const elapsed = getElapsedSeconds();
            const remaining = Math.max(0, testDuration - elapsed);
            setRemainingTime(remaining);

            // Periodically sync progress (every 60 seconds)
            if (elapsed > 0 && elapsed % 60 === 0) {
                backupProgress();
            }

            if (remaining <= 0) {
                clearInterval(interval);
                autoSubmitAttemptRef.current?.("timer");
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [startTime, currentAssessment, testDuration, isLockedOut, getElapsedSeconds]);

    // Proctoring tab switch hooks (Tab switch not needed - bypassed)
    useEffect(() => {
        // Tab switch monitoring disabled per requirements
    }, [startTime, currentAssessment, isLockedOut]);

    const saveCurrentEditorToMap = useCallback(() => {
        if (editorRef.current && currentQuestion) {
            try {
                const val = editorRef.current.getValue();
                if (typeof val === 'string') {
                    const currKey = getCanonicalQKey(currentQuestion, activeQuestionIndex);
                    const currLang = activeQState.selectedLanguage || language || 'cpp';
                    const prevQState = codingStateByQuestionRef.current[currKey] || {};
                    const updatedCodes = { ...(prevQState.codeByLang || {}), [currLang]: val };
                    codingStateByQuestionRef.current = {
                        ...codingStateByQuestionRef.current,
                        [currKey]: { ...prevQState, codeByLang: updatedCodes }
                    };
                    const qId = currentQuestion.id || currentQuestion.questionId || `q_${activeQuestionIndex}`;
                    codeMapRef.current[`${qId}_${currLang}`] = val;
                    const storageKey = getCodeStorageKey();
                    try {
                        localStorage.setItem(storageKey, JSON.stringify(codingStateByQuestionRef.current));
                    } catch (_) {}
                }
            } catch (_) {}
        }
    }, [currentQuestion, language, activeQuestionIndex, activeQState.selectedLanguage, getCodeStorageKey, getCanonicalQKey]);

    const handleSwitchQuestion = useCallback((newIdx) => {
        if (isRunningQuestionRef.current || isSubmittingQuestionRef.current || isRunning || isEvaluating || activeQState.isRunning || activeQState.isEvaluating) {
            return; // Lock switching while code is running or evaluating
        }

        // 1. Immediately extract and save the active editor's value for the current question
        if (editorRef.current && currentQuestion) {
            try {
                const val = editorRef.current.getValue();
                if (typeof val === 'string') {
                    const currKey = getCanonicalQKey(currentQuestion, activeQuestionIndex);
                    const currLang = activeQState.selectedLanguage || language || 'cpp';
                    const prevQState = codingStateByQuestionRef.current[currKey] || {};
                    const updatedCodes = { ...(prevQState.codeByLang || {}), [currLang]: val };
                    codingStateByQuestionRef.current = {
                        ...codingStateByQuestionRef.current,
                        [currKey]: { ...prevQState, codeByLang: updatedCodes }
                    };
                    const qId = currentQuestion.id || currentQuestion.questionId || `q_${activeQuestionIndex}`;
                    codeMapRef.current[`${qId}_${currLang}`] = val;
                }
            } catch (_) {}
        }

        const storageKey = getCodeStorageKey();
        try {
            localStorage.setItem(storageKey, JSON.stringify(codingStateByQuestionRef.current));
        } catch (_) {}

        let targetIdx = activeQuestionIndex;
        if (typeof newIdx === 'function') {
            targetIdx = newIdx(activeQuestionIndex);
        } else if (typeof newIdx === 'number') {
            targetIdx = newIdx;
        }

        if (targetIdx >= 0 && targetIdx < questions.length) {
            if (timingTrackerRef.current) {
                timingTrackerRef.current.switchQuestion(targetIdx);
            }
            setActiveQuestionIndex(targetIdx);
            // CRITICAL FIX: DO NOT call editorRef.current.setValue(targetCode)!
            // Calling setValue on the old editor before unmount caused cross-question contamination.
            // With a question-scoped React key on <Editor>, React cleanly mounts the new question's editor with its own code.
        }
    }, [questions.length, activeQuestionIndex, currentQuestion, language, activeQState, isRunning, isEvaluating, getCodeStorageKey, getCanonicalQKey]);

    const handleLanguageChange = useCallback((newLang) => {
        if (!currentQuestion || isRunning || isEvaluating || activeQState.isRunning || activeQState.isEvaluating) return;
        saveCurrentEditorToMap();
        setLanguage(newLang);

        const currKey = getCanonicalQKey(currentQuestion, activeQuestionIndex);
        const prevQState = codingStateByQuestionRef.current[currKey] || {};
        const existingCode = prevQState.codeByLang?.[newLang];
        const finalCode = (typeof existingCode === 'string' && existingCode.trim() !== '')
            ? existingCode
            : getQuestionBoilerplate(currentQuestion, newLang);

        const updatedCodes = { ...(prevQState.codeByLang || {}), [newLang]: finalCode };
        const updatedQState = {
            ...prevQState,
            selectedLanguage: newLang,
            codeByLang: updatedCodes,
            // Language change invalidates sample pass status for new language
            samplesPassedAll: false,
            sampleRunCode: ''
        };

        codingStateByQuestionRef.current = {
            ...codingStateByQuestionRef.current,
            [currKey]: updatedQState
        };
        const qId = currentQuestion.id || currentQuestion.questionId || `q_${activeQuestionIndex}`;
        codeMapRef.current[`${qId}_${newLang}`] = finalCode;

        // Persist immediately to localStorage so no background timer or sync can overwrite it with stale state
        const storageKey = getCodeStorageKey();
        try {
            localStorage.setItem(storageKey, JSON.stringify(codingStateByQuestionRef.current));
        } catch (_) {}

        setCodingStateByQuestion(prev => ({
            ...prev,
            [currKey]: updatedQState
        }));
        // CRITICAL FIX: Do NOT call editorRef.current.setValue(targetCode).
        // The React key includes language, so Monaco remounts cleanly.
    }, [currentQuestion, activeQuestionIndex, isRunning, isEvaluating, activeQState.isRunning, activeQState.isEvaluating, getCanonicalQKey, saveCurrentEditorToMap, getCodeStorageKey]);

    const getCurrentCode = useCallback((q = currentQuestion, lang = (activeQState?.selectedLanguage || language)) => {
        if (!q) return "";
        const qIdx = questions.findIndex(item => (item.id || item.questionId) === (q.id || q.questionId));
        const qKey = getCanonicalQKey(q, qIdx >= 0 ? qIdx : activeQuestionIndex);
        const qState = codingStateByQuestionRef.current[qKey];
        if (qState?.codeByLang?.[lang] !== undefined && qState.codeByLang[lang] !== null) {
            return qState.codeByLang[lang];
        }
        const simpleKey = `${q.id || q.questionId}_${lang}`;
        if (codeMapRef.current[simpleKey] !== undefined && codeMapRef.current[simpleKey] !== null && codeMapRef.current[simpleKey].trim?.() !== '') {
            return codeMapRef.current[simpleKey];
        }
        return getQuestionBoilerplate(q, lang);
    }, [currentQuestion, activeQState?.selectedLanguage, language, getCanonicalQKey, questions, activeQuestionIndex]);

    // Handle code editor change: update ref & throttled local storage with question isolation
    const handleCodeChange = useCallback((targetQKey, targetLang, newVal) => {
        if (!targetQKey || typeof newVal !== 'string') return;

        const prevQState = codingStateByQuestionRef.current[targetQKey] || {};
        const prevCodes = prevQState.codeByLang || {};
        const updatedCodes = { ...prevCodes, [targetLang]: newVal };

        // Requirement: "user must run the code, it must pass all samples and then only enable the submit button"
        // Invalidate sample pass status if code differs from the verified sample run code!
        const isSameAsSampleRun = newVal.trim() === (prevQState.sampleRunCode || '').trim();
        const newSamplesPassed = isSameAsSampleRun ? (prevQState.samplesPassedAll ?? false) : false;

        const updatedQState = {
            ...prevQState,
            codeByLang: updatedCodes,
            selectedLanguage: targetLang,
            samplesPassedAll: newSamplesPassed
        };

        codingStateByQuestionRef.current = {
            ...codingStateByQuestionRef.current,
            [targetQKey]: updatedQState
        };

        if (currentQuestion) {
            const simpleKey = `${currentQuestion.id || currentQuestion.questionId}_${targetLang}`;
            codeMapRef.current[simpleKey] = newVal;
        }

        setCodingStateByQuestion(prev => ({
            ...prev,
            [targetQKey]: updatedQState
        }));

        const storageKey = getCodeStorageKey();
        throttledLocalStorageSet(storageKey, codingStateByQuestionRef.current, 1000);
    }, [getCodeStorageKey, currentQuestion]);

    // Reset code boilerplate
    const handleResetCode = () => {
        if (!currentQuestion) return;
        const currKey = getCanonicalQKey(currentQuestion, activeQuestionIndex);
        const currLang = activeQState.selectedLanguage || language || 'cpp';
        const boilerplate = getQuestionBoilerplate(currentQuestion, currLang);

        const prevQState = codingStateByQuestionRef.current[currKey] || {};
        const updatedCodes = { ...(prevQState.codeByLang || {}), [currLang]: boilerplate };
        const updatedQState = {
            ...prevQState,
            codeByLang: updatedCodes,
            samplesPassedAll: false,
            sampleRunCode: ''
        };

        codingStateByQuestionRef.current = {
            ...codingStateByQuestionRef.current,
            [currKey]: updatedQState
        };
        const qId = currentQuestion.id || currentQuestion.questionId || `q_${activeQuestionIndex}`;
        codeMapRef.current[`${qId}_${currLang}`] = boilerplate;

        setCodingStateByQuestion(prev => ({
            ...prev,
            [currKey]: updatedQState
        }));
    };

    // Backup active state to localStorage & Firestore (continuous cloud sync for partial attempts)
    const backupProgress = async () => {
        saveCurrentEditorToMap();
        try {
            if (currentQuestion) {
                localStorage.setItem("codingAssessmentCode", JSON.stringify(codeMapRef.current));
                localStorage.setItem("codingQuestionRunHistory", JSON.stringify(questionRunHistoryRef.current));
                localStorage.setItem("codingQuestionScores", JSON.stringify(questionScores));
            }
            const authData = JSON.parse(localStorage.getItem('auth_data') ?? '{}');
            const targetUser = user || authData;
            const targetAssessment = currentAssessment || assessmentData;
            if (!targetUser || !targetAssessment) return;

            const tenantId = targetUser.tenantId || targetUser.college || 'TN000084';
            const userId = auth?.currentUser?.uid || targetUser.uid || targetUser.userId;
            const aId = targetAssessment.id || targetAssessment.assessmentId;

            if (userId && aId) {
                // 1. Sync in-progress scores and code map to assessmentResults
                setDoc(doc(db, `assessmentResults/${tenantId}/${aId}/${userId}`), {
                    userId,
                    email: targetUser.email || '',
                    rollNumber: targetUser.rollNumber ?? '',
                    name: targetUser.name ?? '',
                    tenantId: tenantId,
                    cohortId: targetUser.cohortId || '2K27',
                    assessmentId: aId,
                    assessmentTitle: targetAssessment.name || targetAssessment.title || '',
                    type: isEmbedded ? 'multisection' : 'coding',
                    status: 'in_progress',
                    completed: false,
                    scores: questionScores,
                    codeMap: codeMapRef.current,
                    lastUpdatedAt: serverTimestamp(),
                    lastUpdatedAtISO: new Date().toISOString()
                }, { merge: true }).catch(() => {});

                // 2. Sync to contestAttempts
                const attDocId = `${aId}_${userId}`;
                setDoc(doc(db, 'users', userId, 'contestAttempts', attDocId), {
                    uid: userId,
                    assessmentId: aId,
                    tenantId: tenantId,
                    status: 'IN_PROGRESS',
                    completed: false,
                    codeMap: codeMapRef.current,
                    sectionAnswers: {
                        [sectionData?.sectionId || sectionData?.id || 'coding_section']: questionScores
                    },
                    lastSavedAt: serverTimestamp()
                }, { merge: true }).catch(() => {});
            }
        } catch (_) {
            // Local state is already securely persisted in localStorage; remote backup is non-blocking
        }
    };

    // Run Code Engine (Sample Tests)
    // Flow: show loader FIRST → send to backend → close loader
    // Flow: show loader FIRST → send to backend → close loader
    const runSampleTestCases = async () => {
        if (!currentQuestion || isRunningQuestionRef.current || isRunning || isEvaluating || isSubmittingQuestionRef.current) return;
        isRunningQuestionRef.current = true;
        const runStartTime = Date.now();

        const targetQ = currentQuestion;
        const targetQIdx = activeQuestionIndex;
        const targetQKey = getCanonicalQKey(targetQ, targetQIdx);
        const currentLang = activeQState.selectedLanguage || language || 'cpp';

        setCompilationCounts(prev => {
            const updated = { ...prev, [targetQ.id]: (prev[targetQ.id] || 0) + 1 };
            localStorage.setItem("codingCompilationCounts", JSON.stringify(updated));
            return updated;
        });

        setIsRunning(true);
        setEvalProgressText(`Preparing Test Cases...`);
        setRunResults(null);
        setStderr('');
        setStdout('');

        const code = getCurrentCode(targetQ, currentLang);
        const isRunAll = selectedTestCaseSet === 'all';
        const sampleTests = getQuestionSampleTestCases(targetQ);
        const allVisibleTests = getQuestionVisibleAllTestCases(targetQ, 6);
        let testsToRun = isRunAll ? allVisibleTests : (sampleTests.length > 0 ? sampleTests : allVisibleTests);
        if (!Array.isArray(testsToRun) || testsToRun.length === 0) {
            testsToRun = [{ input: "", expectedOutput: "" }];
        }

        const bridgeLang = currentLang === 'python3' ? 'python' : currentLang;
        const isBlank = isCodeBlankOrEmpty(code);

        if (isBlank) {
            const emptyStderr = "No code submitted. Please write solution code before running test cases.";
            setStderr(emptyStderr);
            const emptyResults = testsToRun.map((tc, idx) => ({
                index: idx + 1,
                input: tc.input,
                expected: tc.expectedOutput || tc.expected,
                actual: "",
                stderr: "No code submitted in editor.",
                passed: false
            }));
            setRunResults(emptyResults);

            const emptyRecord = {
                questionId: targetQ.id,
                code: "",
                solution: "",
                language: currentLang,
                testsPassed: 0,
                totalTests: emptyResults.length,
                status: "Wrong Answer",
                results: emptyResults,
                runAt: new Date().toISOString()
            };
            questionRunHistoryRef.current[targetQ.id] = emptyRecord;

            const updatedQState = {
                ...(codingStateByQuestionRef.current[targetQKey] || {}),
                runResults: emptyResults,
                samplesPassedAll: false,
                sampleRunCode: '',
                stdout: '',
                stderr: emptyStderr,
                activeResultTab: 'console',
                isRunning: false
            };
            codingStateByQuestionRef.current = {
                ...codingStateByQuestionRef.current,
                [targetQKey]: updatedQState
            };
            setCodingStateByQuestion(prev => ({ ...prev, [targetQKey]: updatedQState }));

            setActiveResultTab('console');
            setIsRunning(false);
            isRunningQuestionRef.current = false;
            setEvalProgressText('');
            return;
        }

        try {
            const results = [];
            for (let i = 0; i < testsToRun.length; i++) {
                const tc = testsToRun[i];
                setEvalProgressText(`Running Sample Test Case ${i + 1} of ${testsToRun.length}...`);

                // Run process on sandbox backend with 6500ms safety timeout
                const res = await Promise.race([
                    desktopBridge.runDirectSandbox(bridgeLang, code, tc.input),
                    new Promise(resolve => setTimeout(() => resolve({ error: 'Execution Timed Out (Limit 6.5s)', exit_code: -1 }), 6500))
                ]);

                if (isEngineDisconnected(res)) {
                    results.push({
                        index: i + 1,
                        input: tc.input,
                        expected: tc.expectedOutput || tc.expected || "",
                        actual: "",
                        stderr: "Evaluation engine not connected. Please restart the application or rerun the code.",
                        passed: false
                    });
                    break; // Abort remaining testcases immediately!
                }

                const exit = res.exit_code !== undefined ? res.exit_code : (res.exitCode !== undefined ? res.exitCode : 0);
                const passed = isTestCasePassed(res.stdout, tc.expectedOutput || tc.expected, tc.input, exit, res.error);

                results.push({
                    index: i + 1,
                    input: tc.input,
                    expected: tc.expectedOutput || tc.expected || "",
                    actual: res.stdout ?? "",
                    stderr: res.stderr || (res.error ?? ""),
                    passed: passed
                });
                await new Promise(r => setTimeout(r, 10));
            }

            // Run Custom Input if checked (only if engine was not disconnected)
            let customCase = null;
            if (useCustomInput && (results.length === 0 || !isEngineDisconnected(results[results.length - 1]))) {
                const customStdin = customInput ?? "";
                const resRaw = await Promise.race([
                    desktopBridge.runDirectSandbox(bridgeLang, code, customStdin),
                    new Promise(resolve => setTimeout(() => resolve({ error: 'Execution Timed Out (Limit 6.5s)', exit_code: -1 }), 6500))
                ]);
                const res = typeof resRaw === 'string' ? JSON.parse(resRaw) : (resRaw || {});
                if (isEngineDisconnected(res)) {
                    customCase = {
                        index: 'Custom',
                        isCustom: true,
                        input: customStdin,
                        expected: 'N/A (Custom Run)',
                        actual: "",
                        stderr: "Evaluation engine not connected. Please restart the application or rerun the code.",
                        passed: false
                    };
                    results.push(customCase);
                } else {
                    const exit = res.exit_code !== undefined ? res.exit_code : (res.exitCode !== undefined ? res.exitCode : 0);
                    const passed = !res.error && (exit === 0 || exit === null);
                    customCase = {
                        index: 'Custom',
                        isCustom: true,
                        input: customStdin,
                        expected: 'N/A (Custom Run)',
                        actual: res.stdout ?? "",
                        stderr: res.stderr || (res.error ?? ""),
                        passed: passed
                    };
                    results.push(customCase);
                }
            }

            // Evaluate sample test case pass rate
            const passedCases = results.filter(r => r.passed && !r.isCustom).length;
            const totalCases = results.filter(r => !r.isCustom).length;
            const allSamplesPassed = totalCases > 0 && passedCases === totalCases;
            const runStatus = totalCases > 0 ? (allSamplesPassed ? "Accepted" : (passedCases > 0 ? "Partial" : "Wrong Answer")) : "Wrong Answer";

            let primaryStdout = "";
            let primaryStderr = "";
            if (useCustomInput && customCase) {
                primaryStdout = customCase.actual || "";
                primaryStderr = customCase.stderr || "";
            } else {
                const firstErrorCase = results.find(r => r.stderr);
                const primaryCase = firstErrorCase || results[0];
                if (primaryCase) {
                    primaryStdout = primaryCase.actual || "";
                    primaryStderr = primaryCase.stderr || "";
                }
            }

            const updatedQState = {
                ...(codingStateByQuestionRef.current[targetQKey] || {}),
                runResults: results,
                samplesPassedAll: allSamplesPassed,
                sampleRunCode: allSamplesPassed ? code.trim() : '',
                stdout: primaryStdout,
                stderr: primaryStderr,
                activeResultTab: primaryStderr ? 'console' : 'output',
                isRunning: false
            };

            codingStateByQuestionRef.current = {
                ...codingStateByQuestionRef.current,
                [targetQKey]: updatedQState
            };
            setCodingStateByQuestion(prev => ({
                ...prev,
                [targetQKey]: updatedQState
            }));

            // Sync to legacy states for active view
            if (activeCanonicalQKeyRef.current === targetQKey) {
                setRunResults(results);
                if (isRunAll) setEvalResults(results);
                setStdout(primaryStdout);
                setStderr(primaryStderr);
                setActiveResultTab('output');
                if (useCustomInput && customCase) {
                    setExpandedTestCaseIndex('custom');
                } else {
                    setExpandedTestCaseIndex(0);
                }
                setActiveRightTab('testcases');
                setSampleRunBanner({
                    status: runStatus,
                    passed: passedCases,
                    total: totalCases,
                    time: new Date().toLocaleTimeString()
                });
                setTimeout(() => setSampleRunBanner(null), 8000);
            }

            // Record run history and sync into questionScores
            const runRecord = {
                questionId: targetQ.id,
                code: code,
                solution: code,
                language: currentLang,
                testsPassed: passedCases,
                totalTests: totalCases,
                status: runStatus,
                results: results,
                runAt: new Date().toISOString()
            };
            questionRunHistoryRef.current[targetQ.id] = runRecord;

            setQuestionScores(prev => {
                const existing = prev[targetQ.id];
                return {
                    ...prev,
                    [targetQ.id]: {
                        ...(existing || {}),
                        code: code,
                        solution: code,
                        language: currentLang,
                        lastRunTestsPassed: passedCases,
                        lastRunTotalTests: totalCases,
                        lastRunStatus: runStatus,
                        lastRunResults: results,
                        lastRunAt: runRecord.runAt
                    }
                };
            });

            backupProgress();
        } catch (err) {
            console.error("Run code error:", err);
            const errText = `Run Code Error: ${err.message}`;
            setStderr(errText);
            setActiveResultTab('console');
            const errQState = {
                ...(codingStateByQuestionRef.current[targetQKey] || {}),
                stderr: errText,
                samplesPassedAll: false,
                sampleRunCode: '',
                activeResultTab: 'console',
                isRunning: false
            };
            codingStateByQuestionRef.current = {
                ...codingStateByQuestionRef.current,
                [targetQKey]: errQState
            };
            setCodingStateByQuestion(prev => ({ ...prev, [targetQKey]: errQState }));
        } finally {
            // Keep sample test feedback / compiling HUD visible for min 3 seconds
            const elapsed = Date.now() - (typeof runStartTime !== 'undefined' ? runStartTime : Date.now());
            if (elapsed < 3000) {
                await new Promise(r => setTimeout(r, 3000 - elapsed));
            }
            setIsRunning(false);
            isRunningQuestionRef.current = false;
            setEvalProgressText('');
        }
    };

    const handleSubmitQuestion = async () => {
        if (!currentQuestion || isSubmittingQuestionRef.current || isEvaluating || isRunning || isRunningQuestionRef.current) return;

        const targetQ = currentQuestion;
        const targetQIdx = activeQuestionIndex;
        const targetQKey = getCanonicalQKey(targetQ, targetQIdx);
        const currentLang = activeQState.selectedLanguage || language || 'cpp';
        const qState = codingStateByQuestionRef.current[targetQKey] || activeQState;

        // ENFORCE: User must run the code, it must pass all samples and then only enable the submit button.
        if (!qState.samplesPassedAll) {
            toast.info("Run Code and pass all sample test cases before submitting your solution.");
            return;
        }

        isSubmittingQuestionRef.current = true;

        setQuestionSubmitTimes(prev => {
            const updated = { ...prev, [targetQ.id]: new Date().toISOString() };
            localStorage.setItem("codingQuestionSubmitTimes", JSON.stringify(updated));
            return updated;
        });

        setIsEvaluating(true);
        setEvalProgressText(`Preparing Hidden Test Cases...`);
        setEvalResults(null);

        const code = getCurrentCode(targetQ, currentLang);
        let hiddenTests = getQuestionHiddenTestCases(targetQ);

        const bridgeLang = currentLang === 'python3' ? 'python' : currentLang;
        const isEvalBlank = isCodeBlankOrEmpty(code);

        let passedCount = 0;
        let results = [];
        let evalError = null;

        try {
            for (let i = 0; i < hiddenTests.length; i++) {
                const tc = hiddenTests[i];
                setEvalProgressText(`Evaluating Hidden Test Case ${i + 1} of ${hiddenTests.length}...`);
                if (isEvalBlank) {
                    results.push({ index: i + 1, passed: false, error: "No code submitted in editor." });
                    continue;
                }
                const res = await Promise.race([
                    desktopBridge.runDirectSandbox(bridgeLang, code, tc.input),
                    new Promise(resolve => setTimeout(() => resolve({ error: 'Time Limit Exceeded (6.5s)', exit_code: -1 }), 6500))
                ]);

                if (isEngineDisconnected(res)) {
                    evalError = "Evaluation engine not connected. Please restart the application or rerun the code.";
                    results.push({ index: i + 1, passed: false, error: evalError });
                    break; // Abort remaining hidden test cases immediately!
                }

                const exit = res.exit_code !== undefined ? res.exit_code : (res.exitCode !== undefined ? res.exitCode : 0);
                const passed = isTestCasePassed(res.stdout, tc.expectedOutput || tc.expected, tc.input, exit, res.error);

                if (passed) passedCount++;
                results.push({ index: i + 1, passed, error: res.error || (res.stderr ?? "") });
                await new Promise(r => setTimeout(r, 10));
            }

            const total = hiddenTests.length;
            const score = (!isEvalBlank && total > 0) ? Math.round((passedCount / total) * 100) : 0;
            const earnedWeight = (!isEvalBlank && total > 0) ? (passedCount / total) * (targetQ.weight || DEFAULT_QUESTION_WEIGHT) : 0;
            const evalStatus = (!isEvalBlank && total > 0) ? (passedCount === total ? "Accepted" : (passedCount > 0 ? "Partial" : "Wrong Answer")) : "Wrong Answer";

            const firstError = results.find(r => r.error);
            const evalStdout = firstError ? '' : `Evaluation Completed: ${passedCount}/${total} test cases passed.`;
            const evalStderr = firstError ? firstError.error : '';

            const updatedQState = {
                ...(codingStateByQuestionRef.current[targetQKey] || {}),
                evalResults: results,
                stdout: evalStdout,
                stderr: evalStderr,
                activeResultTab: firstError ? 'console' : 'output',
                isEvaluating: false,
                submitted: true,
                score: earnedWeight,
                passedCount: passedCount,
                totalHidden: total,
                evalStatus: evalStatus,
                scorePercent: score
            };

            codingStateByQuestionRef.current = {
                ...codingStateByQuestionRef.current,
                [targetQKey]: updatedQState
            };
            setCodingStateByQuestion(prev => ({
                ...prev,
                [targetQKey]: updatedQState
            }));

            const newScores = {
                ...questionScores,
                [targetQ.id]: {
                    score: earnedWeight,
                    percentage: score,
                    passed: passedCount,
                    total: total,
                    submitted: true,
                    code: code,
                    solution: code,
                    language: currentLang,
                    testResults: results,
                    status: evalStatus,
                    submittedAt: new Date().toISOString()
                }
            };
            setQuestionScores(newScores);

            if (activeCanonicalQKeyRef.current === targetQKey) {
                setEvalResults(results);
                if (firstError) {
                    setStderr(firstError.error);
                    setActiveResultTab('console');
                } else {
                    setStdout(evalStdout);
                    setActiveResultTab('output');
                }
                setActiveRightTab('testcases');
                setExpandedTestCaseIndex(0);
            }

            backupProgress();
        } catch (err) {
            console.error("Submit question evaluation failed:", err);
            evalError = err.message;
        } finally {
            setIsEvaluating(false);
            isSubmittingQuestionRef.current = false;
            setEvalProgressText('');

            // Non-blocking toast feedback without popup modal layout thrashing
            if (activeCanonicalQKeyRef.current === targetQKey) {
                if (evalError) {
                    toast.error(`Evaluation failed: ${evalError}`);
                } else {
                    const total = hiddenTests.length;
                    const score = total > 0 ? Math.round((passedCount / total) * 100) : 0;
                    if (passedCount === total) {
                        toast.success(`Question Submitted! All ${total} hidden tests passed (${score}%)`);
                    } else if (passedCount > 0) {
                        toast.warning(`Question Submitted: ${passedCount}/${total} hidden tests passed (${score}%)`);
                    } else {
                        toast.error(`Question Submitted: 0/${total} hidden tests passed (0%)`);
                    }
                }
            }
        }
    };

    const autoSubmitAttempt = async (reason) => {
        // Synchronous claim — closes the race that `isSubmitting` cannot.
        if (!submitGuard.begin(reason || 'auto')) {
            console.warn('[CodingAssessmentPage] Submit already in progress, ignoring:', reason);
            return;
        }
        flushThrottledWrites();

        if (isEmbedded) {
            setIsSubmitting(true);
            setSubmitPhase('submitting');
            await handleEmbeddedSectionSubmit(reason);
            setIsSubmitting(false);
            submitGuard.fail(); // parent owns persistence; free the lock
            return;
        }

        setIsSubmitting(true);

        try {
            const authData = user || JSON.parse(localStorage.getItem("auth_data") ?? "{}");
            const storedStartTime = localStorage.getItem("codingAssessmentStartTime") || timeService.now().toString();
            const storedData = JSON.parse(localStorage.getItem("codingAssessmentData") || "{}");
            const storedCodeMap = JSON.parse(localStorage.getItem("codingAssessmentCode") || "{}");
            
            const activeAssessment = storedData.assessment || currentAssessment;

            if (!activeAssessment || !authData.Email) {
                clearLocalSession();
                navigate(CODING_ROUTE_BASE);
                return;
            }

            // Mark as submitting in Firestore to prevent refresh
            await CodingAssessmentService.markAsSubmitting(
                authData.Email,
                activeAssessment.id,
                authData.College,
                authData.Year,
                authData.Department
            );

            // Grade questions that haven't been submitted yet by running test cases on codeMap
            const activeQuestions = (storedData.questions || questions || []).map(normalizeQuestion);
            const finalScores = { ...questionScores };
            let totalMaxWeight = 0;
            let totalEarnedWeight = 0;

            for (const q of activeQuestions) {
                const qId = q.id || q.questionId;
                const qWeight = q.weight || DEFAULT_QUESTION_WEIGHT;
                totalMaxWeight += qWeight;

                const hasEvaluatedScore = finalScores[qId] && 
                                          finalScores[qId].testResults && 
                                          finalScores[qId].testResults.length > 0 && 
                                          finalScores[qId].submitted && 
                                          typeof finalScores[qId].score === 'number' && 
                                          finalScores[qId].total > 0;
                
                if (hasEvaluatedScore) {
                    totalEarnedWeight += finalScores[qId].score;
                } else {
                    // Unsubmitted question: no final evaluation needed. Recorded with 0 score instantly.
                    const hidden = getQuestionHiddenTestCases(q);
                    const code = (storedCodeMap && storedCodeMap[`${qId}_${language}`]) ||
                                 getCurrentCode(qId, language) ||
                                 codeMapRef.current[`${qId}_cpp`] ||
                                 codeMapRef.current[`${qId}_c`] ||
                                 codeMapRef.current[`${qId}_python`] ||
                                 codeMapRef.current[`${qId}_java`] ||
                                 codeMapRef.current[`${qId}_javascript`] || "";
                    finalScores[qId] = {
                        score: 0,
                        percentage: 0,
                        passed: 0,
                        total: hidden.length,
                        submitted: false,
                        status: 'Unattempted',
                        code: code || "",
                        solution: code || "",
                        language: language,
                        testResults: []
                    };
                }
            }

            const finalPercent = totalMaxWeight > 0 ? Math.round((totalEarnedWeight / totalMaxWeight) * 100) : 0;
            const elapsed = Math.round((timeService.now() - parseInt(storedStartTime, 10)) / 1000);

            // Stop question timing tracker and capture final per-question elapsed timings
            if (timingTrackerRef.current) {
                timingTrackerRef.current.stop();
            }
            const questionTiming = timingTrackerRef.current
                ? timingTrackerRef.current.getQuestionTiming(activeQuestions)
                : {};
            const activeTimeSpentMap = timingTrackerRef.current
                ? timingTrackerRef.current.getRawTimeMap(activeQuestions)
                : timeSpentPerQ;

            // Gather metadata payload
            const codingSubmissions = activeQuestions.map((q, idx) => {
                const qId = q.id || q.questionId || `q_${idx}`;
                const qKey = `Q${idx + 1}`;
                const scoreObj = finalScores[qId] || questionScores[qId] || { score: 0, percentage: 0, passed: 0, total: 0 };
                const passed = scoreObj.passed || scoreObj.testPassedCount || 0;
                const total = scoreObj.total || scoreObj.totalTestCases || (q.testCases ? q.testCases.length : 0);
                const status = scoreObj.status || (total > 0 ? (passed === total ? "Accepted" : (passed > 0 ? "Partial" : "Wrong Answer")) : "Wrong Answer");
                const userCode = scoreObj.code || scoreObj.solution || (storedCodeMap && storedCodeMap[`${qId}_${language}`]) ||
                                 getCurrentCode(qId, language) ||
                                 codeMapRef.current[`${qId}_${language}`] ||
                                 codeMapRef.current[`${qId}_cpp`] ||
                                 codeMapRef.current[`${qId}_c`] ||
                                 codeMapRef.current[`${qId}_python`] ||
                                 codeMapRef.current[`${qId}_java`] ||
                                 codeMapRef.current[`${qId}_javascript`] || "";
                const qLang = scoreObj.language || language || 'c';
                const testResults = scoreObj.testResults || questionRunHistoryRef.current[qId]?.results || [];
                const qTimeSpent = questionTiming[qKey]?.timeSpentSeconds ?? (activeTimeSpentMap[qId] || 0);
                const qTimeFormatted = questionTiming[qKey]?.timeSpentFormatted;

                return buildCodingSubmission({
                    questionId: qId,
                    questionNumber: idx + 1,
                    questionKey: qKey,
                    problemTitle: q.name || q.title || `Question ${idx + 1}`,
                    title: q.name || q.title || `Question ${idx + 1}`,
                    difficulty: q.difficulty || 'Easy',
                    language: qLang,
                    code: userCode,
                    solution: userCode,
                    status,
                    testsPassed: passed,
                    totalTests: total,
                    score: scoreObj.score || 0,
                    maxScore: q.weight || DEFAULT_QUESTION_WEIGHT,
                    percentage: scoreObj.percentage || 0,
                    compilationCount: compilationCounts[qId] || 0,
                    attempts: compilationCounts[qId] || 0,
                    timeComplexity: q.timeComplexity ?? '',
                    spaceComplexity: q.spaceComplexity ?? '',
                    testResults: testResults,
                    timeSpentSeconds: qTimeSpent,
                    timeSpentFormatted: qTimeFormatted,
                    submittedAt: questionSubmitTimes[qId] || scoreObj.submittedAt || new Date().toISOString()
                });
            });

            const targetAssessmentId = activeAssessment.id;
            const tenantId = authData?.tenantId || user?.tenantId;
            if (!tenantId) {
                throw new Error('[CodingAssessment] Missing tenantId for result submission');
            }
            const userId = auth?.currentUser?.uid || user?.uid;
            if (!userId) {
                throw new Error('[CodingAssessment] Missing userId for result submission');
            }

            const resultData = buildResultDoc({
                user: {
                    uid: userId,
                    email: authData.email || user?.email || '',
                    name: authData.name || user?.name || '',
                    rollNumber: authData.rollNumber || user?.rollNumber || '',
                    tenantId: tenantId,
                    college: authData.college || user?.college || '',
                    department: authData.department || user?.department || '',
                    year: authData.year || user?.year || '',
                    cohortId: authData.cohortId || user?.cohortId || '',
                },
                assessment: {
                    id: targetAssessmentId,
                    title: activeAssessment.name || activeAssessment.title || 'Coding Assessment',
                    assessmentType: 'coding',
                },
                scores: {
                    totalScore: totalEarnedWeight,
                    maxScore: totalMaxWeight,
                    percentage: finalPercent,
                    passed: totalMaxWeight > 0 && (totalEarnedWeight / totalMaxWeight >= 0.5),
                },
                timing: {
                    startedAt: new Date(parseInt(storedStartTime, 10)).toISOString(),
                    timeTakenSeconds: elapsed,
                },
                submission: {
                    autoSubmitted: true,
                    submissionReason: reason === 'timer'
                        ? 'Timer hit 0'
                        : (reason === 'proctoring_violations' ? 'Proctoring violations exceeded limit' : 'Tab switch limit lockout'),
                },
                codingSubmissions: codingSubmissions,
                questionTiming: questionTiming,
                proctoring: {
                    violationCount: (() => {
                        const vInfo = getViolations(activeAssessment.id, authData.email);
                        return Math.max(violationCount, vInfo.violationCount, (vInfo.violations || []).length);
                    })(),
                    totalNoFace: (() => {
                        const vInfo = getViolations(activeAssessment.id, authData.email);
                        return (vInfo.violations || []).filter(v => v.type === 'no_face').length;
                    })(),
                    totalMultipleFaces: (() => {
                        const vInfo = getViolations(activeAssessment.id, authData.email);
                        return (vInfo.violations || []).filter(v => v.type === 'multiple_faces').length;
                    })(),
                    violations: (() => {
                        const vInfo = getViolations(activeAssessment.id, authData.email);
                        return vInfo.violations?.length > 0
                            ? vInfo.violations
                            : [{ type: 'tab_switch', count: violationCount, reason: 'Tab switch limit lockout' }];
                    })(),
                },
            });

            await CodingAssessmentService.submitCodingResult(resultData);
            await markAssessmentCompleted(authData, activeAssessment.id);
            clearLocalSession();

            const noticeMsg = reason === 'timer' 
                ? 'Your coding assessment was auto-submitted because the duration expired.' 
                : (reason === 'proctoring_violations'
                    ? 'Your coding assessment was auto-submitted due to proctoring violations.'
                    : 'Your coding assessment was auto-submitted due to excessive tab switching violations.');
            
            setAutoSubmitMessage(noticeMsg);
            try { stopAllMediaAndAI(); } catch (_) {}
            navigate('/student/dashboard', { replace: true });
        } catch (e) {
            console.error("Auto submit failed:", e);
            clearLocalSession();
            try { stopAllMediaAndAI(); } catch (_) {}
            navigate('/student/dashboard', { replace: true });
        } finally {
            setIsSubmitting(false);
        }
    };
    autoSubmitAttemptRef.current = autoSubmitAttempt;

    /**
     * Webcam-independent tab-switch / focus-loss proctoring.
     *
     * BUG FIXED (P1 unenforced tab-switch rule): this page had NO
     * visibilitychange listener. `violationCount` was declared, displayed and
     * written into the result document, but nothing ever incremented it — the
     * only detection path was the webcam ML pipeline, which soft-fails to
     * 'camera_only'/'failed' on machines without a usable camera. Whenever the
     * webcam degraded, alt-tabbing during a coding assessment was completely
     * undetected, while the sandbox variant of this flow did enforce it.
     *
     * Three strikes auto-submits, matching the copy already shown in the
     * lockout UI and the 'Tab switch limit lockout' reason string below.
     */
    const TAB_SWITCH_LIMIT = 3;
    useTabSwitchGuard({
        enabled: Boolean(startTime && currentAssessment && !isLockedOut && !submitGuard.isDone),
        onViolation: ({ type }) => {
            // Only count leaving the workspace; the matching return event and
            // the de-duped blur are informational.
            if (type !== 'tab_switch' && type !== 'fullscreen_exit') return;

            setViolationCount((prev) => {
                const next = prev + 1;
                recordViolation(
                    currentAssessment?.id || 'coding',
                    user?.email,
                    type,
                    { message: `Tab switch violation ${next}` },
                    auth?.currentUser?.uid ?? null  // activates Firestore audit trail
                );
                if (next >= TAB_SWITCH_LIMIT) {
                    setIsLockedOut(true);
                    autoSubmitAttemptRef.current?.('tab_switch_lockout');
                } else {
                    setProctorWarning(
                        `Warning ${next}/${TAB_SWITCH_LIMIT}: leaving the assessment window is not permitted. ` +
                        `The assessment will be submitted automatically on the next violation.`
                    );
                }
                return next;
            });
        },
    });

    // Manual Submit — phases: evaluating → submitting → done
    const handleFinalSubmit = async () => {
        if (!submitGuard.begin('manual')) {
            console.warn('[CodingAssessmentPage] Submit already in progress, ignoring manual submit');
            return;
        }
        flushThrottledWrites();

        // Close the confirm dialog immediately
        setShowSubmitModal(false);

        if (isEmbedded) {
            setIsSubmitting(true);
            setSubmitPhase('submitting');
            await handleEmbeddedSectionSubmit();
            setIsSubmitting(false);
            submitGuard.fail(); // parent owns persistence; free the lock
            return;
        }

        // Submit directly: use already-evaluated results; unsubmitted questions get 0 score
        setIsSubmitting(true);
        setSubmitPhase('submitting');

        try {
            const finalScores = { ...questionScores };
            let totalMaxWeight = 0;
            let totalEarnedWeight = 0;

            for (const rawQ of questions) {
                const q = normalizeQuestion(rawQ);
                const qId = q.id || q.questionId;
                const qWeight = q.weight || DEFAULT_QUESTION_WEIGHT;
                totalMaxWeight += qWeight;

                const hasEvaluatedScore = finalScores[qId] && 
                                          finalScores[qId].testResults && 
                                          finalScores[qId].testResults.length > 0 && 
                                          finalScores[qId].submitted && 
                                          typeof finalScores[qId].score === 'number' && 
                                          finalScores[qId].total > 0;
                
                if (hasEvaluatedScore) {
                    totalEarnedWeight += finalScores[qId].score;
                } else {
                    // Unsubmitted question: no final evaluation needed. Recorded with 0 score instantly.
                    const hidden = getQuestionHiddenTestCases(q);
                    const code = getCurrentCode(qId, language) ||
                                 codeMapRef.current[`${qId}_cpp`] ||
                                 codeMapRef.current[`${qId}_c`] ||
                                 codeMapRef.current[`${qId}_python`] ||
                                 codeMapRef.current[`${qId}_java`] ||
                                 codeMapRef.current[`${qId}_javascript`] || "";
                    finalScores[qId] = {
                        score: 0,
                        percentage: 0,
                        passed: 0,
                        total: hidden.length,
                        submitted: false,
                        status: 'Unattempted',
                        code: code || "",
                        solution: code || "",
                        language: language,
                        testResults: []
                    };
                }
            }

            const finalPercent = totalMaxWeight > 0 ? Math.round((totalEarnedWeight / totalMaxWeight) * 100) : 0;
            const elapsed = getElapsedSeconds();

            // Phase 2: Submit to Firebase
            setSubmitPhase('submitting');

            await CodingAssessmentService.markAsSubmitting(
                user.email,
                currentAssessment.id,
                user.college,
                user.year,
                user.department
            );

            // Stop question timing tracker and capture final per-question elapsed timings
            if (timingTrackerRef.current) {
                timingTrackerRef.current.stop();
            }
            const questionTiming = timingTrackerRef.current
                ? timingTrackerRef.current.getQuestionTiming(questions)
                : {};
            const activeTimeSpentMap = timingTrackerRef.current
                ? timingTrackerRef.current.getRawTimeMap(questions)
                : timeSpentPerQ;

            const codingSubmissions = questions.map((rawQ, idx) => {
                const q = normalizeQuestion(rawQ);
                const qId = q.id || q.questionId || `q_${idx}`;
                const qKey = `Q${idx + 1}`;
                const scoreObj = finalScores[qId] || questionScores[qId] || { score: 0, percentage: 0, passed: 0, total: 0 };
                const passed = scoreObj.passed || scoreObj.testPassedCount || 0;
                const total = scoreObj.total || scoreObj.totalTestCases || 0;
                const status = scoreObj.status || (total > 0 ? (passed === total ? "Accepted" : (passed > 0 ? "Partial" : "Wrong Answer")) : "Wrong Answer");
                const userCode = scoreObj.code || scoreObj.solution || getCurrentCode(qId, language) ||
                                 codeMapRef.current[`${qId}_${language}`] ||
                                 codeMapRef.current[`${qId}_cpp`] ||
                                 codeMapRef.current[`${qId}_c`] ||
                                 codeMapRef.current[`${qId}_python`] ||
                                 codeMapRef.current[`${qId}_java`] ||
                                 codeMapRef.current[`${qId}_javascript`] || "";
                const qLang = scoreObj.language || language || 'c';
                const testResults = scoreObj.testResults || questionRunHistoryRef.current[qId]?.results || [];
                const qTimeSpent = questionTiming[qKey]?.timeSpentSeconds ?? (activeTimeSpentMap[qId] || 0);
                const qTimeFormatted = questionTiming[qKey]?.timeSpentFormatted;

                return buildCodingSubmission({
                    questionId: qId,
                    questionNumber: idx + 1,
                    questionKey: qKey,
                    problemTitle: q.name || q.title || `Question ${idx + 1}`,
                    title: q.name || q.title || `Question ${idx + 1}`,
                    difficulty: q.difficulty || 'Easy',
                    language: qLang,
                    code: userCode,
                    solution: userCode,
                    status,
                    testsPassed: passed,
                    totalTests: total,
                    score: scoreObj.score || 0,
                    maxScore: q.weight || DEFAULT_QUESTION_WEIGHT,
                    percentage: scoreObj.percentage || 0,
                    compilationCount: compilationCounts[qId] || 0,
                    attempts: compilationCounts[qId] || 0,
                    timeComplexity: q.timeComplexity ?? '',
                    spaceComplexity: q.spaceComplexity ?? '',
                    timeSpentSeconds: qTimeSpent,
                    timeSpentFormatted: qTimeFormatted,
                    startedAt: questionStartTimes[qId] || new Date(startTime).toISOString(),
                    submittedAt: questionSubmitTimes[qId] || scoreObj.submittedAt || new Date().toISOString(),
                    testResults: testResults
                });
            });

            const targetAssessmentId = currentAssessment.id;
            const tenantId = user?.tenantId;
            if (!tenantId) {
                throw new Error('[CodingAssessment] Missing user.tenantId for result submission');
            }
            const userId = auth?.currentUser?.uid || user?.uid;
            if (!userId) {
                throw new Error('[CodingAssessment] Missing userId for result submission');
            }

            const resultData = buildResultDoc({
                user: {
                    uid: userId,
                    email: user.email || '',
                    name: user.name || '',
                    rollNumber: user.rollNumber || '',
                    tenantId: tenantId,
                    college: user.college || '',
                    department: user.department || '',
                    year: user.year || '',
                    cohortId: user.cohortId || '',
                },
                assessment: {
                    id: targetAssessmentId,
                    title: currentAssessment.name || currentAssessment.title || 'Coding Assessment',
                    assessmentType: 'coding',
                },
                scores: {
                    totalScore: totalEarnedWeight,
                    maxScore: totalMaxWeight,
                    percentage: finalPercent,
                    passed: totalMaxWeight > 0 && (totalEarnedWeight / totalMaxWeight >= 0.5),
                },
                timing: {
                    startedAt: new Date(startTime).toISOString(),
                    timeTakenSeconds: elapsed,
                },
                submission: {
                    autoSubmitted: false,
                    submissionReason: 'manual',
                },
                codingSubmissions: codingSubmissions,
                questionTiming: questionTiming,
                proctoring: {
                    violationCount: (() => {
                        const vInfo = getViolations(currentAssessment.id, user.email);
                        return Math.max(violationCount, vInfo.violationCount, (vInfo.violations || []).length);
                    })(),
                    totalNoFace: (() => {
                        const vInfo = getViolations(currentAssessment.id, user.email);
                        return (vInfo.violations || []).filter(v => v.type === 'no_face').length;
                    })(),
                    totalMultipleFaces: (() => {
                        const vInfo = getViolations(currentAssessment.id, user.email);
                        return (vInfo.violations || []).filter(v => v.type === 'multiple_faces').length;
                    })(),
                    violations: (() => {
                        const vInfo = getViolations(currentAssessment.id, user.email);
                        return vInfo.violations || [];
                    })(),
                },
            });

            await CodingAssessmentService.submitCodingResult(resultData);
            await markAssessmentCompleted(user, targetAssessmentId);
            clearLocalSession();
            toast.success('Coding assessment submitted successfully!', { id: 'coding-submit' });

            // Build per-question summary for success screen
            const perQuestionSummary = questions.map(q => ({
                id: q.id,
                name: q.name || q.title || `Question ${questions.indexOf(q) + 1}`,
                passed: finalScores[q.id]?.passed || 0,
                total: finalScores[q.id]?.total || (q.hiddenTests?.length || q.sampleTests?.length || 0),
                percentage: finalScores[q.id]?.percentage || 0
            }));

            // Phase 3: Show success screen
            setSubmitPhase(null);
            setIsSubmitting(false);
            setSubmissionSuccess({
                assessmentTitle: currentAssessment.name,
                score: totalEarnedWeight,
                percentage: finalPercent,
                perQuestion: perQuestionSummary
            });
        } catch (err) {
            console.error("Submission failed:", err);
            setSubmitPhase(null);
            setIsSubmitting(false);
            showCustomAlert(
                "Submission Error", 
                `Submission error: ${err.message}. Your work has been saved.`,
                "error"
            );
        }
    };

    // Clean local variables
    const clearLocalSession = () => {
        if (!isEmbedded) {
            stopAllMediaAndAI();
        }
        if (currentAssessment?.id) {
            localStorage.setItem(`codingCompleted_${currentAssessment.id}`, "true");
            submitGuard.complete();
            // Denormalise completion so the dashboard needs no per-card reads.
            markAssessmentCompleted(user, currentAssessment.id);

            // ── Course progress tracking ──
            try {
                const courseCtx = JSON.parse(localStorage.getItem('codingCourseCtx') || '{}');
                if (courseCtx.courseId && courseCtx.seriesId) {
                    import('../services/mcqService').then(({ default: MCQService }) => {
                        const totalScore = Object.values(questionScores || {}).reduce((s, q) => s + (q.score || 0), 0);
                        MCQService.markCourseProgress({
                            uid: user?.uid ?? "",
                            courseId: courseCtx.courseId,
                            seriesId: courseCtx.seriesId,
                            assessmentId: courseCtx.assessmentId || currentAssessment.id,
                            totalScore: totalScore,
                            maxScore: courseCtx.maxScore || 100,
                        }).catch(() => {});
                    }).catch(() => {});
                }
            } catch (_) { /* non-fatal */ }
        }
        flushThrottledWrites();
        localStorage.removeItem("codingAssessmentStartTime");
        localStorage.removeItem("codingAssessmentTimer");
        localStorage.removeItem("codingAssessmentData");
        localStorage.removeItem("codingAssessmentCode");
        localStorage.removeItem("codingCompilationCounts");
        localStorage.removeItem("codingQuestionSubmitTimes");
        localStorage.removeItem("codingCourseCtx");
        localStorage.removeItem("codingTimeSpentPerQ");
        localStorage.removeItem("codingQuestionTiming");
        if (timingTrackerRef.current) {
            timingTrackerRef.current.clearStorage();
        }
        clearAllProctorCache();
        
        setCurrentAssessment(null);
        setQuestions([]);
        setStartTime(null);
        setRemainingTime(0);
        setCodeMap({});
        setQuestionScores({});
        setCompilationCounts({});
        setQuestionSubmitTimes({});
    };

    // Get color classification of question navigation bubble
    const getGridBubbleClass = (q) => {
        const score = questionScores[q.id];
        const isBookmarked = bookmarkedQuestions[q.id];
        const isVisited = visitedQuestions[q.id];

        if (score && score.submitted && score.percentage === 100) return 'grid-bubble-green';
        if (isBookmarked) return 'grid-bubble-blue';
        if (isVisited && (!score || !score.submitted)) return 'grid-bubble-red';
        return 'grid-bubble-gray';
    };

    // Toggle Bookmarks
    const toggleBookmark = (qId) => {
        setBookmarkedQuestions(prev => ({
            ...prev,
            [qId]: !prev[qId]
        }));
    };

    // Format remaining duration into mm:ss
    const formatRemainingTime = () => {
        const mins = Math.floor(remainingTime / 60);
        const secs = remainingTime % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleLogout = () => {
        localStorage.removeItem("auth_data");
        localStorage.removeItem("role");
        document.cookie = "user_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        document.cookie = "user_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        navigate("/login");
    };

    // Active state selectors

    // ==========================================
    // RENDER: FULLSCREEN COUNTDOWN SCREEN
    // ==========================================
    if (startCountdown !== null) {
        return (
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                background: 'radial-gradient(circle at center, #0f172a, #020617)',
                color: 'white',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 99999,
                fontFamily: "'Inter', sans-serif"
            }}>
                <div style={{ textAlign: 'center', maxWidth: '500px', padding: '20px' }}>
                    <div className="learn-spinner" style={{ width: '60px', height: '60px', borderTopColor: '#10b981', margin: '0 auto 24px' }}></div>
                    <h2 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '8px', color: '#10b981', letterSpacing: '-0.02em' }}>
                        Preparing Secure Environment...
                    </h2>
                    <p style={{ color: '#94a3b8', fontSize: '1rem', marginBottom: '32px', lineHeight: '1.6' }}>
                        Setting up coding workspace, proctoring engine, and loading assessment questions.
                    </p>
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '16px',
                        padding: '24px 32px',
                        display: 'inline-block',
                        boxShadow: '0 4px 30px rgba(0,0,0,0.2)'
                    }}>
                        <div style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', marginBottom: '8px', fontWeight: '700' }}>
                            Assessment Starts In
                        </div>
                        <div style={{ fontSize: '3.5rem', fontWeight: '900', color: 'white', fontFamily: 'monospace', lineHeight: '1' }}>
                            {startCountdown}s
                        </div>
                    </div>
                    
                    <div style={{ marginTop: '32px' }}>
                        <button
                            onClick={handleCancelPrelaunch}
                            style={{
                                background: 'transparent',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                color: '#94a3b8',
                                padding: '12px 28px',
                                borderRadius: '8px',
                                fontSize: '0.9rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                outline: 'none'
                            }}
                            onMouseEnter={(e) => { e.target.style.borderColor = 'rgba(255, 255, 255, 0.35)'; e.target.style.color = '#ffffff'; }}
                            onMouseLeave={(e) => { e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)'; e.target.style.color = '#94a3b8'; }}
                        >
                            Cancel & Exit Assessment
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ==========================================
    // RENDER: LIST VIEW
    // ==========================================
    if (!assessmentSlug && !isEmbedded) {
        return (
            <div className="mcq-page">
                {/* Header */}
                <header className="mcq-header">
                    <div className="mcq-header-top">
                        <Link to="/student/dashboard" className="mcq-home-button">
                            <FaArrowLeft /> Back to Dashboard
                        </Link>
                    </div>
                    <h1>Coding Assessments Portal</h1>
                    <p className="mcq-description">
                        Select an available coding assessment from the list below.
                    </p>
                </header>

                <div className="mcq-container">
                    {/* Auto Submit Notification banner */}
                    {autoSubmitNotice && (
                        <div className="mcq-info-banner">
                            <span><FaExclamationTriangle /> {autoSubmitNotice}</span>
                            <button onClick={() => setAutoSubmitNotice(null)}><FaTimes /></button>
                        </div>
                    )}

                    {error && (
                        <div className="error-banner">
                            <FaExclamationTriangle /> {error}
                        </div>
                    )}

                    {/* Filter controls */}
                    <div className="mcq-search-container">
                        <FaSearch className="search-icon" />
                        <input 
                            type="text" 
                            placeholder="Search assessment tests..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="mcq-search-input"
                        />
                    </div>

                    <div className="panel-filters-row" style={{ maxWidth: '600px', margin: '0 auto 40px', display: 'flex', gap: '16px' }}>
                        <select 
                            value={filterDifficulty} 
                            onChange={(e) => setFilterDifficulty(e.target.value)}
                            className="diff-filter-select"
                        >
                            <option value="All">All Difficulties</option>
                            <option value="Easy">Easy</option>
                            <option value="Medium">Medium</option>
                            <option value="Hard">Hard</option>
                        </select>

                        <select 
                            value={filterStatus} 
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="diff-filter-select"
                        >
                            <option value="All">All Statuses</option>
                            <option value="Available">Available</option>
                            <option value="Completed">Completed</option>
                        </select>
                    </div>

                    {/* Grid list */}
                    {loading ? (
                        <div className="learn-loading">
                            <div className="learn-spinner"></div>
                            <p>Scanning assessments...</p>
                        </div>
                    ) : (
                        <div className="mcq-tests-grid">
                            {filteredAssessments.length > 0 ? (
                                filteredAssessments.map(a => {
                                    const isCompleted = userAttempts[a.id]?.completed === true;
                                    const score = userAttempts[a.id]?.score || 0;
                                    return (
                                        <div key={a.id} className="mcq-test-card">
                                            <div className="mcq-test-header">
                                                <h3 className="mcq-test-title">{a.name}</h3>
                                                <span className={`mcq-difficulty mcq-difficulty-${a.difficulty.toLowerCase()}`}>
                                                    {a.difficulty}
                                                </span>
                                            </div>
                                            <div className="mcq-test-details">
                                                <div className="mcq-test-detail-item">
                                                    <FaClock /> <span>{a.duration} Minutes</span>
                                                </div>
                                                <div className="mcq-test-detail-item">
                                                    <FaPlay /> <span>{a.questions} Programming Tasks</span>
                                                </div>
                                                <div className="mcq-test-detail-item">
                                                    <FaCheckCircle /> <span>Languages: {a.languages.map(l => l.toUpperCase()).join(', ')}</span>
                                                </div>
                                            </div>

                                            <div className="mcq-test-actions">
                                                {isCompleted ? (
                                                    <button className="solve-btn submitted" disabled>
                                                        Completed ({score} Marks)
                                                    </button>
                                                ) : (
                                                    <button className="solve-btn active" onClick={() => handleSelectAssessment(a)}>
                                                        Start Assessment
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="no-contests-message" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px' }}>
                                    No available coding assessments found.
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Proctoring Instructions Modal - shown for proctored assessments after passkey */}
                {showInstructions && (
                    <ProctoringInstructions
                        assessment={selectedAssessment}
                        onContinue={() => {
                            setShowInstructions(false);
                            startAssessment(selectedAssessment);
                        }}
                        onCancel={() => {
                            setShowInstructions(false);
                            clearAllProctorCache();
                        }}
                    />
                )}

                {/* Passkey validation modal */}
                {showPasskeyModal && (
                    <div className="passkey-modal-overlay">
                        <div className="passkey-modal">
                            <div className="passkey-modal-header">
                                <h3>Passkey Verification</h3>
                                <button onClick={() => setShowPasskeyModal(false)}><FaTimes /></button>
                            </div>
                            <div className="passkey-modal-body">
                                <p>Enter the assessment access passkey provided by your instructor:</p>
                                <input 
                                    type="password" 
                                    placeholder="Enter passkey"
                                    value={passkey}
                                    onChange={(e) => setPasskey(e.target.value)}
                                    className="passkey-input"
                                />
                                {passkeyError && <span className="passkey-error">{passkeyError}</span>}
                            </div>
                            <div className="passkey-modal-footer">
                                <button className="cancel-btn" onClick={() => setShowPasskeyModal(false)}>Cancel</button>
                                <button className="confirm-btn" onClick={handleValidatePasskey} disabled={isValidatingPasskey}>
                                    Validate & Enter
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ==========================================
    // RENDER: SUBMISSION SUCCESS SCREEN
    // Auto-redirects to dashboard after 6 seconds
    // ==========================================
    if (submissionSuccess) {
        const { assessmentName, percentage, perQuestion } = submissionSuccess;

        // Trigger auto-redirect after 6 seconds (only once)
        setTimeout(() => { navigate(CODING_ROUTE_BASE); }, 6000);

        return (
            <div className="mcq-page">
                {/* Header */}
                <header className="mcq-header">
                    <div className="mcq-header-top">
                        <Link to="/student/dashboard" className="mcq-home-button">
                            <FaArrowLeft /> Back to Dashboard
                        </Link>
                    </div>
                    <h1>Coding Assessments Portal</h1>
                    <p className="mcq-description">
                        Your assessment has been successfully graded and recorded.
                    </p>
                </header>

                <div className="mcq-container" style={{ display: 'flex', justifyContent: 'center', padding: '40px 16px' }}>
                    <div className="mcq-test-card" style={{ maxWidth: '560px', width: '100%', padding: '36px', position: 'relative', overflow: 'hidden' }}>
                        {/* Green accent line on top like the Assessment tile */}
                        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '4px', background: '#10b981' }} />
                        
                        {/* Success Icon */}
                        <div style={{
                            width: '72px',
                            height: '72px',
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 20px',
                            boxShadow: '0 0 24px rgba(16,185,129,0.3)'
                        }}>
                            <FaCheckCircle style={{ fontSize: '32px', color: 'white' }} />
                        </div>

                        <h2 style={{ color: '#10b981', fontSize: '1.6rem', fontWeight: '800', margin: '0 0 8px', textAlign: 'center' }}>
                            Assessment Submitted!
                        </h2>
                        <p style={{ color: '#94a3b8', fontSize: '0.95rem', margin: '0 0 4px', fontWeight: '600', textAlign: 'center' }}>
                            {assessmentName}
                        </p>
                        <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '0 0 28px', fontStyle: 'italic', textAlign: 'center' }}>
                            Redirecting to portal list in 6 seconds...
                        </p>

                        {/* Score Badge */}
                        <div style={{
                            background: percentage >= 75 ? 'rgba(16,185,129,0.06)' : percentage >= 40 ? 'rgba(245,158,11,0.06)' : 'rgba(239,68,68,0.06)',
                            border: `1px solid ${percentage >= 75 ? 'rgba(16,185,129,0.25)' : percentage >= 40 ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.25)'}`,
                            borderRadius: '12px',
                            padding: '16px 20px',
                            marginBottom: '28px',
                            textAlign: 'center'
                        }}>
                            <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px', fontWeight: '700' }}>Final Score</div>
                            <div style={{
                                fontSize: '2.5rem',
                                fontWeight: '900',
                                color: percentage >= 75 ? '#10b981' : percentage >= 40 ? '#f59e0b' : '#ef4444',
                                lineHeight: 1
                            }}>{percentage}%</div>
                        </div>

                        {/* Per-Question Breakdown */}
                        {perQuestion && perQuestion.length > 0 && (
                            <div style={{ marginBottom: '28px', textAlign: 'left' }}>
                                <p style={{ color: '#94a3b8', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px', fontWeight: '700' }}>Question Breakdown</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {perQuestion.map((q, idx) => {
                                        const pct = q.percentage;
                                        return (
                                            <div key={q.id ? `${q.id}-${idx}` : `q-${idx}`} style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                background: pct === 100 ? 'rgba(16,185,129,0.04)' : pct > 0 ? 'rgba(245,158,11,0.04)' : 'rgba(239,68,68,0.04)',
                                                border: `1px solid ${pct === 100 ? 'rgba(16,185,129,0.15)' : pct > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)'}`,
                                                borderRadius: '8px',
                                                padding: '10px 14px'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <span style={{
                                                        width: '24px', height: '24px',
                                                        borderRadius: '50%',
                                                        background: pct === 100 ? '#10b981' : pct > 0 ? '#f59e0b' : '#ef4444',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        color: 'white', fontSize: '0.7rem', fontWeight: '800'
                                                    }}>Q{idx + 1}</span>
                                                    <span style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: '600' }}>{q.name}</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{
                                                        color: pct === 100 ? '#10b981' : pct > 0 ? '#f59e0b' : '#ef4444',
                                                        fontWeight: '700', fontSize: '0.85rem'
                                                    }}>{q.passed}/{q.total} passed</span>
                                                    {pct === 100 ? <FaCheck style={{ color: '#10b981', fontSize: '0.8rem' }} /> : <FaTimes style={{ color: pct > 0 ? '#f59e0b' : '#ef4444', fontSize: '0.8rem' }} />}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <button
                            onClick={() => navigate(CODING_ROUTE_BASE)}
                            style={{
                                background: 'linear-gradient(135deg, #10b981, #059669)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '10px',
                                padding: '12px 24px',
                                fontSize: '0.95rem',
                                fontWeight: '700',
                                cursor: 'pointer',
                                width: '100%',
                                boxShadow: '0 4px 14px rgba(16,185,129,0.2)',
                                transition: 'all 0.2s'
                            }}
                        >
                            Back to Portal List
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Enable proctoring dynamically if the assessment metadata has proctored flag enabled
    const shouldUseProctoring = Boolean(
        (currentAssessment && (
            currentAssessment.proctored === true ||
            currentAssessment.proctored === 1 ||
            currentAssessment.proctored === "1" ||
            currentAssessment.proctored === "true"
        )) ||
        (isEmbedded && parentSettings && (
            parentSettings.proctored === true ||
            parentSettings.proctored === 1 ||
            parentSettings.proctored === "1" ||
            parentSettings.proctored === "true"
        ))
    );

    const shouldUseAudioProctoring = Boolean(
        (currentAssessment && (
            currentAssessment.audioProctored === true ||
            currentAssessment.audioProctored === 1 ||
            currentAssessment.audioProctored === "1" ||
            currentAssessment.audioProctored === "true"
            // NOTE: do NOT fall back to currentAssessment.proctored here.
            // Camera and audio proctoring are independent — audioProctored: false
            // must remain off even when proctored (camera) is true.
        )) ||
        (isEmbedded && parentSettings && (
            parentSettings.audioProctored === true ||
            parentSettings.audioProctored === 1 ||
            parentSettings.audioProctored === "1" ||
            parentSettings.audioProctored === "true"
            // Same rule: do NOT inherit audio from parentSettings.proctored
        ))
    );

    // ==========================================
    // RENDER: LOADING STATE (STANDALONE & EMBEDDED)
    // ==========================================
    if (loading || (!currentQuestion && !error)) {
        return (
            <div className="coding-workspace-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: isEmbedded ? '400px' : '100vh', background: '#020617' }}>
                <div style={{ textAlign: 'center' }}>
                    <div className="learn-spinner" style={{ width: '48px', height: '48px', borderTopColor: '#10b981', margin: '0 auto 16px' }} />
                    <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>Loading coding assessment...</p>
                </div>
            </div>
        );
    }

    if (error && !currentQuestion) {
        return (
            <div className="coding-workspace-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: isEmbedded ? '400px' : '100vh', background: '#020617', padding: '24px' }}>
                <div style={{ maxWidth: '500px', width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '12px', padding: '32px', textAlign: 'center' }}>
                    <FaExclamationTriangle style={{ color: '#ef4444', fontSize: '2.5rem', marginBottom: '16px' }} />
                    <h3 style={{ color: '#f8fafc', marginBottom: '8px' }}>Unable to Load Assessment</h3>
                    <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '24px' }}>{error}</p>
                    <button
                        onClick={() => navigate('/student/dashboard')}
                        style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 20px', fontWeight: '600', cursor: 'pointer' }}
                    >
                        Back to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    // ==========================================
    // RENDER: WORKSPACE VIEW
    // ==========================================
    const authData = JSON.parse(localStorage.getItem('auth_data') ?? '{}');
    const candidateRoll = authData.rollNumber ?? user?.rollNumber ?? authData.uid ?? 'CANDIDATE';
    const tenantId = authData.tenantId ?? user?.tenantId ?? 'SEED-SEB';

    return (
        <div className="coding-workspace-page">
            <SecurityWatermark rollNumber={candidateRoll} tenantId={tenantId} />
            {/* Proctoring Engine - Active only when assessment is running and proctored is enabled (standalone mode only) */}
            {!isEmbedded && shouldUseProctoring && currentAssessment && user && (
                <ProctoringEngine
                    uid={user.uid || user.id}
                    assessmentId={currentAssessment.id ?? ''}
                    onAutoSubmit={() => {
                        window.dispatchEvent(new CustomEvent('seb:stop-proctoring-hardware'));
                        stopAllMediaAndAI();
                        setIsLockedOut(true);
                        setLockoutReason('camera_violations');
                        setTimeout(() => {
                            autoSubmitAttempt('proctoring_violations');
                        }, 300);
                    }}
                    isTestActive={!!currentAssessment && !submissionSuccess}
                    maxViolations={Number(currentAssessment.proctorConfig?.maxViolations ?? currentAssessment.maxViolations) || 200}
                    onReady={() => {
                        console.log('[CodingAssessmentPage] Camera proctoring ready');
                    }}
                    onViolationUpdate={(violationInfo) => {
                        if (!violationInfo?.violationType) return;
                        const maxLimit = Number(currentAssessment.proctorConfig?.maxViolations ?? currentAssessment.maxViolations) || 200;
                        const currentCount = typeof violationInfo.violationCount === 'number' ? violationInfo.violationCount : 0;
                        if (currentCount >= maxLimit) {
                            window.dispatchEvent(new CustomEvent('seb:stop-proctoring-hardware'));
                            stopAllMediaAndAI();
                            setIsLockedOut(true);
                            setLockoutReason('camera_violations');
                            setTimeout(() => {
                                autoSubmitAttempt('proctoring_violations');
                            }, 300);
                        }
                        setProctoringData(prev => ({
                            ...prev,
                            violationCount: typeof violationInfo.violationCount === 'number'
                                ? violationInfo.violationCount
                                : prev.violationCount,
                            violations: [
                                ...prev.violations,
                                {
                                    type: violationInfo.violationType,
                                    timestamp: violationInfo.timestamp
                                }
                            ]
                        }));
                    }}
                />
            )}
            {!isEmbedded && shouldUseAudioProctoring && currentAssessment && user && (
                <AudioProctoringEngine
                    uid={user.uid || user.id}
                    assessmentId={currentAssessment.id ?? ''}
                    isTestActive={!!currentAssessment && !submissionSuccess}
                    maxViolations={Number(currentAssessment.maxAudioViolations) || Number(settings.maxAudioViolations) || 200}
                    onReady={() => {
                        console.log('[CodingAssessmentPage] Audio proctoring ready');
                    }}
                    onViolationUpdate={(info) => {
                        if (!info?.type) return;
                        setProctoringData(prev => {
                            const nextAudioCount = (prev.audioViolationCount || 0) + 1;
                            const maxLimit = Number(currentAssessment.maxAudioViolations) || Number(settings.maxAudioViolations) || 200;
                            if (nextAudioCount >= maxLimit) {
                                window.dispatchEvent(new CustomEvent('seb:stop-proctoring-hardware'));
                                stopAllMediaAndAI();
                                setIsLockedOut(true);
                                setLockoutReason('audio_violations');
                                setTimeout(() => {
                                    autoSubmitAttempt("proctoring_violations");
                                }, 300);
                            }
                            return {
                                ...prev,
                                audioViolationCount: nextAudioCount,
                                violations: [...prev.violations, { type: info.type, timestamp: info.timestamp }]
                            };
                        });
                    }}
                />
            )}
            {/* Top Workspace Header Bar */}
            <header className="coding-ref-header">
                <div className="coding-ref-header-left">
                    <div className="coding-brand-logo-wrap">
                        <img
                            src="/SEED_Logo_Transparent.png"
                            alt="SEED Logo"
                            className="coding-brand-logo-img"
                            onError={(e) => {
                                e.target.src = '/SEED_Logo.png';
                            }}
                        />
                    </div>
                    <div className="coding-header-title-wrap">
                        <span className="coding-header-brand-title">SEED-SEB</span>
                        <span className="coding-header-section-title">
                            {currentAssessment?.name || (isEmbedded ? "Coding Section" : "Coding Assessment")} • {questions.length} Questions • {questions.reduce((sum, q) => sum + (Number(q.marks) || Number(q.weight) || DEFAULT_QUESTION_WEIGHT), 0)} Marks
                        </span>
                    </div>
                </div>

                <div className="coding-ref-header-right">
                    {/* Saved indicator */}
                    <div className="coding-status-saved">
                        <span className="status-saved-dot" />
                        <span>Saved</span>
                    </div>

                    {/* Proctoring Badges */}
                    {(shouldUseProctoring || shouldUseAudioProctoring) && (
                        <div className="coding-proctor-pills-wrap">
                            {shouldUseAudioProctoring && (
                                <div className="coding-proctor-pill" title="Audio Violations">
                                    <span className={`status-dot ${(isEmbedded ? parentProctoringData?.audioViolationCount : proctoringData.audioViolationCount) > 0 ? 'bad' : 'good'}`} />
                                    Audio: {isEmbedded ? parentProctoringData?.audioViolationCount || 0 : proctoringData.audioViolationCount}/{Number(settings.maxAudioViolations || parentSettings?.maxAudioViolations || currentAssessment?.maxAudioViolations || currentAssessment?.proctorConfig?.maxAudioViolations) || 200}
                                </div>
                            )}
                            {shouldUseProctoring && (
                                <div className="coding-proctor-pill" title="Camera Violations">
                                    <span className={`status-dot ${(isEmbedded ? parentProctoringData?.violationCount : proctoringData.violationCount) > 0 ? 'bad' : 'good'}`} />
                                    Camera: {isEmbedded ? parentProctoringData?.violationCount || 0 : proctoringData.violationCount}/{Number(settings.maxViolations || parentSettings?.maxViolations || currentAssessment?.maxViolations || currentAssessment?.proctorConfig?.maxCameraViolations || currentAssessment?.proctorConfig?.maxViolations) || 200}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Timer Pill */}
                    <div className="coding-header-timer-pill">
                        <FaClock className="timer-icon" />
                        <span className={`timer-digits ${remainingTime <= 300 ? 'warning' : ''} ${remainingTime <= 60 ? 'danger' : ''}`}>
                            {formatRemainingTime()}
                        </span>
                    </div>

                    {/* Flag for Review */}
                    <button
                        type="button"
                        className={`coding-header-flag-btn ${currentQuestion && bookmarkedQuestions[currentQuestion.id] ? 'flagged' : ''}`}
                        onClick={() => currentQuestion && toggleBookmark(currentQuestion.id)}
                        title="Flag question for review"
                    >
                        <FaFlag />
                        <span>{currentQuestion && bookmarkedQuestions[currentQuestion.id] ? 'Flagged' : 'Flag'}</span>
                    </button>

                    {/* End Section / Submit Button */}
                    <button
                        type="button"
                        className="coding-header-end-btn"
                        onClick={() => setShowSubmitModal(true)}
                    >
                        {isEmbedded ? "End Section" : "Submit Assessment"}
                    </button>
                </div>
            </header>

            {/* Main 3-Column Workspace Dashboard */}
            {currentQuestion ? (
                <>
                    <div className="coding-ref-layout-3col" ref={workspaceBodyRef}>
                        {/* 1. LEFTMOST: Collapsible Questions Sidebar */}
                        <aside className={`coding-col-questions-sidebar ${isQuestionsCollapsed ? 'collapsed' : ''}`}>
                            <div className="questions-sidebar-header">
                                {!isQuestionsCollapsed && <span className="questions-sidebar-title">QUESTIONS</span>}
                                <button
                                    type="button"
                                    className="btn-collapse-sidebar"
                                    onClick={() => setIsQuestionsCollapsed(prev => !prev)}
                                    title={isQuestionsCollapsed ? "Expand Questions Panel" : "Collapse Questions Panel"}
                                >
                                    {isQuestionsCollapsed ? <FaChevronRight /> : <FaChevronLeft />}
                                </button>
                            </div>

                            {isQuestionsCollapsed ? (
                                <div className="questions-collapsed-icons-list">
                                    {questions.map((q, idx) => {
                                        const isCurrent = idx === activeQuestionIndex;
                                        const isAttempted = questionScores[q.id]?.submitted;
                                        const isVisited = questionScores[q.id]?.lastRunAt;

                                        let miniClass = 'collapsed-q-btn';
                                        if (isCurrent) miniClass += ' active';
                                        else if (isAttempted) miniClass += ' submitted';
                                        else if (isVisited) miniClass += ' attempted';

                                        return (
                                            <button
                                                key={q.id ? `${q.id}-${idx}` : `q-${idx}`}
                                                type="button"
                                                className={miniClass}
                                                onClick={() => {
                                                    handleSwitchQuestion(idx);
                                                    setVisitedQuestions(prev => ({ ...prev, [q.id]: true }));
                                                }}
                                                title={`Q${idx + 1}: ${q.title || `Question ${idx + 1}`} (${isAttempted ? 'Submitted' : isVisited ? 'Attempted' : 'Not attempted'})`}
                                            >
                                                {idx + 1}
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <>
                                    <div className="questions-list-scroll">
                                        {questions.map((q, idx) => {
                                            const isCurrent = idx === activeQuestionIndex;
                                            const isAttempted = questionScores[q.id]?.submitted;

                                            let statusLabel = 'Not attempted';
                                            let statusClass = 'not-attempted';
                                            if (isAttempted) {
                                                statusLabel = 'Submitted';
                                                statusClass = 'submitted';
                                            } else if (questionScores[q.id]?.lastRunAt) {
                                                statusLabel = 'Attempted';
                                                statusClass = 'attempted';
                                            }

                                            return (
                                                <div
                                                    key={q.id ? `${q.id}-${idx}` : `q-${idx}`}
                                                    className={`question-sidebar-card ${isCurrent ? 'active' : ''}`}
                                                    onClick={() => {
                                                        handleSwitchQuestion(idx);
                                                        setVisitedQuestions(prev => ({ ...prev, [q.id]: true }));
                                                    }}
                                                >
                                                    <div className="q-card-badge">{idx + 1}</div>
                                                    <div className="q-card-info">
                                                        <div className="q-card-name" title={q.title || q.name || `Question ${idx + 1}`}>
                                                            {q.title || q.name || `Question ${idx + 1}`}
                                                        </div>
                                                        <div className={`q-card-status ${statusClass}`}>
                                                            • {statusLabel}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Legend Summary */}
                                    <div className="questions-sidebar-legend">
                                        <div className="legend-row">
                                            <span className="legend-dot-indicator submitted" />
                                            <span className="legend-row-label">Submitted</span>
                                            <span className="legend-row-count">
                                                {questions.filter(q => questionScores[q.id]?.submitted).length}
                                            </span>
                                        </div>
                                        <div className="legend-row">
                                            <span className="legend-dot-indicator attempted" />
                                            <span className="legend-row-label">Attempted</span>
                                            <span className="legend-row-count">
                                                {questions.filter(q => !questionScores[q.id]?.submitted && questionScores[q.id]?.lastRunAt).length}
                                            </span>
                                        </div>
                                        <div className="legend-row">
                                            <span className="legend-dot-indicator not-attempted" />
                                            <span className="legend-row-label">Not attempted</span>
                                            <span className="legend-row-count">
                                                {questions.filter(q => !questionScores[q.id]?.submitted && !questionScores[q.id]?.lastRunAt).length}
                                            </span>
                                        </div>
                                    </div>
                                </>
                            )}
                        </aside>

                        {/* 2. MIDDLE-LEFT: Problem Statement Card (Resizable width) */}
                        <main
                            className="coding-col-problem-card"
                            style={isEditorFullscreen ? { display: 'none' } : { width: `${leftPaneWidth}%`, minWidth: '260px', maxWidth: '75%', flex: 'none' }}
                        >
                            <div className="problem-card-top-row">
                                <span className="problem-q-count">
                                    Question {activeQuestionIndex + 1} of {questions.length}
                                </span>
                                <div className="problem-header-arrows">
                                    <button
                                        type="button"
                                        className="problem-arrow-btn"
                                        disabled={activeQuestionIndex === 0 || isRunning || isEvaluating || activeQState.isRunning || activeQState.isEvaluating}
                                        onClick={() => handleSwitchQuestion(i => i - 1)}
                                        title="Previous Question"
                                    >
                                        <FaChevronLeft />
                                    </button>
                                    <button
                                        type="button"
                                        className="problem-arrow-btn"
                                        disabled={activeQuestionIndex === questions.length - 1 || isRunning || isEvaluating || activeQState.isRunning || activeQState.isEvaluating}
                                        onClick={() => handleSwitchQuestion(i => i + 1)}
                                        title="Next Question"
                                    >
                                        <FaChevronRight />
                                    </button>
                                </div>
                            </div>

                            <div className="problem-card-scroll-body">
                                <h2 className="problem-title">
                                    {currentQuestion?.title || currentQuestion?.name || 'Problem Statement'}
                                </h2>

                                <div className="problem-marks-badge">
                                    {currentQuestion?.marks ? `${currentQuestion.marks} Marks` : '100 Marks'}
                                </div>

                                <div className="problem-description-text">
                                    <ProblemMarkdownRenderer content={currentQuestion?.description || currentQuestion?.content?.problemStatement || 'Solve the challenge as specified below.'} />
                                    {(currentQuestion?.imageUrl || currentQuestion?.image || currentQuestion?.figure || currentQuestion?.diagram || currentQuestion?.questionImage || currentQuestion?.assetUrl || currentQuestion?.content?.imageUrl || currentQuestion?.content?.image) && (
                                        <div style={{ margin: '16px 0', textAlign: 'center' }}>
                                            <ProblemImage 
                                                src={currentQuestion?.imageUrl || currentQuestion?.image || currentQuestion?.figure || currentQuestion?.diagram || currentQuestion?.questionImage || currentQuestion?.assetUrl || currentQuestion?.content?.imageUrl || currentQuestion?.content?.image} 
                                                alt={currentQuestion?.title || "Problem Illustration"} 
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Constraints */}
                                {currentQuestion?.constraints && (
                                    <div className="problem-constraints-block">
                                        <h4 style={{ fontSize: '13px', fontWeight: 700, margin: '14px 0 6px 0', textTransform: 'uppercase', color: 'var(--ps-primary, #10b981)' }}>Constraints</h4>
                                        <ProblemMarkdownRenderer content={currentQuestion.constraints} />
                                    </div>
                                )}

                                {/* Sample Test Case Example Blocks */}
                                {(currentQuestion?.sampleTests || currentQuestion?.sampleTestCases || currentQuestion?.content?.sampleTestCases || []).map((st, i) => (
                                    <div key={i} className="problem-example-card">
                                        <span className="example-card-heading">EXAMPLE {i + 1}</span>
                                        <div className="example-field-line">
                                            <strong>Input:</strong> <code>{st.input ?? "No Input"}</code>
                                        </div>
                                        <div className="example-field-line">
                                            <strong>Output:</strong> <code>{st.expected || st.expectedOutput || ''}</code>
                                        </div>
                                        {st.explanation && (
                                            <div className="example-field-line explanation">
                                                <strong>Explanation:</strong> <ProblemMarkdownRenderer content={st.explanation} />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div className="problem-card-footer-actions">
                                <button type="button" className="btn-problem-action" onClick={() => setShowEditorialModal(true)}>
                                    <FaBookOpen /> Editorial
                                </button>
                                <button type="button" className="btn-problem-action" onClick={() => setShowDiscussModal(true)}>
                                    <FaComments /> Discuss
                                </button>
                            </div>
                        </main>

                        {/* VERTICAL DIVIDER: Drag to resize Problem Card vs Right Workspace */}
                        {!isEditorFullscreen && (
                            <div
                                className="coding-pane-resizer-vertical"
                                onMouseDown={startVertDrag}
                                title="Drag to resize problem statement and workspace panes"
                            >
                                <div className="resizer-handle-grip" />
                            </div>
                        )}

                        {/* 3. RIGHT WORKSPACE: Code Editor (Top) & Test Cases Pane (Bottom) */}
                        <section className="coding-col-center-workspace" ref={rightPaneRef} style={{ flex: 1, minWidth: '320px', width: isEditorFullscreen ? '100%' : 'auto' }}>
                            {/* Editor Card */}
                            <div className={`coding-editor-card ${editorTheme === 'light' ? 'light-mode' : 'dark-mode'}`} style={{ flex: 1, minHeight: '180px' }}>
                                <div className="editor-top-toolbar">
                                    <div className="editor-toolbar-left-pills">
                                        <select
                                            value={activeQState.selectedLanguage || language || 'cpp'}
                                            onChange={(e) => handleLanguageChange(e.target.value)}
                                            className="editor-pill-select"
                                        >
                                            <option value="cpp">C++ (GCC G++)</option>
                                            <option value="c">C (GCC GCC)</option>
                                            <option value="python">Python 3.10</option>
                                            <option value="java">Java (OpenJDK)</option>
                                            <option value="javascript">JavaScript (Node.js 18)</option>
                                        </select>

                                        <select
                                            value={editorTheme}
                                            onChange={(e) => {
                                                setEditorTheme(e.target.value);
                                                try { localStorage.setItem('coding_editor_theme', e.target.value); } catch (_) {}
                                            }}
                                            className="editor-pill-select"
                                        >
                                            <option value="vs-dark">Dark</option>
                                            <option value="light">Light</option>
                                        </select>
                                    </div>

                                    <div className="editor-toolbar-right-icons">
                                        <button
                                            type="button"
                                            className="editor-toolbar-icon-btn"
                                            onClick={handleResetCode}
                                            title="Reset Code"
                                        >
                                            <FaUndo />
                                        </button>
                                        {isEditorFullscreen && (
                                            <button
                                                type="button"
                                                className="editor-pill-select"
                                                style={{ background: 'rgba(59, 130, 246, 0.18)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.4)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 600 }}
                                                onClick={() => {
                                                    setIsEditorFullscreen(false);
                                                    setTimeout(() => editorRef.current?.layout?.(), 50);
                                                }}
                                                title="Restore Question Statement Pane"
                                            >
                                                <FaBookOpen style={{ fontSize: '11px' }} />
                                                <span>Show Problem Pane</span>
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className={`editor-toolbar-icon-btn ${isEditorFullscreen ? 'active' : ''}`}
                                            onClick={() => {
                                                setIsEditorFullscreen(f => {
                                                    const next = !f;
                                                    setTimeout(() => editorRef.current?.layout?.(), 50);
                                                    return next;
                                                });
                                            }}
                                            title={isEditorFullscreen ? "Exit Fullscreen (Restore Question Pane)" : "Fullscreen Editor (Minimise Question Pane)"}
                                        >
                                            {isEditorFullscreen ? <FaCompress /> : <FaExpand />}
                                        </button>
                                    </div>
                                </div>

                                <div className="editor-monaco-body">
                                    <Editor
                                        key={`${currentCanonicalQKey}_${activeQState.selectedLanguage}_${editorTheme}`}
                                        height="100%"
                                        language={activeQState.selectedLanguage === 'cpp' ? 'cpp' : (activeQState.selectedLanguage === 'c' ? 'c' : (activeQState.selectedLanguage === 'javascript' ? 'javascript' : activeQState.selectedLanguage))}
                                        value={getCurrentCode(currentQuestion, activeQState.selectedLanguage)}
                                        onChange={(val) => handleCodeChange(currentCanonicalQKey, activeQState.selectedLanguage, val)}
                                        onMount={(editor, monaco) => {
                                            editorRef.current = editor;
                                            remeasureMonacoFonts(monaco, editor);
                                        }}
                                        theme={editorTheme === 'light' ? 'vs' : 'vs-dark'}
                                        options={{
                                            ...MONACO_FONT_OPTIONS,
                                            fontSize: 14,
                                            minimap: { enabled: false },
                                            scrollbar: { vertical: 'visible', horizontal: 'visible' },
                                            automaticLayout: true,
                                            cursorBlinking: 'smooth',
                                            wordWrap: 'on'
                                        }}
                                    />
                                </div>

                                <div className="editor-bottom-action-bar">
                                    <button
                                        type="button"
                                        className="btn-run-code-emerald"
                                        onClick={runSampleTestCases}
                                        disabled={isRunning || isEvaluating || activeQState.isRunning || activeQState.isEvaluating}
                                    >
                                        {(isRunning || activeQState.isRunning) ? (
                                            <><div className="button-spinner" /> Running...</>
                                        ) : (
                                            <><FaPlay /> Run Code</>
                                        )}
                                    </button>

                                    <button
                                        type="button"
                                        className={`btn-submit-code-dark ${activeQState.samplesPassedAll ? 'ready-to-submit' : 'submit-locked'}`}
                                        onClick={handleSubmitQuestion}
                                        disabled={!activeQState.samplesPassedAll || isRunning || isEvaluating || activeQState.isRunning || activeQState.isEvaluating}
                                        title={!activeQState.samplesPassedAll ? "Run Code and pass all sample test cases to enable submission" : "Submit Question Code"}
                                    >
                                        {(isEvaluating || activeQState.isEvaluating) ? (
                                            <><div className="button-spinner" /> Evaluating...</>
                                        ) : (
                                            <><FaCheck /> Submit Code</>
                                        )}
                                    </button>

                                    {/* Clear visual badge showing submit requirement status */}
                                    <div className={`submit-req-indicator ${activeQState.samplesPassedAll ? 'unlocked' : 'locked'}`}>
                                        {activeQState.samplesPassedAll ? (
                                            <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', fontWeight: 600 }}>
                                                <FaCheckCircle /> All samples passed (Submit enabled)
                                            </span>
                                        ) : (
                                            <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', fontWeight: 500 }}>
                                                <FaExclamationTriangle /> Run Code &amp; pass all samples to submit
                                            </span>
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        className={`btn-custom-input-toggle ${useCustomInput ? 'active' : ''}`}
                                        onClick={() => {
                                            setUseCustomInput(prev => !prev);
                                            if (!useCustomInput) setActiveResultTab('input');
                                        }}
                                    >
                                        <FaCog /> Custom Input
                                    </button>
                                </div>
                            </div>

                            {/* HORIZONTAL DIVIDER: Drag to resize Editor vs Testcases Pane */}
                            <div
                                className="coding-pane-resizer-horizontal"
                                onMouseDown={startHorizDrag}
                                title="Drag to resize test cases and editor panes"
                            >
                                <div className="resizer-handle-grip-horiz" />
                            </div>

                            {/* Test Cases & Output Card (Resizable height) */}
                            <div
                                className="coding-testcases-card"
                                style={{ height: `${outputPaneHeight}px`, flexShrink: 0 }}
                            >
                                <div className="testcases-tabs-header" style={{ display: 'flex', alignItems: 'center' }}>
                                    <button
                                        type="button"
                                        className={`testcases-tab-btn ${activeResultTab !== 'console' ? 'active' : ''}`}
                                        onClick={() => setActiveResultTab('output')}
                                    >
                                        Test Cases
                                    </button>
                                    <button
                                        type="button"
                                        className={`testcases-tab-btn ${activeResultTab === 'console' ? 'active' : ''}`}
                                        onClick={() => setActiveResultTab('console')}
                                    >
                                        Output {stderr ? '●' : ''}
                                    </button>
                                    {useCustomInput && (
                                        <button
                                            type="button"
                                            className={`testcases-tab-btn ${activeResultTab === 'input' ? 'active' : ''}`}
                                            onClick={() => setActiveResultTab('input')}
                                        >
                                            Custom Input
                                        </button>
                                    )}
                                    {(isRunning || isEvaluating) && (
                                        <div style={{
                                            marginLeft: 'auto',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '4px 12px',
                                            background: '#1e293b',
                                            border: '1px solid rgba(255, 255, 255, 0.2)',
                                            borderRadius: '6px',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            color: '#ffffff'
                                        }}>
                                            <div className="button-spinner" style={{ width: '12px', height: '12px', borderTopColor: '#ffffff' }} />
                                            <span>{evalProgressText || (isRunning ? 'Compiling & Running...' : 'Evaluating Test Cases...')}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="testcases-card-body">
                                    {sampleRunBanner && (
                                        <div className={`sample-run-banner ${sampleRunBanner.passed === sampleRunBanner.total ? 'success' : 'warning'}`} style={{
                                            margin: '8px 12px 10px 12px',
                                            padding: '8px 14px',
                                            borderRadius: '8px',
                                            background: sampleRunBanner.passed === sampleRunBanner.total ? 'rgba(16, 185, 129, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                                            border: `1px solid ${sampleRunBanner.passed === sampleRunBanner.total ? 'rgba(16, 185, 129, 0.4)' : 'rgba(234, 179, 8, 0.4)'}`,
                                            color: sampleRunBanner.passed === sampleRunBanner.total ? '#10b981' : '#facc15',
                                            fontSize: '12.5px',
                                            fontWeight: 600,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span>{sampleRunBanner.passed === sampleRunBanner.total ? '✓' : '⚠'}</span>
                                                <span>
                                                    {sampleRunBanner.passed === sampleRunBanner.total 
                                                        ? `All ${sampleRunBanner.total} Sample Test Cases Passed!` 
                                                        : `${sampleRunBanner.passed} of ${sampleRunBanner.total} Sample Test Cases Passed`}
                                                </span>
                                            </div>
                                            <span style={{ fontSize: '11px', opacity: 0.75, color: 'var(--text-muted)' }}>{sampleRunBanner.time}</span>
                                        </div>
                                    )}
                                    {activeResultTab === 'input' ? (
                                        <textarea
                                            className="custom-stdin-textarea"
                                            placeholder="Enter standard input (stdin)..."
                                            value={customInput}
                                            onChange={(e) => setCustomInput(e.target.value)}
                                        />
                                    ) : activeResultTab === 'console' ? (
                                        <div className="console-output-scroll">
                                            {stderr ? (
                                                <pre className="output-stderr-pre">
                                                    <strong>Execution Error:</strong><br />
                                                    {stderr}
                                                </pre>
                                            ) : stdout ? (
                                                <pre className="output-stdout-pre">
                                                    <strong>Program Output:</strong><br />
                                                    {stdout}
                                                </pre>
                                            ) : (
                                                <div className="terminal-empty-state">
                                                    <span>No output yet. Click "Run Code" to view execution logs.</span>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="testcases-accordion-scroll">
                                            {/* High-visibility inline submission banner (replaces blocking modal popup) */}
                                            {activeQState.submitted && (
                                                <div className={`coding-submission-inline-banner ${activeQState.evalStatus === 'Accepted' ? 'status-accepted' : (activeQState.passedCount > 0 ? 'status-partial' : 'status-wrong')}`}>
                                                    <div className="submission-banner-left">
                                                        {activeQState.evalStatus === 'Accepted' ? (
                                                            <FaCheckCircle className="banner-icon icon-success" />
                                                        ) : (activeQState.passedCount > 0 ? (
                                                            <FaExclamationTriangle className="banner-icon icon-warning" />
                                                        ) : (
                                                            <FaTimesCircle className="banner-icon icon-danger" />
                                                        ))}
                                                        <div>
                                                            <div className="banner-status-title">
                                                                {activeQState.evalStatus === 'Accepted' ? 'Accepted' : (activeQState.passedCount > 0 ? 'Partially Accepted' : 'Wrong Answer')}
                                                            </div>
                                                            <div className="banner-status-sub">
                                                                Hidden Test Cases: <strong>{activeQState.passedCount ?? 0}/{activeQState.totalHidden ?? (currentQuestion?.hiddenTests?.length || 0)} passed</strong>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="submission-banner-right">
                                                        <span className="banner-score-pill">
                                                            Score: {activeQState.scorePercent ?? (questionScores[currentQuestion?.id]?.percentage || 0)}%
                                                        </span>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Custom testcase result if active */}
                                            {useCustomInput && (() => {
                                                const customItem = (activeQState.runResults || []).find(r => r.isCustom || r.index === 'Custom');
                                                const isPassed = customItem?.passed === true;
                                                const isFailed = customItem && customItem.passed === false;
                                                const isCustomExpanded = expandedTestCaseIndex === 'custom';
                                                return (
                                                    <div key="custom" className={`tc-item-row custom ${isCustomExpanded ? 'expanded' : ''}`}>
                                                        <div
                                                            className="tc-item-header"
                                                            onClick={() => setExpandedTestCaseIndex(isCustomExpanded ? -1 : 'custom')}
                                                        >
                                                            <div className="tc-header-left">
                                                                {isCustomExpanded ? <FaChevronDown className="tc-chevron" /> : <FaChevronRight className="tc-chevron" />}
                                                                <span className="tc-title">Custom Input</span>
                                                            </div>
                                                            <span className={`tc-status-text ${customItem ? (isPassed ? 'passed' : 'failed') : 'not-run'}`}>
                                                                {customItem ? (isPassed ? 'Executed' : 'Error') : 'Not Run'}
                                                            </span>
                                                        </div>

                                                        {isCustomExpanded && (
                                                            <div className="tc-item-expanded-fields">
                                                                <div className="tc-field-col">
                                                                    <span className="tc-field-label">INPUT</span>
                                                                    <div className="tc-field-val-box">{customInput || '(Empty stdin)'}</div>
                                                                </div>
                                                                <div className="tc-field-col">
                                                                    <span className="tc-field-label">EXPECTED</span>
                                                                    <div className="tc-field-val-box">N/A (Custom Run)</div>
                                                                </div>
                                                                <div className="tc-field-col">
                                                                    <span className="tc-field-label">YOUR OUTPUT</span>
                                                                    <div className={`tc-field-val-box ${isPassed ? 'passed' : isFailed ? 'failed' : 'not-run'}`}>
                                                                        {customItem?.actual || (customItem ? '[Empty]' : 'Not run yet')}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}

                                            {/* Sample / All Test Cases */}
                                            {(() => {
                                                const sampleCases = getQuestionSampleTestCases(currentQuestion);
                                                const allVisibleCases = getQuestionVisibleAllTestCases(currentQuestion, 6);
                                                const tcList = selectedTestCaseSet === 'all' ? allVisibleCases : (sampleCases.length > 0 ? sampleCases : allVisibleCases);
                                                const activeResults = activeQState.runResults || activeQState.evalResults || questionScores[currentQuestion?.id]?.testResults;

                                                return tcList.map((tc, idx) => {
                                                    const runItem = activeResults?.find(r => r.index === idx + 1);
                                                    const isPassed = runItem?.passed === true;
                                                    const isFailed = runItem && runItem.passed === false;
                                                    const isExpanded = expandedTestCaseIndex === idx;
                                                    const actualOut = runItem?.actual ?? '';

                                                    return (
                                                        <div key={idx} className={`tc-item-row ${isExpanded ? 'expanded' : ''}`}>
                                                            <div
                                                                className="tc-item-header"
                                                                onClick={() => setExpandedTestCaseIndex(isExpanded ? -1 : idx)}
                                                            >
                                                                <div className="tc-header-left">
                                                                    {isExpanded ? <FaChevronDown className="tc-chevron" /> : <FaChevronRight className="tc-chevron" />}
                                                                    <span className="tc-title">Test Case {idx + 1}</span>
                                                                </div>
                                                                <span className={`tc-status-text ${isPassed ? 'passed' : isFailed ? 'failed' : 'not-run'}`}>
                                                                    {isPassed ? 'Passed' : isFailed ? 'Failed' : 'Not Run'}
                                                                </span>
                                                            </div>

                                                            {isExpanded && (
                                                                <div className="tc-item-expanded-fields">
                                                                    <div className="tc-field-col">
                                                                        <span className="tc-field-label">INPUT</span>
                                                                        <div className="tc-field-val-box">{tc.input ?? "No Input"}</div>
                                                                    </div>
                                                                    <div className="tc-field-col">
                                                                        <span className="tc-field-label">EXPECTED</span>
                                                                        <div className="tc-field-val-box">{tc.expectedOutput || tc.expected || ''}</div>
                                                                    </div>
                                                                    <div className="tc-field-col">
                                                                        <span className="tc-field-label">YOUR OUTPUT</span>
                                                                        <div className={`tc-field-val-box ${isPassed ? 'passed' : isFailed ? 'failed' : 'not-run'}`}>
                                                                            {actualOut || (runItem ? '[Empty]' : 'Not run yet')}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* ── BOTTOM NAVIGATION FOOTER ── */}
                    <footer className="coding-ref-bottom-footer">
                        <button
                            type="button"
                            className="btn-prev-question-clean"
                            disabled={activeQuestionIndex === 0 || isRunning || isEvaluating || activeQState.isRunning || activeQState.isEvaluating}
                            onClick={() => handleSwitchQuestion(i => i - 1)}
                        >
                            <FaChevronLeft /> Previous Question
                        </button>

                        {activeQuestionIndex < questions.length - 1 && (
                            <button
                                type="button"
                                className="btn-save-next-emerald"
                                disabled={isRunning || isEvaluating || activeQState.isRunning || activeQState.isEvaluating}
                                onClick={() => handleSwitchQuestion(i => i + 1)}
                            >
                                <span>Next Question</span>
                                <FaChevronRight />
                            </button>
                        )}
                    </footer>
                </>
            ) : (
                <div className="workspace-loading-fallback">
                    <div className="learn-spinner"></div>
                    <p>Loading Workspace Questions...</p>
                </div>
            )}

            {/* Editorial Modal Overlay */}
            {showEditorialModal && (
                <div className="mcq-confirm-dialog" style={{ zIndex: 10008 }}>
                    <div className="mcq-confirm-content" style={{ maxWidth: '600px', textAlign: 'left' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FaBookOpen style={{ color: '#10b981' }} /> Editorial &amp; Algorithm Notes
                            </h3>
                            <button type="button" onClick={() => setShowEditorialModal(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}>
                                <FaTimes />
                            </button>
                        </div>
                        <p style={{ color: '#cbd5e1', lineHeight: '1.6', fontSize: '0.9rem' }}>
                            <strong>Problem:</strong> {currentQuestion?.title ?? ''}<br />
                            <strong>Approach:</strong> Optimize solution using efficient data structures (such as hash maps or binary search) to achieve $O(n)$ or $O(n \log n)$ time complexity.
                        </p>
                        <div className="mcq-confirm-buttons" style={{ justifyContent: 'flex-end', marginTop: '16px' }}>
                            <button type="button" className="btn-confirm-submit" onClick={() => setShowEditorialModal(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Discuss Modal Overlay */}
            {showDiscussModal && (
                <div className="mcq-confirm-dialog" style={{ zIndex: 10008 }}>
                    <div className="mcq-confirm-content" style={{ maxWidth: '600px', textAlign: 'left' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FaComments style={{ color: '#3b82f6' }} /> Discussion &amp; Clarifications
                            </h3>
                            <button type="button" onClick={() => setShowDiscussModal(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}>
                                <FaTimes />
                            </button>
                        </div>
                        <p style={{ color: '#cbd5e1', lineHeight: '1.6', fontSize: '0.9rem' }}>
                            <strong>Clarifications:</strong><br />
                            • Pay attention to large input constraints to avoid Time Limit Exceeded (TLE).<br />
                            • Handle edge cases: single-element inputs, negative values, and integer overflow.
                        </p>
                        <div className="mcq-confirm-buttons" style={{ justifyContent: 'flex-end', marginTop: '16px' }}>
                            <button type="button" className="btn-confirm-submit" onClick={() => setShowDiscussModal(false)}>Understood</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Lockout overlay (visible on proctor violation) */}
            {isLockedOut && (
                <div className="proctor-lockout-overlay">
                    <div className="lockout-card">
                        <FaLock className="lock-icon" />
                        <h2>WORKSPACE LOCKED OUT</h2>
                        <p>
                            {lockoutReason === 'audio_violations'
                                ? 'Your access has been revoked due to excessive audio / noise violations.'
                                : lockoutReason === 'camera_violations'
                                ? 'Your access has been revoked due to repeated webcam proctoring violations.'
                                : 'Your access to this coding assessment has been revoked because you have switched tabs/minimized windows 3 times.'}
                        </p>
                        <p>
                            {isSubmitting ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#38bdf8' }}>
                                    Evaluating and submitting your code... Please wait.
                                </span>
                            ) : (
                                'Your progress has been automatically calculated and submitted.'
                            )}
                        </p>
                        <button 
                            onClick={() => navigate(CODING_ROUTE_BASE)} 
                            className="exit-btn"
                            disabled={isSubmitting}
                            style={{ opacity: isSubmitting ? 0.6 : 1, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
                        >
                            {isSubmitting ? 'Submitting...' : 'Exit Assessment'}
                        </button>
                    </div>
                </div>
            )}

            {/* Manual submission confirm dialog */}
            {showSubmitModal && !isSubmitting && (
                <div className="passkey-modal-overlay" style={{ zIndex: 1050 }}>
                    <div className="passkey-modal" style={{ maxWidth: '520px', width: '90%' }}>
                        <div className="passkey-modal-header" style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', borderBottom: '1px solid #334155' }}>
                            <h3 style={{ color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FaExclamationTriangle style={{ color: '#f59e0b' }} /> Submit Assessment
                            </h3>
                            <button onClick={() => setShowSubmitModal(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.1rem' }}><FaTimes /></button>
                        </div>
                        <div className="passkey-modal-body" style={{ padding: '20px', background: '#0f172a' }}>
                            {/* Cannot Re-Attempt Warning */}
                            <div style={{
                                background: 'rgba(239,68,68,0.12)',
                                border: '1px solid rgba(239,68,68,0.4)',
                                borderRadius: '10px',
                                padding: '12px 16px',
                                marginBottom: '18px',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '10px'
                            }}>
                                <FaLock style={{ color: '#ef4444', marginTop: '2px', flexShrink: 0 }} />
                                <div>
                                    <p style={{ margin: 0, color: '#fca5a5', fontWeight: '700', fontSize: '0.9rem' }}> Cannot Re-Attempt</p>
                                    <p style={{ margin: '4px 0 0', color: '#fda4af', fontSize: '0.82rem', lineHeight: '1.4' }}>
                                        Once submitted, this assessment is permanently locked. You will not be able to retake or modify your answers.
                                    </p>
                                </div>
                            </div>

                            {/* Per-Question Summary */}
                            <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Question Status</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                                {questions.map((q, idx) => {
                                    const qs = questionScores[q.id];
                                    const submitted = qs?.submitted;
                                    const passed = qs?.passed || 0;
                                    const total = qs?.total || (q.hiddenTests?.length || q.sampleTests?.length || 0);
                                    const pct = qs?.percentage || 0;
                                    return (
                                        <div key={q.id ? `${q.id}-${idx}` : `q-${idx}`} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            background: submitted ? 'rgba(16,185,129,0.08)' : 'rgba(100,116,139,0.08)',
                                            border: `1px solid ${submitted ? 'rgba(16,185,129,0.25)' : 'rgba(100,116,139,0.2)'}`,
                                            borderRadius: '8px',
                                            padding: '9px 14px'
                                        }}>
                                            <span style={{ color: '#cbd5e1', fontSize: '0.88rem', fontWeight: '600' }}>Q{idx + 1}: {q.name || q.title || 'Question'}</span>
                                            {submitted ? (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{
                                                        background: pct === 100 ? 'rgba(16,185,129,0.2)' : pct > 0 ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)',
                                                        color: pct === 100 ? '#10b981' : pct > 0 ? '#f59e0b' : '#ef4444',
                                                        border: `1px solid ${pct === 100 ? '#10b981' : pct > 0 ? '#f59e0b' : '#ef4444'}`,
                                                        borderRadius: '20px',
                                                        padding: '2px 10px',
                                                        fontSize: '0.78rem',
                                                        fontWeight: '700'
                                                    }}>{passed}/{total} passed</span>
                                                </span>
                                            ) : (
                                                <span style={{ color: '#64748b', fontSize: '0.78rem', fontStyle: 'italic' }}>Not evaluated</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '14px', textAlign: 'center' }}>
                                Unevaluated questions will be scored 0. Are you sure you want to submit?
                            </p>
                        </div>
                        <div className="passkey-modal-footer" style={{ background: '#0f172a', borderTop: '1px solid #1e293b', justifyContent: 'space-between', display: 'flex', padding: '14px 20px' }}>
                            <button className="cancel-btn" onClick={() => setShowSubmitModal(false)}>Go Back</button>
                            <button
                                className="confirm-btn"
                                onClick={handleFinalSubmit}
                                style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                <FaCheck /> Confirm & Submit
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Submit & Evaluation Fullscreen Overlay (SEB Boot Branded Theme - standalone mode only) */}
            {!isEmbedded && (isSubmitting || submitPhase) && (
                <div className="seb-boot" style={{ zIndex: 99999 }}>
                    <div className="seb-boot__brand">
                        <div className="seb-boot__spinner-ring"></div>
                        <div className="seb-boot__logo-wrapper">
                            <img src="/SEED_Logo.png" alt="SEED-IT Platform" className="seb-boot__logo" />
                        </div>
                    </div>
                    <div className="seb-boot__title">
                        {submitPhase === 'evaluating' ? 'Evaluating Code Solutions...' : 'Submitting Assessment Results...'}
                    </div>
                    <div className="seb-boot__status">
                        <span className="seb-boot__dot"></span>
                        <span>
                            {submitPhase === 'evaluating'
                                ? 'Running hidden test cases on your code · Calculating official scores...'
                                : 'Saving assessment records securely to the examination server...'}
                        </span>
                    </div>
                    <div className="seb-boot__progress-bar" style={{ width: '240px' }}>
                        <div className="seb-boot__progress-fill"></div>
                    </div>
                    <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '16px', maxWidth: '400px', textAlign: 'center', lineHeight: 1.5 }}>
                        Please do not refresh, exit, or close this window while submission is in progress.
                    </p>
                </div>
            )}

            {/* Custom Alert Modal */}
            {alertConfig && (
                <div className="passkey-modal-overlay" style={{ zIndex: 1100 }}>
                    <div className="passkey-modal" style={{ maxWidth: '400px' }}>
                        <div className="passkey-modal-header" style={{ backgroundColor: alertConfig.type === 'error' ? '#fee2e2' : '#f0fdf4' }}>
                            <h3 style={{ color: alertConfig.type === 'error' ? '#991b1b' : '#166534', margin: 0 }}>
                                {alertConfig.title}
                            </h3>
                            <button 
                                onClick={() => {
                                    const cb = alertConfig.onClose;
                                    setAlertConfig(null);
                                    if (cb) cb();
                                }}
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.1rem', color: '#94a3b8' }}
                            >
                                <FaTimes />
                            </button>
                        </div>
                        <div className="passkey-modal-body">
                            <p style={{ margin: 0, color: '#334155', fontSize: '0.95rem', lineHeight: '1.5' }}>
                                {alertConfig.message}
                            </p>
                        </div>
                        <div className="passkey-modal-footer" style={{ backgroundColor: alertConfig.type === 'error' ? '#fee2e2' : '#f0fdf4', justifyContent: 'flex-end', display: 'flex' }}>
                            <button 
                                className="confirm-btn" 
                                style={{ 
                                    backgroundColor: alertConfig.type === 'error' ? '#ef4444' : '#10b981', 
                                    color: 'white',
                                    border: 'none',
                                    padding: '8px 16px',
                                    borderRadius: '6px',
                                    fontWeight: '700',
                                    cursor: 'pointer'
                                }}
                                onClick={() => {
                                    const cb = alertConfig.onClose;
                                    setAlertConfig(null);
                                    if (cb) cb();
                                }}
                            >
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

// Re-export a wrapper that shows the success screen
const CodingAssessmentPageWrapper = () => {
    // This wrapper is handled inline in the component via submissionSuccess state
    return <CodingAssessmentPage />;
};


export default CodingAssessmentPage;
