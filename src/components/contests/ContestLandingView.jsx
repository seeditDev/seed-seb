import React, { useState, useEffect, useMemo } from 'react';
import {
  FaTrophy,
  FaCalendarAlt,
  FaClock,
  FaGlobe,
  FaBuilding,
  FaUsers,
  FaLock,
  FaSearch,
  FaPlay,
  FaCheck,
  FaTimes,
  FaExclamationTriangle,
  FaArrowRight,
  FaHeart,
  FaShareAlt,
  FaFileAlt,
  FaCode,
  FaShieldAlt,
  FaCheckCircle,
  FaQuestionCircle,
  FaGift,
  FaComments,
  FaDownload,
  FaExternalLinkAlt,
  FaAward,
  FaMedal,
  FaStar,
  FaCopy,
  FaChevronRight,
  FaChevronDown,
  FaChevronUp,
} from 'react-icons/fa';
import { toast } from 'sonner';
import {
  checkContestRegistration,
  registerForContest,
  unregisterFromContest,
  listContestParticipants,
  listContestProblems,
  subscribeContestLeaderboard,
  subscribeContestAnnouncements,
  subscribeToContest,
  subscribeToContestRegistration,
  prepareContestMSAAssessment,
} from '../../services/contestService';
import { purchaseContestPass } from '../../services/razorpayService';
import '../../styles/ContestsView.css';

const TrophySvg = () => (
  <svg className="contest-trophy-svg" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="trophyGold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFF2A1" />
        <stop offset="35%" stopColor="#F5B800" />
        <stop offset="70%" stopColor="#D98200" />
        <stop offset="100%" stopColor="#B36200" />
      </linearGradient>
      <linearGradient id="pedestalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#1E293B" />
        <stop offset="100%" stopColor="#0B132B" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="6" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    {/* Pedestal Base */}
    <ellipse cx="100" cy="172" rx="64" ry="16" fill="url(#pedestalGrad)" stroke="#334155" strokeWidth="2" />
    <path d="M42 166 L60 142 L140 142 L158 166 Z" fill="url(#pedestalGrad)" stroke="#334155" strokeWidth="1.5" />
    {/* Pedestal Top */}
    <ellipse cx="100" cy="142" rx="40" ry="10" fill="#0F172A" stroke="#475569" strokeWidth="1.5" />
    {/* Stem */}
    <path d="M92 118 L88 140 L112 140 L108 118 Z" fill="url(#trophyGold)" />
    <ellipse cx="100" cy="118" rx="16" ry="6" fill="#F5B800" />
    {/* Cup Body */}
    <path d="M60 48 Q60 112 100 114 Q140 112 140 48 Z" fill="url(#trophyGold)" filter="url(#glow)" />
    <ellipse cx="100" cy="48" rx="40" ry="12" fill="#FFE875" />
    {/* Cup Rim highlight */}
    <ellipse cx="100" cy="48" rx="35" ry="9" fill="#F5B800" />
    {/* Left Handle */}
    <path d="M62 56 Q32 64 36 90 Q40 108 68 104" fill="none" stroke="url(#trophyGold)" strokeWidth="8" strokeLinecap="round" />
    {/* Right Handle */}
    <path d="M138 56 Q168 64 164 90 Q160 108 132 104" fill="none" stroke="url(#trophyGold)" strokeWidth="8" strokeLinecap="round" />
    {/* Code Symbol on Cup */}
    <text x="100" y="86" textAnchor="middle" fill="#5A3200" fontSize="22" fontWeight="900" fontFamily="monospace">
      &lt;/&gt;
    </text>
  </svg>
);

