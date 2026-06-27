import React from 'react';
import { FaExclamationTriangle } from 'react-icons/fa';
import '../styles/ViolationCounter.css';

const MAX_VIOLATIONS = 5;

const ViolationCounter = ({ count = 0 }) => {
  const getSeverityClass = () => {
    if (count === 0) return 'safe';
    if (count < 2) return 'low';
    if (count < 4) return 'medium';
    if (count < MAX_VIOLATIONS) return 'high';
    return 'critical';
  };

  const getMessage = () => {
    if (count === 0) return 'No violations';
    if (count === 1) return 'Violation detected';
    if (count < 4) return 'Multiple violations';
    if (count < MAX_VIOLATIONS) return '⚠️ Warning: Auto-submit imminent';
    return 'Exam auto-submitted due to violations';
  };

  const remaining = Math.max(MAX_VIOLATIONS - count, 0);

  return (
    <div className={`violation-counter ${getSeverityClass()}`}>
      <div className="violation-icon">
        <FaExclamationTriangle />
      </div>
      <div className="violation-content">
        <div className="violation-count">
          Violations: <strong>{Math.min(count, MAX_VIOLATIONS)}</strong> / {MAX_VIOLATIONS}
        </div>
        <div className="violation-message">
          {getMessage()}
        </div>
      </div>
      {count > 0 && remaining > 0 && remaining <= 2 && (
        <div className="violation-warning">
          ⚠️ {remaining} more violation{remaining > 1 ? 's' : ''} will auto-submit your exam
        </div>
      )}
    </div>
  );
};

export default ViolationCounter;

