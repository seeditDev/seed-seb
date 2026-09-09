import React, { useState } from 'react';
import { 
  FaFilePdf, FaExternalLinkAlt, FaDownload, FaBookOpen, 
  FaArrowLeft, FaFolder, FaLightbulb, FaCheckCircle 
} from 'react-icons/fa';

const ALL_RESOURCES = [
  {
    id: 'res-1',
    category: 'notes',
    title: 'Arrays — Lecture Notes',
    type: 'PDF',
    size: '1.2 MB',
    url: '#',
    description: 'Complete theoretical foundations, memory layouts, and address formulas.'
  },
  {
    id: 'res-2',
    category: 'cheat-sheets',
    title: 'Quick Revision Sheet',
    type: 'PDF',
    size: '450 KB',
    url: '#',
    description: '1-page summary of array operations, time complexities, and edge cases.'
  },
  {
    id: 'res-3',
    category: 'cheat-sheets',
    title: 'Important Formulas & Index Math',
    type: 'PDF',
    size: '320 KB',
    url: '#',
    description: '1D and 2D row-major / column-major memory address formulas.'
  },
  {
    id: 'res-4',
    category: 'notes',
    title: 'Common Traversal Mistakes',
    type: 'PDF',
    size: '280 KB',
    url: '#',
    description: 'Off-by-one errors, out of bounds segmentation faults, and solutions.'
  },
  {
    id: 'res-5',
    category: 'links',
    title: 'Visual Guide to Array Memory',
    type: 'LINK',
    size: 'Interactive Visualizer',
    url: 'https://visualgo.net',
    description: 'Interactive stepping through contiguous RAM storage and pointer arithmetic.'
  },
  {
    id: 'res-6',
    category: 'downloads',
    title: 'Starter Code Templates (C++, Java, Python)',
    type: 'ZIP',
    size: '2.4 MB',
    url: '#',
    description: 'Clean project templates with pre-configured unit tests and run scripts.'
  }
];

const CourseResourcesView = ({ topic, onBack }) => {
  const [selectedTab, setSelectedTab] = useState('all'); // 'all' | 'notes' | 'cheat-sheets' | 'links' | 'downloads'

  const filteredResources = ALL_RESOURCES.filter(r => {
    if (selectedTab === 'all') return true;
    return r.category === selectedTab;
  });

  return (
    <div className="resources-fullscreen-workspace">
      {/* Top Header */}
      <div className="resources-top-bar">
        <div className="resources-top-left">
          <button className="resources-back-btn" onClick={onBack}>
            <FaArrowLeft />
            <span>Back to Topic</span>
          </button>
          <div className="resources-crumbs">
            <span>Courses</span> &gt; <span>DSA</span> &gt; <span>Arrays</span> &gt; <span className="current">Resources</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs matching mockup */}
      <div className="resources-tabs-bar">
        <button 
          className={`res-tab-btn ${selectedTab === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedTab('all')}
        >
          All
        </button>
        <button 
          className={`res-tab-btn ${selectedTab === 'notes' ? 'active' : ''}`}
          onClick={() => setSelectedTab('notes')}
        >
          Notes
        </button>
        <button 
          className={`res-tab-btn ${selectedTab === 'cheat-sheets' ? 'active' : ''}`}
          onClick={() => setSelectedTab('cheat-sheets')}
        >
          Cheat Sheets
        </button>
        <button 
          className={`res-tab-btn ${selectedTab === 'links' ? 'active' : ''}`}
          onClick={() => setSelectedTab('links')}
        >
          Links
        </button>
        <button 
          className={`res-tab-btn ${selectedTab === 'downloads' ? 'active' : ''}`}
          onClick={() => setSelectedTab('downloads')}
        >
          Downloads
        </button>
      </div>

      {/* Main Grid matching screen 8 */}
      <div className="resources-content-grid">
        {/* Left List of Resources */}
        <div className="resources-list-col">
          {filteredResources.map((res) => (
            <div key={res.id} className="resource-item-row-card">
              <div className="resource-row-left">
                <div className={`resource-icon-badge ${res.type.toLowerCase()}`}>
                  {res.type === 'LINK' ? <FaExternalLinkAlt /> : <FaFilePdf />}
                </div>
                <div className="resource-meta-text">
                  <h4 className="resource-item-title">{res.title}</h4>
                  <span className="resource-size-label">{res.type} • {res.size}</span>
                  <p className="resource-item-sub">{res.description}</p>
                </div>
              </div>

              <div className="resource-row-right">
                {res.type === 'LINK' ? (
                  <a 
                    href={res.url} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="resource-download-btn link"
                  >
                    <span>Open Link</span>
                    <FaExternalLinkAlt />
                  </a>
                ) : (
                  <button 
                    className="resource-download-btn"
                    onClick={() => alert(`Downloading ${res.title}...`)}
                  >
                    <FaDownload />
                    <span>Download</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Right Callout Card matching mockup */}
        <div className="resources-sidebar-col">
          <div className="additional-resources-card">
            <div className="add-res-icon-box">
              <FaFolder />
            </div>
            <h4 className="add-res-title">Additional Resources</h4>
            <p className="add-res-desc">
              Explore more curated lecture slides, problem sets, and external references to deepen your conceptual understanding.
            </p>
            <button 
              className="add-res-btn"
              onClick={() => setSelectedTab('all')}
            >
              Browse All Resources &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CourseResourcesView;
