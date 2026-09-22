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

async function checkMappingFeasibility() {
  console.log('🔎 Deep Checking Mapping Feasibility...');

  const index = JSON.parse(fs.readFileSync(QUESTIONS_INDEX, 'utf8'));

  // Group questions by normalized domain & topic tags
  const topicBuckets = {
    'Arrays': [],
    'Strings': [],
    'Recursion': [],
    'Searching': [],
    'Sorting': [],
    'Linked Lists': [],
    'Stack': [],
    'Queue': [],
    'Hashing': [],
    'Trees': [],
    'BST': [],
    'Heap': [],
    'Graphs': [],
    'Greedy': [],
    'Backtracking': [],
    'Dynamic Programming': [],
    'Bit Manipulation': [],
    'Two Pointers': [],
    'Sliding Window': [],
    'Prefix Sum': [],
    'Binary Search': [],
    'Intervals': [],
    'BFS': [],
    'DFS': [],
    'Basics / Datatypes (C / C++ / Java / Python)': []
  };

  for (const q of index) {
    const title = (q.title || '').toLowerCase();
    const cat = (q.category || '').toLowerCase();
    const slug = (q.slug || '').toLowerCase();

    if (title.includes('datatype') || title.includes('pattern') || cat.includes('basics')) {
      topicBuckets['Basics / Datatypes (C / C++ / Java / Python)'].push(q);
    }
    if (cat.includes('array') || title.includes('array')) {
      topicBuckets['Arrays'].push(q);
    }
    if (cat.includes('string') || title.includes('string')) {
      topicBuckets['Strings'].push(q);
    }
    if (cat.includes('dynamic programming') || cat.includes('dp')) {
      topicBuckets['Dynamic Programming'].push(q);
    }
    if (cat.includes('graph')) {
      topicBuckets['Graphs'].push(q);
    }
    if (cat.includes('tree') || cat.includes('bst')) {
      topicBuckets['Trees'].push(q);
    }
    if (cat.includes('greedy')) {
      topicBuckets['Greedy'].push(q);
    }
    if (cat.includes('bit manipulation') || cat.includes('bitwise')) {
      topicBuckets['Bit Manipulation'].push(q);
    }
    if (cat.includes('sorting') || title.includes('sort')) {
      topicBuckets['Sorting'].push(q);
    }
    if (cat.includes('searching') || title.includes('search')) {
      topicBuckets['Searching'].push(q);
    }
    if (cat.includes('binary search') || title.includes('binary search')) {
      topicBuckets['Binary Search'].push(q);
    }
    if (cat.includes('two pointers') || title.includes('two pointer')) {
      topicBuckets['Two Pointers'].push(q);
    }
    if (cat.includes('sliding window') || title.includes('sliding window')) {
      topicBuckets['Sliding Window'].push(q);
    }
    if (cat.includes('prefix sum') || title.includes('prefix sum')) {
      topicBuckets['Prefix Sum'].push(q);
    }
    if (cat.includes('linked list') || title.includes('linked list')) {
      topicBuckets['Linked Lists'].push(q);
    }
    if (cat.includes('stack') || title.includes('stack')) {
      topicBuckets['Stack'].push(q);
    }
    if (cat.includes('queue') || title.includes('queue')) {
      topicBuckets['Queue'].push(q);
    }
    if (cat.includes('backtracking') || title.includes('backtrack')) {
      topicBuckets['Backtracking'].push(q);
    }
    if (cat.includes('recursion') || title.includes('recur')) {
      topicBuckets['Recursion'].push(q);
    }
  }

  console.log('\n=== MAPPING POTENTIAL BY TOPIC ===');
  for (const [topic, qList] of Object.entries(topicBuckets)) {
    const easyCount = qList.filter(q => q.difficulty === 'Beginner' || q.difficulty === 'Easy').length;
    const medCount = qList.filter(q => q.difficulty === 'Medium').length;
    const hardCount = qList.filter(q => q.difficulty === 'Hard').length;
    console.log(`📌 ${topic.padEnd(45)}: ${String(qList.length).padStart(4)} total | Easy: ${String(easyCount).padStart(4)} | Med: ${String(medCount).padStart(4)} | Hard: ${String(hardCount).padStart(4)}`);
  }

  // Check how a sample question file looks when loaded by questionId
  const sampleQ = index.find(q => q.category === 'Arrays' && q.difficulty === 'Easy') || index[0];
  const qPath = path.join(QUESTIONS_DIR, `${sampleQ.questionId}.json`);
  const qData = JSON.parse(fs.readFileSync(qPath, 'utf8'));

  console.log('\n=== SAMPLE QUESTION INSPECTION ===');
  console.log(`ID: ${qData.questionId} (${qData.title})`);
  console.log(`Category: ${qData.metadata?.category || qData.category}`);
  console.log(`Difficulty: ${qData.metadata?.difficulty || qData.difficulty}`);
  console.log(`Statement Preview: ${(qData.content?.problemStatement || '').slice(0, 100).replace(/\n/g, ' ')}...`);
  console.log(`Sample Tests: ${qData.content?.sampleTestCases?.length || 0}`);
  console.log(`Hidden Tests: ${qData.testCases?.hidden?.length || 0}`);
  console.log(`Boilerplates: ${Object.keys(qData.boilerPlates || {}).filter(k => !k.startsWith('_')).join(', ')}`);
  console.log(`Solution Available: ${Boolean(qData.boilerPlates?.solution)}`);
}

checkMappingFeasibility();
