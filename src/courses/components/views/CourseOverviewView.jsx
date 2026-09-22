import React, { useState, useEffect, useMemo } from 'react';
import { 
  FaPlay, FaBookOpen, FaClock, FaCheckCircle, FaLock, 
  FaGraduationCap, FaChevronRight, FaStar, FaAward, 
  FaCode, FaFolder, FaChevronDown, FaChevronUp, FaTimes,
  FaVideo, FaChartBar, FaFileAlt, FaSignal, FaCheck,
  FaTerminal, FaGlobe, FaDatabase, FaServer, FaExpand,
  FaCompress, FaRegStar, FaUserGraduate, FaPaperPlane,
  FaTrashAlt, FaExclamationTriangle, FaBolt
} from 'react-icons/fa';
import { calculateCourseDuration } from '../../services/courseDurationCalculator';
import { getCourseMetadata, addCourseReview, incrementCourseEnrollment } from '../../services/courseMetadataService';
import { enrollCourse, unenrollCourse } from '../../services/learningEngineService';
import { checkCourseEntitlement, useCourseEntitlement } from '../../services/courseEntitlementService';
import { calculateCourseRewards } from '../../../utils/gamificationService';
import SeedCreditCoin from '../../../components/SeedCreditCoin';
import PremiumUpgradeModal from '../../../components/PremiumUpgradeModal';
import { toast } from 'sonner';

/**
 * CourseOverviewView
 * Redesigned Course Overview / Landing Page matching the user's reference mockup.
 * Clearly separates the landing/curriculum workspace from the active learning player.
 */
