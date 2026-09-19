import React, { useState, useEffect, useMemo } from 'react';
import {
  FaPlay, FaFire, FaClock, FaCheckCircle, FaAward,
  FaTrophy, FaGraduationCap, FaArrowRight, FaCode, FaBookOpen,
  FaCoins, FaCertificate, FaDownload, FaStar, FaLaptopCode, FaPlus,
  FaTrashAlt, FaExclamationTriangle, FaBolt
} from 'react-icons/fa';
import { COURSE_CATALOG } from '../data/courseCatalogData';
import { fetchLiveCoursesFromFirestore } from '../services/courseMetadataService';
import { 
  getEnrolledCourseIds, 
  fetchEnrolledCourseIds, 
  fetchUserCourseProgressMap,
  getCourseProgress, 
  createInitialCourseProgress, 
  enrollCourse,
  unenrollCourse
} from '../services/learningEngineService';
import { calculateCourseRewards } from '../../utils/gamificationService';
import CourseCertificateModal from './views/CourseCertificateModal';
import { toast } from 'sonner';
import SeedCreditCoin from '../../components/SeedCreditCoin';
import '../styles/CourseLearningPlayer.css';

const getCourseGradient = (slug = '') => {
  const s = String(slug || '').toLowerCase();
  if (s.includes('dsa')) return 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)';
  if (s.includes('c-') || s === 'c-programming') return 'linear-gradient(135deg, #065f46 0%, #10b981 100%)';
  if (s.includes('cpp')) return 'linear-gradient(135deg, #1e40af 0%, #60a5fa 100%)';
  if (s.includes('java')) return 'linear-gradient(135deg, #991b1b 0%, #ef4444 100%)';
  if (s.includes('operating') || s.includes('os')) return 'linear-gradient(135deg, #374151 0%, #6b7280 100%)';
  if (s.includes('sql') || s.includes('data')) return 'linear-gradient(135deg, #075985 0%, #0284c7 100%)';
  if (s.includes('react') || s.includes('web')) return 'linear-gradient(135deg, #4338ca 0%, #6366f1 100%)';
  return 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)';
};

const getCourseIcon = (slug = '') => {
  const s = String(slug || '').toLowerCase();
  if (s.includes('dsa')) return <FaCode />;
  if (s.includes('react') || s.includes('web')) return <FaLaptopCode />;
  if (s.includes('operating')) return <FaGraduationCap />;
  return <FaCode />;
};

