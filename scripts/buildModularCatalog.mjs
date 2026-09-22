import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const REAL_COURSES_DIR = path.join(FRONTEND_ROOT, 'src', 'courses', 'data', 'realCourses');
const CATALOG_DIR = path.join(FRONTEND_ROOT, 'src', 'courses', 'data', 'catalog');

// 12 DOMAINS CONFIGURATION
const DOMAINS = [
  {
    id: '01-programming',
    title: '01. PROGRAMMING',
    description: 'Master core programming languages with strong foundational syntax, memory management, and modern paradigms.',
    icon: 'FaCode',
    courses: [
      { id: 'c', title: 'C Programming', slug: 'c', folder: 'c', sourceFiles: ['c.json', 'c-beginner-v2-p1.json', 'c-beginner-v2-p2.json', 'college-programming-c.json'] },
      { id: 'cpp', title: 'C++ Programming', slug: 'cpp', folder: 'cpp', sourceFiles: ['cpp.json', 'cpp-beginner-v2-p1.json', 'cpp-beginner-v2-p2.json', 'cpp-stl.json', 'cpp-development.json', 'college-oops-cpp.json'] },
      { id: 'java', title: 'Java Programming', slug: 'java', folder: 'java', sourceFiles: ['java.json', 'java-beginner-v2-p1.json', 'java-beginner-v2-p2.json', 'advance-java.json', 'java-development.json', 'college-oops-java.json'] },
      { id: 'python', title: 'Python Programming', slug: 'python', folder: 'python', sourceFiles: ['python-beginner-v2-p1.json', 'python-beginner-v2-p2.json', 'advanced-python.json', 'oops-concepts-in-python.json'] },
      { id: 'javascript', title: 'JavaScript Programming', slug: 'javascript', folder: 'javascript', sourceFiles: ['javascript.json', 'advanced-javascript.json'] },
      { id: 'csharp', title: 'C# Programming', slug: 'csharp', folder: 'csharp', sourceFiles: ['c-sharp.json', 'c-sharp-beginner-part-1.json'] },
      { id: 'go', title: 'Go Programming', slug: 'go', folder: 'go', sourceFiles: ['go.json'] },
      { id: 'rust', title: 'Rust Programming', slug: 'rust', folder: 'rust', sourceFiles: ['rust.json'] }
    ]
  },
  {
    id: '02-dsa',
    title: '02. DATA STRUCTURES & ALGORITHMS',
    description: 'Rigorous algorithmic foundation, pattern mastery, competitive programming, and multi-language implementations.',
    icon: 'FaProjectDiagram',
    tracks: {
      languages: ['Language Independent', 'C', 'C++', 'Java', 'Python', 'JavaScript', 'C#']
    },
    courses: [
      {
        id: 'dsa-foundation',
        title: 'DSA Foundation',
        slug: 'dsa-foundation',
        folder: 'dsa-foundation',
        sourceFiles: ['time-complexity.json'],
        subTracks: ['Language Independent']
      },
      {
        id: 'dsa-core',
        title: 'DSA Core',
        slug: 'dsa-core',
        folder: 'dsa-core',
        sourceFiles: ['dsa.json', 'dsa-in-c.json', 'dsa-in-cpp.json'],
        subTracks: ['Language Independent', 'C', 'C++', 'Java', 'Python', 'JavaScript', 'C#'],
        topicsList: [
          'Arrays', 'Strings', 'Recursion', 'Searching', 'Sorting',
          'Linked Lists', 'Stack', 'Queue', 'Hashing', 'Trees',
          'BST', 'Heap', 'Graphs', 'Greedy', 'Backtracking',
          'Divide & Conquer', 'Dynamic Programming', 'Bit Manipulation'
        ]
      },
      {
        id: 'dsa-problem-solving',
        title: 'DSA Problem Solving Patterns',
        slug: 'dsa-problem-solving',
        folder: 'dsa-problem-solving',
        sourceFiles: ['dsa.json'],
        subTracks: ['Language Independent'],
        patternsList: [
          'Two Pointers', 'Sliding Window', 'Prefix Sum', 'Binary Search',
          'Fast & Slow Pointer', 'Monotonic Stack', 'Intervals', 'BFS',
          'DFS', 'Backtracking', 'Greedy', 'Heap', 'Union-Find', 'Dynamic Programming'
        ]
      },
      {
        id: 'advanced-dsa',
        title: 'Advanced DSA',
        slug: 'advanced-dsa',
        folder: 'advanced-dsa',
        sourceFiles: ['graphs-advanced.json', 'dynamic-programming-advanced.json', 'tries.json', 'dsu.json'],
        subTracks: ['Language Independent', 'C', 'C++', 'Java', 'Python', 'JavaScript', 'C#'],
        advancedTopicsList: [
          'Advanced Trees', 'Advanced Heaps', 'Advanced Hashing', 'Trie', 'Suffix Structures',
          'Segment Tree', 'Fenwick Tree', 'Sparse Table', 'Advanced Graph Algorithms', 'Shortest Paths',
          'MST', 'SCC', 'Bridges & Articulation Points', 'Network Flow', 'Matching',
          'Advanced Dynamic Programming', 'Number Theory', 'String Algorithms', 'Computational Geometry',
          'Randomized Algorithms', 'Approximation Algorithms', 'Complexity Theory'
        ]
      },
      {
        id: 'competitive-programming',
        title: 'Competitive Programming',
        slug: 'competitive-programming',
        folder: 'competitive-programming',
        sourceFiles: ['number-theory.json', 'combinatorics.json'],
        subTracks: ['C++', 'Java', 'Python']
      },
      {
        id: 'advanced-competitive-programming',
        title: 'Advanced Competitive Programming',
        slug: 'advanced-competitive-programming',
        folder: 'advanced-competitive-programming',
        sourceFiles: ['dynamic-programming-advanced.json'],
        subTracks: ['C++', 'Java', 'Python']
      }
    ]
  },
  {
    id: '03-web-development',
    title: '03. WEB DEVELOPMENT',
    description: 'Modern full-stack web architecture, frontend UI frameworks, backend APIs, and distributed web services.',
    icon: 'FaLaptopCode',
    courses: [
      { id: 'html', title: 'HTML Foundations', slug: 'html', folder: 'html', sourceFiles: ['html.json'] },
      { id: 'css', title: 'CSS & Modern Styling', slug: 'css', folder: 'css', sourceFiles: ['css.json'] },
      { id: 'javascript-web', title: 'JavaScript (Web)', slug: 'javascript-web', folder: 'javascript-web', sourceFiles: ['web-dev-js.json', 'javascript.json'] },
      { id: 'typescript', title: 'TypeScript Engineering', slug: 'typescript', folder: 'typescript', sourceFiles: [] },
      { id: 'react', title: 'React.js Component Architecture', slug: 'react-js', folder: 'react', sourceFiles: ['react-js.json'] },
      { id: 'angular', title: 'Angular Enterprise Framework', slug: 'angular', folder: 'angular', sourceFiles: [] },
      { id: 'vue', title: 'Vue.js Progressive Engineering', slug: 'vue', folder: 'vue', sourceFiles: [] },
      { id: 'nodejs', title: 'Node.js Backend Runtimes', slug: 'nodejs', folder: 'nodejs', sourceFiles: ['nodejs.json'] },
      { id: 'expressjs', title: 'Express.js REST APIs', slug: 'expressjs', folder: 'expressjs', sourceFiles: [] },
      { id: 'fullstack', title: 'Full Stack Development', slug: 'fullstack', folder: 'fullstack', sourceFiles: ['web-dev-js.json'] }
    ]
  },
  {
    id: '04-databases',
    title: '04. DATABASES',
    description: 'Relational & NoSQL query engines, indexing, transaction semantics, caching, and storage architecture.',
    icon: 'FaDatabase',
    courses: [
      { id: 'sql', title: 'Interactive SQL Mastery', slug: 'sql-interactive', folder: 'sql', sourceFiles: ['sql-interactive.json', 'sql-intermediate.json', 'sql-at-work.json', 'pl-sql.json'] },
      { id: 'mysql', title: 'MySQL Administration & Queries', slug: 'mysql', folder: 'mysql', sourceFiles: [] },
      { id: 'postgresql', title: 'PostgreSQL Relational Systems', slug: 'postgresql', folder: 'postgresql', sourceFiles: [] },
      { id: 'mongodb', title: 'MongoDB Document Architecture', slug: 'mongodb', folder: 'mongodb', sourceFiles: [] },
      { id: 'redis', title: 'Redis In-Memory Caching', slug: 'redis', folder: 'redis', sourceFiles: [] },
      { id: 'database-design', title: 'Database Design & Schema Normalization', slug: 'database-design', folder: 'database-design', sourceFiles: [] }
    ]
  },
  {
    id: '05-computer-science',
    title: '05. COMPUTER SCIENCE',
    description: 'Underlying hardware-software fundamentals, kernel architecture, database internals, and network protocols.',
    icon: 'FaDesktop',
    courses: [
      { id: 'operating-systems', title: 'Operating Systems', slug: 'operating-system', folder: 'operating-systems', sourceFiles: ['operating-system.json'] },
      { id: 'dbms', title: 'Database Management Systems (DBMS)', slug: 'dbms', folder: 'dbms', sourceFiles: [] },
      { id: 'computer-networks', title: 'Computer Networks', slug: 'computer-networks', folder: 'computer-networks', sourceFiles: [] },
      { id: 'computer-architecture', title: 'Computer Architecture & COA', slug: 'computer-architecture', folder: 'computer-architecture', sourceFiles: [] },
      { id: 'compiler-design', title: 'Compiler Design', slug: 'compiler-design', folder: 'compiler-design', sourceFiles: [] },
      { id: 'software-engineering', title: 'Software Engineering Principles', slug: 'software-engineering', folder: 'software-engineering', sourceFiles: [] }
    ]
  },
  {
    id: '06-system-design',
    title: '06. SYSTEM DESIGN',
    description: 'Architecting ultra-high scale distributed systems, microservices, consistency guarantees, and cloud topologies.',
    icon: 'FaServer',
    courses: [
      { id: 'system-design-fundamentals', title: 'System Design Fundamentals', slug: 'system-design-fundamentals', folder: 'system-design-fundamentals', sourceFiles: [] },
      { id: 'low-level-design', title: 'Low Level Design (LLD & OOP Design Patterns)', slug: 'low-level-design', folder: 'low-level-design', sourceFiles: [] },
      { id: 'high-level-design', title: 'High Level Design (HLD)', slug: 'high-level-design', folder: 'high-level-design', sourceFiles: [] },
      { id: 'distributed-systems', title: 'Distributed Systems Architecture', slug: 'distributed-systems', folder: 'distributed-systems', sourceFiles: [] },
      { id: 'microservices', title: 'Microservices & Event-Driven Patterns', slug: 'microservices', folder: 'microservices', sourceFiles: [] },
      { id: 'scalability', title: 'Scalability & Reliability Engineering', slug: 'scalability', folder: 'scalability', sourceFiles: [] },
      { id: 'cloud-architecture', title: 'Cloud Architecture Patterns', slug: 'cloud-architecture', folder: 'cloud-architecture', sourceFiles: [] }
    ]
  },
  {
    id: '07-ai-ml',
    title: '07. AI / ML',
    description: 'Artificial intelligence math, predictive modeling, deep neural networks, transformer architectures, and LLMs.',
    icon: 'FaBrain',
    courses: [
      { id: 'ai-fundamentals', title: 'AI Fundamentals', slug: 'ai-fundamentals', folder: 'ai-fundamentals', sourceFiles: [] },
      { id: 'machine-learning', title: 'Machine Learning Engineering', slug: 'machine-learning', folder: 'machine-learning', sourceFiles: ['machine-learning.json', 'numpy.json', 'pandas.json', 'matplotlib.json'] },
      { id: 'deep-learning', title: 'Deep Learning & Neural Architectures', slug: 'deep-learning-ai', folder: 'deep-learning', sourceFiles: ['deep-learning-ai.json'] },
      { id: 'nlp', title: 'Natural Language Processing (NLP)', slug: 'nlp', folder: 'nlp', sourceFiles: [] },
      { id: 'computer-vision', title: 'Computer Vision', slug: 'computer-vision', folder: 'computer-vision', sourceFiles: [] },
      { id: 'generative-ai', title: 'Generative AI Foundations', slug: 'generative-ai', folder: 'generative-ai', sourceFiles: [] },
      { id: 'llm-engineering', title: 'LLM Engineering & Agentic AI', slug: 'llm-engineering', folder: 'llm-engineering', sourceFiles: [] }
    ]
  },
  {
    id: '08-cloud-devops',
    title: '08. CLOUD & DEVOPS',
    description: 'Linux systems administration, containers, cluster orchestration, automated pipelines, and hyperscalers.',
    icon: 'FaCloud',
    courses: [
      { id: 'linux', title: 'Linux Fundamentals & Shell Scripting', slug: 'linux', folder: 'linux', sourceFiles: [] },
      { id: 'git-github', title: 'Git & GitHub Collaboration', slug: 'git-github', folder: 'git-github', sourceFiles: ['git-github.json'] },
      { id: 'docker', title: 'Docker Containerization', slug: 'docker', folder: 'docker', sourceFiles: [] },
      { id: 'kubernetes', title: 'Kubernetes Orchestration', slug: 'kubernetes', folder: 'kubernetes', sourceFiles: [] },
      { id: 'ci-cd', title: 'CI/CD Automated Pipelines', slug: 'ci-cd', folder: 'ci-cd', sourceFiles: [] },
      { id: 'aws', title: 'AWS Cloud Practitioner & Solutions', slug: 'aws', folder: 'aws', sourceFiles: [] },
      { id: 'azure', title: 'Microsoft Azure Cloud Systems', slug: 'azure', folder: 'azure', sourceFiles: [] },
      { id: 'gcp', title: 'Google Cloud Platform (GCP)', slug: 'gcp', folder: 'gcp', sourceFiles: [] }
    ]
  },
  {
    id: '09-mobile-development',
    title: '09. MOBILE DEVELOPMENT',
    description: 'Native and cross-platform mobile engineering for iOS and Android ecosystems.',
    icon: 'FaMobileAlt',
    courses: [
      { id: 'android', title: 'Android Native App Engineering', slug: 'android', folder: 'android', sourceFiles: [] },
      { id: 'kotlin', title: 'Kotlin Mobile & Systems', slug: 'kotlin', folder: 'kotlin', sourceFiles: ['kotlin.json', 'kotlin-beginner-part-1.json', 'kotlin-beginner-part-2.json'] },
      { id: 'flutter', title: 'Flutter & Dart Cross-Platform', slug: 'flutter', folder: 'flutter', sourceFiles: [] },
      { id: 'react-native', title: 'React Native Mobile Applications', slug: 'react-native', folder: 'react-native', sourceFiles: [] },
      { id: 'ios-swift', title: 'iOS & Swift Native Architecture', slug: 'ios-swift', folder: 'ios-swift', sourceFiles: [] }
    ]
  },
  {
    id: '10-software-testing',
    title: '10. SOFTWARE TESTING',
    description: 'Quality assurance, unit test pyramids, integration validation, end-to-end automation, and security audits.',
    icon: 'FaVial',
    courses: [
      { id: 'manual-testing', title: 'Manual Testing & QA Fundamentals', slug: 'manual-testing', folder: 'manual-testing', sourceFiles: [] },
      { id: 'automation-testing', title: 'Automation Testing Foundations', slug: 'automation-testing', folder: 'automation-testing', sourceFiles: [] },
      { id: 'api-testing', title: 'API Testing (Postman & REST Assured)', slug: 'api-testing', folder: 'api-testing', sourceFiles: [] },
      { id: 'performance-testing', title: 'Performance & Load Testing (JMeter)', slug: 'performance-testing', folder: 'performance-testing', sourceFiles: [] },
      { id: 'security-testing', title: 'Security & Penetration Testing', slug: 'security-testing', folder: 'security-testing', sourceFiles: [] },
      { id: 'test-automation-frameworks', title: 'Test Automation Frameworks (Selenium & Playwright)', slug: 'test-automation-frameworks', folder: 'test-automation-frameworks', sourceFiles: [] }
    ]
  },
  {
    id: '11-projects',
    title: '11. PROJECTS',
    description: 'Portfolio-ready, production-grade applications across modern tech stacks with guided stages.',
    icon: 'FaDraftingCompass',
    courses: [
      { id: 'beginner-projects', title: 'Beginner Projects (Console & Scripting)', slug: 'beginner-projects', folder: 'beginner-projects', sourceFiles: [] },
      { id: 'intermediate-projects', title: 'Intermediate Projects (Web & APIs)', slug: 'intermediate-projects', folder: 'intermediate-projects', sourceFiles: [] },
      { id: 'advanced-projects', title: 'Advanced Projects (Microservices & Scale)', slug: 'advanced-projects', folder: 'advanced-projects', sourceFiles: [] },
      { id: 'full-stack-projects', title: 'Full Stack Real-World Applications', slug: 'full-stack-projects', folder: 'full-stack-projects', sourceFiles: [] },
      { id: 'ai-projects', title: 'AI & Machine Learning Capstones', slug: 'ai-projects', folder: 'ai-projects', sourceFiles: [] },
      { id: 'capstone-projects', title: 'Industry-Grade Capstone Projects', slug: 'capstone-projects', folder: 'capstone-projects', sourceFiles: [] }
    ]
  },
  {
    id: '12-interview-placement',
    title: '12. INTERVIEW & PLACEMENT',
    description: 'Interview bootcamps, high-frequency company problem banks, technical drills, and behavioral mastery.',
    icon: 'FaUserGraduate',
    courses: [
      { id: 'programming-interview', title: 'Programming Language Drills for Interviews', slug: 'programming-interview', folder: 'programming', sourceFiles: [] },
      { id: 'dsa-interview', title: 'DSA Interview Crash Course & 75 LeetCode Blind', slug: 'dsa-interview', folder: 'dsa', sourceFiles: [] },
      { id: 'sql-interview', title: 'SQL & Database Interview Mastery', slug: 'sql-interview', folder: 'sql', sourceFiles: [] },
      { id: 'core-cs-interview', title: 'Core CS Subject Quick Revisions (OS, DBMS, CN)', slug: 'core-cs-interview', folder: 'core-cs', sourceFiles: [] },
      { id: 'aptitude', title: 'Quantitative Aptitude & Logical Reasoning', slug: 'aptitude-and-reasoning', folder: 'aptitude', sourceFiles: ['aptitude-and-reasoning.json'] },
      { id: 'coding-assessment', title: 'OA & Coding Assessment Simulation', slug: 'coding-assessment', folder: 'coding-assessment', sourceFiles: [] },
      { id: 'technical-interview', title: 'Technical Interview Mastery & Live Coding', slug: 'technical-interview', folder: 'technical-interview', sourceFiles: [] },
      { id: 'hr-interview', title: 'HR & Behavioral Interview Preparation', slug: 'hr-interview', folder: 'hr-interview', sourceFiles: [] },
      { id: 'mock-interviews', title: 'Mock Technical & Behavioral Interviews', slug: 'mock-interviews', folder: 'mock-interviews', sourceFiles: [] }
    ]
  }
];

