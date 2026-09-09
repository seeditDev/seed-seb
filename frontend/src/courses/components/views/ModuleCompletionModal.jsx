import React, { useState } from 'react';
import { 
  FaTrophy, FaCheckCircle, FaStar, FaArrowRight, 
  FaAward, FaCoins, FaFire, FaTimes, FaListUl, FaChartLine, FaCheck 
} from 'react-icons/fa';
import SeedCreditCoin from '../../../components/SeedCreditCoin';

const ModuleCompletionModal = ({ 
  module, 
  course, 
  onContinueNextModule, 
  onClose 
}) => {
  const [showSummary, setShowSummary] = useState(false);

  return (
    <div className="module-completion-overlay">
      <div className="module-completion-card">
        <button className="completion-close-btn" onClick={onClose}>
          <FaTimes />
        </button>

        {!showSummary ? (
          <>
            {/* Trophy & Header */}
            <div className="completion-trophy-box">
              <div className="trophy-glow-circle">
                <FaTrophy className="trophy-emoji" style={{ color: '#f59e0b', fontSize: '36px' }} />
              </div>
            </div>

            <h1 className="completion-heading">Module Completed!</h1>
            <h2 className="completion-module-name">{module?.title || 'Arrays'}</h2>
            <p className="completion-subtext">
              You've completed all lessons, interactive questions, practice problems, and successfully passed the mini assessment.
            </p>

            {/* Statistics Cards Row Matching Screen 9 */}
            <div className="completion-stats-grid">
              <div className="stat-card">
                <div className="stat-icon-wrap blue">
                  <FaCheckCircle />
                </div>
                <div className="stat-value">6</div>
                <div className="stat-label">Lessons Completed</div>
              </div>

              <div className="stat-card">
                <div className="stat-icon-wrap green">
                  <FaAward />
                </div>
                <div className="stat-value">12</div>
                <div className="stat-label">Practice Questions</div>
              </div>

              <div className="stat-card">
                <div className="stat-icon-wrap purple">
                  <FaChartLine />
                </div>
                <div className="stat-value">82%</div>
                <div className="stat-label">Assessment Score</div>
              </div>

              <div className="stat-card">
                <div className="stat-icon-wrap gold">
                  <SeedCreditCoin size={22} />
                </div>
                <div className="stat-value">+10</div>
                <div className="stat-label">Credits Minted</div>
                <span className="xp-bonus-badge">+50 XP</span>
              </div>
            </div>

            {/* Actions Row */}
            <div className="completion-actions-row">
              <button 
                className="completion-continue-btn"
                onClick={onContinueNextModule}
              >
                <span>Continue to Next Module</span>
                <FaArrowRight />
              </button>

              <button 
                className="completion-summary-btn"
                onClick={() => setShowSummary(true)}
              >
                <FaListUl />
                <span>View Module Summary</span>
              </button>
            </div>
          </>
        ) : (
          /* Submodule 15: Module Summary & Performance Breakdown */
          <div className="module-summary-view">
            <h2 className="summary-title">{module?.title || 'Arrays'} — Module Summary</h2>

            <div className="summary-section">
              <h4>What You Learned</h4>
              <ul className="summary-bullet-list">
                <li><FaCheck style={{ color: '#10b981', marginRight: '6px' }} /> Array Declaration &amp; Zero-Indexing Rules</li>
                <li><FaCheck style={{ color: '#10b981', marginRight: '6px' }} /> Contiguous Memory Allocation &amp; Address Calculation ($B + i \times S$)</li>
                <li><FaCheck style={{ color: '#10b981', marginRight: '6px' }} /> Time Complexity Bounds: $O(1)$ Direct Access vs $O(N)$ Traversal</li>
                <li><FaCheck style={{ color: '#10b981', marginRight: '6px' }} /> Two-Pointer Technique &amp; In-Place Swapping</li>
                <li><FaCheck style={{ color: '#10b981', marginRight: '6px' }} /> Boundary Exception Handling &amp; Memory Safety</li>
              </ul>
            </div>

            <div className="summary-performance-metrics">
              <div className="metric-pill"><strong>Lessons:</strong> 6 / 6 (100%)</div>
              <div className="metric-pill"><strong>Interactions:</strong> 5 / 5 (100%)</div>
              <div className="metric-pill"><strong>Practice:</strong> 12 / 12 (100%)</div>
              <div className="metric-pill highlight"><strong>Assessment:</strong> 82% (Passed)</div>
            </div>

            <div className="summary-section weak-areas">
              <h4>Identified Focus Areas</h4>
              <p>Consider reviewing <strong>Array Rotation Algorithms</strong> and <strong>Prefix Sum Lookups</strong> for optimal interview performance.</p>
            </div>

            <div className="completion-actions-row" style={{ marginTop: '20px' }}>
              <button 
                className="completion-continue-btn"
                onClick={onContinueNextModule}
              >
                <span>Continue to Next Module</span>
                <FaArrowRight />
              </button>

              <button 
                className="completion-summary-btn"
                onClick={() => setShowSummary(false)}
              >
                <span>Back to Overview</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ModuleCompletionModal;