const CourseOverviewView = ({ 
  course, 
  onStartLearning, 
  onSelectTopic, 
  onExit,
  onUnenroll,
  user = {},
  progress = {} 
}) => {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'curriculum' | 'learn' | 'prerequisites' | 'reviews'
  const [showTrailerModal, setShowTrailerModal] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isUnenrolling, setIsUnenrolling] = useState(false);
  const [showUnenrollModal, setShowUnenrollModal] = useState(false);
  const [localEnrolled, setLocalEnrolled] = useState(false);
  const [unenrolledLocally, setUnenrolledLocally] = useState(false);
  const [expandedModules, setExpandedModules] = useState(() => {
    const fId = course?.modules?.[0]?.moduleId;
    return fId ? { [fId]: true } : {};
  });

  // Live Firestore Course Metadata & Reviews
  const [liveMeta, setLiveMeta] = useState(null);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [userRating, setUserRating] = useState(5);
  const [userHoverRating, setUserHoverRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');

  const courseId = course?.courseId || course?.id || 'dsa_mastery_course';

  useEffect(() => {
    let isMounted = true;
    getCourseMetadata(courseId, course).then(data => {
      if (isMounted && data) {
        setLiveMeta(data);
      }
    });
    return () => { isMounted = false; };
  }, [courseId, course]);

  const durationData = calculateCourseDuration(course);

  const toggleModule = (modId) => {
    setExpandedModules(prev => ({
      ...prev,
      [modId]: !prev[modId]
    }));
  };

  const handleToggleExpandAll = () => {
    const modules = course?.modules || [];
    const allExpanded = modules.length > 0 && modules.every(m => expandedModules[m.moduleId]);
    if (allExpanded) {
      setExpandedModules({});
    } else {
      const all = {};
      modules.forEach(m => { all[m.moduleId] = true; });
      setExpandedModules(all);
    }
  };

  const totalModules = course?.modules?.length || course?.modulesCount || 1;
  const totalLessons = course?.lessonsCount || course?.modules?.reduce((acc, m) => acc + (m.topics?.length || 0), 0) || 8;
  const totalAssessments = course?.modules?.filter(m => m.msa || m.miniAssessment).length || totalModules;

  // Progression calculations
  const completedModulesCount = Object.values(progress?.modules || {}).filter(m => m?.completed).length;
  const completedTopicsCount = Object.values(progress?.topics || {}).filter(t => t?.completed).length;

  const progressPct = typeof progress?.percentage === 'number' 
    ? progress.percentage 
    : (totalModules > 0 ? Math.round((completedModulesCount / totalModules) * 100) : 0);

  const isEnrolled = !unenrolledLocally && Boolean(localEnrolled || progress?.isEnrolled || progress?.hasStarted || progressPct > 0 || completedTopicsCount > 0);
  const isCompleted = progressPct >= 100;

  // Find active module index (1-based)
  const activeModIndex = Math.min(
    totalModules,
    Math.max(1, (course?.modules || []).findIndex(m => m.moduleId === progress?.currentModuleId) + 1 || 1)
  );

  const { entitlement } = useCourseEntitlement(course, user);

  // Enroll or Continue learning handler
  const handleEnrollOrResume = async () => {
    if (!isEnrolled) {
      if (entitlement.isLocked && !entitlement.isPreview) {
        toast.error(entitlement.reason, { duration: 6000 });
        setShowPremiumModal(true);
        return;
      }
      setIsEnrolling(true);
      try {
        const uid = user?.uid || 'demo-student';
        await enrollCourse(uid, course?.courseId || courseId);
        await incrementCourseEnrollment(course?.courseId || courseId);
        setLocalEnrolled(true);
        toast.success(entitlement.isPreview 
          ? `Module 1 Free Preview started for "${course?.title || 'Course'}"!` 
          : `You are now enrolled in "${course?.title || 'Course'}"!`);
      } catch (err) {
        console.warn('Enroll notice:', err.message);
        toast.error(err.message, { duration: 6000 });
        return;
      } finally {
        setIsEnrolling(false);
      }
    } else if (entitlement.isLocked && !entitlement.isPreview) {
      toast.error(entitlement.reason, { duration: 6000 });
      setShowPremiumModal(true);
      return;
    }
    if (onStartLearning) {
      onStartLearning(course);
    }
  };

  // Unenroll handler opening the confirmation modal
  const handlePromptUnenroll = () => {
    setShowUnenrollModal(true);
  };

  const handleConfirmUnenroll = async () => {
    setIsUnenrolling(true);
    try {
      const uid = user?.uid || 'demo-student';
      await unenrollCourse(uid, course?.courseId || courseId);
      setLocalEnrolled(false);
      setUnenrolledLocally(true);
      setShowUnenrollModal(false);
      if (onUnenroll) {
        onUnenroll();
      }
      toast.info(`You have unenrolled from "${course?.title || 'Course'}". Course progress has been reset.`);
    } catch (err) {
      toast.error('Failed to unenroll: ' + err.message);
    } finally {
      setIsUnenrolling(false);
    }
  };

  // Handle Review Submission to Firestore
  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!reviewComment.trim()) {
      toast.warning('Please enter your review feedback.');
      return;
    }

    setIsSubmittingReview(true);
    try {
      const studentName = user?.displayName || user?.name || user?.email?.split('@')[0] || 'Verified Learner';
      const userRole = user?.role ? `${user.role.charAt(0).toUpperCase() + user.role.slice(1)} Student` : 'Computer Science Student';

      const result = await addCourseReview(courseId, {
        uid: user?.uid || 'guest-learner',
        studentName,
        userRole,
        rating: userRating,
        reviewText: reviewComment.trim()
      });

      if (result) {
        setLiveMeta(prev => ({
          ...(prev || {}),
          reviews: result.updatedReviews,
          rating: result.rating,
          reviewsCount: result.reviewsCount
        }));
        setReviewComment('');
        toast.success('Thank you! Your review has been published.');
      }
    } catch (err) {
      toast.error('Failed to submit review: ' + err.message);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Domain Icon resolver
  const getDomainIcon = () => {
    const slug = (course?.slug || course?.category || course?.title || '').toLowerCase();
    if (slug.includes('python') || slug.includes('programming')) return <FaTerminal />;
    if (slug.includes('web') || slug.includes('react')) return <FaGlobe />;
    if (slug.includes('database') || slug.includes('sql')) return <FaDatabase />;
    if (slug.includes('system') || slug.includes('cloud')) return <FaServer />;
    return <FaCode />;
  };

  return (
    <div className="course-overview-redesign-wrapper">
      {/* 1. Sleek Top Breadcrumb & Single Main CTA Bar */}
      <div className="overview-top-navbar">
        <div className="overview-top-breadcrumbs">
          <span className="crumb-root" onClick={onExit}>Courses</span>
          <span className="crumb-separator">&gt;</span>
          <span className="crumb-title">{course?.title || 'Data Structures & Algorithms Mastery'}</span>
        </div>

        <div className="overview-top-cta-group">
          {onExit && (
            <button className="overview-back-courses-btn" onClick={onExit} title="Back to Courses">
              <FaTimes style={{ fontSize: '11px' }} />
              <span>Back to Courses</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Course Header Card with Hero Enroll Action */}
      <div className="overview-hero-card-clean">
        <div className="hero-left-content">
          <div className="hero-domain-icon-box">
            {getDomainIcon()}
          </div>
          <div className="hero-title-meta-col">
            <h1 className="hero-course-title">{course?.title || 'Data Structures & Algorithms Mastery'}</h1>
            <p className="hero-short-description">
              {course?.description || 'Master Data Structures and Algorithms with real instructor video lessons, hands-on coding, and checkpoint questions.'}
            </p>

            <div className="hero-meta-pills-row">
              <span className="hero-pill level-pill">{course?.level || 'Intermediate'}</span>
              <span className="hero-pill">{totalModules} {totalModules === 1 ? 'Module' : 'Modules'}</span>
              <span className="hero-pill">{totalLessons} {totalLessons === 1 ? 'Lesson' : 'Lessons'}</span>
              <span className="hero-pill">{totalAssessments} Assessments (MCQ + Coding)</span>
              {(() => {
                const rewards = calculateCourseRewards(course);
                return (
                  <>
                    <span className="hero-pill" style={{ color: '#38bdf8', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', borderColor: 'rgba(56, 189, 248, 0.3)' }}>
                      <FaBolt size={10} /> {rewards.totalXP} XP
                    </span>
                    <span className="hero-pill" style={{ color: '#fbbf24', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', borderColor: 'rgba(251, 191, 36, 0.3)' }}>
                      <SeedCreditCoin size={12} /> {rewards.totalCredits} SC
                    </span>
                  </>
                );
              })()}
              <span className="hero-pill cert-pill">Certificate Included</span>
            </div>
          </div>
        </div>

        {/* Hero Enroll / Resume Action Pane */}
        <div className="hero-right-action-col">
          <button 
            className={`hero-enroll-primary-btn ${isEnrolled ? (isCompleted ? 'completed' : 'in-progress') : (entitlement.isLocked ? 'locked' : 'enroll')}`}
            onClick={handleEnrollOrResume}
            disabled={isEnrolling}
            style={entitlement.isLocked && !isEnrolled ? { background: '#64748b', cursor: 'not-allowed' } : {}}
          >
            {isEnrolled ? (
              isCompleted ? <FaCheckCircle /> : <FaPlay style={{ fontSize: '12px' }} />
            ) : entitlement.isLocked ? (
              <FaLock style={{ fontSize: '14px' }} />
            ) : (
              <FaGraduationCap style={{ fontSize: '15px' }} />
            )}
            <span>
              {isEnrolling 
                ? 'Enrolling...' 
                : !isEnrolled 
                  ? (entitlement.isPreview ? 'Start Free Preview (Module 1)' : (entitlement.isLocked ? 'Locked (Tenant Restricted)' : 'Enroll in Course')) 
                  : isCompleted 
                    ? 'Review Course' 
                    : (progressPct > 0 
                        ? `${entitlement.isPreview ? 'Resume Preview' : 'Resume Learning'} (${progressPct}%)` 
                        : (entitlement.isPreview ? 'Start Free Preview (Module 1)' : 'Start Learning'))}
            </span>
          </button>
          {isEnrolled && progressPct > 0 && (
            <div className="hero-action-progress-mini">
              <div className="hero-action-prog-bar">
                <div className="hero-action-prog-fill" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="hero-action-prog-text">{progressPct}% complete</span>
            </div>
          )}

          {isEnrolled && (
            <button
              type="button"
              className="hero-unenroll-btn"
              onClick={handlePromptUnenroll}
              disabled={isUnenrolling}
              title="Unenroll from this course and reset progress"
            >
              <FaTrashAlt style={{ fontSize: '11px' }} />
              <span>{isUnenrolling ? 'Unenrolling...' : 'Unenroll from Course'}</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Sub-Navigation Tabs Bar */}
      <div className="overview-navigation-tabs">
        <button 
          className={`overview-tab-button ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={`overview-tab-button ${activeTab === 'curriculum' ? 'active' : ''}`}
          onClick={() => setActiveTab('curriculum')}
        >
          Curriculum
        </button>
        <button 
          className={`overview-tab-button ${activeTab === 'learn' ? 'active' : ''}`}
          onClick={() => setActiveTab('learn')}
        >
          What You'll Learn
        </button>
        <button 
          className={`overview-tab-button ${activeTab === 'prerequisites' ? 'active' : ''}`}
          onClick={() => setActiveTab('prerequisites')}
        >
          Prerequisites
        </button>
        <button 
          className={`overview-tab-button ${activeTab === 'reviews' ? 'active' : ''}`}
          onClick={() => setActiveTab('reviews')}
        >
          Reviews {liveMeta?.reviewsCount ? `(${liveMeta.reviewsCount})` : ''}
        </button>
      </div>

      {/* 4. Tab Content Panels */}
      {activeTab === 'overview' && (
        <div className="overview-grid-layout">
          {/* Left Column: Explicit Course Preview & What You'll Learn */}
          <div className="overview-left-column">
            {/* Explicit Course Preview Box (Not the first lesson) */}
            <div 
              className="course-preview-showcase-box"
              onClick={() => setShowTrailerModal(true)}
              title="Click to play Course Preview Trailer"
            >
              <div className="preview-center-content">
                <div className="preview-play-orb">
                  <FaPlay className="preview-play-icon" />
                </div>
                <h3 className="preview-course-headline">{course?.title || 'Data Structures & Algorithms Mastery'}</h3>
                <p className="preview-sub-features">Real instructor videos • Structured learning • In-lesson checkpoints</p>
                <div className="preview-duration-pill">Course Preview • 2:15</div>
              </div>

              <div className="preview-corner-tag">
                <span>Preview</span>
              </div>
            </div>

            {/* What You'll Learn (Grid of Checkmarks) */}
            <div className="what-you-learn-card">
              <h3 className="section-block-title">What You'll Learn</h3>
              <div className="outcomes-two-column-grid">
                {(course?.outcomes || [
                  'Understand core data structures and memory layouts',
                  'Gain hands-on coding practice with real-world examples',
                  'Solve problems using efficient algorithms',
                  'Prepare for technical interviews'
                ]).map((item, idx) => (
                  <div key={idx} className="outcome-check-row">
                    <FaCheckCircle className="outcome-green-check" />
                    <span className="outcome-text">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: About This Course (Specs) & Skills You'll Gain */}
          <div className="overview-right-column">
            {/* About This Course Card */}
            <div className="about-course-specs-card">
              <h3 className="section-block-title">About This Course</h3>
              <p className="about-factual-summary">
                {course?.description || 'Master key concepts with real instructor videos, page-by-page interactive reading, hands-on coding, and module multi-section assessments.'}
              </p>

              <div className="specs-table-list">
                <div className="spec-row">
                  <div className="spec-left">
                    <FaSignal className="spec-icon" />
                    <span className="spec-name">Level</span>
                  </div>
                  <span className="spec-value">{course?.level || 'Intermediate'}</span>
                </div>

                <div className="spec-row">
                  <div className="spec-left">
                    <FaClock className="spec-icon" />
                    <span className="spec-name">Duration</span>
                  </div>
                  <span className="spec-value">{durationData?.formattedTotal || '3.5 Hours'}</span>
                </div>

                <div className="spec-row">
                  <div className="spec-left">
                    <FaBookOpen className="spec-icon" />
                    <span className="spec-name">Modules</span>
                  </div>
                  <span className="spec-value">{totalModules} {totalModules === 1 ? 'Module' : 'Modules'}</span>
                </div>

                <div className="spec-row">
                  <div className="spec-left">
                    <FaFileAlt className="spec-icon" />
                    <span className="spec-name">Lessons</span>
                  </div>
                  <span className="spec-value">{totalLessons} {totalLessons === 1 ? 'Lesson' : 'Lessons'}</span>
                </div>

                <div className="spec-row">
                  <div className="spec-left">
                    <FaCheckCircle className="spec-icon" />
                    <span className="spec-name">Assessments</span>
                  </div>
                  <span className="spec-value">{totalAssessments} Assessments (MCQ + Coding)</span>
                </div>

                <div className="spec-row">
                  <div className="spec-left">
                    <FaAward className="spec-icon" />
                    <span className="spec-name">Certificate</span>
                  </div>
                  <span className="spec-value cert-highlight">Included upon 100% completion</span>
                </div>
              </div>
              {/* Note: Sidebar button removed per requirement */}
            </div>

            {/* Skills You'll Gain */}
            <div className="skills-gain-card-compact">
              <h4 className="section-block-title">Skills You'll Gain</h4>
              <div className="skills-chips-wrapper">
                {(course?.skills || [
                  'Arrays', 'Strings', 'Linked Lists', 'Stacks & Queues',
                  'Trees', 'Graphs', 'Searching', 'Sorting', 'Dynamic Programming'
                ]).map((skill) => (
                  <span key={skill} className="skill-check-chip">
                    <FaCheck className="skill-check-icon" />
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Curriculum Tab */}
      {activeTab === 'curriculum' && (
        <div className="curriculum-workspace-view">
          <div className="curriculum-workspace-header">
            <div>
              <h2 className="curriculum-main-title">Course Curriculum</h2>
              <p className="curriculum-sub-title">
                {totalModules} {totalModules === 1 ? 'module' : 'modules'} • {totalLessons} {totalLessons === 1 ? 'lesson' : 'lessons'} • Structured for hands-on interactive mastery
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="curriculum-expand-toggle-btn"
                onClick={handleToggleExpandAll}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  background: 'var(--lp-surface-hover, #f1f5f9)',
                  border: '1px solid var(--lp-border, #e2e8f0)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--lp-text, #0f172a)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {course?.modules?.length > 0 && course.modules.every(m => expandedModules[m.moduleId]) ? (
                  <><FaCompress style={{ fontSize: '10px' }} /> Collapse All</>
                ) : (
                  <><FaExpand style={{ fontSize: '10px' }} /> Expand All</>
                )}
              </button>

              <div className="curriculum-overall-progress">
                <div className="progress-ring-mini">
                  <span className="ring-val">{progressPct}%</span>
                </div>
                <div className="progress-text-col">
                  <span className="overall-label">Overall Progress</span>
                  <span className="overall-sub">{completedModulesCount} of {totalModules} modules completed</span>
                </div>
              </div>
            </div>
          </div>

          <div className="curriculum-modules-stack">
            {course?.modules?.map((module, idx) => {
              const isExpanded = !!expandedModules[module.moduleId];
              const modProgress = progress?.modules?.[module.moduleId];
              const isModCompleted = Boolean(modProgress?.completed);
              const prevModuleCompleted = idx === 0 || Boolean(progress?.modules?.[course.modules[idx - 1]?.moduleId]?.completed);
              const isPreviewModule = idx === 0 && entitlement?.isPreview;
              const isPreviewLocked = idx > 0 && entitlement?.isPreview;
              const isUnlocked = isPreviewModule || (!isPreviewLocked && (isModCompleted || Boolean(modProgress?.isUnlocked) || prevModuleCompleted));
              const isLocked = !isUnlocked;

              const modTopics = module.topics || [];
              const completedModTopics = modTopics.filter(t => progress?.topics?.[t.topicId]?.completed).length;
              const modulePct = isModCompleted ? 100 : (modTopics.length > 0 ? Math.min(85, Math.round((completedModTopics / modTopics.length) * 85)) : 0);

              return (
                <div key={module.moduleId} className={`curriculum-module-card ${isLocked ? 'locked' : ''}`}>
                  <div 
                    className="curriculum-card-top-bar"
                    onClick={() => !isLocked && toggleModule(module.moduleId)}
                  >
                    <div className="module-left-badge-title">
                      <div className={`module-num-badge ${isModCompleted ? 'done' : isLocked ? 'locked' : 'active'}`}>
                        {isModCompleted ? <FaCheckCircle /> : isLocked ? <FaLock /> : idx + 1}
                      </div>
                      <div className="module-title-desc">
                        <h4 className="module-title">{module.title}</h4>
                        <span className="module-meta-info">
                          {module.topics?.length || 0} {module.topics?.length === 1 ? 'lesson' : 'lessons'} • {module.estimatedMinutes ? `${module.estimatedMinutes} mins` : '45 mins'}
                        </span>
                      </div>
                    </div>

                    <div className="module-right-status">
                      {isModCompleted ? (
                        <span className="status-badge-pill completed"><FaCheck /> 100%</span>
                      ) : isPreviewModule ? (
                        <span className="status-badge-pill in-progress" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', borderColor: 'rgba(59, 130, 246, 0.3)' }}>✨ Free Preview</span>
                      ) : isPreviewLocked ? (
                        <span className="status-badge-pill locked" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setShowPremiumModal(true); }}>
                          <FaLock /> Pro Required
                        </span>
                      ) : isLocked ? (
                        <span className="status-badge-pill locked"><FaLock /> Locked</span>
                      ) : completedModTopics === modTopics.length && modTopics.length > 0 ? (
                        <span className="status-badge-pill in-progress">● Ready for MSA</span>
                      ) : (
                        <span className="status-badge-pill in-progress">● {modulePct}%</span>
                      )}
                      {!isLocked && (
                        <div className="accordion-arrow">
                          {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
                        </div>
                      )}
                    </div>
                  </div>

                  {isExpanded && !isLocked && (
                    <div className="module-lessons-container">
                      {module.topics?.map((topic) => {
                        const topicProg = progress?.topics?.[topic.topicId];
                        const isTopicDone = Boolean(topicProg?.completed);
                        const isTopicCurrent = topic.topicId === progress?.currentTopicId;
                        const isTopicRowLocked = isPreviewLocked || (entitlement.isLocked && !isPreviewModule) || !isEnrolled;

                        return (
                          <div 
                            key={topic.topicId}
                            className={`curriculum-topic-row ${isTopicCurrent ? 'current' : ''} ${isTopicRowLocked ? 'locked-topic-row' : ''}`}
                            onClick={() => {
                              if (isPreviewLocked) {
                                toast.info('Module 2 onwards requires SEED Premium or individual course purchase for lifetime access.');
                                setShowPremiumModal(true);
                                return;
                              }
                              if (entitlement.isLocked && !isPreviewModule) {
                                toast.error(entitlement.reason || "This course is restricted to institutional or SEED Premium access.", { duration: 6000 });
                                setShowPremiumModal(true);
                                return;
                              }
                              if (!isEnrolled) {
                                toast.warning(`Please enroll in "${course?.title || 'this course'}" first before launching lessons.`, { duration: 5000 });
                                return;
                              }
                              onSelectTopic(module, topic);
                              onStartLearning(course);
                            }}
                            style={isTopicRowLocked ? { cursor: 'pointer', opacity: 0.85 } : {}}
                          >
                            <div className="topic-row-left">
                              <span className={`topic-icon-bullet ${isTopicDone ? 'done' : isTopicCurrent ? 'current' : ''}`}>
                                {isTopicDone ? <FaCheckCircle /> : isTopicCurrent ? '→' : '○'}
                              </span>
                              <span className="topic-name-text">{topic.title}</span>
                            </div>

                            <div className="topic-row-right">
                              <span className="topic-duration-tag"><FaClock style={{ marginRight: '4px', fontSize: '10px' }} /> {topic.duration || '08:25'}</span>
                              <button 
                                className="topic-launch-btn"
                                disabled={entitlement.isLocked || !isEnrolled}
                                style={entitlement.isLocked || !isEnrolled ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
                              >
                                {entitlement.isLocked ? (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <FaLock style={{ fontSize: '10px' }} /> Locked
                                  </span>
                                ) : !isEnrolled ? (
                                  'Enroll to View'
                                ) : isTopicCurrent ? (
                                  'Continue Lesson'
                                ) : (
                                  'View Lesson'
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {/* Module Assessment (MSA) */}
                      {(() => {
                        const isMsaUnlocked = (completedModTopics === modTopics.length && modTopics.length > 0) || Boolean(progress?.modules?.[module.moduleId]?.msa?.passed);
                        return (
                          <div 
                            className={`curriculum-assessment-row ${isMsaUnlocked && !entitlement.isLocked && isEnrolled ? 'unlocked' : 'locked'}`}
                            onClick={() => {
                              if (entitlement.isLocked) {
                                toast.error(entitlement.reason || "This course is restricted to institutional or SEED Premium access.", { duration: 6000 });
                                return;
                              }
                              if (!isEnrolled) {
                                toast.warning(`Please enroll in "${course?.title || 'this course'}" first before taking assessments.`, { duration: 5000 });
                                return;
                              }
                              if (isMsaUnlocked) {
                                onStartLearning(course);
                              } else {
                                toast.warning(`Module Assessment Locked: Complete all ${modTopics.length} lessons in "${module.title}" first.`);
                              }
                            }}
                            title={isMsaUnlocked && isEnrolled && !entitlement.isLocked ? "Launch Module Assessment" : `Complete all ${modTopics.length} lessons to unlock`}
                            style={(!isMsaUnlocked || entitlement.isLocked || !isEnrolled) ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
                          >
                            <div className="assessment-left">
                              {isMsaUnlocked ? (
                                <FaAward className="assessment-badge-icon" />
                              ) : (
                                <FaLock className="assessment-lock-icon" style={{ color: 'var(--lp-text-dim)' }} />
                              )}
                              <div>
                                <span className="assessment-row-title">Module Assessment (MSA)</span>
                                <span className="assessment-row-sub">
                                  {isMsaUnlocked 
                                    ? 'MCQ & Coding Dual 90% Gate' 
                                    : `Locked • Complete all ${modTopics.length} lessons (${completedModTopics}/${modTopics.length})`}
                                </span>
                              </div>
                            </div>
                            <span className={`assessment-action-link ${!isMsaUnlocked ? 'locked' : ''}`} style={!isMsaUnlocked ? { color: 'var(--lp-text-dim)' } : {}}>
                              {isMsaUnlocked ? 'Take MSA →' : 'Locked'}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* What You'll Learn Full Tab */}
      {activeTab === 'learn' && (
        <div className="overview-tab-panel-container">
          <h3 className="tab-section-heading">Detailed Learning Outcomes</h3>
          <p className="tab-section-lead">
            By completing this curriculum, students master algorithmic complexity, memory management, data structure design, and real technical interview problem solving.
          </p>
          <div className="outcomes-two-column-grid" style={{ marginTop: '18px' }}>
            {(course?.outcomes || [
              'Understand core data structures and memory layouts',
              'Gain hands-on coding practice with real-world examples',
              'Solve problems using efficient algorithms',
              'Prepare for technical interviews',
              'Master recursion, backtracking, and dynamic programming state transitions',
              'Analyze worst-case time ($O$) and auxiliary space complexity'
            ]).map((item, idx) => (
              <div key={idx} className="outcome-check-row">
                <FaCheckCircle className="outcome-green-check" />
                <span className="outcome-text">{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prerequisites Tab */}
      {activeTab === 'prerequisites' && (
        <div className="overview-tab-panel-container">
          <h3 className="tab-section-heading">Prerequisites &amp; Preparation</h3>
          <p className="tab-section-lead">
            Basic familiarity with at least one core programming language (C++, Python, Java, or C) including variables, loops, arrays, and functions. No prior algorithmic knowledge is assumed.
          </p>
          <div className="prerequisites-list-wrap">
            <div className="prereq-item">
              <FaCheckCircle style={{ color: '#10b981' }} />
              <span>Basic syntax, loops, and conditionals in C++, Python, or Java</span>
            </div>
            <div className="prereq-item">
              <FaCheckCircle style={{ color: '#10b981' }} />
              <span>Familiarity with writing standard I/O in the browser code editor</span>
            </div>
          </div>
        </div>
      )}

      {/* Reviews Tab with Live Firestore Ratings & Feedback Submission */}
      {activeTab === 'reviews' && (
        <div className="overview-tab-panel-container">
          <div className="reviews-tab-split">
            {/* Left: Overall Rating Card */}
            <div className="rating-summary-card">
              <div className="rating-big-number">{liveMeta?.rating || 4.9}</div>
              <div className="rating-stars-row">
                {[1, 2, 3, 4, 5].map(s => (
                  <FaStar 
                    key={s} 
                    style={{ color: s <= Math.round(liveMeta?.rating || 5) ? '#fbbf24' : 'var(--lp-border)' }} 
                  />
                ))}
              </div>
              <div className="rating-count-label">Based on {liveMeta?.reviewsCount || (liveMeta?.reviews?.length || 3)} verified reviews</div>
              <div className="enrolled-students-label">
                <FaUserGraduate style={{ marginRight: '6px' }} />
                {(liveMeta?.enrolledCount || 1420).toLocaleString()} students enrolled
              </div>
            </div>

            {/* Right: Write a Review Form */}
            <div className="write-review-card">
              <h4 className="write-review-heading">Share Your Learning Feedback</h4>
              <p className="write-review-sub">Your feedback helps future engineers choose the right course.</p>

              <form onSubmit={handleReviewSubmit} className="review-form">
                <div className="rating-picker-row">
                  <span className="rating-picker-label">Your Rating:</span>
                  <div className="star-picker-group">
                    {[1, 2, 3, 4, 5].map(s => (
                      <button
                        type="button"
                        key={s}
                        className="star-pick-btn"
                        onMouseEnter={() => setUserHoverRating(s)}
                        onMouseLeave={() => setUserHoverRating(0)}
                        onClick={() => setUserRating(s)}
                      >
                        <FaStar style={{ color: s <= (userHoverRating || userRating) ? '#fbbf24' : 'var(--lp-border)' }} />
                      </button>
                    ))}
                  </div>
                  <span className="rating-score-num">{userHoverRating || userRating} / 5</span>
                </div>

                <textarea
                  className="review-textarea"
                  rows={3}
                  placeholder="What did you think of the video lessons, checkpoint questions, and practice sandbox?"
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  disabled={isSubmittingReview}
                />

                <button 
                  type="submit" 
                  className="submit-review-btn" 
                  disabled={isSubmittingReview || !reviewComment.trim()}
                >
                  <FaPaperPlane />
                  <span>{isSubmittingReview ? 'Publishing...' : 'Submit Feedback'}</span>
                </button>
              </form>
            </div>
          </div>

          {/* Student Reviews Feed */}
          <div className="reviews-feed-container">
            <h4 className="feed-title">Verified Student Reviews</h4>
            <div className="reviews-list-stack">
              {(liveMeta?.reviews || []).map((rev) => (
                <div key={rev.id || rev.createdAt} className="single-review-card">
                  <div className="review-card-header">
                    <div className="reviewer-avatar">
                      {(rev.studentName || 'S').charAt(0).toUpperCase()}
                    </div>
                    <div className="reviewer-info">
                      <div className="reviewer-name-row">
                        <strong className="reviewer-name">{rev.studentName}</strong>
                        <span className="reviewer-role">{rev.userRole}</span>
                      </div>
                      <div className="review-stars-date">
                        <div className="stars-mini">
                          {[1, 2, 3, 4, 5].map(s => (
                            <FaStar key={s} style={{ color: s <= rev.rating ? '#fbbf24' : 'var(--lp-border)' }} />
                          ))}
                        </div>
                        <span className="review-date-text">
                          {rev.createdAt ? new Date(rev.createdAt).toLocaleDateString() : 'Verified Review'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="review-text-content">{rev.reviewText}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 5. Course Preview Trailer Modal */}
      {showTrailerModal && (
        <div className="overview-modal-overlay" onClick={() => setShowTrailerModal(false)}>
          <div className="overview-trailer-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header-row">
              <h4>{course?.title || 'Data Structures & Algorithms'} — Course Preview</h4>
              <button className="modal-close-icon" onClick={() => setShowTrailerModal(false)}>
                <FaTimes />
              </button>
            </div>
            <div className="modal-video-box">
              <div className="preview-trailer-player-mockup">
                <div className="trailer-orb-glow">
                  <FaPlay style={{ fontSize: '28px', color: '#ffffff', marginLeft: '4px' }} />
                </div>
                <h3>{course?.title || 'Data Structures & Algorithms Mastery'}</h3>
                <p>2:15 • Instructor Overview &amp; Learning Architecture</p>
                <div className="trailer-badge-pill">SEED SEB Course Preview</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unenroll Confirmation Modal Warning Dialog */}
      {showUnenrollModal && (
        <div className="unenroll-confirm-overlay" onClick={() => !isUnenrolling && setShowUnenrollModal(false)}>
          <div className="unenroll-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="unenroll-modal-header">
              <div className="unenroll-warning-icon-badge">
                <FaExclamationTriangle />
              </div>
              <div>
                <h3 className="unenroll-modal-title">Unenroll from Course?</h3>
                <p className="unenroll-modal-course-name">{course?.title || 'Course'}</p>
              </div>
            </div>

            <div className="unenroll-modal-body">
              <div className="unenroll-danger-alert">
                <strong>Warning: Loss of Course Progress!</strong>
                <p>
                  Unenrolling will permanently reset all your completed lesson checkpoints, interactive practice code solutions, and assessment attempt records for this course.
                </p>
              </div>
              <p className="unenroll-reassure-text">
                You can re-enroll at any time, but your progress will restart from the beginning.
              </p>
            </div>

            <div className="unenroll-modal-footer">
              <button 
                type="button"
                className="unenroll-cancel-btn" 
                onClick={() => setShowUnenrollModal(false)}
                disabled={isUnenrolling}
              >
                Keep Learning
              </button>
              <button 
                type="button"
                className="unenroll-confirm-btn" 
                onClick={handleConfirmUnenroll}
                disabled={isUnenrolling}
              >
                {isUnenrolling ? 'Unenrolling...' : 'Yes, Unenroll & Reset Progress'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Premium Upgrade Modal */}
      <PremiumUpgradeModal
        isOpen={showPremiumModal}
        onClose={() => setShowPremiumModal(false)}
        user={user}
        onUpgradeSuccess={() => {
          setLocalEnrolled(true);
          toast.success("Account upgraded to Premium! You can now enroll and learn.");
        }}
      />
    </div>
  );
};

export default CourseOverviewView;
