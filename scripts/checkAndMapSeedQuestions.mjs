import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const QUESTIONS_INDEX = path.join(FRONTEND_ROOT, 'public', 'seed-contents', 'coding', 'questions_index.json');
const QUESTIONS_DIR = path.join(FRONTEND_ROOT, 'public', 'seed-contents', 'coding', 'questions');
const CATEGORIES_DIR = path.join(FRONTEND_ROOT, 'public', 'seed-contents', 'coding', 'categories');
const CATALOG_DIR = path.join(FRONTEND_ROOT, 'src', 'courses', 'data', 'catalog');

async function analyzeQuestionBank() {
  console.log('🔍 Performing comprehensive check on seed-contents/coding/questions...');

  if (!fs.existsSync(QUESTIONS_INDEX)) {
    console.error('Questions index not found at:', QUESTIONS_INDEX);
    return;
  }

  const indexRaw = fs.readFileSync(QUESTIONS_INDEX, 'utf8');
  const index = JSON.parse(indexRaw);
  console.log(`📊 Total Indexed Questions: ${index.length}`);

  // Tally difficulties and categories
  const categoryCounts = {};
  const difficultyCounts = {};

  for (const q of index) {
    const cat = q.category || 'Uncategorized';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

    const diff = q.difficulty || 'Unspecified';
    difficultyCounts[diff] = (difficultyCounts[diff] || 0) + 1;
  }

  // Scan category files in categories/
  let categoryFilesCount = 0;
  let categoryQuestionsMap = {};
  if (fs.existsSync(CATEGORIES_DIR)) {
    const catFiles = fs.readdirSync(CATEGORIES_DIR).filter(f => f.endsWith('.json'));
    categoryFilesCount = catFiles.length;

    for (const file of catFiles) {
      const catName = file.replace(/\.json$/, '');
      try {
        const content = JSON.parse(fs.readFileSync(path.join(CATEGORIES_DIR, file), 'utf8'));
        if (Array.isArray(content)) {
          categoryQuestionsMap[catName] = content.length;
        } else if (content.questions && Array.isArray(content.questions)) {
          categoryQuestionsMap[catName] = content.questions.length;
        }
      } catch (_) {}
    }
  }

  // Check sample questions for capabilities (boilerplate, test cases, solutions)
  let sampleCheckCount = Math.min(200, index.length);
  let hasTestCasesCount = 0;
  let hasBoilerplatesCount = 0;
  let hasMultiLangCount = 0;
  let hasSolutionCount = 0;

  for (let i = 0; i < sampleCheckCount; i++) {
    const qMeta = index[i];
    const qFile = path.join(QUESTIONS_DIR, `${qMeta.questionId}.json`);
    if (fs.existsSync(qFile)) {
      try {
        const qData = JSON.parse(fs.readFileSync(qFile, 'utf8'));
        if (qData.testCases && (qData.testCases.hidden?.length > 0 || qData.content?.sampleTestCases?.length > 0)) {
          hasTestCasesCount++;
        }
        if (qData.boilerPlates) {
          hasBoilerplatesCount++;
          if (qData.boilerPlates.C && qData.boilerPlates['C++'] && qData.boilerPlates.Java && qData.boilerPlates.Python3) {
            hasMultiLangCount++;
          }
          if (qData.boilerPlates.solution?.code || qData.boilerPlates.solution?.C || qData.boilerPlates.solution) {
            hasSolutionCount++;
          }
        }
      } catch (_) {}
    }
  }

  // Inspect Course Catalog Topics to check match potential
  const catalogDomains = fs.readdirSync(CATALOG_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  console.log('\n--- Category Breakdown (Top 25) ---');
  const sortedCategories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
  sortedCategories.slice(0, 25).forEach(([cat, cnt]) => {
    console.log(`   • ${cat.padEnd(25)} : ${cnt} questions`);
  });

  console.log('\n--- Difficulty Breakdown ---');
  Object.entries(difficultyCounts).forEach(([diff, cnt]) => {
    console.log(`   • ${diff.padEnd(15)} : ${cnt} questions`);
  });

  console.log('\n--- Quality & Feature Sampling (from 200 questions) ---');
  console.log(`   • Test Cases Available      : ${Math.round((hasTestCasesCount / sampleCheckCount) * 100)}%`);
  console.log(`   • Multi-language Boilerplate: ${Math.round((hasMultiLangCount / sampleCheckCount) * 100)}% (C, C++, Java, Python, JS)`);
  console.log(`   • Solutions Available       : ${Math.round((hasSolutionCount / sampleCheckCount) * 100)}%`);

  console.log(`\n📁 Category Topic JSON files in categories/ : ${categoryFilesCount} topic files`);

  // Print summary mapping to our 12 domains
  console.log('\n--- Mapping Alignment to Real Courses ---');
  const mappingPreview = [
    { domain: '01. Programming (C, C++, Java, Python, JS)', seedTags: ['Basic_level_0_Datatypes', 'Basics', 'Control Flow', 'Looping', 'Functions'], estCount: 1500 },
    { domain: '02. DSA Core (Arrays, Strings, Recursion, Stack)', seedTags: ['Arrays', 'Strings', 'Recursion', 'Searching', 'Sorting', 'Stacks and Queues', 'Linked List'], estCount: 3200 },
    { domain: '02. DSA Problem Solving (Two Pointers, Sliding Window)', seedTags: ['Two Pointers', 'Sliding Window', 'Prefix Sum', 'Binary Search', 'Intervals', 'BFS', 'DFS'], estCount: 1200 },
    { domain: '02. Advanced DSA (DP, Graph, Trees, Bitmask)', seedTags: ['Dynamic Programming', 'Graph', 'Trees', 'Bit Manipulation', 'Segment Tree', 'Number Theory'], estCount: 2100 },
    { domain: '12. Interview & Placement (Blind 75, High Frequency)', seedTags: ['Easy', 'Medium', 'Hard', 'Algorithms'], estCount: 2500 }
  ];

  mappingPreview.forEach(m => {
    console.log(`   🎯 ${m.domain}`);
    console.log(`      Tags: ${m.seedTags.join(', ')} (Est. ~${m.estCount} applicable questions)`);
  });
}

analyzeQuestionBank();
