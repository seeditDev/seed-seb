import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const REAL_COURSES_DIR = path.join(FRONTEND_ROOT, 'src', 'courses', 'data', 'realCourses');
const CATALOG_DIR = path.join(FRONTEND_ROOT, 'src', 'courses', 'data', 'catalog');

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

function loadJson(filepath) {
  if (!fs.existsSync(filepath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (err) {
    console.error(`Error loading JSON from ${filepath}:`, err.message);
    return null;
  }
}

// 1. Build a Master Knowledge Index of all 76 Real Course Files
console.log('📦 Reading and indexing all 76 Real Course JSON files...');
const realFiles = fs.readdirSync(REAL_COURSES_DIR).filter(f => f.endsWith('.json')).sort();
console.log(`Found ${realFiles.length} files in ${REAL_COURSES_DIR}`);

const realCourseDataMap = new Map(); // filename -> parsed JSON
const globalTopicIndex = new Map(); // topicId / title -> topic object

for (const f of realFiles) {
  const data = loadJson(path.join(REAL_COURSES_DIR, f));
  if (!data) continue;
  realCourseDataMap.set(f, data);

  const mods = data.modules || (data.curriculum ? data.curriculum.modules : []) || [];
  for (const m of mods) {
    const ts = m.topics || m.lessons || [];
    for (const t of ts) {
      const tid = t.topicId || t.id;
      const title = (t.title || '').trim().toLowerCase();
      const pCount = (t.pages || []).length;
      const exCount = (t.codeExamples || []).length;

      // Index by topic ID
      if (tid) {
        const existing = globalTopicIndex.get(tid);
        if (!existing || pCount > (existing.pages?.length || 0) || exCount > (existing.codeExamples?.length || 0)) {
          globalTopicIndex.set(tid, { ...t, _sourceFile: f, _moduleTitle: m.title });
        }
      }

      // Index by title
      if (title) {
        const titleKey = `title:${title}`;
        const existing = globalTopicIndex.get(titleKey);
        if (!existing || pCount > (existing.pages?.length || 0) || exCount > (existing.codeExamples?.length || 0)) {
          globalTopicIndex.set(titleKey, { ...t, _sourceFile: f, _moduleTitle: m.title });
        }
      }
    }
  }
}

console.log(`✅ Indexed ${globalTopicIndex.size} authentic topic references from ${realFiles.length} files.`);

// 2. Define Full Multi-Source Manifest for All Courses
const COURSE_SOURCE_MAPPINGS = [
  // --- 01. PROGRAMMING ---
  {
    domainId: '01-programming',
    courseId: 'c',
    slug: 'c',
    folder: 'c',
    title: 'C Programming',
    description: 'Master low-level systems programming, pointer mechanics, manual memory management, and data structures in C.',
    category: 'Programming Languages',
    level: 'Beginner to Advanced',
    estimatedHours: 40,
    sourceFiles: ['c.json', 'c-beginner-v2-p1.json', 'c-beginner-v2-p2.json', 'college-programming-c.json']
  },
  {
    domainId: '01-programming',
    courseId: 'cpp',
    slug: 'cpp',
    folder: 'cpp',
    title: 'C++ Programming',
    description: 'Modern C++ engineering covering OOP, STL algorithms, move semantics, template metaprogramming, and production application building.',
    category: 'Programming Languages',
    level: 'Beginner to Expert',
    estimatedHours: 65,
    sourceFiles: ['cpp-development.json', 'cpp.json', 'college-oops-cpp.json', 'college-programming-cpp.json', 'cpp-stl.json', 'cpp-beginner-v2-p1.json', 'cpp-beginner-v2-p2.json']
  },
  {
    domainId: '01-programming',
    courseId: 'java',
    slug: 'java',
    folder: 'java',
    title: 'Java Programming',
    description: 'Enterprise Java engineering covering JVM architecture, OOP, Collections Framework, Streams, Concurrency, and full-stack projects.',
    category: 'Programming Languages',
    level: 'Beginner to Expert',
    estimatedHours: 60,
    sourceFiles: ['java-development.json', 'java.json', 'college-oops-java.json', 'advance-java.json', 'java-beginner-v2-p1.json', 'java-beginner-v2-p2.json']
  },
  {
    domainId: '01-programming',
    courseId: 'python',
    slug: 'python',
    folder: 'python',
    title: 'Python Programming',
    description: 'Python mastery from basic syntax to advanced OOP, functional programming, memory models, and algorithmic problem solving.',
    category: 'Programming Languages',
    level: 'Beginner to Advanced',
    estimatedHours: 45,
    sourceFiles: ['oops-concepts-in-python.json', 'python-beginner-v2-p1.json', 'python-beginner-v2-p2.json', 'advanced-python.json']
  },
  {
    domainId: '01-programming',
    courseId: 'javascript',
    slug: 'javascript',
    folder: 'javascript',
    title: 'JavaScript Programming',
    description: 'Deep dive into modern JavaScript runtimes, asynchronous event loops, prototypes, ES6+ semantics, and memory profiling.',
    category: 'Programming Languages',
    level: 'Beginner to Advanced',
    estimatedHours: 45,
    sourceFiles: ['javascript.json', 'advanced-javascript.json']
  },
  {
    domainId: '01-programming',
    courseId: 'csharp',
    slug: 'csharp',
    folder: 'csharp',
    title: 'C# Programming',
    description: 'Modern .NET and C# programming covering CLR fundamentals, LINQ, OOP, async/await patterns, and enterprise software design.',
    category: 'Programming Languages',
    level: 'Beginner to Advanced',
    estimatedHours: 40,
    sourceFiles: ['c-sharp.json', 'c-sharp-beginner-part-1.json']
  },
  {
    domainId: '01-programming',
    courseId: 'go',
    slug: 'go',
    folder: 'go',
    title: 'Go Programming',
    description: 'Concurrent backend systems and high-throughput microservices using Go, goroutines, channels, and idiomatic Go architecture.',
    category: 'Programming Languages',
    level: 'Intermediate',
    estimatedHours: 35,
    sourceFiles: ['go.json']
  },
  {
    domainId: '01-programming',
    courseId: 'rust',
    slug: 'rust',
    folder: 'rust',
    title: 'Rust Programming',
    description: 'Memory safety without garbage collection, borrow checker semantics, fearless concurrency, and zero-cost abstractions in Rust.',
    category: 'Programming Languages',
    level: 'Intermediate to Advanced',
    estimatedHours: 45,
    sourceFiles: ['rust.json']
  },
  {
    domainId: '01-programming',
    courseId: 'php',
    slug: 'php',
    folder: 'php',
    title: 'PHP Modern Web Programming',
    description: 'Server-side web development using modern PHP, MVC architecture, OOP, PDO database connectivity, and secure API construction.',
    category: 'Programming Languages',
    level: 'Beginner to Intermediate',
    estimatedHours: 35,
    sourceFiles: ['php.json']
  },
  {
    domainId: '01-programming',
    courseId: 'r',
    slug: 'r',
    folder: 'r',
    title: 'R Programming for Data Science',
    description: 'Statistical computing, exploratory data analysis, data frame transformations, and visualization in R.',
    category: 'Programming Languages',
    level: 'Beginner to Intermediate',
    estimatedHours: 35,
    sourceFiles: ['r.json']
  },

  // --- 02. DATA STRUCTURES & ALGORITHMS ---
  {
    domainId: '02-dsa',
    courseId: 'dsa-foundation',
    slug: 'dsa-foundation',
    folder: 'dsa-foundation',
    title: 'DSA Foundation: Time & Space Complexity',
    description: 'Asymptotic notation, Big-O, Big-Omega, Big-Theta, master theorem, and rigorous mathematical runtime complexity analysis.',
    category: 'Data Structures & Algorithms',
    level: 'Beginner to Intermediate',
    estimatedHours: 20,
    sourceFiles: ['time-complexity.json']
  },
  {
    domainId: '02-dsa',
    courseId: 'dsa-core',
    slug: 'dsa-core',
    folder: 'dsa-core',
    title: 'Data Structures & Algorithms Core',
    description: 'Comprehensive DSA curriculum covering Arrays, Linked Lists, Stacks, Queues, Trees, BSTs, Heaps, Graphs, Hashing, Recursion, Sorting, Searching, and Dynamic Programming with multi-language implementations.',
    category: 'Data Structures & Algorithms',
    level: 'Beginner to Advanced',
    estimatedHours: 85,
    sourceFiles: [
      'dsa.json',
      'arrays.json',
      'linked-lists-new.json',
      'stacks-and-queues-new.json',
      'trees-new.json',
      'graphs-new.json',
      'dynamic-programming-new.json',
      'greedy-algorithms.json',
      'searching-sorting-new.json',
      'sorting-intermediate.json',
      'bit-manipulation.json',
      'recursion-new.json',
      'hashing.json',
      'heaps.json',
      'dsa-in-c.json',
      'dsa-in-cpp.json'
    ]
  },
  {
    domainId: '02-dsa',
    courseId: 'dsa-problem-solving',
    slug: 'dsa-problem-solving',
    folder: 'dsa-problem-solving',
    title: 'DSA Problem Solving & Binary Search Patterns',
    description: '14 Core algorithmic patterns including Two Pointers, Sliding Window, Prefix Sum, Monotonic Stack, and Deep Binary Search Mastery.',
    category: 'Data Structures & Algorithms',
    level: 'Intermediate to Advanced',
    estimatedHours: 50,
    sourceFiles: ['binary-search-new.json', 'dsa.json']
  },
  {
    domainId: '02-dsa',
    courseId: 'advanced-dsa',
    slug: 'advanced-dsa',
    folder: 'advanced-dsa',
    title: 'Advanced DSA & Graph Theory',
    description: 'Advanced graph algorithms, Disjoint Set Union (DSU), Tries, Advanced Dynamic Programming, and optimal data structure design.',
    category: 'Data Structures & Algorithms',
    level: 'Advanced',
    estimatedHours: 45,
    sourceFiles: ['graphs-advanced.json', 'dynamic-programming-advanced.json', 'tries.json', 'dsu.json']
  },
  {
    domainId: '02-dsa',
    courseId: 'competitive-programming',
    slug: 'competitive-programming',
    folder: 'competitive-programming',
    title: 'Competitive Programming: Math & Combinatorics',
    description: 'Number theory, modular arithmetic, prime factorization, combinatorics, and high-performance competitive programming strategies.',
    category: 'Data Structures & Algorithms',
    level: 'Advanced to Expert',
    estimatedHours: 40,
    sourceFiles: ['number-theory.json', 'combinatorics.json']
  },
  {
    domainId: '02-dsa',
    courseId: 'advanced-competitive-programming',
    slug: 'advanced-competitive-programming',
    folder: 'advanced-competitive-programming',
    title: 'Advanced Competitive Programming & DP',
    description: 'Multi-dimensional Dynamic Programming, bitmask DP, digit DP, tree DP, and advanced algorithmic contest challenges.',
    category: 'Data Structures & Algorithms',
    level: 'Expert',
    estimatedHours: 45,
    sourceFiles: ['dynamic-programming-advanced.json']
  },

  // --- 03. WEB DEVELOPMENT ---
  {
    domainId: '03-web-development',
    courseId: 'html',
    slug: 'html',
    folder: 'html',
    title: 'HTML Foundations & Semantic Web',
    description: 'Semantic HTML5 structure, accessibility (a11y), forms, DOM hierarchy, and web standards compliance.',
    category: 'Web Development',
    level: 'Beginner',
    estimatedHours: 25,
    sourceFiles: ['html.json']
  },
  {
    domainId: '03-web-development',
    courseId: 'css',
    slug: 'css',
    folder: 'css',
    title: 'CSS & Modern Responsive Styling',
    description: 'Flexbox, CSS Grid, animations, variables, media queries, and responsive modern UI engineering.',
    category: 'Web Development',
    level: 'Beginner to Intermediate',
    estimatedHours: 30,
    sourceFiles: ['css.json']
  },
  {
    domainId: '03-web-development',
    courseId: 'javascript-web',
    slug: 'javascript-web',
    folder: 'javascript-web',
    title: 'JavaScript for Web Developers',
    description: 'Interactive DOM manipulation, event bubbling, AJAX/Fetch, Web APIs, and client-side web application architectures.',
    category: 'Web Development',
    level: 'Intermediate',
    estimatedHours: 35,
    sourceFiles: ['web-dev-js.json']
  },
  {
    domainId: '03-web-development',
    courseId: 'react',
    slug: 'react-js',
    folder: 'react',
    title: 'React.js Component Architecture',
    description: 'Modern React component engineering, Hooks, virtual DOM reconciliation, state management, and full-stack interactive labs.',
    category: 'Web Development',
    level: 'Intermediate to Advanced',
    estimatedHours: 45,
    sourceFiles: ['react-js.json']
  },
  {
    domainId: '03-web-development',
    courseId: 'nodejs',
    slug: 'nodejs',
    folder: 'nodejs',
    title: 'Node.js Backend Runtimes & APIs',
    description: 'Server-side JavaScript runtimes, event-driven I/O, Express routing, RESTful web services, and database integration.',
    category: 'Web Development',
    level: 'Intermediate',
    estimatedHours: 40,
    sourceFiles: ['nodejs.json']
  },
  {
    domainId: '03-web-development',
    courseId: 'springboot',
    slug: 'springboot',
    folder: 'springboot',
    title: 'Spring Boot Enterprise Backend',
    description: 'Production Java web services using Spring Boot, dependency injection, JPA/Hibernate, Spring Security, and REST APIs.',
    category: 'Web Development',
    level: 'Intermediate to Advanced',
    estimatedHours: 45,
    sourceFiles: ['springboot.json']
  },
  {
    domainId: '03-web-development',
    courseId: 'django',
    slug: 'django',
    folder: 'django',
    title: 'Django Full-Stack Web Framework',
    description: 'Batteries-included web development with Python and Django, ORM models, auth, class-based views, and admin dashboards.',
    category: 'Web Development',
    level: 'Intermediate',
    estimatedHours: 40,
    sourceFiles: ['django.json']
  },
  {
    domainId: '03-web-development',
    courseId: 'flask',
    slug: 'flask',
    folder: 'flask',
    title: 'Flask Microframework Web Engineering',
    description: 'Lightweight web APIs and microservices in Python using Flask, Jinja templates, SQLAlchemy, and modular blueprints.',
    category: 'Web Development',
    level: 'Intermediate',
    estimatedHours: 35,
    sourceFiles: ['flask.json']
  },
  {
    domainId: '03-web-development',
    courseId: 'ux',
    slug: 'ux',
    folder: 'ux',
    title: 'UI/UX Design for Web Developers',
    description: 'Human-computer interaction principles, wireframing, color theory, typography, design systems, and user testing.',
    category: 'Web Development',
    level: 'Beginner to Intermediate',
    estimatedHours: 25,
    sourceFiles: ['ux.json']
  },

  // --- 04. DATABASES ---
  {
    domainId: '04-databases',
    courseId: 'sql',
    slug: 'sql',
    folder: 'sql',
    title: 'Interactive SQL Mastery & Database Systems',
    description: 'Relational database querying, multi-table joins, subqueries, window functions, indexing, CTEs, stored procedures, and procedural SQL.',
    category: 'Database Systems',
    level: 'Beginner to Advanced',
    estimatedHours: 45,
    sourceFiles: ['sql-interactive.json', 'sql-intermediate.json', 'sql-at-work.json', 'pl-sql.json']
  },

  // --- 05. COMPUTER SCIENCE ---
  {
    domainId: '05-computer-science',
    courseId: 'operating-systems',
    slug: 'operating-systems',
    folder: 'operating-systems',
    title: 'Operating Systems Mastery',
    description: 'Process management, CPU scheduling, thread synchronization, deadlocks, virtual memory, paging, segmentation, and file systems.',
    category: 'Systems & Architecture',
    level: 'Intermediate to Advanced',
    estimatedHours: 50,
    sourceFiles: ['operating-system.json']
  },

  // --- 07. AI / ML ---
  {
    domainId: '07-ai-ml',
    courseId: 'machine-learning',
    slug: 'machine-learning',
    folder: 'machine-learning',
    title: 'Machine Learning Engineering',
    description: 'Supervised and unsupervised learning, regression, classification, clustering, NumPy vectorized math, Pandas wrangling, and Matplotlib.',
    category: 'Artificial Intelligence & ML',
    level: 'Intermediate to Advanced',
    estimatedHours: 55,
    sourceFiles: ['machine-learning.json', 'numpy.json', 'pandas.json', 'matplotlib.json']
  },
  {
    domainId: '07-ai-ml',
    courseId: 'deep-learning',
    slug: 'deep-learning',
    folder: 'deep-learning',
    title: 'Deep Learning & Neural Architectures',
    description: 'Perceptrons, backpropagation, convolutional neural networks (CNNs), recurrent networks (RNN/LSTM), attention mechanisms, and PyTorch.',
    category: 'Artificial Intelligence & ML',
    level: 'Advanced',
    estimatedHours: 50,
    sourceFiles: ['deep-learning-ai.json']
  },

  // --- 08. CLOUD & DEVOPS ---
  {
    domainId: '08-cloud-devops',
    courseId: 'git-github',
    slug: 'git-github',
    folder: 'git-github',
    title: 'Git & GitHub Collaboration Mastery',
    description: 'Version control internals, commit graphs, branching workflows, merge conflicts, interactive rebasing, GitHub PRs, and CI actions.',
    category: 'Cloud & DevOps',
    level: 'Beginner to Intermediate',
    estimatedHours: 30,
    sourceFiles: ['git-github.json']
  },

  // --- 09. MOBILE DEVELOPMENT ---
  {
    domainId: '09-mobile-development',
    courseId: 'kotlin',
    slug: 'kotlin',
    folder: 'kotlin',
    title: 'Kotlin Mobile & Systems Engineering',
    description: 'Kotlin language mastery, null safety, coroutines, Android architecture components, and mobile algorithmic problem solving.',
    category: 'Mobile Development',
    level: 'Beginner to Advanced',
    estimatedHours: 40,
    sourceFiles: ['kotlin.json', 'kotlin-beginner-part-1.json', 'kotlin-beginner-part-2.json']
  },

  // --- 12. INTERVIEW & PLACEMENT ---
  {
    domainId: '12-interview-placement',
    courseId: 'aptitude-and-reasoning',
    slug: 'aptitude-and-reasoning',
    folder: 'aptitude',
    title: 'Quantitative Aptitude & Logical Reasoning',
    description: 'Comprehensive quantitative analysis, logical deduction, analytical puzzles, data interpretation, and campus placement assessment drills.',
    category: 'Interview & Placement',
    level: 'All Levels',
    estimatedHours: 40,
    sourceFiles: ['aptitude-and-reasoning.json']
  }
];

// Helper to enrich a topic with authentic pages & code examples from global index if missing
function enrichTopicWithGlobalIndex(topic, courseId) {
  let enriched = { ...topic };

  // If topic has empty pages or no pages, try finding it in global index
  const hasPages = Array.isArray(enriched.pages) && enriched.pages.length > 0;
  const hasExamples = Array.isArray(enriched.codeExamples) && enriched.codeExamples.length > 0;
  const hasPractice = Array.isArray(enriched.practiceProblems) && enriched.practiceProblems.length > 0;

  if (!hasPages || !hasExamples) {
    const tid = enriched.topicId || enriched.id;
    const titleKey = `title:${(enriched.title || '').trim().toLowerCase()}`;

    const match = (tid && globalTopicIndex.get(tid)) || globalTopicIndex.get(titleKey);
    if (match) {
      if (!hasPages && match.pages && match.pages.length > 0) {
        enriched.pages = match.pages;
      }
      if (!hasExamples && match.codeExamples && match.codeExamples.length > 0) {
        enriched.codeExamples = match.codeExamples;
      }
      if (!hasPractice && match.practiceProblems && match.practiceProblems.length > 0) {
        enriched.practiceProblems = match.practiceProblems;
      }
      if (!enriched.description && match.description) {
        enriched.description = match.description;
      }
      if (!enriched.readingTimeMinutes && match.readingTimeMinutes) {
        enriched.readingTimeMinutes = match.readingTimeMinutes;
      }
    }
  }

  // Ensure default structures
  if (!enriched.pages) enriched.pages = [];
  if (!enriched.codeExamples) enriched.codeExamples = [];
  if (!enriched.practiceProblems) enriched.practiceProblems = [];
  if (!enriched.mode) {
    if (enriched.pages.length > 0) enriched.mode = 'TEXT';
    else if (enriched.practiceProblems.length > 0) enriched.mode = 'PRACTICE';
    else enriched.mode = 'TEXT';
  }

  return enriched;
}

// 3. Process Every Course and Generate Clean Mini-JSON Modules
console.log('\n⚙️  Processing courses and generating authentic mini modules...');
let totalCoursesHydrated = 0;
let totalMiniModulesWritten = 0;
let totalTopicsHydrated = 0;

for (const cDef of COURSE_SOURCE_MAPPINGS) {
  const courseDir = path.join(CATALOG_DIR, cDef.domainId, cDef.folder);
  const modulesDir = path.join(courseDir, 'modules');
  ensureDir(modulesDir);

  // Collect all modules from all source files in order
  let accumulatedModules = [];
  const seenModuleTitles = new Set();

  for (const srcFile of cDef.sourceFiles) {
    const srcData = realCourseDataMap.get(srcFile);
    if (!srcData) continue;

    const rawModules = srcData.modules || (srcData.curriculum ? srcData.curriculum.modules : []) || [];
    for (const rawMod of rawModules) {
      const normTitle = (rawMod.title || '').trim().toLowerCase();
      
      // If module already exists with same normalized title, merge topics
      const existingMod = accumulatedModules.find(m => m.title.trim().toLowerCase() === normTitle);
      if (existingMod) {
        // Merge topics into existing module
        const rawTopics = rawMod.topics || rawMod.lessons || [];
        for (const rt of rawTopics) {
          const tNormTitle = (rt.title || '').trim().toLowerCase();
          const existingTopic = existingMod.topics.find(t => t.title.trim().toLowerCase() === tNormTitle);
          if (existingTopic) {
            // Enrich existing topic if raw topic has more content
            if ((!existingTopic.pages || existingTopic.pages.length === 0) && rt.pages && rt.pages.length > 0) {
              existingTopic.pages = rt.pages;
            }
            if ((!existingTopic.codeExamples || existingTopic.codeExamples.length === 0) && rt.codeExamples && rt.codeExamples.length > 0) {
              existingTopic.codeExamples = rt.codeExamples;
            }
            if ((!existingTopic.practiceProblems || existingTopic.practiceProblems.length === 0) && rt.practiceProblems && rt.practiceProblems.length > 0) {
              existingTopic.practiceProblems = rt.practiceProblems;
            }
          } else {
            existingMod.topics.push(rt);
          }
        }
      } else {
        // Add new unique module
        accumulatedModules.push({
          title: rawMod.title,
          description: rawMod.description || '',
          estimatedHours: rawMod.estimatedHours || 2.5,
          topics: [...(rawMod.topics || rawMod.lessons || [])],
          msa: rawMod.msa || null
        });
        seenModuleTitles.add(normTitle);
      }
    }
  }

  // If no source files matched (or all were empty), don't wipe out existing files if they exist
  if (accumulatedModules.length === 0) {
    console.log(`⚠️  No modules found for ${cDef.courseId}, skipping write.`);
    continue;
  }

  // Clean out existing modules directory before writing authentic modules
  if (fs.existsSync(modulesDir)) {
    const oldFiles = fs.readdirSync(modulesDir);
    for (const ofile of oldFiles) {
      if (ofile.endsWith('.json')) {
        fs.unlinkSync(path.join(modulesDir, ofile));
      }
    }
  }

  const moduleManifests = [];
  let totalCourseLessons = 0;
  let totalCourseTopics = 0;

  accumulatedModules.forEach((mod, modIdx) => {
    const modNum = String(modIdx + 1).padStart(2, '0');
    const modSlug = slugify(mod.title || `module-${modNum}`).slice(0, 42);
    const miniFileName = `m${modNum}-${modSlug}.json`;
    const miniFilePath = path.join(modulesDir, miniFileName);

    // Progressive series mapping
    let seriesId = 'core';
    const totalM = accumulatedModules.length;
    if (modIdx === 0) {
      seriesId = 'foundation';
    } else if (modIdx < Math.ceil(totalM * 0.3)) {
      seriesId = 'core';
    } else if (modIdx < Math.ceil(totalM * 0.6)) {
      seriesId = 'intermediate';
    } else if (modIdx < Math.ceil(totalM * 0.85)) {
      seriesId = 'advanced';
    } else {
      seriesId = 'expert';
    }

    const moduleId = `mod-${cDef.courseId}-${modNum}`;

    // Process and enrich each topic
    const hydratedTopics = (mod.topics || []).map((t, tIdx) => {
      const topNum = String(tIdx + 1).padStart(2, '0');
      const topicId = t.topicId || t.id || `top-${cDef.courseId}-${modNum}-${topNum}`;
      
      const enriched = enrichTopicWithGlobalIndex(t, cDef.courseId);

      return {
        ...enriched,
        topicId,
        order: tIdx + 1,
        seriesId,
        skillTracking: enriched.skillTracking || {
          key: `${cDef.courseId.toUpperCase()}.${slugify(enriched.title || 'TOPIC').toUpperCase()}`,
          competency: seriesId
        }
      };
    });

    const miniModuleData = {
      moduleId,
      courseId: cDef.courseId,
      title: mod.title,
      description: mod.description,
      seriesId,
      order: modIdx + 1,
      estimatedHours: mod.estimatedHours || 2.5,
      topics: hydratedTopics,
      msa: mod.msa || null
    };

    fs.writeFileSync(miniFilePath, JSON.stringify(miniModuleData, null, 2), 'utf8');
    totalMiniModulesWritten++;
    totalTopicsHydrated += hydratedTopics.length;
    totalCourseTopics += hydratedTopics.length;
    totalCourseLessons += hydratedTopics.length;

    moduleManifests.push({
      moduleId,
      title: miniModuleData.title,
      description: miniModuleData.description,
      seriesId,
      order: miniModuleData.order,
      estimatedHours: miniModuleData.estimatedHours,
      topicsCount: hydratedTopics.length,
      moduleFile: `modules/${miniFileName}`,
      hasMsa: Boolean(mod.msa)
    });
  });

  // Write updated course.json manifest
  const courseManifestPath = path.join(courseDir, 'course.json');
  const courseManifest = {
    courseId: cDef.courseId,
    slug: cDef.slug,
    title: cDef.title,
    domainId: cDef.domainId,
    domainTitle: cDef.domainId.toUpperCase(),
    description: cDef.description,
    category: cDef.category,
    level: cDef.level,
    rating: 4.9,
    enrolledCount: 1250 + Math.floor(Math.random() * 800),
    reviewsCount: 3.4,
    estimatedHours: cDef.estimatedHours,
    modulesCount: moduleManifests.length,
    topicsCount: totalCourseTopics,
    lessonsCount: totalCourseLessons,
    skills: [cDef.title, cDef.category, 'Problem Solving', 'Engineering Best Practices'],
    series: [
      { id: 'foundation', title: 'Foundation', description: 'Essential building blocks, core theory, environment setup.' },
      { id: 'core', title: 'Core', description: 'Primary syntax, core data structures, algorithms, and key patterns.' },
      { id: 'intermediate', title: 'Intermediate', description: 'Production patterns, optimization, idiomatic constructs.' },
      { id: 'advanced', title: 'Advanced', description: 'Complex algorithms, architectural trade-offs, high performance.' },
      { id: 'expert', title: 'Expert', description: 'Industry engineering, system scaling, production grade mastery.' }
    ],
    modules: moduleManifests
  };

  fs.writeFileSync(courseManifestPath, JSON.stringify(courseManifest, null, 2), 'utf8');
  totalCoursesHydrated++;
  console.log(`✅ [${cDef.domainId}/${cDef.folder}] Hydrated ${moduleManifests.length} modules (${totalCourseTopics} topics).`);
}

// 4. Synchronize domains.json
console.log('\n📄 Synchronizing domains.json...');
const domainsPath = path.join(CATALOG_DIR, 'domains.json');
const domains = loadJson(domainsPath) || [];

for (const cDef of COURSE_SOURCE_MAPPINGS) {
  const domain = domains.find(d => d.id === cDef.domainId);
  if (!domain) continue;

  let existingCourse = domain.courses.find(c => c.id === cDef.courseId || c.slug === cDef.slug || c.folder === cDef.folder);
  if (existingCourse) {
    existingCourse.title = cDef.title;
    existingCourse.slug = cDef.slug;
    existingCourse.folder = cDef.folder;
    existingCourse.sourceFiles = cDef.sourceFiles;
  } else {
    domain.courses.push({
      id: cDef.courseId,
      title: cDef.title,
      slug: cDef.slug,
      folder: cDef.folder,
      sourceFiles: cDef.sourceFiles
    });
  }
}

fs.writeFileSync(domainsPath, JSON.stringify(domains, null, 2), 'utf8');
console.log(`✅ Updated master domains manifest: ${domainsPath}`);

console.log('\n🎉 ALL REAL COURSES HYDRATED SUCCESSFULLY!');
console.log(`Total Courses Hydrated: ${totalCoursesHydrated}`);
console.log(`Total Mini Modules Written: ${totalMiniModulesWritten}`);
console.log(`Total Topics Hydrated: ${totalTopicsHydrated}`);