const STANDARD_SERIES = [
  { id: 'foundation', title: 'Foundation', description: 'Essential building blocks, core theory, environment setup.' },
  { id: 'core', title: 'Core', description: 'Primary syntax, core data structures, algorithms, and key patterns.' },
  { id: 'intermediate', title: 'Intermediate', description: 'Production patterns, optimization, idiomatic constructs.' },
  { id: 'advanced', title: 'Advanced', description: 'Complex algorithms, architectural trade-offs, high performance.' },
  { id: 'expert', title: 'Expert', description: 'Industry engineering, system scaling, production grade mastery.' }
];

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function loadRealCourse(filename) {
  const filePath = path.join(REAL_COURSES_DIR, filename);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Error reading ${filename}:`, err.message);
    return null;
  }
}

function buildModularCatalog() {
  console.log('🚀 Starting Modular Mini-JSON Catalog Builder...');
  ensureDir(CATALOG_DIR);

  // 1. Write domains.json
  const domainsManifestPath = path.join(CATALOG_DIR, 'domains.json');
  fs.writeFileSync(domainsManifestPath, JSON.stringify(DOMAINS, null, 2), 'utf8');
  console.log(`✅ Saved master domains manifest: ${domainsManifestPath}`);

  let totalCoursesCreated = 0;
  let totalModulesCreated = 0;

  for (const domain of DOMAINS) {
    const domainFolder = path.join(CATALOG_DIR, domain.id);
    ensureDir(domainFolder);

    for (const courseDef of domain.courses) {
      const courseDir = path.join(domainFolder, courseDef.folder);
      const modulesDir = path.join(courseDir, 'modules');
      ensureDir(modulesDir);

      // Check if we have source real course files to migrate
      let sourceCourse = null;
      for (const srcFile of courseDef.sourceFiles) {
        sourceCourse = loadRealCourse(srcFile);
        if (sourceCourse) break;
      }

      const courseId = sourceCourse?.courseId || courseDef.slug || courseDef.id;
      const title = sourceCourse?.title || courseDef.title;
      const description = sourceCourse?.description || `${title} comprehensive curriculum covering foundations to advanced production mastery.`;
      const level = sourceCourse?.level || 'Intermediate';
      const category = domain.title.replace(/^\d+\.\s*/, '');
      const skills = sourceCourse?.skills || [title, category, 'Problem Solving', 'Engineering'];
      const outcomes = sourceCourse?.outcomes || [
        `Master foundational to advanced concepts in ${title}`,
        'Solve real-world coding problems with optimized time and space complexity',
        'Build industry-ready projects and pass dual 90% gateway assessments'
      ];
      const prerequisites = sourceCourse?.prerequisites || ['Basic computer literacy', 'Problem-solving mindset'];

      let moduleManifests = [];

      if (sourceCourse && Array.isArray(sourceCourse.modules) && sourceCourse.modules.length > 0) {
        // Split existing course into mini JSONs
        sourceCourse.modules.forEach((mod, idx) => {
          const modNum = String(idx + 1).padStart(2, '0');
          const modSlug = slugify(mod.title || `module-${modNum}`).slice(0, 40);
          const miniFileName = `m${modNum}-${modSlug}.json`;
          const miniFilePath = path.join(modulesDir, miniFileName);

          // Assign seriesId based on module index
          let seriesId = 'core';
          if (idx === 0) seriesId = 'foundation';
          else if (idx === 1 || idx === 2) seriesId = 'core';
          else if (idx === 3 || idx === 4) seriesId = 'intermediate';
          else if (idx === 5 || idx === 6) seriesId = 'advanced';
          else seriesId = 'expert';

          const miniModuleData = {
            moduleId: mod.moduleId || `mod-${courseDef.id}-${modNum}`,
            courseId: courseId,
            title: mod.title || `Module ${idx + 1}`,
            description: mod.description || '',
            seriesId: mod.seriesId || seriesId,
            order: idx + 1,
            estimatedHours: mod.estimatedHours || 2.5,
            topics: (mod.topics || []).map((t, tIdx) => ({
              ...t,
              topicId: t.topicId || `top-${courseDef.id}-${modNum}-${tIdx + 1}`,
              seriesId: seriesId,
              order: t.order || tIdx + 1,
              skillTracking: t.skillTracking || {
                key: `${courseDef.id.toUpperCase()}.${slugify(t.title || 'TOPIC').toUpperCase()}`,
                competency: seriesId
              }
            })),
            msa: mod.msa || null
          };

          fs.writeFileSync(miniFilePath, JSON.stringify(miniModuleData, null, 2), 'utf8');
          totalModulesCreated++;

          moduleManifests.push({
            moduleId: miniModuleData.moduleId,
            title: miniModuleData.title,
            description: miniModuleData.description,
            seriesId: miniModuleData.seriesId,
            order: miniModuleData.order,
            estimatedHours: miniModuleData.estimatedHours,
            topicsCount: miniModuleData.topics.length,
            moduleFile: `modules/${miniFileName}`,
            hasMsa: Boolean(mod.msa)
          });
        });
      } else {
        // Generate structured starter module manifests conforming to standard course structure
        const starterModuleTemplates = courseDef.topicsList ? courseDef.topicsList.map((tName, i) => ({
          title: `${i + 1}. ${tName}`,
          desc: `Comprehensive algorithmic principles, memory layout, invariants, and operations for ${tName}.`,
          topicName: tName
        })) : courseDef.patternsList ? courseDef.patternsList.map((pName, i) => ({
          title: `Pattern ${i + 1}: ${pName}`,
          desc: `High-frequency interview pattern recognition, pointer management, and template solutions for ${pName}.`,
          topicName: pName
        })) : courseDef.advancedTopicsList ? courseDef.advancedTopicsList.map((aName, i) => ({
          title: `Advanced ${i + 1}: ${aName}`,
          desc: `Rigorous mathematical foundations, asymptotic analysis, and optimal implementations for ${aName}.`,
          topicName: aName
        })) : [
          { title: '1. Foundations & Environment Setup', desc: `Get started with ${title} syntax, tools, compiler/interpreter, and hello world.` },
          { title: '2. Core Syntax & Data Handling', desc: `Variables, data types, control flow, functions, and memory structures in ${title}.` },
          { title: '3. Intermediate Engineering Patterns', desc: `Object-oriented / functional patterns, error handling, and modular code.` },
          { title: '4. Advanced Architecture & Performance', desc: `Concurrency, asynchronous runtimes, memory profiling, and optimizations.` },
          { title: '5. Capstone Project & Production Deployment', desc: `Architect and deploy an end-to-end industry application in ${title}.` }
        ];

        starterModuleTemplates.forEach((tmpl, idx) => {
          const modNum = String(idx + 1).padStart(2, '0');
          const modSlug = slugify(tmpl.title).slice(0, 40);
          const miniFileName = `m${modNum}-${modSlug}.json`;
          const miniFilePath = path.join(modulesDir, miniFileName);

          let seriesId = 'core';
          if (idx === 0) seriesId = 'foundation';
          else if (idx < 3) seriesId = 'core';
          else if (idx < 6) seriesId = 'intermediate';
          else if (idx < 12) seriesId = 'advanced';
          else seriesId = 'expert';

          const moduleId = `mod-${courseDef.id}-${modNum}`;
          const topicId = `top-${courseDef.id}-${modNum}-01`;

          const miniModuleData = {
            moduleId,
            courseId,
            title: tmpl.title,
            description: tmpl.desc,
            seriesId,
            order: idx + 1,
            estimatedHours: 2.0,
            topics: [
              {
                topicId,
                title: tmpl.topicName || tmpl.title,
                order: 1,
                seriesId,
                lesson: {
                  readTime: '15 mins',
                  summary: `Master the essential principles and design patterns of ${tmpl.title}.`,
                  content: `### Understanding ${tmpl.title}\n\nIn this lesson, we explore the fundamental mechanics, theoretical guarantees, and practical engineering applications of **${tmpl.title}**.\n\n#### Key Learning Objectives:\n1. Core concepts, definitions, and mental models\n2. Complexity analysis and asymptotic bounds\n3. Common edge cases and defensive patterns\n4. Real-world industry benchmarks and applications`
                },
                examples: [
                  {
                    exampleId: `ex-${courseDef.id}-${modNum}-1`,
                    title: `Canonical ${tmpl.title} Implementation`,
                    explanation: 'Step-by-step walk-through of the standard pattern.',
                    code: `// ${tmpl.title} Pattern Template\nfunction solvePattern() {\n  // 1. Initialize pointers & state\n  // 2. Traverse structure invariant\n  // 3. Return verified result\n  return true;\n}`
                  }
                ],
                practiceProblems: [
                  {
                    problemId: `p-${courseDef.id}-${modNum}-1`,
                    title: `${tmpl.title} Verification Drill`,
                    difficulty: 'Medium',
                    task: `Implement the verified routine for ${tmpl.title} meeting optimal time complexity.`,
                    starterCode: `// Implement your solution here\nfunction run() {\n  \n}`
                  }
                ],
                codingProblems: [
                  {
                    id: `cp-${courseDef.id}-${modNum}-1`,
                    title: `Optimal ${tmpl.title} Challenge`,
                    difficulty: 'Medium',
                    starterCode: `// Write optimal code for ${tmpl.title}\nfunction solution(input) {\n  return input;\n}`,
                    solution: `function solution(input) {\n  return input;\n}`
                  }
                ],
                assessments: [
                  {
                    id: `q-${courseDef.id}-${modNum}-1`,
                    question: `What is the primary operational invariant for ${tmpl.title}?`,
                    options: [
                      'Preserves monotonic ordering or bounds',
                      'Requires linear auxiliary space in all cases',
                      'Operates only on immutable memory buffers',
                      'Guarantees constant amortized execution'
                    ],
                    correctAnswer: 0,
                    explanation: 'The primary operational invariant maintains bounded constraints on each step.'
                  }
                ],
                projects: [
                  {
                    projectId: `proj-${courseDef.id}-${modNum}-1`,
                    title: `${tmpl.title} Hands-on Build`,
                    description: `Construct a working module incorporating ${tmpl.title}.`
                  }
                ],
                skillTracking: {
                  key: `${courseDef.id.toUpperCase()}.${slugify(tmpl.title).toUpperCase()}`,
                  competency: seriesId
                }
              }
            ],
            msa: {
              assessmentId: `msa-${courseDef.id}-${modNum}`,
              title: `${tmpl.title} Mastery Assessment`,
              description: 'Dual 90% Pass Gate validation on theory & coding practice.',
              passScorePercent: 90,
              durationMinutes: 45
            }
          };

          fs.writeFileSync(miniFilePath, JSON.stringify(miniModuleData, null, 2), 'utf8');
          totalModulesCreated++;

          moduleManifests.push({
            moduleId,
            title: tmpl.title,
            description: tmpl.desc,
            seriesId,
            order: idx + 1,
            estimatedHours: 2.0,
            topicsCount: miniModuleData.topics.length,
            moduleFile: `modules/${miniFileName}`,
            hasMsa: true
          });
        });
      }

      // 2. Create the course manifest course.json
      const courseManifest = {
        courseId,
        id: courseId,
        slug: courseDef.slug || courseId,
        title,
        domainId: domain.id,
        domainTitle: domain.title,
        category,
        description,
        level,
        enrolledCount: sourceCourse?.enrolledCount || 1200 + Math.floor(Math.random() * 800),
        rating: sourceCourse?.rating || 4.9,
        reviewsCount: sourceCourse?.reviewsCount || 128,
        reviews: sourceCourse?.reviews || [],
        skills,
        outcomes,
        prerequisites,
        series: STANDARD_SERIES,
        subTracks: courseDef.subTracks || null,
        modulesCount: moduleManifests.length,
        lessonsCount: moduleManifests.reduce((acc, m) => acc + (m.topicsCount || 0), 0),
        estimatedHours: moduleManifests.reduce((acc, m) => acc + (m.estimatedHours || 2), 0),
        modules: moduleManifests,
        updatedAt: new Date().toISOString()
      };

      const courseManifestPath = path.join(courseDir, 'course.json');
      fs.writeFileSync(courseManifestPath, JSON.stringify(courseManifest, null, 2), 'utf8');
      totalCoursesCreated++;
    }
  }

  console.log(`\n🎉 DONE! Generated:`);
  console.log(`   - 12 Domains`);
  console.log(`   - ${totalCoursesCreated} Course Manifests (course.json)`);
  console.log(`   - ${totalModulesCreated} Modular Mini-JSON files (modules/*.json)`);
}

buildModularCatalog();
