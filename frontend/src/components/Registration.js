import React, { useState, useRef, useEffect } from "react";
import "../styles/Registration.css"; // Import CSS
import { APP_VERSION } from "../App";
import { COLLEGES as COLLEGES_OBJECT } from "../config/constants";

// Transform COLLEGES object from constants.js into the array format needed for registration
const COLLEGES = Object.entries(COLLEGES_OBJECT).map(([id, name]) => ({
  id,
  name
}));

function Registration() {
  const [formData, setFormData] = useState({
    name: "",
    rollNumber: "",
    email: "",
    college: "",
    department: "",
    year: "",
    hackerrankEmail: "",
    hackerrankID: "",
  });

  const [isRegistering, setIsRegistering] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [confirmRollNumber, setConfirmRollNumber] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitStatus, setSubmitStatus] = useState({ loading: false, error: null });
  const [collegeSearch, setCollegeSearch] = useState("");
  const [showCollegeDropdown, setShowCollegeDropdown] = useState(false);
  const collegeDropdownRef = useRef(null);

  // Filter colleges based on search input
  const filteredColleges = COLLEGES.filter(college =>
    college.name.toLowerCase().includes(collegeSearch.toLowerCase())
  );

  // Handle click outside college dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (collegeDropdownRef.current && !collegeDropdownRef.current.contains(event.target)) {
        setShowCollegeDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Convert name input to uppercase automatically and handle special cases
  const handleChange = (e) => {
    const { name, value } = e.target;
    let newValue = value;

    // Handle different input types
    if (name === "name" || name === "rollNumber") {
      newValue = value.toUpperCase();
    } else if (name === "email" || name === "hackerrankEmail") {
      newValue = value.toLowerCase();
    } else if (name === "hackerrankID") {
      // Prevent typing '@' at the start of username
      if (value.startsWith('@')) {
        newValue = value.substring(1);
      }
    }

    setFormData(prev => ({
      ...prev,
      [name]: newValue
    }));

    // Validate on change if field was touched
    if (touched[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: validateField(name, newValue)
      }));
    }
  };

  // Handle college search input
  const handleCollegeSearch = (e) => {
    setCollegeSearch(e.target.value);
    setShowCollegeDropdown(true);
  };

  // Handle college selection
  const handleCollegeSelect = (college) => {
    setFormData(prev => ({
      ...prev,
      college: college.id
    }));
    setCollegeSearch(college.name);
    setShowCollegeDropdown(false);
    setTouched(prev => ({
      ...prev,
      college: true
    }));
  };

  // Add onBlur handler
  const handleBlur = (e) => {
    const { name, value } = e.target;
    setTouched(prev => ({
      ...prev,
      [name]: true
    }));
    setErrors(prev => ({
      ...prev,
      [name]: validateField(name, value)
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Validate all fields first
    const formErrors = {};
    Object.keys(formData).forEach(field => {
      const error = validateField(field, formData[field]);
      if (error) formErrors[field] = error;
    });

    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      setTouched(Object.keys(formData).reduce((acc, field) => ({ ...acc, [field]: true }), {}));
      return;
    }

    // Instead of registering, go to review step
    setIsReviewing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFinalSubmit = async () => {
    // Final validation: check if confirmRollNumber matches formData.rollNumber
    if (confirmRollNumber.toUpperCase() !== formData.rollNumber.toUpperCase()) {
      setConfirmError("Roll number does not match. Please re-check.");
      return;
    }

    setConfirmError("");
    setSubmitStatus({ loading: true, error: null });
    setIsReviewing(false);
    setIsRegistering(true);

    try {
      // Generate random delay between 4000ms (4s) and 9000ms (9s)
      const randomDelay = Math.floor(Math.random() * (9000 - 4000 + 1)) + 4000;

      // First delay
      await new Promise(resolve => setTimeout(resolve, randomDelay / 2));

      // Send the request
      const response = await fetch("https://script.google.com/macros/s/AKfycbx7ehG0Kpz2Aq5WIjnC5HSuZHBD_oPgfzlro-xSwi-PDPjdJBnHgJExsYzV4NS8bJsk/exec", {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      // Second delay to complete the random timing
      await new Promise(resolve => setTimeout(resolve, randomDelay / 2));

      setIsRegistered(true);
      setSubmitStatus({ loading: false, error: null });

      // Reset form
      setFormData({
        name: "",
        rollNumber: "",
        email: "",
        college: "",
        department: "",
        year: "",
        hackerrankEmail: "",
        hackerrankID: "",
      });
      setErrors({});
      setTouched({});
      setConfirmRollNumber("");

    } catch (error) {
      console.error("Error:", error);
      setSubmitStatus({
        loading: false,
        error: "Registration failed. Please try again."
      });
      setIsReviewing(true); // Go back to review on error
    } finally {
      setIsRegistering(false);
    }
  };

  // Update validation function
  const validateField = (name, value) => {
    switch (name) {
      case 'name':
        return !value.trim() ? 'Name is required' :
          !/^[A-Z\s]+$/.test(value) ? 'Use only uppercase letters and spaces' : '';
      case 'email':
        return !value.trim() ? 'Email is required' :
          !/^\S+@\S+\.\S+$/.test(value) ? 'Invalid email format' : '';
      case 'hackerrankEmail':
        if (!value.trim()) return 'HackerRank email is required';
        if (!/^\S+@\S+\.\S+$/.test(value)) return 'Invalid email format';
        return '';
      case 'hackerrankID':
        if (!value.trim()) return 'HackerRank ID is required';
        if (value.startsWith('@')) return 'Username cannot start with @';
        return '';
      case 'rollNumber':
        return !value.trim() ? 'Roll number is required' : '';
      default:
        return !value.trim() ? `${name} is required` : '';
    }
  };

  // Add this component
  const ProgressBar = () => {
    const steps = ['Personal Info', 'Academic Info', 'HackerRank Info'];
    const currentStep = 1; // You can make this dynamic

    return (
      <div className="progress-bar">
        {steps.map((step, index) => (
          <div key={index} className={`step ${index + 1 <= currentStep ? 'active' : ''}`}>
            <div className="step-number">{index + 1}</div>
            <div className="step-text">{step}</div>
          </div>
        ))}
      </div>
    );
  };

  // Add this new function to check if form is complete and valid
  const isFormValid = () => {
    // Check if all fields are filled
    const isComplete = Object.values(formData).every(value => value.trim() !== '');

    // Check if there are no errors
    const hasNoErrors = Object.values(errors).every(error => !error);

    return isComplete && hasNoErrors;
  };

  return (
    <div className="registration-page-wrapper">
      <div className="registration-card">
        {/* Header - Inspired by Semarchy/EmployeeForm */}
        <header className="registration-header-new">
          <div className="registration-avatar">
            <img
              src="https://raw.githubusercontent.com/seeditDev/SEED-Website/f3cee9002410a00df4da7bea636ac9fbc4c312ca/Plugins/SEED_Logo.webp"
              alt="SEED-IT Logo"
            />
          </div>
          <div className="registration-header-text">
            <h2>{formData.name || "New Student"}</h2>
            <div className={`registration-status-pill ${isReviewing ? 'review' : ''}`}>
              <span className="pill-dot"></span>
              {isReviewing ? "Registration — Reviewing" : "Registration — Creating"}
            </div>
          </div>
        </header>

        {!isRegistering && !isRegistered && !isReviewing && (
          <form onSubmit={handleSubmit} className="registration-form-new">
            <div className="form-body-grid">
              {/* Column 1: Personal Info */}
              <div className="form-column">
                <h3 className="section-title">Personal Information</h3>
                <div className="form-group-new">
                  <label>Full Name</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={errors.name && touched.name ? 'error' : ''}
                    placeholder="E.g., JOHN DOE"
                    required
                  />
                  {errors.name && touched.name && <span className="error-hint">{errors.name}</span>}
                </div>

                <div className="form-group-new">
                  <label>College Email Address</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={errors.email && touched.email ? 'error' : ''}
                    placeholder="Enter your email"
                    required
                  />
                  {errors.email && touched.email && <span className="error-hint">{errors.email}</span>}
                </div>

                <div className="form-group-new">
                  <label>Roll Number</label>
                  <input
                    type="text"
                    name="rollNumber"
                    value={formData.rollNumber}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={errors.rollNumber && touched.rollNumber ? 'error' : ''}
                    placeholder="Enter roll number (CAPS)"
                    required
                  />
                  {errors.rollNumber && touched.rollNumber && <span className="error-hint">{errors.rollNumber}</span>}
                </div>
              </div>

              {/* Column 2: Academic Info */}
              <div className="form-column">
                <h3 className="section-title">Academic Details</h3>
                <div className="form-group-new" ref={collegeDropdownRef}>
                  <label>College Name</label>
                  <div className="college-search-wrapper">
                    <input
                      type="text"
                      value={collegeSearch}
                      onChange={handleCollegeSearch}
                      onFocus={() => setShowCollegeDropdown(true)}
                      placeholder="Type to search..."
                      className={errors.college && touched.college ? 'error' : ''}
                      required
                    />
                    {showCollegeDropdown && (
                      <div className="college-results-dropdown">
                        {filteredColleges.length > 0 ? (
                          filteredColleges.map(college => (
                            <div
                              key={college.id}
                              className="college-result-item"
                              onClick={() => handleCollegeSelect(college)}
                            >
                              {college.name}
                            </div>
                          ))
                        ) : (
                          <div className="no-college-results">No results found</div>
                        )}
                      </div>
                    )}
                  </div>
                  {errors.college && touched.college && <span className="error-hint">{errors.college}</span>}
                </div>

                <div className="form-group-new">
                  <label>Department</label>
                  <select
                    name="department"
                    value={formData.department}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={errors.department && touched.department ? 'error' : ''}
                    required
                  >
                    <option value="">Select Department</option>
                    <option value="CIVIL">Civil Engineering</option>
                    <option value="MECH">Mechanical Engineering</option>
                    <option value="EEE">Electrical and Electronics Engineering</option>
                    <option value="ECE">Electronics and Communication Engineering</option>
                    <option value="CSE">Computer Science and Engineering</option>
                    <option value="IT">Information Technology</option>
                    <option value="AIDS">Artificial Intelligence and Data Science</option>
                    <option value="AIML">Artificial Intelligence and Machine Learning</option>
                    <option value="CSBS">Computer Science and Business Systems</option>
                    <option value="CSD">Computer Science and Design</option>
                    <option value="BCA">Computer Applications</option>
                    <option value="MECHATRONICS">Mechatronics Engineering</option>
                    <option value="CYBER">Cyber Security</option>
                    <option value="IOT">Internet of Things</option>
                    <option value="CLOUD">Cloud Computing</option>
                    <option value="ETC">Electronics and Telecommunication</option>
                    <option value="BCOM_CA">B.Com Computer Applications</option>
                    <option value="BSC_CS">B.Sc Computer Science</option>
                    <option value="BCA">Bachelor of Computer Applications</option>
                  </select>
                  {errors.department && touched.department && <span className="error-hint">{errors.department}</span>}
                </div>

                <div className="form-group-new">
                  <label>Batch Year</label>
                  <select
                    name="year"
                    value={formData.year}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={errors.year && touched.year ? 'error' : ''}
                    required
                  >
                    <option value="">Select Year</option>
                    {["2K26", "2K27", "2K28", "2K29"].map(year => (
                      <option key={year} value={year}>{year.replace('2K', '20')}</option>
                    ))}
                  </select>
                  {errors.year && touched.year && <span className="error-hint">{errors.year}</span>}
                </div>
              </div>

              {/* Column 3: Platform Info */}
              <div className="form-column">
                <h3 className="section-title">HackerRank Info</h3>
                <div className="form-group-new">
                  <label>HackerRank Email</label>
                  <input
                    type="email"
                    name="hackerrankEmail"
                    value={formData.hackerrankEmail}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={errors.hackerrankEmail && touched.hackerrankEmail ? 'error' : ''}
                    placeholder="HackerRank registered email"
                    required
                  />
                  {errors.hackerrankEmail && touched.hackerrankEmail && <span className="error-hint">{errors.hackerrankEmail}</span>}
                </div>

                <div className="form-group-new">
                  <label>HackerRank ID (EG: @seedit exactly. Fill without @)</label>
                  <input
                    type="text"
                    name="hackerrankID"
                    value={formData.hackerrankID}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={errors.hackerrankID && touched.hackerrankID ? 'error' : ''}
                    placeholder="e.g., john_doe"
                    required
                  />
                  <div className="hr-id-help-container">
                    <img src="/hackerrankid.png" alt="How to find HackerRank ID" className="hr-help-image" />
                  </div>
                  {errors.hackerrankID && touched.hackerrankID && <span className="error-hint">{errors.hackerrankID}</span>}
                </div>
              </div>
            </div>

            <footer className="registration-footer-new">
              <button
                type="submit"
                className={`submit-action-btn ${!isFormValid() ? 'disabled' : ''}`}
                disabled={!isFormValid()}
              >
                Continue to Review
              </button>
            </footer>
          </form>
        )}

        {isReviewing && (
          <div className="registration-review-section">
            <div className="review-alert">
              <span className="alert-icon">ℹ️</span>
              <p>Please review your details carefully. Your information will be sent for verification.</p>
            </div>

            <div className="review-grid">
              <div className="review-card-item">
                <span className="review-label">Full Name</span>
                <span className="review-value">{formData.name}</span>
              </div>
              <div className="review-card-item">
                <span className="review-label">Email</span>
                <span className="review-value">{formData.email}</span>
              </div>
              <div className="review-card-item">
                <span className="review-label">Roll Number</span>
                <span className="review-value">{formData.rollNumber}</span>
              </div>
              <div className="review-card-item">
                <span className="review-label">College</span>
                <span className="review-value">{COLLEGES.find(c => c.id === formData.college)?.name || formData.college}</span>
              </div>
              <div className="review-card-item">
                <span className="review-label">Department</span>
                <span className="review-value">{formData.department}</span>
              </div>
              <div className="review-card-item">
                <span className="review-label">Batch Year</span>
                <span className="review-value">{formData.year.replace('2K', '20')}</span>
              </div>
              <div className="review-card-item">
                <span className="review-label">HackerRank Email</span>
                <span className="review-value">{formData.hackerrankEmail}</span>
              </div>
              <div className="review-card-item">
                <span className="review-label">HackerRank ID</span>
                <span className="review-value">{formData.hackerrankID}</span>
              </div>
            </div>

            <div className="review-confirmation-box">
              <label>To confirm, please re-type your <strong>Roll Number</strong> below:</label>
              <input
                type="text"
                value={confirmRollNumber}
                onChange={(e) => {
                  setConfirmRollNumber(e.target.value.toUpperCase());
                  setConfirmError("");
                }}
                placeholder="Type Roll Number again"
                className={confirmError ? 'error' : ''}
              />
              {confirmError && <span className="error-hint">{confirmError}</span>}
            </div>

            <footer className="registration-footer-new">

              <button className="back-btn" onClick={() => setIsReviewing(false)}>Back to Edit</button>
              <button
                className={`submit-action-btn ${!confirmRollNumber || confirmRollNumber !== formData.rollNumber ? 'disabled' : ''}`}
                onClick={handleFinalSubmit}
                disabled={!confirmRollNumber || confirmRollNumber !== formData.rollNumber}
              >
                Confirm & Register
              </button>
              {/* Registration Closed...!!!. Reach out to the Coordinators for any queries. */}
            </footer>

          </div>
        )}

        {isRegistering && (
          <div className="loading-state-new">
            <div className="processing-spinner"></div>
            <h3>Finalizing Registration...</h3>
            <p>We're setting up your profile. This usually takes a few seconds.</p>
            {submitStatus.error && (
              <div className="error-box-new">
                <p>{submitStatus.error}</p>
                <button
                  className="retry-action-btn"
                  onClick={() => setSubmitStatus({ loading: false, error: null })}
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        )}

        {isRegistered && (
          <div className="success-state-new">
            <div className="success-icon-wrapper">
              <svg viewBox="0 0 24 24" className="checkmark-svg">
                <path d="M21 7L9 19L3.5 13.5L4.91 12.09L9 16.17L19.59 5.58L21 7Z" />
              </svg>
            </div>
            <h2>Registration Successful!</h2>
            <p>Welcome to the SEED-IT platform. You will receive a mail once your account is verified by admin.</p>
            <div className="success-actions">
              <button className="primary-succ-btn" onClick={() => window.location.href = '/login'}>Login Now</button>
              <button className="secondary-succ-btn" onClick={() => setIsRegistered(false)}>Register Another</button>
            </div>
          </div>
        )}

        <div className="registration-card-footer">
          <p>© 2023-2025 SEED-IT. All rights Reserved. <span className="ver-text">v{APP_VERSION}</span></p>
        </div>
      </div>
    </div>
  );
}

export default Registration;

