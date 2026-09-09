import React, { useState, useEffect, useMemo } from 'react';
import { 
  FaPlay, FaCheckCircle, FaLock, FaChevronDown, 
  FaChevronUp, FaSignOutAlt, FaArrowLeft, FaArrowRight, 
  FaBookOpen, FaFileAlt, FaFolder, FaAward, FaCertificate, 
  FaTimes, FaCode, FaCheck, FaQuestionCircle, FaLayerGroup,
  FaLaptopCode, FaBars, FaChevronLeft, FaChevronRight
} from 'react-icons/fa';
import LessonDeliveryStage from './delivery/LessonDeliveryStage';
import CodeExamplesActivity from './activities/CodeExamplesActivity';
import NotesActivity from './activities/NotesActivity';
import CourseMSAView from './msa/CourseMSAView';
import CourseOverviewView from './views/CourseOverviewView';
import CourseCodingPracticeView from './views/CourseCodingPracticeView';
import CourseResourcesView from './views/CourseResourcesView';
import ModuleCompletionModal from './views/ModuleCompletionModal';
import CourseCertificateModal from './views/CourseCertificateModal';
import learningEngineService, {
  markTopicCompleted,
  getTopicActivityStatus,
  recordTopicPracticeSolved,
  findTopicInCourse
} from '../services/learningEngineService';
import { toast } from 'sonner';
import '../styles/CourseLearningPlayer.css';
import '../styles/LessonDelivery.css';
import '../styles/CourseMSA.css';

