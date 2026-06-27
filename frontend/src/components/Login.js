import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaCheckCircle, FaUser, FaLock, FaEye, FaEyeSlash } from "react-icons/fa";
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
      {/* Background Section - Left side */}
      <div className="background-section">
        <div className="background-content">
          <div className="background-logo">
            SEED<span></span>
          </div>
          <div className="welcome-text">
            <h2>Welcome Back to SEED!</h2>
            <p>Where every login brings you closer to your goals.</p>
            <p className="login-prompt">Log in to continue your journey</p>
            <p className="empowerment-text">Empower yourself with the tools, knowledge, and opportunities to succeed.</p>
          </div>
        </div>
      </div>

      {/* Form Section - Right side */}
      <div className="form-section">
        <div className="container">
          {/* Mobile Logo - Only shows on mobile */}
          <div className="mobile-logo">
            <div className="logo-text">
              SEED<span className="dot"></span>
            </div>
          </div>

          <h1>Welcome back!</h1>
          <p style={{ textAlign: 'center', color: '#64748b', marginBottom: '2rem' }}>Login to your account</p>

          <form onSubmit={handleLogin} className="animate-slide-up">
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
                <div className="input-group animate-fade-in">
                  <div className="search-container login-search-wrapper" style={{
                    position: 'relative',
                    width: '100%',
                    margin: '0'  // Override the StudentDashboard margin
                  }}>
                    <input
                      type="text"
                      className="login-search-box"
                      placeholder="Search college name"
                      value={searchTerm}
                      onChange={handleSearch}
                      onClick={handleInputClick}
                      onFocus={handleInputFocus}
                      style={{
                        width: '100%',
                        padding: '0.9rem 1rem',
                        border: '1px solid #ddd',
                        borderRadius: '8px',
                        fontSize: '1rem',
                        paddingRight: '30px',
                        backgroundColor: '#f5f7fa',
                        color: '#333'
                      }}
                      required={role === 'student'}
                    />

                    {/* Arrow indicator */}
                    <div style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 0,
                      height: 0,
                      borderLeft: '6px solid transparent',
                      borderRight: '6px solid transparent',
                      borderTop: '6px solid #4CAF50',
                      pointerEvents: 'none'
                    }}></div>

                    <div className="suggestions" style={{
                      display: showDropdown ? 'block' : 'none',
                      position: 'absolute',
                      width: '100%',
                      zIndex: 1000
                    }}>
                      {filteredColleges.map(([key, name]) => (
                        <div
                          key={key}
                          className="suggestion-item"
                          onClick={() => handleCollegeSelect(key)}
                          style={{
                            backgroundColor: key === college ? '#e8f5e9' : 'white',
                            color: key === college ? '#4CAF50' : '#333',
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
                          color: '#999',
                          fontStyle: 'italic'
                        }}>
                          No matches found
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="input-group animate-fade-in">
                  <div className="search-container year-search-container" style={{
                    position: 'relative',
                    width: '100%',
                    margin: '0'
                  }}>
                    <input
                      type="text"
                      className="login-search-box"
                      placeholder="Search batch year"
                      value={yearSearchTerm}
                      onChange={handleYearSearch}
                      onClick={handleYearInputClick}
                      onFocus={handleYearInputFocus}
                      style={{
                        width: '100%',
                        padding: '0.9rem 1rem',
                        border: '1px solid #ddd',
                        borderRadius: '8px',
                        fontSize: '1rem',
                        paddingRight: '30px',
                        backgroundColor: '#f5f7fa',
                        color: '#333'
                      }}
                      required={role === 'student'}
                    />

                    {/* Arrow indicator */}
                    <div style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 0,
                      height: 0,
                      borderLeft: '6px solid transparent',
                      borderRight: '6px solid transparent',
                      borderTop: '6px solid #4CAF50',
                      pointerEvents: 'none'
                    }}></div>

                    <div className="suggestions" style={{
                      display: showYearDropdown ? 'block' : 'none',
                      position: 'absolute',
                      width: '100%',
                      zIndex: 1000
                    }}>
                      {filteredYears.map(([key, name]) => (
                        <div
                          key={key}
                          className="suggestion-item"
                          onClick={() => handleYearSelect(key)}
                          style={{
                            backgroundColor: key === year ? '#e8f5e9' : 'white',
                            color: key === year ? '#4CAF50' : '#333',
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
                          color: '#999',
                          fontStyle: 'italic'
                        }}>
                          No matches found
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="input-group">
              <div className="input-with-icon">
                <FaUser className="input-icon" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Email"
                  style={{
                    width: '100%',
                    padding: '0.9rem 1rem',
                    paddingLeft: '40px',
                    backgroundColor: '#f5f7fa',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    fontSize: '1rem'
                  }}
                  required
                />
              </div>
            </div>

            <div className="input-group">
              <div className="input-with-icon" style={{ position: 'relative' }}>
                <FaLock className="input-icon" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  style={{
                    width: '100%',
                    padding: '0.9rem 1rem',
                    paddingLeft: '40px',
                    paddingRight: '40px',
                    backgroundColor: '#f5f7fa',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    fontSize: '1rem'
                  }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748b',
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

            <div className="remember-me">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={() => setRememberMe(!rememberMe)}
                id="remember-me-checkbox"
              />
              <label htmlFor="remember-me-checkbox">Remember Me</label>
            </div>

            <button type="submit" disabled={loading} className="login-button">
              {loading ? 'Logging in...' : 'Login'}
            </button>

            {error && <div className="error">{error}</div>}
          </form>

          <footer className="footer">
            <p>Copyright © 2023-2025. All rights reserved to SEED Innovating Technologies and Educational Services (SEED-ITES).</p>
          </footer>
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