export default function ContestLandingView({
  contest: initialContest,
  user = {},
  onBack,
  onLaunchAssessment,
  onOpenSEBModal,
  onUpgradePro,
}) {
  const [contest, setContest] = useState(initialContest);
  const [activeTab, setActiveTab] = useState('overview');
  const [isRegistered, setIsRegistered] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [passkeyInput, setPasskeyInput] = useState('');
  const [showPasskeyModal, setShowPasskeyModal] = useState(false);
  const [selectedProblemPreview, setSelectedProblemPreview] = useState(null);
  const [problems, setProblems] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [expandedFaq, setExpandedFaq] = useState(null);

  // Sync contest doc & user registration in real-time
  useEffect(() => {
    if (!initialContest?.id) return;
    setContest(initialContest);

    const unsubContest = subscribeToContest(initialContest.id, (updated) => {
      if (updated) setContest(updated);
    });

    let unsubReg = () => {};
    if (user?.uid) {
      unsubReg = subscribeToContestRegistration(initialContest.id, user.uid, (regStatus) => {
        setIsRegistered(Boolean(regStatus));
      });
    }

    return () => {
      unsubContest();
      unsubReg();
    };
  }, [initialContest?.id, user?.uid]);

  // Load supplemental tab data
  useEffect(() => {
    if (!contest?.id) return;

    listContestProblems(contest.id).then((pList) => {
      if (pList.length > 0) setProblems(pList);
      else if (contest.sampleProblems) setProblems(contest.sampleProblems);
    });

    const unsubLb = subscribeContestLeaderboard(contest.id, (lb) => {
      setLeaderboard(lb);
    });

    const unsubAnn = subscribeContestAnnouncements(contest.id, (ann) => {
      setAnnouncements(ann);
    });

    listContestParticipants(contest.id).then((partList) => {
      setParticipants(partList);
    });

    return () => {
      unsubLb();
      unsubAnn();
    };
  }, [contest?.id]);

  // Status & Time Calculations
  const dynamicStatus = useMemo(() => {
    if (!contest) return 'upcoming';
    const now = Date.now();
    const startMs = new Date(contest.startTime).getTime();
    const endMs = new Date(contest.endTime).getTime();
    if (now < startMs) return 'upcoming';
    if (now >= startMs && now <= endMs) return 'live';
    return 'ended';
  }, [contest]);

  const timeCountdownText = useMemo(() => {
    if (!contest?.startTime) return '';
    const now = Date.now();
    const startMs = new Date(contest.startTime).getTime();
    const diffMs = startMs - now;
    if (diffMs <= 0) return 'In Progress';
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays > 1) return `Starts in ${diffDays} days`;
    if (diffDays === 1) return 'Starts tomorrow';
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours > 1) return `Starts in ${diffHours} hours`;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    return `Starts in ${diffMins} minutes`;
  }, [contest?.startTime]);

  const formattedStartTime = useMemo(() => {
    if (!contest?.startTime) return 'TBA';
    const d = new Date(contest.startTime);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  }, [contest?.startTime]);

  const contestFee = Number(contest?.entryFeeINR || contest?.entryFee || 0);
  const isPaidContest = contest?.accessTier === 'paid_entry' || contestFee > 0;
  const hasPass = Boolean(
    user?.isPremium ||
    user?.isPro ||
    user?.contestPasses?.[contest?.id] ||
    isRegistered
  );

  // Handle Registration
  const handleRegisterClick = async () => {
    if (!user?.uid) {
      toast.error('Please log in to register for this contest.');
      return;
    }

    if (contest.accessTier === 'pro_only' && !user.isPremium && !user.isPro) {
      if (onUpgradePro) onUpgradePro();
      else toast.error('This contest is exclusive to Pro members.');
      return;
    }

    // Check if contest requires a paid pass and user hasn't unlocked it yet
    if (isPaidContest && !hasPass) {
      setIsRegistering(true);
      try {
        const res = await purchaseContestPass(user, contest);
        if (res.success) {
          toast.success(`Entry pass unlocked! Successfully registered for ${contest.title}!`);
          setIsRegistered(true);
        } else if (res.error && !res.error.includes('cancelled')) {
          toast.error(res.error);
        }
      } catch (err) {
        toast.error(err.message || 'Contest pass checkout failed.');
      } finally {
        setIsRegistering(false);
      }
      return;
    }

    if (contest.passkey && contest.passkey.trim() !== '') {
      setShowPasskeyModal(true);
      return;
    }

    await executeRegistration();
  };

  const executeRegistration = async (passkey = '') => {
    setIsRegistering(true);
    try {
      await registerForContest(contest, user, passkey);
      setIsRegistered(true);
      toast.success(`Successfully registered for ${contest.title}!`);
      setShowPasskeyModal(false);
      setPasskeyInput('');
    } catch (err) {
      toast.error(err.message || 'Registration failed.');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleUnregister = async () => {
    if (!confirm(`Are you sure you want to unregister from ${contest.title}?`)) return;
    try {
      await unregisterFromContest(contest.id, user.uid);
      setIsRegistered(false);
      toast.success('Successfully unregistered.');
    } catch (err) {
      toast.error('Failed to unregister.');
    }
  };

  // Launch Contest into Unified MultiSectionAssessment runtime
  const handleStartContestAssessment = async () => {
    if (!isRegistered) {
      toast.error('You must register for this contest before entering.');
      return;
    }

    // Check SEB Lockdown if required
    if (contest.requiresSeb) {
      const isRunningInSEB = window.__seedSebActive === true ||
        navigator.userAgent.includes('SEED-SEB') ||
        navigator.userAgent.includes('QtWebEngine');

      if (!isRunningInSEB && onOpenSEBModal) {
        onOpenSEBModal(contest);
        return;
      }
    }

    setIsLaunching(true);
    try {
      const targetUrl = await prepareContestMSAAssessment(contest, user);
      if (onLaunchAssessment) {
        onLaunchAssessment(targetUrl);
      } else {
        window.location.href = targetUrl;
      }
    } catch (err) {
      console.error('Failed to launch contest assessment:', err);
      toast.error(err.message || 'Could not launch contest workspace.');
    } finally {
      setIsLaunching(false);
    }
  };

  // Share link
  const handleShare = (platform) => {
    const url = window.location.href;
    const text = `Join me in ${contest.title} on SEED Competitive Arena!`;

    if (platform === 'twitter') {
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
    } else if (platform === 'linkedin') {
      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank');
    } else if (platform === 'whatsapp') {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text + ' ' + url)}`, '_blank');
    } else if (platform === 'reddit') {
      window.open(`https://reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`, '_blank');
    } else {
      navigator.clipboard.writeText(url);
      toast.success('Contest link copied to clipboard!');
    }
  };

  return (
    <div className="contest-landing-wrapper">
      {/* ── Top Bar Navigation (if launched inside portal) ── */}
      {onBack && (
        <div className="contest-back-bar">
          <button className="contest-back-btn" onClick={onBack}>
            ← Back to All Contests
          </button>
        </div>
      )}

      {/* ────────────────── HERO BANNER ────────────────── */}
      <div className="contest-hero-banner">
        <div className="hero-banner-inner">
          {/* Left Column: Details & CTAs */}
          <div className="hero-left-col">
            {/* Top Pill Badges Row */}
            <div className="hero-pill-row">
              <span className="hero-pill global-pill">
                <FaGlobe className="pill-icon" /> GLOBAL ARENA
              </span>
              {dynamicStatus === 'live' ? (
                <span className="hero-pill live-pill animate-pulse">
                  🔴 LIVE NOW
                </span>
              ) : dynamicStatus === 'ended' ? (
                <span className="hero-pill ended-pill">
                  ⚪ COMPLETED
                </span>
              ) : (
                <span className="hero-pill upcoming-pill">
                  🟡 UPCOMING
                </span>
              )}
              {contest.isRated && (
                <span className="hero-pill rated-pill">
                  ⭐ RATED
                </span>
              )}
              {isPaidContest && (
                <span className="hero-pill paid-pill" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                  🎟️ Pass ₹{contestFee}
                </span>
              )}
              {contest.accessTier === 'pro_only' && (
                <span className="hero-pill pro-pill" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#A855F7', borderColor: 'rgba(168, 85, 247, 0.3)' }}>
                  👑 PRO ONLY
                </span>
              )}
            </div>

            {/* Title & Subtitle */}
            <h1 className="hero-contest-title">{contest.title}</h1>
            <p className="hero-contest-description">
              {contest.description || 'Compete in real-time against coders worldwide, solve algorithmic challenges, and climb the global leaderboard.'}
            </p>

            {/* Metadata Strip */}
            <div className="hero-meta-strip">
              <div className="hero-meta-chip">
                <FaCalendarAlt className="meta-icon" />
                <div className="meta-text">
                  <span className="meta-val">{formattedStartTime}</span>
                  <span className="meta-sub">{timeCountdownText}</span>
                </div>
              </div>
              <div className="hero-meta-chip">
                <FaClock className="meta-icon" />
                <div className="meta-text">
                  <span className="meta-val">{contest.durationMinutes} Minutes</span>
                  <span className="meta-sub">Duration</span>
                </div>
              </div>
              <div className="hero-meta-chip">
                <FaUsers className="meta-icon" />
                <div className="meta-text">
                  <span className="meta-val">{contest.isGlobal ? 'Global' : (contest.tenantName || 'College')}</span>
                  <span className="meta-sub">{contest.isGlobal ? 'Open to all' : 'Restricted'}</span>
                </div>
              </div>
              <div className="hero-meta-chip">
                <FaUsers className="meta-icon" />
                <div className="meta-text">
                  <span className="meta-val">{contest.registeredCount || 0} Registered</span>
                  <span className="meta-sub">
                    {contest.registeredCount === 0 ? 'Be the first!' : 'Participants'}
                  </span>
                </div>
              </div>
            </div>

            {/* Hero CTA Buttons */}
            <div className="hero-cta-group">
              {dynamicStatus === 'live' && isRegistered ? (
                <button
                  className="hero-primary-btn launch-btn"
                  onClick={handleStartContestAssessment}
                  disabled={isLaunching}
                >
                  <FaPlay className="btn-icon" /> {isLaunching ? 'Entering Arena…' : 'Enter Contest Workspace →'}
                </button>
              ) : isRegistered ? (
                <div className="registered-badge-group">
                  <button className="hero-primary-btn registered-btn" disabled>
                    <FaCheck className="btn-icon" /> Registered ✓
                  </button>
                  <button className="hero-unregister-btn" onClick={handleUnregister}>
                    Unregister
                  </button>
                </div>
              ) : (
                <button
                  className="hero-primary-btn register-btn"
                  onClick={handleRegisterClick}
                  disabled={isRegistering}
                >
                  {isRegistering
                    ? 'Processing…'
                    : isPaidContest && !hasPass
                    ? `💳 Pay ₹${contestFee} & Register →`
                    : 'Register for Contest →'}
                </button>
              )}

              {/* Heart / Favorite Button */}
              <button
                className={`hero-heart-btn ${isFavorite ? 'active' : ''}`}
                onClick={() => {
                  setIsFavorite(!isFavorite);
                  toast.success(isFavorite ? 'Removed from saved contests' : 'Saved to your contests!');
                }}
                title="Save contest"
              >
                <FaHeart />
              </button>
              <span className="hero-helper-note">
                {isRegistered ? 'You are registered for this contest!' : 'Be the first to register!'}
              </span>
            </div>
          </div>

          {/* Right Column: 3D Trophy Showcase with Floating Badges */}
          <div className="hero-right-col">
            <button className="hero-share-corner-btn" onClick={() => handleShare('copy')}>
              <FaShareAlt /> Share
            </button>

            <div className="trophy-stage-container">
              {/* Floating Glassmorphic Chips */}
              <div className="floating-chip chip-leaderboard">
                <span className="chip-symbol">🌱</span> Real-time Leaderboard
              </div>
              <div className="floating-chip chip-rankings">
                <span className="chip-symbol">🌐</span> Global Rankings
              </div>
              <div className="floating-chip chip-prizes">
                <span className="chip-symbol">⭐</span> Exciting Prizes
              </div>
              <div className="floating-chip chip-certificates">
                <span className="chip-symbol">🏅</span> Skill Certificates
              </div>

              {/* Central Trophy Artwork (or Custom Contest Image if provided) */}
              {contest.bannerUrl || contest.imageUrl ? (
                <img
                  src={contest.bannerUrl || contest.imageUrl}
                  alt={contest.title}
                  className="contest-custom-banner-img"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              ) : (
                <TrophySvg />
              )}

              {/* Bottom Stage Slogan */}
              <div className="stage-motto-breadcrumbs">
                Challenge &gt; Code &gt; Improve &gt; Lead
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────── TAB NAVIGATION BAR ────────────────── */}
      <div className="contest-tab-nav-bar">
        <div className="tab-buttons-scroll">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'problems', label: 'Problems' },
            { id: 'leaderboard', label: 'Leaderboard' },
            { id: 'discussions', label: 'Discussions' },
            { id: 'participants', label: 'Participants' },
            { id: 'rules', label: 'Rules' },
            { id: 'prizes', label: 'Prizes' },
            { id: 'faq', label: 'FAQ' },
          ].map((tab) => (
            <button
              key={tab.id}
              className={`contest-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right Search & Filter in Tab Bar */}
        <div className="tab-nav-right-tools">
          <div className="scope-select-wrapper">
            <select
              className="scope-dropdown"
              value={contest.isGlobal ? 'global' : 'college'}
              disabled
            >
              <option value="global">All Scopes (Global + College)</option>
              <option value="college">College Specific</option>
            </select>
          </div>
          <div className="tab-search-wrapper">
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search in contest..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="tab-search-input"
            />
          </div>
        </div>
      </div>

      {/* ────────────────── MAIN CONTENT (2-COLUMN GRID) ────────────────── */}
      <div className="contest-main-grid">
        {/* ── LEFT COLUMN (68%) ── */}
        <div className="contest-grid-left">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="overview-tab-content space-y-6">
              {/* Card 1: About This Contest */}
              <div className="contest-card about-card">
                <div className="about-card-left">
                  <div className="card-header-row">
                    <div className="card-icon-bubble blue-bubble">
                      <FaFileAlt />
                    </div>
                    <h2 className="card-title">About This Contest</h2>
                  </div>
                  <p className="card-text">
                    {contest.description || 'SEED Coding Challenges is a global competitive programming contest designed to test your problem-solving skills, algorithmic thinking, and coding ability. Compete with participants from around the world, solve challenging problems, and climb the leaderboard.'}
                  </p>
                  {/* Category / Topic Pills */}
                  <div className="topic-pills-row">
                    {['Data Structures', 'Algorithms', 'Problem Solving', 'Competitive Programming', 'Logic', 'Real-time Ranking'].map((t) => (
                      <span key={t} className="topic-pill">{t}</span>
                    ))}
                  </div>
                </div>

                {/* Mini Highlights Prize Box inside About */}
                <div
                  className="about-prizes-box"
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveTab('prizes')}
                  onKeyDown={(e) => e.key === 'Enter' && setActiveTab('prizes')}
                >
                  <div className="prize-box-header">
                    <div className="prize-box-trophy">🏆</div>
                    <div>
                      <h4 className="prize-box-title">Exciting Prizes for Top Performers</h4>
                    </div>
                    <FaChevronRight className="prize-box-arrow" />
                  </div>
                  <ul className="prize-box-checklist">
                    <li><FaCheck className="green-check" /> Global Leaderboard</li>
                    <li><FaCheck className="green-check" /> Certificates for all participants</li>
                    <li><FaCheck className="green-check" /> Goodies for top rankers</li>
                    <li><FaCheck className="green-check" /> Recognition on SEED</li>
                  </ul>
                </div>
              </div>

              {/* Card 2: Sample Problems Table */}
              <div className="contest-card sample-problems-card">
                <div className="card-header-row justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="card-icon-bubble purple-bubble">
                      <FaCode />
                    </div>
                    <div>
                      <h2 className="card-title">Sample Problems</h2>
                      <p className="card-subtitle">Here are a few example problems from this contest.</p>
                    </div>
                  </div>
                  <button className="view-all-link" onClick={() => setActiveTab('problems')}>
                    View All Problems →
                  </button>
                </div>

                <div className="sample-problems-table-wrapper">
                  <table className="sample-problems-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Title</th>
                        <th>Difficulty</th>
                        <th>Topics</th>
                        <th className="text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(problems.length > 0 ? problems : contest.sampleProblems).slice(0, 4).map((p, idx) => (
                        <tr key={p.id || idx}>
                          <td className="font-mono text-muted">{idx + 1}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <FaFileAlt className="text-muted-icon" />
                              <span className="font-semibold text-slate-800 dark:text-slate-100">{p.title}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`diff-badge diff-${(p.difficulty || 'Medium').toLowerCase()}`}>
                              {p.difficulty || 'Medium'}
                            </span>
                          </td>
                          <td className="text-sm text-slate-600 dark:text-slate-300">
                            {p.topics || 'Algorithms, Implementation'}
                          </td>
                          <td className="text-right">
                            <button
                              className="table-view-btn"
                              onClick={() => setSelectedProblemPreview(p)}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Card 3 & 4: Two-card row (Who Can Participate & Why Participate) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Who Can Participate? */}
                <div className="contest-card">
                  <div className="card-header-row">
                    <div className="card-icon-bubble blue-bubble">
                      <FaUsers />
                    </div>
                    <h3 className="card-title text-base">Who Can Participate?</h3>
                  </div>
                  <ul className="benefit-checklist">
                    {(contest.whoCanParticipate || []).map((item, i) => (
                      <li key={i}>
                        <FaCheckCircle className="green-circle-check" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Why Participate? */}
                <div className="contest-card">
                  <div className="card-header-row">
                    <div className="card-icon-bubble gold-bubble">
                      <FaStar />
                    </div>
                    <h3 className="card-title text-base">Why Participate?</h3>
                  </div>
                  <ul className="benefit-checklist">
                    {(contest.whyParticipate || []).map((item, i) => (
                      <li key={i}>
                        <FaCheckCircle className="green-circle-check" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PROBLEMS */}
          {activeTab === 'problems' && (
            <div className="contest-card space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="card-title">Contest Problems ({problems.length})</h2>
                  <p className="card-subtitle">Solve algorithmic challenges to earn points and climb the leaderboard.</p>
                </div>
                {dynamicStatus === 'live' && isRegistered && (
                  <button className="hero-primary-btn launch-btn scale-90" onClick={handleStartContestAssessment}>
                    Solve in Arena →
                  </button>
                )}
              </div>

              <div className="sample-problems-table-wrapper">
                <table className="sample-problems-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Problem Title</th>
                      <th>Score</th>
                      <th>Difficulty</th>
                      <th>Topics</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {problems.map((p, idx) => (
                      <tr key={p.id || idx}>
                        <td className="font-mono text-muted">{idx + 1}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <FaFileAlt className="text-muted-icon" />
                            <span className="font-semibold text-slate-800 dark:text-slate-100">{p.title}</span>
                          </div>
                        </td>
                        <td className="font-mono font-semibold text-emerald-600">{p.points || 100} pts</td>
                        <td>
                          <span className={`diff-badge diff-${(p.difficulty || 'Medium').toLowerCase()}`}>
                            {p.difficulty || 'Medium'}
                          </span>
                        </td>
                        <td className="text-sm text-slate-600 dark:text-slate-300">
                          {p.topics || 'Data Structures, Logic'}
                        </td>
                        <td className="text-right">
                          <button className="table-view-btn" onClick={() => setSelectedProblemPreview(p)}>
                            Preview
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: LEADERBOARD */}
          {activeTab === 'leaderboard' && (
            <div className="contest-card space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="card-title">Live Scoreboard &amp; Rankings</h2>
                  <p className="card-subtitle">Real-time ranks updated with ICPC penalty rules.</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  Live Sync
                </div>
              </div>

              {leaderboard.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  <FaTrophy className="mx-auto text-4xl text-slate-300 mb-2" />
                  <p className="font-medium">No submissions recorded yet.</p>
                  <p className="text-xs">Be the first to solve a challenge and take Rank #1!</p>
                </div>
              ) : (
                <div className="sample-problems-table-wrapper">
                  <table className="sample-problems-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Participant</th>
                        <th>Institution</th>
                        <th>Score</th>
                        <th>Solved</th>
                        <th>Penalty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((entry) => (
                        <tr key={entry.userId} className={entry.userId === user?.uid ? 'bg-primary/5 font-semibold' : ''}>
                          <td>
                            <span className={`rank-badge rank-${entry.rank}`}>
                              #{entry.rank}
                            </span>
                          </td>
                          <td>
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {entry.displayName} {entry.userId === user?.uid && '(You)'}
                            </span>
                          </td>
                          <td className="text-xs text-muted-foreground">
                            {entry.tenantName || 'Global'}
                          </td>
                          <td className="font-mono font-bold text-emerald-600">
                            {entry.totalScore}
                          </td>
                          <td className="font-mono">{entry.solvedCount || 0}</td>
                          <td className="font-mono text-xs text-muted-foreground">{entry.totalPenaltyMinutes || 0}m</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: DISCUSSIONS */}
          {activeTab === 'discussions' && (
            <div className="contest-card space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="card-title">Announcements &amp; Community Clarifications</h2>
                  <p className="card-subtitle">Official broadcasts from judges and organizers.</p>
                </div>
              </div>

              {announcements.length === 0 ? (
                <div className="py-10 text-center text-slate-500">
                  <FaComments className="mx-auto text-3xl text-slate-300 mb-2" />
                  <p>No announcements yet for this contest.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {announcements.map((ann) => (
                    <div key={ann.id} className="p-4 rounded-xl border border-blue-100 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900/40">
                      <div className="flex items-center justify-between mb-1 text-xs text-blue-600 dark:text-blue-400 font-semibold">
                        <span>📢 Broadcast by {ann.author || 'Contest Admin'}</span>
                        <span>{ann.createdAt?.toDate ? ann.createdAt.toDate().toLocaleTimeString() : 'Just now'}</span>
                      </div>
                      <p className="text-sm text-slate-800 dark:text-slate-200">{ann.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: PARTICIPANTS */}
          {activeTab === 'participants' && (
            <div className="contest-card space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="card-title">Registered Participants ({contest.registeredCount || participants.length})</h2>
                  <p className="card-subtitle">Coders competing in this global arena.</p>
                </div>
              </div>

              {participants.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  <FaUsers className="mx-auto text-4xl text-slate-300 mb-2" />
                  <p>No participants registered yet.</p>
                  <p className="text-xs">Register now to reserve your spot!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {participants.map((p) => (
                    <div key={p.id || p.userId} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm">
                        {(p.displayName || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate text-slate-800 dark:text-slate-100">
                          {p.displayName || 'Student'}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {p.tenantName || 'Global Participant'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: RULES */}
          {activeTab === 'rules' && (
            <div className="contest-card space-y-6">
              <div>
                <h2 className="card-title">Official Contest Rules &amp; Integrity Policy</h2>
                <p className="card-subtitle">Please read carefully before entering the contest arena.</p>
              </div>

              <div className="grid gap-4">
                {(contest.rules || []).map((rule, idx) => (
                  <div key={idx} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
                    <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">
                        {idx + 1}
                      </span>
                      {rule.title}
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-slate-300 pl-7">{rule.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: PRIZES */}
          {activeTab === 'prizes' && (
            <div className="contest-card space-y-6">
              <div>
                <h2 className="card-title">Contest Prizes &amp; Recognition</h2>
                <p className="card-subtitle">Earn rewards, verifiable certificates, and climb the SEED rankings.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(contest.prizes || []).map((prize, idx) => (
                  <div key={idx} className="p-4 rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent flex items-start gap-3">
                    <div className="text-2xl mt-0.5">
                      {prize.icon === 'gold' ? '🥇' : prize.icon === 'silver' ? '🥈' : prize.icon === 'bronze' ? '🥉' : '🎖️'}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100">{prize.rank}</h4>
                      <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">{prize.reward}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 8: FAQ */}
          {activeTab === 'faq' && (
            <div className="contest-card space-y-4">
              <div>
                <h2 className="card-title">Frequently Asked Questions</h2>
                <p className="card-subtitle">Common questions regarding contest setup and execution.</p>
              </div>

              <div className="space-y-3">
                {(contest.faqs || []).map((faq, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden cursor-pointer"
                    onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
                  >
                    <div className="p-4 flex items-center justify-between font-semibold text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                      <span>{faq.q}</span>
                      {expandedFaq === idx ? <FaChevronUp className="text-xs" /> : <FaChevronDown className="text-xs" />}
                    </div>
                    {expandedFaq === idx && (
                      <div className="px-4 pb-4 text-sm text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3">
                        {faq.a}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN: SIDEBAR (32%) ── */}
        <div className="contest-grid-right space-y-6">
          {/* Sidebar Card 1: Contest Details */}
          <div className="contest-card sidebar-details-card">
            <div className="card-header-row">
              <div className="card-icon-bubble green-bubble">
                <FaCalendarAlt />
              </div>
              <h3 className="card-title text-base">Contest Details</h3>
            </div>

            <div className="details-table-list">
              <div className="detail-row">
                <span className="detail-label"><FaCalendarAlt className="detail-icon" /> Start Date</span>
                <span className="detail-value">{formattedStartTime}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label"><FaClock className="detail-icon" /> Duration</span>
                <span className="detail-value font-semibold">{contest.durationMinutes} Minutes</span>
              </div>
              <div className="detail-row">
                <span className="detail-label"><FaCode className="detail-icon" /> Contest Type</span>
                <span className="detail-value">Algorithmic + Data Structures</span>
              </div>
              <div className="detail-row">
                <span className="detail-label"><FaUsers className="detail-icon" /> Participants</span>
                <span className="detail-value">{contest.isGlobal ? 'Global (Open to all)' : contest.tenantName}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label"><FaCheckCircle className="detail-icon" /> Registration</span>
                <span className="detail-value text-emerald-600 font-semibold">
                  {isRegistered ? 'Registered ✓' : 'Open - Be the first!'}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label"><FaCode className="detail-icon" /> Language Support</span>
                <span className="detail-value">C++, Java, Python, JavaScript</span>
              </div>
              <div className="detail-row">
                <span className="detail-label"><FaShieldAlt className="detail-icon" /> Platform</span>
                <span className="detail-value">SEED-SEB (Secure Environment)</span>
              </div>
            </div>

            {/* CTA in sidebar */}
            <div className="mt-5">
              {dynamicStatus === 'live' && isRegistered ? (
                <button
                  className="sidebar-cta-btn launch-btn"
                  onClick={handleStartContestAssessment}
                  disabled={isLaunching}
                >
                  <FaPlay className="mr-2" /> {isLaunching ? 'Entering Arena…' : 'Enter Contest Workspace →'}
                </button>
              ) : isRegistered ? (
                <button className="sidebar-cta-btn registered-btn" disabled>
                  <FaCheck className="mr-2" /> You are Registered ✓
                </button>
              ) : (
                <button
                  className="sidebar-cta-btn register-btn"
                  onClick={handleRegisterClick}
                  disabled={isRegistering}
                >
                  {isRegistering
                    ? 'Processing…'
                    : isPaidContest && !hasPass
                    ? `💳 Pay ₹${contestFee} & Register →`
                    : 'Register for Contest →'}
                </button>
              )}
            </div>

            {/* SEED-SEB Lockdown Alert */}
            <div className="seb-lockdown-alert-box mt-4">
              <div className="alert-lock-icon">
                <FaLock />
              </div>
              <div className="alert-body">
                <div className="alert-title">Requires SEED-SEB Desktop App Lockdown</div>
                <a
                  href="/seed-seb"
                  target="_blank"
                  rel="noreferrer"
                  className="alert-link"
                  onClick={(e) => {
                    if (onOpenSEBModal) {
                      e.preventDefault();
                      onOpenSEBModal(contest);
                    }
                  }}
                >
                  Download SEB App →
                </a>
              </div>
            </div>
          </div>

          {/* Sidebar Card 2: Organizer */}
          <div className="contest-card sidebar-organizer-card">
            <div className="card-header-row">
              <div className="card-icon-bubble blue-bubble">
                <FaShieldAlt />
              </div>
              <h3 className="card-title text-base">Organizer</h3>
            </div>

            <div className="organizer-profile-row">
              <div className="organizer-logo-badge">S</div>
              <div className="organizer-info">
                <div className="organizer-name">
                  SEED <FaCheckCircle className="verified-icon" title="Verified Organizer" />
                </div>
                <div className="organizer-tagline">
                  {contest.organizer?.tagline || 'Learn · Practice · Compete · Grow'}
                </div>
              </div>
            </div>

            <div className="mt-3 text-right">
              {onBack && (
                <button className="text-xs text-primary font-semibold hover:underline" onClick={onBack}>
                  View All Contests →
                </button>
              )}
            </div>
          </div>

          {/* Sidebar Card 3: Share This Contest */}
          <div className="contest-card sidebar-share-card">
            <div className="card-header-row">
              <div className="card-icon-bubble purple-bubble">
                <FaShareAlt />
              </div>
              <h3 className="card-title text-base">Share This Contest</h3>
            </div>

            <div className="social-share-row">
              <button className="social-icon-btn x-btn" title="Share on X" onClick={() => handleShare('twitter')}>
                𝕏
              </button>
              <button className="social-icon-btn linkedin-btn" title="Share on LinkedIn" onClick={() => handleShare('linkedin')}>
                in
              </button>
              <button className="social-icon-btn whatsapp-btn" title="Share on WhatsApp" onClick={() => handleShare('whatsapp')}>
                W
              </button>
              <button className="social-icon-btn reddit-btn" title="Share on Reddit" onClick={() => handleShare('reddit')}>
                r
              </button>
              <button className="social-icon-btn copy-btn" title="Copy Link" onClick={() => handleShare('copy')}>
                <FaCopy />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────── Problem Preview Modal ────────────────── */}
      {selectedProblemPreview && (
        <div className="contest-modal-backdrop" onClick={() => setSelectedProblemPreview(null)}>
          <div className="contest-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className={`diff-badge diff-${(selectedProblemPreview.difficulty || 'Medium').toLowerCase()}`}>
                  {selectedProblemPreview.difficulty || 'Medium'}
                </span>
                <h3 className="text-xl font-bold mt-1 text-slate-900 dark:text-slate-100">
                  {selectedProblemPreview.title}
                </h3>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedProblemPreview(null)}>
                <FaTimes />
              </button>
            </div>
            <div className="modal-body space-y-4">
              <div>
                <h5 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  Problem Description
                </h5>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {selectedProblemPreview.description || `Given standard competitive input, implement an optimal solution for ${selectedProblemPreview.title}.`}
                </p>
              </div>
              <div>
                <h5 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  Topics Tested
                </h5>
                <div className="topic-pills-row">
                  {(selectedProblemPreview.topics || 'Data Structures, Optimization').split(',').map((t) => (
                    <span key={t} className="topic-pill">{t.trim()}</span>
                  ))}
                </div>
              </div>
              {selectedProblemPreview.constraints && (
                <div>
                  <h5 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-1">
                    Constraints
                  </h5>
                  <pre className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-900 text-xs font-mono">
                    {selectedProblemPreview.constraints}
                  </pre>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="table-view-btn" onClick={() => setSelectedProblemPreview(null)}>
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── Passkey Modal ────────────────── */}
      {showPasskeyModal && (
        <div className="contest-modal-backdrop" onClick={() => setShowPasskeyModal(false)}>
          <div className="contest-modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="text-lg font-bold">Access Passkey Required</h3>
              <button className="modal-close-btn" onClick={() => setShowPasskeyModal(false)}>
                <FaTimes />
              </button>
            </div>
            <div className="modal-body space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                This event is protected by an access passkey provided by your instructor or host.
              </p>
              <input
                type="password"
                placeholder="Enter access passkey..."
                value={passkeyInput}
                onChange={(e) => setPasskeyInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-sm"
              />
            </div>
            <div className="modal-footer">
              <button className="hero-primary-btn register-btn" onClick={() => executeRegistration(passkeyInput)} disabled={isRegistering}>
                {isRegistering ? 'Verifying…' : 'Submit & Register'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
