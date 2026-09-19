import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  ArrowLeft,
  Clock,
  Send,
  FileText,
  Info,
  FileCheck,
  PenTool,
  Trophy,
  Target,
  Lightbulb,
  Bold,
  Italic,
  Underline,
  Link2,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
  Gauge,
  Cloud,
  Save,
  ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';
import { countWords, calculateGrossWPM } from '../utils/essayTextUtil';
import { evaluateEssay } from '../services/essayEvaluationService';
import '../styles/EssaySectionView.css';

const IDLE_TIMEOUT_MS = 3000; // 3 seconds idle pauses active typing clock

const DEFAULT_TOPICS = [
  'The Role of Technology in Shaping the Future',
  'The Impact of AI on Future Careers',
  'The Importance of Data Security in the Digital Age',
  'How Automation is Reshaping Industries'
];

/**
 * Extracts individual essay topics from the prompt question or configuration.
 */
function parseTopicsFromPrompt(question, customTopics) {
  if (Array.isArray(customTopics) && customTopics.length > 0) {
    return customTopics;
  }
  if (!question || typeof question !== 'string') {
    return DEFAULT_TOPICS;
  }

  const lines = question.split('\n').map((l) => l.trim()).filter(Boolean);
  const detected = [];
  for (const line of lines) {
    const match = line.match(/^(\d+)[.)\-:\s]+(.*)/);
    if (match && match[2] && match[2].trim().length > 4) {
      detected.push(match[2].trim());
    }
  }

  if (detected.length >= 2) {
    return detected;
  }
  return DEFAULT_TOPICS;
}

