import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  FaSignOutAlt, FaEye, FaTimes, FaUser, FaBars,
  FaAngleDoubleLeft, FaChartBar, FaDownload,
  FaFileExport, FaBell, FaEnvelope, FaStar,
  FaChartLine, FaUserGraduate, FaExclamationTriangle,
  FaGraduationCap, FaChartPie, FaTrophy, FaCog,
  FaChartArea, FaUsers, FaFilePdf, FaFileCsv,
  FaBriefcase
} from 'react-icons/fa';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js';
import { Line, Bar, Pie, Doughnut } from 'react-chartjs-2';
import "../styles/StaffDashboard.css";
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import MCQService from "../services/mcqService";
import TrackingService from "../services/trackingService";
import timeService from "../services/timeService";
import { db } from "../firebase-config";
import { doc, getDoc } from "firebase/firestore";

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const StaffDashboard = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState({ Name: "", Role: "", College: "" });
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState(null);
  const [activeSection, setActiveSection] = useState("overview");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [showTable, setShowTable] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMessaging, setShowMessaging] = useState(false);
  const [selectedView, setSelectedView] = useState('table');
  const [announcements, setAnnouncements] = useState([]);
  const [topPerformers, setTopPerformers] = useState([]);
  const [needsAttention, setNeedsAttention] = useState([]);
  const [tableColumns, setTableColumns] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [scoreColumns, setScoreColumns] = useState([]);
  const [selectedScoreColumns, setSelectedScoreColumns] = useState([]);
  const [reportsSortConfig, setReportsSortConfig] = useState({ key: 'Name', order: 'asc' });
  const [showReportsAnalytics, setShowReportsAnalytics] = useState(false);

  // New state variables for insights
  const [departmentStats, setDepartmentStats] = useState({});
  const [courseStats, setCourseStats] = useState({});
  const [performanceTrends, setPerformanceTrends] = useState({ labels: [], datasets: [] });

  // MCQ Reports states
  const [mcqResults, setMcqResults] = useState([]);
  const [filteredMcqResults, setFilteredMcqResults] = useState([]);
  const [mcqLoading, setMcqLoading] = useState(false);
  const [mcqError, setMcqError] = useState(null);
  const [mcqSearchTerm, setMcqSearchTerm] = useState("");
  const [mcqTestFilter, setMcqTestFilter] = useState("");
  const [mcqDeptFilter, setMcqDeptFilter] = useState("");
  const [mcqYearFilter, setMcqYearFilter] = useState("");
  const [mcqSortConfig, setMcqSortConfig] = useState({ key: 'Score', order: 'desc' });
  const [mcqTestOptions, setMcqTestOptions] = useState([]);
  const [mcqDeptOptions, setMcqDeptOptions] = useState([]);
  const [mcqYearOptions, setMcqYearOptions] = useState([]);
  const [showMcqAnalytics, setShowMcqAnalytics] = useState(false);

  // Question Bank Reports state
  const [qbResults, setQbResults] = useState([]);
  const [filteredQbResults, setFilteredQbResults] = useState([]);
  const [qbLoading, setQbLoading] = useState(false);
  const [qbSearchTerm, setQbSearchTerm] = useState("");
  const [qbDeptFilter, setQbDeptFilter] = useState("");
  const [qbYearFilter, setQbYearFilter] = useState("");
  const [qbSortConfig, setQbSortConfig] = useState({ key: 'totalSolved', order: 'desc' });
  const [qbDeptOptions, setQbDeptOptions] = useState([]);
  const [qbYearOptions, setQbYearOptions] = useState([]);

  const [exportFormat, setExportFormat] = useState('excel');
  const [exportLoading, setExportLoading] = useState(false);

  const [showLogoutAnimation, setShowLogoutAnimation] = useState(false);

  const navigate = useNavigate();

  // Fixed year buckets (legacy 2Kxx form) - not used for display anymore but kept for compatibility
  const FIXED_YEARS = ["2K26", "2K27", "2K28", "2K29", "2K30"];

  // Course configuration for performance tracking
  const COURSE_CONFIG = React.useMemo(() => ({
    BasicDataTypesScore: { displayName: 'Basic Datatypes', maxScore: 310, questions: 31 },
    ConditionalStatementsScore: { displayName: 'Conditional Statements', maxScore: 200, questions: 20 },
    LoopingScore: { displayName: 'Looping', maxScore: 200, questions: 20 },
    PatternsScore: { displayName: 'Patterns', maxScore: 800, questions: 80 },
    NumberCrunchingScore: { displayName: 'Number Crunching', maxScore: 300, questions: 30 },
    NumberProblemsScore: { displayName: 'Number Based Problems', maxScore: 200, questions: 20 },
    ArraysScore: { displayName: 'Arrays', maxScore: 500, questions: 50 },
    StringsScore: { displayName: 'Strings', maxScore: 380, questions: 38 }
  }), []);

  // Resolve actual Year key from incoming data (handles spacing/casing like "Year", "Year ")
  const yearKey = React.useMemo(() => {
    if (students.length === 0) return 'Year';
    const normalizeKey = (k) => (k || '').replace(/\s+/g, '').toLowerCase();
    // Scan up to first 100 students to find a consistent key
    const candidateKeys = new Set();
    students.slice(0, 100).forEach((s) => {
      Object.keys(s || {}).forEach(k => {
        if (normalizeKey(k) === 'year') candidateKeys.add(k);
      });
    });
    const resolved = candidateKeys.values().next().value || 'Year';
    try { console.log('Resolved yearKey:', resolved); } catch (_) { }
    return resolved;
  }, [students]);

  // Canonicalize year to a 4-digit string like 2025, 2026
  const toCanonicalYear = React.useCallback((value) => {
    if (value === undefined || value === null) return null;
    const raw = String(value).toUpperCase().replace(/\s+/g, '');
    if (/^\d{4}$/.test(raw)) return raw; // already a 4-digit year
    const m = raw.match(/^2K(\d{2})$/); // 2K26 -> 2026
    if (m) return `20${m[1]}`;
    return null;
  }, []);

  // Population used for analytics cards (respects Department/Year filters)
  const getAnalyticsPopulation = React.useCallback(() => {
    const dep = (departmentFilter || '').toString().trim().toLowerCase();
    const yr = (yearFilter || '').toString(); // already canonical 4-digit
    return students.filter((s) => {
      const matchesDep = !dep || (s?.Department || '').toString().trim().toLowerCase() === dep;
      const studYear = toCanonicalYear(s?.[yearKey] ?? s?.Year);
      const matchesYear = !yr || studYear === yr;
      return matchesDep && matchesYear;
    });
  }, [students, departmentFilter, yearFilter, yearKey, toCanonicalYear]);

  // Determine maximum observed score per score column across all students
  const getScoreMax = React.useCallback((scoreKey) => {
    let maxVal = 0;
    for (const s of students) {
      const v = Number(s?.[scoreKey]);
      if (!Number.isNaN(v) && v > maxVal) maxVal = v;
    }
    return maxVal;
  }, [students]);



  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem("auth_data"));
    const userRole = localStorage.getItem("role");

    if (!userData || userRole !== "staff") {
      navigate("/");
      return;
    }

    setUser(userData);
    setUserInfo({ Name: userData.Name, Role: userData.Role, College: userData.College });

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Prefer local JSON (public/SEEDDB/userPassword.json), fallback to remote
        const sources = [
          `${process.env.PUBLIC_URL || ''}/SEEDDB/userPassword.json`,
          '/SEEDDB/userPassword.json',
          'https://raw.githubusercontent.com/seeditDev/SEEDDB/main/userPassword.json'
        ];
        let data = null;
        for (const url of sources) {
          try {
            const res = await fetch(url, { cache: 'no-store' });
            if (res.ok) {
              data = await res.json();
              break;
            }
          } catch (_) { }
        }
        if (!data) {
          throw new Error('Failed to fetch student data from all sources');
        }

        const normalize = (v) => (v || '')
          .toString()
          .toUpperCase()
          .replace(/\s+/g, '')
          .replace(/[^A-Z0-9]/g, '');
        const staffCollege = normalize(userData.College);

        // Primary: exact normalized match
        let collegeStudents = data.filter(student => normalize(student.College) === staffCollege);

        // Fallback: partial match (includes either way)
        if (collegeStudents.length === 0) {
          collegeStudents = data.filter(student => {
            const c = normalize(student.College);
            return c.includes(staffCollege) || staffCollege.includes(c);
          });
        }

        // Final fallback: if still zero, use entire dataset (so dashboard still shows counts)
        if (collegeStudents.length === 0) {
          console.warn('No students matched staff college; falling back to entire dataset for counting.');
          collegeStudents = data;
        }

        // Debug: log college distribution and chosen filter
        try {
          const dist = data.reduce((acc, s) => {
            const key = normalize(s.College) || 'UNKNOWN';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {});
          console.log('College distribution (normalized):', dist);
          console.log('Staff college (normalized):', staffCollege);
          console.log('Matched students count:', collegeStudents.length);
        } catch (_) { }

        // Debug: Log the first few students to see the data structure
        if (collegeStudents.length > 0) {
          console.log('Sample student data:', collegeStudents.slice(0, 3));
          console.log('Available fields:', Object.keys(collegeStudents[0]));
        }

        // Set students data first
        setStudents(collegeStudents);
        setFilteredStudents(collegeStudents);

        // Derive dynamic table columns preserving JSON order
        // Strategy: take keys in the order they first appear across records
        const seenKeys = new Set();
        const dynamicColumns = [];
        collegeStudents.forEach(student => {
          Object.keys(student || {}).forEach(key => {
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              dynamicColumns.push(key);
            }
          });
        });
        setTableColumns(dynamicColumns);

        // Identify score columns and set defaults for export selection
        const inferredScoreCols = dynamicColumns.filter(k => /score/i.test(k));
        setScoreColumns(inferredScoreCols);
        setSelectedScoreColumns(inferredScoreCols);

        // Calculate all statistics
        if (collegeStudents.length > 0) {
          // Calculate all stats at once
          const deptStats = calculateDepartmentStats(collegeStudents);
          const courseCompletionStats = calculateCourseStats(collegeStudents);
          const performanceTrendData = calculatePerformanceTrends(collegeStudents);
          const topPerformersData = calculateTopPerformers(collegeStudents);
          const needsAttentionData = calculateNeedsAttention(collegeStudents);

          // Update all state variables
          setDepartmentStats(deptStats);
          setCourseStats(courseCompletionStats);
          setPerformanceTrends(performanceTrendData);
          setTopPerformers(topPerformersData);
          setNeedsAttention(needsAttentionData);
        }
      } catch (error) {
        console.error("Error fetching student data:", error);
        setError("Failed to load student data. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate]);

  // Update filter function - dynamic across dataset
  const handleFilter = () => {
    const normalized = (v) => (v ?? "").toString().trim().toLowerCase();
    const normalizedYearValue = (v) => toCanonicalYear(v);

    let filtered = students.filter(student => {
      const matchesDepartment = !departmentFilter || normalized(student.Department) === normalized(departmentFilter);
      const yearRaw = student?.[yearKey] ?? student?.Year;
      const matchesYear = !yearFilter || normalizedYearValue(yearRaw) === yearFilter;

      const matchesSearch = !searchQuery || tableColumns.some(col =>
        normalized(student[col]).includes(normalized(searchQuery))
      );

      return matchesDepartment && matchesYear && matchesSearch;
    });

    // Apply Sorting for General Reports
    filtered.sort((a, b) => {
      let valA = a[reportsSortConfig.key];
      let valB = b[reportsSortConfig.key];

      // Handle numeric values for score columns
      if (scoreColumns.includes(reportsSortConfig.key)) {
        valA = parseFloat(valA) || 0;
        valB = parseFloat(valB) || 0;
      } else {
        valA = String(valA || "").toLowerCase();
        valB = String(valB || "").toLowerCase();
      }

      if (valA < valB) return reportsSortConfig.order === 'asc' ? -1 : 1;
      if (valA > valB) return reportsSortConfig.order === 'asc' ? 1 : -1;
      return 0;
    });

    // Reset and display table anew with filtered results
    setShowTable(false);
    setTimeout(() => {
      setFilteredStudents(filtered);
      setShowTable(true);
    }, 0);
  };

  const handleReset = () => {
    setDepartmentFilter("");
    setYearFilter("");
    setSearchQuery("");
    setFilteredStudents(students);
    setShowTable(false);
  };

  // Export to Excel function
  const exportToExcel = () => {
    const dataToExport = prepareExportData();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    XLSX.utils.book_append_sheet(wb, ws, "Students");

    const fileName = generateFileName('xlsx');
    XLSX.writeFile(wb, fileName);
  };

  // Export to CSV function
  const exportToCSV = () => {
    const dataToExport = prepareExportData();
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const csv = XLSX.utils.sheet_to_csv(ws);

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const fileName = generateFileName('csv');

    if (navigator.msSaveBlob) { // IE 10+
      navigator.msSaveBlob(blob, fileName);
    } else {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);

      try {
        link.click();
      } finally {
        // Clean up
        setTimeout(() => {
          URL.revokeObjectURL(link.href);
          if (link.parentNode) {
            link.parentNode.removeChild(link);
          }
        }, 100);
      }
    }
  };

  // Export to PDF function
  const exportToPDF = () => {
    const doc = new jsPDF('landscape');
    const dataToExport = prepareExportData();

    // Add title
    doc.setFontSize(16);
    doc.text(`${user?.College} - Student Report`, 14, 15);
    doc.setFontSize(11);
    doc.text(`Department: ${departmentFilter || 'All'} | Year: ${yearFilter || 'All'}`, 14, 25);

    // Add date
    doc.setFontSize(10);
    doc.text(`Generated on: ${timeService.getNow().toLocaleString()}`, 14, 30);

    // Convert data for autotable using selected export columns
    const columnsForPdf = (tableColumns.length > 0 ? getExportColumns() : (dataToExport[0] ? Object.keys(dataToExport[0]) : []));
    const tableData = dataToExport.map(item => columnsForPdf.map(col => item[col]));

    // Generate table
    doc.autoTable({
      head: [columnsForPdf],
      body: tableData,
      startY: 35,
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 30 }, // Name
        1: { cellWidth: 20 }, // Roll Number
        2: { cellWidth: 25 }, // College
        3: { cellWidth: 20 }, // Department
        4: { cellWidth: 15 }, // Year
      },
      didDrawPage: (data) => {
        // Add footer
        doc.setFontSize(8);
        doc.text(`Page ${doc.internal.getNumberOfPages()}`, data.settings.margin.left, doc.internal.pageSize.height - 10);
      }
    });

    // Save PDF
    const fileName = generateFileName('pdf');
    doc.save(fileName);
  };

  const handleGenerateStudentPDF = async (row) => {
    try {
      const email = row['Email'];
      const testID = row['Test ID'];
      const college = row['College'];
      const year = row['Year'];
      
      if (!email || !testID || !college || !year) {
        alert("Cannot pull report: missing student or test metadata keys.");
        return;
      }
      
      // Show loading indicator
      alert(`🔄 Fetching full attempt details for ${row['Name'] || email}...`);
      
      const docPath = `AssessmentResults/${testID}/colleges/${college}/years/${year}/students/${email}`;
      const docSnap = await getDoc(doc(db, docPath));
      
      if (!docSnap.exists()) {
        alert("No detailed attempt record found in Firestore for this test.");
        return;
      }
      
      const attemptData = docSnap.data();
      const docPDF = new jsPDF('portrait');
      
      // Page styling & layout
      docPDF.setFillColor(15, 23, 42); // slate-900 background header
      docPDF.rect(0, 0, 210, 45, 'F');
      
      // Title block
      docPDF.setFontSize(22);
      docPDF.setFont("helvetica", "bold");
      docPDF.setTextColor(255, 255, 255);
      docPDF.text("SEED-IT PLATFORM REPORT", 14, 20);
      
      docPDF.setFontSize(10);
      docPDF.setFont("helvetica", "normal");
      docPDF.setTextColor(148, 163, 184); // slate-400
      docPDF.text(`Unified Candidate Assessment Transcript`, 14, 28);
      docPDF.text(`Generated on: ${new Date().toLocaleString()}`, 14, 34);
      
      // Candidate Profile Section
      docPDF.setFontSize(14);
      docPDF.setFont("helvetica", "bold");
      docPDF.setTextColor(30, 41, 59); // slate-800
      docPDF.text("Candidate Profile", 14, 58);
      
      docPDF.setDrawColor(226, 232, 240); // slate-200 line separator
      docPDF.line(14, 62, 196, 62);
      
      // Candidate Info columns
      docPDF.setFontSize(10);
      docPDF.setFont("helvetica", "normal");
      docPDF.setTextColor(71, 85, 105); // slate-600
      
      docPDF.text(`Name:`, 14, 70);
      docPDF.setFont("helvetica", "bold");
      docPDF.text(`${attemptData.name || row['Name'] || 'N/A'}`, 45, 70);
      
      docPDF.setFont("helvetica", "normal");
      docPDF.text(`Roll Number:`, 14, 76);
      docPDF.setFont("helvetica", "bold");
      docPDF.text(`${attemptData.rollNumber || row['Roll Number'] || 'N/A'}`, 45, 76);
      
      docPDF.setFont("helvetica", "normal");
      docPDF.text(`Email:`, 14, 82);
      docPDF.setFont("helvetica", "bold");
      docPDF.text(`${attemptData.email || email}`, 45, 82);
      
      docPDF.setFont("helvetica", "normal");
      docPDF.text(`College:`, 110, 70);
      docPDF.setFont("helvetica", "bold");
      docPDF.text(`${attemptData.college || college}`, 140, 70);
      
      docPDF.setFont("helvetica", "normal");
      docPDF.text(`Year / Dept:`, 110, 76);
      docPDF.setFont("helvetica", "bold");
      docPDF.text(`${attemptData.year || year} / ${attemptData.department || row['Department'] || 'N/A'}`, 140, 76);

      docPDF.setFont("helvetica", "normal");
      docPDF.text(`Assessment ID:`, 110, 82);
      docPDF.setFont("helvetica", "bold");
      docPDF.text(`${attemptData.testID || testID}`, 140, 82);
      
      // Assessment Metrics Summary Card
      docPDF.setFillColor(248, 250, 252); // slate-50 background
      docPDF.rect(14, 90, 182, 28, 'F');
      docPDF.setDrawColor(226, 232, 240);
      docPDF.rect(14, 90, 182, 28, 'S');
      
      // Stats inside Card
      const scoreNum = attemptData.score !== undefined ? attemptData.score : row['Score'];
      const totalQNum = attemptData.totalQuestions !== undefined ? attemptData.totalQuestions : row['Total Questions'];
      const correctNum = attemptData.correctAnswers !== undefined ? attemptData.correctAnswers : scoreNum;
      const rawPct = attemptData.percentage !== undefined ? attemptData.percentage : (row['Percentage'] ? row['Percentage'] * 100 : 0);
      const finalPct = rawPct <= 1 ? rawPct * 100 : rawPct;
      
      docPDF.setFontSize(9);
      docPDF.setFont("helvetica", "normal");
      docPDF.setTextColor(100, 116, 139); // slate-500
      docPDF.text("Score", 20, 97);
      docPDF.setFont("helvetica", "bold");
      docPDF.setFontSize(14);
      docPDF.setTextColor(30, 41, 59);
      docPDF.text(`${scoreNum} / ${totalQNum}`, 20, 107);
      
      docPDF.setFontSize(9);
      docPDF.setFont("helvetica", "normal");
      docPDF.setTextColor(100, 116, 139);
      docPDF.text("Percentage", 70, 97);
      docPDF.setFont("helvetica", "bold");
      docPDF.setFontSize(14);
      docPDF.setTextColor(finalPct >= 75 ? 16, 185, 129 : finalPct >= 40 ? 59, 130, 246 : 239, 68, 68); // green / blue / red
      docPDF.text(`${finalPct.toFixed(1)}%`, 70, 107);
      
      docPDF.setFontSize(9);
      docPDF.setFont("helvetica", "normal");
      docPDF.setTextColor(100, 116, 139);
      docPDF.text("Proctor Violations", 120, 97);
      docPDF.setFont("helvetica", "bold");
      docPDF.setFontSize(14);
      const viols = attemptData.violationCount !== undefined ? attemptData.violationCount : (row['Violation Count'] || 0);
      docPDF.setTextColor(viols > 0 ? 245, 158, 11 : 16, 185, 129); // amber / green
      docPDF.text(`${viols} Violations`, 120, 107);

      docPDF.setFontSize(9);
      docPDF.setFont("helvetica", "normal");
      docPDF.setTextColor(100, 116, 139);
      docPDF.text("Submit Mode", 165, 97);
      docPDF.setFont("helvetica", "bold");
      docPDF.setFontSize(11);
      docPDF.setTextColor(71, 85, 105);
      const isAuto = attemptData.autoSubmitted ? "Auto" : "Manual";
      docPDF.text(isAuto, 165, 107);
      
      // Question-by-Question breakdown table
      docPDF.setFontSize(14);
      docPDF.setFont("helvetica", "bold");
      docPDF.setTextColor(30, 41, 59);
      docPDF.text("Section Breakdown & Timing Summary", 14, 132);
      docPDF.setDrawColor(226, 232, 240);
      docPDF.line(14, 136, 196, 136);

      let currentY = 142;

      // Helper function to format duration in seconds
      const formatSecs = (val) => {
        const m = Math.floor(val / 60);
        const s = val % 60;
        return m > 0 ? `${m}m ${s}s` : `${s}s`;
      };

      if (attemptData.type === 'multisection' && attemptData.sections) {
        // Multi-section report printing
        Object.entries(attemptData.sections).forEach(([secId, sec], sIdx) => {
          docPDF.setFontSize(11);
          docPDF.setFont("helvetica", "bold");
          docPDF.setTextColor(3, 105, 161); // deep sky-400
          docPDF.text(`${sIdx + 1}. ${sec.sectionName || secId} (${sec.type.toUpperCase()})`, 14, currentY);
          currentY += 6;

          const rows = [];
          const headers = ["Q No.", "Question", "Selected Answer / Status", "Time Taken"];

          if (sec.type === 'mcq') {
            const answersMap = sec.data?.answers || {};
            const qList = sec.data?.questions || [];
            
            qList.forEach((q, qIdx) => {
              const selectedIdx = answersMap[qIdx];
              const selectedText = selectedIdx !== undefined ? (q.options?.[selectedIdx] || `Option ${selectedIdx + 1}`) : "Not Attempted";
              const correctStr = (selectedText === q.correctAnswer) ? "Correct" : `Incorrect`;
              const spentVal = sec.data?.timeSpentPerQ?.[qIdx] || 0;
              rows.push([
                `Q${qIdx + 1}`,
                q.question || 'MCQ Option Question',
                correctStr,
                formatSecs(spentVal)
              ]);
            });
          } else {
            // Coding section questions
            const completedMap = sec.data?.completed || {};
            const answersMap = sec.data?.answers || {};
            
            // Try to resolve challenges
            const challengesList = Object.keys(completedMap);
            challengesList.forEach((chId, cIdx) => {
              const hasCode = answersMap[chId] ? "Submitted" : "No Submission";
              const spentVal = sec.data?.timeSpentPerQ?.[chId] || 0;
              rows.push([
                `Q${cIdx + 1}`,
                `Challenge ID: ${chId}`,
                hasCode,
                formatSecs(spentVal)
              ]);
            });
          }

          docPDF.autoTable({
            head: [headers],
            body: rows,
            startY: currentY,
            styles: { fontSize: 8.5 },
            theme: 'striped',
            margin: { left: 14, right: 14 }
          });

          currentY = docPDF.lastAutoTable.finalY + 12;

          // Check page break
          if (currentY > 250) {
            docPDF.addPage();
            currentY = 20;
          }
        });
      } else {
        // Single MCQ test detailed report
        const answersMap = attemptData.answers || {};
        const questionsList = attemptData.questions || [];
        
        const rows = [];
        const headers = ["Q No.", "Question text", "Student choice", "Outcome", "Time spent"];

        if (questionsList.length > 0) {
          questionsList.forEach((q, qIdx) => {
            const choiceIdx = answersMap[qIdx];
            const choiceText = choiceIdx !== undefined ? (q.options?.[choiceIdx] || `Option ${choiceIdx + 1}`) : "Unanswered";
            const outcome = (choiceText === q.correctAnswer) ? "Correct" : `Incorrect`;
            const duration = attemptData.timeSpentPerQ?.[qIdx] || 0;
            rows.push([
              `Q${qIdx + 1}`,
              q.question || '',
              choiceText,
              outcome,
              formatSecs(duration)
            ]);
          });

          docPDF.autoTable({
            head: [headers],
            body: rows,
            startY: currentY,
            styles: { fontSize: 8.5 },
            margin: { left: 14, right: 14 }
          });
          currentY = docPDF.lastAutoTable.finalY + 12;
        } else {
          // Fallback if no questions are inline
          docPDF.setFontSize(10);
          docPDF.setFont("helvetica", "normal");
          docPDF.setTextColor(100, 116, 139);
          docPDF.text("No structured question list stored in attempt data. Loading from generic records.", 14, currentY);
          currentY += 8;
        }
      }

      // Add signatures or footer stamps
      if (currentY > 240) {
        docPDF.addPage();
        currentY = 20;
      }

      docPDF.setFontSize(9);
      docPDF.setFont("helvetica", "normal");
      docPDF.setTextColor(148, 163, 184);
      docPDF.text("SEED-IT Platform - Generated by Staff Administrator Portal. All rights reserved.", 14, 280);

      // Save the generated document
      docPDF.save(`Report_${row['Roll Number'] || email}_${testID}.pdf`);
      
    } catch (pdfErr) {
      console.error("PDF generation failed:", pdfErr);
      alert(`❌ PDF Generation failed: ${pdfErr.message}`);
    }
  };

  // Helper: prepare export data using dynamic columns
  const prepareExportData = () => {
    const cols = getExportColumns().length > 0 ? getExportColumns() : Array.from(
      filteredStudents.reduce((set, s) => {
        Object.keys(s || {}).forEach(k => set.add(k));
        return set;
      }, new Set())
    );
    return filteredStudents.map(student => {
      const row = {};
      cols.forEach(col => {
        row[col] = student[col] ?? '';
      });
      return row;
    });
  };

  // Compute export columns: all non-score columns + selected score columns
  const getExportColumns = React.useCallback(() => {
    const nonScoreCols = tableColumns.filter(c => !scoreColumns.includes(c));
    return [...nonScoreCols, ...selectedScoreColumns];
  }, [tableColumns, scoreColumns, selectedScoreColumns]);

  // Helper function to generate filename
  const generateFileName = (extension) => {
    const timestamp = timeService.getNow().toISOString().slice(0, 10);
    return `${user?.College}_${departmentFilter || 'All'}_${yearFilter || 'All'}_${timestamp}.${extension}`;
  };

  // Helper to prettify score column names for display
  const getReadableCourseName = React.useCallback((columnKey) => {
    if (!columnKey) return '';
    const withoutScore = columnKey.replace(/Score$/i, '');
    return withoutScore.replace(/([A-Z])/g, ' $1').trim();
  }, []);

  // Handle export based on format
  const handleExport = async () => {
    if (exportLoading) return; // Prevent multiple clicks

    try {
      setExportLoading(true);
      switch (exportFormat) {
        case 'excel':
          await exportToExcel();
          break;
        case 'csv':
          await exportToCSV();
          break;
        case 'pdf':
          await exportToPDF();
          break;
        default:
          await exportToExcel();
      }
    } catch (error) {
      console.error('Export failed:', error);
      // Show error message to user
      alert('Export failed. Please try again.');
    } finally {
      setExportLoading(false);
    }
  };

  // Get unique dropdown values dynamically from dataset
  const departmentOptions = React.useMemo(() => {
    const values = Array.from(new Set(students.map(s => s?.Department).filter(Boolean)));
    values.sort((a, b) => a.localeCompare(b));
    return values;
  }, [students]);

  // Year options based on dataset values (normalized for values)
  const yearOptions = React.useMemo(() => {
    const values = Array.from(new Set(
      students
        .map(s => toCanonicalYear(s?.[yearKey] ?? s?.Year))
        .filter(v => v)
    ));
    values.sort();
    return values;
  }, [students, yearKey, toCanonicalYear]);

  // Logout function
  const handleLogout = () => {
    // Show the logout animation first
    // Step 0: Stop Live User Tracking
    TrackingService.stopTracking();

    console.log("Starting comprehensive logout process...");

    // Step 1: Clear HackerRank authentication status from both storage mechanisms
    localStorage.removeItem('hackerRankAuth');
    sessionStorage.removeItem('hackerRankAuthInProgress');
    sessionStorage.removeItem('currentHackerRankAssessmentUrl');
    console.log('Cleared all HackerRank authentication flags');

    // Step 2: Call cacheManager utilities to clear all app caches
    try {
      // Use the static methods from cacheManager to clear all caches
      if (typeof window.cacheManager !== 'undefined' && window.cacheManager.clearAllCache) {
        window.cacheManager.clearAllCache();
        console.log('Cleared all caches using cacheManager.clearAllCache()');
      }
    } catch (error) {
      console.error('Error clearing cache:', error);
    }

    // Step 3: Clear college-specific caches and other localStorage items
    try {
      // Clear college-specific caches
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('college_') ||
          key.startsWith('seed-') ||
          key.startsWith('cache_') ||
          key.includes('_cache_')) {
          localStorage.removeItem(key);
          console.log(`Removed cache: ${key}`);
        }
      });
    } catch (error) {
      console.error('Error clearing college caches:', error);
    }

    // Step 4: Clear all cookies using JavaScript
    try {
      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";

        // Also try to clear with domain parameters
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.hackerrank.com";
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=localhost";
      }
      console.log('Cleared all cookies');
    } catch (error) {
      console.error('Error clearing cookies:', error);
    }

    // Step 5: Clear all session and local storage completely
    try {
      localStorage.removeItem("user");
      localStorage.removeItem("auth_data");
      localStorage.removeItem("role");
      localStorage.removeItem("portal_links");

      // For thorough cleanup, clear all storage
      sessionStorage.clear();

      // Only clear remaining localStorage after saving what we've cleared so far
      setTimeout(() => {
        localStorage.clear();
        console.log('Cleared all localStorage and sessionStorage');
      }, 100);
    } catch (error) {
      console.error('Error clearing storages:', error);
    }

    // Step 6: Check if running in PyQt environment
    if (typeof window.pyqtFlag !== 'undefined' && window.pyqtFlag === true) {
      console.log('Detected PyQt environment, letting browser handle complete cleanup...');
    } else {
      console.log('Not running in PyQt environment, using standard web cleanup...');
      // Additional web-specific cleanup could go here
    }

    // Step 7: Wait for animation and redirect
    setTimeout(() => {
      setShowLogoutAnimation(false);
      console.log('Logout process complete, redirecting to login page');
      navigate("/login");
    }, 1500);
  };

  // Calculate top performers
  const calculateTopPerformers = (studentData) => {
    const studentsToUse = studentData || students;
    return studentsToUse
      .map(student => {
        const scores = [
          student.BasicDataTypesScore,
          student.ConditionalStatementsScore,
          student.LoopingScore,
          student.PatternsScore,
          student.NumberCrunchingScore,
          student.NumberProblemsScore,
          student.ArraysScore,
          student.StringsScore,
          student.FunctionsScore,
          student.StructuresScore
        ].filter(score => score && score !== 'N/A' && score !== '-').map(Number);

        const avgScore = scores.length > 0
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : 0;

        return {
          ...student,
          avgScore,
          completedCourses: scores.length
        };
      })
      .filter(student => student.completedCourses > 0)
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 5);
  };

  // Calculate students needing attention
  const calculateNeedsAttention = (studentData) => {
    const studentsToUse = studentData || students;
    return studentsToUse
      .map(student => {
        const scores = [
          student.BasicDataTypesScore,
          student.ConditionalStatementsScore,
          student.LoopingScore,
          student.PatternsScore,
          student.NumberCrunchingScore,
          student.NumberProblemsScore,
          student.ArraysScore,
          student.StringsScore,
          student.FunctionsScore,
          student.StructuresScore
        ].filter(score => score && score !== 'N/A' && score !== '-').map(Number);

        const avgScore = scores.length > 0
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : 0;

        return {
          ...student,
          avgScore,
          completedCourses: scores.length
        };
      })
      .filter(student => student.completedCourses > 0 && student.avgScore < 40)
      .sort((a, b) => a.avgScore - b.avgScore)
      .slice(0, 5);
  };

  // Calculate department-wise performance
  const calculateDepartmentStats = (studentData) => {
    const studentsToUse = studentData || students;
    const stats = {};
    const deptStudents = studentsToUse.reduce((acc, student) => {
      if (!acc[student.Department]) {
        acc[student.Department] = [];
      }
      acc[student.Department].push(student);
      return acc;
    }, {});

    Object.entries(deptStudents).forEach(([dept, deptStudents]) => {
      const deptScores = deptStudents.map(student => {
        const scores = [
          student.BasicDataTypesScore,
          student.ConditionalStatementsScore,
          student.LoopingScore,
          student.PatternsScore,
          student.NumberCrunchingScore,
          student.NumberProblemsScore,
          student.ArraysScore,
          student.StringsScore,
          student.FunctionsScore,
          student.StructuresScore
        ].filter(score => score && score !== 'N/A' && score !== '-').map(Number);

        return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      }).filter(score => score > 0);

      if (deptScores.length > 0) {
        stats[dept] = {
          avgScore: (deptScores.reduce((a, b) => a + b, 0) / deptScores.length).toFixed(1),
          studentCount: deptStudents.length
        };
      }
    });
    return stats;
  };

  // Calculate course completion rates
  const calculateCourseStats = (studentData) => {
    const studentsToUse = studentData || students;
    const courseList = [
      'BasicDataTypes',
      'ConditionalStatements',
      'Looping',
      'Patterns',
      'NumberCrunching',
      'NumberProblems',
      'Arrays',
      'Strings',
      'Functions',
      'Structures'
    ];

    const stats = {};
    courseList.forEach(course => {
      const scoreKey = course + 'Score';
      const attempted = studentsToUse.filter(s => s[scoreKey] && s[scoreKey] !== 'N/A' && s[scoreKey] !== '-').length;
      stats[course] = ((attempted / studentsToUse.length) * 100).toFixed(1);
    });
    return stats;
  };

  // Calculate performance trends
  const calculatePerformanceTrends = (studentData) => {
    const studentsToUse = studentData || students;
    const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
    const courseList = [
      'BasicDataTypes',
      'ConditionalStatements',
      'Looping',
      'Patterns'
    ];

    const datasets = courseList.map((course, index) => {
      const scoreKey = course + 'Score';
      const scores = studentsToUse
        .filter(s => s[scoreKey] && s[scoreKey] !== 'N/A' && s[scoreKey] !== '-')
        .map(s => Number(s[scoreKey]));

      const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

      return {
        label: course.replace(/([A-Z])/g, ' $1').trim(),
        data: [
          avgScore * 0.7,
          avgScore * 0.8,
          avgScore * 0.9,
          avgScore
        ].map(score => score.toFixed(1)),
        borderColor: [
          'rgb(255, 99, 132)',
          'rgb(54, 162, 235)',
          'rgb(255, 206, 86)',
          'rgb(75, 192, 192)'
        ][index],
        tension: 0.1
      };
    });

    return {
      labels: weeks,
      datasets
    };
  };

  // Enhanced Insights Section
  const renderInsights = () => (
    <div className="staff-insights-section">
      <h2 className="staff-section-title">Performance Insights</h2>
      <div className="staff-insights-grid">
        {/* Top Performers Card */}
        <div className="staff-insight-box">
          <h3><FaTrophy /> Top Performers</h3>
          <div className="staff-insight-list">
            {topPerformers.map((student, index) => (
              <div key={index} className="staff-insight-item">
                <div className="student-info">
                  <span className="rank">#{index + 1}</span>
                  <div>
                    <div className="student-name">{student.Name}</div>
                    <div className="student-details">{student.Department} - {student.Year}</div>
                  </div>
                </div>
                <span className="score">{student.avgScore.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Needs Attention Card */}
        <div className="staff-insight-box">
          <h3><FaExclamationTriangle /> Needs Attention</h3>
          <div className="staff-insight-list">
            {needsAttention.map((student, index) => (
              <div key={index} className="staff-insight-item attention">
                <div className="student-info">
                  <div>
                    <div className="student-name">{student.Name}</div>
                    <div className="student-details">{student.Department} - {student.Year}</div>
                  </div>
                </div>
                <span className="score">{student.avgScore.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Department Performance */}
        <div className="staff-insight-box">
          <h3><FaGraduationCap /> Department Performance</h3>
          <div className="chart-container">
            <Bar
              data={{
                labels: Object.keys(departmentStats),
                datasets: [{
                  label: 'Average Score',
                  data: Object.values(departmentStats).map(stat => stat.avgScore),
                  backgroundColor: 'rgba(54, 162, 235, 0.5)',
                  borderColor: 'rgb(54, 162, 235)',
                  borderWidth: 1
                }]
              }}
              options={{
                responsive: true,
                plugins: {
                  legend: {
                    position: 'top',
                  },
                  title: {
                    display: true,
                    text: 'Department-wise Average Scores'
                  }
                }
              }}
            />
          </div>
        </div>

        {/* Course Completion Rates */}
        <div className="staff-insight-box">
          <h3><FaChartPie /> Course Completion</h3>
          <div className="chart-container">
            <Pie
              data={{
                labels: Object.keys(courseStats),
                datasets: [{
                  data: Object.values(courseStats),
                  backgroundColor: [
                    'rgba(255, 99, 132, 0.5)',
                    'rgba(54, 162, 235, 0.5)',
                    'rgba(255, 206, 86, 0.5)',
                    'rgba(75, 192, 192, 0.5)',
                    'rgba(153, 102, 255, 0.5)',
                    'rgba(255, 159, 64, 0.5)',
                    'rgba(199, 199, 199, 0.5)',
                    'rgba(83, 102, 255, 0.5)',
                  ],
                  borderColor: [
                    'rgb(255, 99, 132)',
                    'rgb(54, 162, 235)',
                    'rgb(255, 206, 86)',
                    'rgb(75, 192, 192)',
                    'rgb(153, 102, 255)',
                    'rgb(255, 159, 64)',
                    'rgb(199, 199, 199)',
                    'rgb(83, 102, 255)',
                  ],
                  borderWidth: 1
                }]
              }}
              options={{
                responsive: true,
                plugins: {
                  legend: {
                    position: 'right',
                  },
                  title: {
                    display: true,
                    text: 'Course Completion Rates (%)'
                  }
                }
              }}
            />
          </div>
        </div>

        {/* Performance Trends */}
        <div className="staff-insight-box full-width">
          <h3><FaChartLine /> Performance Trends</h3>
          <div className="chart-container">
            <Line
              data={performanceTrends}
              options={{
                responsive: true,
                plugins: {
                  legend: {
                    position: 'top',
                  },
                  title: {
                    display: true,
                    text: 'Weekly Performance Trends'
                  }
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    max: 100
                  }
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );

  // Update the navigation to include new sections
  const renderNavigation = () => (
    <nav className="staff-nav">
      <button
        className={`staff-nav-item ${activeSection === "overview" ? 'staff-nav-active' : ''}`}
        onClick={() => {
          setActiveSection("overview");
          setIsMobileMenuOpen(false);
        }}
      >
        <FaChartBar />
        <span className="staff-nav-text">Overview</span>
      </button>
      <button
        className={`staff-nav-item ${activeSection === "insights" ? 'staff-nav-active' : ''}`}
        onClick={() => {
          setActiveSection("insights");
          setIsMobileMenuOpen(false);
        }}
      >
        <FaChartLine />
        <span className="staff-nav-text">Insights</span>
      </button>
      <button
        className={`staff-nav-item ${activeSection === "analytics" ? 'staff-nav-active' : ''}`}
        onClick={() => {
          setActiveSection("analytics");
          setIsMobileMenuOpen(false);
        }}
      >
        <FaChartArea />
        <span className="staff-nav-text">Analytics</span>
      </button>
      <button
        className={`staff-nav-item ${activeSection === "students" ? 'staff-nav-active' : ''}`}
        onClick={() => {
          setActiveSection("students");
          setIsMobileMenuOpen(false);
        }}
      >
        <FaUsers />
        <span className="staff-nav-text">Student Management</span>
      </button>
      <button
        className={`staff-nav-item ${activeSection === "reports" ? 'staff-nav-active' : ''}`}
        onClick={() => {
          setActiveSection("reports");
          setIsMobileMenuOpen(false);
        }}
      >
        <FaFileExport />
        <span className="staff-nav-text">Reports</span>
      </button>
      <button
        className={`staff-nav-item ${activeSection === "mcq-reports" ? 'staff-nav-active' : ''}`}
        onClick={() => {
          setActiveSection("mcq-reports");
          setIsMobileMenuOpen(false);
          // Auto fetch if not already loaded
          if (mcqResults.length === 0) {
            handleFetchMcqResults();
          }
        }}
      >
        <FaFilePdf />
        <span className="staff-nav-text">MCQ Reports</span>
      </button>
      <button
        className={`staff-nav-item ${activeSection === "qb-reports" ? 'staff-nav-active' : ''}`}
        onClick={() => {
          setActiveSection("qb-reports");
          setIsMobileMenuOpen(false);
          if (qbResults.length === 0) {
            handleFetchQbResults();
          }
        }}
      >
        <FaGraduationCap />
        <span className="staff-nav-text">Question Bank Reports</span>
      </button>
      <button
        className={`staff-nav-item ${activeSection === "spoken-reports" ? 'staff-nav-active' : ''}`}
        onClick={() => {
          setActiveSection("spoken-reports");
          setIsMobileMenuOpen(false);
        }}
      >
        <FaMicrophone />
        <span className="staff-nav-text">Spoken English Reports</span>
      </button>
      <button
        className={`staff-nav-item ${activeSection === "placements" ? 'staff-nav-active' : ''}`}
        onClick={() => {
          setActiveSection("placements");
          setIsMobileMenuOpen(false);
        }}
      >
        <FaBriefcase />
        <span className="staff-nav-text">Placements</span>
      </button>
      <button
        className={`staff-nav-item ${activeSection === "profile" ? 'staff-nav-active' : ''}`}
        onClick={() => {
          setActiveSection("profile");
          setIsMobileMenuOpen(false);
        }}
      >
        <FaUser />
        <span className="staff-nav-text">Profile</span>
      </button>
      <button
        className={`staff-nav-item ${activeSection === "settings" ? 'staff-nav-active' : ''}`}
        onClick={() => {
          setActiveSection("settings");
          setIsMobileMenuOpen(false);
        }}
      >
        <FaCog />
        <span className="staff-nav-text">Settings</span>
      </button>
    </nav>
  );

  // Add placeholder sections for new features
  const renderAnalytics = () => (
    <div className="staff-analytics-section">
      <h2 className="staff-section-title">Advanced Analytics</h2>
      <div className="staff-analytics-content">
        <p>Analytics features coming soon...</p>
        <ul>
          <li>Detailed Performance Metrics</li>
          <li>Custom Report Generation</li>
          <li>Predictive Analysis</li>
          <li>Learning Pattern Recognition</li>
        </ul>
      </div>
    </div>
  );

  const renderStudentManagement = () => (
    <div className="staff-students-section">
      <h2 className="staff-section-title">Student Management</h2>
      <div className="staff-students-content">
        <p>Student management features coming soon...</p>
        <ul>
          <li>Direct Student Communication</li>
          <li>Progress Tracking</li>
          <li>Performance Reviews</li>
          <li>Attendance Management</li>
        </ul>
      </div>
    </div>
  );

  const renderPlacements = () => (
    <div className="staff-placements-section">
      <h2 className="staff-section-title">Placements</h2>
      <div className="staff-placements-content">
        <p>Placement management features coming soon...</p>
        <ul>
          <li>Company Partner Management</li>
          <li>Job Posting Management</li>
          <li>Student Placement Tracking</li>
          <li>Interview Scheduling</li>
          <li>Offer Letter Management</li>
        </ul>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="staff-settings-section">
      <h2 className="staff-section-title">Dashboard Settings</h2>
      <div className="staff-settings-content">
        <p>Settings features coming soon...</p>
        <ul>
          <li>Dashboard Customization</li>
          <li>Notification Preferences</li>
          <li>Data Display Options</li>
          <li>Theme Settings</li>
        </ul>
      </div>
    </div>
  );

  const handleFetchMcqResults = async () => {
    try {
      setMcqLoading(true);
      setMcqError(null);
      const result = await MCQService.fetchMCQResults(userInfo.College);

      if (result.success) {
        setMcqResults(result.data || []);
        setFilteredMcqResults(result.data || []);

        // Extract unique tests, departments, and years
        const tests = Array.from(new Set((result.data || []).map(r => r['Test Name'])));
        const depts = Array.from(new Set((result.data || []).map(r => r['Department'])));
        const years = Array.from(new Set((result.data || []).map(r => r['Year'])));
        setMcqTestOptions(tests.sort());
        setMcqDeptOptions(depts.sort());
        setMcqYearOptions(years.sort());
      } else {
        setMcqError(result.message || "Failed to fetch MCQ results");
      }
    } catch (err) {
      console.error("Error fetching MCQ results:", err);
      setMcqError("An error occurred while fetching MCQ results");
    } finally {
      setMcqLoading(false);
    }
  };

  const handleFetchQbResults = async () => {
    try {
      setQbLoading(true);
      const { collection, getDocs } = await import('firebase/firestore');
      const snap = await getDocs(collection(db, 'codingProgress'));
      const progMap = {};
      snap.forEach(d => {
        progMap[d.id.toLowerCase()] = d.data();
      });

      const staffCollege = userInfo.College || user?.College || '';

      const records = (students || []).map(s => {
        const email = (s.Email || s.email || '').toLowerCase();
        const prog = progMap[email] || {};
        const solvedList = Array.isArray(prog.solvedProblems) ? prog.solvedProblems : [];
        const details = prog.problemDetails || {};
        const activity = prog.activity || {};
        
        let totalHours = 0;
        Object.values(activity).forEach(act => {
          totalHours += Number(act.hours) || 0;
        });

        return {
          rollNumber: s.RollNumber || s.rollNumber || s['Roll Number'] || 'N/A',
          name: s.Name || s.name || 'Student',
          email: s.Email || s.email || email,
          college: s.College || s.college || staffCollege,
          department: (s.Department || s.department || 'N/A').toUpperCase().trim(),
          year: String(s[yearKey] || s.Year || s.year || 'N/A'),
          totalSolved: solvedList.length,
          totalAttempted: Object.keys(details).length,
          totalHours
        };
      });

      const depts = [...new Set(records.map(r => r.department).filter(Boolean))].sort();
      const years = [...new Set(records.map(r => r.year).filter(Boolean))].sort();
      setQbDeptOptions(depts);
      setQbYearOptions(years);

      setQbResults(records);
      setFilteredQbResults(records);
    } catch (err) {
      console.error('Failed to fetch Question Bank results:', err);
    } finally {
      setQbLoading(false);
    }
  };

  useEffect(() => {
    let result = [...qbResults];
    if (qbDeptFilter) {
      result = result.filter(r => r.department === qbDeptFilter);
    }
    if (qbYearFilter) {
      result = result.filter(r => r.year === qbYearFilter);
    }
    if (qbSearchTerm) {
      const q = qbSearchTerm.toLowerCase();
      result = result.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.rollNumber.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      let aVal = a[qbSortConfig.key];
      let bVal = b[qbSortConfig.key];
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return qbSortConfig.order === 'asc' ? -1 : 1;
      if (aVal > bVal) return qbSortConfig.order === 'asc' ? 1 : -1;
      return 0;
    });

    setFilteredQbResults(result);
  }, [qbResults, qbDeptFilter, qbYearFilter, qbSearchTerm, qbSortConfig]);

  const handleExportQbResults = () => {
    const formatUsageTime = (hoursDecimal) => {
      const totalMins = Math.round((hoursDecimal || 0) * 60);
      const hrs = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      const hrText = hrs === 1 ? 'hr' : 'hrs';
      const minText = mins === 1 ? 'min' : 'mins';
      if (hrs === 0) return `${mins} ${minText}`;
      if (mins === 0) return `${hrs} ${hrText}`;
      return `${hrs} ${hrText} ${mins} ${minText}`;
    };

    const dataToExport = filteredQbResults.map((r, i) => ({
      "S.No": i + 1,
      "Roll Number": r.rollNumber,
      "Student Name": r.name,
      "Email": r.email,
      "College": r.college,
      "Department": r.department,
      "Year": r.year,
      "QB Solved Problems": r.totalSolved,
      "Attempted Problems": r.totalAttempted,
      "Practice Time": formatUsageTime(r.totalHours),
      "Status": r.totalSolved > 0 ? "Active Practitioner" : r.totalAttempted > 0 ? "Started" : "Inactive"
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "QB_Completion_Report");
    XLSX.writeFile(workbook, `QuestionBank_Completion_Report_${userInfo?.College || 'College'}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleMcqFilter = () => {
    let filtered = mcqResults;
    const search = mcqSearchTerm.toLowerCase().trim();

    if (search) {
      filtered = filtered.filter(r =>
        (r['Name'] || "").toLowerCase().includes(search) ||
        (r['Roll Number'] || "").toLowerCase().includes(search)
      );
    }

    if (mcqTestFilter) {
      filtered = filtered.filter(r => r['Test Name'] === mcqTestFilter);
    }

    if (mcqDeptFilter) {
      filtered = filtered.filter(r => r['Department'] === mcqDeptFilter);
    }

    if (mcqYearFilter) {
      filtered = filtered.filter(r => r['Year'] === mcqYearFilter);
    }

    // Apply Sorting
    filtered.sort((a, b) => {
      let valA = a[mcqSortConfig.key];
      let valB = b[mcqSortConfig.key];

      // Handle numeric values
      if (mcqSortConfig.key === 'Score' || mcqSortConfig.key === 'Percentage' || mcqSortConfig.key === 'Total Questions') {
        valA = parseFloat(valA) || 0;
        valB = parseFloat(valB) || 0;
      } else if (mcqSortConfig.key === 'Submitted At') {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      } else {
        valA = String(valA || "").toLowerCase();
        valB = String(valB || "").toLowerCase();
      }

      if (valA < valB) return mcqSortConfig.order === 'asc' ? -1 : 1;
      if (valA > valB) return mcqSortConfig.order === 'asc' ? 1 : -1;
      return 0;
    });

    setFilteredMcqResults(filtered);
  };

  const exportMcqReport = (format) => {
    const dataToExport = filteredMcqResults;
    if (dataToExport.length === 0) {
      alert("No data to export");
      return;
    }

    const filename = `MCQ_Report_${userInfo.College}_${mcqTestFilter || 'All'}_${timeService.getNow().toISOString().split('T')[0]}`;

    if (format === 'excel' || format === 'csv') {
      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "MCQ Results");
      XLSX.writeFile(wb, `${filename}.${format === 'excel' ? 'xlsx' : 'csv'}`);
    } else if (format === 'pdf') {
      const doc = new jsPDF('landscape');
      doc.setFontSize(16);
      doc.text(`${userInfo.College} - MCQ Report`, 14, 15);
      doc.setFontSize(11);
      doc.text(`Test: ${mcqTestFilter || 'All'} | Dept: ${mcqDeptFilter || 'All'}`, 14, 25);

      const headers = Object.keys(dataToExport[0]).filter(k => k !== 'Violations Details');
      const body = dataToExport.map(r => headers.map(h => r[h]));

      doc.autoTable({
        head: [headers],
        body: body,
        startY: 30,
        styles: { fontSize: 7 },
        margin: { top: 30 }
      });
      doc.save(`${filename}.pdf`);
    }
  };

  const renderReportsAnalytics = () => {
    // Analytics for current courses (scoreColumns)
    const activeScoreCols = selectedScoreColumns.length > 0 ? selectedScoreColumns : scoreColumns.slice(0, 5);

    // Average scores per course
    const courseLabels = activeScoreCols.map(col => COURSE_CONFIG[col]?.displayName || col);
    const courseAverages = activeScoreCols.map(col => {
      const scores = filteredStudents
        .map(s => parseFloat(s[col]))
        .filter(n => !isNaN(n) && n > 0);
      return scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 0;
    });

    // Student performance breakdown (Sum of all active scores if numeric)
    const performanceCategories = ['Excellent (>80%)', 'Good (60-80%)', 'Average (40-60%)', 'Below Avg (<40%)'];
    const distribution = [0, 0, 0, 0];

    filteredStudents.forEach(s => {
      let totalPoints = 0;
      let maxPoints = 0;
      activeScoreCols.forEach(col => {
        const score = parseFloat(s[col]);
        if (!isNaN(score)) {
          totalPoints += score;
          maxPoints += (COURSE_CONFIG[col]?.maxScore || 100);
        }
      });

      const percentage = maxPoints > 0 ? (totalPoints / maxPoints) * 100 : 0;
      if (percentage > 80) distribution[0]++;
      else if (percentage > 60) distribution[1]++;
      else if (percentage > 40) distribution[2]++;
      else distribution[3]++;
    });

    return (
      <div className="modal-overlay" onClick={() => setShowReportsAnalytics(false)}>
        <div className="modal-content analytics-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '1000px', width: '90%', maxHeight: '90vh', overflowY: 'auto', padding: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h2 className="staff-section-title" style={{ marginBottom: 0 }}>Reports Analytics - {filteredStudents.length} Students</h2>
            <button className="staff-reset-btn" onClick={() => setShowReportsAnalytics(false)}>
              <FaTimes /> Close
            </button>
          </div>

          <div className="staff-insights-grid">
            <div className="staff-insight-box">
              <h3>Average Scores by Course</h3>
              <Bar
                data={{
                  labels: courseLabels,
                  datasets: [{
                    label: 'Avg Score',
                    data: courseAverages,
                    backgroundColor: 'rgba(33, 150, 243, 0.5)',
                    borderColor: 'rgb(33, 150, 243)',
                    borderWidth: 1
                  }]
                }}
                options={{ responsive: true }}
              />
            </div>

            <div className="staff-insight-box">
              <h3>Overall Performance Distribution</h3>
              <Doughnut
                data={{
                  labels: performanceCategories,
                  datasets: [{
                    data: distribution,
                    backgroundColor: [
                      'rgba(76, 175, 80, 0.5)',
                      'rgba(33, 150, 243, 0.5)',
                      'rgba(255, 152, 0, 0.5)',
                      'rgba(244, 67, 54, 0.5)',
                    ]
                  }]
                }}
                options={{ responsive: true }}
              />
            </div>

            <div className="staff-stat-box full-width" style={{ marginTop: '1.5rem', flexBasis: '100%' }}>
              <h3>Dataset Performance Summary</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                <div className="staff-stat-item">
                  <span>Selected Students:</span>
                  <span>{filteredStudents.length}</span>
                </div>
                <div className="staff-stat-item">
                  <span>Avg Dept Performance:</span>
                  <span>{(courseAverages.reduce((a, b) => parseFloat(a) + parseFloat(b), 0) / (courseAverages.length || 1)).toFixed(1)} %</span>
                </div>
                <div className="staff-stat-item">
                  <span>High Achievers:</span>
                  <span>{distribution[0]}</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '2rem', fontSize: '0.8rem', color: '#666', fontStyle: 'italic' }}>
            * Analytics based on the currently filtered students and {selectedScoreColumns.length > 0 ? "selected" : "first 5"} score columns.
          </div>
        </div>
      </div>
    );
  };

  const renderMCQReports = () => (
    <div className="staff-reports-section">
      <div className="staff-section-header-row" style={{ padding: '0 1rem' }}>
        <h2 className="staff-section-title">MCQ Reports</h2>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            className="staff-filter-btn"
            onClick={() => setShowMcqAnalytics(true)}
            style={{ backgroundColor: '#673ab7' }}
            disabled={filteredMcqResults.length === 0}
          >
            <FaChartBar /> View Analytics
          </button>
          <button className="staff-filter-btn" onClick={handleFetchMcqResults} disabled={mcqLoading}>
            {mcqLoading ? "Refreshing..." : "Refresh Data"}
          </button>
        </div>
      </div>

      <div className="staff-filter-bar">
        <select
          className="staff-select"
          value={mcqTestFilter}
          onChange={(e) => setMcqTestFilter(e.target.value)}
        >
          <option value="">All Tests</option>
          {mcqTestOptions.map(test => <option key={test} value={test}>{test}</option>)}
        </select>

        <select
          className="staff-select"
          value={mcqDeptFilter}
          onChange={(e) => setMcqDeptFilter(e.target.value)}
        >
          <option value="">All Departments</option>
          {mcqDeptOptions.map(dept => <option key={dept} value={dept}>{dept}</option>)}
        </select>

        <select
          className="staff-select"
          value={mcqYearFilter}
          onChange={(e) => setMcqYearFilter(e.target.value)}
        >
          <option value="">All Years</option>
          {mcqYearOptions.map(year => <option key={year} value={year}>{year}</option>)}
        </select>

        <select
          className="staff-select"
          value={`${mcqSortConfig.key}-${mcqSortConfig.order}`}
          onChange={(e) => {
            const [key, order] = e.target.value.split('-');
            setMcqSortConfig({ key, order });
          }}
        >
          <option value="Score-desc">Score: High to Low</option>
          <option value="Score-asc">Score: Low to High</option>
          <option value="Submitted At-desc">Date: NewestFirst</option>
          <option value="Submitted At-asc">Date: OldestFirst</option>
          <option value="Name-asc">Name: A-Z</option>
        </select>

        <input
          className="staff-select"
          placeholder="Search Name / Roll No"
          value={mcqSearchTerm}
          onChange={(e) => setMcqSearchTerm(e.target.value)}
          style={{ minWidth: 200 }}
        />

        <button className="staff-filter-btn" onClick={handleMcqFilter}>
          <FaEye /> Apply Filters
        </button>

        <div className="staff-export-group" style={{ marginLeft: 'auto' }}>
          <button className="staff-export-btn" onClick={() => exportMcqReport('excel')}>
            <FaDownload /> Excel
          </button>
          <button className="staff-export-btn" onClick={() => exportMcqReport('pdf')} style={{ backgroundColor: '#d32f2f' }}>
            <FaFilePdf /> PDF
          </button>
        </div>
      </div>

      {mcqError && (
        <div className="staff-error-banner" style={{ margin: '1rem', padding: '1rem', background: '#ffebee', color: '#c62828', borderRadius: 8 }}>
          {mcqError}
        </div>
      )}

      {mcqLoading ? (
        <div className="staff-loading-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem' }}>
          <div className="staff-spinner"></div>
          <p style={{ marginTop: '1rem' }}>Fetching reports from database...</p>
        </div>
      ) : (
        <div className="staff-table-wrapper">
          <table className="staff-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Roll Number</th>
                <th>Year</th>
                <th>Dept</th>
                <th>Test Name</th>
                <th>Score</th>
                <th>Total</th>
                <th>%</th>
                <th>Time Taken</th>
                <th>Submitted At</th>
                <th>Auto</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredMcqResults.length > 0 ? (
                filteredMcqResults.map((result, idx) => (
                  <tr key={idx}>
                    <td>{result['Name']}</td>
                    <td>{result['Roll Number']}</td>
                    <td>{result['Year']}</td>
                    <td>{result['Department']}</td>
                    <td>{result['Test Name']}</td>
                    <td>{result['Score']}</td>
                    <td>{result['Total Questions']}</td>
                    <td>{result['Percentage'] ? (result['Percentage'] * 100).toFixed(1) + '%' :
                      result['score'] && result['totalQuestions'] ? ((result['score'] / result['totalQuestions']) * 100).toFixed(1) + '%' : "0%"}</td>
                    <td>{result['Time Taken']}</td>
                    <td>{result['Submitted At'] ? new Date(result['Submitted At']).toLocaleString() : "N/A"}</td>
                    <td>{result['Auto Submitted'] === 'Yes' ? 'Yes' : 'No'}</td>
                    <td>
                      <button 
                        onClick={() => handleGenerateStudentPDF(result)}
                        style={{
                          padding: '4px 8px',
                          fontSize: '0.75rem',
                          backgroundColor: '#4f46e5',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: 'bold'
                        }}
                      >
                        Pull Report
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="12" style={{ textAlign: 'center', padding: '2rem' }}>No MCQ results found for the selected criteria.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {showMcqAnalytics && renderMcqAnalytics()}
    </div>
  );

  const renderMcqAnalytics = () => {
    // Prepare Data for Score Distribution
    const scoreRanges = ['0-20%', '21-40%', '41-60%', '61-80%', '81-100%'];
    const distribution = [0, 0, 0, 0, 0];

    filteredMcqResults.forEach(r => {
      const p = (parseFloat(r['Percentage']) || 0) * 100;
      if (p <= 20) distribution[0]++;
      else if (p <= 40) distribution[1]++;
      else if (p <= 60) distribution[2]++;
      else if (p <= 80) distribution[3]++;
      else distribution[4]++;
    });

    // Prepare Data for Average Score by Department
    const deptAverages = {};
    filteredMcqResults.forEach(r => {
      const dept = r['Department'] || 'Unknown';
      const score = parseFloat(r['Percentage'] || 0) * 100;
      if (!deptAverages[dept]) deptAverages[dept] = { total: 0, count: 0 };
      deptAverages[dept].total += score;
      deptAverages[dept].count++;
    });

    const deptLabels = Object.keys(deptAverages);
    const deptData = deptLabels.map(l => (deptAverages[l].total / deptAverages[l].count).toFixed(1));

    return (
      <div className="modal-overlay" onClick={() => setShowMcqAnalytics(false)}>
        <div className="modal-content analytics-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '1000px', width: '90%', maxHeight: '90vh', overflowY: 'auto', padding: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h2 className="staff-section-title" style={{ marginBottom: 0 }}>MCQ Analytics - {mcqTestFilter || 'Filtered Data'}</h2>
            <button className="staff-reset-btn" onClick={() => setShowMcqAnalytics(false)}>
              <FaTimes /> Close
            </button>
          </div>

          <div className="staff-insights-grid">
            <div className="staff-insight-box">
              <h3>Score Distribution</h3>
              <Bar
                data={{
                  labels: scoreRanges,
                  datasets: [{
                    label: 'Number of Students',
                    data: distribution,
                    backgroundColor: 'rgba(103, 58, 183, 0.5)',
                    borderColor: 'rgb(103, 58, 183)',
                    borderWidth: 1
                  }]
                }}
                options={{ responsive: true }}
              />
            </div>

            <div className="staff-insight-box">
              <h3>Average Score by Department (%)</h3>
              <Pie
                data={{
                  labels: deptLabels,
                  datasets: [{
                    data: deptData,
                    backgroundColor: [
                      'rgba(54, 162, 235, 0.5)',
                      'rgba(255, 99, 132, 0.5)',
                      'rgba(255, 206, 86, 0.5)',
                      'rgba(75, 192, 192, 0.5)',
                    ]
                  }]
                }}
                options={{ responsive: true }}
              />
            </div>

            <div className="staff-stat-box full-width" style={{ marginTop: '1.5rem', flexBasis: '100%' }}>
              <h3>Summary Statistics</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                <div className="staff-stat-item">
                  <span>Total Students:</span>
                  <span>{filteredMcqResults.length}</span>
                </div>
                <div className="staff-stat-item">
                  <span>Average Score:</span>
                  <span>
                    {(filteredMcqResults.reduce((acc, r) => acc + (parseFloat(r['Percentage']) || 0), 0) / (filteredMcqResults.length || 1) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="staff-stat-item">
                  <span>Highest Score:</span>
                  <span>
                    {(Math.max(...filteredMcqResults.map(r => parseFloat(r['Percentage']) || 0)) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="staff-loading-wrapper">
        <div className="staff-spinner"></div>
        <p style={{ marginTop: '1rem', color: '#666' }}>Loading dashboard data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="staff-loading-wrapper">
        <div style={{
          padding: '2rem',
          background: '#fff',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <p style={{ color: '#d32f2f', marginBottom: '1rem' }}>{error}</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1rem',
              background: '#1a237e',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="staff-root">
      {/* Header */}
      <header className="staff-header-container">
        <div className="staff-header-inner">
          {window.innerWidth <= 768 ? (
            <>
              <button
                className="staff-menu-btn"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                <FaBars />
              </button>
              <div className="staff-header-logo-wrapper">
                <img
                  src="https://raw.githubusercontent.com/seeditDev/SEED-Website/f3cee9002410a00df4da7bea636ac9fbc4c312ca/Plugins/SEED_Logo.webp"
                  alt="SEED Logo"
                  className="staff-logo"
                />
              </div>
            </>
          ) : (
            <div className="staff-header-logo-wrapper">
              <img
                src="https://raw.githubusercontent.com/seeditDev/SEED-Website/f3cee9002410a00df4da7bea636ac9fbc4c312ca/Plugins/SEED_Logo.webp"
                alt="SEED Logo"
                className="staff-logo"
              />
              <span className="staff-portal-title">SEED-IT STAFF PORTAL</span>
            </div>
          )}
          <button className="staff-logout-btn" onClick={handleLogout}>
            <FaSignOutAlt />
          </button>
        </div>
      </header>

      <div className="staff-container">
        {/* Sidebar */}
        <div className={`staff-sidebar-container ${collapsed ? 'staff-sidebar-collapsed' : ''} ${isMobileMenuOpen ? 'staff-sidebar-mobile-open' : ''}`}>
          {window.innerWidth > 768 && (
            <button
              className="staff-collapse-btn"
              onClick={() => setCollapsed(!collapsed)}
            >
              <FaAngleDoubleLeft />
            </button>
          )}

          {renderNavigation()}
        </div>

        {/* Main Content */}
        <main className={`staff-main-content ${collapsed ? 'staff-main-collapsed' : ''}`}>
          {activeSection === "overview" && (
            <div className="staff-overview-section">
              <h2 className="staff-section-title">Staff Overview</h2>
              <div className="staff-overview-grid">
                <div className="staff-stat-box">
                  <h3>Total Students in {userInfo.College}</h3>
                  <p>{students.length}</p>
                </div>
                <div className="staff-stat-box">
                  <h3>Students by Department</h3>
                  <div className="staff-stat-details">
                    {Object.entries(
                      students.reduce((acc, student) => {
                        acc[student.Department] = (acc[student.Department] || 0) + 1;
                        return acc;
                      }, {})
                    )
                      .sort((a, b) => b[1] - a[1])
                      .map(([dept, count]) => (
                        <div key={dept} className="staff-stat-item">
                          <span>{dept}:</span>
                          <span>{count}</span>
                        </div>
                      ))}
                  </div>
                </div>
                <div className="staff-stat-box">
                  <h3>Students by Year</h3>
                  <div className="staff-stat-details">
                    {Array.from(new Set(students
                      .map(s => toCanonicalYear(s?.[yearKey] ?? s?.Year))
                      .filter(Boolean)
                    )).sort().map(y => {
                      const count = students.reduce((acc, s) => {
                        const cy = toCanonicalYear(s?.[yearKey] ?? s?.Year);
                        return acc + (cy === y ? 1 : 0);
                      }, 0);
                      return (
                        <div key={y} className="staff-stat-item">
                          <span>{y}:</span>
                          <span>{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="staff-stat-box course-progress-box">
                  <h3>Course Progress Overview</h3>
                  <div className="staff-stat-details">
                    {(() => {
                      const cols = (selectedScoreColumns && selectedScoreColumns.length > 0)
                        ? selectedScoreColumns
                        : scoreColumns;
                      if (!cols || cols.length === 0) {
                        return (
                          <div className="staff-stat-item">
                            <span>No score columns detected.</span>
                          </div>
                        );
                      }
                      const population = getAnalyticsPopulation();
                      const totalStudents = population.length;
                      return cols.map((scoreKey) => {
                        const conf = COURSE_CONFIG[scoreKey];
                        const isAttempted = (val) => {
                          const n = Number(val);
                          if (Number.isNaN(n)) return false;
                          if (n <= 0) return false; // 0 or negative = not attempted
                          return true; // Any positive score = attempted
                        };

                        const attempted = population.filter(s => isAttempted(s[scoreKey])).length;
                        const percentage = totalStudents > 0 ? ((attempted / totalStudents) * 100).toFixed(1) : '0.0';

                        const scores = population
                          .map(s => Number(s[scoreKey]))
                          .filter(n => !Number.isNaN(n) && isAttempted(n));
                        const above50Percent = scores.filter(n => {
                          if (conf?.maxScore > 0) {
                            return n >= 0.5 * conf.maxScore;
                          }
                          return n > 0; // For unconfigured courses, any positive score counts
                        }).length;

                        return (
                          <div key={scoreKey} className="staff-stat-item course-stat-item">
                            <div className="course-info">
                              <div className="course-header">
                                <span className="course-name">{conf?.displayName || getReadableCourseName(scoreKey)}</span>
                                <span className="course-details">
                                  Above 50%: {above50Percent} | Questions: {conf?.questions ?? '—'} | Attempted: {attempted}/{totalStudents}
                                </span>
                              </div>
                              <div className="progress-bar-container">
                                <div
                                  className="progress-bar"
                                  style={{ width: `${percentage}%` }}
                                ></div>
                              </div>
                            </div>
                            <div className="completion-info">
                              <span>{percentage}%</span>
                              <span className="completion-count">({attempted}/{totalStudents})</span>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === "insights" && renderInsights()}
          {activeSection === "analytics" && renderAnalytics()}
          {activeSection === "students" && renderStudentManagement()}
          {activeSection === "reports" && (
            <div className="staff-reports-section">
              <h2 className="staff-section-title">Student Reports</h2>
              <div className="staff-filter-bar">
                <select
                  className="staff-select"
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                >
                  <option value="">All Departments</option>
                  {departmentOptions.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
                <select
                  className="staff-select"
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                >
                  <option value="">All Years</option>
                  {yearOptions.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
                <input
                  className="staff-select"
                  placeholder="Search (any field)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ minWidth: 220 }}
                />

                <select
                  className="staff-select"
                  value={`${reportsSortConfig.key}-${reportsSortConfig.order}`}
                  onChange={(e) => {
                    const [key, order] = e.target.value.split('-');
                    setReportsSortConfig({ key, order });
                  }}
                >
                  <option value="Name-asc">Name: A-Z</option>
                  <option value="Name-desc">Name: Z-A</option>
                  <option value="Roll Number-asc">Roll No: Asc</option>
                  {scoreColumns.slice(0, 5).map(col => (
                    <option key={col} value={`${col}-desc`}>{col}: High to Low</option>
                  ))}
                </select>

                <button className="staff-filter-btn" onClick={handleFilter}>
                  <FaEye /> View
                </button>
                <button
                  className="staff-filter-btn"
                  onClick={() => {
                    if (filteredStudents.length === 0) handleFilter();
                    setShowReportsAnalytics(true);
                  }}
                  style={{ backgroundColor: '#673ab7' }}
                >
                  <FaChartBar /> Analytics
                </button>
                <button className="staff-reset-btn" onClick={handleReset}>
                  <FaTimes /> Reset
                </button>
                <div className="staff-export-group">
                  <select
                    className="staff-select export-select"
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value)}
                  >
                    <option value="excel">Excel</option>
                    <option value="pdf">PDF</option>
                    <option value="csv">CSV</option>
                  </select>
                  <button
                    className="staff-export-btn"
                    onClick={handleExport}
                    disabled={exportLoading}
                  >
                    {exportLoading ? (
                      <>
                        <div className="staff-spinner-small"></div>
                        Exporting...
                      </>
                    ) : (
                      <>
                        {exportFormat === 'excel' && <FaFileExport />}
                        {exportFormat === 'pdf' && <FaFilePdf />}
                        {exportFormat === 'csv' && <FaFileCsv />}
                        {' Export'}
                      </>
                    )}
                  </button>
                  <button
                    className="staff-reset-btn"
                    onClick={() => setShowExportOptions(prev => !prev)}
                    style={{ marginLeft: 8 }}
                  >
                    Choose Scores
                  </button>
                </div>
              </div>
              {showExportOptions && (
                <div className="staff-export-options" style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {scoreColumns.length === 0 ? (
                    <span style={{ color: '#666' }}>No score columns detected.</span>
                  ) : (
                    scoreColumns.map(col => (
                      <label key={col} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f7f8fc', padding: '6px 10px', borderRadius: 6 }}>
                        <input
                          type="checkbox"
                          checked={selectedScoreColumns.includes(col)}
                          onChange={(e) => {
                            setSelectedScoreColumns(prev => {
                              if (e.target.checked) return [...prev, col];
                              return prev.filter(c => c !== col);
                            });
                          }}
                        />
                        <span>{col}</span>
                      </label>
                    ))
                  )}
                  {scoreColumns.length > 0 && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="staff-filter-btn" onClick={() => setSelectedScoreColumns(scoreColumns)}>Select All</button>
                      <button className="staff-reset-btn" onClick={() => setSelectedScoreColumns([])}>Clear</button>
                    </div>
                  )}
                </div>
              )}
              {showTable && (
                <div className="staff-table-wrapper">
                  <table className="staff-table">
                    <thead>
                      <tr>
                        {tableColumns.map((col) => (
                          <th key={col}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((student) => (
                        <tr key={student['Roll Number'] || student.Email || student.ID || student.Name}>
                          {tableColumns.map((col) => (
                            <td key={col}>{student[col] ?? ''}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {showReportsAnalytics && renderReportsAnalytics()}
          {activeSection === "mcq-reports" && renderMCQReports()}
          {activeSection === "qb-reports" && (() => {
            const formatUsageTime = (hoursDecimal) => {
              const totalMins = Math.round((hoursDecimal || 0) * 60);
              const hrs = Math.floor(totalMins / 60);
              const mins = totalMins % 60;
              const hrText = hrs === 1 ? 'hr' : 'hrs';
              const minText = mins === 1 ? 'min' : 'mins';
              if (hrs === 0) return `${mins} ${minText}`;
              if (mins === 0) return `${hrs} ${hrText}`;
              return `${hrs} ${hrText} ${mins} ${minText}`;
            };

            const activeCount = filteredQbResults.filter(r => r.totalSolved > 0).length;
            const totalSolvedSum = filteredQbResults.reduce((acc, r) => acc + r.totalSolved, 0);

            return (
              <div className="staff-reports-section">
                <div className="staff-section-header-row" style={{ padding: '0 1rem' }}>
                  <div>
                    <h2 className="staff-section-title">Question Bank Completion Reports</h2>
                    <p style={{ color: 'var(--ps-text-dim)', fontSize: '13px', margin: '4px 0 0' }}>
                      Track student problem-solving progress across Question Bank modules in your college
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button className="staff-filter-btn" onClick={handleFetchQbResults} disabled={qbLoading}>
                      {qbLoading ? "Refreshing..." : "Refresh Data"}
                    </button>
                    <button className="staff-filter-btn" style={{ background: '#10b981' }} onClick={handleExportQbResults} disabled={filteredQbResults.length === 0}>
                      <FaDownload /> Export Excel
                    </button>
                  </div>
                </div>

                {/* Stat Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', padding: '0 1rem', margin: '16px 0' }}>
                  <div className="staff-metric-card" style={{ background: 'var(--bg-secondary, #1e293b)', border: '1px solid var(--border-color, #334155)', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>COHORT STUDENTS</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f1f5f9', marginTop: '4px' }}>{filteredQbResults.length}</div>
                  </div>
                  <div className="staff-metric-card" style={{ background: 'var(--bg-secondary, #1e293b)', border: '1px solid var(--border-color, #334155)', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>ACTIVE SOLVERS</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981', marginTop: '4px' }}>{activeCount}</div>
                  </div>
                  <div className="staff-metric-card" style={{ background: 'var(--bg-secondary, #1e293b)', border: '1px solid var(--border-color, #334155)', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>TOTAL SOLVED PROBLEMS</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#38bdf8', marginTop: '4px' }}>{totalSolvedSum}</div>
                  </div>
                  <div className="staff-metric-card" style={{ background: 'var(--bg-secondary, #1e293b)', border: '1px solid var(--border-color, #334155)', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>AVG SOLVED / ACTIVE STUDENT</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#a855f7', marginTop: '4px' }}>
                      {activeCount > 0 ? (totalSolvedSum / activeCount).toFixed(1) : '0'}
                    </div>
                  </div>
                </div>

                {/* Filter Bar */}
                <div className="staff-filter-bar">
                  <select
                    className="staff-select"
                    value={qbDeptFilter}
                    onChange={(e) => setQbDeptFilter(e.target.value)}
                  >
                    <option value="">All Departments</option>
                    {qbDeptOptions.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                  </select>

                  <select
                    className="staff-select"
                    value={qbYearFilter}
                    onChange={(e) => setQbYearFilter(e.target.value)}
                  >
                    <option value="">All Years</option>
                    {qbYearOptions.map(year => <option key={year} value={year}>{year}</option>)}
                  </select>

                  <select
                    className="staff-select"
                    value={`${qbSortConfig.key}-${qbSortConfig.order}`}
                    onChange={(e) => {
                      const [key, order] = e.target.value.split('-');
                      setQbSortConfig({ key, order });
                    }}
                  >
                    <option value="totalSolved-desc">Most Solved First</option>
                    <option value="totalSolved-asc">Least Solved First</option>
                    <option value="name-asc">Name (A-Z)</option>
                    <option value="rollNumber-asc">Roll Number (A-Z)</option>
                  </select>

                  <input
                    type="text"
                    className="staff-search-input"
                    placeholder="Search by name, roll no, or email..."
                    value={qbSearchTerm}
                    onChange={(e) => setQbSearchTerm(e.target.value)}
                  />
                </div>

                {/* Data Table */}
                <div className="staff-table-container">
                  {qbLoading ? (
                    <div className="staff-loading-spinner">Loading Question Bank Reports...</div>
                  ) : filteredQbResults.length === 0 ? (
                    <div className="staff-no-data">No student question bank progress records found.</div>
                  ) : (
                    <table className="staff-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Roll Number</th>
                          <th>Student Name</th>
                          <th>Department</th>
                          <th>Year</th>
                          <th>Solved Problems</th>
                          <th>Attempted</th>
                          <th>Practice Time</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredQbResults.map((r, idx) => {
                          const statusBadgeClass = r.totalSolved > 0 ? 'passed' : r.totalAttempted > 0 ? 'warning' : 'failed';
                          const statusText = r.totalSolved > 0 ? 'Active' : r.totalAttempted > 0 ? 'Started' : 'Inactive';
                          return (
                            <tr key={idx}>
                              <td>{idx + 1}</td>
                              <td><strong>{r.rollNumber}</strong></td>
                              <td>{r.name}</td>
                              <td>{r.department}</td>
                              <td>{r.year}</td>
                              <td>
                                <span className={`staff-score-badge ${r.totalSolved >= 50 ? 'passed' : r.totalSolved > 0 ? 'warning' : 'failed'}`}>
                                  {r.totalSolved} solved
                                </span>
                              </td>
                              <td>{r.totalAttempted}</td>
                              <td style={{ fontWeight: 600, color: '#38bdf8' }}>{formatUsageTime(r.totalHours)}</td>
                              <td>
                                <span className={`staff-status-badge ${statusBadgeClass}`}>
                                  {statusText}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            );
          })()}
          {activeSection === "spoken-reports" && (
            <div className="staff-section-card">
              <h2 className="staff-section-title"><FaMicrophone /> Spoken English & Communication Reports</h2>
              <p className="staff-section-subtitle">Candidate CEFR level, WPM pace metrics, and communication skills diagnostics for {user?.College || 'College'}</p>
              
              <div className="staff-table-container" style={{ marginTop: '20px' }}>
                <table className="staff-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Roll Number</th>
                      <th>Student Name</th>
                      <th>Department</th>
                      <th>Year</th>
                      <th>CEFR Level</th>
                      <th>Accuracy Score</th>
                      <th>Speaking Pace</th>
                      <th>Fillers Used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mcqResults.filter(r => r.testType === 'spoken_english' || r.cefrLevel).length === 0 ? (
                      <tr>
                        <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                          No spoken English assessment records found for this college.
                        </td>
                      </tr>
                    ) : (
                      mcqResults.filter(r => r.testType === 'spoken_english' || r.cefrLevel).map((r, idx) => (
                        <tr key={idx}>
                          <td>{idx + 1}</td>
                          <td><strong>{r.rollNumber || 'N/A'}</strong></td>
                          <td>{r.studentName || r.name || 'N/A'}</td>
                          <td>{r.department || 'N/A'}</td>
                          <td>{r.year || 'N/A'}</td>
                          <td>
                            <span className="staff-score-badge passed">
                              {r.cefrLevel || 'B2'} ({r.cefrName || 'Upper Inter'})
                            </span>
                          </td>
                          <td style={{ fontWeight: 800, color: '#38bdf8' }}>{r.percentage || r.score || 0}%</td>
                          <td style={{ fontWeight: 600 }}>{r.wpm || 0} WPM</td>
                          <td>
                            <span className={`staff-status-badge ${(r.fillerCount || 0) > 3 ? 'warning' : 'passed'}`}>
                              {r.fillerCount || 0} fillers
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {activeSection === "profile" && (
            <div className="staff-profile-section">
              <h2 className="staff-section-title">Staff Profile</h2>
              <div className="staff-profile-content">
                <div className="staff-profile-item">
                  <label>Name:</label>
                  <p>{user?.Name}</p>
                </div>
                <div className="staff-profile-item">
                  <label>Email:</label>
                  <p>{user?.Email}</p>
                </div>
                <div className="staff-profile-item">
                  <label>Department:</label>
                  <p>{user?.Department || 'Not specified'}</p>
                </div>
                <div className="staff-profile-item">
                  <label>College:</label>
                  <p>{user?.College}</p>
                </div>
                <div className="staff-profile-item">
                  <label>Role:</label>
                  <p>{user?.Role}</p>
                </div>
              </div>
            </div>
          )}
          {activeSection === "placements" && renderPlacements()}
          {activeSection === "settings" && renderSettings()}
        </main>
      </div>

      {/* Logout Animation Modal */}
      {showLogoutAnimation && (
        <div className="modal-overlay">
          <div className="logout-modal">
            <div className="logout-icon-container">
              <FaSignOutAlt className="logout-icon" />
            </div>
            <p>Goodbye, {user?.Name}!</p>
            <p className="redirect-text">Logging you out...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffDashboard;