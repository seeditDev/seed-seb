import React from 'react';
import { FaBookOpen, FaLightbulb, FaCheck } from 'react-icons/fa';

const NotesActivity = ({ topic, onCheckpointComplete }) => {
  const notesActivity = topic?.activities?.find(a => a.type === 'NOTES');

  const content = notesActivity?.content;
  const sections = notesActivity?.sections || [];
  const complexityTable = notesActivity?.complexityTable || notesActivity?.complexities || [];
  const bestPractices = notesActivity?.bestPractices || notesActivity?.tips || [];

  return (
    <div className="notes-activity-container">
      <div className="activity-section-header">
        <div className="section-title-row">
          <FaBookOpen className="section-icon" />
          <h3>{notesActivity?.title || `${topic?.title || 'Lesson'} — Study Notes`}</h3>
        </div>
        <p className="section-subtitle">Read carefully to understand the underlying theory and algorithmic complexity.</p>
      </div>

      <div className="notes-card">
        {notesActivity ? (
          <div className="notes-markdown-body">
            {/* 1. Overview or Content String */}
            {typeof content === 'string' && content.trim() && (
              <div className="notes-overview-block">
                <h4>1. Core Concept Overview</h4>
                <div style={{ whiteSpace: 'pre-line', lineHeight: '1.7', color: '#cbd5e1' }}>
                  {content}
                </div>
              </div>
            )}

            {/* Structured Sections */}
            {sections.map((sec, idx) => (
              <div key={idx} className="notes-section-block" style={{ marginTop: '1.5rem' }}>
                <h4>{sec.heading || `Section ${idx + 1}`}</h4>
                <div style={{ whiteSpace: 'pre-line', lineHeight: '1.7', color: '#cbd5e1' }}>
                  {sec.body}
                </div>
                {sec.tip && (
                  <div className="notes-highlight-box" style={{ marginTop: '0.75rem' }}>
                    <FaLightbulb className="notes-tip-icon" />
                    <div>
                      <strong>Important Key Note:</strong>
                      <p style={{ margin: '0.25rem 0 0 0' }}>{sec.tip}</p>
                    </div>
                  </div>
                )}
                {sec.code && (
                  <pre className="practice-example-box" style={{ marginTop: '0.75rem' }}>
                    <code>{sec.code}</code>
                  </pre>
                )}
              </div>
            ))}

            {/* Complexity Table */}
            {complexityTable.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <h4>2. Time & Space Complexity Summary</h4>
                <table className="notes-complexity-table">
                  <thead>
                    <tr>
                      <th>Operation / Scenario</th>
                      <th>Best Case</th>
                      <th>Average Case</th>
                      <th>Worst Case</th>
                    </tr>
                  </thead>
                  <tbody>
                    {complexityTable.map((row, rIdx) => (
                      <tr key={rIdx}>
                        <td>{row.operation || row.name || row.scenario}</td>
                        <td><code>{row.best || row.bestCase || 'O(1)'}</code></td>
                        <td><code>{row.average || row.averageCase || 'O(N)'}</code></td>
                        <td><code>{row.worst || row.worstCase || 'O(N)'}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Best Practices & Checklist */}
            {bestPractices.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <h4>3. Key Takeaways & Best Practices</h4>
                <ul className="notes-checklist">
                  {bestPractices.map((tip, tIdx) => (
                    <li key={tIdx}>
                      <FaCheck className="check-bullet" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!content && sections.length === 0 && complexityTable.length === 0 && bestPractices.length === 0 && (
              <p className="no-content-notice">Study notes are being compiled for this lesson.</p>
            )}
          </div>
        ) : (
          <p className="no-content-notice">Notes are being compiled for this lesson.</p>
        )}
      </div>
    </div>
  );
};

export default NotesActivity;
