import React from 'react';
import { FaCertificate, FaDownload, FaPrint, FaTimes, FaShieldAlt, FaAward, FaStar } from 'react-icons/fa';

const CourseCertificateModal = ({ 
  course, 
  user, 
  onClose 
}) => {
  const studentName = user?.name || 'Ambika';
  const certId = `SEED-DSA-${new Date().getFullYear()}-09842`;
  const completionDate = 'September 2026';

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="certificate-modal-overlay" onClick={onClose}>
      <div className="certificate-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="certificate-top-actions">
          <div className="cert-actions-left">
            <button className="cert-action-btn" onClick={handlePrint}>
              <FaPrint />
              <span>Print</span>
            </button>
            <button className="cert-action-btn download" onClick={() => alert('Certificate downloaded as PDF')}>
              <FaDownload />
              <span>Download PDF</span>
            </button>
          </div>
          <button className="cert-close-btn" onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        {/* Certificate Paper Canvas */}
        <div className="certificate-canvas-paper">
          <div className="certificate-inner-border">
            {/* Corner Decorative Ornaments */}
            <div className="cert-corner top-left"><FaStar style={{ fontSize: '10px' }} /></div>
            <div className="cert-corner top-right"><FaStar style={{ fontSize: '10px' }} /></div>
            <div className="cert-corner bottom-left"><FaStar style={{ fontSize: '10px' }} /></div>
            <div className="cert-corner bottom-right"><FaStar style={{ fontSize: '10px' }} /></div>

            {/* SEED Brand Header */}
            <div className="cert-brand-row">
              <img src="/SEED_Logo_Transparent.png" alt="SEED Logo" className="cert-seed-logo" />
              <div className="cert-brand-title">SEED-IT ACADEMY</div>
            </div>

            <h1 className="cert-main-heading">CERTIFICATE OF COMPLETION</h1>
            <p className="cert-sub-statement">This is to officially certify that</p>

            <h2 className="cert-recipient-name">{studentName.toUpperCase()}</h2>

            <p className="cert-description">
              has successfully fulfilled all rigorous curriculum milestones, interactive classes, hands-on programming projects, and assessments in
            </p>

            <h3 className="cert-course-name">{course?.title || 'Data Structures & Algorithms Mastery'}</h3>

            <div className="cert-meta-details-row">
              <div className="cert-meta-col">
                <span className="cert-meta-label">COMPLETED</span>
                <span className="cert-meta-val">{completionDate}</span>
              </div>

              <div className="cert-seal-col">
                <div className="cert-golden-seal">
                  <FaAward className="seal-star-icon" />
                  <span className="seal-text">VERIFIED</span>
                </div>
              </div>

              <div className="cert-meta-col">
                <span className="cert-meta-label">CERTIFICATE ID</span>
                <span className="cert-meta-val">{certId}</span>
              </div>
            </div>

            <div className="cert-footer-auth-row">
              <div className="auth-signature">
                <div className="sig-line" />
                <span className="sig-title">Academic Director, SEED-IT</span>
              </div>
              <div className="auth-seal-badge">
                <FaShieldAlt className="shield-icon" />
                <span>Verified Cryptographic Credential</span>
              </div>
              <div className="auth-signature">
                <div className="sig-line" />
                <span className="sig-title">Program Lead Instructor</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CourseCertificateModal;
