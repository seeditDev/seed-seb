import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const QUESTIONS_INDEX = path.join(FRONTEND_ROOT, 'public', 'seed-contents', 'coding', 'questions_index.json');
const QUESTIONS_DIR = path.join(FRONTEND_ROOT, 'public', 'seed-contents', 'coding', 'questions');
const CATALOG_DIR = path.join(FRONTEND_ROOT, 'src', 'courses', 'data', 'catalog');

// Normalization & deduplication helper
function getProblemSignature(title, slug) {
  const text = `${title} ${slug}`.toLowerCase();
  if (text.includes('odd') && text.includes('even')) return 'odd_even';
  if (text.includes('palindrome')) return 'palindrome';
  if (text.includes('prime') || text.includes('sieve')) return 'prime';
  if (text.includes('factorial')) return 'factorial';
  if (text.includes('fibonacci')) return 'fibonacci';
  if (text.includes('two sum') || text.includes('target sum')) return 'two_sum';
  if (text.includes('three sum') || text.includes('3sum')) return 'three_sum';
  if (text.includes('anagram')) return 'anagram';
  if (text.includes('reverse') && text.includes('string')) return 'reverse_string';
  if (text.includes('reverse') && (text.includes('array') || text.includes('list'))) return 'reverse_array';
  if (text.includes('binary search')) return 'binary_search';
  if (text.includes('merge sort')) return 'merge_sort';
  if (text.includes('quick sort')) return 'quick_sort';
  if (text.includes('longest common subsequence') || text.includes('lcs')) return 'lcs';
  if (text.includes('longest increasing subsequence') || text.includes('lis')) return 'lis';
  if (text.includes('knapsack')) return 'knapsack';
  if (text.includes('coin change')) return 'coin_change';
  if (text.includes('matrix') && text.includes('spiral')) return 'spiral_matrix';
  if (text.includes('matrix') && text.includes('rotate')) return 'rotate_matrix';
  if (text.includes('cycle') && text.includes('graph')) return 'graph_cycle';
  if (text.includes('cycle') && text.includes('linked list')) return 'linked_list_cycle';
  if (text.includes('topological')) return 'topo_sort';
  if (text.includes('dijkstra') || text.includes('shortest path')) return 'shortest_path';
  if (text.includes('minimum spanning') || text.includes('mst')) return 'mst';
  if (text.includes('sliding window')) return 'sliding_window';
  if (text.includes('prefix sum')) return 'prefix_sum';
  if (text.includes('level order') || text.includes('bfs')) return 'bfs';
  if (text.includes('inorder') || text.includes('preorder') || text.includes('postorder')) return 'tree_traversal';
  if (text.includes('lca') || text.includes('lowest common ancestor')) return 'lca';

  // Fallback: extract main 2 alphanumeric tokens
  const tokens = text.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3).slice(0, 3);
  return tokens.sort().join('_') || slug;
}

// Topic classification rules
function matchQuestionToTopic(q) {
  const cat = (q.category || '').toLowerCase();
  const title = (q.title || '').toLowerCase();
  const slug = (q.slug || '').toLowerCase();
  const combined = `${cat} ${title} ${slug}`;

  if (combined.includes('datatype') || combined.includes('basics_') || combined.includes('basic_level_0')) {
    return 'basics';
  }
  if (combined.includes('array') && !combined.includes('dynamic programming')) {
    return 'arrays';
  }
  if (combined.includes('string')) {
    return 'strings';
  }
  if (combined.includes('dynamic programming') || combined.includes('dp')) {
    return 'dynamic-programming';
  }
  if (combined.includes('tree') || combined.includes('bst')) {
    return 'trees';
  }
  if (combined.includes('graph')) {
    return 'graphs';
  }
  if (combined.includes('greedy')) {
    return 'greedy';
  }
  if (combined.includes('bit manipulation') || combined.includes('bitwise')) {
    return 'bit-manipulation';
  }
  if (combined.includes('sorting') || combined.includes('sort')) {
    return 'sorting';
  }
  if (combined.includes('searching') || combined.includes('binary search')) {
    return 'searching';
  }
  if (combined.includes('linked list')) {
    return 'linked-lists';
  }
  if (combined.includes('stack') || combined.includes('stacks')) {
    return 'stack';
  }
  if (combined.includes('queue') || combined.includes('queues')) {
    return 'queue';
  }
  if (combined.includes('recursion') || combined.includes('recur')) {
    return 'recursion';
  }
  if (combined.includes('backtracking')) {
    return 'backtracking';
  }
  if (combined.includes('number theory') || combined.includes('math') || combined.includes('prime')) {
    return 'number-theory';
  }
  return null;
}