const EssaySectionView = ({
  sectionData,
  secTimer,
  secStarted,
  proctoringData,
  settings,
  onSectionSubmit,
  onBack,
  assessmentName = '',
  assessmentId = '',
  user = null
}) => {
  // Extract configuration from sectionData
  const prompt = useMemo(() => {
    return sectionData?.essayPrompt || {
      title: sectionData?.name || sectionData?.title || 'Essay Writing',
      question: sectionData?.description || sectionData?.instructions || '',
      instructions: sectionData?.instructions || 'Write a well-structured essay with introduction, body paragraphs, and conclusion.',
      minWords: Number(sectionData?.minWords) || 300,
      maxWords: Number(sectionData?.maxWords) || 500,
      maxMarks: Number(sectionData?.maxScore) || 20,
      requireTitle: sectionData?.requireTitle !== false,
      enableTypingAnalytics: sectionData?.enableTypingAnalytics !== false,
      trackPaste: sectionData?.trackPaste !== false,
      topics: sectionData?.topics || null
    };
  }, [sectionData]);

  const rubric = useMemo(() => {
    return sectionData?.essayRubric || {
      contentWeight: 8,
      grammarWeight: 4,
      structureWeight: 3,
      coherenceWeight: 3,
      vocabularyWeight: 2,
      passThreshold: 50
    };
  }, [sectionData]);

  const topicsList = useMemo(() => {
    return parseTopicsFromPrompt(prompt.question, prompt.topics);
  }, [prompt.question, prompt.topics]);

  const storageDraftKey = useMemo(() => {
    const sId = sectionData?.sectionId || sectionData?.id || 'sec-essay';
    const aId = assessmentId || 'ass-current';
    const uid = user?.uid || 'guest';
    return `msa_essay_draft_${uid}_${aId}_${sId}`;
  }, [sectionData, assessmentId, user]);

  // Fullscreen toggle state (hides/collapses the left question pane)
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Candidate input states
  const [studentTitle, setStudentTitle] = useState('');
  const [selectedTopicIdx, setSelectedTopicIdx] = useState(null);
  const [answerText, setAnswerText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState('Just now');
  const [textAlign, setTextAlign] = useState('left');
  const [headingLevel, setHeadingLevel] = useState('Paragraph');
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);

  // History stack for Undo / Redo
  const [history, setHistory] = useState(['']);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Typing telemetry state
  const [activeTypingSeconds, setActiveTypingSeconds] = useState(0);
  const lastKeyTimeRef = useRef(Date.now());
  const isTypingActiveRef = useRef(false);
  const typingTimerIntervalRef = useRef(null);

  // Telemetry counters
  const keystrokesRef = useRef(0);
  const pasteCountRef = useRef(0);
  const pasteCharsRef = useRef(0);
  const cutCountRef = useRef(0);
  const deleteCountRef = useRef(0);
  const revisionCountRef = useRef(0);
  const [pasteCountDisplay, setPasteCountDisplay] = useState(0);

  const textareaRef = useRef(null);

  // Auto-select topic if title matches, or set default title if empty
  useEffect(() => {
    if (!studentTitle && topicsList.length > 1) {
      // Default to topic 2 (as seen in mockup) or topic 1
      const defaultTopic = topicsList[1] || topicsList[0];
      setStudentTitle(defaultTopic);
      setSelectedTopicIdx(topicsList[1] ? 1 : 0);
    }
  }, [topicsList]);

  // Restore draft from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageDraftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.studentTitle) {
          setStudentTitle(parsed.studentTitle);
          const idx = topicsList.indexOf(parsed.studentTitle);
          if (idx !== -1) setSelectedTopicIdx(idx);
        }
        if (parsed.answerText) {
          setAnswerText(parsed.answerText);
          setHistory([parsed.answerText]);
          setHistoryIndex(0);
        }
        if (parsed.activeTypingSeconds) setActiveTypingSeconds(Number(parsed.activeTypingSeconds) || 0);
        if (parsed.keystrokes) keystrokesRef.current = Number(parsed.keystrokes) || 0;
        if (parsed.pasteCount) {
          pasteCountRef.current = Number(parsed.pasteCount) || 0;
          setPasteCountDisplay(pasteCountRef.current);
        }
        toast.info('Restored saved essay draft', { duration: 2500 });
      }
    } catch (_) {}
  }, [storageDraftKey, topicsList]);

  // Keyboard shortcut: Escape exits fullscreen
  useEffect(() => {
    const handleKeyDownGlobal = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
        toast.info('Exited fullscreen (Question pane restored)');
      }
    };
    window.addEventListener('keydown', handleKeyDownGlobal);
    return () => window.removeEventListener('keydown', handleKeyDownGlobal);
  }, [isFullscreen]);

  // Active Typing Clock Interval
  useEffect(() => {
    typingTimerIntervalRef.current = setInterval(() => {
      const now = Date.now();
      if (isTypingActiveRef.current && now - lastKeyTimeRef.current < IDLE_TIMEOUT_MS) {
        setActiveTypingSeconds((prev) => prev + 1);
      } else {
        isTypingActiveRef.current = false;
      }
    }, 1000);

    return () => {
      if (typingTimerIntervalRef.current) clearInterval(typingTimerIntervalRef.current);
    };
  }, []);

  // Autosave Draft (debounced 3 seconds)
  useEffect(() => {
    const handler = setTimeout(() => {
      if (!answerText && !studentTitle) return;
      try {
        const snapshot = {
          studentTitle,
          answerText,
          activeTypingSeconds,
          keystrokes: keystrokesRef.current,
          pasteCount: pasteCountRef.current,
          savedAt: new Date().toISOString()
        };
        localStorage.setItem(storageDraftKey, JSON.stringify(snapshot));
        setAutosaveStatus('Just now');
      } catch (_) {}
    }, 2500);

    return () => clearTimeout(handler);
  }, [studentTitle, answerText, activeTypingSeconds, storageDraftKey]);

  // Derived metrics
  const wordCount = useMemo(() => countWords(answerText), [answerText]);
  const grossWpm = useMemo(() => calculateGrossWPM(wordCount, activeTypingSeconds), [wordCount, activeTypingSeconds]);
  const readingTime = useMemo(() => Math.max(0, Math.ceil(wordCount / 200)), [wordCount]);

  const minWords = prompt.minWords || 300;
  const maxWords = prompt.maxWords || 500;

  // Track text changes with undo/redo snapshotting
  const handleTextChange = (newText) => {
    setAnswerText(newText);
    setAutosaveStatus('Saving...');

    // Save snapshot every 15 characters
    if (Math.abs(newText.length - (history[historyIndex]?.length || 0)) > 15) {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newText);
      if (newHistory.length > 50) newHistory.shift();
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  };

  const handleKeyDown = (e) => {
    lastKeyTimeRef.current = Date.now();
    isTypingActiveRef.current = true;
    keystrokesRef.current += 1;

    if (e.key === 'Backspace' || e.key === 'Delete') {
      deleteCountRef.current += 1;
      revisionCountRef.current += 1;
    }
  };

  const handlePaste = (e) => {
    pasteCountRef.current += 1;
    setPasteCountDisplay(pasteCountRef.current);
    const pasted = e.clipboardData ? e.clipboardData.getData('text') : '';
    pasteCharsRef.current += (pasted || '').length;

    if (prompt.trackPaste !== false) {
      toast.info('Paste event recorded in integrity telemetry', { duration: 2000 });
    }
  };

  const handleCut = () => {
    cutCountRef.current += 1;
    revisionCountRef.current += 1;
  };

  // Formatting actions
  const applyFormat = (formatType) => {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = answerText.substring(start, end);

    let replacement = '';
    let cursorOffset = 0;

    switch (formatType) {
      case 'bold':
        replacement = `**${selected || 'bold text'}**`;
        cursorOffset = selected ? replacement.length : 2;
        break;
      case 'italic':
        replacement = `*${selected || 'italic text'}*`;
        cursorOffset = selected ? replacement.length : 1;
        break;
      case 'underline':
        replacement = `<u>${selected || 'underlined text'}</u>`;
        cursorOffset = selected ? replacement.length : 3;
        break;
      case 'link': {
        const url = prompt('Enter web link URL (https://...):');
        if (!url) return;
        replacement = `[${selected || 'link text'}](${url})`;
        cursorOffset = replacement.length;
        break;
      }
      case 'bullet': {
        if (!selected) {
          replacement = '\n• ';
          cursorOffset = 3;
        } else {
          replacement = selected
            .split('\n')
            .map((line) => (line.startsWith('• ') ? line : `• ${line}`))
            .join('\n');
          cursorOffset = replacement.length;
        }
        break;
      }
      case 'number': {
        if (!selected) {
          replacement = '\n1. ';
          cursorOffset = 4;
        } else {
          replacement = selected
            .split('\n')
            .map((line, i) => `${i + 1}. ${line}`)
            .join('\n');
          cursorOffset = replacement.length;
        }
        break;
      }
      case 'h1':
        replacement = `\n# ${selected || 'Heading 1'}\n`;
        cursorOffset = replacement.length;
        break;
      case 'h2':
        replacement = `\n## ${selected || 'Heading 2'}\n`;
        cursorOffset = replacement.length;
        break;
      case 'h3':
        replacement = `\n### ${selected || 'Heading 3'}\n`;
        cursorOffset = replacement.length;
        break;
      default:
        return;
    }

    const nextText = answerText.substring(0, start) + replacement + answerText.substring(end);
    handleTextChange(nextText);

    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + cursorOffset, start + cursorOffset);
    }, 0);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIdx = historyIndex - 1;
      setHistoryIndex(prevIdx);
      setAnswerText(history[prevIdx] || '');
      toast.info('Undo', { duration: 1000 });
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      setAnswerText(history[nextIdx] || '');
      toast.info('Redo', { duration: 1000 });
    }
  };

  // Handle Topic Selection
  const handleSelectTopic = (topic, idx) => {
    setSelectedTopicIdx(idx);
    setStudentTitle(topic);
    toast.success(`Selected Topic: ${topic}`);
  };

  // Format countdown timer (HH:MM:SS)
  const formatTimer = (secs) => {
    if (secs === undefined || secs === null || isNaN(secs)) return '01:00:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Submission handler
  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;

    // 1. Title Validation
    if (prompt.requireTitle !== false && !studentTitle.trim()) {
      toast.error('Please enter an essay title before submitting.');
      return;
    }

    // 2. Word Count Bounds
    if (wordCount < minWords) {
      toast.error(`Minimum word limit not met. Please write at least ${minWords} words (currently ${wordCount}).`);
      return;
    }

    if (wordCount > maxWords * 1.5) {
      toast.warning(`Essay exceeds the maximum limit of ${maxWords} words. Submitting anyway...`);
    }

    setIsSubmitting(true);
    toast.info('Evaluating essay and scoring rubric...', { duration: 2000 });

    try {
      // 3. Deterministic Rubric & Grammar Evaluation
      const evaluation = evaluateEssay(studentTitle, answerText, prompt, rubric);

      const payload = {
        score: evaluation.score,
        totalMarks: evaluation.maxScore,
        maxScore: evaluation.maxScore,
        percentage: evaluation.percentage,
        passed: evaluation.passed,
        timeSpentSeconds: activeTypingSeconds,
        studentTitle: studentTitle.trim(),
        answerText: answerText.trim(),
        wordCount,
        rubricScores: evaluation.rubricScores,
        rubricMax: evaluation.rubricMax,
        grammarAnalysis: evaluation.grammarAnalysis,
        submission: {
          studentTitle: studentTitle.trim(),
          answerText: answerText.trim(),
          wordCount,
          submittedAt: new Date().toISOString()
        },
        typingMetrics: {
          activeTypingSeconds,
          grossWpm,
          netWpm: grossWpm,
          keystrokes: keystrokesRef.current,
          pasteCount: pasteCountRef.current,
          pasteCharacters: pasteCharsRef.current,
          cutCount: cutCountRef.current,
          deleteCount: deleteCountRef.current,
          revisionCount: revisionCountRef.current,
          pasteUsed: pasteCountRef.current > 0
        },
        evaluation,
        prompt: {
          title: prompt.title || sectionData?.name || 'Essay Topic',
          question: prompt.question || '',
          minWords,
          maxWords,
          maxMarks: prompt.maxMarks || 20
        },
        sectionName: sectionData?.name || 'Essay Writing',
        type: 'essay'
      };

      // Clear local draft
      try {
        localStorage.removeItem(storageDraftKey);
      } catch (_) {}

      // Pass result to parent MSA runner
      if (onSectionSubmit) {
        onSectionSubmit(payload);
      }
    } catch (err) {
      console.error('[EssaySectionView] Submission error:', err);
      toast.error('Submission failed. Please try again.');
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    prompt,
    rubric,
    studentTitle,
    answerText,
    wordCount,
    minWords,
    maxWords,
    activeTypingSeconds,
    grossWpm,
    storageDraftKey,
    onSectionSubmit,
    sectionData
  ]);

  return (
    <div className={`essay-view-wrapper ${isFullscreen ? 'is-fullscreen-mode' : ''}`}>
      {/* ── TOP HEADER BAR ── */}
      <header className="essay-top-bar">
        <button
          type="button"
          className="essay-back-btn"
          onClick={() => (onBack ? onBack() : toast.info('Returning to assessment overview...'))}
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          <span>Back to Assessment</span>
        </button>

        <div className="essay-top-right">
          <div className="essay-timer-pill">
            <Clock className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0" />
            <div className="essay-timer-text">
              <span className="essay-timer-label">Time Left</span>
              <span className="essay-timer-val">{formatTimer(secTimer)}</span>
            </div>
          </div>

          <button
            type="button"
            className="essay-submit-btn"
            onClick={handleSubmit}
            disabled={isSubmitting || wordCount < minWords}
          >
            <Send className="w-4 h-4 mr-2" />
            <span>{isSubmitting ? 'Submitting...' : 'Submit Assessment'}</span>
          </button>
        </div>
      </header>

      {/* ── MAIN WORKSPACE (SPLIT PANE) ── */}
      <div className="essay-main-layout">
        {/* ── LEFT PANE: QUESTION & CRITERIA (Hidden when isFullscreen is true) ── */}
        {!isFullscreen && (
          <aside className="essay-question-pane" aria-label="Question Details">
            {/* Card 1: Main Topic & Topics (Choose One) */}
            <div className="essay-card essay-card-main">
              <div className="essay-card-header-row">
                <div className="essay-card-icon-box bg-blue-50 text-blue-600">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="essay-card-title">{prompt.title || 'Essay Writing'}</h2>
                  <p className="essay-card-subtitle">
                    Choose any ONE topic from the list below and write a well-structured essay.
                  </p>
                </div>
              </div>

              <div className="essay-topics-section">
                <div className="essay-topics-heading">
                  <Info className="w-4 h-4 text-blue-600 mr-1.5" />
                  <span>Topics (Choose One)</span>
                </div>

                <div className="essay-topics-list">
                  {topicsList.map((topic, idx) => {
                    const isSelected = selectedTopicIdx === idx || studentTitle === topic;
                    return (
                      <button
                        type="button"
                        key={idx}
                        className={`essay-topic-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleSelectTopic(topic, idx)}
                      >
                        <span className="essay-topic-number">{idx + 1}</span>
                        <span className="essay-topic-name">{topic}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Card 2: Instructions */}
            <div className="essay-card essay-card-row">
              <div className="essay-card-icon-box bg-emerald-50 text-emerald-600">
                <FileCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="essay-card-heading">Instructions</h3>
                <p className="essay-card-desc">
                  {prompt.instructions || 'Write a well-structured essay with introduction, body paragraphs, and conclusion.'}
                </p>
              </div>
            </div>

            {/* Card 3: Word Limit */}
            <div className="essay-card essay-card-row">
              <div className="essay-card-icon-box bg-purple-50 text-purple-600">
                <PenTool className="w-5 h-5" />
              </div>
              <div>
                <h3 className="essay-card-heading">Word Limit</h3>
                <p className="essay-card-desc">
                  {minWords} – {maxWords} words (Recommended)
                </p>
              </div>
            </div>

            {/* Card 4: Total Marks */}
            <div className="essay-card essay-card-row">
              <div className="essay-card-icon-box bg-amber-50 text-amber-600">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <h3 className="essay-card-heading">Total Marks</h3>
                <p className="essay-card-desc">{prompt.maxMarks || 20} Marks</p>
              </div>
            </div>

            {/* Card 5: Evaluation Criteria */}
            <div className="essay-card essay-card-row">
              <div className="essay-card-icon-box bg-blue-50 text-blue-600">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <h3 className="essay-card-heading">Evaluation Criteria</h3>
                <p className="essay-card-desc">
                  Content quality, structure, clarity, originality, and relevance.
                </p>
              </div>
            </div>

            {/* Card 6: Tip Card */}
            <div className="essay-card essay-tip-card">
              <Lightbulb className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="essay-tip-title">Tip</h4>
                <p className="essay-tip-text">
                  Plan your thoughts before writing. A clear structure helps you score better.
                </p>
              </div>
            </div>
          </aside>
        )}

        {/* ── RIGHT PANE: ESSAY EDITOR WORKSPACE ── */}
        <main className={`essay-editor-pane ${isFullscreen ? 'w-full' : ''}`} aria-label="Essay Editor">
          {/* Field 1: Essay Title */}
          <div className="essay-field-group">
            <label htmlFor="essay-title-input" className="essay-field-label">
              Essay Title <span className="text-red-500">*</span>
            </label>
            <div className="essay-input-wrapper">
              <input
                id="essay-title-input"
                type="text"
                className="essay-title-field"
                placeholder="Enter a compelling title for your essay..."
                value={studentTitle}
                onChange={(e) => setStudentTitle(e.target.value.slice(0, 200))}
                maxLength={200}
                disabled={isSubmitting}
              />
              <span className="essay-char-counter">{studentTitle.length}/200</span>
            </div>
          </div>

          {/* Field 2: Your Essay with Rich Toolbar */}
          <div className="essay-field-group">
            <label htmlFor="essay-textarea-input" className="essay-field-label">
              Your Essay <span className="text-red-500">*</span>
            </label>

            <div className="essay-editor-box">
              {/* Toolbar */}
              <div className="essay-toolbar">
                <div className="essay-toolbar-left">
                  {/* Paragraph Dropdown */}
                  <div className="essay-dropdown-container">
                    <button
                      type="button"
                      className="essay-tool-btn essay-dropdown-trigger"
                      onClick={() => setShowHeadingMenu(!showHeadingMenu)}
                    >
                      <span>{headingLevel}</span>
                      <ChevronDown className="w-3.5 h-3.5 ml-1" />
                    </button>
                    {showHeadingMenu && (
                      <div className="essay-dropdown-menu">
                        <button
                          type="button"
                          className="essay-dropdown-item"
                          onClick={() => {
                            setHeadingLevel('Paragraph');
                            setShowHeadingMenu(false);
                          }}
                        >
                          Paragraph
                        </button>
                        <button
                          type="button"
                          className="essay-dropdown-item font-bold"
                          onClick={() => {
                            setHeadingLevel('Heading 1');
                            applyFormat('h1');
                            setShowHeadingMenu(false);
                          }}
                        >
                          Heading 1
                        </button>
                        <button
                          type="button"
                          className="essay-dropdown-item font-semibold"
                          onClick={() => {
                            setHeadingLevel('Heading 2');
                            applyFormat('h2');
                            setShowHeadingMenu(false);
                          }}
                        >
                          Heading 2
                        </button>
                        <button
                          type="button"
                          className="essay-dropdown-item font-medium"
                          onClick={() => {
                            setHeadingLevel('Heading 3');
                            applyFormat('h3');
                            setShowHeadingMenu(false);
                          }}
                        >
                          Heading 3
                        </button>
                      </div>
                    )}
                  </div>

                  <span className="essay-toolbar-divider" />

                  {/* Format actions */}
                  <button
                    type="button"
                    className="essay-tool-btn font-bold"
                    title="Bold (**text**)"
                    onClick={() => applyFormat('bold')}
                  >
                    <Bold className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    className="essay-tool-btn italic"
                    title="Italic (*text*)"
                    onClick={() => applyFormat('italic')}
                  >
                    <Italic className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    className="essay-tool-btn underline"
                    title="Underline"
                    onClick={() => applyFormat('underline')}
                  >
                    <Underline className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    className="essay-tool-btn"
                    title="Insert Link"
                    onClick={() => applyFormat('link')}
                  >
                    <Link2 className="w-4 h-4" />
                  </button>

                  <span className="essay-toolbar-divider" />

                  {/* Lists */}
                  <button
                    type="button"
                    className="essay-tool-btn"
                    title="Bulleted List"
                    onClick={() => applyFormat('bullet')}
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    className="essay-tool-btn"
                    title="Numbered List"
                    onClick={() => applyFormat('number')}
                  >
                    <ListOrdered className="w-4 h-4" />
                  </button>

                  <span className="essay-toolbar-divider" />

                  {/* Alignment */}
                  <button
                    type="button"
                    className={`essay-tool-btn ${textAlign === 'left' ? 'active' : ''}`}
                    title="Align Left"
                    onClick={() => setTextAlign('left')}
                  >
                    <AlignLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    className={`essay-tool-btn ${textAlign === 'center' ? 'active' : ''}`}
                    title="Align Center"
                    onClick={() => setTextAlign('center')}
                  >
                    <AlignCenter className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    className={`essay-tool-btn ${textAlign === 'right' ? 'active' : ''}`}
                    title="Align Right"
                    onClick={() => setTextAlign('right')}
                  >
                    <AlignRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="essay-toolbar-right">
                  {/* FULLSCREEN BUTTON: Toggles question pane visibility */}
                  <button
                    type="button"
                    className={`essay-tool-btn essay-fullscreen-btn ${isFullscreen ? 'active-fullscreen' : ''}`}
                    title={isFullscreen ? 'Exit Fullscreen (Show Question Pane)' : 'Fullscreen Mode (Hide Question Pane)'}
                    onClick={() => {
                      setIsFullscreen((prev) => {
                        const next = !prev;
                        toast.info(next ? 'Fullscreen active: Question pane hidden' : 'Restored Question pane');
                        return next;
                      });
                    }}
                  >
                    {isFullscreen ? (
                      <Minimize2 className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Maximize2 className="w-4 h-4" />
                    )}
                  </button>

                  <button
                    type="button"
                    className="essay-tool-btn"
                    title="Undo"
                    onClick={handleUndo}
                    disabled={historyIndex <= 0}
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    className="essay-tool-btn"
                    title="Redo"
                    onClick={handleRedo}
                    disabled={historyIndex >= history.length - 1}
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Textarea Area */}
              <div className="essay-textarea-container">
                <textarea
                  ref={textareaRef}
                  id="essay-textarea-input"
                  className="essay-main-textarea"
                  style={{ textAlign }}
                  placeholder="Start writing your essay here..."
                  value={answerText}
                  onChange={(e) => handleTextChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  onCut={handleCut}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>

          {/* ── METRICS STRIP (4 CARDS) ── */}
          <div className="essay-metrics-strip">
            {/* 1. Words */}
            <div className="essay-metric-card">
              <div className="essay-metric-icon bg-blue-50 text-blue-600">
                <FileText className="w-4 h-4" />
              </div>
              <div className="essay-metric-info">
                <span className="essay-metric-label">Words</span>
                <span className="essay-metric-value">
                  {wordCount} / {maxWords}
                </span>
              </div>
            </div>

            {/* 2. Reading Time */}
            <div className="essay-metric-card">
              <div className="essay-metric-icon bg-blue-50 text-blue-600">
                <Clock className="w-4 h-4" />
              </div>
              <div className="essay-metric-info">
                <span className="essay-metric-label">Reading Time</span>
                <span className="essay-metric-value">{readingTime} min</span>
              </div>
            </div>

            {/* 3. Typing Speed */}
            <div className="essay-metric-card">
              <div className="essay-metric-icon bg-blue-50 text-blue-600">
                <Gauge className="w-4 h-4" />
              </div>
              <div className="essay-metric-info">
                <span className="essay-metric-label">Typing Speed</span>
                <span className="essay-metric-value">{grossWpm} WPM</span>
              </div>
            </div>

            {/* 4. Auto-saved */}
            <div className="essay-metric-card">
              <div className="essay-metric-icon bg-emerald-50 text-emerald-600">
                <Cloud className="w-4 h-4" />
              </div>
              <div className="essay-metric-info">
                <span className="essay-metric-label">Auto-saved</span>
                <span className="essay-metric-value text-emerald-600 font-semibold">{autosaveStatus}</span>
              </div>
            </div>
          </div>

          {/* ── ACTION FOOTER ── */}
          <div className="essay-action-footer">
            <button
              type="button"
              className="essay-draft-btn"
              onClick={() => {
                try {
                  localStorage.setItem(
                    storageDraftKey,
                    JSON.stringify({
                      studentTitle,
                      answerText,
                      activeTypingSeconds,
                      keystrokes: keystrokesRef.current,
                      pasteCount: pasteCountRef.current,
                      savedAt: new Date().toISOString()
                    })
                  );
                  setAutosaveStatus('Just now');
                  toast.success('Draft saved locally');
                } catch (_) {}
              }}
              disabled={isSubmitting}
            >
              <Save className="w-4 h-4 mr-2" />
              <span>Save Draft</span>
            </button>

            <span className="essay-autosave-hint">
              Your answer is auto-saved every few seconds.
            </span>

            <button
              type="button"
              className="essay-submit-action-btn"
              onClick={handleSubmit}
              disabled={isSubmitting || wordCount < minWords}
            >
              <Send className="w-4 h-4 mr-2" />
              <span>{isSubmitting ? 'Evaluating...' : 'Submit Assessment'}</span>
            </button>
          </div>
        </main>
      </div>
    </div>
  );
};

EssaySectionView.propTypes = {
  sectionData: PropTypes.object,
  secTimer: PropTypes.number,
  secStarted: PropTypes.bool,
  proctoringData: PropTypes.object,
  settings: PropTypes.object,
  onSectionSubmit: PropTypes.func.isRequired,
  onBack: PropTypes.func,
  assessmentName: PropTypes.string,
  assessmentId: PropTypes.string,
  user: PropTypes.object
};

export default EssaySectionView;