const CourseLearningPlayer = ({ course, onExit, user, initialView = 'OVERVIEW' }) => {
  const uid = user?.uid || 'demo-student';

  const firstMod = course?.modules?.[0];
  const firstTop = firstMod?.topics?.[0];

  const [activePlayerView, setActivePlayerView] = useState(initialView); // 'CLASS' | 'OVERVIEW'
  const [activeStep, setActiveStep] = useState('LESSON'); // 'LESSON' | 'CHECKPOINTS' | 'EXAMPLES' | 'PRACTICE' | 'MSA'

  const [expandedModules, setExpandedModules] = useState(() => ({
    [firstMod?.moduleId || '']: true
  }));
  const [selectedModuleId, setSelectedModuleId] = useState(() => firstMod?.moduleId || '');
  const [selectedTopicId, setSelectedTopicId] = useState(() => firstTop?.topicId || '');

  const [progress, setProgress] = useState(null);

  // Sidebar Collapsible Focus State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('seed_player_sidebar_collapsed') === 'true';
    } catch (e) {
      return false;
    }
  });

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('seed_player_sidebar_collapsed', String(next));
      } catch (e) {}
      return next;
    });
  };

  // Overlay Drawers & Modals
  const [showNotesDrawer, setShowNotesDrawer] = useState(false);
  const [showResourcesDrawer, setShowResourcesDrawer] = useState(false);
  const [showCertificateModal, setShowCertificateModal] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);

  useEffect(() => {
    if (course?.modules?.[0]) {
      const fMod = course.modules[0];
      const fTop = fMod.topics?.[0];
      setSelectedModuleId(fMod.moduleId);
      setSelectedTopicId(fTop?.topicId || '');
      setExpandedModules({ [fMod.moduleId]: true });
    }
  }, [course?.courseId]);

  useEffect(() => {
    let mounted = true;
    learningEngineService.getCourseProgress(uid, course).then(p => {
      if (mounted && p) {
        setProgress(p);
        if (p.currentModuleId) {
          setSelectedModuleId(p.currentModuleId);
          setExpandedModules({ [p.currentModuleId]: true });
        }
        if (p.currentTopicId) {
          setSelectedTopicId(p.currentTopicId);
        }
      }
    });
    return () => { mounted = false; };
  }, [uid, course]);

  const activeModule = useMemo(() => {
    return course?.modules?.find(m => m.moduleId === selectedModuleId) || course?.modules?.[0];
  }, [course, selectedModuleId]);

  const activeTopic = useMemo(() => {
    return activeModule?.topics?.find(t => t.topicId === selectedTopicId) || activeModule?.topics?.[0];
  }, [activeModule, selectedTopicId]);

  const activeTopicProgress = progress?.topics?.[activeTopic?.topicId];
  const activeTopicStatus = useMemo(() => {
    return getTopicActivityStatus(activeTopic, activeTopicProgress);
  }, [activeTopic, activeTopicProgress]);

  // Overall module activity counts for header
  const moduleActivitySummary = useMemo(() => {
    if (!activeModule?.topics) return { completed: 0, total: 0 };
    let completed = 0;
    let total = 0;
    activeModule.topics.forEach(t => {
      const status = getTopicActivityStatus(t, progress?.topics?.[t.topicId]);
      completed += status.completedCount;
      total += status.totalCount;
    });
    // Add MSA as 1 activity
    total += 1;
    if (progress?.modules?.[activeModule.moduleId]?.msa?.passed) {
      completed += 1;
    }
    return { completed, total };
  }, [activeModule, progress]);

  // Automatic Module Accordion: opens clicked module, closes all other modules
  const toggleModuleAccordion = (moduleId) => {
    setExpandedModules(prev => {
      if (prev[moduleId]) {
        return {};
      }
      return { [moduleId]: true };
    });
  };

  const handleSelectTopic = (module, topic, bypassLockCheck = false) => {
    // Check if topic is locked (prior topic in module must be completed)
    const tIdx = module.topics?.findIndex(t => t.topicId === topic.topicId) ?? -1;
    if (tIdx > 0 && !bypassLockCheck) {
      const prevTopic = module.topics[tIdx - 1];
      const prevTopicProg = progress?.topics?.[prevTopic.topicId];
      const prevCompleted = Boolean(
        prevTopicProg?.completed || 
        getTopicActivityStatus(prevTopic, prevTopicProg).isCompleted
      );
      if (!prevCompleted) {
        toast.warning(`Lesson locked. Please complete "${prevTopic.title}" to unlock this lesson.`);
        return;
      }
    }

    setSelectedModuleId(module.moduleId);
    setSelectedTopicId(topic.topicId);
    // Automatically expand current module and close others
    setExpandedModules({ [module.moduleId]: true });
    setActivePlayerView('CLASS');
    setActiveStep('LESSON');
    learningEngineService.updateOngoingTopic(uid, course, module.moduleId, topic.topicId);

    // On narrow screens auto-close sidebar so student sees content immediately
    if (typeof window !== 'undefined' && window.innerWidth <= 960) {
      setIsSidebarCollapsed(true);
    }
  };

  const handleSelectSubActivity = (module, topic, subKey) => {
    setSelectedModuleId(module.moduleId);
    setSelectedTopicId(topic.topicId);
    setExpandedModules({ [module.moduleId]: true });
    setActivePlayerView('CLASS');
    setActiveStep(subKey.toUpperCase());
    learningEngineService.updateOngoingTopic(uid, course, module.moduleId, topic.topicId);

    if (typeof window !== 'undefined' && window.innerWidth <= 960) {
      setIsSidebarCollapsed(true);
    }
  };

  const handleSelectMSA = (module) => {
    const targetModule = module || activeModule || course?.modules?.find(m => m.moduleId === selectedModuleId) || course?.modules?.[0];
    if (!targetModule) return;

    // Strict Rule: MSA is allowed ONLY if all submodules within the module are completed
    const modTopics = targetModule.topics || [];
    const completedCount = modTopics.filter(t => progress?.topics?.[t.topicId]?.completed || getTopicActivityStatus(t, progress?.topics?.[t.topicId]).isCompleted).length;
    const isMsaPassed = Boolean(progress?.modules?.[targetModule.moduleId]?.msa?.passed);
    const allTopicsDone = modTopics.length > 0 && completedCount === modTopics.length;

    if (!allTopicsDone && !isMsaPassed) {
      toast.error(
        `Module Assessment Locked: Complete all ${modTopics.length} submodules in "${targetModule.title}" first (${completedCount}/${modTopics.length} completed).`,
        { duration: 4500 }
      );
      // Automatically navigate to the first incomplete submodule
      const firstIncomplete = modTopics.find(t => !progress?.topics?.[t.topicId]?.completed && !getTopicActivityStatus(t, progress?.topics?.[t.topicId]).isCompleted);
      if (firstIncomplete) {
        handleSelectTopic(targetModule, firstIncomplete);
      }
      return;
    }

    setSelectedModuleId(targetModule.moduleId);
    setExpandedModules(prev => ({ ...prev, [targetModule.moduleId]: true }));
    setActivePlayerView('CLASS');
    setActiveStep('MSA');

    if (typeof window !== 'undefined' && window.innerWidth <= 960) {
      setIsSidebarCollapsed(true);
    }
  };

  const handleCheckpointComplete = async (checkpointKey) => {
    const targetModId = activeModule?.moduleId || selectedModuleId;
    const targetTopicId = activeTopic?.topicId || selectedTopicId;
    const updated = await learningEngineService.updateTopicCheckpoint(
      uid, course, targetModId, targetTopicId, checkpointKey, true
    );
    if (updated) {
      setProgress({ ...updated });
    }
  };

  const handlePracticeProblemSolved = async (problemId, allIds = []) => {
    const targetModId = activeModule?.moduleId || selectedModuleId;
    const targetTopicId = activeTopic?.topicId || selectedTopicId;
    const idsToRecord = Array.isArray(allIds) && allIds.length > 0 ? allIds : [problemId];
    const updated = await recordTopicPracticeSolved(
      uid, course, targetModId, targetTopicId, idsToRecord
    );
    if (updated) {
      setProgress({ ...updated });
    }
  };

  const handleMSAPass = async (res) => {
    if (res?.progress) {
      setProgress({ ...res.progress });
    }
    if (res?.passed) {
      setShowCompletionModal(true);
    }
  };

  const handleContinueNextModule = () => {
    setShowCompletionModal(false);
    const currentIdx = course?.modules?.findIndex(m => m.moduleId === selectedModuleId) ?? -1;
    const nextMod = course?.modules?.[currentIdx + 1];
    if (nextMod) {
      setSelectedModuleId(nextMod.moduleId);
      if (nextMod.topics?.[0]) {
        setSelectedTopicId(nextMod.topics[0].topicId);
      }
      setExpandedModules({ [nextMod.moduleId]: true });
    }
    setActivePlayerView('CLASS');
    setActiveStep('LESSON');
  };

  // Stepping logic for Bottom Sticky Footer
  const availableTopicSteps = useMemo(() => {
    if (!activeTopic) return ['LESSON'];
    const steps = ['LESSON'];
    const items = activeTopicStatus.items || [];
    if (items.some(i => i.key === 'examples')) steps.push('EXAMPLES');
    if (items.some(i => i.key === 'practice')) steps.push('PRACTICE');
    return steps;
  }, [activeTopic, activeTopicStatus]);

  const currentStepIdx = availableTopicSteps.indexOf(activeStep);

  const handleNextStep = async () => {
    if (activeStep === 'MSA') {
      handleContinueNextModule();
      return;
    }

    // If there's another step within current topic
    if (currentStepIdx !== -1 && currentStepIdx < availableTopicSteps.length - 1) {
      setActiveStep(availableTopicSteps[currentStepIdx + 1]);
      return;
    }

    // If at the end of this topic's steps, verify all sub-activities are completed
    const isTopicCompleted = Boolean(activeTopicProgress?.completed || activeTopicStatus.isCompleted);
    if (!isTopicCompleted) {
      const pendingItem = activeTopicStatus.items.find(i => !i.done);
      if (pendingItem) {
        toast.warning(`Please complete ${pendingItem.label} before advancing.`);
        return;
      }
    }

    const targetModId = activeModule?.moduleId || selectedModuleId;
    const targetTopicId = activeTopic?.topicId || selectedTopicId;
    if (!activeTopicProgress?.completed) {
      const up = await markTopicCompleted(uid, course, targetModId, targetTopicId);
      if (up) {
        setProgress({ ...up });
      }
    }

    // Advance to next topic in module
    const currentTopicIdx = activeModule?.topics?.findIndex(t => t.topicId === selectedTopicId) ?? -1;
    if (currentTopicIdx !== -1 && currentTopicIdx < (activeModule?.topics?.length || 0) - 1) {
      const nextTopic = activeModule.topics[currentTopicIdx + 1];
      handleSelectTopic(activeModule, nextTopic, true);
      return;
    }

    // If at end of topics in module, verify all topics are complete before launching Module Assessment
    const allTopicsDone = (activeModule?.topics || []).every(t => 
      progress?.topics?.[t.topicId]?.completed || 
      t.topicId === selectedTopicId || 
      getTopicActivityStatus(t, progress?.topics?.[t.topicId]).isCompleted
    );
    if (!allTopicsDone) {
      toast.warning("Complete all lessons in this module before taking the Module Assessment.");
      return;
    }

    handleSelectMSA(activeModule);
  };

  const handlePrevStep = () => {
    if (activeStep === 'MSA') {
      const lastTopic = activeModule?.topics?.[activeModule.topics.length - 1];
      if (lastTopic) {
        setSelectedTopicId(lastTopic.topicId);
        const lastTopicStatus = getTopicActivityStatus(lastTopic, progress?.topics?.[lastTopic.topicId]);
        const lastSteps = ['LESSON'];
        if (lastTopicStatus.items.some(i => i.key === 'checkpoints')) lastSteps.push('CHECKPOINTS');
        if (lastTopicStatus.items.some(i => i.key === 'examples')) lastSteps.push('EXAMPLES');
        if (lastTopicStatus.items.some(i => i.key === 'practice')) lastSteps.push('PRACTICE');
        setActiveStep(lastSteps[lastSteps.length - 1]);
      }
      return;
    }

    // If previous step within current topic exists
    if (currentStepIdx > 0) {
      setActiveStep(availableTopicSteps[currentStepIdx - 1]);
      return;
    }

    // Otherwise go to previous topic's last step
    const currentTopicIdx = activeModule?.topics?.findIndex(t => t.topicId === selectedTopicId) ?? -1;
    if (currentTopicIdx > 0) {
      const prevTopic = activeModule.topics[currentTopicIdx - 1];
      setSelectedTopicId(prevTopic.topicId);
      const prevStatus = getTopicActivityStatus(prevTopic, progress?.topics?.[prevTopic.topicId]);
      const prevSteps = ['LESSON'];
      if (prevStatus.items.some(i => i.key === 'checkpoints')) prevSteps.push('CHECKPOINTS');
      if (prevStatus.items.some(i => i.key === 'examples')) prevSteps.push('EXAMPLES');
      if (prevStatus.items.some(i => i.key === 'practice')) prevSteps.push('PRACTICE');
      setActiveStep(prevSteps[prevSteps.length - 1]);
      return;
    }

    // Go to previous module if available
    const currentModIdx = course?.modules?.findIndex(m => m.moduleId === selectedModuleId) ?? -1;
    if (currentModIdx > 0) {
      const prevMod = course.modules[currentModIdx - 1];
      setSelectedModuleId(prevMod.moduleId);
      setExpandedModules({ [prevMod.moduleId]: true });
      const lastTop = prevMod.topics?.[prevMod.topics.length - 1];
      if (lastTop) {
        setSelectedTopicId(lastTop.topicId);
        setActiveStep('LESSON');
      }
    }
  };

  // Full Course Overview landing & curriculum view
  if (activePlayerView === 'OVERVIEW') {
    return (
      <div className="learning-player-shell">
        <CourseOverviewView
          course={course}
          progress={progress}
          user={user}
          onExit={onExit}
          onUnenroll={() => {
            setProgress(null);
          }}
          onStartLearning={() => {
            setActivePlayerView('CLASS');
            setActiveStep('LESSON');
          }}
          onSelectTopic={(m, t) => handleSelectTopic(m, t)}
        />
      </div>
    );
  }

  // Dedicated Full-Page Module Assessment (MSA) Mode
  if (activeStep === 'MSA') {
    const targetMod = activeModule || course?.modules?.[0];
    const modTopics = targetMod?.topics || [];
    const completedCount = modTopics.filter(t => progress?.topics?.[t.topicId]?.completed).length;
    const isMsaPassed = Boolean(progress?.modules?.[targetMod?.moduleId]?.msa?.passed);
    const allTopicsDone = modTopics.length > 0 && completedCount === modTopics.length;

    if (!allTopicsDone && !isMsaPassed) {
      const firstInc = modTopics.find(t => !progress?.topics?.[t.topicId]?.completed) || modTopics[0];
      return (
        <div className="learning-player-shell full-msa-mode" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--lp-bg)' }}>
          <div style={{
            background: 'var(--lp-surface)',
            border: '1px solid var(--lp-border)',
            borderRadius: '16px',
            padding: '40px 32px',
            maxWidth: '520px',
            width: '90%',
            textAlign: 'center',
            boxShadow: 'var(--lp-card-shadow)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>
              <FaLock />
            </div>
            <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--lp-text)' }}>Module Assessment Locked</h2>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--lp-text-muted)', lineHeight: 1.6 }}>
              The Module Milestone Assessment for <strong>"{targetMod?.title}"</strong> is locked. You must complete all <strong>{modTopics.length} submodules</strong> before attempting the Milestone Assessment.
            </p>
            <div style={{ background: 'var(--lp-surface-hover)', padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--lp-text)' }}>
              Completed: {completedCount} of {modTopics.length} submodules
            </div>
            <button
              className="bottom-footer-btn next"
              onClick={() => {
                if (firstInc) {
                  handleSelectTopic(targetMod, firstInc);
                } else {
                  setActiveStep('LESSON');
                }
              }}
              style={{ marginTop: '8px' }}
            >
              <span>Back to Lessons</span>
              <FaArrowRight />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="learning-player-shell full-msa-mode">
        <CourseMSAView
          module={activeModule}
          course={course}
          user={user}
          onComplete={(res) => handleMSAPass(res)}
          onBack={() => {
            setActiveStep('LESSON');
          }}
          passingPercentage={90}
        />
      </div>
    );
  }

  // Primary Two-Column Learning Workspace
  return (
    <div className="learning-player-shell">
      {/* 1. Sleek Compact Top Bar */}
      <header className="player-top-bar">
        <div className="top-bar-left">
          <button className="top-back-btn" onClick={onExit} title="Return to Dashboard">
            <FaArrowLeft />
          </button>

          <button 
            className={`top-sidebar-toggle-btn ${isSidebarCollapsed ? 'collapsed' : ''}`}
            onClick={toggleSidebar}
            title={isSidebarCollapsed ? "Expand Course Content (Show sidebar)" : "Collapse Course Content (Focus Mode)"}
          >
            <FaBars />
            <span className="toggle-btn-text">{isSidebarCollapsed ? "Show Content" : "Hide Content"}</span>
          </button>

          <div className="top-breadcrumbs">
            <span className="crumb-root" onClick={onExit}>Courses</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-course" onClick={() => setActivePlayerView('OVERVIEW')} title="View Course Syllabus">
              {course?.shortTitle || course?.title || 'Course'}
            </span>
            <span className="crumb-sep">/</span>
            <span className="crumb-module">{activeModule?.title?.replace(/^Module\s*\d+:\s*/i, '') || 'Module'}</span>
            {activeTopic && activeStep !== 'MSA' && (
              <>
                <span className="crumb-sep">/</span>
                <span className="crumb-current">{activeTopic?.title?.replace(/^\d+\.\d+\s*/, '')}</span>
              </>
            )}
            {activeStep === 'MSA' && (
              <>
                <span className="crumb-sep">/</span>
                <span className="crumb-current highlight">Module Assessment</span>
              </>
            )}
          </div>
        </div>

        <div className="top-bar-right">
          <div className="module-stats-pill">
            <span className="stats-dot" />
            <span>{moduleActivitySummary.completed} of {moduleActivitySummary.total} activities</span>
          </div>

          <button 
            className={`header-tool-btn ${showNotesDrawer ? 'active' : ''}`}
            onClick={() => {
              setShowNotesDrawer(prev => !prev);
              setShowResourcesDrawer(false);
            }}
            title="Lesson Notes & Theory"
          >
            <FaFileAlt />
            <span>Notes</span>
          </button>

          <button 
            className={`header-tool-btn ${showResourcesDrawer ? 'active' : ''}`}
            onClick={() => {
              setShowResourcesDrawer(prev => !prev);
              setShowNotesDrawer(false);
            }}
            title="Course PDFs, Cheatsheets & Resources"
          >
            <FaFolder />
            <span>Resources</span>
          </button>

          <button 
            className="header-tool-btn overview" 
            onClick={() => setActivePlayerView('OVERVIEW')}
            title="View Course Syllabus & Overview"
          >
            <FaBookOpen />
            <span>Overview</span>
          </button>

          <button 
            className="header-tool-btn exit" 
            onClick={onExit} 
            title="Exit Course"
          >
            <FaSignOutAlt />
          </button>
        </div>
      </header>

      {/* 2. Main Workspace 2-Column Split */}
      <div className={`player-workspace-split ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Left Column: Course Content Accordion Tree (Single Source of Truth) */}
        {isSidebarCollapsed ? (
          <aside 
            className="player-content-tree-rail"
            onClick={() => {
              setIsSidebarCollapsed(false);
              try { localStorage.setItem('seed_player_sidebar_collapsed', 'false'); } catch (e) {}
            }}
            title="Click to expand Course Content"
          >
            <button 
              className="rail-expand-btn"
              onClick={(e) => {
                e.stopPropagation();
                setIsSidebarCollapsed(false);
                try { localStorage.setItem('seed_player_sidebar_collapsed', 'false'); } catch (e) {}
              }}
              title="Expand Course Content"
            >
              <FaChevronRight />
            </button>
            <div className="rail-label-box">
              <span className="rail-vertical-text">COURSE CONTENT</span>
            </div>
            <div className="rail-current-indicator" title={activeModule?.title || 'Current Module'}>
              <span className="rail-dot" />
            </div>
          </aside>
        ) : (
          <aside className="player-content-tree">
            <div className="content-tree-header">
              <div className="tree-header-title-row">
                <span className="tree-title">COURSE CONTENT</span>
              </div>
              <div className="tree-header-actions">
                <span className="tree-count-badge">
                  {course?.modules?.length || 1} Modules
                </span>
                <button 
                  className="tree-collapse-btn"
                  onClick={() => {
                    setIsSidebarCollapsed(true);
                    try { localStorage.setItem('seed_player_sidebar_collapsed', 'true'); } catch (e) {}
                  }}
                  title="Collapse Course Content (Focus Mode)"
                >
                  <FaChevronLeft />
                </button>
              </div>
            </div>

          <div className="tree-modules-list">
            {course?.modules?.map((m, mIdx) => {
              const isExpanded = !!expandedModules[m.moduleId];
              const isLocked = progress?.modules?.[m.moduleId]?.isUnlocked === false && mIdx > 0;
              const isCompleted = Boolean(progress?.modules?.[m.moduleId]?.completed);
              const isCurrentModule = selectedModuleId === m.moduleId;

              // Check if all topics in module are complete
              const allTopicsDone = (m.topics || []).every(t => progress?.topics?.[t.topicId]?.completed);
              const msaPassed = Boolean(progress?.modules?.[m.moduleId]?.msa?.passed);
              const msaActive = isCurrentModule && activeStep === 'MSA';

              return (
                <div 
                  key={m.moduleId} 
                  className={`tree-module-block ${isLocked ? 'locked' : ''} ${isCurrentModule ? 'current-mod' : ''}`}
                >
                  <div 
                    className="module-block-header"
                    onClick={() => !isLocked && toggleModuleAccordion(m.moduleId)}
                  >
                    <div className="module-title-col">
                      <span className="module-title-text">{m.title}</span>
                    </div>

                    <div className="module-status-icon">
                      {isCompleted ? (
                        <FaCheckCircle className="status-done-icon" />
                      ) : isLocked ? (
                        <FaLock className="status-lock-icon" />
                      ) : (
                        isExpanded ? <FaChevronUp className="status-chev" /> : <FaChevronDown className="status-chev" />
                      )}
                    </div>
                  </div>

                  {/* Topics List & Sub-Activities if Expanded */}
                  {isExpanded && !isLocked && (
                    <div className="module-topics-list">
                      {m.topics?.map((topic, tIdx) => {
                        const isTopicSelected = selectedTopicId === topic.topicId && isCurrentModule && activeStep !== 'MSA';
                        const topicProg = progress?.topics?.[topic.topicId];
                        const tStatus = getTopicActivityStatus(topic, topicProg);

                        // Sequential Locking: topic i is locked unless topic i-1 is completed
                        const prevTopic = tIdx > 0 ? m.topics[tIdx - 1] : null;
                        const isTopicLocked = isLocked || (tIdx > 0 && !progress?.topics?.[prevTopic?.topicId]?.completed);

                        return (
                          <div key={topic.topicId} className="topic-group-container">
                            {/* Main Topic Row */}
                            <div
                              className={`topic-row-item ${isTopicSelected ? 'active' : ''} ${tStatus.isCompleted ? 'done' : ''} ${isTopicLocked ? 'locked' : ''}`}
                              onClick={() => {
                                if (isTopicLocked) {
                                  toast.warning(`Lesson locked. Complete "${prevTopic?.title}" first.`);
                                  return;
                                }
                                handleSelectTopic(m, topic);
                              }}
                              title={isTopicLocked ? `Locked — Complete "${prevTopic?.title}" to unlock` : topic.title}
                            >
                              <div className="topic-indicator">
                                {isTopicLocked ? (
                                  <FaLock className="topic-lock-icon" />
                                ) : tStatus.isCompleted ? (
                                  <FaCheckCircle className="topic-done-check" />
                                ) : isTopicSelected ? (
                                  <div className="topic-play-dot"><FaPlay /></div>
                                ) : (
                                  <div className="topic-circle-radio" />
                                )}
                              </div>
                              <div className="topic-info-col">
                                <span className="topic-name-label">{topic.title}</span>
                                <span className="topic-activities-pill">
                                  {isTopicLocked ? 'Locked' : `${tStatus.completedCount} / ${tStatus.totalCount} activities`}
                                </span>
                              </div>
                            </div>

                            {/* Nested Sub-Activities Tree for Active/Selected Topic */}
                            {isTopicSelected && (
                              <div className="tree-sub-activities-stack">
                                {tStatus.items.map((subItem) => {
                                  const isSubActive = (
                                    (subItem.key === 'lesson' && activeStep === 'LESSON') ||
                                    (subItem.key === 'examples' && activeStep === 'EXAMPLES') ||
                                    (subItem.key === 'practice' && activeStep === 'PRACTICE')
                                  );

                                  return (
                                    <div
                                      key={subItem.key}
                                      className={`tree-sub-activity-row ${isSubActive ? 'active-step' : ''} ${subItem.done ? 'step-done' : ''}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSelectSubActivity(m, topic, subItem.key);
                                      }}
                                    >
                                      <div className="tree-sub-branch">
                                        <span className="branch-line" />
                                      </div>
                                      <div className="tree-sub-indicator">
                                        {subItem.done ? (
                                          <FaCheck className="sub-done-mark" />
                                        ) : isSubActive ? (
                                          <div className="sub-active-dot" />
                                        ) : (
                                          <div className="sub-empty-circle" />
                                        )}
                                      </div>
                                      <span className="tree-sub-label">{subItem.label}</span>
                                      {subItem.count && (
                                        <span className="tree-sub-meta-tag">{subItem.count}</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Module Milestone Assessment (MSA) Node */}
                      {(() => {
                        const modTopics = m.topics || [];
                        const completedCount = modTopics.filter(t => progress?.topics?.[t.topicId]?.completed).length;
                        const isUnlocked = (modTopics.length > 0 && completedCount === modTopics.length) || msaPassed;

                        return (
                          <div 
                            className={`topic-row-item assessment-node ${msaPassed ? 'passed' : isUnlocked ? 'ready' : 'locked'} ${msaActive ? 'active' : ''}`}
                            onClick={() => {
                              handleSelectMSA(m);
                            }}
                            title={isUnlocked ? "Launch Module Milestone Assessment" : `Locked: Complete all ${modTopics.length} submodules first (${completedCount}/${modTopics.length} completed)`}
                          >
                            <div className="topic-indicator">
                              {msaPassed ? (
                                <FaCheckCircle className="assessment-done-icon" />
                              ) : isUnlocked ? (
                                <FaAward className="assessment-ready-icon" />
                              ) : (
                                <FaLock className="assessment-lock-icon" />
                              )}
                            </div>
                            <div className="topic-info-col">
                              <span className="topic-name-label">
                                Module Assessment
                              </span>
                              <span className="assessment-badge-sub">
                                {msaPassed 
                                  ? 'Passed (≥90%)' 
                                  : isUnlocked 
                                  ? 'Ready to Start • 90% Requirement' 
                                  : `Locked (${completedCount}/${modTopics.length} submodules complete)`}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      )}

      {/* Center Workspace Canvas (Full width, expansive, primary focus) */}
        <section className="player-stage-center">
          {/* Active Canvas Header Sub-Toolbar */}
          {activeStep !== 'MSA' && (
            <div className="stage-top-toolbar">
              <div className="stage-heading-col">
                <h2 className="stage-main-title">{activeTopic?.title}</h2>
                <span className="stage-desc-text">{activeTopic?.description}</span>
              </div>

              {/* In-lesson switch controls for available topic elements */}
              <div className="stage-activities-segmented-bar">
                <button
                  className={`stage-seg-btn ${activeStep === 'LESSON' || activeStep === 'CHECKPOINTS' ? 'active' : ''}`}
                  onClick={() => setActiveStep('LESSON')}
                >
                  <FaBookOpen />
                  <span>Lesson Content</span>
                </button>

                {activeTopicStatus.items.some(i => i.key === 'examples') && (
                  <button
                    className={`stage-seg-btn ${activeStep === 'EXAMPLES' ? 'active' : ''}`}
                    onClick={() => setActiveStep('EXAMPLES')}
                  >
                    <FaCode />
                    <span>Code Examples</span>
                  </button>
                )}

                {activeTopicStatus.items.some(i => i.key === 'practice') && (
                  <button
                    className={`stage-seg-btn ${activeStep === 'PRACTICE' ? 'active' : ''}`}
                    onClick={() => setActiveStep('PRACTICE')}
                  >
                    <FaLaptopCode />
                    <span>Practice Problems</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Active Stage Body Canvas */}
          <div className="stage-canvas-body">
            {activeStep === 'MSA' ? (
              <CourseMSAView
                module={activeModule}
                course={course}
                user={user}
                onComplete={(res) => handleMSAPass(res)}
                onBack={() => {
                  setActiveStep('LESSON');
                }}
                passingPercentage={90}
              />
            ) : activeStep === 'PRACTICE' ? (
              <CourseCodingPracticeView
                topic={activeTopic}
                topicProgress={activeTopicProgress}
                onBack={() => setActiveStep('LESSON')}
                onContinue={handleNextStep}
                onCheckpointComplete={() => handleCheckpointComplete('practiceSolved')}
                onProblemSolved={(pId, allIds) => handlePracticeProblemSolved(pId, allIds)}
                user={user}
              />
            ) : activeStep === 'EXAMPLES' ? (
              <CodeExamplesActivity 
                topic={activeTopic} 
                onCheckpointComplete={handleCheckpointComplete}
                onContinue={handleNextStep}
              />
            ) : (
              <LessonDeliveryStage 
                topic={activeTopic}
                user={user}
                course={course}
                activeModule={activeModule}
                topicProgress={activeTopicProgress}
                onCheckpointComplete={(cpId) => handleCheckpointComplete(cpId)}
                onTopicComplete={async () => {
                  const targetModId = activeModule?.moduleId || selectedModuleId;
                  const targetTopicId = activeTopic?.topicId || selectedTopicId;

                  // Mark lesson reading/content checkpoint completed
                  const updated = await learningEngineService.updateTopicCheckpoint(
                    uid, course, targetModId, targetTopicId, 'readingCompleted', true
                  );
                  if (updated) {
                    setProgress({ ...updated });
                  }
                  toast.success('Lesson reading completed!');

                  // Automatically advance to next activity in submodule
                  if (availableTopicSteps.includes('EXAMPLES')) {
                    setActiveStep('EXAMPLES');
                  } else if (availableTopicSteps.includes('PRACTICE')) {
                    setActiveStep('PRACTICE');
                  } else {
                    // No further sub-activities in this topic: mark topic fully completed
                    const finishedProg = await markTopicCompleted(
                      uid, course, targetModId, targetTopicId
                    );
                    if (finishedProg) {
                      setProgress({ ...finishedProg });
                    }

                    // Advance to next topic in module
                    const currentTopicIdx = activeModule?.topics?.findIndex(t => t.topicId === targetTopicId) ?? -1;
                    if (currentTopicIdx !== -1 && currentTopicIdx < (activeModule?.topics?.length || 0) - 1) {
                      const nextTopic = activeModule.topics[currentTopicIdx + 1];
                      setSelectedTopicId(nextTopic.topicId);
                      setActiveStep('LESSON');
                      learningEngineService.updateOngoingTopic(uid, course, activeModule.moduleId, nextTopic.topicId);
                    } else {
                      handleSelectMSA(activeModule);
                    }
                  }
                }}
              />
            )}
          </div>
        </section>
      </div>

      {/* 3. Bottom Sticky Navigation Footer */}
      <footer className="player-bottom-footer">
        <button 
          className="bottom-footer-btn prev"
          onClick={handlePrevStep}
        >
          <FaArrowLeft />
          <span>Previous</span>
        </button>

        <div className="bottom-footer-center-status">
          {activeStep === 'MSA' ? (
            <span>Module Assessment • MCQ &amp; Coding (Dual 90% Pass Gate)</span>
          ) : activeTopicStatus.isCompleted ? (
            <span className="status-all-done"><FaCheckCircle style={{ marginRight: '6px' }} /> All required activities complete for this lesson</span>
          ) : (
            <span>Step {Math.max(1, currentStepIdx + 1)} of {availableTopicSteps.length}: {activeStep}</span>
          )}
        </div>

        <button 
          className="bottom-footer-btn next"
          onClick={handleNextStep}
        >
          <span>Continue</span>
          <FaArrowRight />
        </button>
      </footer>

      {/* 4. Slide-Over Drawers (Notes & Resources) */}
      {showNotesDrawer && (
        <div className="player-drawer-backdrop" onClick={() => setShowNotesDrawer(false)}>
          <div className="player-slide-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-title-group">
                <FaFileAlt className="drawer-icon" />
                <h3>Lesson Study Notes</h3>
              </div>
              <button className="drawer-close-btn" onClick={() => setShowNotesDrawer(false)}>
                <FaTimes />
              </button>
            </div>
            <div className="drawer-content-scroll">
              <NotesActivity 
                topic={activeTopic} 
                onCheckpointComplete={handleCheckpointComplete}
              />
            </div>
          </div>
        </div>
      )}

      {showResourcesDrawer && (
        <div className="player-drawer-backdrop" onClick={() => setShowResourcesDrawer(false)}>
          <div className="player-slide-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-title-group">
                <FaFolder className="drawer-icon" />
                <h3>Course Resources Library</h3>
              </div>
              <button className="drawer-close-btn" onClick={() => setShowResourcesDrawer(false)}>
                <FaTimes />
              </button>
            </div>
            <div className="drawer-content-scroll">
              <CourseResourcesView
                topic={activeTopic}
                onBack={() => setShowResourcesDrawer(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showCompletionModal && (
        <ModuleCompletionModal
          module={activeModule}
          course={course}
          onContinueNextModule={handleContinueNextModule}
          onClose={() => setShowCompletionModal(false)}
        />
      )}

      {showCertificateModal && (
        <CourseCertificateModal
          course={course}
          user={user}
          onClose={() => setShowCertificateModal(false)}
        />
      )}
    </div>
  );
};

export default CourseLearningPlayer;
