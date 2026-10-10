import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import {
  Database,
  Clock,
  ArrowRight,
  Play,
  RotateCcw,
  Check,
  CheckCircle2,
  Table,
  Key,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Search,
  Download,
  Info,
  Code,
  MessageSquare,
  Network,
  X,
  AlertTriangle,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  GripVertical,
  GripHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import { executeStudentQuery } from '../services/sql/sqlExecutionEngine';
import { evaluateStudentResult } from '../services/sql/sqlEvaluator';

// Default corporate schema fallback if sectionData has no tables
const DEFAULT_TABLES = [
  {
    tableName: 'employees',
    description: 'Company employee records with compensation and department mapping',
    columns: [
      { name: 'id', type: 'INTEGER', isPrimaryKey: true, description: 'Primary key' },
      { name: 'name', type: 'TEXT', description: 'Employee name' },
      { name: 'department_id', type: 'INTEGER', description: 'Reference to departments.id' },
      { name: 'salary', type: 'NUMERIC', description: 'Monthly/Annual salary' },
      { name: 'hire_date', type: 'TEXT', description: 'Date of joining' },
    ],
    sampleData: [
      { id: 1, name: 'Alice', department_id: 2, salary: 85000, hire_date: '2021-03-15' },
      { id: 2, name: 'Ben', department_id: 1, salary: 62000, hire_date: '2022-07-10' },
      { id: 3, name: 'Chloe', department_id: 2, salary: 93000, hire_date: '2020-11-02' },
      { id: 4, name: 'David', department_id: 1, salary: 72000, hire_date: '2021-06-18' },
      { id: 5, name: 'Emma', department_id: 3, salary: 58000, hire_date: '2022-01-25' },
      { id: 6, name: 'Frank', department_id: 2, salary: 81000, hire_date: '2020-04-12' },
      { id: 7, name: 'Grace', department_id: 4, salary: 99000, hire_date: '2019-09-01' },
      { id: 8, name: 'Henry', department_id: 1, salary: 67000, hire_date: '2023-03-30' },
      { id: 9, name: 'Isla', department_id: 3, salary: 76000, hire_date: '2021-12-14' },
      { id: 10, name: 'Jack', department_id: 4, salary: 88000, hire_date: '2022-08-19' },
      { id: 11, name: 'Karen', department_id: 2, salary: 91000, hire_date: '2018-05-22' },
      { id: 12, name: 'Leo', department_id: 1, salary: 54000, hire_date: '2023-10-05' },
      { id: 13, name: 'Mia', department_id: 3, salary: 83000, hire_date: '2020-08-17' },
      { id: 14, name: 'Noah', department_id: 4, salary: 71000, hire_date: '2022-02-11' },
      { id: 15, name: 'Olivia', department_id: 2, salary: 96000, hire_date: '2019-03-08' },
    ],
  },
  {
    tableName: 'departments',
    description: 'Corporate organizational divisions and office locations',
    columns: [
      { name: 'id', type: 'INTEGER', isPrimaryKey: true, description: 'Department ID' },
      { name: 'name', type: 'TEXT', description: 'Department name' },
      { name: 'location', type: 'TEXT', description: 'Office location' },
    ],
    sampleData: [
      { id: 1, name: 'Engineering', location: 'Building A' },
      { id: 2, name: 'Product', location: 'Building B' },
      { id: 3, name: 'Design', location: 'Building B' },
      { id: 4, name: 'Marketing', location: 'Building C' },
      { id: 5, name: 'Finance', location: 'Building D' },
    ],
  },
  {
    tableName: 'projects',
    description: 'Ongoing strategic initiatives and assigned budget allocations',
    columns: [
      { name: 'id', type: 'INTEGER', isPrimaryKey: true, description: 'Project ID' },
      { name: 'title', type: 'TEXT', description: 'Project title' },
      { name: 'department_id', type: 'INTEGER', description: 'Assigned department' },
      { name: 'budget', type: 'NUMERIC', description: 'Total allocated budget' },
    ],
    sampleData: [
      { id: 101, title: 'Cloud Migration', department_id: 1, budget: 150000 },
      { id: 102, title: 'Mobile App Redesign', department_id: 3, budget: 85000 },
      { id: 103, title: 'Q4 Brand Campaign', department_id: 4, budget: 60000 },
      { id: 104, title: 'AI Recommendation Engine', department_id: 1, budget: 220000 },
      { id: 105, title: 'Customer Feedback Portal', department_id: 2, budget: 95000 },
    ],
  },
];

// Fallback questions matching the 8 challenges shown in the reference UI
const DEFAULT_QUESTIONS = [
  {
    id: 'sql_q1',
    title: 'High-Earning Staff',
    category: 'Basic Query',
    difficulty: 'EASY',
    marks: 10,
    problemStatement:
      'Write an SQL query to retrieve the name and salary of all employees whose salary is greater than 70000, ordered by salary in descending order.',
    guidelines: [
      'The query should return the columns: name, salary.',
      'Only include employees with salary > 70000.',
      'Sort the result by salary in descending order.',
    ],
    starterQuery: 'SELECT name, salary\nFROM employees\n-- Add your conditions here\n;\n',
    referenceQuery:
      'SELECT name, salary FROM employees WHERE salary > 70000 ORDER BY salary DESC;',
    expectedResult: {
      columns: ['name', 'salary'],
      rows: [
        ['Grace', 99000],
        ['Olivia', 96000],
        ['Chloe', 93000],
        ['Karen', 91000],
        ['Jack', 88000],
        ['Alice', 85000],
        ['Mia', 83000],
        ['Frank', 81000],
        ['Isla', 76000],
        ['David', 72000],
        ['Noah', 71000],
      ],
      rowCount: 11,
    },
    evaluationRules: {
      requireOrderedRows: true,
      caseSensitiveColumns: false,
      toleranceEpsilon: 0.001,
    },
  },
  {
    id: 'sql_q2',
    title: 'Department Insights',
    category: 'Aggregation',
    difficulty: 'EASY',
    marks: 10,
    problemStatement:
      'Calculate the average salary and employee count for each department_id. Return department_id, avg_salary, and total_employees, ordered by department_id.',
    guidelines: [
      'Columns: department_id, avg_salary, total_employees.',
      'Use AVG(salary) and COUNT(*).',
      'Order by department_id ascending.',
    ],
    starterQuery: 'SELECT department_id\nFROM employees\nGROUP BY department_id\n;',
  },
  {
    id: 'sql_q3',
    title: 'Join and Filter',
    category: 'Joins',
    difficulty: 'MEDIUM',
    marks: 10,
    problemStatement:
      'Retrieve employee names along with their department names and locations by joining employees and departments.',
    guidelines: [
      'Columns: employee_name, department_name, location.',
      'Join employees with departments on department_id = id.',
      'Order by employee_name ascending.',
    ],
    starterQuery: 'SELECT e.name AS employee_name, d.name AS department_name\nFROM employees e\nJOIN departments d ON e.department_id = d.id\n;',
  },
  {
    id: 'sql_q4',
    title: 'Department Salary Stats',
    category: 'Aggregation + Join',
    difficulty: 'MEDIUM',
    marks: 10,
    problemStatement:
      'Find the highest salary and total payroll for each department name.',
    guidelines: [
      'Columns: department_name, max_salary, total_payroll.',
      'Group by departments.name.',
    ],
    starterQuery: 'SELECT d.name AS department_name, MAX(e.salary) AS max_salary\nFROM departments d\nJOIN employees e ON d.id = e.department_id\nGROUP BY d.name\n;',
  },
  {
    id: 'sql_q5',
    title: 'Recent Hires',
    category: 'Date Functions',
    difficulty: 'EASY',
    marks: 10,
    problemStatement:
      'List all employees hired on or after 2021-01-01, sorted from newest hire to oldest.',
    guidelines: [
      'Columns: name, hire_date, salary.',
      'Filter: hire_date >= "2021-01-01".',
      'Sort by hire_date DESC.',
    ],
    starterQuery: 'SELECT name, hire_date, salary\nFROM employees\nWHERE hire_date >= "2021-01-01"\nORDER BY hire_date DESC\n;',
  },
  {
    id: 'sql_q6',
    title: 'Department Headcount',
    category: 'Group By',
    difficulty: 'MEDIUM',
    marks: 10,
    problemStatement:
      'Find all departments that have 3 or more employees. Return department_id and member_count.',
    guidelines: [
      'Columns: department_id, member_count.',
      'Use HAVING COUNT(*) >= 3.',
    ],
    starterQuery: 'SELECT department_id, COUNT(*) AS member_count\nFROM employees\nGROUP BY department_id\nHAVING COUNT(*) >= 3\n;',
  },
  {
    id: 'sql_q7',
    title: 'Top Performers',
    category: 'Ranking',
    difficulty: 'MEDIUM',
    marks: 10,
    problemStatement:
      'Retrieve the top 3 highest-earning employees across the entire company.',
    guidelines: [
      'Columns: name, salary.',
      'Order by salary DESC and limit output to 3 records.',
    ],
    starterQuery: 'SELECT name, salary\nFROM employees\nORDER BY salary DESC\nLIMIT 3\n;',
  },
  {
    id: 'sql_q8',
    title: 'Complex Analysis',
    category: 'Multiple Tables',
    difficulty: 'HARD',
    marks: 10,
    problemStatement:
      'Calculate the total budget of all projects associated with each department, alongside department name.',
    guidelines: [
      'Columns: department_name, total_project_budget.',
      'Join departments with projects on departments.id = projects.department_id.',
      'Order by total_project_budget DESC.',
    ],
    starterQuery: 'SELECT d.name AS department_name, SUM(p.budget) AS total_project_budget\nFROM departments d\nJOIN projects p ON d.id = p.department_id\nGROUP BY d.name\nORDER BY total_project_budget DESC\n;',
  },
];

export default function SQLSectionView({
  sectionData,
  secTimer = 1782, // Default ~29:42 if not provided
  secStarted = true,
  proctoringData = {},
  settings = {},
  onSectionSubmit,
  assessmentName = '',
  assessmentId = '',
  user = null,
}) {
  // 1. Normalize questions array
  const questions = useMemo(() => {
    const rawList =
      sectionData?.questions ||
      sectionData?.sqlQuestions ||
      sectionData?.challenges ||
      sectionData?.items ||
      [];

    const list = Array.isArray(rawList) && rawList.length > 0 ? rawList : DEFAULT_QUESTIONS;

    return list.map((q, idx) => {
      let expectedResult = q.expectedResult || null;
      if (expectedResult && typeof expectedResult === 'object') {
        let rows = expectedResult.rows;
        if (!Array.isArray(rows) && typeof expectedResult.rowsJson === 'string') {
          try {
            rows = JSON.parse(expectedResult.rowsJson);
          } catch {
            rows = [];
          }
        }
        expectedResult = {
          columns: Array.isArray(expectedResult.columns) ? expectedResult.columns : [],
          rows: Array.isArray(rows) ? rows : [],
          rowCount: Number(expectedResult.rowCount ?? (Array.isArray(rows) ? rows.length : 0)),
        };
      }

      // Extract guidelines from hints/requirements if available
      let guidelines = [];
      if (Array.isArray(q.guidelines) && q.guidelines.length > 0) {
        guidelines = q.guidelines;
      } else if (Array.isArray(q.requirements) && q.requirements.length > 0) {
        guidelines = q.requirements;
      } else if (Array.isArray(q.hints) && q.hints.length > 0) {
        guidelines = q.hints;
      } else if (typeof q.hints === 'string' && q.hints.trim()) {
        guidelines = q.hints.split('\n').filter(Boolean);
      } else if (expectedResult?.columns?.length) {
        guidelines = [
          `The query should return the columns: ${expectedResult.columns.join(', ')}.`,
          'Filter and sort the result according to problem requirements.',
        ];
      }

      return {
        ...q,
        id: q.id || q.questionId || `sql_q_${idx + 1}`,
        title: q.title || `SQL Question ${idx + 1}`,
        category: q.category || q.tag || (idx === 0 ? 'Basic Query' : 'Query Challenge'),
        difficulty: (q.difficulty || 'EASY').toUpperCase(),
        marks: Number(q.marks || 10),
        problemStatement:
          q.problemStatement ||
          q.description ||
          q.statement ||
          'Write an SQL query to retrieve the required records from the database.',
        guidelines,
        starterQuery: q.starterQuery || 'SELECT name, salary\nFROM employees\n-- Add your conditions here\n;\n',
        expectedResult,
        evaluationRules: q.evaluationRules || {},
      };
    });
  }, [sectionData]);

  // 2. Normalize database tables
  const tables = useMemo(() => {
    let rawTables = [];
    if (sectionData?.schema?.tables && Array.isArray(sectionData.schema.tables)) {
      rawTables = sectionData.schema.tables;
    } else if (sectionData?.sqlSchema?.tables && Array.isArray(sectionData.sqlSchema.tables)) {
      rawTables = sectionData.sqlSchema.tables;
    } else if (Array.isArray(sectionData?.tables)) {
      rawTables = sectionData.tables;
    }

    if (!Array.isArray(rawTables) || rawTables.length === 0) {
      return DEFAULT_TABLES;
    }

    // Merge missing sample data from default tables if needed
    return rawTables.map((tbl) => {
      const fallback = DEFAULT_TABLES.find((d) => d.tableName.toLowerCase() === tbl.tableName.toLowerCase());
      return {
        ...tbl,
        description: tbl.description || fallback?.description || 'Database entity table',
        columns: Array.isArray(tbl.columns) && tbl.columns.length > 0 ? tbl.columns : fallback?.columns || [],
        sampleData: Array.isArray(tbl.sampleData) && tbl.sampleData.length > 0 ? tbl.sampleData : fallback?.sampleData || [],
      };
    });
  }, [sectionData]);

  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [isExecuting, setIsExecuting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Active Schema Table state
  const [activeTableName, setActiveTableName] = useState(() => tables[0]?.tableName || 'employees');
  const [isActiveTableOpen, setIsActiveTableOpen] = useState(true);
  const [tableSubTab, setTableSubTab] = useState('schema'); // 'schema' | 'data'
  const [tablePage, setTablePage] = useState(1);
  const [schemaSearch, setSchemaSearch] = useState('');
  const [showAllRowsModal, setShowAllRowsModal] = useState(false);

  // Bottom Output Tab state: 'results' | 'message' | 'plan'
  const [outputTab, setOutputTab] = useState('results');

  // Storage key for local draft persistence
  const storageKey = useMemo(() => {
    const uId = user?.uid || user?.id || 'guest';
    const aId = assessmentId || sectionData?.assessmentId || 'assessment';
    const sId = sectionData?.sectionId || sectionData?.id || 'sql_section';
    return `msa_sql_v2_${uId}_${aId}_${sId}`;
  }, [user, assessmentId, sectionData]);

  // Per-question state keyed by question id
  const [qStates, setQStates] = useState(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch (_) {}

    const init = {};
    questions.forEach((q) => {
      init[q.id] = {
        query: q.starterQuery,
        lastResult: null,
        submitted: false,
        marksAwarded: 0,
        status: 'UNATTEMPTED',
        lastFeedback: null,
      };
    });
    return init;
  });

  // Sync to sessionStorage on state changes
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(qStates));
    } catch (_) {}
  }, [qStates, storageKey]);

  const activeQ = questions[currentQIdx] || questions[0] || {};
  const activeState = qStates[activeQ.id] || {
    query: activeQ.starterQuery || '',
    lastResult: null,
    submitted: false,
    marksAwarded: 0,
    status: 'UNATTEMPTED',
    lastFeedback: null,
  };

  const currentQuery = activeState.query;

  const handleQueryChange = (val) => {
    setQStates((prev) => ({
      ...prev,
      [activeQ.id]: {
        ...prev[activeQ.id],
        query: val,
      },
    }));
  };

  // Run Query (Test Execution)
  const handleRunQuery = async () => {
    if (!currentQuery.trim()) {
      toast.error('Please enter a query before running.');
      return;
    }

    setIsExecuting(true);
    try {
      const res = executeStudentQuery(tables, currentQuery, { timeoutMs: 3500 });
      setQStates((prev) => ({
        ...prev,
        [activeQ.id]: {
          ...prev[activeQ.id],
          lastResult: res,
        },
      }));

      setOutputTab('results');

      if (!res.success) {
        toast.error(`Execution error: ${res.error}`);
      } else {
        toast.success(`Query returned ${res.rowCount} row(s) in ${res.executionTimeMs}ms.`);
      }
    } catch (err) {
      toast.error(`Execution failed: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  // Submit Answer for this specific question
  const handleSubmitAnswer = async () => {
    if (!currentQuery.trim()) {
      toast.error('Query cannot be empty');
      return;
    }

    setIsExecuting(true);
    try {
      const execRes = executeStudentQuery(tables, currentQuery, { timeoutMs: 3500 });
      const evalRes = evaluateStudentResult(
        execRes,
        activeQ.expectedResult,
        activeQ.marks,
        activeQ.evaluationRules
      );

      setQStates((prev) => ({
        ...prev,
        [activeQ.id]: {
          ...prev[activeQ.id],
          lastResult: execRes,
          submitted: true,
          marksAwarded: evalRes.marksAwarded,
          status: evalRes.status,
          lastFeedback: evalRes.feedback,
        },
      }));

      setOutputTab('results');

      if (evalRes.passed) {
        toast.success(`Question Submitted! Full marks awarded (${evalRes.marksAwarded}/${activeQ.marks}).`);
      } else {
        toast.warning(`Submitted: ${evalRes.feedback}`);
      }
    } catch (err) {
      toast.error(`Submission error: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  // Reset Query to default starter
  const handleResetQuery = () => {
    setQStates((prev) => ({
      ...prev,
      [activeQ.id]: {
        ...prev[activeQ.id],
        query: activeQ.starterQuery || 'SELECT name, salary\nFROM employees\n;\n',
      },
    }));
    toast.info('Query reset to default template.');
  };

  // Download CSV of current execution result
  const handleDownloadCSV = () => {
    const res = activeState?.lastResult;
    if (!res || !res.columns || !res.rows || res.rows.length === 0) {
      toast.error('No result data available to download.');
      return;
    }

    const header = res.columns.join(',');
    const rows = res.rows.map((row) =>
      row
        .map((cell) => {
          if (cell === null || cell === undefined) return '';
          const str = String(cell);
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(',')
    );

    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${activeQ.title.replace(/\s+/g, '_')}_result.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Downloaded query result as CSV.');
  };

  // Submit the entire SQL section
  const handleFinalSectionSubmit = () => {
    let totalAwarded = 0;
    let maxSectionMarks = 0;
    const submissions = [];

    questions.forEach((q) => {
      const state = qStates[q.id] || {};
      const marks = Number(state.marksAwarded || 0);
      totalAwarded += marks;
      maxSectionMarks += q.marks;

      submissions.push({
        questionId: q.id,
        title: q.title,
        marksAwarded: marks,
        maxMarks: q.marks,
        status: state.status || 'UNATTEMPTED',
        submittedQuery: state.query || '',
        submitted: Boolean(state.submitted),
      });
    });

    const sectionResult = {
      sectionId: sectionData?.sectionId || sectionData?.id || 'sql_section',
      sectionType: 'sql',
      name: sectionData?.name || 'SQL Assessment Section',
      totalMarks: maxSectionMarks,
      score: totalAwarded,
      marksAwarded: totalAwarded,
      maxMarks: maxSectionMarks,
      percentage: maxSectionMarks > 0 ? Math.round((totalAwarded / maxSectionMarks) * 100) : 0,
      questionsAttempted: submissions.filter((s) => s.submitted).length,
      totalQuestions: questions.length,
      submissions,
      sqlSubmissions: submissions,
    };

    setShowSubmitModal(false);
    if (typeof onSectionSubmit === 'function') {
      onSectionSubmit(sectionResult);
    }
  };

  // Persistent pane sizes and collapse state
  const [isQuestionsCollapsed, setIsQuestionsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sql_pane_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [questionsWidth, setQuestionsWidth] = useState(() => {
    try {
      const val = Number(localStorage.getItem('sql_pane_q_width'));
      if (val >= 160 && val <= 460) return val;
    } catch {}
    return 256;
  });

  const [schemaWidth, setSchemaWidth] = useState(() => {
    try {
      const val = Number(localStorage.getItem('sql_pane_schema_width'));
      if (val >= 260 && val <= 700) return val;
    } catch {}
    return 440;
  });

  const [editorHeightPct, setEditorHeightPct] = useState(() => {
    try {
      const val = Number(localStorage.getItem('sql_pane_editor_pct'));
      if (val >= 20 && val <= 80) return val;
    } catch {}
    return 52;
  });

  useEffect(() => {
    try {
      localStorage.setItem('sql_pane_collapsed', String(isQuestionsCollapsed));
      localStorage.setItem('sql_pane_q_width', String(questionsWidth));
      localStorage.setItem('sql_pane_schema_width', String(schemaWidth));
      localStorage.setItem('sql_pane_editor_pct', String(editorHeightPct));
    } catch {}
  }, [isQuestionsCollapsed, questionsWidth, schemaWidth, editorHeightPct]);

  // Drag resizing state
  const [draggingType, setDraggingType] = useState(null); // 'questions' | 'schema' | 'editor' | null
  const dragRef = React.useRef(null);
  const rightPaneRef = React.useRef(null);

  const handleSplitterMouseDown = (type, e) => {
    e.preventDefault();
    setDraggingType(type);
    dragRef.current = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      startQuestionsWidth: questionsWidth,
      startSchemaWidth: schemaWidth,
      startEditorHeightPct: editorHeightPct,
    };
  };

  useEffect(() => {
    if (!draggingType) return;

    const handleMouseMove = (e) => {
      if (!dragRef.current) return;
      const { type, startX, startY, startQuestionsWidth, startSchemaWidth, startEditorHeightPct } =
        dragRef.current;

      if (type === 'questions') {
        const deltaX = e.clientX - startX;
        const newWidth = Math.max(160, Math.min(460, startQuestionsWidth + deltaX));
        setQuestionsWidth(newWidth);
      } else if (type === 'schema') {
        const deltaX = e.clientX - startX;
        const newWidth = Math.max(260, Math.min(700, startSchemaWidth + deltaX));
        setSchemaWidth(newWidth);
      } else if (type === 'editor') {
        const containerHeight = rightPaneRef.current?.clientHeight || 600;
        const deltaY = e.clientY - startY;
        const deltaPct = (deltaY / containerHeight) * 100;
        const newPct = Math.max(20, Math.min(80, startEditorHeightPct + deltaPct));
        setEditorHeightPct(newPct);
      }
    };

    const handleMouseUp = () => {
      setDraggingType(null);
      dragRef.current = null;
      window.dispatchEvent(new Event('resize'));
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingType]);

  // Keyboard shortcut: Ctrl+B to toggle questions, Ctrl+Enter to run query
  const handleKeyDown = useCallback(
    (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        const activeTag = document.activeElement?.tagName;
        if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
          e.preventDefault();
          setIsQuestionsCollapsed((prev) => !prev);
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRunQuery();
      }
    },
    [currentQuery, tables]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const attemptedCount = useMemo(() => {
    return Object.values(qStates).filter((s) => s.submitted).length;
  }, [qStates]);

  const formatTimer = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Filter tables by search query
  const filteredTables = useMemo(() => {
    if (!schemaSearch.trim()) return tables;
    const q = schemaSearch.toLowerCase();
    return tables.filter(
      (t) =>
        t.tableName.toLowerCase().includes(q) ||
        (t.columns || []).some((c) => c.name.toLowerCase().includes(q))
    );
  }, [tables, schemaSearch]);

  const activeTable = useMemo(() => {
    return (
      tables.find((t) => t.tableName.toLowerCase() === activeTableName.toLowerCase()) ||
      tables[0]
    );
  }, [tables, activeTableName]);

  const otherTables = useMemo(() => {
    return filteredTables.filter(
      (t) => t.tableName.toLowerCase() !== activeTable?.tableName.toLowerCase()
    );
  }, [filteredTables, activeTable]);

  // Pagination for Active Table sample data preview
  const previewPageSize = 5;
  const totalPreviewPages = Math.max(1, Math.ceil((activeTable?.sampleData?.length || 0) / previewPageSize));
  const paginatedPreviewRows = useMemo(() => {
    const data = activeTable?.sampleData || [];
    const start = (tablePage - 1) * previewPageSize;
    return data.slice(start, start + previewPageSize);
  }, [activeTable, tablePage]);

  // Synthetic execution plan generation
  const executionPlanSteps = useMemo(() => {
    const q = currentQuery.trim();
    if (!q) return [];
    const steps = [];

    const fromMatch = q.match(/FROM\s+([a-zA-Z0-9_`"]+)/i);
    const tableName = fromMatch ? fromMatch[1].replace(/[`"]/g, '') : activeTable?.tableName || 'table';
    steps.push({
      type: 'SCAN',
      badge: 'Seq Scan',
      title: `Sequential Scan on \`${tableName}\``,
      cost: 'Cost: 0.00..12.50 rows=100 width=48',
      desc: `Full scan over primary relation storage blocks for table \`${tableName}\``,
    });

    const joinMatches = q.match(/JOIN\s+([a-zA-Z0-9_`"]+)/gi);
    if (joinMatches) {
      joinMatches.forEach((jm) => {
        const jTable = jm.replace(/JOIN\s+/i, '').replace(/[`"]/g, '');
        steps.push({
          type: 'JOIN',
          badge: 'Hash Join',
          title: `Relational Hash Join with \`${jTable}\``,
          cost: 'Cost: 12.50..34.20 rows=85 width=72',
          desc: `Build hash table on join key reference constraints against \`${jTable}\``,
        });
      });
    }

    const whereMatch = q.match(/WHERE\s+([^;\n]+)/i);
    if (whereMatch) {
      steps.push({
        type: 'FILTER',
        badge: 'Filter',
        title: `Predicate Filter Evaluation`,
        cost: 'Cost: 14.00..21.00 rows=35 width=48',
        desc: `Filter condition: ${whereMatch[1].trim()}`,
      });
    }

    const groupMatch = q.match(/GROUP\s+BY\s+([^;\n]+)/i);
    if (groupMatch) {
      steps.push({
        type: 'AGGREGATE',
        badge: 'Aggregate',
        title: `Group Aggregate Operator`,
        cost: 'Cost: 22.00..28.50 rows=10 width=56',
        desc: `Bucket aggregation on keys: ${groupMatch[1].trim()}`,
      });
    }

    const orderMatch = q.match(/ORDER\s+BY\s+([^;\n]+)/i);
    if (orderMatch) {
      steps.push({
        type: 'SORT',
        badge: 'QuickSort',
        title: `Sort Operation`,
        cost: 'Cost: 29.00..32.00 rows=35 width=48',
        desc: `In-memory sort on: ${orderMatch[1].trim()}`,
      });
    }

    const selectMatch = q.match(/SELECT\s+(.*?)\s+FROM/is);
    steps.push({
      type: 'PROJECT',
      badge: 'Projection',
      title: `Result Column Projection`,
      cost: 'Cost: 32.00..34.50 rows=35 width=32',
      desc: `Output attributes: ${selectMatch ? selectMatch[1].replace(/\s+/g, ' ').trim() : 'Projected fields'}`,
    });

    return steps;
  }, [currentQuery, activeTable]);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-50 text-slate-800 font-sans overflow-hidden select-text">
      {/* ----------------- Top Header Bar ----------------- */}
      <header className="h-14 px-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 z-20">
        {/* Left: SEED Logo + SQL Assessment Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 flex items-center justify-center">
              <img
                src="/SEED_Logo.png"
                alt="SEED"
                className="h-6 w-auto object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
            <span className="font-extrabold text-base tracking-tight text-slate-900">
              SEED
            </span>
          </div>

          <div className="h-4 w-px bg-slate-200 mx-0.5" />

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-100/80 text-indigo-700 text-xs font-semibold">
            <Database className="size-3.5 text-indigo-600" />
            <span>SQL Assessment</span>
          </div>

          <button
            type="button"
            onClick={() => setIsQuestionsCollapsed((p) => !p)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition cursor-pointer ${
              isQuestionsCollapsed
                ? 'border-indigo-200 bg-indigo-50/70 text-indigo-700 hover:bg-indigo-100/70'
                : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
            title={isQuestionsCollapsed ? "Show Questions Panel (Ctrl+B)" : "Collapse Questions Panel (Ctrl+B)"}
          >
            <PanelLeft className="size-3.5" />
            <span className="hidden sm:inline">Questions</span>
          </button>
        </div>

        {/* Right: Timer + Submit Section Button */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-200 bg-white text-slate-800 text-xs font-semibold shadow-2xs">
            <Clock className="size-3.5 text-slate-500" />
            <span className="font-mono">{formatTimer(secTimer)}</span>
          </div>

          <button
            type="button"
            onClick={() => setShowSubmitModal(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            <span>Submit Section</span>
            <ArrowRight className="size-3.5" />
          </button>
        </div>
      </header>

      {/* ----------------- Main 3-Column Workspace ----------------- */}
      <main className="flex-1 flex overflow-hidden relative select-text">
        {/* Docked Expand Button when Questions Sidebar is Collapsed */}
        {isQuestionsCollapsed && (
          <button
            type="button"
            onClick={() => setIsQuestionsCollapsed(false)}
            className="absolute left-0 top-3 z-30 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 border-l-0 rounded-r-lg shadow-md text-xs font-semibold text-slate-700 hover:text-indigo-600 hover:bg-slate-50 transition cursor-pointer group"
            title="Expand Questions Sidebar (Ctrl+B)"
          >
            <PanelLeftOpen className="size-3.5 text-slate-400 group-hover:text-indigo-600 transition" />
            <span>Questions ({currentQIdx + 1}/{questions.length})</span>
          </button>
        )}

        {/* ================= COLUMN 1: Questions Sidebar ================= */}
        {!isQuestionsCollapsed && (
          <aside
            style={{ width: `${questionsWidth}px` }}
            className="border-r border-slate-200 bg-white flex flex-col shrink-0"
          >
            {/* Header */}
            <div className="p-3.5 px-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-900">Questions</h3>
                <span className="text-xs font-semibold text-slate-500 font-mono">
                  {currentQIdx + 1}/{questions.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsQuestionsCollapsed(true)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                title="Collapse Questions Sidebar (Ctrl+B)"
              >
                <PanelLeftClose className="size-4" />
              </button>
            </div>

            {/* Question List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {questions.map((q, idx) => {
                const isCurrent = idx === currentQIdx;
                const qState = qStates[q.id] || {};
                const isAnswered = Boolean(qState.submitted);

                return (
                  <button
                    key={q.id || idx}
                    type="button"
                    onClick={() => setCurrentQIdx(idx)}
                    className={`w-full text-left p-3 rounded-xl border transition flex items-center gap-3 cursor-pointer ${
                      isCurrent
                        ? 'bg-emerald-50/70 border-emerald-300 shadow-2xs'
                        : isAnswered
                        ? 'bg-white border-blue-200 hover:border-blue-300 hover:bg-blue-50/20'
                        : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50/50'
                    }`}
                  >
                    {/* Number Circle Badge */}
                    <div
                      className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold transition ${
                        isCurrent
                          ? 'bg-emerald-500 text-white ring-2 ring-emerald-200'
                          : isAnswered
                          ? 'bg-blue-500 text-white'
                          : 'border border-slate-200 text-slate-600 bg-white'
                      }`}
                    >
                      {idx + 1}
                    </div>

                    {/* Title and Category */}
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-xs text-slate-900 truncate">
                        {q.title}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5 font-medium">
                        {q.category}
                      </div>
                    </div>

                    {/* Marks */}
                    <div className="shrink-0 text-[11px] font-medium text-slate-400">
                      {q.marks} marks
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Bottom Legend */}
            <div className="p-3 px-4 border-t border-slate-200 bg-white shrink-0 flex items-center justify-between text-[11px] text-slate-500 font-medium">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Current</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                <span>Answered</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                <span>Not Answered</span>
              </div>
            </div>
          </aside>
        )}

        {/* Vertical Splitter 1: Questions vs Schema */}
        {!isQuestionsCollapsed && (
          <div
            onMouseDown={(e) => handleSplitterMouseDown('questions', e)}
            onDoubleClick={() => setQuestionsWidth(256)}
            className={`w-1.5 hover:w-2 shrink-0 bg-slate-200/80 hover:bg-indigo-400 transition-all cursor-col-resize relative flex items-center justify-center group z-10 select-none ${
              draggingType === 'questions' ? 'bg-indigo-500 w-2' : ''
            }`}
            title="Drag to resize Questions sidebar · Double-click to reset (256px)"
          >
            <div className="h-7 w-1 rounded-full bg-slate-400 group-hover:bg-white transition-opacity opacity-0 group-hover:opacity-100 flex items-center justify-center">
              <GripVertical className="size-3 text-slate-400 group-hover:text-white" />
            </div>
          </div>
        )}

        {/* ================= COLUMN 2: Question Details & Schema ================= */}
        <section
          style={{ width: `${schemaWidth}px` }}
          className="border-r border-slate-200 bg-white flex flex-col shrink-0 overflow-y-auto p-4 space-y-4"
        >
          {/* Difficulty and Marks row */}
          <div className="flex items-center justify-between">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-emerald-100 text-emerald-700">
              {activeQ.difficulty}
            </span>
            <span className="text-xs font-bold text-slate-800">
              {activeQ.marks} Marks
            </span>
          </div>

          {/* Question title */}
          <h2 className="text-xl font-bold text-slate-900 leading-snug">
            {currentQIdx + 1}. {activeQ.title}
          </h2>

          {/* Problem statement */}
          <p className="text-xs text-slate-600 leading-relaxed">
            {activeQ.problemStatement}
          </p>

          {/* Blue Callout Requirements Box */}
          {activeQ.guidelines && activeQ.guidelines.length > 0 && (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-start gap-2.5">
              <Info className="size-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                {activeQ.guidelines.map((line, lIdx) => (
                  <p key={lIdx} className="leading-relaxed">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Database Schema Section */}
          <div className="pt-2 space-y-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                <Database className="size-4 text-indigo-600" />
                <span>Database Schema ({tables.length} {tables.length === 1 ? 'Table' : 'Tables'})</span>
              </div>
              <p className="text-xs text-slate-500">
                Company employee database with departments, employees and projects.
              </p>
            </div>

            {/* Table Selector Pills and Search Bar */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {tables.map((t) => {
                  const isActive = t.tableName.toLowerCase() === activeTableName.toLowerCase();
                  return (
                    <button
                      key={t.tableName}
                      type="button"
                      onClick={() => {
                        setActiveTableName(t.tableName);
                        setIsActiveTableOpen(true);
                        setTablePage(1);
                      }}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
                        isActive
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {t.tableName}
                    </button>
                  );
                })}
              </div>

              <div className="relative shrink-0">
                <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={schemaSearch}
                  onChange={(e) => setSchemaSearch(e.target.value)}
                  placeholder="Search tables..."
                  className="pl-8 pr-2.5 py-1 text-xs border border-slate-200 rounded-md bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500 w-36 placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Active Table Card */}
            {activeTable && (
              <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-2xs">
                {/* Table Card Header */}
                <div
                  onClick={() => setIsActiveTableOpen(!isActiveTableOpen)}
                  className="p-3 flex items-center justify-between bg-slate-50/80 border-b border-slate-100 cursor-pointer select-none hover:bg-slate-100/80 transition"
                >
                  <div className="flex items-center gap-2">
                    <Table className="size-4 text-indigo-600" />
                    <span className="font-bold font-mono text-xs text-slate-900">
                      {activeTable.tableName}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {(activeTable.columns || []).length} columns • {(activeTable.sampleData || []).length} rows
                    </span>
                  </div>
                  {isActiveTableOpen ? (
                    <ChevronUp className="size-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="size-4 text-slate-400" />
                  )}
                </div>

                {isActiveTableOpen && (
                  <div className="p-3 space-y-3">
                    {/* Tabs: Schema / Data Preview */}
                    <div className="flex items-center gap-4 border-b border-slate-200">
                      <button
                        type="button"
                        onClick={() => setTableSubTab('schema')}
                        className={`pb-1.5 text-xs font-semibold cursor-pointer border-b-2 transition ${
                          tableSubTab === 'schema'
                            ? 'border-emerald-600 text-emerald-700'
                            : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Schema
                      </button>
                      <button
                        type="button"
                        onClick={() => setTableSubTab('data')}
                        className={`pb-1.5 text-xs font-semibold cursor-pointer border-b-2 transition ${
                          tableSubTab === 'data'
                            ? 'border-emerald-600 text-emerald-700'
                            : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Data Preview
                      </button>
                    </div>

                    {tableSubTab === 'schema' ? (
                      <div className="space-y-3">
                        {/* Columns Table */}
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 text-[11px] font-semibold">
                              <tr>
                                <th className="p-2">Column Name</th>
                                <th className="p-2">Type</th>
                                <th className="p-2">Description</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                              {(activeTable.columns || []).map((col) => (
                                <tr key={col.name} className="hover:bg-slate-50/50">
                                  <td className="p-2 flex items-center gap-1.5 text-slate-800 font-semibold">
                                    {col.isPrimaryKey && (
                                      <Key className="size-3 text-amber-500 shrink-0" title="Primary Key" />
                                    )}
                                    <span>{col.name}</span>
                                  </td>
                                  <td className="p-2 text-indigo-600 font-medium">
                                    {col.type || 'TEXT'}
                                  </td>
                                  <td className="p-2 text-slate-500 font-sans">
                                    {col.description || (col.isPrimaryKey ? 'Primary key' : 'Column field')}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Inline Data Preview Section */}
                        <div className="space-y-2 pt-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-900">
                              Data Preview (First {(activeTable.sampleData || []).length} rows)
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowAllRowsModal(true)}
                              className="text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-0.5 cursor-pointer text-xs"
                            >
                              <span>View All Rows ({(activeTable.sampleData || []).length})</span>
                              <ChevronRight className="size-3.5" />
                            </button>
                          </div>

                          {/* 5-row preview table */}
                          <div className="border border-slate-200 rounded-lg overflow-x-auto">
                            <table className="w-full text-left text-[11px] font-mono">
                              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                                <tr>
                                  {(activeTable.columns || []).map((c) => (
                                    <th key={c.name} className="p-1.5 px-2 font-semibold">
                                      {c.name}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {paginatedPreviewRows.map((row, rIdx) => (
                                  <tr key={rIdx} className="hover:bg-slate-50/50">
                                    {(activeTable.columns || []).map((c) => (
                                      <td key={c.name} className="p-1.5 px-2 text-slate-700">
                                        {String(row[c.name] ?? '')}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Pagination Footer */}
                          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                            <span>
                              Showing {paginatedPreviewRows.length} of {(activeTable.sampleData || []).length} rows
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={tablePage === 1}
                                onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                                className="w-5 h-5 flex items-center justify-center border border-slate-200 rounded text-slate-600 disabled:opacity-30 hover:bg-slate-100 cursor-pointer"
                              >
                                <ChevronLeft className="size-3" />
                              </button>
                              {Array.from({ length: totalPreviewPages }, (_, i) => i + 1).slice(0, 5).map((p) => (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={() => setTablePage(p)}
                                  className={`w-5 h-5 flex items-center justify-center rounded text-[11px] font-semibold cursor-pointer ${
                                    p === tablePage
                                      ? 'bg-emerald-600 text-white'
                                      : 'border border-slate-200 text-slate-700 hover:bg-slate-100'
                                  }`}
                                >
                                  {p}
                                </button>
                              ))}
                              {totalPreviewPages > 5 && <span className="text-slate-400">..</span>}
                              {totalPreviewPages > 5 && (
                                <button
                                  type="button"
                                  onClick={() => setTablePage(totalPreviewPages)}
                                  className={`w-5 h-5 flex items-center justify-center rounded text-[11px] font-semibold cursor-pointer ${
                                    totalPreviewPages === tablePage
                                      ? 'bg-emerald-600 text-white'
                                      : 'border border-slate-200 text-slate-700 hover:bg-slate-100'
                                  }`}
                                >
                                  {totalPreviewPages}
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={tablePage >= totalPreviewPages}
                                onClick={() => setTablePage((p) => Math.min(totalPreviewPages, p + 1))}
                                className="w-5 h-5 flex items-center justify-center border border-slate-200 rounded text-slate-600 disabled:opacity-30 hover:bg-slate-100 cursor-pointer"
                              >
                                <ChevronRight className="size-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Full Data Preview Tab */
                      <div className="space-y-3">
                        <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-72 overflow-y-auto">
                          <table className="w-full text-left text-[11px] font-mono">
                            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 sticky top-0">
                              <tr>
                                {(activeTable.columns || []).map((c) => (
                                  <th key={c.name} className="p-2 px-2.5 font-semibold">
                                    {c.name}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {(activeTable.sampleData || []).map((row, rIdx) => (
                                <tr key={rIdx} className="hover:bg-slate-50/50">
                                  {(activeTable.columns || []).map((c) => (
                                    <td key={c.name} className="p-2 px-2.5 text-slate-700">
                                      {String(row[c.name] ?? '')}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="text-[11px] text-slate-500 text-right">
                          Total {(activeTable.sampleData || []).length} rows loaded in memory.
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Other Collapsed Table Accordion Cards */}
            <div className="space-y-2">
              {otherTables.map((tbl) => (
                <div
                  key={tbl.tableName}
                  onClick={() => {
                    setActiveTableName(tbl.tableName);
                    setIsActiveTableOpen(true);
                    setTablePage(1);
                  }}
                  className="p-3 flex items-center justify-between border border-slate-200 rounded-xl bg-white hover:border-slate-300 hover:bg-slate-50/50 cursor-pointer transition select-none shadow-2xs"
                >
                  <div className="flex items-center gap-2">
                    <Table className="size-4 text-indigo-500" />
                    <span className="font-bold font-mono text-xs text-slate-800">
                      {tbl.tableName}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {(tbl.columns || []).length} columns • {(tbl.sampleData || []).length} rows
                    </span>
                  </div>
                  <ChevronRight className="size-4 text-slate-400" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Vertical Splitter 2: Schema vs Workspace */}
        <div
          onMouseDown={(e) => handleSplitterMouseDown('schema', e)}
          onDoubleClick={() => setSchemaWidth(440)}
          className={`w-1.5 hover:w-2 shrink-0 bg-slate-200/80 hover:bg-indigo-400 transition-all cursor-col-resize relative flex items-center justify-center group z-10 select-none ${
            draggingType === 'schema' ? 'bg-indigo-500 w-2' : ''
          }`}
          title="Drag to resize Schema pane · Double-click to reset (440px)"
        >
          <div className="h-7 w-1 rounded-full bg-slate-400 group-hover:bg-white transition-opacity opacity-0 group-hover:opacity-100 flex items-center justify-center">
            <GripVertical className="size-3 text-slate-400 group-hover:text-white" />
          </div>
        </div>

        {/* ================= COLUMN 3: SQL Editor & Execution Output ================= */}
        <section ref={rightPaneRef} className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
          {/* Top Half: SQL Query Editor */}
          <div
            style={{ height: `${editorHeightPct}%` }}
            className="flex flex-col border-b border-slate-200 bg-white overflow-hidden"
          >
            {/* Editor Header Bar */}
            <div className="p-2.5 px-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Code className="size-4 text-indigo-600" />
                <span className="font-bold text-xs text-slate-900">SQL Query Editor</span>
                <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded font-mono">
                  Ctrl + Enter to run
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetQuery}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-md font-medium transition cursor-pointer"
                >
                  <RotateCcw className="size-3 text-slate-500" />
                  <span>Reset</span>
                </button>

                <button
                  type="button"
                  onClick={handleRunQuery}
                  disabled={isExecuting}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs bg-slate-900 hover:bg-slate-800 active:scale-98 text-white rounded-md font-medium transition shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  <Play className="size-3 fill-white" />
                  <span>Run Query</span>
                </button>

                <button
                  type="button"
                  onClick={handleSubmitAnswer}
                  disabled={isExecuting}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-md font-medium transition shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  <Check className="size-3.5" />
                  <span>Submit Answer</span>
                </button>
              </div>
            </div>

            {/* Monaco Code Editor */}
            <div className="flex-1 relative overflow-hidden bg-[#18181b]">
              {/* Language Selector Dropdown Badge */}
              <div className="absolute right-3 top-2.5 z-10 text-[11px] font-mono font-semibold text-slate-300 bg-zinc-800/80 backdrop-blur-xs px-2.5 py-0.5 rounded border border-white/10 flex items-center gap-1 select-none pointer-events-none">
                <span>SQL</span>
                <ChevronDown className="size-3 opacity-60" />
              </div>

              <Editor
                height="100%"
                language="sql"
                theme="vs-dark"
                value={currentQuery}
                onChange={handleQueryChange}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  wordWrap: 'on',
                  scrollBeyondLastLine: false,
                  lineNumbers: 'on',
                  renderLineHighlight: 'all',
                  automaticLayout: true,
                  tabSize: 2,
                  fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                }}
              />
            </div>
          </div>

          {/* Horizontal Splitter: Editor vs Output */}
          <div
            onMouseDown={(e) => handleSplitterMouseDown('editor', e)}
            onDoubleClick={() => setEditorHeightPct(52)}
            className={`h-1.5 hover:h-2 shrink-0 bg-slate-200/80 hover:bg-indigo-400 transition-all cursor-row-resize relative flex items-center justify-center group z-10 select-none ${
              draggingType === 'editor' ? 'bg-indigo-500 h-2' : ''
            }`}
            title="Drag to resize Editor & Output · Double-click to reset (52%)"
          >
            <div className="w-7 h-1 rounded-full bg-slate-400 group-hover:bg-white transition-opacity opacity-0 group-hover:opacity-100 flex items-center justify-center">
              <GripHorizontal className="size-3 text-slate-400 group-hover:text-white" />
            </div>
          </div>

          {/* Bottom Half: Execution Output */}
          <div
            style={{ height: `${100 - editorHeightPct}%` }}
            className="flex flex-col bg-white overflow-hidden"
          >
            {/* Output Header Bar */}
            <div className="p-2 px-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                  <Database className="size-3.5 text-indigo-600" />
                  <span>Execution Output</span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setOutputTab('results')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                      outputTab === 'results'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Table className="size-3.5" />
                    <span>Results</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOutputTab('message')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                      outputTab === 'message'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <MessageSquare className="size-3.5" />
                    <span>Message</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOutputTab('plan')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                      outputTab === 'plan'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Network className="size-3.5" />
                    <span>Execution Plan</span>
                  </button>
                </div>
              </div>

              {/* Download CSV Button */}
              <button
                type="button"
                onClick={handleDownloadCSV}
                disabled={!activeState.lastResult?.success || activeState.lastResult?.rows?.length === 0}
                className="flex items-center gap-1 px-2.5 py-1 border border-slate-200 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              >
                <Download className="size-3.5 text-slate-500" />
                <span>Download CSV</span>
              </button>
            </div>

            {/* Output Body Container */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* State 1: No Query Executed Yet */}
              {!activeState.lastResult ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-2">
                  <div className="w-12 h-12 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400">
                    <Table className="size-6 stroke-[1.5]" />
                  </div>
                  <h4 className="font-bold text-sm text-slate-800">No query executed yet</h4>
                  <p className="text-xs text-slate-400 max-w-xs">
                    Write your query and click Run Query to see the results here.
                  </p>
                </div>
              ) : outputTab === 'results' ? (
                /* State 2: Results Tab */
                <div className="space-y-3">
                  {/* Status Banner */}
                  {activeState.lastResult.success ? (
                    <div className="flex items-center justify-between p-2.5 px-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 font-bold text-emerald-600">
                          <CheckCircle2 className="size-3.5" />
                          Executed Successfully
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-600 font-medium">
                          {activeState.lastResult.rowCount} {activeState.lastResult.rowCount === 1 ? 'row' : 'rows'} returned
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-400 font-mono text-[11px]">
                          {activeState.lastResult.executionTimeMs}ms
                        </span>
                      </div>

                      {activeState.submitted && (
                        <div className="flex items-center gap-1 text-emerald-600 font-bold">
                          <span>Answer Submitted ({activeState.marksAwarded}/{activeQ.marks} Marks)</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs space-y-1 text-red-700">
                      <div className="font-bold flex items-center gap-1.5 text-red-600">
                        <AlertTriangle className="size-3.5" />
                        Execution Error
                      </div>
                      <p className="font-mono text-[11px] whitespace-pre-wrap">
                        {activeState.lastResult.error}
                      </p>
                    </div>
                  )}

                  {/* Result Table */}
                  {activeState.lastResult.success && (
                    <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-64 overflow-y-auto">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0 z-10">
                          <tr>
                            <th className="p-2 px-3 text-slate-400 font-sans text-[10px] w-10">#</th>
                            {(activeState.lastResult.columns || []).map((col) => (
                              <th key={col} className="p-2 px-3 font-bold">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(activeState.lastResult.rows || []).map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-slate-50/50">
                              <td className="p-2 px-3 text-slate-400 font-sans text-[11px]">{rIdx + 1}</td>
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} className="p-2 px-3 text-slate-800">
                                  {cell === null || cell === undefined ? (
                                    <span className="text-slate-300 italic">null</span>
                                  ) : (
                                    String(cell)
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : outputTab === 'message' ? (
                /* State 3: Message Tab */
                <div className="space-y-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <span className="font-bold text-slate-900 block">Query Execution Report</span>
                    <p className="text-slate-600">
                      {activeState.lastResult.success
                        ? `The query parsed and executed successfully in ${activeState.lastResult.executionTimeMs}ms, returning ${activeState.lastResult.rowCount} row(s).`
                        : `Syntax / Runtime failure: ${activeState.lastResult.error}`}
                    </p>
                  </div>

                  {activeState.lastFeedback && (
                    <div
                      className={`p-3 rounded-xl border ${
                        activeState.status === 'CORRECT'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-amber-50 border-amber-200 text-amber-800'
                      }`}
                    >
                      <span className="font-bold block mb-0.5">Evaluation Feedback:</span>
                      <p className="leading-relaxed">{activeState.lastFeedback}</p>
                    </div>
                  )}
                </div>
              ) : (
                /* State 4: Execution Plan Tab */
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between pb-1">
                    <span className="font-bold text-slate-900">Logical Execution Tree</span>
                    <span className="text-[11px] text-slate-400 font-mono">In-Memory Engine Optimizer</span>
                  </div>

                  <div className="space-y-2">
                    {executionPlanSteps.map((step, sIdx) => (
                      <div
                        key={sIdx}
                        className="p-3 rounded-xl border border-slate-200 bg-white shadow-2xs flex items-start gap-3"
                      >
                        <div className="w-6 h-6 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-bold text-[11px] shrink-0">
                          {sIdx + 1}
                        </div>
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 font-mono text-xs">{step.title}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                              {step.badge}
                            </span>
                          </div>
                          <p className="text-slate-500 text-[11px]">{step.desc}</p>
                          <span className="text-[10px] font-mono text-indigo-600 block">{step.cost}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Global drag overlay to prevent iframe/editor pointer event capture during resizing */}
        {draggingType && (
          <div
            className={`fixed inset-0 z-50 select-none ${
              draggingType === 'editor' ? 'cursor-row-resize' : 'cursor-col-resize'
            }`}
          />
        )}
      </main>

      {/* ================= View All Rows Modal ================= */}
      {showAllRowsModal && activeTable && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 px-6 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Table className="size-5 text-indigo-600" />
                <h3 className="font-bold text-base text-slate-900 font-mono">
                  {activeTable.tableName}
                </h3>
                <span className="text-xs text-slate-400">
                  ({(activeTable.columns || []).length} columns • {(activeTable.sampleData || []).length} rows)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowAllRowsModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="p-2.5 px-3 text-slate-400 font-sans text-[10px] w-10">#</th>
                      {(activeTable.columns || []).map((c) => (
                        <th key={c.name} className="p-2.5 px-3 font-bold">
                          {c.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(activeTable.sampleData || []).map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50/50">
                        <td className="p-2.5 px-3 text-slate-400 font-sans text-[11px]">{rIdx + 1}</td>
                        {(activeTable.columns || []).map((c) => (
                          <td key={c.name} className="p-2.5 px-3 text-slate-800">
                            {String(row[c.name] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 px-6 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-500">
                Displaying all {(activeTable.sampleData || []).length} dataset records in sandbox memory.
              </span>
              <button
                type="button"
                onClick={() => setShowAllRowsModal(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= Submit Section Modal ================= */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900">
              Submit SQL Assessment Section?
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              You have submitted answers for{' '}
              <span className="font-bold text-indigo-600">{attemptedCount}</span> of{' '}
              <span className="font-bold">{questions.length}</span> SQL questions. Once confirmed, this section will be finalized.
            </p>

            <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1.5 border border-slate-100">
              <div className="flex justify-between text-slate-600">
                <span>Total Challenges:</span>
                <span className="font-bold">{questions.length}</span>
              </div>
              <div className="flex justify-between text-emerald-600">
                <span>Submitted Answers:</span>
                <span className="font-bold">{attemptedCount}</span>
              </div>
              <div className="flex justify-between text-amber-600">
                <span>Unattempted Questions:</span>
                <span className="font-bold">{questions.length - attemptedCount}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold hover:bg-slate-50 transition cursor-pointer"
              >
                Continue Assessment
              </button>
              <button
                type="button"
                onClick={handleFinalSectionSubmit}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                Confirm Submission
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
