import React, { useState, useEffect } from 'react';
import {
  FaGithub,
  FaTimes,
  FaCheck,
  FaExternalLinkAlt,
  FaEye,
  FaEyeSlash,
  FaSyncAlt,
  FaLock,
  FaGlobe,
  FaCodeBranch,
  FaInfoCircle,
  FaKey,
  FaBolt
} from 'react-icons/fa';
import { toast } from 'sonner';
import {
  getGitHubConfig,
  fetchGitHubConfigFromFirestore,
  saveGitHubConfigToFirestore,
  clearGitHubConfigFromFirestore,
  connectWithGitHubOAuth,
  verifyGitHubToken,
  getOrCreateRepo,
  batchSyncAllSolved,
  DEFAULT_REPO_NAME
} from '../../services/githubSyncService';
import '../../styles/GitHubSyncModal.css';

export default function GitHubSyncModal({ isOpen, onClose, user, onSyncCompleted }) {
  const [config, setConfig] = useState(getGitHubConfig());
  const [tokenInput, setTokenInput] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [repoInput, setRepoInput] = useState(DEFAULT_REPO_NAME);
  const [isPrivateInput, setIsPrivateInput] = useState(false);
  const [autoSyncInput, setAutoSyncInput] = useState(true);

  const [isOAuthConnecting, setIsOAuthConnecting] = useState(false);
  const [isSyncingFromCloud, setIsSyncingFromCloud] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isBatchSyncing, setIsBatchSyncing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null);
  const [showPatSection, setShowPatSection] = useState(false);

  // Sync GitHub config from Website Profile (Firestore users/{uid}/settings/githubSync)
  const handleSyncFromCloud = async () => {
    const uid = user?.uid;
    if (!uid) {
      toast.error('Student account not identified. Please re-login.');
      return;
    }
    setIsSyncingFromCloud(true);
    try {
      const cloudCfg = await fetchGitHubConfigFromFirestore(uid);
      if (cloudCfg && cloudCfg.isConnected) {
        setConfig(cloudCfg);
        setTokenInput(cloudCfg.token || '');
        setRepoInput(cloudCfg.repo || DEFAULT_REPO_NAME);
        setIsPrivateInput(cloudCfg.isPrivate || false);
        setAutoSyncInput(cloudCfg.autoSync);
        toast.success(`GitHub connected as @${cloudCfg.username} from your website profile!`);
        if (onSyncCompleted) onSyncCompleted();
      } else {
        toast.info('No connected GitHub account found in your profile. Please connect your GitHub account under Website → Profile → GitHub Sync first, then click "Sync Here".');
      }
    } catch (err) {
      console.error('[GitHubSyncModal] Cloud sync error:', err);
      toast.error(err.message || 'Failed to sync GitHub configuration from profile.');
    } finally {
      setIsSyncingFromCloud(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const uid = user?.uid;
      // 1. Instant local load
      const cur = getGitHubConfig();
      setConfig(cur);
      setTokenInput(cur.token || '');
      setRepoInput(cur.repo || DEFAULT_REPO_NAME);
      setIsPrivateInput(cur.isPrivate || false);
      setAutoSyncInput(cur.autoSync);
      setBatchProgress(null);

      // 2. Fetch fresh private settings from Firestore users/{uid}/settings/githubSync
      if (uid) {
        fetchGitHubConfigFromFirestore(uid).then((fresh) => {
          setConfig(fresh);
          setTokenInput(fresh.token || '');
          setRepoInput(fresh.repo || DEFAULT_REPO_NAME);
          setIsPrivateInput(fresh.isPrivate || false);
          setAutoSyncInput(fresh.autoSync);
        });
      }
    }
  }, [isOpen, user?.uid]);

  if (!isOpen) return null;

  // 1. One-Click OAuth Connect (NO PAT REQUIRED)
  const handleOAuthConnect = async () => {
    const uid = user?.uid;
    setIsOAuthConnecting(true);
    try {
      const cleanRepo = repoInput.trim() || DEFAULT_REPO_NAME;
      const newConfig = await connectWithGitHubOAuth(uid, cleanRepo, isPrivateInput);
      setConfig(newConfig);
      toast.success(`Connected to GitHub as @${newConfig.username} without PAT!`);
      if (onSyncCompleted) onSyncCompleted();
    } catch (err) {
      console.warn('[GitHubSyncModal] OAuth error:', err);
      if (err.code === 'auth/operation-not-allowed' || err.code === 'auth/configuration-not-found') {
        toast.error('GitHub OAuth is not configured on Cloud Server. Please enter your Personal Access Token below.');
        setShowPatSection(true);
      } else if (err.code === 'auth/popup-closed-by-user') {
        toast.info('GitHub connection window was closed.');
      } else {
        toast.error(err.message || 'GitHub OAuth failed. You can connect using a Personal Access Token.');
        setShowPatSection(true);
      }
    } finally {
      setIsOAuthConnecting(false);
    }
  };

  // 2. Manual PAT Connect or Update
  const handleConnectWithPAT = async (e) => {
    if (e) e.preventDefault();
    if (!tokenInput.trim()) {
      toast.error('Please enter a GitHub Personal Access Token.');
      return;
    }

    const uid = user?.uid;
    setIsVerifying(true);
    try {
      // Verify token with GitHub
      const profile = await verifyGitHubToken(tokenInput);

      // Ensure repository is available
      const cleanRepo = repoInput.trim() || DEFAULT_REPO_NAME;
      const repoResult = await getOrCreateRepo(tokenInput, profile.username, cleanRepo, isPrivateInput);

      const newConfig = {
        token: tokenInput.trim(),
        username: profile.username,
        name: profile.name,
        email: profile.email,
        avatar: profile.avatarUrl,
        repo: cleanRepo,
        isPrivate: isPrivateInput,
        autoSync: autoSyncInput,
        authMethod: 'pat',
      };

      await saveGitHubConfigToFirestore(uid, newConfig);
      setConfig(newConfig);

      toast.success(
        repoResult.isNew
          ? `Created and linked GitHub repository: ${cleanRepo}`
          : `Connected to GitHub as @${profile.username}!`
      );

      if (onSyncCompleted) onSyncCompleted();
    } catch (err) {
      console.error('[GitHubSyncModal] PAT Connect error:', err);
      toast.error(err.message || 'Failed to connect using Personal Access Token.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSaveSettings = async () => {
    const uid = user?.uid;
    const updated = {
      ...config,
      repo: repoInput.trim() || DEFAULT_REPO_NAME,
      autoSync: autoSyncInput,
      isPrivate: isPrivateInput,
      token: tokenInput.trim() || config.token,
    };
    await saveGitHubConfigToFirestore(uid, updated);
    setConfig(updated);
    toast.success('GitHub sync settings saved.');
    onClose();
  };

  const handleDisconnect = async () => {
    const uid = user?.uid;
    await clearGitHubConfigFromFirestore(uid);
    setConfig(getGitHubConfig());
    setTokenInput('');
    toast.info('Disconnected from GitHub.');
    if (onSyncCompleted) onSyncCompleted();
  };

  const handleBatchSync = async () => {
    const uid = user?.uid;
    if (!uid) {
      toast.error('User identity required to fetch solved problems.');
      return;
    }

    setIsBatchSyncing(true);
    setBatchProgress({ current: 0, total: 0, currentQuestion: 'Initializing...' });

    try {
      const res = await batchSyncAllSolved(uid, (prog) => {
        setBatchProgress(prog);
      });

      toast.success(`Successfully synced ${res.synced} problem${res.synced !== 1 ? 's' : ''} to GitHub!`);
      if (onSyncCompleted) onSyncCompleted();
    } catch (err) {
      console.error('[GitHubSyncModal] Batch sync error:', err);
      toast.error(err.message || 'Batch sync failed.');
    } finally {
      setIsBatchSyncing(false);
      setBatchProgress(null);
    }
  };

  return (
    <div className="ghm-overlay" onClick={onClose}>
      <div className="ghm-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="ghm-header">
          <div className="ghm-header-left">
            <div className="ghm-icon-badge">
              <FaGithub />
            </div>
            <div className="ghm-title-wrap">
              <h3>GitHub Portfolio Sync</h3>
              <p>One-way solution tracks &amp; contribution heatmap sync</p>
            </div>
          </div>
          <button className="ghm-close-btn" onClick={onClose} title="Close">
            <FaTimes />
          </button>
        </div>

        {/* Body */}
        <div className="ghm-body">
          {config.isConnected ? (
            <>
              {/* Connected Status Hero */}
              <div className="ghm-connected-card">
                <div className="ghm-user-info">
                  {config.avatar && (
                    <img src={config.avatar} alt={config.username} className="ghm-avatar" />
                  )}
                  <div className="ghm-user-details">
                    <div className="ghm-name">
                      @{config.username}
                      {config.name && config.name !== config.username && (
                        <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#64748b' }}>
                          ({config.name})
                        </span>
                      )}
                    </div>
                    <a
                      href={`https://github.com/${config.username}/${config.repo}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ghm-repo-link"
                    >
                      <FaCodeBranch /> {config.username}/{config.repo} <FaExternalLinkAlt style={{ fontSize: '10px' }} />
                    </a>
                  </div>
                </div>
                <div className="ghm-status-pill">
                  <FaCheck /> Connected
                </div>
              </div>

              {/* Target Repository Field */}
              <div className="ghm-form-group">
                <label className="ghm-label">Target Repository Name</label>
                <div className="ghm-input-wrap">
                  <input
                    type="text"
                    value={repoInput}
                    onChange={(e) => setRepoInput(e.target.value)}
                    placeholder="seed-it-solutions"
                    className="ghm-input"
                  />
                </div>
                <div className="ghm-input-hint">
                  Solutions are committed to <code>Problems/&lt;Category&gt;/&lt;QId-Title&gt;/</code> in this repo.
                </div>
              </div>

              {/* Update PAT Token Section */}
              <div className="ghm-form-group">
                <label className="ghm-label">
                  <span>Personal Access Token (PAT)</span>
                  <button
                    type="button"
                    onClick={() => setShowPatSection(!showPatSection)}
                    style={{ background: 'transparent', border: 'none', color: '#4f46e5', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    {showPatSection ? 'Hide' : 'Update Token'}
                  </button>
                </label>
                {showPatSection && (
                  <div className="ghm-input-wrap" style={{ marginTop: '4px' }}>
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder="Update GitHub token..."
                      className="ghm-input"
                    />
                    <button
                      type="button"
                      className="ghm-input-action"
                      onClick={() => setShowToken(!showToken)}
                      title={showToken ? 'Hide token' : 'Show token'}
                    >
                      {showToken ? <FaEyeSlash /> : <FaEye />}
                    </button>
                  </div>
                )}
                <div className="ghm-input-hint">
                  Stored securely under <code>users/{user?.uid || 'user'}/settings/githubSync</code> in Firestore. Not visible in public profiles.
                </div>
              </div>

              {/* Auto Sync Toggle */}
              <div
                className="ghm-switch-row"
                onClick={() => setAutoSyncInput(!autoSyncInput)}
              >
                <div className="ghm-switch-info">
                  <span className="ghm-switch-title">Auto-Sync on 100% Pass</span>
                  <span className="ghm-switch-desc">
                    Automatically push code to GitHub whenever all test cases pass.
                  </span>
                </div>
                <div className={`ghm-toggle ${autoSyncInput ? 'active' : ''}`}>
                  <div className="ghm-toggle-thumb" />
                </div>
              </div>

              {/* Batch Sync Box */}
              <div className="ghm-batch-box">
                <div className="ghm-batch-row">
                  <div className="ghm-batch-text">
                    <h4>Batch Sync Solved Problems</h4>
                    <p>Push all your previously accepted problems to your GitHub repository.</p>
                  </div>
                  <button
                    className="ghm-batch-btn"
                    onClick={handleBatchSync}
                    disabled={isBatchSyncing}
                  >
                    {isBatchSyncing ? (
                      <>
                        <div className="ghm-spinner" /> Syncing...
                      </>
                    ) : (
                      <>
                        <FaSyncAlt /> Sync All Solved
                      </>
                    )}
                  </button>
                </div>

                {batchProgress && (
                  <div>
                    <div style={{ fontSize: '11.5px', color: '#64748b', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Syncing: {batchProgress.currentQuestion}</span>
                      <span>{batchProgress.current} / {batchProgress.total}</span>
                    </div>
                    <div className="ghm-progress-bar">
                      <div
                        className="ghm-progress-fill"
                        style={{
                          width: `${batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Not Connected Info */}
              <div className="ghm-info-box">
                <strong>Why connect GitHub?</strong>
                <br />
                Maintain your daily GitHub heatmap streak and automatically build an interview-ready problem solving portfolio. Every solved problem creates a clean, verified commit.
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontWeight: 600 }}>
                  <FaCheck style={{ fontSize: '11px' }} /> Stored privately in Firestore — Never loaded in public areas.
                </div>
              </div>

              {/* Connect via Website Profile Instructions & Sync Here */}
              <div style={{
                background: 'rgba(99, 102, 241, 0.05)',
                border: '1px solid rgba(99, 102, 241, 0.2)',
                borderRadius: '14px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: '#24292f',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    flexShrink: 0
                  }}>
                    <FaGithub />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-main, #0f172a)' }}>
                      Connect via SEED-IT Website Profile
                    </h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--text-muted, #64748b)', lineHeight: '1.45' }}>
                      To sync solutions, link your GitHub account on the website, then sync it directly into this app:
                    </p>
                  </div>
                </div>

                <div style={{
                  background: 'rgba(255, 255, 255, 0.7)',
                  border: '1px dashed rgba(99, 102, 241, 0.3)',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  fontSize: '12.5px',
                  color: 'var(--text-secondary, #334155)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>1</span>
                    <span>Go to <strong>SEED-IT Website → Profile → GitHub Sync</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>2</span>
                    <span>Link your GitHub account &amp; repository there</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>3</span>
                    <span>Click <strong>Sync Here</strong> below to activate and link this workspace</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="ghm-save-btn"
                  onClick={handleSyncFromCloud}
                  disabled={isSyncingFromCloud}
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    padding: '12px 20px',
                    fontSize: '14px',
                    background: '#6366f1',
                    color: '#ffffff',
                    fontWeight: 700,
                    borderRadius: '10px',
                    border: 'none',
                    cursor: isSyncingFromCloud ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
                    transition: 'all 0.2s'
                  }}
                >
                  <FaSyncAlt style={{ animation: isSyncingFromCloud ? 'spin 1s linear infinite' : 'none' }} />
                  {isSyncingFromCloud ? 'Checking Website Profile...' : 'Sync Here (Fetch from Website Profile)'}
                </button>
              </div>

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '4px 0' }}>
                <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                  OR CONNECT WITH PERSONAL ACCESS TOKEN
                </span>
                <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
              </div>

              {/* Method 2: Manual Personal Access Token (PAT) Input */}
              <div className="ghm-form-group">
                <label className="ghm-label">
                  <span>Personal Access Token (PAT)</span>
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo&description=SEED-IT%20Solutions%20Sync"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ghm-guide-link"
                    style={{ fontSize: '11.5px' }}
                  >
                    Generate Token (repo scope) <FaExternalLinkAlt style={{ fontSize: '9px' }} />
                  </a>
                </label>
                <div className="ghm-input-wrap">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="ghm-input"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="ghm-input-action"
                    onClick={() => setShowToken(!showToken)}
                    title={showToken ? 'Hide token' : 'Show token'}
                  >
                    {showToken ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
                <div className="ghm-input-hint">
                  Saved privately to <code>users/{user?.uid || 'uid'}/settings/githubSync</code>.
                </div>
              </div>

              {/* Target Repository */}
              <div className="ghm-form-group">
                <label className="ghm-label">Target Repository Name</label>
                <div className="ghm-input-wrap">
                  <input
                    type="text"
                    value={repoInput}
                    onChange={(e) => setRepoInput(e.target.value)}
                    placeholder="seed-it-solutions"
                    className="ghm-input"
                  />
                </div>
                <div className="ghm-input-hint">
                  If this repository does not exist, SEED-IT will create it automatically.
                </div>
              </div>

              {/* Repository Visibility */}
              <div className="ghm-form-group">
                <label className="ghm-label">Repository Visibility</label>
                <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="repoVisibility"
                      checked={!isPrivateInput}
                      onChange={() => setIsPrivateInput(false)}
                    />
                    <FaGlobe style={{ color: '#10b981' }} /> Public (Recommended for portfolio)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="repoVisibility"
                      checked={isPrivateInput}
                      onChange={() => setIsPrivateInput(true)}
                    />
                    <FaLock style={{ color: '#64748b' }} /> Private
                  </label>
                </div>
              </div>

              {/* Auto Sync Toggle */}
              <div
                className="ghm-switch-row"
                onClick={() => setAutoSyncInput(!autoSyncInput)}
              >
                <div className="ghm-switch-info">
                  <span className="ghm-switch-title">Auto-Sync upon 100% Pass</span>
                  <span className="ghm-switch-desc">
                    Commit to GitHub automatically when all test cases pass.
                  </span>
                </div>
                <div className={`ghm-toggle ${autoSyncInput ? 'active' : ''}`}>
                  <div className="ghm-toggle-thumb" />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                <button
                  type="button"
                  className="ghm-save-btn"
                  onClick={handleConnectWithPAT}
                  disabled={isVerifying || !tokenInput.trim()}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {isVerifying ? (
                    <>
                      <div className="ghm-spinner" /> Connecting via PAT...
                    </>
                  ) : (
                    <>
                      <FaKey /> Connect with Personal Access Token
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="ghm-footer">
          {config.isConnected ? (
            <>
              <button
                type="button"
                className="ghm-disconnect-btn"
                onClick={handleDisconnect}
              >
                Disconnect Account
              </button>
              <div className="ghm-footer-right">
                <button type="button" className="ghm-cancel-btn" onClick={onClose}>
                  Close
                </button>
                <button
                  type="button"
                  className="ghm-save-btn"
                  onClick={handleSaveSettings}
                >
                  Save Settings
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <FaInfoCircle /> Private in Firestore
              </div>
              <div className="ghm-footer-right">
                <button type="button" className="ghm-cancel-btn" onClick={onClose}>
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
