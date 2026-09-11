import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from './router-compat';
import CourseLearningPlayer from '../courses/components/CourseLearningPlayer';
import { COURSE_CATALOG } from '../courses/data/courseCatalogData';
import { fetchLiveCoursesFromFirestore } from '../courses/services/courseMetadataService';
import { fetchCourse } from '../services/codingQuestionBankService';
import SecurityWatermark from './SecurityWatermark';
import { FaExclamationTriangle, FaArrowLeft } from 'react-icons/fa';

const CourseLearningPage = () => {
  const { courseId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Read user profile
  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('auth_data') || '{}');
    } catch (_) {
      return {};
    }
  }, []);

  // Determine initial view (CLASS or OVERVIEW) - Default safely to OVERVIEW
  const initialView = useMemo(() => {
    try {
      const searchParams = new URLSearchParams(location.search || '');
      const viewParam = searchParams.get('view') || location.state?.view;
      if (viewParam === 'OVERVIEW' || viewParam === 'CLASS') return viewParam;
    } catch (_) {}
    return 'OVERVIEW';
  }, [location.search, location.state]);

  useEffect(() => {
    let isMounted = true;

    async function loadCourse() {
      if (!courseId) {
        if (isMounted) {
          setError('No course ID specified.');
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // 1. Check sessionStorage cache
        const cachedRaw = sessionStorage.getItem(`seed_learning_course_${courseId}`);
        if (cachedRaw) {
          try {
            const cached = JSON.parse(cachedRaw);
            if (cached && (cached.courseId === courseId || cached.slug === courseId || cached.id === courseId)) {
              if (isMounted) {
                setCourse(cached);
                setLoading(false);
                return;
              }
            }
          } catch (_) {}
        }

        // 2. Fetch from Firestore / courseCatalogData
        const live = await fetchLiveCoursesFromFirestore(COURSE_CATALOG);
        const catalog = (live && live.length > 0) ? live : COURSE_CATALOG;
        let matched = catalog.find(c => 
          String(c.courseId).toLowerCase() === String(courseId).toLowerCase() || 
          String(c.slug).toLowerCase() === String(courseId).toLowerCase() || 
          String(c.id).toLowerCase() === String(courseId).toLowerCase()
        );

        // 3. Fallback to codingQuestionBankService fetchCourse
        if (!matched) {
          try {
            const directCourse = await fetchCourse(courseId);
            if (directCourse && (directCourse.courseId || directCourse.title || directCourse.id)) {
              matched = directCourse;
            }
          } catch (_) {}
        }

        if (isMounted) {
          if (matched) {
            setCourse(matched);
            try {
              sessionStorage.setItem(`seed_learning_course_${courseId}`, JSON.stringify(matched));
            } catch (_) {}
          } else {
            setError(`Course "${courseId}" could not be found. It may have been renamed or unpublished.`);
          }
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to load course details. Please check your network connection.');
          setLoading(false);
        }
      }
    }

    loadCourse();
    return () => { isMounted = false; };
  }, [courseId]);

  if (loading) {
    return (
      <div className="seb-boot" style={{ zIndex: 99999 }}>
        <SecurityWatermark email={user?.email} />
        <div className="seb-boot__brand">
          <div className="seb-boot__spinner-ring"></div>
          <div className="seb-boot__logo-wrapper">
            <img src="/SEED_Logo.png" alt="SEED-IT Platform" className="seb-boot__logo" />
          </div>
        </div>
        <div className="seb-boot__title">SEED-IT Learning Classroom</div>
        <div className="seb-boot__status">
          <span className="seb-boot__dot"></span>
          <span>Preparing course workspace and learning modules...</span>
        </div>
        <div className="seb-boot__progress-bar" style={{ width: '240px' }}>
          <div className="seb-boot__progress-fill"></div>
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary, #0f172a)',
        color: 'var(--text-main, #f8fafc)',
        fontFamily: "'Inter', sans-serif",
        padding: '24px'
      }}>
        <SecurityWatermark email={user?.email} />
        <div style={{
          maxWidth: '480px',
          width: '100%',
          background: 'var(--bg-secondary, #1e293b)',
          border: '1px solid var(--border-color, #334155)',
          borderRadius: '16px',
          padding: '36px 30px',
          textAlign: 'center',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
        }}>
          <FaExclamationTriangle style={{ color: '#ef4444', fontSize: '3rem', marginBottom: '16px' }} />
          <h2 style={{ fontSize: '1.4rem', fontWeight: '800', margin: '0 0 10px' }}>Course Not Found</h2>
          <p style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.92rem', lineHeight: '1.5', margin: '0 0 24px' }}>
            {error || 'Unable to locate the specified course.'}
          </p>
          <button
            type="button"
            onClick={() => {
              window.history.replaceState(null, '', '/student/dashboard');
              navigate('/student/dashboard', { state: { tab: 'my-learning' } });
            }}
            style={{
              background: 'var(--accent-primary, #16a34a)',
              color: '#ffffff',
              border: 'none',
              padding: '11px 24px',
              borderRadius: '8px',
              fontSize: '0.92rem',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <FaArrowLeft /> Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="course-learning-page-root"
      style={{
        minHeight: '100vh',
        width: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        background: 'var(--bg-primary, #0f172a)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <SecurityWatermark email={user?.email} />
      <CourseLearningPlayer
        course={course}
        user={user}
        initialView={initialView}
        onExit={() => {
          window.history.replaceState(null, '', '/student/dashboard');
          navigate('/student/dashboard', { state: { tab: 'my-learning' } });
        }}
      />
    </div>
  );
};

export default CourseLearningPage;
