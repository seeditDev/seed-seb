import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, Link } from '../router-compat';
import Editor from '@monaco-editor/react';
import { 
    FaArrowLeft, FaPlay, FaCheck, FaTimes, FaUndo, FaBookmark, 
    FaClock, FaLock, FaExclamationTriangle, FaCheckCircle, 
    FaSearch, FaChevronLeft, FaChevronRight, FaSignOutAlt, FaUser 
} from 'react-icons/fa';
import desktopBridge from '../utils/desktopBridge';
import CodingAssessmentService from '../services/codingAssessmentService';
import DataService from '../services/dataService';
import timeService from '../services/timeService';
import { clearAllProctorCache, getViolations, recordViolation } from '../utils/proctorCache';
import { auth } from '../firebase-config';
import ProctoringEngine from './ProctoringEngine';
import AudioProctoringEngine from './AudioProctoringEngine';
import ProctoringInstructions from './ProctoringInstructions';
import { getAuthData } from '../utils/storageUtils';
import { buildUnifiedResultPayload } from '../utils/resultTransformer';
import { normalizeTestCaseArray } from '../utils/testCaseUtils';
import '../styles/CodingAssessmentPage.css';
import { fetchContentJSON } from '../utils/contentApi';
import { useTabSwitchGuard } from '../utils/tabSwitchGuard';
import { createSubmitGuard } from '../utils/submitGuard';
import { readJSON } from '../utils/safeStorage';
import { throttledLocalStorageSet, flushThrottledWrites } from '../utils/throttle';
import { markAssessmentCompleted } from '../services/attemptStatusService';
import { toast } from 'sonner';

const LOCAL_BASE_URL = '/seed-contents';
const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/seeditDev/seed-contents/main';


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
  java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        // Write your code here
    }
}`,
  python: `# Write your code here
`,
  javascript: `// Write your code here
