import React from 'react';
import { FaFilePdf, FaExternalLinkAlt, FaFolderOpen, FaDownload } from 'react-icons/fa';

const ResourcesActivity = ({ topic }) => {
  const resourceActivity = topic?.activities?.find(a => a.type === 'RESOURCE');
  const items = resourceActivity?.items || [
    { title: 'Array Data Structure Complexity Cheat Sheet (PDF)', type: 'PDF', size: '1.2 MB' },
    { title: 'Interactive Contiguous Memory Allocation Visualizer', type: 'LINK', url: 'https://visualgo.net/en/array' },
    { title: 'SEED-IT Curated Arrays Practice Problem Set', type: 'PRACTICE', size: '25 Problems' },
    { title: 'Standard Algorithm Template Code Library', type: 'CODE', size: 'GitHub' }
  ];

  return (
    <div className="resources-activity-container">
      <div className="activity-section-header">
        <div className="section-title-row">
          <FaFolderOpen className="section-icon" />
          <h3>Lesson Resources & Study Material</h3>
        </div>
        <p className="section-subtitle">Download reference summaries and explore curated external tools.</p>
      </div>

      <div className="resources-list-grid">
        {items.map((item, idx) => (
          <div key={idx} className="resource-item-card">
            <div className="resource-item-icon-col">
              {item.type === 'PDF' ? <FaFilePdf className="pdf-icon" /> : <FaExternalLinkAlt className="link-icon" />}
            </div>
            <div className="resource-item-info">
              <span className="resource-title">{item.title}</span>
              <span className="resource-meta">{item.type} • {item.size || 'External Guide'}</span>
            </div>
            <button className="resource-download-btn" onClick={() => window.open(item.url || '#', '_blank')}>
              <FaDownload />
              <span>Access</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ResourcesActivity;