const MyLearningDashboard = ({ onOpenCourse, onExploreCourses, user, totalXP, seedCredits, userLevelInfo }) => {
  const [selectedCertCourse, setSelectedCertCourse] = useState(null);
  const [courseProgressMap, setCourseProgressMap] = useState({});
  const [activeFilterTab, setActiveFilterTab] = useState('ALL'); // 'ALL' | 'IN_PROGRESS' | 'READY' | 'COMPLETED'
  const [loading, setLoading] = useState(true);
  const [allCourses, setAllCourses] = useState(() => COURSE_CATALOG);
  const [unenrollCourseTarget, setUnenrollCourseTarget] = useState(null);
  const [isUnenrolling, setIsUnenrolling] = useState(false);

  const currentXP = totalXP ?? user?.totalXP ?? 0;
  const currentCredits = seedCredits ?? user?.seedCredits ?? 2450;
  const currentLevel = userLevelInfo?.level ?? user?.level ?? 1;
  const currentTitle = userLevelInfo?.levelTitle ?? 'Novice Coder';

  const uid = user?.uid || 'guest';
  const [enrolledIds, setEnrolledIds] = useState(() => getEnrolledCourseIds(uid));

  // Load real progress for enrolled courses with Firestore cloud sync
  useEffect(() => {
    let isMounted = true;

    async function loadProgresses() {
      // 1. Fetch live courses from Firestore so dynamic/real courses are available
      const live = await fetchLiveCoursesFromFirestore(COURSE_CATALOG);
      const catalog = (live && live.length > 0) ? live : COURSE_CATALOG;
      if (isMounted) setAllCourses(catalog);

      // 2. Fetch enrolled IDs & hydrated progress map in a single pass (eliminates N+1 reads)
      const { enrolledIds: liveIds, progressMap: map } = await fetchUserCourseProgressMap(uid, catalog);
      if (!isMounted) return;
      setEnrolledIds(liveIds || []);
      setCourseProgressMap(map || {});
      setLoading(false);
    }

    loadProgresses();
    return () => { isMounted = false; };
  }, [uid]);

  // Split enrolled courses into In-Progress, Not Started, and Completed
  const { inProgressCourses, notStartedCourses, completedCourses } = useMemo(() => {
    const inProg = [];
    const notStarted = [];
    const comp = [];

    enrolledIds.forEach(cid => {
      const course = allCourses.find(c => c.courseId === cid || c.slug === cid);
      if (!course) return;

      const prog = courseProgressMap[course.courseId] || createInitialCourseProgress(course);
      const totalModules = course.modules?.length || 1;
      const completedModules = Object.values(prog.modules || {}).filter(m => m?.completed).length;
      const completedTopicsList = Object.values(prog.topics || {}).filter(t => t?.completed);
      const cTopics = completedTopicsList.length;

      const pct = typeof prog.percentage === 'number' && prog.percentage > 0
        ? prog.percentage
        : (totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0);

      // Find current active topic / module
      const currentMod = course.modules?.find(m => m.moduleId === prog.currentModuleId) || course.modules?.[0];
      const currentTop = currentMod?.topics?.find(t => t.topicId === prog.currentTopicId) || currentMod?.topics?.[0];

      const courseCardData = {
        course,
        courseId: course.courseId,
        title: course.title,
        shortTitle: course.shortTitle,
        slug: course.slug,
        level: course.level,
        gradient: getCourseGradient(course.slug),
        icon: getCourseIcon(course.slug),
        pct,
        modulesTotal: totalModules,
        modulesDone: completedModules,
        moduleText: currentMod ? currentMod.title : `Module 1`,
        activeLesson: currentTop ? currentTop.title : `1.1 Introduction`,
        completedDate: prog.completedAt ? new Date(prog.completedAt).toLocaleDateString() : null
      };

      if (pct >= 100) {
        comp.push(courseCardData);
      } else if (pct > 0 || (prog.hasStarted && cTopics > 0)) {
        inProg.push(courseCardData);
      } else {
        notStarted.push(courseCardData);
      }
    });

    return {
      inProgressCourses: inProg,
      notStartedCourses: notStarted,
      completedCourses: comp
    };
  }, [enrolledIds, courseProgressMap, allCourses]);

  const activeTrackItem = inProgressCourses[0] || notStartedCourses[0] || null;
  const activeTrackCourse = inProgressCourses[0]?.course || null;
  const featuredCourse = activeTrackItem?.course || null;
  const featuredLesson = activeTrackItem?.activeLesson || 'Continue Learning';

  const handlePromptUnenroll = (course) => {
    setUnenrollCourseTarget(course);
  };

  const handleConfirmUnenroll = async (course) => {
    if (!course) return;
    setIsUnenrolling(true);
    try {
      await unenrollCourse(uid, course.courseId);
      setEnrolledIds(prev => prev.filter(id => id !== course.courseId));
      setCourseProgressMap(prev => {
        const next = { ...prev };
        delete next[course.courseId];
        return next;
      });
      setUnenrollCourseTarget(null);
      toast.info(`You have unenrolled from "${course.title}". Course progress has been reset.`);
    } catch (err) {
      toast.error('Failed to unenroll: ' + err.message);
    } finally {
      setIsUnenrolling(false);
    }
  };

  const handleEnrollAndOpen = (course) => {
    if (!course) return;
    enrollCourse(uid, course.courseId);
    onOpenCourse(course, 'CLASS');
  };

  return (
    <div className="my-learning-container">
      {/* 1. Header Overview Hero Banner */}
      <div className="my-learning-hero">
        <div className="hero-left">
          <div className="hero-tag-badge">
            <FaGraduationCap />
            <span>My Learning Workspace</span>
          </div>

          {/* Gamification Strip: Level, XP, Credits */}
          <div className="mylearning-gamification-strip" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '10px 0 14px', flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '999px',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#34d399',
              fontSize: '12px',
              fontWeight: '700'
            }}>
              Level {currentLevel} • {currentTitle}
            </span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '999px',
              background: 'rgba(59, 130, 246, 0.12)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              color: '#93c5fd',
              fontSize: '12px',
              fontWeight: '700'
            }}>
              <FaAward size={13} />
              {currentXP.toLocaleString()} XP
            </span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '999px',
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: '#fbbf24',
              fontSize: '12px',
              fontWeight: '700'
            }}>
              <SeedCreditCoin size={16} />
              {currentCredits.toLocaleString()} SEED Credits
            </span>
          </div>

          <h1 className="hero-heading">Welcome Back, {user?.name || 'Student'}!</h1>
          <p className="hero-subheading">
            {activeTrackCourse ? (
              <>Continue where you left off. You are actively building mastery in <strong>{activeTrackCourse.title}</strong>.</>
            ) : (
              <>Track your learning journey, build skills with interactive courses, and earn verified certifications.</>
            )}
          </p>

          <div className="hero-cta-row">
            {featuredCourse && (
              <button
                className="resume-learning-btn"
                onClick={() => onOpenCourse(featuredCourse)}
              >
                <FaPlay />
                <span>Resume: {featuredLesson}</span>
              </button>
            )}
            <button
              className="explore-more-btn"
              onClick={onExploreCourses}
            >
              <FaBookOpen />
              <span>Explore All Courses</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. In Progress Section */}
      {inProgressCourses.length > 0 && (
        <div className="my-learning-section">
          <div className="section-title-row">
            <h2 className="section-title-heading">In Progress</h2>
            <span className="section-count-tag">{inProgressCourses.length} Active Tracks</span>
          </div>

          <div className="in-progress-cards-grid">
            {inProgressCourses.map((item) => (
              <div
                key={item.courseId}
                className="in-progress-course-card"
                onClick={() => onOpenCourse(item.course)}
              >
                <div className="card-top-image-row" style={{ background: item.gradient }}>
                  <div className="card-banner-icon-watermark">
                    {item.icon}
                  </div>
                  <span className="level-pill-badge">{item.level}</span>
                </div>

                <div className="card-content-body">
                  <h3 className="course-card-title">{item.title}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 8px 0' }}>
                    <span className="current-module-label" style={{ margin: 0 }}>{item.moduleText}</span>
                    {(() => {
                      const rewards = calculateCourseRewards(item.course);
                      return (
                        <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#38bdf8', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <FaBolt size={9} /> {rewards.totalXP} XP · <SeedCreditCoin size={11} /> {rewards.totalCredits} SC
                        </span>
                      );
                    })()}
                  </div>

                  <div className="course-card-progress-bar">
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill" style={{ width: `${item.pct}%` }} />
                    </div>
                    <div className="progress-numbers">
                      <span>{item.pct}% Live Progress</span>
                      <span>{item.modulesDone}/{item.modulesTotal} Modules</span>
                    </div>
                  </div>

                  <div className="my-learning-card-actions-row">
                    <button
                      className="card-continue-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCourse(item.course, 'CLASS');
                      }}
                      title={`Continue learning ${item.title}`}
                    >
                      <FaPlay style={{ fontSize: '11px' }} />
                      <span>Continue Learning</span>
                    </button>
                    <button
                      type="button"
                      className="my-learning-unenroll-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePromptUnenroll(item.course);
                      }}
                      disabled={isUnenrolling}
                      title="Unenroll from this course"
                    >
                      <FaTrashAlt style={{ fontSize: '11px' }} />
                      <span>Unenroll</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3B. Enrolled (Not Started) Section */}
      {notStartedCourses.length > 0 && (
        <div className="my-learning-section">
          <div className="section-title-row">
            <h2 className="section-title-heading">Ready to Start</h2>
            <span className="section-count-tag">{notStartedCourses.length} Enrolled Tracks</span>
          </div>

          <div className="in-progress-cards-grid">
            {notStartedCourses.map((item) => (
              <div
                key={item.courseId}
                className="in-progress-course-card"
                onClick={() => onOpenCourse(item.course)}
              >
                <div className="card-top-image-row" style={{ background: item.gradient }}>
                  <div className="card-banner-icon-watermark">
                    {item.icon}
                  </div>
                  <span className="level-pill-badge">{item.level}</span>
                </div>

                <div className="card-content-body">
                  <h3 className="course-card-title">{item.title}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 0 8px 0' }}>
                    <span className="current-module-label" style={{ margin: 0 }}>{item.moduleText} • 0% Complete</span>
                    {(() => {
                      const rewards = calculateCourseRewards(item.course);
                      return (
                        <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#38bdf8', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <FaBolt size={9} /> {rewards.totalXP} XP · <SeedCreditCoin size={11} /> {rewards.totalCredits} SC
                        </span>
                      );
                    })()}
                  </div>

                  <div className="course-card-progress-bar">
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill" style={{ width: '0%' }} />
                    </div>
                    <div className="progress-numbers">
                      <span>Not Started</span>
                      <span>0/{item.modulesTotal} Modules</span>
                    </div>
                  </div>

                  <div className="my-learning-card-actions-row">
                    <button
                      className="card-continue-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCourse(item.course, 'CLASS');
                      }}
                      title={`Start learning ${item.title}`}
                    >
                      <FaPlay style={{ fontSize: '11px' }} />
                      <span>Start Learning</span>
                    </button>
                    <button
                      type="button"
                      className="my-learning-unenroll-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePromptUnenroll(item.course);
                      }}
                      disabled={isUnenrolling}
                      title="Unenroll from this course"
                    >
                      <FaTrashAlt style={{ fontSize: '11px' }} />
                      <span>Unenroll</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3C. Empty state if no courses enrolled or started */}
      {inProgressCourses.length === 0 && notStartedCourses.length === 0 && (
        <div className="my-learning-section">
          <div className="empty-learning-state">
            <p>You have not enrolled in any courses yet. Explore our technical curriculum to get started!</p>
            <button className="explore-more-btn" onClick={onExploreCourses}>
              Browse Technical Catalog
            </button>
          </div>
        </div>
      )}

      {/* 4. Completed Courses Section */}
      {completedCourses.length > 0 && (
        <div className="my-learning-section">
          <div className="section-title-row">
            <h2 className="section-title-heading">Completed Courses</h2>
            <span className="section-count-tag">{completedCourses.length} Mastered</span>
          </div>

          <div className="completed-courses-grid">
            {completedCourses.map((item) => (
              <div key={item.courseId} className="completed-course-card">
                <div className="completed-left">
                  <div className="completed-check-icon">
                    <FaCheckCircle />
                  </div>
                  <div className="completed-info">
                    <h4 className="completed-title">{item.title}</h4>
                    <span className="completed-subtext">Completed on {item.completedDate || 'Recently'}</span>
                  </div>
                </div>

                <div className="completed-right-actions">
                  <button
                    className="view-cert-btn"
                    onClick={() => setSelectedCertCourse(item.course)}
                  >
                    <FaCertificate />
                    <span>Certificate</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Certificate Modal */}
      {selectedCertCourse && (
        <CourseCertificateModal
          course={selectedCertCourse}
          user={user}
          onClose={() => setSelectedCertCourse(null)}
        />
      )}

      {/* Unenroll Confirmation Modal Warning Dialog */}
      {unenrollCourseTarget && (
        <div className="unenroll-confirm-overlay" onClick={() => !isUnenrolling && setUnenrollCourseTarget(null)}>
          <div className="unenroll-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="unenroll-modal-header">
              <div className="unenroll-warning-icon-badge">
                <FaExclamationTriangle />
              </div>
              <div>
                <h3 className="unenroll-modal-title">Unenroll from Course?</h3>
                <p className="unenroll-modal-course-name">{unenrollCourseTarget.title}</p>
              </div>
            </div>

            <div className="unenroll-modal-body">
              <div className="unenroll-danger-alert">
                <strong><FaExclamationTriangle style={{ color: '#ef4444', marginRight: '6px' }} /> Warning: Loss of Course Progress!</strong>
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
                onClick={() => setUnenrollCourseTarget(null)}
                disabled={isUnenrolling}
              >
                Keep Learning
              </button>
              <button 
                type="button"
                className="unenroll-confirm-btn" 
                onClick={() => handleConfirmUnenroll(unenrollCourseTarget)}
                disabled={isUnenrolling}
              >
                {isUnenrolling ? 'Unenrolling...' : 'Yes, Unenroll & Reset Progress'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyLearningDashboard;