console.log("Hello, World!");
`
};

const slugify = (value = '') => {
    if (!value) return 'coding-test';
    return value
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'coding-test';
};

const normalizeQuestion = (q) => {
    if (!q) return q;
    const id = q.questionId || q.id || '';
    const title = q.title || '';
    const description = q.content?.problemStatement || q.description || '';
    const constraints = Array.isArray(q.content?.constraints) 
        ? q.content.constraints.join('\n') 
        : (q.constraints || '');

    // Normalize boilerplates robustly supporting camelCase, lowerCase, and standard language keys
    const getNormalizedLangKey = (k) => {
        const clean = String(k).trim().toLowerCase();
        if (clean === 'c') return 'c';
        if (clean === 'cpp' || clean === 'c++') return 'cpp';
        if (clean === 'java') return 'java';
        if (clean === 'python' || clean === 'python3') return 'python';
        if (clean === 'javascript' || clean === 'js') return 'javascript';
        return clean;
    };

    // Valid language key names in boilerPlates — filter out non-code keys.
    // Q1–Q79 boilerPlates objects contain non-language keys ('solution', '_internal', 'verified')
    // alongside real language keys. We whitelist only recognized language keys.
    const VALID_LANG_NAMES = new Set(['c', 'cpp', 'c++', 'java', 'python', 'python3', 'javascript', 'js', 'csharp', 'cs', 'ruby', 'go', 'rust', 'kotlin', 'swift', 'typescript', 'ts']);

    const rawBoilerplates = q.boilerPlates || q.boilerplates || {};
    const boilerplates = {};

    Object.entries(rawBoilerplates).forEach(([lang, val]) => {
        // Skip non-language keys and non-string values
        if (!VALID_LANG_NAMES.has(String(lang).trim().toLowerCase())) return;
        if (typeof val !== 'string') return;
        const norm = getNormalizedLangKey(lang);
        if (norm === 'python') {
            boilerplates.python = val;
            boilerplates.python3 = val;
        } else {
            boilerplates[norm] = val;
        }
    });

    // NOTE: solution.code is editorial reference (often empty string "") and must NOT
    // overwrite the student-facing boilerplate. Removed the previous merge that was
    // accidentally replacing valid boilerplates with empty solution code strings.

    // Normalize sample test cases
    const sampleTestCases = normalizeTestCaseArray(q.content?.sampleTestCases || q.sampleTestCases || q.sampleTests || []);

    // Normalize hidden test cases
    let hidden = [];
    if (q.testCases?.hidden) {
        hidden = normalizeTestCaseArray(q.testCases.hidden);
    } else if (Array.isArray(q.testCases)) {
        hidden = normalizeTestCaseArray(q.testCases);
    }

    return {
        ...q,
        id,
        title,
        description,
        constraints,
        boilerplates,
        sampleTestCases,
        sampleTests: sampleTestCases,
        hiddenTests: hidden,
        testCases: {
            ...q.testCases,
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

const CodingAssessmentPage = ({ isEmbedded = false, testData = null, secTimer = 0, onSectionSubmit = null, settings = {}, parentProctoringData = null, parentSettings = null }) => {
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
    const [language, setLanguage] = useState('cpp');
    const [codeMap, setCodeMap] = useState({}); // Key: questionId_language -> Code text
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
    const [runResults, setRunResults] = useState(null); // Results for sample test runs
    const [evalResults, setEvalResults] = useState(null); // Results for hidden test runs
    const [activeResultTab, setActiveResultTab] = useState('input'); // 'input', 'output', 'results'

    // Timer & Proctoring
    const [startTime, setStartTime] = useState(null);
    const [remainingTime, setRemainingTime] = useState(0);
    const [testDuration, setTestDuration] = useState(0); // in seconds
    const [violationCount, setViolationCount] = useState(0);
    const [proctorWarning, setProctorWarning] = useState(null);
    const [isLockedOut, setIsLockedOut] = useState(false);
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

    // Resizable pane state
    const [leftPaneWidth, setLeftPaneWidth] = useState(42); // percentage
    const [outputPaneHeight, setOutputPaneHeight] = useState(220); // pixels
    const isDraggingVertRef = useRef(false);
    const isDraggingHorizRef = useRef(false);
    const workspaceBodyRef = useRef(null);
    const rightPaneRef = useRef(null);

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
            // Stop the camera stream when CodingAssessmentPage unmounts —
            // BUT only when running standalone (not embedded inside MultiSectionAssessment).
            // In embedded mode the parent ProctoringEngine owns the camera for the full exam;
            // stopping it here would kill proctoring when the coding section ends.
            if (!isEmbedded && window.cameraStream) {
                console.log('[CodingAssessmentPage] Component unmounted. Cleaning up camera stream...');
                try {
                    window.cameraStream.getTracks().forEach(track => {
                        track.onended = null;
                        track.stop();
                    });
                } catch (e) {
                    console.warn('[CodingAssessmentPage] Error cleaning up camera stream:', e);
                }
                window.cameraStream = null;
            }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        let qTimer;
        // Increment time spent on the active question only when test is active/running
        const isExamActive = !submissionSuccess && questions.length > 0 && activeQuestionIndex !== undefined;
        if (isExamActive) {
            const activeQ = questions[activeQuestionIndex];
            const qId = activeQ?.questionId || activeQ?.id || activeQuestionIndex.toString();
            qTimer = setInterval(() => {
                setTimeSpentPerQ(prev => ({
                    ...prev,
                    [qId]: (prev[qId] || 0) + 1
                }));
            }, 1000);
        }
        return () => {
            if (qTimer) clearInterval(qTimer);
        };
    }, [submissionSuccess, questions, activeQuestionIndex]);

    // Ref to latest onSectionSubmit
    const onSectionSubmitRef = useRef(onSectionSubmit);
    useEffect(() => {
        onSectionSubmitRef.current = onSectionSubmit;
    }, [onSectionSubmit]);

    // Embedded Mode helper to submit scores and code map
    const handleEmbeddedSectionSubmit = async (reason = '') => {
        try {
            const finalScores = { ...questionScores };
            const allAnswers = {};
            for (const q of questions) {
                const code = codeMap[`${q.id}_${language}`] || "";
                allAnswers[q.id] = code;
                
                if (!finalScores[q.id]) {
                    // SECTION 18: use ONLY hiddenTests for official scoring.
                    const hidden = Array.isArray(q.hiddenTests) ? q.hiddenTests : (Array.isArray(q.testCases?.hidden) ? q.testCases.hidden : []);
                    if (hidden.length === 0) {
                        console.error(`[CodingEval] Question ${q.id} has no hiddenTests. Scoring is invalid. Assigning 0.`);
                        finalScores[q.id] = { score: 0, percentage: 0, passed: 0, total: 0, submitted: true, invalidConfig: true, invalidReason: 'no_hidden_tests' };
                    } else {
                        const bridgeLang = language === 'python3' ? 'python' : language;
                        const isBlank = isCodeBlankOrEmpty(code);
                        let passes = 0;
                        if (!isBlank) {
                            for (const tc of hidden) {
                                try {
                                    const resRaw = await desktopBridge.runDirectSandbox(bridgeLang, code, tc.input);
                                    const res = typeof resRaw === 'string' ? JSON.parse(resRaw) : (resRaw || {});
                                    const exit = res.exit_code !== undefined ? res.exit_code : (res.exitCode !== undefined ? res.exitCode : 0);
                                    const cleanOut = (res.stdout || "").replace(/\r\n/g, "\n").trim();
                                    const cleanExp = (tc.expected || "").replace(/\r\n/g, "\n").trim();
                                    if (cleanOut === cleanExp && !res.error && (exit === 0 || exit === null)) passes++;
                                } catch (err) {}
                            }
                        }
                        const qScore = (!isBlank && hidden.length > 0) ? (passes / hidden.length) * (q.weight || DEFAULT_QUESTION_WEIGHT) : 0;
                        finalScores[q.id] = {
                            score: qScore,
                            percentage: (!isBlank && hidden.length > 0) ? Math.round((passes / hidden.length) * 100) : 0,
                            passed: isBlank ? 0 : passes,
                            total: hidden.length,
                            submitted: true
                        };
                    }
                }
            }

            const targetSubmit = onSectionSubmitRef.current || onSectionSubmit;
            if (typeof targetSubmit === 'function') {
                let totalEarnedWeight = 0;
                let totalMaxWeight = 0;

                const codingDetails = questions.map((q, idx) => {
                    const scoreObj = finalScores[q.id] || { score: 0, percentage: 0, passed: 0, total: 0 };
                    const passed = scoreObj.passed || 0;
                    const total = scoreObj.total || 0;
                    const status = total > 0 ? (passed === total ? "Accepted" : (passed > 0 ? "Partial" : "Wrong Answer")) : "Wrong Answer";
                    
                    totalEarnedWeight += scoreObj.score || 0;
                    totalMaxWeight += q.weight || DEFAULT_QUESTION_WEIGHT;

                    return {
                        questionNumber: idx + 1,
                        problemTitle: q.name || q.title || `Question ${idx + 1}`,
                        title: q.name || q.title || `Question ${idx + 1}`,
                        difficulty: q.difficulty || 'Easy',
                        language: language || '',
                        status,
                        testsPassed: passed,
                        totalTests: total,
                        score: scoreObj.score || 0,
                        percentage: scoreObj.percentage || 0,
                        compilationCount: compilationCounts[q.id] || 0,
                        attempts: compilationCounts[q.id] || 0,
                        timeComplexity: q.timeComplexity || '',
                        spaceComplexity: q.spaceComplexity || '',
                        submittedAt: questionSubmitTimes[q.id] || new Date().toISOString()
                    };
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
                    timeSpentPerQ: timeSpentPerQ,
                    completed: finalScores,
                    coding: codingDetails,
                    score: totalEarnedWeight,
                    totalMarks: totalMaxWeight,
                    totalQuestions: questions.length,
                    autoSubmitted: reason ? true : false,
                    tabViolation: reason === 'navigation' ? true : false,
                    // Timing fields for reports and MSA section aggregation
                    timeTaken: elapsedSecs,
                    timeTakenSeconds: elapsedSecs,
                    timeStartedISO: sectionStartISO,
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
            // Set questions on initial load
            if (questions.length === 0 && testData.questions.length > 0) {
                const normalized = testData.questions.map(normalizeQuestion);
                setQuestions(normalized);
                setActiveQuestionIndex(0);
                if (normalized.length > 0) {
                    setVisitedQuestions({ [normalized[0].id]: true });
                }
                setLoading(false);
            }

            // Sync user details if not set
            if (!user) {
                const authData = getAuthData();
                setUser(authData);
            }

            // Sync settings to currentAssessment avoiding loops
            const proctored = settings.proctored || false;
            const audioProctored = settings.audioProctored || false;
            const maxViolations = settings.maxViolations || 5;

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
        }
    }, [isEmbedded, testData, settings, questions.length, user, currentAssessment]);

    // Initialize code boilerplates in embedded mode
    useEffect(() => {
        if (isEmbedded && questions.length > 0 && Object.keys(codeMap).length === 0) {
            const initialCodeMap = {};
            const availableLanguages = ["cpp", "c", "python", "java", "javascript"];
            questions.forEach(q => {
                availableLanguages.forEach(lang => {
                    initialCodeMap[`${q.id}_${lang}`] = q.boilerplates?.[lang] || FREE_BOILERPLATES[lang] || "";
                });
            });
            setCodeMap(initialCodeMap);
        }
    }, [isEmbedded, questions, codeMap]);

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

    // Vertical divider drag (left/right pane split)
    const startVertDrag = useCallback((e) => {
        e.preventDefault();
        isDraggingVertRef.current = true;
        const startX = e.clientX;
        const startWidth = leftPaneWidth;
        const body = workspaceBodyRef.current;
        const totalW = body ? body.getBoundingClientRect().width : window.innerWidth;

        const onMove = (mv) => {
            if (!isDraggingVertRef.current) return;
            const delta = mv.clientX - startX;
            const newPct = Math.min(65, Math.max(25, startWidth + (delta / totalW) * 100));
            setLeftPaneWidth(newPct);
        };
        const onUp = () => {
            isDraggingVertRef.current = false;
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

    // Horizontal divider drag (editor/output pane split within right pane)
    const startHorizDrag = useCallback((e) => {
        e.preventDefault();
        isDraggingHorizRef.current = true;
        const startY = e.clientY;
        const startH = outputPaneHeight;
        const rp = rightPaneRef.current;
        const totalH = rp ? rp.getBoundingClientRect().height : 500;

        const onMove = (mv) => {
            if (!isDraggingHorizRef.current) return;
            const delta = startY - mv.clientY; // dragging up = larger output
            const newH = Math.min(totalH * 0.6, Math.max(80, startH + delta));
            setOutputPaneHeight(Math.round(newH));
        };
        const onUp = () => {
            isDraggingHorizRef.current = false;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [outputPaneHeight]);

    const showCustomAlert = useCallback((title, message, type = 'info', onClose = null) => {
        setAlertConfig({ title, message, type, onClose });
    }, []);

    // Save and load console results when switching questions
    useEffect(() => {
        const prevIdx = prevQuestionIndexRef.current;
        const prevQ = questions[prevIdx];
        const currentQ = questions[activeQuestionIndex];

        if (prevQ && prevQ.id !== currentQ?.id) {
            // Save previous question's console results
            setQuestionResults(prev => ({
                ...prev,
                [prevQ.id]: {
                    stdout,
                    stderr,
                    runResults,
                    evalResults,
                    activeResultTab
                }
            }));

            // Load current question's console results
            const currentRes = questionResults[currentQ?.id] || {
                stdout: '',
                stderr: '',
                runResults: null,
                evalResults: null,
                activeResultTab: 'input'
            };
            setStdout(currentRes.stdout);
            setStderr(currentRes.stderr);
            setRunResults(currentRes.runResults);
            setEvalResults(currentRes.evalResults);
            setActiveResultTab(currentRes.activeResultTab);
        }

        prevQuestionIndexRef.current = activeQuestionIndex;
    }, [activeQuestionIndex, questions, stdout, stderr, runResults, evalResults, activeResultTab, questionResults]);

    // Set auto-submit notice message
    const setAutoSubmitMessage = useCallback((msg) => {
        localStorage.setItem(AUTO_SUBMIT_NOTICE_KEY, msg);
        setAutoSubmitNotice(msg);
    }, []);

    // Get time taken so far
    const getElapsedSeconds = useCallback(() => {
        if (!startTime) return 0;
        return Math.round((timeService.now() - startTime) / 1000);
    }, [startTime]);

    // Load initial data
    useEffect(() => {
        if (isEmbedded) return; // Skip standard loading flow
        
        const loadInitialData = async () => {
            setLoading(true);
            try {
                const authData = JSON.parse(localStorage.getItem("auth_data") || "{}");
                if (!authData.Email) {
                    navigate("/login");
                    return;
                }
                setUser(authData);

                // Redirect to unified student dashboard if no active session exists
                const hasPending = localStorage.getItem("codingAssessmentData");
                if (!hasPending) {
                    navigate("/student/dashboard", { replace: true });
                    return;
                }

                // Fetch access control JSON
                const accessControlData = await DataService.getAccessControl();
                setAccessControl(accessControlData);

                // Fetch student completion records
                const attempts = await CodingAssessmentService.fetchUserAttempts(
                    authData.Email,
                    authData.College,
                    authData.Year,
                    authData.Department
                );
                setUserAttempts(attempts);

                // Load available coding assessments
                await loadAvailableAssessments(accessControlData, authData);

                // Check if there is an active test session to restore
                const pendingData = localStorage.getItem("codingAssessmentData");
                if (pendingData && assessmentSlug) {
                    const isNewLaunch = localStorage.getItem("codingAssessmentNewLaunch") === "true";
                    if (isNewLaunch) {
                        localStorage.removeItem("codingAssessmentNewLaunch");
                        const now = timeService.now();
                        localStorage.setItem("codingAssessmentStartTime", (now + 10000).toString());
                        setStartCountdown(10);
                        restoreAssessmentState();
                    } else {
                        restoreAssessmentState();
                    }
                }
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
    }, [navigate, assessmentSlug]);

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
                    const isPremiumUser = userData?.Premium === true || userData?.Premium === 'true' || userData?.Premium === 1 || userData?.Premium === 'Yes' || !!userData?.isPremium;
                    const isPremiumModule = !!module.isPremium;
                    const premiumAccess = !isPremiumModule || isPremiumUser;
                    return allowedModuleIds.includes(module.id) && premiumAccess;
                })
                .map(([key, module]) => {
                    // Derive the JSON file path for fetching questions
                    let finalUrl;
                    const moduleSlug = module.slug;
                    const moduleUrl = module.url || '';

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

    // Fetch assessment questions JSON
    const fetchAssessmentJSON = async (url) => {
        try {
            let cleanUrl = url;
            if (url.startsWith('http')) {
                if (url.includes('/seed-contents/main/')) {
                    cleanUrl = url.split('/seed-contents/main/')[1];
                } else if (url.includes('/SEEDDB/main/')) {
                    cleanUrl = url.split('/SEEDDB/main/')[1];
                } else if (url.includes('/contents/')) {
                    cleanUrl = url.split('/contents/')[1];
                }
            }
            // 1. Try local fetch first
            const localUrl = `${LOCAL_BASE_URL}${cleanUrl.startsWith('/') ? '' : '/'}${cleanUrl}`;
            try {
                const response = await fetch(localUrl);
                if (response.ok) return await response.json();
            } catch (err) {
                console.log("Local JSON fetch failed, trying GitHub repository fallback");
            }

            // 2. Authenticated fallback via the server-side content proxy.
            // SECURITY: no GitHub token is present in the client bundle any more.
            try {
                const proxied = await fetchContentJSON(cleanUrl, { localFirst: false });
                if (proxied !== undefined) return proxied;
            } catch (_) {}

            // 3. Try raw github contents as last resort
            const rawUrl = `${GITHUB_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
            const rawRes = await fetch(rawUrl);
            if (!rawRes.ok) throw new Error("Could not download assessment questions JSON.");
            return await rawRes.json();
        } catch (err) {
            console.error("All assessment fetch attempts failed:", err);
            throw err;
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
                user.Email,
                assessment.id,
                user.College,
                user.Year,
                user.Department
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
                    user.Email,
                    assessment.id,
                    user.College,
                    user.Year,
                    user.Department
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
                if (assessment.url) {
                    data = await fetchAssessmentJSON(assessment.url);
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
            collectIds(data.questionIds);
            collectIds(data.questions);

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
                            if (item && typeof item === 'object' && (item.id || item.questionId)) {
                                inline.push(item);
                            }
                        });
                    }
                };
                addInline(assessment.questions);
                addInline(data.questions);
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
                    initialCodeMap[`${q.id}_${lang}`] = q.boilerplates?.[lang] || FREE_BOILERPLATES[lang] || "";
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
}
    };

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
                setCodeMap(JSON.parse(storedCodeMap));
            }

            // Restore active indexes and color visited questions
            setActiveQuestionIndex(0);
            if (questions && questions.length > 0) {
                setVisitedQuestions({ [questions[0].id]: true });
            }
        } catch (e) {
            console.error("Error restoring local state:", e);
        }
    }, []);

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

    const editorRef = useRef(null);
    const codeMapRef = useRef(codeMap);
    useEffect(() => {
        codeMapRef.current = codeMap;
    }, [codeMap]);

    // Handle code editor change: update ref & throttled local storage (0ms typing latency)
    const handleCodeChange = (value) => {
        if (!currentQuestion) return;

        const key = `${currentQuestion.id}_${language}`;
        codeMapRef.current = {
            ...codeMapRef.current,
            [key]: value
        };
        throttledLocalStorageSet("codingAssessmentCode", codeMapRef.current);
    };

    // Reset code boilerplate
    const handleResetCode = () => {
        if (!currentQuestion) return;
        const boilerplate = currentQuestion.boilerplates?.[language] || FREE_BOILERPLATES[language] || "";
        if (editorRef.current) {
            editorRef.current.setValue(boilerplate);
        }
        handleCodeChange(boilerplate);
    };

    // Backup active state to Firestore
    const backupProgress = async () => {
        if (!user || !currentAssessment) return;
        try {
            const progress = {
                email: user.Email,
                college: user.College,
                year: user.Year,
                department: user.Department,
                rollNumber: user["Roll Number"] || '',
                name: user.Name || '',
                assessmentID: currentAssessment.id,
                assessmentName: currentAssessment.name,
                timeTaken: getElapsedSeconds(),
                timeStartedISO: new Date(startTime).toISOString(),
                answers: questionScores,
                codeMap: codeMap
            };
            await CodingAssessmentService.syncProgress(progress);
        } catch (e) {
            console.warn("Failed syncing in-progress codes to DB:", e);
        }
    };

    // Run Code Engine (Sample Tests)
    // Flow: show loader FIRST → send to backend → close loader
    const runSampleTestCases = async () => {
        if (!currentQuestion) return;

        setCompilationCounts(prev => {
            const updated = { ...prev, [currentQuestion.id]: (prev[currentQuestion.id] || 0) + 1 };
            localStorage.setItem("codingCompilationCounts", JSON.stringify(updated));
            return updated;
        });

        setIsRunning(true);
        setActiveResultTab('results');
        setRunResults(null);
        setStderr('');
        setStdout('');

        // Yield to React so the overlay renders before the backend call starts
        // await new Promise(r => setTimeout(r, 80));
        // await new Promise(r => setTimeout(r, 80));

        const code = codeMap[`${currentQuestion.id}_${language}`] || "";
        const sampleTests = currentQuestion.sampleTests || [];
        const startTimestamp = Date.now();
        const bridgeLang = language === 'python3' ? 'python' : language;
        const isBlank = isCodeBlankOrEmpty(code);

        if (isBlank) {
            setStderr("No code submitted. Please write solution code before running test cases.");
            setRunResults(sampleTests.map((tc, idx) => ({
                index: idx + 1,
                input: tc.input,
                expected: tc.expected,
                actual: "",
                stderr: "No code submitted in editor.",
                passed: false
            })));
            setIsRunning(false);
            return;
        }

        try {
            const results = [];
            for (let i = 0; i < sampleTests.length; i++) {
                const tc = sampleTests[i];

                // Run process on python sandbox backend
                const res = await desktopBridge.runDirectSandbox(bridgeLang, code, tc.input);

                const exit = res.exit_code !== undefined ? res.exit_code : (res.exitCode !== undefined ? res.exitCode : 0);
                const cleanOut = (res.stdout || "").replace(/\r\n/g, "\n").trim();
                const cleanExp = (tc.expected || "").replace(/\r\n/g, "\n").trim();
                const passed = cleanOut === cleanExp && !res.error && (exit === 0 || exit === null);

                results.push({
                    index: i + 1,
                    input: tc.input,
                    expected: tc.expected,
                    actual: res.stdout || "",
                    stderr: res.stderr || res.error || "",
                    passed: passed
                });
            }

            // Run Custom Input if checked
            if (useCustomInput) {
                const resRaw = await desktopBridge.runDirectSandbox(bridgeLang, code, customInput);
                const res = typeof resRaw === 'string' ? JSON.parse(resRaw) : resRaw;
                const exit = res.exit_code !== undefined ? res.exit_code : (res.exitCode !== undefined ? res.exitCode : 0);
                const passed = !res.error && (exit === 0 || exit === null);
                results.push({
                    index: 'Custom',
                    input: customInput,
                    expected: 'N/A (Custom Run)',
                    actual: res.stdout || "",
                    stderr: res.stderr || res.error || "",
                    passed: passed
                });
            }

            setRunResults(results);

            // Set stdout/stderr of the last case for output display tab fallback
            const lastCase = results[results.length - 1];
            if (lastCase) {
                setStdout(lastCase.actual);
                setStderr(lastCase.stderr);
            }
        } catch (err) {
            console.error("Local sandbox execute error:", err);
            setStderr(`Compiler execution failure: ${err.message}`);
        } finally {
            // Keep loader up until backend fully responds (already done above)
            setIsRunning(false);
        }
    };

    // Evaluate/Submit Question
    // Flow: show evaluating overlay → run hidden tests (min 5 s) → close overlay → show inline submitted result
    const evaluateQuestion = async () => {
        if (!currentQuestion) return;

        setCompilationCounts(prev => {
            const updated = { ...prev, [currentQuestion.id]: (prev[currentQuestion.id] || 0) + 1 };
            localStorage.setItem("codingCompilationCounts", JSON.stringify(updated));
            return updated;
        });
        setQuestionSubmitTimes(prev => {
            const updated = { ...prev, [currentQuestion.id]: new Date().toISOString() };
            localStorage.setItem("codingQuestionSubmitTimes", JSON.stringify(updated));
            return updated;
        });

        setIsEvaluating(true);
        setEvalResults(null);
        setActiveResultTab('results');

        // Yield a tick so the overlay renders before backend starts
        // await new Promise(r => setTimeout(r, 80));

        const code = codeMap[`${currentQuestion.id}_${language}`] || "";
        // SECTION 18: use ONLY hiddenTests for official per-question scoring.
        // sampleTests must NEVER substitute for hiddenTests even here.
        // If hiddenTests is absent/empty this question scores 0 (invalidConfig guard below).
        const hiddenTests = Array.isArray(currentQuestion.hiddenTests) ? currentQuestion.hiddenTests : [];
        const startTimestamp = Date.now();
        const bridgeLang = language === 'python3' ? 'python' : language;
        const isEvalBlank = isCodeBlankOrEmpty(code);

        let passedCount = 0;
        let results = [];
        let evalError = null;

        try {
            for (let i = 0; i < hiddenTests.length; i++) {
                const tc = hiddenTests[i];
                if (isEvalBlank) {
                    results.push({ index: i + 1, passed: false, error: "No code submitted in editor." });
                    continue;
                }
                const res = await desktopBridge.runDirectSandbox(bridgeLang, code, tc.input);

                const exit = res.exit_code !== undefined ? res.exit_code : (res.exitCode !== undefined ? res.exitCode : 0);
                const cleanOut = (res.stdout || "").replace(/\r\n/g, "\n").trim();
                const cleanExp = (tc.expected || "").replace(/\r\n/g, "\n").trim();
                const passed = cleanOut === cleanExp && !res.error && (exit === 0 || exit === null);

                if (passed) passedCount++;
                results.push({ index: i + 1, passed, error: res.error || res.stderr || "" });
            }

            const total = hiddenTests.length;
            const score = (!isEvalBlank && total > 0) ? Math.round((passedCount / total) * 100) : 0;
            const earnedWeight = (!isEvalBlank && total > 0) ? (passedCount / total) * (currentQuestion.weight || DEFAULT_QUESTION_WEIGHT) : 0;

            const newScores = {
                ...questionScores,
                [currentQuestion.id]: {
                    score: earnedWeight,
                    percentage: score,
                    passed: passedCount,
                    total: total,
                    submitted: true
                }
            };
            setQuestionScores(newScores);
            setEvalResults(results);
        } catch (err) {
            console.error("Submit question evaluation failed:", err);
            evalError = err.message;
        } finally {
            // Enforce minimum 5-second evaluating display
            // const elapsed = Date.now() - startTimestamp;
            // const remaining = Math.max(0, 5000 - elapsed);
            // if (remaining > 0) await new Promise(r => setTimeout(r, remaining));

            // Close the evaluating overlay FIRST
            setIsEvaluating(false);

            // Yield another tick so overlay is gone before alert appears
            // await new Promise(r => setTimeout(r, 60));

            // NOW show the result (after overlay is closed)
            if (evalError) {
                showCustomAlert("Evaluation Failed", `Evaluation failed: ${evalError}`, "error");
            } else {
                const total = hiddenTests.length;
                const score = total > 0 ? Math.round((passedCount / total) * 100) : 0;
                showCustomAlert(
                    "Question Submitted ",
                    `Hidden Tests Passed: ${passedCount}/${total} \u00a0\u00a0 Score: ${score}%`,
                    "success"
                );
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
            setSubmitPhase('evaluating');
            await handleEmbeddedSectionSubmit(reason);
            setIsSubmitting(false);
            submitGuard.fail(); // parent owns persistence; free the lock
            return;
        }

        setIsSubmitting(true);

        try {
            const authData = user || JSON.parse(localStorage.getItem("auth_data") || "{}");
            const storedStartTime = localStorage.getItem("codingAssessmentStartTime") || timeService.now().toString();
            const storedData = JSON.parse(localStorage.getItem("codingAssessmentData") || "{}");
            const storedCodeMap = JSON.parse(localStorage.getItem("codingAssessmentCode") || "{}");
            
            const activeAssessment = storedData.assessment || currentAssessment;
            const activeQuestions = storedData.questions || questions;

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
            const finalScores = { ...questionScores };
            let totalMaxWeight = 0;
            let totalEarnedWeight = 0;

            for (const q of activeQuestions) {
                totalMaxWeight += (q.weight || DEFAULT_QUESTION_WEIGHT);
                if (finalScores[q.id]) {
                    totalEarnedWeight += finalScores[q.id].score;
                } else {
                    const code = storedCodeMap[`${q.id}_${language}`] || "";
                    // SECTION 18: use ONLY hiddenTests for official scoring.
                    const hidden = Array.isArray(q.hiddenTests) ? q.hiddenTests : [];
                    if (hidden.length === 0) {
                        console.error(`[CodingEval] Question ${q.id} has no hiddenTests. Scoring is invalid. Assigning 0.`);
                        finalScores[q.id] = { score: 0, percentage: 0, passed: 0, total: 0, submitted: true, invalidConfig: true, invalidReason: 'no_hidden_tests' };
                    } else {
                    const bridgeLang = language === 'python3' ? 'python' : language;
                    let passes = 0;
                    if (code && !isCodeBlankOrEmpty(code) && hidden.length > 0) {
                        for (const tc of hidden) {
                            try {
                                const res = await desktopBridge.runDirectSandbox(bridgeLang, code, tc.input);
                                const exit = res.exit_code !== undefined ? res.exit_code : 0;
                                const cleanOut = (res.stdout || "").replace(/\r\n/g, "\n").trim();
                                const cleanExp = (tc.expected || "").replace(/\r\n/g, "\n").trim();
                                if (cleanOut === cleanExp && !res.error && exit === 0) passes++;
                            } catch (err) {}
                        }
                    }
                    const qScore = hidden.length > 0 ? (passes / hidden.length) * (q.weight || DEFAULT_QUESTION_WEIGHT) : 0;
                    finalScores[q.id] = {
                        score: qScore,
                        percentage: hidden.length > 0 ? Math.round((passes / hidden.length) * 100) : 0,
                        passed: passes,
                        total: hidden.length,
                        submitted: true
                    };
                    totalEarnedWeight += qScore;
                    }
                }
            }

            const finalPercent = totalMaxWeight > 0 ? Math.round((totalEarnedWeight / totalMaxWeight) * 100) : 0;
            const elapsed = Math.round((timeService.now() - parseInt(storedStartTime, 10)) / 1000);

            // Gather metadata payload
            const codingSubmissions = activeQuestions.map((q, idx) => {
                const scoreObj = finalScores[q.id] || { score: 0, percentage: 0, passed: 0, total: 0 };
                const passed = scoreObj.passed || 0;
                const total = scoreObj.total || 0;
                const status = total > 0 ? (passed === total ? "Accepted" : (passed > 0 ? "Partial" : "Wrong Answer")) : "Wrong Answer";
                return {
                    questionNumber: idx + 1,
                    problemTitle: q.name || q.title || `Question ${idx + 1}`,
                    title: q.name || q.title || `Question ${idx + 1}`,
                    difficulty: q.difficulty || 'Easy',
                    language: language || '',
                    status,
                    testsPassed: passed,
                    totalTests: total,
                    compilationCount: compilationCounts[q.id] || 0,
                    attempts: compilationCounts[q.id] || 0,
                    timeComplexity: q.timeComplexity || '',
                    spaceComplexity: q.spaceComplexity || '',
                    submittedAt: questionSubmitTimes[q.id] || new Date().toISOString()
                };
            });

            const rawResultData = {
                email: authData.Email,
                college: authData.College,
                year: authData.Year,
                department: authData.Department,
                rollNumber: authData["Roll Number"] || '',
                name: authData.Name || '',
                assessmentID: activeAssessment.id,
                assessmentName: activeAssessment.name,
                testType: 'coding',
                score: totalEarnedWeight,
                totalQuestions: activeQuestions.length,
                correctAnswers: totalEarnedWeight, // mapped for GAS Row compatibility
                incorrectAnswers: totalMaxWeight - totalEarnedWeight,
                totalMarks: totalMaxWeight,
                percentage: finalPercent,
                timeTaken: elapsed,
                timeTakenSeconds: elapsed,
                startedAt: new Date(parseInt(storedStartTime, 10)).toISOString(),
                submittedAt: timeService.getNow().toISOString(),
                timeStartedISO: new Date(parseInt(storedStartTime, 10)).toISOString(),
                timeEndedISO: timeService.getNow().toISOString(),
                autoSubmitted: true,
                autoSubmitReason: reason === 'timer' 
                    ? 'Timer hit 0' 
                    : (reason === 'proctoring_violations' ? 'Proctoring violations exceeded limit' : 'Tab switch limit lockout'),
                violationCount: (() => {
                    const vInfo = getViolations(activeAssessment.id, authData.Email);
                    return Math.max(violationCount, vInfo.violationCount, (vInfo.violations || []).length);
                })(),
                totalNoFace: (() => {
                    const vInfo = getViolations(activeAssessment.id, authData.Email);
                    return (vInfo.violations || []).filter(v => v.type === 'no_face').length;
                })(),
                totalMultipleFaces: (() => {
                    const vInfo = getViolations(activeAssessment.id, authData.Email);
                    return (vInfo.violations || []).filter(v => v.type === 'multiple_faces').length;
                })(),
                violations: (() => {
                    const vInfo = getViolations(activeAssessment.id, authData.Email);
                    return vInfo.violations.length > 0
                        ? vInfo.violations
                        : [{ type: 'tab_switch', count: violationCount, reason: 'Tab switch limit lockout' }];
                })(),
                languageUsed: language,
                coding: codingSubmissions,
                codingSubmissions: codingSubmissions,
                executionStats: {
                    scores: finalScores,
                    codeMap: storedCodeMap
                }
            };

            const resultData = buildUnifiedResultPayload(rawResultData);
            await CodingAssessmentService.submitCodingResult(resultData);
            await markAssessmentCompleted(authData, activeAssessment.id);
            clearLocalSession();

            const noticeMsg = reason === 'timer' 
                ? 'Your coding assessment was auto-submitted because the duration expired.' 
                : (reason === 'proctoring_violations'
                    ? 'Your coding assessment was auto-submitted due to webcam proctoring violations.'
                    : 'Your coding assessment was auto-submitted due to excessive tab switching violations.');
            
            setAutoSubmitMessage(noticeMsg);
            navigate('/student/dashboard', { replace: true });
        } catch (e) {
            console.error("Auto submit failed:", e);
            clearLocalSession();
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
                    user?.Email,
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
            setSubmitPhase('evaluating');
            await handleEmbeddedSectionSubmit();
            setIsSubmitting(false);
            submitGuard.fail(); // parent owns persistence; free the lock
            return;
        }

        // Phase 1: Evaluate any unevaluated questions
        setIsSubmitting(true);
        setSubmitPhase('evaluating');

        try {
            const finalScores = { ...questionScores };
            let totalMaxWeight = 0;
            let totalEarnedWeight = 0;

            for (const q of questions) {
                totalMaxWeight += (q.weight || DEFAULT_QUESTION_WEIGHT);
                if (finalScores[q.id]) {
                    totalEarnedWeight += finalScores[q.id].score;
                } else {
                    // SECTION 18: use ONLY hiddenTests for official scoring.
                    const hidden = Array.isArray(q.hiddenTests) ? q.hiddenTests : [];
                    if (hidden.length === 0) {
                        console.error(`[CodingEval] Question ${q.id} has no hiddenTests. Scoring is invalid. Assigning 0.`);
                        finalScores[q.id] = { score: 0, percentage: 0, passed: 0, total: 0, submitted: true, invalidConfig: true, invalidReason: 'no_hidden_tests' };
                    } else {
                    const bridgeLang = language === 'python3' ? 'python' : language;
                    let passes = 0;
                    for (const tc of hidden) {
                        try {
                            const res = await desktopBridge.runDirectSandbox(bridgeLang, code, tc.input);
                            const exit = res.exit_code !== undefined ? res.exit_code : 0;
                            const cleanOut = (res.stdout || "").replace(/\r\n/g, "\n").trim();
                            const cleanExp = (tc.expected || "").replace(/\r\n/g, "\n").trim();
                            if (cleanOut === cleanExp && !res.error && exit === 0) passes++;
                        } catch (err) {}
                    }
                    const qScore = hidden.length > 0 ? (passes / hidden.length) * (q.weight || DEFAULT_QUESTION_WEIGHT) : 0;
                    finalScores[q.id] = {
                        score: qScore,
                        percentage: hidden.length > 0 ? Math.round((passes / hidden.length) * 100) : 0,
                        passed: passes,
                        total: hidden.length,
                        submitted: true
                    };
                    totalEarnedWeight += qScore;
                    }
                }
            }

            const finalPercent = totalMaxWeight > 0 ? Math.round((totalEarnedWeight / totalMaxWeight) * 100) : 0;
            const elapsed = getElapsedSeconds();

            // Phase 2: Submit to Firebase
            setSubmitPhase('submitting');

            await CodingAssessmentService.markAsSubmitting(
                user.Email,
                currentAssessment.id,
                user.College,
                user.Year,
                user.Department
            );

            const codingSubmissions = questions.map((q, idx) => {
                const scoreObj = finalScores[q.id] || { score: 0, percentage: 0, passed: 0, total: 0 };
                const passed = scoreObj.passed || 0;
                const total = scoreObj.total || 0;
                const status = total > 0 ? (passed === total ? "Accepted" : (passed > 0 ? "Partial" : "Wrong Answer")) : "Wrong Answer";
                return {
                    questionNumber: idx + 1,
                    problemTitle: q.name || q.title || `Question ${idx + 1}`,
                    title: q.name || q.title || `Question ${idx + 1}`,
                    difficulty: q.difficulty || 'Easy',
                    language: language || '',
                    status,
                    testsPassed: passed,
                    totalTests: total,
                    compilationCount: compilationCounts[q.id] || 0,
                    attempts: compilationCounts[q.id] || 0,
                    timeComplexity: q.timeComplexity || '',
                    spaceComplexity: q.spaceComplexity || '',
                    timeSpentSeconds: timeSpentPerQ[q.id] || 0,
                    startedAt: questionStartTimes[q.id] || new Date(startTime).toISOString(),
                    submittedAt: questionSubmitTimes[q.id] || new Date().toISOString()
                };
            });

            const rawResultData = {
                email: user.Email,
                college: user.College,
                year: user.Year,
                department: user.Department,
                rollNumber: user["Roll Number"] || '',
                name: user.Name || '',
                assessmentID: currentAssessment.id,
                assessmentName: currentAssessment.name,
                testType: 'coding',
                score: totalEarnedWeight,
                totalQuestions: questions.length,
                correctAnswers: totalEarnedWeight,
                incorrectAnswers: totalMaxWeight - totalEarnedWeight,
                totalMarks: totalMaxWeight,
                percentage: finalPercent,
                timeTakenSeconds: elapsed,
                startedAt: new Date(startTime).toISOString(),
                submittedAt: timeService.getNow().toISOString(),
                autoSubmitted: false,
                autoSubmitReason: '',
                violationCount: (() => {
                    const vInfo = getViolations(currentAssessment.id, user.Email);
                    return Math.max(violationCount, vInfo.violationCount, (vInfo.violations || []).length);
                })(),
                totalNoFace: (() => {
                    const vInfo = getViolations(currentAssessment.id, user.Email);
                    return (vInfo.violations || []).filter(v => v.type === 'no_face').length;
                })(),
                totalMultipleFaces: (() => {
                    const vInfo = getViolations(currentAssessment.id, user.Email);
                    return (vInfo.violations || []).filter(v => v.type === 'multiple_faces').length;
                })(),
                violations: (() => {
                    const vInfo = getViolations(currentAssessment.id, user.Email);
                    return vInfo.violations;
                })(),
                languageUsed: language,
                codingSubmissions: codingSubmissions,
                executionStats: {
                    scores: finalScores,
                    codeMap: codeMap
                }
            };

            const resultData = buildUnifiedResultPayload(rawResultData);

            await CodingAssessmentService.submitCodingResult(resultData);
            clearLocalSession();

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
                assessmentName: currentAssessment.name,
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
                            uid: user?.uid || user?.UID || '',
                            courseId: courseCtx.courseId,
                            seriesId: courseCtx.seriesId,
                            testId: courseCtx.testId || currentAssessment.id,
                            score: totalScore,
                            maxScore: courseCtx.totalMarks || 100,
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
    // RENDER: WORKSPACE VIEW
    // ==========================================
    return (
        <div className="coding-workspace-page">
            {/* Proctoring Engine - Active only when assessment is running and proctored is enabled (standalone mode only) */}
            {!isEmbedded && shouldUseProctoring && currentAssessment && user && (
                <ProctoringEngine
                    studentID={user.Email}
                    testID={currentAssessment.id || 'unknown'}
                    onAutoSubmit={() => autoSubmitAttempt('proctoring_violations')}
                    isTestActive={!!currentAssessment && !submissionSuccess}
                    maxViolations={Number(currentAssessment.maxViolations) || 5}
                    onReady={() => {
                        console.log('[CodingAssessmentPage] Camera proctoring ready');
                    }}
                    onViolationUpdate={(violationInfo) => {
                        if (!violationInfo?.violationType) return;
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
                    studentID={user.Email}
                    testID={currentAssessment.id || 'unknown'}
                    isTestActive={!!currentAssessment && !submissionSuccess}
                    maxViolations={Number(currentAssessment.maxAudioViolations) || Number(settings.maxAudioViolations) || 5}
                    onReady={() => {
                        console.log('[CodingAssessmentPage] Audio proctoring ready');
                    }}
                    onViolationUpdate={(info) => {
                        if (!info?.type) return;
                        setProctoringData(prev => {
                            const nextAudioCount = (prev.audioViolationCount || 0) + 1;
                            const maxLimit = Number(currentAssessment.maxAudioViolations) || Number(settings.maxAudioViolations) || 5;
                            if (nextAudioCount >= maxLimit) {
                                setTimeout(() => {
                                    setIsLockedOut(true);
                                    autoSubmitAttempt("proctoring_violations");
                                }, 1000);
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
            <header className="workspace-header">
                <div className="header-left">
                    {!isEmbedded && (
                        <button className="exit-workspace-btn" onClick={() => setShowSubmitModal(true)}>
                            <FaArrowLeft /> Exit Portal
                        </button>
                    )}
                    <span className="assessment-title-label">
                        {currentAssessment?.name || "SEED-IT Assessment"}
                    </span>
                </div>
                
                <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    {(shouldUseProctoring || shouldUseAudioProctoring) && (
                        <div className="proctoring-stats-container" style={{ display: 'flex', gap: '10px' }}>
                            {shouldUseAudioProctoring && (
                                <div className="proctor-stat-pill audio-violation-pill" style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    background: (isEmbedded ? parentProctoringData?.audioViolationCount : proctoringData.audioViolationCount) > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.12)',
                                    color: (isEmbedded ? parentProctoringData?.audioViolationCount : proctoringData.audioViolationCount) > 0 ? '#ef4444' : '#10b981',
                                    border: (isEmbedded ? parentProctoringData?.audioViolationCount : proctoringData.audioViolationCount) > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '0.65rem',
                                    fontWeight: '700'
                                }}>
                                    <span> Audio: {isEmbedded ? parentProctoringData?.audioViolationCount || 0 : proctoringData.audioViolationCount}/{Number(settings.maxAudioViolations || currentAssessment?.maxAudioViolations || parentSettings?.maxAudioViolations) || 5}</span>
                                </div>
                            )}
                            {shouldUseProctoring && (
                                <div className="proctor-stat-pill ai-violation-pill" style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    background: (isEmbedded ? parentProctoringData?.violationCount : proctoringData.violationCount) > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.12)',
                                    color: (isEmbedded ? parentProctoringData?.violationCount : proctoringData.violationCount) > 0 ? '#ef4444' : '#10b981',
                                    border: (isEmbedded ? parentProctoringData?.violationCount : proctoringData.violationCount) > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '0.65rem',
                                    fontWeight: '700'
                                }}>
                                    <span> Camera: {isEmbedded ? parentProctoringData?.violationCount || 0 : proctoringData.violationCount}/{currentAssessment?.maxViolations || settings?.maxViolations || parentSettings?.maxViolations || 5}</span>
                                </div>
                            )}
                        </div>
                    )}
                    <div className="timer-pill">
                        <FaClock />
                        <span className="remaining-timer-span">{formatRemainingTime()}</span>
                    </div>
                    <button className="submit-assessment-btn" onClick={() => setShowSubmitModal(true)}>
                        {isEmbedded ? "Submit Section" : "Submit Assessment"}
                    </button>
                </div>
            </header>

            {/* Main Workspace Column Split — resizable */}
            {currentQuestion ? (
                <div className="workspace-body" ref={workspaceBodyRef}>

                    {/* ─── LEFT PANE: Question nav + full problem statement ─── */}
                    <div className="workspace-left-pane" style={{ width: `${leftPaneWidth}%` }}>
                        {/* Question navigation bubbles */}
                        <div className="left-pane-card question-nav-card">
                            <div className="card-header-label">Question Navigation</div>
                            <div className="question-grid">
                                {questions.map((q, idx) => (
                                    <button
                                        key={q.id ? `${q.id}-${idx}` : `q-${idx}`}
                                        onClick={() => {
                                            setActiveQuestionIndex(idx);
                                            setVisitedQuestions(prev => ({ ...prev, [q.id]: true }));
                                        }}
                                        className={`grid-bubble ${idx === activeQuestionIndex ? 'grid-bubble-active' : ''} ${getGridBubbleClass(q)}`}
                                    >
                                        Q{idx + 1}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Problem statement — takes all remaining height */}
                        <div className="left-pane-card problem-statement-card">
                            <div className="card-header-flex">
                                <div className="card-header-label">{currentQuestion.title}</div>
                                <div className="header-tags-row">
                                    <span className={`difficulty-badge diff-${currentQuestion.difficulty?.toLowerCase() || 'medium'}`}>
                                        {currentQuestion.difficulty}
                                    </span>
                                    <button
                                        onClick={() => toggleBookmark(currentQuestion.id)}
                                        className={`bookmark-btn ${bookmarkedQuestions[currentQuestion.id] ? 'bookmarked' : ''}`}
                                        title="Bookmark question"
                                    >
                                        <FaBookmark />
                                    </button>
                                </div>
                            </div>
                            <div className="problem-content-scroll">
                                <div className="problem-statement-text">
                                    <p>{currentQuestion.description}</p>

                                    {currentQuestion.instructions && (
                                        <>
                                            <h4>Input Format &amp; Instructions</h4>
                                            <p>{currentQuestion.instructions}</p>
                                        </>
                                    )}

                                    {currentQuestion.constraints && (
                                        <>
                                            <h4>Constraints</h4>
                                            <pre className="constraints-block">{currentQuestion.constraints}</pre>
                                        </>
                                    )}

                                    {currentQuestion.sampleTests && currentQuestion.sampleTests.map((st, i) => (
                                        <div key={i} className="example-io-block">
                                            <h4>Sample Test Case {i + 1}</h4>
                                            <div className="io-row">
                                                <div className="io-col">
                                                    <strong>Input:</strong>
                                                    <pre>{st.input || "No Input"}</pre>
                                                </div>
                                                <div className="io-col">
                                                    <strong>Expected Output:</strong>
                                                    <pre>{st.expected}</pre>
                                                </div>
                                            </div>
                                            {st.explanation && (
                                                <div className="io-explanation">
                                                    <strong>Explanation:</strong>
                                                    <p>{st.explanation}</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ─── VERTICAL DRAG DIVIDER ─── */}
                    <div className="pane-divider-vertical" onMouseDown={startVertDrag} title="Drag to resize" />

                    {/* ─── RIGHT PANE: Editor (top) + Output (bottom) ─── */}
                    <div className="workspace-right-pane" ref={rightPaneRef} style={{ width: `${100 - leftPaneWidth}%` }}>

                        {/* Editor section — takes remaining height above output */}
                        <div className="editor-container-card" style={{ flex: 1, minHeight: 0 }}>
                            {/* Language toolbar */}
                            <div className="editor-toolbar">
                                <div className="toolbar-left">
                                    <select
                                        value={language}
                                        onChange={(e) => {
                                            const newLang = e.target.value;
                                            setLanguage(newLang);
                                            const codeKey = `${currentQuestion.id}_${newLang}`;
                                            if (!codeMap[codeKey]) {
                                                const boilerplate = currentQuestion.boilerplates?.[newLang] || FREE_BOILERPLATES[newLang] || "";
                                                setCodeMap(prev => ({ ...prev, [codeKey]: boilerplate }));
                                            }
                                        }}
                                        className="language-selector"
                                    >
                                        <option value="cpp">C++ (GCC G++)</option>
                                        <option value="c">C (GCC GCC)</option>
                                        <option value="python">Python 3 (Python)</option>
                                        <option value="java">Java (OpenJDK javac)</option>
                                        <option value="javascript">JavaScript (Node.js 18)</option>
                                    </select>
                                </div>
                                <div className="toolbar-right">
                                    <button className="editor-control-btn reset-btn" onClick={handleResetCode}>
                                        <FaUndo /> Reset Boilerplate
                                    </button>
                                </div>
                            </div>

                            {/* Monaco Editor */}
                            <div className="monaco-wrapper">
                                <Editor
                                    key={`${currentQuestion.id}_${language}`}
                                    height="100%"
                                    language={language === 'cpp' ? 'cpp' : (language === 'c' ? 'c' : (language === 'javascript' ? 'javascript' : language))}
                                    defaultValue={codeMap[`${currentQuestion.id}_${language}`] || ""}
                                    onChange={handleCodeChange}
                                    onMount={(editor) => {
                                        editorRef.current = editor;
                                    }}
                                    theme={['light', 'red-light'].includes(localStorage.getItem('portal_theme')) ? 'light' : 'vs-dark'}
                                    options={{
                                        fontSize: 14,
                                        fontFamily: "'JetBrains Mono', Courier, monospace",
                                        minimap: { enabled: false },
                                        scrollbar: { vertical: 'visible', horizontal: 'visible' },
                                        automaticLayout: true,
                                        cursorBlinking: 'smooth',
                                        wordWrap: 'on'
                                    }}
                                />
                            </div>

                            {/* Action buttons */}
                            <div className="editor-footer-actions">
                                <div className="footer-left" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <button
                                        className="run-btn"
                                        onClick={runSampleTestCases}
                                        disabled={isRunning || isEvaluating}
                                    >
                                        {isRunning ? (
                                            <><div className="button-spinner"></div> Compiling...</>
                                        ) : (
                                            <><FaPlay /> Run Code</>
                                        )}
                                    </button>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: '#94a3b8', userSelect: 'none', margin: 0 }}>
                                        <input
                                            type="checkbox"
                                            checked={useCustomInput}
                                            onChange={(e) => setUseCustomInput(e.target.checked)}
                                            style={{ cursor: 'pointer', width: '15px', height: '15px', margin: 0 }}
                                        />
                                        Run along with sample test cases
                                    </label>
                                </div>
                                <div className="footer-right">
                                    <button
                                        className="solve-question-btn"
                                        onClick={evaluateQuestion}
                                        disabled={isRunning || isEvaluating}
                                    >
                                        {isEvaluating ? (
                                            <><div className="button-spinner"></div> Evaluating...</>
                                        ) : (
                                            <>Submit Question</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* ─── HORIZONTAL DRAG DIVIDER ─── */}
                        <div className="pane-divider-horizontal" onMouseDown={startHorizDrag} title="Drag to resize output panel" />

                        {/* Output / Console panel — below editor */}
                        <div className="console-output-card" style={{ height: `${outputPaneHeight}px`, flexShrink: 0 }}>
                            <div className="tabs-header">
                                <button
                                    className={`tab-btn ${activeResultTab === 'input' ? 'active' : ''}`}
                                    onClick={() => setActiveResultTab('input')}
                                >Custom Input</button>
                                <button
                                    className={`tab-btn ${activeResultTab === 'output' ? 'active' : ''}`}
                                    onClick={() => setActiveResultTab('output')}
                                >Stdout Logs</button>
                                <button
                                    className={`tab-btn ${activeResultTab === 'results' ? 'active' : ''}`}
                                    onClick={() => setActiveResultTab('results')}
                                >Test Results</button>
                            </div>
                            <div className="tab-body-scroll">
                                {activeResultTab === 'input' && (
                                    <textarea
                                        className="custom-stdin-input"
                                        placeholder="Type standard input (stdin) values here..."
                                        value={customInput}
                                        onChange={(e) => setCustomInput(e.target.value)}
                                    />
                                )}

                                {activeResultTab === 'output' && (
                                    <div className="compiler-output-display">
                                        {stderr && (
                                            <pre className="output-stderr-pre">
                                                <strong>Stderr / Errors:</strong><br />
                                                {stderr}
                                            </pre>
                                        )}
                                        {stdout && (
                                            <pre className="output-stdout-pre">
                                                <strong>Stdout:</strong><br />
                                                {stdout}
                                            </pre>
                                        )}
                                        {!stdout && !stderr && (
                                            <span className="no-output-hint">Click 'Run Code' to compile and execute program.</span>
                                        )}
                                    </div>
                                )}

                                {activeResultTab === 'results' && (
                                    <div className="test-results-list">
                                        {runResults && (
                                            <div className="results-group">
                                                <h4>Sample Test Cases Execution Logs:</h4>
                                                <table className="results-table">
                                                    <thead>
                                                        <tr>
                                                            <th>Case</th>
                                                            <th>Status</th>
                                                            <th>Actual</th>
                                                            <th>Expected</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {runResults.map(r => (
                                                            <tr key={r.index}>
                                                                <td>Case {r.index}</td>
                                                                <td className={r.passed ? 'pass-cell' : 'fail-cell'}>
                                                                    {r.passed ? 'PASSED' : 'FAILED'}
                                                                </td>
                                                                <td><pre className="inline-io">{r.actual || '[Empty]'}</pre></td>
                                                                <td><pre className="inline-io">{r.expected}</pre></td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}

                                        {evalResults && (
                                            <div className="results-group">
                                                <h4>Hidden Test Cases Evaluation Result:</h4>
                                                <div className="hidden-cases-badges">
                                                    {evalResults.map(r => (
                                                        <span
                                                            key={r.index}
                                                            className={`hidden-badge ${r.passed ? 'badge-pass' : 'badge-fail'}`}
                                                            title={r.error ? r.error : 'Passed Case'}
                                                        >
                                                            Case {r.index}: {r.passed ? 'PASS' : 'FAIL'}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {!runResults && !evalResults && (
                                            <span className="no-output-hint">Run Code or Submit to view verified test cases.</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="workspace-loading-fallback">
                    <div className="learn-spinner"></div>
                    <p>Loading Workspace Questions...</p>
                </div>
            )}

            {/* Lockout overlay (visible on proctor violation) */}
            {isLockedOut && (
                <div className="proctor-lockout-overlay">
                    <div className="lockout-card">
                        <FaLock className="lock-icon" />
                        <h2>WORKSPACE LOCKED OUT</h2>
                        <p>
                            Your access to this coding assessment has been revoked because you have switched tabs/minimized windows 3 times.
                        </p>
                        <p>
                            Your progress has been automatically calculated and submitted.
                        </p>
                        <button onClick={() => navigate(CODING_ROUTE_BASE)} className="exit-btn">
                            Exit Assessment
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

            {/* Submit sequence full-screen overlay — shows evaluating or submitting phase */}
            {isSubmitting && (
                <div className="compiling-workspace-overlay" style={{ zIndex: 1200 }}>
                    <div className="compiling-loader-container">
                        <div className="compiling-spinner"></div>
                        {submitPhase === 'evaluating' ? (
                            <>
                                <span className="compiling-loader-text"> Evaluating All Questions...</span>
                                <span className="compiling-loader-subtext">Running hidden test cases against your solutions. Please wait.</span>
                            </>
                        ) : (
                            <>
                                <span className="compiling-loader-text"> Submitting Assessment...</span>
                                <span className="compiling-loader-subtext">Saving your results securely. Please do not close this window.</span>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Compilation/Evaluation Full-Screen Overlay (Run & Evaluate buttons) - Commented out to run inline inside buttons */}
            {/*
            {(isRunning || isEvaluating) && (
                <div className="compiling-workspace-overlay" style={{ zIndex: 1100 }}>
                    <div className="compiling-loader-container">
                        <div className="compiling-spinner"></div>
                        <span className="compiling-loader-text">
                            {isRunning ? ' Compiling & Running...' : ' Evaluating Test Cases...'}
                        </span>
                        <span className="compiling-loader-subtext">
                            {isRunning ? 'Executing your code against sample test cases...' : 'Running hidden test cases against your solution...'}
                        </span>
                    </div>
                </div>
            )}
            */}

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
            {/* Global Submitting / Evaluating Overlay */}
            {(isSubmitting || submitPhase) && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                    background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    zIndex: 99999, color: 'white', fontFamily: "'Inter', sans-serif"
                }}>
                    <div style={{
                        background: 'rgba(30, 41, 59, 0.95)', border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '16px', padding: '36px 48px', textAlign: 'center', maxWidth: '460px',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
                    }}>
                        <div className="learn-spinner" style={{ width: '48px', height: '48px', borderTopColor: '#10b981', margin: '0 auto 20px' }} />
                        <h3 style={{ fontSize: '1.4rem', fontWeight: '800', marginBottom: '8px', color: '#f8fafc' }}>
                            {submitPhase === 'evaluating' ? 'Evaluating Code Across Test Cases...' : 'Submitting Assessment Results...'}
                        </h3>
                        <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: '1.5', margin: 0 }}>
                            {submitPhase === 'evaluating' 
                                ? 'Running hidden test cases on your code to calculate official scores...' 
                                : 'Compiling your score and synchronizing results with the secure exam server. Please wait...'}
                        </p>
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
