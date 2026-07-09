import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaCheckCircle, FaUser, FaLock, FaEye, FaEyeSlash, FaBook, FaTrophy, FaChartBar, FaQuoteLeft, FaShieldAlt, FaArrowRight, FaGoogle, FaMicrosoft, FaGlobe, FaLaptop } from "react-icons/fa";
import DataService from "../services/dataService";
import TrackingService from "../services/trackingService";
import { COLLEGES, ACADEMIC_YEARS } from "../config/constants";
import desktopBridge from "../utils/desktopBridge";

const DASHBOARD_PATHS = {
  student: "/student/dashboard",
  staff: "/staff/dashboard"
};

const Login = () => {
  const [role, setRole] = useState("student");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [college, setCollege] = useState("");
  const [year, setYear] = useState("");
  const [error, setError] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredColleges, setFilteredColleges] = useState([]);
  const [yearSearchTerm, setYearSearchTerm] = useState("");
  const [showYearDropdown, setShowYearDropdown] = useState(false);
  const [filteredYears, setFilteredYears] = useState(Object.entries(ACADEMIC_YEARS));
  const navigate = useNavigate();

  const [currentTheme, setCurrentTheme] = useState(() => {
    // Default to 'Classic Ice (light)' if no preference saved yet
    return localStorage.getItem('portal_theme') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
  }, [currentTheme]);


  useEffect(() => {
    const savedUser = JSON.parse(localStorage.getItem("rememberedUser"));
    if (savedUser) {
      setUsername(savedUser.username);
      setPassword(savedUser.password);
      setRole(savedUser.role);
      if (savedUser.role === 'student') {
        setCollege(savedUser.college);
        if (savedUser.college) {
          setSearchTerm(COLLEGES[savedUser.college]);
        }
        setYear(savedUser.year);
        if (savedUser.year) {
          setYearSearchTerm(ACADEMIC_YEARS[savedUser.year]);
        }
      }
      setRememberMe(true);
    }

    // Initialize filtered colleges and years
    setFilteredColleges(Object.entries(COLLEGES));
    setFilteredYears(Object.entries(ACADEMIC_YEARS));
  }, []);

  const handleSearch = (e) => {
    const term = e.target.value;
    setSearchTerm(term);
    setShowDropdown(true);
    setFilteredColleges(filterColleges(term));
  };

  const handleCollegeSelect = (key) => {
    setCollege(key);
    setSearchTerm(COLLEGES[key]);
    setShowDropdown(false);
  };

  const filterColleges = (term) => {
    term = (term || searchTerm).trim().toLowerCase();
    if (term === "") {
      return Object.entries(COLLEGES);
    }

    return Object.entries(COLLEGES).filter(([key, name]) =>
      name.toLowerCase().includes(term) ||
      key.toLowerCase().includes(term)
    );
  };

  const handleYearInputClick = () => {
    setShowYearDropdown(true);
    // If search is empty, show all years
    if (!yearSearchTerm.trim()) {
      setFilteredYears(Object.entries(ACADEMIC_YEARS));
    }
  };

  const handleYearInputFocus = () => {
    setShowYearDropdown(true);
    // If search is empty, show all years
    if (!yearSearchTerm.trim()) {
      setFilteredYears(Object.entries(ACADEMIC_YEARS));
    }
  };

  const handleYearSearch = (e) => {
    const term = e.target.value;
    setYearSearchTerm(term);
    setShowYearDropdown(true);
    setFilteredYears(filterYears(term));
  };

  const handleYearSelect = (key) => {
    setYear(key);
    setYearSearchTerm(ACADEMIC_YEARS[key]);
    setShowYearDropdown(false);
  };

  const filterYears = (term) => {
    term = term.trim().toLowerCase();
    if (term === "") {
      return Object.entries(ACADEMIC_YEARS);
    }
    return Object.entries(ACADEMIC_YEARS).filter(([key, name]) =>
      name.toLowerCase().includes(term) ||
      key.toLowerCase().includes(term)
    );
  };

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!username || !password) {
      setError("Please fill in username and password");
      return;
    }

    if (role === 'student') {
      if (!college) {
        if (searchTerm.trim()) {
          setError("Please select a college from the dropdown");
        } else {
          setError("Please select a college");
        }
        return;
      }
      if (!year) {
        setError("Please select your batch year");
        return;
      }
    }

    try {
      setLoading(true);
      const userData = await DataService.validateCredentials(username, password, role, college, year);

      if (userData) {
        // Clear all college_ prefixed caches from localStorage
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('college_')) {
            localStorage.removeItem(key);
          }
        });

        if (rememberMe) {
          localStorage.setItem(
            "rememberedUser",
            JSON.stringify({
              username,
              password,
              role,
              ...(role === 'student' && { college, year })
            })
          );
        }

        // Store only the authenticated user's profile data
        const authData = {
          Email: userData.Email,
          Name: userData.Name,
          Role: userData.Role,
          College: userData.College,
          Premium: userData.Premium !== undefined ? userData.Premium : (userData.premium !== undefined ? userData.premium : 0),
          ...(role === 'student' && {
            Department: userData.Department,
            Year: userData.Year,
            "Roll Number": userData["Roll Number"],
            "Hackerrank Mail": userData["Hackerrank Mail"],
            "Hackerrank ID": userData["Hackerrank ID"]
          })
        };

        localStorage.setItem("auth_data", JSON.stringify(authData));
        localStorage.setItem("role", role);

        // Sync PyQt session
        try {
          desktopBridge.setStudentSession(authData);
        } catch (e) {
          console.error("Failed to sync session with PyQt:", e);
        }

        // Start Live User Tracking
        try {
          await TrackingService.startTracking(authData);
        } catch (trackError) {
          console.error("Error starting tracking on login:", trackError);
        }

        setShowSuccess(true);

        setTimeout(() => {
          setShowSuccess(false);
          navigate(DASHBOARD_PATHS[role]);
        }, 2000);
      } else {
        setError("Invalid credentials");
      }
    } catch (error) {
      console.error("Login error:", error);
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const clearForm = () => {
    setUsername("");
    setPassword("");
    setError("");
    setShowSuccess(false);
  };

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    if (newRole === 'staff') {
      setCollege('');
    }
    clearForm();
  };

  const handleInputClick = () => {
    setShowDropdown(true);
    // If search is empty, show all colleges
    if (!searchTerm.trim()) {
      setFilteredColleges(Object.entries(COLLEGES));
    }
  };

  const handleInputFocus = () => {
    setShowDropdown(true);
    // If search is empty, show all colleges
    if (!searchTerm.trim()) {
      setFilteredColleges(Object.entries(COLLEGES));
    }
  };

  // Add event listeners for clicks outside the dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.search-container')) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Add click outside handler for year dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.year-search-container')) {
        setShowYearDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="login-page">
      {/* Perspective Grid Background Layer */}
      <div className="perspective-grid"></div>

      {/* Floating 3D Geometric shapes */}
      <div className="geometric-cube"></div>
      <div className="geometric-sphere"></div>
      
      {/* 3D trophy svg background */}
      <svg className="geometric-trophy" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
        <path d="M4 22h16" />
        <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34" />
        <path d="M12 2a6 6 0 0 1 6 6v5a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8a6 6 0 0 1 6-6Z" />
      </svg>

      {/* Floating 3D Programming Language Chips */}
      <div className="floating-chip chip-python">
        <span className="chip-logo" style={{ color: '#387eb8' }}>🐍</span>
        <span>Python</span>
      </div>
      <div className="floating-chip chip-java">
        <span className="chip-logo" style={{ color: '#e76f51' }}>☕</span>
        <span>Java</span>
      </div>
      <div className="floating-chip chip-cpp">
        <span className="chip-logo" style={{ color: '#00599c' }}>⚡</span>
        <span>C++</span>
      </div>
      <div className="floating-chip chip-rust">
        <span className="chip-logo" style={{ color: '#f4a261' }}>🦀</span>
        <span>Rust</span>
      </div>

      {/* Floating Company Logos */}
      <div className="floating-chip chip-google">
        <FaGoogle className="chip-logo" style={{ color: '#ea4335' }} />
        <span>Google</span>
      </div>
      <div className="floating-chip chip-microsoft">
        <FaMicrosoft className="chip-logo" style={{ color: '#00a4ef' }} />
        <span>Microsoft</span>
      </div>
      <div className="floating-chip chip-meta">
        <FaGlobe className="chip-logo" style={{ color: '#0668e1' }} />
        <span>Meta</span>
      </div>

      {/* Left panel: Info & Feature Cards */}
      <div className="background-section animate-fade-in">
        <div className="background-content">
          <div className="background-logo">
            SEED <span></span>
          </div>
          <span className="platform-pill">SEED-SEB Platform</span>
          <h2>Welcome back to <span className="gradient-text">SEED</span></h2>
          <p className="welcome-subtitle">Where every login brings you closer to your goals.</p>

          <div className="background-features">
            <div className="feature-item">
              <div className="feature-icon-wrapper icon-blue">
                <FaBook />
              </div>
              <div className="feature-text-block">
                <h3>Learn</h3>
                <p>Access curated resources and enhance your knowledge.</p>
              </div>
              <FaArrowRight className="feature-arrow" />
            </div>

            <div className="feature-item">
              <div className="feature-icon-wrapper icon-purple">
                <FaTrophy />
              </div>
              <div className="feature-text-block">
                <h3>Practice</h3>
                <p>Solve problems, test yourself and improve every day.</p>
              </div>
              <FaArrowRight className="feature-arrow" />
            </div>

            <div className="feature-item">
              <div className="feature-icon-wrapper icon-green">
                <FaChartBar />
              </div>
              <div className="feature-text-block">
                <h3>Assess</h3>
                <p>Take assessments, participate in contests and track progress.</p>
              </div>
              <FaArrowRight className="feature-arrow" />
            </div>
          </div>

          <div className="quote-card">
            <FaQuoteLeft className="quote-icon" />
            <p>Empower yourself with the tools, knowledge, and opportunities to succeed.</p>
          </div>

          <div className="security-badges">
            <FaShieldAlt className="badge-icon" />
            <span>Secure • Reliable • Trusted</span>
          </div>
          <p className="copyright-text">
            © 2026 SEED-SEB. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right panel: Glassmorphic form card */}
      <div className="form-section">
        <div className="login-glass-card animate-slide-up">
          {/* Avatar placeholder with Letter S */}
          <div className="avatar-wrapper">
            S
          </div>

          <h1>Welcome back!</h1>
          <p className="subtitle">Login to your account</p>

          <form onSubmit={handleLogin} className="login-form-wrapper">
            <div className="role-selection">
              <button
                type="button"
                className={role === "student" ? "role-btn selected" : "role-btn"}
                onClick={() => handleRoleChange("student")}
              >
                Student
              </button>
              <button
                type="button"
                className={role === "staff" ? "role-btn selected" : "role-btn"}
                onClick={() => handleRoleChange("staff")}
              >
                Staff
              </button>
            </div>

            {role === 'student' && (
              <>
                {/* College Search Autocomplete Input */}
                <div className="input-group animate-fade-in">
                  <div className="search-container login-search-wrapper" style={{ position: 'relative' }}>
                    <FaLaptop className="input-icon" />
                    <input
                      type="text"
                      className="login-search-box"
                      placeholder="Search college name"
                      value={searchTerm}
                      onChange={handleSearch}
                      onClick={handleInputClick}
                      onFocus={handleInputFocus}
                      required={role === 'student'}
                    />

                    {/* Arrow indicator */}
                    <div style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 0,
                      height: 0,
                      borderLeft: '5px solid transparent',
                      borderRight: '5px solid transparent',
                      borderTop: '5px solid #a78bfa',
                      pointerEvents: 'none'
                    }}></div>

                    <div className="suggestions" style={{ display: showDropdown ? 'block' : 'none' }}>
                      {filteredColleges.map(([key, name]) => (
                        <div
                          key={key}
                          className="suggestion-item"
                          onClick={() => handleCollegeSelect(key)}
                          style={{
                            backgroundColor: key === college ? 'rgba(124, 58, 237, 0.15)' : 'transparent',
                            color: key === college ? '#c084fc' : '#d1d5db',
                            fontWeight: key === college ? 'bold' : 'normal'
                          }}
                        >
                          {name}
                        </div>
                      ))}

                      {filteredColleges.length === 0 && (
                        <div style={{
                          padding: '10px',
                          textAlign: 'center',
                          color: '#6b7280',
                          fontStyle: 'italic',
                          fontSize: '0.85rem'
                        }}>
                          No matches found
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Batch Year Search Autocomplete Input */}
                <div className="input-group animate-fade-in">
                  <div className="search-container year-search-container" style={{ position: 'relative' }}>
                    <FaCheckCircle className="input-icon" />
                    <input
                      type="text"
                      className="login-search-box"
                      placeholder="Search batch year"
                      value={yearSearchTerm}
                      onChange={handleYearSearch}
                      onClick={handleYearInputClick}
                      onFocus={handleYearInputFocus}
                      required={role === 'student'}
                    />

                    {/* Arrow indicator */}
                    <div style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 0,
                      height: 0,
                      borderLeft: '5px solid transparent',
                      borderRight: '5px solid transparent',
                      borderTop: '5px solid #a78bfa',
                      pointerEvents: 'none'
                    }}></div>

                    <div className="suggestions" style={{ display: showYearDropdown ? 'block' : 'none' }}>
                      {filteredYears.map(([key, name]) => (
                        <div
                          key={key}
                          className="suggestion-item"
                          onClick={() => handleYearSelect(key)}
                          style={{
                            backgroundColor: key === year ? 'rgba(124, 58, 237, 0.15)' : 'transparent',
                            color: key === year ? '#c084fc' : '#d1d5db',
                            fontWeight: key === year ? 'bold' : 'normal'
                          }}
                        >
                          {name}
                        </div>
                      ))}

                      {filteredYears.length === 0 && (
                        <div style={{
                          padding: '10px',
                          textAlign: 'center',
                          color: '#6b7280',
                          fontStyle: 'italic',
                          fontSize: '0.85rem'
                        }}>
                          No matches found
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Email/Username input */}
            <div className="input-group">
              <div className="input-with-icon">
                <FaUser className="input-icon" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Email"
                  required
                />
              </div>
            </div>

            {/* Password input */}
            <div className="input-group">
              <div className="input-with-icon">
                <FaLock className="input-icon" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#9ca3af',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0'
                  }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>

            {/* Remember me and Forgot Row */}
            <div className="form-footer-row">
              <div className="remember-me">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={() => setRememberMe(!rememberMe)}
                  id="remember-me-checkbox"
                />
                <label htmlFor="remember-me-checkbox">Remember Me</label>
              </div>
              <a href="#forgot" className="forgot-password-link">Forgot Password?</a>
            </div>

            {/* Login button */}
            <button type="submit" disabled={loading} className="login-button">
              {loading ? 'Logging in...' : 'Login'} <FaArrowRight />
            </button>

            {error && <div className="error">{error}</div>}
          </form>

          {/* Social Sign In section */}
          <div className="divider">
            <span>or continue with</span>
          </div>

          <div className="social-buttons">
            <button type="button" className="social-btn">
              <FaGoogle className="social-logo" style={{ color: '#ea4335' }} />
              Google
            </button>
            <button type="button" className="social-btn">
              <FaMicrosoft className="social-logo" style={{ color: '#00a4ef' }} />
              Microsoft
            </button>
          </div>

          <div className="signup-link-block">
            New to SEED? <span>Sign up</span>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      {showSuccess && (
        <div className="modal-overlay">
          <div className="success-modal">
            <FaCheckCircle className="success-icon" />
            <p>Welcome to SEED!</p>
            <p className="redirect-text">Redirecting to dashboard...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
