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
  FaKey,
  FaCrown,
  FaMedal,
  FaLaptopCode,
  FaDownload,
  FaExternalLinkAlt,
  FaBell,
  FaChartBar,
  FaStar,
  FaChevronRight,
  FaFilter,
} from 'react-icons/fa';
import { toast } from 'sonner';
import {
  listAvailableContests,
  checkContestRegistration,
  registerForContest,
  prepareContestMSAAssessment,
} from '../../services/contestService';
import ContestLandingView from './ContestLandingView';
import '../../styles/ContestsView.css';

const ContestsView = ({
  user,
  initialContestId = null,
  onNavigateToArena,
  onOpenSEBModal,
  onUpgradePro,
}) => {
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all'); // all, live, upcoming, ended, registered
  const [scopeFilter, setScopeFilter] = useState('all'); // all, global, college
  const [searchQuery, setSearchQuery] = useState('');
  const [registeredMap, setRegisteredMap] = useState({});
  const [selectedContest, setSelectedContest] = useState(null);

  // Registration Modal State
  const [registerModalContest, setRegisterModalContest] = useState(null);
  const [passkeyInput, setPasskeyInput] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  // Load Contests
  const fetchContests = async () => {
    setLoading(true);
    try {
      const isPremium = Boolean(user?.isPremium);
      const data = await listAvailableContests(user?.tenantId, user?.cohortId, isPremium);
      setContests(data);

      // Check registration for each contest
      if (user?.uid) {
        const regStatuses = {};
        await Promise.all(
          data.map(async (c) => {
            const isReg = await checkContestRegistration(c.id, user.uid);
            regStatuses[c.id] = isReg;
          })
        );
        setRegisteredMap(regStatuses);
      }

      // If initialContestId is provided, select it
      if (initialContestId) {
        const found = data.find((c) => c.id === initialContestId || c.slug === initialContestId);
        if (found) setSelectedContest(found);
      }
    } catch (err) {
      console.error('[ContestsView] fetchContests error:', err);
      toast.error('Failed to load contests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContests();
  }, [user?.uid, user?.tenantId, initialContestId]);

  // Featured Contest (First Live contest or Next Upcoming)
  const featuredContest = useMemo(() => {
    const live = contests.find((c) => c.dynamicStatus === 'live');
    if (live) return live;
    return contests.find((c) => c.dynamicStatus === 'upcoming') || contests[0] || null;
  }, [contests]);

  // Filtered List
  const filteredContests = useMemo(() => {
    return contests.filter((c) => {
      if (statusFilter === 'registered' && !registeredMap[c.id]) return false;
      if (statusFilter !== 'all' && statusFilter !== 'registered' && c.dynamicStatus !== statusFilter) return false;
      if (scopeFilter === 'global' && !c.isGlobal) return false;
      if (scopeFilter === 'college' && c.isGlobal) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = c.title.toLowerCase().includes(q);
        const matchDesc = (c.description || '').toLowerCase().includes(q);
        const matchTenant = (c.tenantName || '').toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchTenant) return false;
      }
      return true;
    });
  }, [contests, statusFilter, scopeFilter, searchQuery, registeredMap]);

  // Handle Registration Click
  const handleOpenRegister = (contest, e) => {
    if (e) e.stopPropagation();
    if (contest.accessTier === 'pro_only' && !user?.isPremium) {
      if (onUpgradePro) onUpgradePro();
      else toast.error('This contest is exclusive to Pro members. Upgrade to unlock.');
      return;
    }
    setRegisterModalContest(contest);
    setPasskeyInput('');
  };

  const handleConfirmRegister = async () => {
    if (!registerModalContest) return;
    setIsRegistering(true);
    try {
      await registerForContest(registerModalContest, user, passkeyInput);
      toast.success(`Successfully registered for ${registerModalContest.title}!`);
      setRegisteredMap((prev) => ({ ...prev, [registerModalContest.id]: true }));
      setRegisterModalContest(null);
      fetchContests();
    } catch (err) {
      toast.error(err.message || 'Registration failed.');
    } finally {
      setIsRegistering(false);
    }
  };

  // Handle Enter Arena / Launch Assessment Click
  const handleLaunchContest = async (contest, e) => {
    if (e) e.stopPropagation();

    if (contest.requiresSeb) {
      const isRunningInSEB = window.__seedSebActive === true ||
        navigator.userAgent.includes('SEED-SEB') ||
        navigator.userAgent.includes('QtWebEngine');

      if (!isRunningInSEB && onOpenSEBModal) {
        onOpenSEBModal(contest);
        return;
      }
    }

    try {
      const targetUrl = await prepareContestMSAAssessment(contest, user);
      if (onNavigateToArena) {
        onNavigateToArena(targetUrl);
      } else {
        window.location.href = targetUrl;
      }
    } catch (err) {
      console.error('Launch failed:', err);
      toast.error(err.message || 'Failed to start contest.');
    }
  };

  // Format Date Range
  const formatContestTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // ── IF A CONTEST IS SELECTED: RENDER RICH CONTEST LANDING VIEW ──
  if (selectedContest) {
    return (
      <ContestLandingView
        contest={selectedContest}
        user={user}
        onBack={() => setSelectedContest(null)}
        onLaunchAssessment={onNavigateToArena}
        onOpenSEBModal={onOpenSEBModal}
        onUpgradePro={onUpgradePro}
      />
    );
  }

  // ── OTHERWISE: RENDER EXPLORE CONTESTS HUB ──
  return (
    <div className="contests-view-container">
      {/* ── Featured Banner ── */}
      {featuredContest && (
        <div
          className="contests-hero-card"
          onClick={() => setSelectedContest(featuredContest)}
        >
          <div className="contests-hero-main-row">
            {/* Left Content */}
            <div className="contests-hero-content">
              <div className="contests-badge-row">
                <span className="hero-pill-badge arena-badge">
                  <FaTrophy className="pill-icon" /> SEED COMPETITIVE ARENA
                </span>
                {featuredContest.dynamicStatus === 'live' ? (
                  <span className="hero-pill-badge live-badge">
                    <span className="pulse-dot-live" /> LIVE NOW
                  </span>
                ) : (
                  <span className="hero-pill-badge upcoming-badge">
                    🟡 UPCOMING CONTEST
                  </span>
                )}
                {featuredContest.isRated && (
                  <span className="hero-pill-badge rated-badge">
                    ⭐ RATED
                  </span>
                )}
                {featuredContest.accessTier === 'pro_only' && (
                  <span className="hero-pill-badge pro-badge">
                    👑 PRO ONLY
                  </span>
                )}
              </div>

              <h1 className="contests-hero-title">{featuredContest.title}</h1>
              <p className="contests-hero-subtitle">
                {featuredContest.description || 'Compete in real-time against coders worldwide, solve algorithmic challenges, and climb the scoreboard.'}
              </p>

              <div className="contests-hero-meta-row">
                <div className="meta-item">
                  <FaCalendarAlt className="meta-icon" />
                  <span>{formatContestTime(featuredContest.startTime)}</span>
                </div>
                <div className="meta-item">
                  <FaClock className="meta-icon" />
                  <span>{featuredContest.durationMinutes} Minutes</span>
                </div>
                <div className="meta-item">
                  {featuredContest.isGlobal ? (
                    <>
                      <FaGlobe className="meta-icon text-cyan" />
                      <span>Global Arena</span>
                    </>
                  ) : (
                    <>
                      <FaBuilding className="meta-icon text-purple" />
                      <span>{featuredContest.tenantName || 'College Hosted'}</span>
                    </>
                  )}
                </div>
                <div className="meta-item">
                  <FaUsers className="meta-icon" />
                  <span>{featuredContest.registeredCount || 0} Registered</span>
                </div>
                {featuredContest.prizePool && (
                  <div className="meta-item text-amber font-semibold">
                    <FaTrophy className="meta-icon" />
                    <span>{featuredContest.prizePool}</span>
                  </div>
                )}
              </div>

              <div className="contests-hero-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="btn-hero-primary"
                  onClick={() => setSelectedContest(featuredContest)}
                >
                  View Contest Details <FaArrowRight />
                </button>

                {registeredMap[featuredContest.id] ? (
                  <span className="hero-registered-chip">
                    <FaCheck /> You are Registered
                  </span>
                ) : (
                  <button
                    className="btn-hero-register"
                    onClick={(e) => handleOpenRegister(featuredContest, e)}
                  >
                    Register for Contest
                  </button>
                )}
              </div>
            </div>

            {/* Right Graphic / Trophy + Stats */}
            <div className="contests-hero-visual">
              <div className="hero-trophy-display">
                <div className="trophy-ambient-glow" />
                <div className="trophy-icon-wrapper">
                  <FaTrophy className="trophy-svg" />
                  <span className="trophy-code-symbol">&lt;/&gt;</span>
                </div>
              </div>
              <div className="hero-floating-chips">
                <div className="floating-chip chip-1">
                  <span className="chip-emoji">🏆</span>
                  <span>{featuredContest.prizePool || '₹25,000 Prizes'}</span>
                </div>
                <div className="floating-chip chip-2">
                  <span className="chip-emoji">🌱</span>
                  <span>Live Leaderboard</span>
                </div>
                <div className="floating-chip chip-3">
                  <span className="chip-emoji">🏅</span>
                  <span>Certificates</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Filters & Search ── */}
      <div className="contests-filter-bar">
        <div className="filter-tabs">
          {[
            { id: 'all', label: 'All Contests' },
            { id: 'live', label: '🔴 Live Now' },
            { id: 'upcoming', label: 'Upcoming' },
            { id: 'registered', label: 'My Registered' },
            { id: 'ended', label: 'Completed' },
          ].map((tab) => (
            <button
              key={tab.id}
              className={`filter-tab-pill ${statusFilter === tab.id ? 'active' : ''}`}
              onClick={() => setStatusFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="filter-right">
          <div className="scope-pills">
            <button
              className={`scope-pill ${scopeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setScopeFilter('all')}
            >
              All Scopes
            </button>
            <button
              className={`scope-pill ${scopeFilter === 'global' ? 'active' : ''}`}
              onClick={() => setScopeFilter('global')}
            >
              🌐 Global
            </button>
            <button
              className={`scope-pill ${scopeFilter === 'college' ? 'active' : ''}`}
              onClick={() => setScopeFilter('college')}
            >
              🏫 College
            </button>
          </div>

          <div className="search-box">
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search contests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Contests Grid ── */}
      <div className="contests-grid">
        {loading ? (
          <div className="contests-loading-card">
            <div className="loading-spinner" />
            <p>Loading competitive arena contests...</p>
          </div>
        ) : filteredContests.length === 0 ? (
          <div className="contests-empty-card">
            <FaTrophy className="empty-icon" />
            <h3>No contests found</h3>
            <p>There are no contests matching your active filters. Check back soon for upcoming coding challenges!</p>
          </div>
        ) : (
          filteredContests.map((c) => {
            const isReg = Boolean(registeredMap[c.id]);
            const isLive = c.dynamicStatus === 'live';
            const isEnded = c.dynamicStatus === 'ended';

            return (
              <div
                key={c.id}
                className={`contest-card ${isLive ? 'live-border' : ''}`}
                onClick={() => setSelectedContest(c)}
              >
                {/* Banner Thumbnail (if available) */}
                {(c.bannerUrl || c.imageUrl) && (
                  <div className="contest-card-banner">
                    <img
                      src={c.bannerUrl || c.imageUrl}
                      alt={c.title}
                      className="contest-card-banner-img"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <div className="contest-card-banner-overlay" />
                    <span className={`status-badge-overlay ${c.dynamicStatus}`}>
                      {c.dynamicStatus === 'live' ? '🔴 LIVE' : c.dynamicStatus.toUpperCase()}
                    </span>
                  </div>
                )}

                <div className="contest-card-body">
                  <div className="contest-card-header">
                    <div className="card-badge-group">
                      {c.isGlobal ? (
                        <span className="scope-tag global-tag">
                          <FaGlobe /> Global Arena
                        </span>
                      ) : (
                        <span className="scope-tag college-tag">
                          <FaBuilding /> {c.tenantName || 'College Hosted'}
                        </span>
                      )}
                      {c.isRated && <span className="rated-tag">⭐ Rated</span>}
                      {c.requiresSeb && (
                        <span className="seb-tag" title="Requires SEED-SEB desktop lockdown">
                          <FaLock /> SEB Enforced
                        </span>
                      )}
                      {c.accessTier === 'pro_only' && (
                        <span className="pro-tag">
                          👑 Pro Only
                        </span>
                      )}
                    </div>

                    {!c.bannerUrl && !c.imageUrl && (
                      <span className={`status-pill ${c.dynamicStatus}`}>
                        {c.dynamicStatus === 'live' ? '🔴 LIVE' : c.dynamicStatus.toUpperCase()}
                      </span>
                    )}
                  </div>

                  <h3 className="contest-card-title">{c.title}</h3>
                  <p className="contest-card-desc">
                    {c.description || 'Competitive algorithmic and technical problem-solving event.'}
                  </p>

                  <div className="contest-card-meta">
                    <div className="meta-line">
                      <FaCalendarAlt className="meta-icon" />
                      <span>Starts: {formatContestTime(c.startTime)}</span>
                    </div>
                    <div className="meta-line">
                      <FaClock className="meta-icon" />
                      <span>Duration: {c.durationMinutes} Minutes • {c.problemCount || 6} Problems</span>
                    </div>
                    <div className="meta-line">
                      <FaUsers className="meta-icon" />
                      <span>{c.registeredCount || 0} Registered</span>
                    </div>
                    {c.prizePool && (
                      <div className="meta-line prize-highlight">
                        <FaTrophy className="meta-icon text-amber" />
                        <span>Prize Pool: {c.prizePool}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="contest-card-footer" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn-card-details"
                    onClick={() => setSelectedContest(c)}
                  >
                    View Details
                  </button>

                  {isLive && isReg ? (
                    <button
                      className="btn-card-enter live"
                      onClick={(e) => handleLaunchContest(c, e)}
                    >
                      <FaPlay /> Enter Arena
                    </button>
                  ) : isReg ? (
                    <span className="card-registered-pill">
                      <FaCheck /> Registered
                    </span>
                  ) : isEnded ? (
                    <button
                      className="btn-card-results"
                      onClick={() => setSelectedContest(c)}
                    >
                      Leaderboard
                    </button>
                  ) : (
                    <button
                      className="btn-card-register"
                      onClick={(e) => handleOpenRegister(c, e)}
                    >
                      Register Now
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Registration Modal ── */}
      {registerModalContest && (
        <div className="contest-modal-overlay" onClick={() => setRegisterModalContest(null)}>
          <div className="contest-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="contest-modal-header">
              <div className="modal-title-row">
                <FaTrophy className="modal-trophy" />
                <h3>Register for Contest</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setRegisterModalContest(null)}>
                <FaTimes />
              </button>
            </div>

            <div className="contest-modal-body">
              <div className="reg-contest-summary">
                <h4>{registerModalContest.title}</h4>
                <p className="summary-desc">{registerModalContest.description}</p>

                <div className="summary-tags">
                  <span><FaClock /> {registerModalContest.durationMinutes} mins</span>
                  <span><FaCalendarAlt /> {formatContestTime(registerModalContest.startTime)}</span>
                  <span>{registerModalContest.isGlobal ? '🌐 Global' : '🏫 College'}</span>
                </div>
              </div>

              {registerModalContest.passkey && (
                <div className="passkey-input-block">
                  <label><FaKey /> Event Access Passkey Required</label>
                  <input
                    type="password"
                    placeholder="Enter passkey provided by instructor..."
                    value={passkeyInput}
                    onChange={(e) => setPasskeyInput(e.target.value)}
                  />
                </div>
              )}

              {registerModalContest.requiresSeb && (
                <div className="seb-notice-box">
                  <FaExclamationTriangle className="notice-icon" />
                  <div>
                    <strong>SEED-SEB Lockdown Enforced</strong>
                    <p>When this contest goes live, you will need the SEED-SEB desktop app to compete securely.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="contest-modal-footer">
              <button className="btn-cancel" onClick={() => setRegisterModalContest(null)}>
                Cancel
              </button>
              <button
                className="btn-confirm-reg"
                onClick={handleConfirmRegister}
                disabled={isRegistering}
              >
                {isRegistering ? 'Registering...' : 'Confirm Registration'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContestsView;