async function mapQuestions() {
  console.log('🚀 Loading Questions Index...');
  const index = JSON.parse(fs.readFileSync(QUESTIONS_INDEX, 'utf8'));

  // Bucket questions by topic with deduplication
  const topicMap = {};
  const seenSignatures = new Set();

  for (const q of index) {
    const topic = matchQuestionToTopic(q);
    if (!topic) continue;

    const sig = `${topic}:${getProblemSignature(q.title || '', q.slug || '')}`;
    if (seenSignatures.has(sig)) continue; // Skip near-identical problem types
    seenSignatures.add(sig);

    if (!topicMap[topic]) topicMap[topic] = [];
    topicMap[topic].push(q);
  }

  // Sort each topic bucket by difficulty (Beginner/Easy -> Medium -> Hard)
  const diffOrder = { 'Beginner': 1, 'Easy': 2, 'Medium': 3, 'Hard': 4 };
  for (const topic of Object.keys(topicMap)) {
    topicMap[topic].sort((a, b) => (diffOrder[a.difficulty] || 2) - (diffOrder[b.difficulty] || 2));
  }

  console.log('📊 Deduplicated Questions Available per Topic:');
  for (const [t, list] of Object.entries(topicMap)) {
    console.log(`   • ${t.padEnd(25)} : ${list.length} diverse questions`);
  }

  // Helper to load question file details
  function getQuestionDetails(qId) {
    const qPath = path.join(QUESTIONS_DIR, `${qId}.json`);
    if (!fs.existsSync(qPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(qPath, 'utf8'));
    } catch (_) {
      return null;
    }
  }

  // Traverse modular mini-JSONs in catalog/
  let totalModulesEnriched = 0;
  let totalQuestionsInjected = 0;

  function processDirectory(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        processDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.json') && fullPath.includes(`${path.sep}modules${path.sep}`)) {
        enrichModuleFile(fullPath);
      }
    }
  }

  function enrichModuleFile(filePath) {
    let moduleData;
    try {
      moduleData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_) {
      return;
    }

    if (!moduleData.moduleId || !Array.isArray(moduleData.topics) || moduleData.topics.length === 0) {
      return;
    }

    const titleLower = (moduleData.title || '').toLowerCase();
    const pathLower = filePath.toLowerCase();

    // Determine target topic for this module
    let targetTopic = null;
    if (pathLower.includes('01-programming') || titleLower.includes('datatype') || titleLower.includes('foundations') || titleLower.includes('syntax')) {
      targetTopic = 'basics';
    } else if (titleLower.includes('array')) {
      targetTopic = 'arrays';
    } else if (titleLower.includes('string')) {
      targetTopic = 'strings';
    } else if (titleLower.includes('dynamic-programming') || titleLower.includes('dp')) {
      targetTopic = 'dynamic-programming';
    } else if (titleLower.includes('tree') || titleLower.includes('bst')) {
      targetTopic = 'trees';
    } else if (titleLower.includes('graph')) {
      targetTopic = 'graphs';
    } else if (titleLower.includes('greedy')) {
      targetTopic = 'greedy';
    } else if (titleLower.includes('sort')) {
      targetTopic = 'sorting';
    } else if (titleLower.includes('search')) {
      targetTopic = 'searching';
    } else if (titleLower.includes('bit')) {
      targetTopic = 'bit-manipulation';
    } else if (titleLower.includes('linked-list') || titleLower.includes('linked list')) {
      targetTopic = 'linked-lists';
    } else if (titleLower.includes('stack')) {
      targetTopic = 'stack';
    } else if (titleLower.includes('queue')) {
      targetTopic = 'queue';
    } else if (titleLower.includes('recursion')) {
      targetTopic = 'recursion';
    } else if (titleLower.includes('backtrack')) {
      targetTopic = 'backtracking';
    } else if (titleLower.includes('number-theory') || titleLower.includes('math')) {
      targetTopic = 'number-theory';
    }

    if (!targetTopic || !topicMap[targetTopic] || topicMap[targetTopic].length === 0) {
      return;
    }

    let modified = false;

    for (const topic of moduleData.topics) {
      if (!Array.isArray(topic.practiceProblems)) {
        topic.practiceProblems = [];
      }
      if (!Array.isArray(topic.codingProblems)) {
        topic.codingProblems = [];
      }

      // Existing count
      const existingCount = topic.practiceProblems.length + topic.codingProblems.length;
      if (existingCount >= 10) continue; // Respect user limit of not more than 10 questions

      const existingIds = new Set([
        ...topic.practiceProblems.map(p => p.id || p.problemId || p.seedQuestionId),
        ...topic.codingProblems.map(p => p.id || p.problemId || p.seedQuestionId)
      ]);

      const needed = Math.min(5, 10 - existingCount);
      let added = 0;

      for (const candidate of topicMap[targetTopic]) {
        if (added >= needed) break;
        if (existingIds.has(candidate.questionId)) continue;

        const qDetails = getQuestionDetails(candidate.questionId);
        if (!qDetails) continue;

        const statement = qDetails.content?.problemStatement || qDetails.description || candidate.title;
        const starterCode = qDetails.boilerPlates?.C || qDetails.boilerPlates?.['C++'] || qDetails.boilerPlates?.Java || qDetails.boilerPlates?.Python3 || '// Write your code here';

        const newProblem = {
          id: candidate.questionId,
          problemId: candidate.questionId,
          seedQuestionId: candidate.questionId,
          title: qDetails.title || candidate.title,
          difficulty: qDetails.metadata?.difficulty || candidate.difficulty || 'Medium',
          category: candidate.category || targetTopic,
          task: statement.length > 250 ? `${statement.slice(0, 247)}...` : statement,
          starterCode,
          sampleTestCases: qDetails.content?.sampleTestCases || [],
          isSeedQuestion: true
        };

        topic.practiceProblems.push(newProblem);
        existingIds.add(candidate.questionId);
        added++;
        totalQuestionsInjected++;
        modified = true;
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, JSON.stringify(moduleData, null, 2), 'utf8');
      totalModulesEnriched++;
    }
  }

  console.log('🔄 Traversing catalog modules and mapping questions...');
  processDirectory(CATALOG_DIR);

  console.log(`\n🎉 MAPPING COMPLETED!`);
  console.log(`   - Enriched ${totalModulesEnriched} module mini-JSONs`);
  console.log(`   - Injected ${totalQuestionsInjected} diverse, deduplicated seed coding questions`);
  console.log(`   - Maintained <= 10 questions cap per topic`);
}

mapQuestions().catch(err => {
  console.error('Error during question mapping:', err);
  process.exit(1);
});
