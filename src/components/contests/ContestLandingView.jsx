import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  FaLayerGroup,
  FaUserCheck,
} from 'react-icons/fa';
import { toast } from 'sonner';
import {
  checkContestRegistration,
  registerForContest,
  unregisterFromContest,
  listContestParticipants,
  subscribeContestLeaderboard,
  subscribeContestAnnouncements,
  subscribeToContest,
  subscribeToContestRegistration,
  prepareContestMSAAssessment,
  getContestDynamicStatus,
} from '../../services/contestService';
import { purchaseContestPass } from '../../services/razorpayService';
import '../../styles/ContestsView.css';

// SVG Trophy illustration for hero banner
const TrophyIllustration = () => (
  <svg viewBox="0 0 200 200" className="trophy-illustration" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="trophyGold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFE875" />
        <stop offset="50%" stopColor="#F5B800" />
        <stop offset="100%" stopColor="#D48B00" />
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
    <ellipse cx="100" cy="172" rx="64" ry="16" fill="url(#pedestalGrad)" stroke="#334155" strokeWidth="2" />
    <path d="M42 166 L60 142 L140 142 L158 166 Z" fill="url(#pedestalGrad)" stroke="#334155" strokeWidth="1.5" />
    <ellipse cx="100" cy="142" rx="40" ry="10" fill="#0F172A" stroke="#475569" strokeWidth="1.5" />
    <path d="M92 118 L88 140 L112 140 L108 118 Z" fill="url(#trophyGold)" />
    <ellipse cx="100" cy="118" rx="16" ry="6" fill="#F5B800" />
    <path d="M60 48 Q60 112 100 114 Q140 112 140 48 Z" fill="url(#trophyGold)" filter="url(#glow)" />
    <ellipse cx="100" cy="48" rx="40" ry="12" fill="#FFE875" />
    <ellipse cx="100" cy="48" rx="35" ry="9" fill="#F5B800" />
    <path d="M62 56 Q32 64 36 90 Q40 108 68 104" fill="none" stroke="url(#trophyGold)" strokeWidth="8" strokeLinecap="round" />
    <path d="M138 56 Q168 64 164 90 Q160 108 132 104" fill="none" stroke="url(#trophyGold)" strokeWidth="8" strokeLinecap="round" />
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
  const [userRegistration, setUserRegistration] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [passkeyInput, setPasskeyInput] = useState('');
  const [showPasskeyModal, setShowPasskeyModal] = useState(false);
  const [selectedRoundForPasskey, setSelectedRoundForPasskey] = useState(null);
  const [roundPasskeyInput, setRoundPasskeyInput] = useState('');
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
        setUserRegistration(regStatus);
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

    const unsubLb = subscribeContestLeaderboard(contest.id, (lb) => {
      setLeaderboard(lb);
    });

    const unsubAnn = subscribeContestAnnouncements(contest.id, (ann) => {
      setAnnouncements(ann);
    });

    listContestParticipants(contest.id).then((partList) => {
      setParticipants(partList || []);
    });

    return () => {
      unsubLb();
      unsubAnn();
    };
  }, [contest?.id]);

  // Contest Lifecycle Status (Strictly timestamp-driven)
  const dynamicStatus = useMemo(() => {
    return getContestDynamicStatus(contest);
  }, [contest]);

  // Automated Registration Dates State & Capacity Limits
  const registrationState = useMemo(() => {
    if (!contest) return 'open';
    if (contest.isRegistrationClosed) return 'closed';
    if (contest.registrationLimit !== undefined && contest.registrationLimit !== null && Number(contest.registrationLimit) > 0) {
      if (Number(contest.registeredCount || 0) >= Number(contest.registrationLimit)) {
        return 'full';
      }
    }
    const now = Date.now();
    const regStartMs = contest.registrationStartTime ? new Date(contest.registrationStartTime).getTime() : null;
    const regEndMs = contest.registrationEndTime
      ? new Date(contest.registrationEndTime).getTime()
      : (contest.startTime ? new Date(contest.startTime).getTime() : null);

    if (regStartMs && now < regStartMs) return 'upcoming';
    if (regEndMs && now > regEndMs) return 'closed';
    return 'open';
  }, [contest]);

  // Current Active Round Determination
  const roundsList = useMemo(() => {
    if (Array.isArray(contest?.rounds) && contest.rounds.length > 0) {
      return contest.rounds;
    }
    return [
      {
        roundNumber: 1,
        name: 'Main Round',
        status: contest?.status || 'upcoming',
        durationMinutes: contest?.durationMinutes || 120,
        startTime: contest?.startTime,
        endTime: contest?.endTime,
        sections: contest?.sections || [],
        requiresSeb: contest?.requiresSeb,
        proctorConfig: contest?.proctorConfig,
        shortlistedUids: [],
      }
    ];
  }, [contest]);

  const activeRound = useMemo(() => {
    const live = roundsList.find((r) => r.status === 'live');
    if (live) return live;
    const byCurrentNum = roundsList.find((r) => r.roundNumber === (contest?.currentRoundNumber || 1));
    return byCurrentNum || roundsList[0];
  }, [roundsList, contest?.currentRoundNumber]);

  // Check if current user is qualified for a specific round
  const isUserQualifiedForRound = (round) => {
    if (!round) return false;
    if (round.roundNumber === 1) return true; // Round 1 open to all registered users
    const shortlisted = Array.isArray(round.shortlistedUids) ? round.shortlistedUids : (round.qualifiers || []);
    if (shortlisted.length === 0) return true; // If admin hasn't restricted yet
    return Boolean(user?.uid && shortlisted.includes(user.uid));
  };

  const isUserQualifiedForActiveRound = useMemo(() => {
    return isUserQualifiedForRound(activeRound);
  }, [activeRound, user?.uid]);

  const isRoundCompleted = useCallback((roundNumber) => {
    if (!userRegistration) return false;
    const rNum = Number(roundNumber);
    const completedList = Array.isArray(userRegistration.completedRounds)
      ? userRegistration.completedRounds.map(Number)
      : [];
    if (completedList.includes(rNum)) return true;
    if (userRegistration.status === `round_${rNum}_completed`) return true;
    if (userRegistration.status === 'completed') return true;
    return false;
  }, [userRegistration]);

  const isCurrentActiveRoundCompleted = useMemo(() => {
    return isRoundCompleted(activeRound?.roundNumber || 1);
  }, [isRoundCompleted, activeRound]);

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

  const formatDateTime = (isoStr) => {
    if (!isoStr) return 'TBA';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  const formattedStartTime = useMemo(() => formatDateTime(contest?.startTime), [contest?.startTime]);
  const formattedRegStart = useMemo(() => formatDateTime(contest?.registrationStartTime), [contest?.registrationStartTime]);
  const formattedRegEnd = useMemo(() => formatDateTime(contest?.registrationEndTime || contest?.startTime), [contest?.registrationEndTime, contest?.startTime]);

  const contestFee = Number(contest?.entryFeeINR || contest?.entryFee || 0);
  const isPaidContest = contest?.accessTier === 'paid_entry' || contestFee > 0;
  const hasPass = Boolean(
    user?.isPremium ||
    user?.isPro ||
    user?.contestPasses?.[contest?.id] ||
    isRegistered
  );

  // Handle Registration Click
  const handleRegisterClick = async () => {
    if (!user?.uid) {
      toast.error('Please log in to register for this contest.');
      return;
    }

    if (dynamicStatus === 'ended') {
      toast.error('This contest has already ended. Registration is closed.');
      return;
    }

    if (registrationState === 'upcoming') {
      toast.info(`Registration opens on ${formattedRegStart}. Please check back then!`);
      return;
    }

    if (registrationState === 'closed') {
      toast.error('Registration for this contest has already closed.');
      return;
    }

    if (registrationState === 'full') {
      toast.error(`This contest has reached its registration capacity limit (${contest.registrationLimit} seats).`);
      return;
    }

    if (contest.accessTier === 'pro_only' && !user.isPremium && !user.isPro) {
      if (onUpgradePro) onUpgradePro();
      else toast.error('This contest is exclusive to Pro members.');
      return;
    }

    if (isPaidContest && !hasPass) {
      setIsRegistering(true);
      try {
        const res = await purchaseContestPass(user, contest);
        if (res.success) {
          toast.success(`Entry pass unlocked! Successfully registered for ${contest.title}!`);
          setIsRegistered(true);
          setUserRegistration({ userId: user.uid, status: 'registered', registeredAt: new Date().toISOString() });
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
      setUserRegistration({ userId: user.uid, status: 'registered', registeredAt: new Date().toISOString() });
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
      setUserRegistration(null);
      toast.success('Successfully unregistered.');
    } catch (err) {
      toast.error('Failed to unregister.');
    }
  };

  // Launch Contest Assessment for Active or Chosen Round
  const handleStartContestAssessment = async (targetRoundNumber = null, roundPasskey = '') => {
    if (!isRegistered) {
      toast.error('You must register for this contest before entering.');
      return;
    }

    if (dynamicStatus === 'ended') {
      toast.error('This contest has already ended. Arena workspace is closed.');
      return;
    }

    if (dynamicStatus === 'upcoming') {
      toast.error('This contest has not started yet. Please wait for the scheduled start time.');
      return;
    }

    const roundToEnter = targetRoundNumber
      ? roundsList.find((r) => r.roundNumber === targetRoundNumber)
      : activeRound;

    const roundNum = Number(roundToEnter?.roundNumber || 1);
    if (isRoundCompleted(roundNum)) {
      toast.info(`You have already completed Round ${roundNum}. Multiple attempts are not permitted.`);
      return;
    }

    if (roundToEnter && roundToEnter.roundNumber > 1 && !isUserQualifiedForRound(roundToEnter)) {
      toast.error(
        `You have not been shortlisted for Round ${roundToEnter.roundNumber} ("${roundToEnter.name}"). Only qualified candidates can enter this round.`
      );
      return;
    }

    // Check if round requires a passkey
    if (roundToEnter?.passkey && roundToEnter.passkey.trim() !== '' && !roundPasskey) {
      setSelectedRoundForPasskey(roundToEnter);
      setRoundPasskeyInput('');
      return;
    }

    if (roundToEnter?.passkey && roundToEnter.passkey.trim() !== '') {
      if (roundPasskey.trim().toLowerCase() !== roundToEnter.passkey.trim().toLowerCase()) {
        toast.error(`Invalid passkey for ${roundToEnter.name || `Round ${roundToEnter.roundNumber}`}. Check the live announcements banner for the broadcasted key.`);
        return;
      }
    }

    // Check SEB Lockdown if required
    const requiresSebLockdown = roundToEnter?.requiresSeb !== undefined ? roundToEnter.requiresSeb : contest.requiresSeb;
    if (requiresSebLockdown) {
      const isRunningInSEB =
        window.__seedSebActive === true ||
        navigator.userAgent.includes('SEED-SEB') ||
        navigator.userAgent.includes('QtWebEngine');

      if (!isRunningInSEB && onOpenSEBModal) {
        onOpenSEBModal(contest);
        return;
      }
    }

    setIsLaunching(true);
    try {
      const targetUrl = await prepareContestMSAAssessment(contest, user, roundToEnter?.roundNumber, roundPasskey);
      setSelectedRoundForPasskey(null);
      setRoundPasskeyInput('');
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

  // Filtered Participants List
  const filteredParticipants = useMemo(() => {
    if (!searchFilter.trim()) return participants;
    const q = searchFilter.toLowerCase();
    return participants.filter(
      (p) =>
        (p.displayName || '').toLowerCase().includes(q) ||
        (p.tenantName || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q)
    );
  }, [participants, searchFilter]);

  const hasDeclaredWinners = Array.isArray(contest?.winners) && contest.winners.length > 0;
  const prizesList = Array.isArray(contest?.prizes) && contest.prizes.length > 0 ? contest.prizes : [];

  return (
    <div className="contest-landing-wrapper">
      {/* ── Top Bar Navigation ── */}
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
                <FaGlobe className="pill-icon" /> {contest.isGlobal ? 'GLOBAL ARENA' : (contest.tenantName || 'COLLEGE ARENA')}
              </span>
              {dynamicStatus === 'live' ? (
                <span className="hero-pill live-pill animate-pulse">
                  🔴 LIVE NOW
                </span>
              ) : dynamicStatus === 'ended' ? (
                <span className="hero-pill ended-pill">
                  ⚪ CONTEST ENDED
                </span>
              ) : (
                <span className="hero-pill upcoming-pill">
                  🟡 UPCOMING
                </span>
              )}
              <span className="hero-pill" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#C084FC', borderColor: 'rgba(168, 85, 247, 0.3)' }}>
                <FaLayerGroup className="pill-icon" /> {roundsList.length} {roundsList.length === 1 ? 'Round' : 'Rounds'}
              </span>
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
              {contest.description || 'Compete in real-time against coders worldwide, solve multi-round algorithmic challenges, and climb the leaderboard.'}
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
                  <span className="meta-sub">Per Session</span>
                </div>
              </div>
              <div className="hero-meta-chip">
                <FaUsers className="meta-icon" />
                <div className="meta-text">
                  <span className="meta-val">
                    {contest.registrationLimit
                      ? `${contest.registeredCount || 0} / ${contest.registrationLimit} Slots`
                      : `${contest.registeredCount || participants.length || 0} Registered`}
                  </span>
                  <span className="meta-sub">
                    {registrationState === 'closed'
                      ? 'Registration Closed'
                      : registrationState === 'full'
                      ? 'Seats Full'
                      : registrationState === 'upcoming'
                      ? 'Opens Soon'
                      : 'Registration Open'}
                  </span>
                </div>
              </div>
              {contest.prizePool && (
                <div className="hero-meta-chip">
                  <FaTrophy className="meta-icon text-amber-400" />
                  <div className="meta-text">
                    <span className="meta-val text-amber-400">{contest.prizePool}</span>
                    <span className="meta-sub">Prize Pool</span>
                  </div>
                </div>
              )}
            </div>

            {/* Hero CTA Buttons */}
            <div className="hero-cta-group">
              {dynamicStatus === 'ended' ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <button className="hero-primary-btn" style={{ background: '#1E293B', color: '#94A3B8', cursor: 'not-allowed' }} disabled>
                    Contest Ended
                  </button>
                  <button
                    className="hero-primary-btn"
                    style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', border: '1px solid rgba(245, 158, 11, 0.3)' }}
                    onClick={() => setActiveTab('leaderboard')}
                  >
                    🏆 View Results & Leaderboard →
                  </button>
                </div>
              ) : isRegistered ? (
                dynamicStatus === 'live' ? (
                  isCurrentActiveRoundCompleted ? (
                    <button
                      className="hero-primary-btn registered-btn"
                      style={{ background: '#059669', borderColor: '#10B981', color: '#FFFFFF', cursor: 'default' }}
                      disabled
                    >
                      <FaCheck className="btn-icon" /> Round {activeRound?.roundNumber || 1} Completed ✓
                    </button>
                  ) : isUserQualifiedForActiveRound ? (
                    <button
                      className="hero-primary-btn launch-btn"
                      onClick={() => handleStartContestAssessment(activeRound?.roundNumber)}
                      disabled={isLaunching}
                    >
                      <FaPlay className="btn-icon" /> {isLaunching ? 'Entering Arena…' : `Enter Round ${activeRound?.roundNumber || 1} Workspace →`}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button className="hero-primary-btn" style={{ background: '#475569', cursor: 'not-allowed' }} disabled>
                        🔒 Round {activeRound?.roundNumber} Shortlist Required
                      </button>
                      <span className="text-xs text-amber-400">
                        (Only shortlisted candidates advanced by judges can enter Round {activeRound?.roundNumber})
                      </span>
                    </div>
                  )
                ) : (
                  <div className="registered-badge-group">
                    <button className="hero-primary-btn registered-btn" disabled>
                      <FaCheck className="btn-icon" /> Registered ✓ ({timeCountdownText || 'Starting Soon'})
                    </button>
                    <button className="hero-unregister-btn" onClick={handleUnregister}>
                      Unregister
                    </button>
                  </div>
                )
              ) : registrationState === 'upcoming' ? (
                <button className="hero-primary-btn" style={{ background: '#334155', cursor: 'not-allowed' }} disabled>
                  Registration Opens {formattedRegStart}
                </button>
              ) : registrationState === 'closed' ? (
                <button className="hero-primary-btn" style={{ background: '#1E293B', color: '#94A3B8', cursor: 'not-allowed' }} disabled>
                  Registration Closed
                </button>
              ) : registrationState === 'full' ? (
                <button className="hero-primary-btn" style={{ background: '#1E293B', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.3)', cursor: 'not-allowed' }} disabled>
                  Seats Full (Limit Reached)
                </button>
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
                {isRegistered
                  ? 'You are registered for this championship!'
                  : registrationState === 'open'
                  ? `Registration closes on ${formattedRegEnd}`
                  : ''}
              </span>
            </div>
          </div>

          {/* Right Column: 3D Trophy Showcase */}
          <div className="hero-right-col">
            <button className="hero-share-corner-btn" onClick={() => handleShare('copy')}>
              <FaShareAlt /> Share
            </button>

            <div className="trophy-stage-container">
              <div className="floating-chip chip-leaderboard">
                <span className="chip-symbol">🌱</span> Multi-Round MSA
              </div>
              <div className="floating-chip chip-rankings">
                <span className="chip-symbol">🌐</span> Global Standings
              </div>
              <div className="floating-chip chip-prizes">
                <span className="chip-symbol">⭐</span> Cash &amp; Trophies
              </div>

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

              <div className="stage-motto-breadcrumbs">
                Challenge &gt; Advance &gt; Win
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
            { id: 'rounds', label: `Rounds (${roundsList.length})` },
            { id: 'leaderboard', label: 'Leaderboard' },
            { id: 'registrations', label: `Registrations (${contest.registeredCount || participants.length})` },
            { id: 'rules', label: 'Rules' },
            { id: 'prizes', label: 'Prizes' },
            { id: 'discussions', label: 'Broadcasts' },
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

        <div className="tab-nav-right-tools">
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
              {/* ATTEMPT SUMMARY / SCORE PREVIEW CARD (Immediate Post-Round Feedback - Admin Enabled Only) */}
              {(userRegistration?.lastCompletedRound || userRegistration?.lastScore !== undefined || isRoundCompleted(activeRound?.roundNumber)) && (
                Boolean(contest?.showAttemptSummary) ? (
                  <div className="p-6 rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 via-slate-900/80 to-emerald-900/30 shadow-2xl backdrop-blur-md relative overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-emerald-500/20">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-2xl shadow-inner">
                          <FaCheckCircle />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              Round {userRegistration?.lastCompletedRound || activeRound?.roundNumber || 1} Attempt Recorded
                            </span>
                            <span className="text-xs text-slate-400 font-medium">
                              {userRegistration?.submittedAt ? new Date(userRegistration.submittedAt?.seconds ? userRegistration.submittedAt.seconds * 1000 : userRegistration.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Verified'}
                            </span>
                          </div>
                          <h3 className="text-xl font-black text-white mt-1">
                            Submission Confirmed &amp; Evaluated 🎉
                          </h3>
                        </div>
                      </div>
                      <button
                        onClick={() => setActiveTab('leaderboard')}
                        className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 transition-all shadow-lg self-start sm:self-auto cursor-pointer"
                      >
                        <FaTrophy /> View Live Standings <FaArrowRight />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-700/70 flex flex-col">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Score Achieved</span>
                        <span className="text-2xl font-black text-emerald-400 font-mono mt-1">
                          {userRegistration?.lastScore ?? 0}
                          <span className="text-xs text-slate-400 font-normal"> / {userRegistration?.maxScore || 100}</span>
                        </span>
                        <span className="text-[11px] text-emerald-400/80 font-medium mt-0.5">
                          {userRegistration?.percentage !== undefined ? `${userRegistration.percentage}% Accuracy` : 'Evaluated'}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-700/70 flex flex-col">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Problems Solved</span>
                        <span className="text-2xl font-black text-cyan-400 font-mono mt-1">
                          {userRegistration?.solvedCount ?? 0}
                        </span>
                        <span className="text-[11px] text-slate-400 font-medium mt-0.5">
                          {userRegistration?.partialSolvedCount ? `+${userRegistration.partialSolvedCount} partial` : 'All testcases passed'}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-700/70 flex flex-col">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Time Taken</span>
                        <span className="text-2xl font-black text-indigo-300 font-mono mt-1">
                          {userRegistration?.timeTakenFormatted || (userRegistration?.timeTakenSeconds ? `${Math.floor(userRegistration.timeTakenSeconds / 60)}m ${userRegistration.timeTakenSeconds % 60}s` : 'Completed')}
                        </span>
                        <span className="text-[11px] text-indigo-300/80 font-medium mt-0.5">Speed metric</span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-700/70 flex flex-col">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Proctoring Status</span>
                        <div className="flex items-center gap-1.5 mt-1">
                          <FaShieldAlt className="text-emerald-400 text-lg" />
                          <span className="text-sm font-bold text-emerald-300">Clean Session</span>
                        </div>
                        <span className="text-[11px] text-slate-400 mt-0.5">Zero critical breaches</span>
                      </div>
                    </div>

                    {/* Stage guidance */}
                    <div className="mt-4 p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-300">
                      <div className="flex items-center gap-2">
                        <span className="text-base">ℹ️</span>
                        <span>
                          {rounds.length > 1 && (userRegistration?.lastCompletedRound || 1) < rounds.length
                            ? `Round ${(userRegistration?.lastCompletedRound || 1) + 1} qualification results will be declared by the administrator following automated evaluation.`
                            : dynamicStatus === 'ended'
                            ? 'The contest has concluded. Final official rankings are displayed on the Leaderboard.'
                            : 'Your attempt has been safely synchronized. You may review your current rank on the live scoreboard.'}
                        </span>
                      </div>
                      <span className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold text-[11px] whitespace-nowrap self-start sm:self-auto border border-emerald-500/30">
                        Status: Saved
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/30 via-slate-900/70 to-slate-900/90 shadow-lg backdrop-blur-md">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-xl flex-shrink-0">
                        <FaCheckCircle />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Round {userRegistration?.lastCompletedRound || activeRound?.roundNumber || 1}
                          </span>
                          <span className="text-xs text-slate-400">
                            Attempt Safely Submitted ✓
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-white mt-1">
                          Submission Confirmed
                        </h4>
                        <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                          Your attempt has been safely recorded. Results, scores, and round rankings will be officially published by the administrator following evaluation.
                        </p>
                      </div>
                    </div>
                  </div>
                )
              )}

              {/* LIVE ANNOUNCEMENT BANNER */}
              {announcements && announcements.length > 0 && (
                <div className="p-3.5 rounded-2xl border border-primary/40 bg-primary/10 flex items-center justify-between gap-3 text-xs shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-primary animate-ping" />
                    <span className="font-bold text-primary">📢 Broadcast:</span>
                    <span className="text-foreground font-medium">{announcements[0]?.message}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    by {announcements[0]?.author || 'Admin'}
                  </span>
                </div>
              )}
              {/* WINNERS PODIUM BANNER (If Declared by Admin) */}
              {hasDeclaredWinners && (
                <div className="contest-card bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-amber-500/10 border-amber-500/30 p-6 rounded-2xl">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-500 text-xl">
                      <FaTrophy />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-amber-500 tracking-tight">
                        Official Contest Winners Declared! 🏆
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Congratulations to all champions and podium finalists.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {contest.winners.map((w, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-xl border border-amber-500/30 bg-black/40 backdrop-blur flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-black text-amber-400 uppercase tracking-wider">
                            {w.rank}
                          </span>
                          <span className="text-lg">
                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🎖️'}
                          </span>
                        </div>
                        <div className="font-bold text-base text-foreground truncate">
                          {w.displayName || w.name || 'Champion'}
                        </div>
                        <div className="text-xs text-muted-foreground truncate mb-2">
                          {w.tenantName || 'Global Coder'}
                        </div>
                        <div className="text-xs font-semibold text-amber-300 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">
                          {w.prize || 'Champion Reward'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Card: About This Contest */}
              <div className="contest-card about-card">
                <div className="about-card-left">
                  <div className="card-header-row">
                    <div className="card-icon-bubble blue-bubble">
                      <FaFileAlt />
                    </div>
                    <h2 className="card-title">About This Contest</h2>
                  </div>
                  <p className="card-text">
                    {contest.description || 'SEED Coding Challenges is a multi-round competitive programming event designed to test your algorithmic problem solving and development skills under lockdown conditions.'}
                  </p>
                  <div className="topic-pills-row">
                    {['Multi-Round Elimination', 'Automated Progression', 'SEED-SEB Lockdown', 'Proctored Arena', 'ICPC Penalty Rules'].map((t) => (
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
                      <h4 className="prize-box-title">
                        {contest.prizePool ? `Prize Pool: ${contest.prizePool}` : 'Exciting Prizes for Winners'}
                      </h4>
                    </div>
                    <FaChevronRight className="prize-box-arrow" />
                  </div>
                  <ul className="prize-box-checklist">
                    <li><FaCheck className="green-check" /> Cash rewards &amp; Gold/Silver trophies</li>
                    <li><FaCheck className="green-check" /> PRO yearly access passes</li>
                    <li><FaCheck className="green-check" /> Verifiable achievement certificates</li>
                    <li><FaCheck className="green-check" /> Global SEED rating points</li>
                  </ul>
                </div>
              </div>

              {/* Card: Multi-Round Tournament Pathway */}
              <div className="contest-card space-y-4">
                <div className="card-header-row justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="card-icon-bubble purple-bubble">
                      <FaLayerGroup />
                    </div>
                    <div>
                      <h2 className="card-title">Tournament Rounds &amp; Progression</h2>
                      <p className="card-subtitle">Complete each round to earn qualification for subsequent stages.</p>
                    </div>
                  </div>
                  <button className="view-all-link" onClick={() => setActiveTab('rounds')}>
                    View All Rounds Details →
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {roundsList.map((r) => {
                    const isQualified = isUserQualifiedForRound(r);
                    const isCurrentLive = r.status === 'live';

                    return (
                      <div
                        key={r.roundNumber}
                        className={`p-4 rounded-xl border transition-all ${
                          isCurrentLive
                            ? 'border-emerald-500/50 bg-emerald-500/5 shadow-sm'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400">
                            Round {r.roundNumber}
                          </span>
                          {isCurrentLive ? (
                            <span className="text-[11px] font-bold text-emerald-500 flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" /> LIVE
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground uppercase">
                              {r.status || 'Upcoming'}
                            </span>
                          )}
                        </div>

                        <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm mb-1 line-clamp-1">
                          {r.name}
                        </h4>

                        <div className="text-xs text-muted-foreground mb-3 space-y-0.5">
                          <div>Duration: <span className="font-semibold text-foreground">{r.durationMinutes || 120} mins</span></div>
                          {r.startTime && <div>Window: {formatDateTime(r.startTime)}</div>}
                        </div>

                        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                          {isRoundCompleted(r.roundNumber) ? (
                            <span className="text-emerald-500 font-semibold flex items-center gap-1">
                              <FaCheck /> Completed ✓
                            </span>
                          ) : r.roundNumber === 1 ? (
                            <span className="text-slate-600 dark:text-slate-400">Open to all registrants</span>
                          ) : isQualified ? (
                            <span className="text-emerald-600 font-semibold flex items-center gap-1">
                              <FaUserCheck /> Qualified
                            </span>
                          ) : (
                            <span className="text-amber-500 flex items-center gap-1">
                              <FaLock /> Shortlist Required
                            </span>
                          )}

                          {dynamicStatus === 'live' && isCurrentLive && isRegistered && isQualified && !isRoundCompleted(r.roundNumber) && (
                            <button
                              className="text-xs font-bold text-purple-600 hover:underline"
                              onClick={() => handleStartContestAssessment(r.roundNumber)}
                            >
                              Enter →
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Card: Single-Box Contest Rules Preview */}
              <div className="contest-card space-y-3">
                <div className="card-header-row justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="card-icon-bubble red-bubble">
                      <FaShieldAlt />
                    </div>
                    <div>
                      <h2 className="card-title">Official Contest Rules</h2>
                      <p className="card-subtitle">Fair play and integrity guidelines enforced across all rounds.</p>
                    </div>
                  </div>
                  <button className="view-all-link" onClick={() => setActiveTab('rules')}>
                    View Full Rulebook →
                  </button>
                </div>

                <div className="p-4 rounded-xl border border-border/80 bg-slate-900/40 text-sm leading-relaxed whitespace-pre-line font-mono text-slate-300">
                  {contest.rulesText ||
                    (Array.isArray(contest.rules)
                      ? contest.rules.map((r, i) => `${i + 1}. ${typeof r === 'string' ? r : (r.title + ': ' + r.text)}`).join('\n\n')
                      : '1. Individual participation only. External help or AI assistants are strictly prohibited.\n2. Full screen lockdown and proctoring is enforced.\n3. Final rankings will be locked after round conclusion.')}
                </div>
              </div>

              {/* Card: Participation Benefits */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="contest-card">
                  <div className="card-header-row mb-3">
                    <div className="card-icon-bubble green-bubble">
                      <FaAward />
                    </div>
                    <h3 className="card-title text-base">Eligibility &amp; Requirements</h3>
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

                <div className="contest-card">
                  <div className="card-header-row mb-3">
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

          {/* TAB 2: ROUNDS & PROGRESSION */}
          {activeTab === 'rounds' && (
            <div className="contest-card space-y-6">
              <div>
                <h2 className="card-title">Contest Rounds &amp; Qualification Pathway</h2>
                <p className="card-subtitle">
                  This contest consists of {roundsList.length} stage{roundsList.length > 1 ? 's' : ''}. Only shortlisted candidates chosen by judges proceed to further rounds.
                </p>
              </div>

              <div className="space-y-4">
                {roundsList.map((round) => {
                  const isQualified = isUserQualifiedForRound(round);
                  const isCurrentLive = round.status === 'live';
                  const isEnded = round.status === 'ended';

                  return (
                    <div
                      key={round.roundNumber}
                      className={`p-5 rounded-2xl border transition-all ${
                        isCurrentLive
                          ? 'border-emerald-500/60 bg-emerald-500/5 shadow-md'
                          : 'border-slate-200 dark:border-slate-800 bg-card'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border/60">
                        <div className="flex items-center gap-2.5">
                          <span className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 font-bold flex items-center justify-center text-sm">
                            R{round.roundNumber}
                          </span>
                          <div>
                            <h3 className="font-bold text-base text-foreground">
                              {round.name}
                            </h3>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              <span>Duration: {round.durationMinutes || 120} mins</span>
                              <span>•</span>
                              <span>
                                {round.startTime ? formatDateTime(round.startTime) : 'Schedule TBA'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div>
                          {isCurrentLive ? (
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                              LIVE ARENA
                            </span>
                          ) : isEnded ? (
                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
                              ROUND CONCLUDED
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-600 border border-amber-500/30">
                              UPCOMING
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Round details & settings */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 my-4 text-xs">
                        <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60">
                          <span className="text-muted-foreground font-medium block mb-0.5">Format:</span>
                          <span className="font-semibold text-foreground">
                            {Array.isArray(round.sections) && round.sections.length > 0
                              ? `${round.sections.length} Assessment Sections`
                              : 'Coding & Algorithmic Problem Solving'}
                          </span>
                        </div>

                        <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60">
                          <span className="text-muted-foreground font-medium block mb-0.5">Pass Percentage:</span>
                          <span className="font-bold text-primary">
                            {round.passPercentage ? `>= ${round.passPercentage}% to Advance` : 'Open Qualifier'}
                          </span>
                        </div>

                        <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60">
                          <span className="text-muted-foreground font-medium block mb-0.5">Passkey Access:</span>
                          <span className="font-semibold text-foreground">
                            {round.passkey ? '🔐 Passkey Protected' : 'Open Round'}
                          </span>
                        </div>

                        <div className="p-2.5 rounded-lg bg-muted/40 border border-border/60">
                          <span className="text-muted-foreground font-medium block mb-0.5">Your Qualification:</span>
                          {round.roundNumber === 1 ? (
                            <span className="font-semibold text-emerald-600">Open to all registered</span>
                          ) : isQualified ? (
                            <span className="font-semibold text-emerald-600 flex items-center gap-1">
                              <FaUserCheck /> Shortlisted for this Round!
                            </span>
                          ) : (
                            <span className="font-semibold text-amber-500 flex items-center gap-1">
                              <FaLock /> Awaiting Admin Shortlist
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action Row */}
                      <div className="flex items-center justify-between pt-3 border-t border-border/60">
                        <div className="text-xs text-muted-foreground">
                          {round.roundNumber > 1 && Array.isArray(round.shortlistedUids) && round.shortlistedUids.length > 0 && (
                            <span>{round.shortlistedUids.length} candidates advanced to this round</span>
                          )}
                        </div>

                        <div>
                          {isRoundCompleted(round.roundNumber) ? (
                            <span className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              <FaCheck /> Round {round.roundNumber} Completed ✓
                            </span>
                          ) : dynamicStatus === 'live' && isCurrentLive ? (
                            isRegistered ? (
                              isQualified ? (
                                <button
                                  className="hero-primary-btn launch-btn py-1.5 px-4 text-xs font-bold"
                                  onClick={() => handleStartContestAssessment(round.roundNumber)}
                                  disabled={isLaunching}
                                >
                                  Enter Round {round.roundNumber} Workspace →
                                </button>
                              ) : (
                                <span className="text-xs text-amber-500 font-medium">
                                  Not shortlisted for this round
                                </span>
                              )
                            ) : (
                              <button className="hero-primary-btn register-btn py-1.5 px-4 text-xs" onClick={handleRegisterClick}>
                                Register First
                              </button>
                            )
                          ) : isEnded || dynamicStatus === 'ended' ? (
                            <button className="view-all-link text-xs" onClick={() => setActiveTab('leaderboard')}>
                              View Results →
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Scheduled for {formatDateTime(round.startTime)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
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

              {/* TIE-BREAKING PROTOCOL CALLOUT */}
              <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-300">
                <div className="flex items-center gap-2.5">
                  <span className="text-base">⚖️</span>
                  <div>
                    <span className="font-bold text-white">Official Tie-Breaking Protocol: </span>
                    <span className="text-slate-300">
                      1️⃣ <strong>Total Score</strong> (Higher wins) &rarr; 2️⃣ <strong>Questions Solved</strong> (Higher wins) &rarr; 3️⃣ <strong>Assessment Timing</strong> (Faster wins)
                    </span>
                  </div>
                </div>
                <div className="relative group cursor-help text-xs text-primary font-medium flex items-center gap-1 self-start sm:self-auto whitespace-nowrap">
                  <FaQuestionCircle />
                  <span>How it works</span>
                  {/* Tooltip */}
                  <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-72 p-3 bg-slate-950 text-slate-200 rounded-xl shadow-2xl border border-slate-700 text-[11px] leading-relaxed z-50 pointer-events-none">
                    <p className="font-bold text-white mb-1">Tie-Breaking Resolution Logic</p>
                    <p>When multiple participants achieve identical scores, ranking priority resolves to the candidate who fully passed more problems. If still tied, the candidate with the lowest elapsed completion time is awarded the higher rank.</p>
                  </div>
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
                        <th>
                          <div className="flex flex-col">
                            <span>Total Marks</span>
                            <span className="text-[10px] text-emerald-400 font-mono font-normal">#1 Priority</span>
                          </div>
                        </th>
                        <th>Partial Score</th>
                        <th>
                          <div className="flex flex-col">
                            <span>Assessment Timing</span>
                            <span className="text-[10px] text-indigo-400 font-mono font-normal">#3 Priority</span>
                          </div>
                        </th>
                        <th>
                          <div className="flex flex-col">
                            <span>Solved</span>
                            <span className="text-[10px] text-cyan-400 font-mono font-normal">#2 Priority</span>
                          </div>
                        </th>
                        <th>Score %</th>
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
                            {entry.tenantName || 'Global Arena'}
                          </td>
                          <td className="font-mono font-bold text-emerald-600">
                            {entry.allPassTotalScore ?? entry.totalScore}
                          </td>
                          <td className="font-mono text-xs text-muted-foreground">
                            {entry.partialScore !== undefined ? `${entry.partialScore} pts` : '—'}
                          </td>
                          <td className="font-mono text-xs text-primary font-semibold">
                            {entry.timeTakenFormatted || (entry.timeTakenSeconds ? `${Math.floor(entry.timeTakenSeconds / 60)}m ${entry.timeTakenSeconds % 60}s` : '—')}
                          </td>
                          <td className="font-mono font-medium">{entry.solvedCount || 0}</td>
                          <td className="font-mono text-xs font-semibold">
                            {entry.percentage !== undefined ? `${entry.percentage}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: REGISTRATIONS LIST */}
          {activeTab === 'registrations' && (
            <div className="contest-card space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="card-title">Registered Candidates ({contest.registeredCount || participants.length})</h2>
                  <p className="card-subtitle">Official participants registered for this competition.</p>
                </div>

                <div className="relative w-full sm:w-64">
                  <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs" />
                  <input
                    type="text"
                    placeholder="Search candidate name..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-transparent text-xs"
                  />
                </div>
              </div>

              {filteredParticipants.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  <FaUsers className="mx-auto text-4xl text-slate-300 mb-2" />
                  <p>No matching participants found.</p>
                  <p className="text-xs">Register now to reserve your spot!</p>
                </div>
              ) : (
                <div className="sample-problems-table-wrapper">
                  <table className="sample-problems-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Candidate Name</th>
                        <th>Institution / Arena</th>
                        <th>Registration Date</th>
                        <th className="text-right">Stage Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredParticipants.map((p, idx) => {
                        const isSelf = p.userId === user?.uid;
                        return (
                          <tr key={p.id || p.userId || idx} className={isSelf ? 'bg-purple-500/10 font-semibold' : ''}>
                            <td className="font-mono text-muted text-xs">{idx + 1}</td>
                            <td>
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-full bg-purple-500/10 text-purple-600 font-bold flex items-center justify-center text-xs">
                                  {(p.displayName || 'U').charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                                    {p.displayName || 'Participant'} {isSelf && '(You)'}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="text-xs text-muted-foreground">
                              {p.tenantName || 'Global Arena'}
                            </td>
                            <td className="text-xs text-muted-foreground font-mono">
                              {p.registeredAt?.toDate
                                ? p.registeredAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                : 'Registered'}
                            </td>
                            <td className="text-right">
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                Round 1 Confirmed ✓
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: RULES (SINGLE BOX) */}
          {activeTab === 'rules' && (
            <div className="contest-card space-y-6">
              <div>
                <h2 className="card-title">Official Contest Rules &amp; Regulations</h2>
                <p className="card-subtitle">
                  Academic integrity, proctoring requirements, and competitive code of conduct.
                </p>
              </div>

              {/* Single Box Rulebook */}
              <div className="p-6 rounded-2xl border-2 border-purple-500/30 bg-slate-900/60 backdrop-blur shadow-inner">
                <div className="flex items-center gap-2 text-purple-400 font-bold text-xs uppercase tracking-wider mb-4">
                  <FaShieldAlt /> Single Rulebook Policy Box
                </div>

                <div className="text-sm leading-relaxed text-slate-200 whitespace-pre-line font-mono space-y-2">
                  {contest.rulesText ||
                    (Array.isArray(contest.rules)
                      ? contest.rules
                          .map((r, i) => `${i + 1}. ${typeof r === 'string' ? r : `${r.title}\n   ${r.text}`}`)
                          .join('\n\n')
                      : `1. Eligibility & Registration: All registered students must verify their identity before contest start.
2. Multi-Round Progression: Candidates must meet passing criteria set by judges to advance to Round 2 and Final rounds.
3. Integrity & Lockdown: All rounds are proctored via SEED-SEB desktop lockdown. Full-screen violations, multiple faces, and secondary monitors will result in disqualification.
4. AI Assistance Prohibition: Use of ChatGPT, GitHub Copilot, or external communication during live contest window is strictly banned.
5. Finality of Results: Judge shortlists and podium announcements are final.`)}
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: PRIZES */}
          {activeTab === 'prizes' && (
            <div className="contest-card space-y-6">
              <div>
                <h2 className="card-title">Contest Prizes &amp; Recognition</h2>
                <p className="card-subtitle">
                  {contest.prizePool ? `Total Prize Pool: ${contest.prizePool}.` : 'Compete for verifiable rewards and certificates.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {prizesList.map((prize, idx) => (
                  <div
                    key={idx}
                    className="p-5 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-black/20 to-transparent flex items-start gap-3.5 shadow-sm"
                  >
                    <div className="text-3xl mt-0.5">
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🎖️'}
                    </div>
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-0.5">
                        {prize.rank}
                      </div>
                      <h4 className="font-bold text-base text-foreground">
                        {prize.title || prize.rank}
                      </h4>
                      <p className="text-sm text-amber-300 font-semibold mt-1">
                        {prize.prize || prize.reward}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: BROADCASTS & DISCUSSIONS */}
          {activeTab === 'discussions' && (
            <div className="contest-card space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="card-title">Live Announcements &amp; Clarifications</h2>
                  <p className="card-subtitle">Official broadcasts sent in real-time by judges.</p>
                </div>
              </div>

              {announcements.length === 0 ? (
                <div className="py-10 text-center text-slate-500">
                  <FaComments className="mx-auto text-3xl text-slate-300 mb-2" />
                  <p>No broadcasts issued yet for this contest.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {announcements.map((ann) => (
                    <div key={ann.id} className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/10">
                      <div className="flex items-center justify-between mb-1 text-xs text-blue-400 font-semibold">
                        <span>📢 Broadcast by {ann.author || 'Judge Admin'}</span>
                        <span>{ann.createdAt?.toDate ? ann.createdAt.toDate().toLocaleTimeString() : 'Just now'}</span>
                      </div>
                      <p className="text-sm text-foreground">{ann.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 8: FAQ */}
          {activeTab === 'faq' && (
            <div className="contest-card space-y-4">
              <div>
                <h2 className="card-title">Frequently Asked Questions</h2>
                <p className="card-subtitle">Common questions regarding contest setup, rounds, and execution.</p>
              </div>

              <div className="space-y-3">
                {(contest.faqs || [
                  { q: 'How do multiple rounds work?', a: 'All registered candidates start in Round 1. After Round 1 concludes, judges evaluate submissions and shortlist top performers for subsequent rounds.' },
                  { q: 'Do I need SEED-SEB desktop app?', a: 'Yes, competitive rated contests enforce secure desktop lockdown to ensure academic integrity.' },
                  { q: 'What programming languages are supported?', a: 'C++, Java, Python 3, and JavaScript are supported with standard execution time and memory limits.' },
                  { q: 'How are winners awarded?', a: 'After the final round, judges declare the official podium winners, and prizes/certificates are disbursed within 48 hours.' },
                ]).map((faq, idx) => (
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
                <span className="detail-label"><FaCalendarAlt className="detail-icon" /> Contest Start</span>
                <span className="detail-value">{formattedStartTime}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label"><FaClock className="detail-icon" /> Reg. Window</span>
                <span className="detail-value text-xs">
                  {contest.registrationStartTime ? `${formattedRegStart} - ${formattedRegEnd}` : `Until ${formattedStartTime}`}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label"><FaLayerGroup className="detail-icon" /> Rounds</span>
                <span className="detail-value font-semibold">{roundsList.length} Stages</span>
              </div>
              <div className="detail-row">
                <span className="detail-label"><FaUsers className="detail-icon" /> Arena Scope</span>
                <span className="detail-value">{contest.isGlobal ? 'Global (Open to all)' : contest.tenantName}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label"><FaCheckCircle className="detail-icon" /> Registration</span>
                <span className={`detail-value font-semibold ${isRegistered ? 'text-emerald-500' : registrationState === 'closed' || registrationState === 'full' ? 'text-rose-400' : 'text-purple-400'}`}>
                  {isRegistered ? 'Registered ✓' : registrationState === 'closed' ? 'Closed' : registrationState === 'full' ? 'Full' : 'Open'}
                </span>
              </div>
              {contest.registrationLimit && (
                <div className="detail-row">
                  <span className="detail-label"><FaUsers className="detail-icon" /> Capacity</span>
                  <span className="detail-value font-semibold font-mono">
                    {contest.registeredCount || 0} / {contest.registrationLimit} Slots
                  </span>
                </div>
              )}
              <div className="detail-row">
                <span className="detail-label"><FaShieldAlt className="detail-icon" /> Security</span>
                <span className="detail-value">
                  {contest.requiresSeb ? 'SEED-SEB Lockdown' : 'Standard Browser'}
                </span>
              </div>
            </div>

            {/* CTA in sidebar */}
            <div className="mt-5">
              {dynamicStatus === 'ended' ? (
                <button className="sidebar-cta-btn" style={{ background: '#1E293B', color: '#94A3B8', cursor: 'not-allowed' }} disabled>
                  Contest Ended
                </button>
              ) : isRegistered ? (
                dynamicStatus === 'live' ? (
                  isCurrentActiveRoundCompleted ? (
                    <button className="sidebar-cta-btn registered-btn" style={{ background: '#059669', borderColor: '#10B981', color: '#FFFFFF', cursor: 'default' }} disabled>
                      <FaCheck className="mr-2" /> Round {activeRound?.roundNumber || 1} Completed ✓
                    </button>
                  ) : isUserQualifiedForActiveRound ? (
                    <button
                      className="sidebar-cta-btn launch-btn"
                      onClick={() => handleStartContestAssessment(activeRound?.roundNumber)}
                      disabled={isLaunching}
                    >
                      <FaPlay className="mr-2" /> {isLaunching ? 'Entering Arena…' : `Enter Round ${activeRound?.roundNumber || 1} Workspace →`}
                    </button>
                  ) : (
                    <button className="sidebar-cta-btn" style={{ background: '#475569', cursor: 'not-allowed' }} disabled>
                      🔒 Shortlist Required for Round {activeRound?.roundNumber}
                    </button>
                  )
                ) : (
                  <button className="sidebar-cta-btn registered-btn" disabled>
                    <FaCheck className="mr-2" /> You are Registered ✓
                  </button>
                )
              ) : registrationState === 'upcoming' ? (
                <button className="sidebar-cta-btn" style={{ background: '#334155', cursor: 'not-allowed' }} disabled>
                  Registration Opens {formattedRegStart}
                </button>
              ) : registrationState === 'closed' ? (
                <button className="sidebar-cta-btn" style={{ background: '#1E293B', color: '#94A3B8', cursor: 'not-allowed' }} disabled>
                  Registration Closed
                </button>
              ) : registrationState === 'full' ? (
                <button className="sidebar-cta-btn" style={{ background: '#1E293B', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.3)', cursor: 'not-allowed' }} disabled>
                  Seats Full (Limit Reached)
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
            {contest.requiresSeb && (
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
            )}
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

      {/* ROUND PASSKEY PROMPT MODAL */}
      {selectedRoundForPasskey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in">
            <div className="flex items-center gap-3 text-amber-500">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center text-lg">
                <FaLock />
              </div>
              <div>
                <h3 className="font-bold text-base text-foreground">
                  Round Passkey Verification
                </h3>
                <p className="text-xs text-muted-foreground">
                  {selectedRoundForPasskey.name || `Round ${selectedRoundForPasskey.roundNumber}`}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This round is protected. Please enter the passkey broadcasted by the contest administrator to access this round.
            </p>
            <input
              type="text"
              placeholder="Enter Round Passkey..."
              value={roundPasskeyInput}
              onChange={(e) => setRoundPasskeyInput(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-muted/30 font-mono text-sm tracking-wider focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-xs font-semibold hover:bg-muted text-muted-foreground"
                onClick={() => {
                  setSelectedRoundForPasskey(null);
                  setRoundPasskeyInput('');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                disabled={!roundPasskeyInput.trim() || isLaunching}
                onClick={() => handleStartContestAssessment(selectedRoundForPasskey.roundNumber, roundPasskeyInput)}
              >
                {isLaunching ? 'Validating...' : 'Unlock & Enter Round →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
