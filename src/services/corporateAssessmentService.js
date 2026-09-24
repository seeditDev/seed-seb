import { db } from '../lib/firebase-config';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

/**
 * Flagship SEED National Benchmark Assessment (eLitmus / AMCAT Model)
 * Standardized hiring benchmark recognized across 50+ corporate recruiting partners.
 */
export const SEED_BENCHMARK_ASSESSMENT = {
  id: 'benchmark-seed-litmus-national-2026',
  slug: 'benchmark-seed-litmus-national-2026',
  name: 'SEED National Hiring Benchmark Assessment (Litmus-Grade)',
  title: 'SEED National Hiring Benchmark Assessment',
  description: 'National standard benchmark exam evaluating Quantitative Aptitude, Core CS Fundamentals, and Hands-on Coding. Your score establishes your SEED Verified Percentile badge on the Recruiter Job Board.',
  category: 'benchmark',
  isCorporate: true,
  difficulty: 'Hard',
  duration: 90, // 90 minutes
  maxScore: 100,
  proctoring: {
    enabled: true,
    webcam: true,
    fullScreen: true,
    tabLock: true,
    blockShortcuts: true,
    maxViolations: 3,
  },
  companyName: 'SEED National Talent Pool (All Corporate Partners)',
  badge: 'Litmus Benchmark',
  sections: [
    {
      id: 'sec-quant-logic',
      title: 'Section 1: Quantitative Aptitude & Analytical Reasoning',
      type: 'mcq',
      duration: 30,
      maxScore: 30,
      questions: [
        {
          id: 'q1',
          question: 'In a group of 120 students, 70 study Python, 50 study Java, and 20 study both. How many students study neither language?',
          options: ['10', '20', '30', '40'],
          correctIndex: 1,
          correctAnswer: '20',
          marks: 5,
          topic: 'Set Theory & Logic',
        },
        {
          id: 'q2',
          question: 'A train 180 meters long running at 54 km/hr crosses a platform in 20 seconds. What is the length of the platform?',
          options: ['120 m', '150 m', '100 m', '200 m'],
          correctIndex: 0,
          correctAnswer: '120 m',
          marks: 5,
          topic: 'Speed & Distance',
        },
        {
          id: 'q3',
          question: 'What is the next number in the series: 3, 7, 15, 31, 63, ...?',
          options: ['127', '125', '120', '131'],
          correctIndex: 0,
          correctAnswer: '127',
          marks: 5,
          topic: 'Number Sequences',
        },
        {
          id: 'q4',
          question: 'If log₂(x) + log₂(x - 2) = 3, what is the positive real value of x?',
          options: ['4', '2', '8', '6'],
          correctIndex: 0,
          correctAnswer: '4',
          marks: 5,
          topic: 'Algebra & Logarithms',
        },
        {
          id: 'q5',
          question: 'A bag contains 4 red balls, 5 blue balls, and 6 green balls. Two balls are drawn at random without replacement. What is the probability that both are blue?',
          options: ['2/21', '1/7', '5/21', '4/15'],
          correctIndex: 0,
          correctAnswer: '2/21',
          marks: 5,
          topic: 'Probability & Combinatorics',
        },
        {
          id: 'q6',
          question: 'Six workers can finish a project in 18 days working 7 hours a day. How many days will it take for 9 workers working 6 hours a day to finish the same project?',
          options: ['14 days', '12 days', '16 days', '10 days'],
          correctIndex: 0,
          correctAnswer: '14 days',
          marks: 5,
          topic: 'Work & Efficiency',
        },
      ],
    },
    {
      id: 'sec-core-cs',
      title: 'Section 2: Computer Science Fundamentals (OS, DBMS, DSA)',
      type: 'mcq',
      duration: 30,
      maxScore: 30,
      questions: [
        {
          id: 'cs1',
          question: 'Which of the following sorting algorithms has the best worst-case time complexity?',
          options: ['Quick Sort', 'Merge Sort', 'Bubble Sort', 'Insertion Sort'],
          correctIndex: 1,
          correctAnswer: 'Merge Sort',
          marks: 5,
          topic: 'Data Structures & Algorithms',
        },
        {
          id: 'cs2',
          question: 'Which normal form eliminates partial functional dependency on the candidate key?',
          options: ['First Normal Form (1NF)', 'Second Normal Form (2NF)', 'Third Normal Form (3NF)', 'BCNF'],
          correctIndex: 1,
          correctAnswer: 'Second Normal Form (2NF)',
          marks: 5,
          topic: 'Database Management Systems',
        },
        {
          id: 'cs3',
          question: 'What is the purpose of the Translation Lookaside Buffer (TLB) in modern operating systems?',
          options: ['To cache disk blocks', 'To speed up virtual-to-physical address translation', 'To manage CPU register allocation', 'To schedule thread contexts'],
          correctIndex: 1,
          correctAnswer: 'To speed up virtual-to-physical address translation',
          marks: 5,
          topic: 'Operating Systems',
        },
        {
          id: 'cs4',
          question: 'In TCP/IP, which flag is used to initiate a three-way handshake connection establishment?',
          options: ['ACK', 'SYN', 'FIN', 'RST'],
          correctIndex: 1,
          correctAnswer: 'SYN',
          marks: 5,
          topic: 'Computer Networks',
        },
        {
          id: 'cs5',
          question: 'What is the space complexity of an in-order traversal of a balanced binary search tree with N nodes using recursion?',
          options: ['O(1)', 'O(log N)', 'O(N)', 'O(N log N)'],
          correctIndex: 1,
          correctAnswer: 'O(log N)',
          marks: 5,
          topic: 'Tree Traversal Algorithms',
        },
        {
          id: 'cs6',
          question: 'Which isolation level prevents Dirty Reads and Non-Repeatable Reads in SQL transactions?',
          options: ['Read Uncommitted', 'Read Committed', 'Repeatable Read', 'Serializable'],
          correctIndex: 2,
          correctAnswer: 'Repeatable Read',
          marks: 5,
          topic: 'ACID Transactions',
        },
      ],
    },
    {
      id: 'sec-coding',
      title: 'Section 3: Algorithmic Problem Solving & Code Execution',
      type: 'coding',
      duration: 30,
      maxScore: 40,
      problems: [
        {
          id: 'prob-two-sum',
          title: 'Optimal Two-Sum Target Index',
          difficulty: 'Medium',
          marks: 20,
          description: 'Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to target. You may assume each input has exactly one solution and you may not use the same element twice. Time complexity must be O(N).',
          starterCode: {
            python: 'def two_sum(nums, target):\n    # Write your solution here\n    seen = {}\n    for i, num in enumerate(nums):\n        complement = target - num\n        if complement in seen:\n            return [seen[complement], i]\n        seen[num] = i\n    return []',
            java: 'import java.util.*;\n\nclass Solution {\n    public int[] twoSum(int[] nums, int target) {\n        Map<Integer, Integer> map = new HashMap<>();\n        for (int i = 0; i < nums.length; i++) {\n            int diff = target - nums[i];\n            if (map.containsKey(diff)) {\n                return new int[]{map.get(diff), i};\n            }\n            map.put(nums[i], i);\n        }\n        return new int[]{};\n    }\n}',
            javascript: 'function twoSum(nums, target) {\n  const map = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const complement = target - nums[i];\n    if (map.has(complement)) {\n      return [map.get(complement), i];\n    }\n    map.set(nums[i], i);\n  }\n  return [];\n}'
          },
          testCases: [
            { input: '[2, 7, 11, 15], 9', expectedOutput: '[0, 1]' },
            { input: '[3, 2, 4], 6', expectedOutput: '[1, 2]' },
            { input: '[3, 3], 6', expectedOutput: '[0, 1]' }
          ]
        },
        {
          id: 'prob-valid-parentheses',
          title: 'Balanced Bracket Sequence Validator',
          difficulty: 'Medium',
          marks: 20,
          description: 'Given a string `s` containing just the characters `(`, `)`, `{`, `}`, `[` and `]`, determine if the input string is valid. Brackets must close in the correct order and same type.',
          starterCode: {
            python: 'def isValid(s):\n    stack = []\n    pairs = {")": "(", "}": "{", "]": "["}\n    for char in s:\n        if char in pairs:\n            if not stack or stack[-1] != pairs[char]:\n                return False\n            stack.pop()\n        else:\n            stack.append(char)\n    return len(stack) == 0',
            java: 'import java.util.*;\n\nclass Solution {\n    public boolean isValid(String s) {\n        Stack<Character> stack = new Stack<>();\n        for (char c : s.toCharArray()) {\n            if (c == \'(\') stack.push(\')\');\n            else if (c == \'{\') stack.push(\'}\');\n            else if (c == \'[\') stack.push(\']\');\n            else if (stack.isEmpty() || stack.pop() != c) return false;\n        }\n        return stack.isEmpty();\n    }\n}',
            javascript: 'function isValid(s) {\n  const stack = [];\n  const map = { ")": "(", "}": "{", "]": "[" };\n  for (const c of s) {\n    if (map[c]) {\n      if (stack.pop() !== map[c]) return false;\n    } else {\n      stack.push(c);\n    }\n  }\n  return stack.length === 0;\n}'
          },
          testCases: [
            { input: '"()"', expectedOutput: 'true' },
            { input: '"()[]{}"', expectedOutput: 'true' },
            { input: '"(]"', expectedOutput: 'false' },
            { input: '"([)]"', expectedOutput: 'false' }
          ]
        }
      ]
    }
  ]
};

/**
 * Company-Specific Corporate Screening Assessments
 */
export const CORPORATE_SCREENING_ASSESSMENTS = [
  {
    id: 'recruiter-razorpay-backend-sde-round1',
    slug: 'recruiter-razorpay-backend-sde-round1',
    name: 'Razorpay — Backend SDE Screening Round 1',
    title: 'Razorpay Backend SDE Screening',
    description: 'Mandatory round 1 proctored technical evaluation testing Java concurrency, database indexing, and REST microservices logic.',
    category: 'recruiter',
    isCorporate: true,
    companyId: 'comp-seed-razorpay',
    companyName: 'Razorpay',
    jobId: 'job-seed-01',
    jobTitle: 'Software Development Engineer (Backend - Java)',
    difficulty: 'Medium',
    duration: 60,
    maxScore: 100,
    badge: 'Interview Gateway',
    proctoring: {
      enabled: true,
      webcam: true,
      fullScreen: true,
      tabLock: true,
      maxViolations: 2,
    },
    sections: [
      {
        id: 'sec-java-theory',
        title: 'Java Concurrency & Spring Boot Internals',
        type: 'mcq',
        duration: 25,
        maxScore: 40,
        questions: [
          {
            id: 'rz-1',
            question: 'What is the primary difference between `ReentrantLock` and the `synchronized` keyword in Java?',
            options: [
              'ReentrantLock allows timed lock attempts and interruptible locking; synchronized does not.',
              'synchronized is faster under all heavy contention workloads.',
              'ReentrantLock does not support reentrancy.',
              'synchronized supports fair queuing by default.'
            ],
            correctIndex: 0,
            correctAnswer: 'ReentrantLock allows timed lock attempts and interruptible locking; synchronized does not.',
            marks: 10,
            topic: 'Java Concurrency'
          },
          {
            id: 'rz-2',
            question: 'In Spring Boot, which annotation is used to execute a database transaction with rollback upon checked exceptions?',
            options: ['@Transactional(rollbackFor = Exception.class)', '@Transactional', '@RollbackSafe', '@TransactionBoundary'],
            correctIndex: 0,
            correctAnswer: '@Transactional(rollbackFor = Exception.class)',
            marks: 10,
            topic: 'Spring Boot Architecture'
          },
          {
            id: 'rz-3',
            question: 'Which garbage collector in Java 17+ is designed for ultra-low latency pauses under 1 millisecond?',
            options: ['ZGC (Z Garbage Collector)', 'Serial GC', 'Parallel GC', 'CMS (Concurrent Mark Sweep)'],
            correctIndex: 0,
            correctAnswer: 'ZGC (Z Garbage Collector)',
            marks: 10,
            topic: 'JVM Performance'
          },
          {
            id: 'rz-4',
            question: 'What happens when two transactions update the same PostgreSQL row concurrently under READ COMMITTED isolation?',
            options: [
              'The second transaction waits for the first to commit or abort before re-evaluating the row.',
              'Both transactions proceed simultaneously with last-write-wins.',
              'PostgreSQL immediately throws a deadlock exception.',
              'The first transaction is aborted automatically.'
            ],
            correctIndex: 0,
            correctAnswer: 'The second transaction waits for the first to commit or abort before re-evaluating the row.',
            marks: 10,
            topic: 'PostgreSQL Locking'
          }
        ]
      },
      {
        id: 'sec-java-coding',
        title: 'Transaction Ledger & Idempotency Engine',
        type: 'coding',
        duration: 35,
        maxScore: 60,
        problems: [
          {
            id: 'prob-idempotent-ledger',
            title: 'Payment Idempotency Key Processor',
            difficulty: 'Medium',
            marks: 60,
            description: 'Implement a thread-safe idempotency checker that records transaction requests. If a request with the same idempotencyKey is received within 60 seconds, return the cached result. Otherwise process the payment and cache the outcome.',
            starterCode: {
              java: 'import java.util.concurrent.*;\n\nclass IdempotencyEngine {\n    private final ConcurrentHashMap<String, String> cache = new ConcurrentHashMap<>();\n\n    public String processPayment(String idempotencyKey, double amount) {\n        // Return cached paymentId if key already processed\n        return cache.computeIfAbsent(idempotencyKey, k -> "PAY_" + System.currentTimeMillis() + "_" + (int)amount);\n    }\n}',
              python: 'class IdempotencyEngine:\n    def __init__(self):\n        self.cache = {}\n\n    def process_payment(self, idempotency_key, amount):\n        if idempotency_key in self.cache:\n            return self.cache[idempotency_key]\n        res = f"PAY_{idempotency_key}_{int(amount)}"\n        self.cache[idempotency_key] = res\n        return res'
            },
            testCases: [
              { input: '"KEY_101", 500', expectedOutput: 'PAY_KEY_101_500' }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'recruiter-swiggy-frontend-react-round1',
    slug: 'recruiter-swiggy-frontend-react-round1',
    name: 'Swiggy — Frontend (React / Next.js) Coding Challenge',
    title: 'Swiggy Frontend Engineer Screening',
    description: 'Proctored challenge on React rendering optimization, custom hooks, and virtualized list architecture.',
    category: 'recruiter',
    isCorporate: true,
    companyId: 'comp-seed-swiggy',
    companyName: 'Swiggy',
    jobId: 'job-seed-02',
    jobTitle: 'Frontend Engineer (React.js / Next.js)',
    difficulty: 'Medium',
    duration: 60,
    maxScore: 100,
    badge: 'Interview Gateway',
    proctoring: {
      enabled: true,
      webcam: true,
      fullScreen: true,
      tabLock: true,
      maxViolations: 2,
    },
    sections: [
      {
        id: 'sec-react-architecture',
        title: 'React 19 & State Optimization',
        type: 'mcq',
        duration: 25,
        maxScore: 40,
        questions: [
          {
            id: 'sw-1',
            question: 'What is the purpose of React 19 `useOptimistic` hook?',
            options: [
              'To show immediate optimistic UI feedback while an async server action is pending.',
              'To optimize bundling with tree-shaking.',
              'To cache fetch requests across route transitions.',
              'To replace Redux Toolkit globally.'
            ],
            correctIndex: 0,
            correctAnswer: 'To show immediate optimistic UI feedback while an async server action is pending.',
            marks: 10,
            topic: 'React 19 Features'
          },
          {
            id: 'sw-2',
            question: 'Why should inline object references in `useMemo` dependencies be avoided?',
            options: [
              'They create new object references on every render, causing unwanted recalculations.',
              'They trigger React strict mode hydration crashes.',
              'They increase the memory footprint of V8 Garbage Collector.',
              'They are not permitted by ECMAScript strict mode.'
            ],
            correctIndex: 0,
            correctAnswer: 'They create new object references on every render, causing unwanted recalculations.',
            marks: 10,
            topic: 'React Rendering Optimization'
          }
        ]
      },
      {
        id: 'sec-js-coding',
        title: 'Debounce & Event Batching Implementation',
        type: 'coding',
        duration: 35,
        maxScore: 60,
        problems: [
          {
            id: 'prob-debounce',
            title: 'Custom Debounce with Cancellation',
            difficulty: 'Medium',
            marks: 60,
            description: 'Implement a `debounce` function that takes a callback and delay in milliseconds. The returned debounced function must also provide a `.cancel()` method to clear pending executions.',
            starterCode: {
              javascript: 'function debounce(fn, delay) {\n  let timer = null;\n  const debounced = function(...args) {\n    if (timer) clearTimeout(timer);\n    timer = setTimeout(() => fn.apply(this, args), delay);\n  };\n  debounced.cancel = function() {\n    if (timer) clearTimeout(timer);\n  };\n  return debounced;\n}'
            },
            testCases: [
              { input: 'fn, 100', expectedOutput: 'Function with cancel' }
            ]
          }
        ]
      }
    ]
  }
];

/**
 * Fetch all available corporate assessments for a candidate:
 * 1. SEED National Benchmark Exam (Litmus-Grade)
 * 2. Any company screening assessments assigned to this student
 */
export async function getCorporateAssessmentsForStudent(studentUid) {
  const list = [SEED_BENCHMARK_ASSESSMENT, ...CORPORATE_SCREENING_ASSESSMENTS];

  try {
    if (studentUid) {
      // Check for custom assigned assessments from Firestore jobApplications
      const appsQuery = query(
        collection(db, 'jobApplications'),
        where('studentUid', '==', studentUid)
      );
      const snap = await getDocs(appsQuery);
      if (!snap.empty) {
        snap.forEach((d) => {
          const data = d.data();
          // If this application has a custom assessment link or stage is shortlisted
          if (data.stage === 'shortlisted' && data.companyName) {
            // Check if already in list
            const existing = list.find((a) => a.jobId === data.jobId);
            if (existing) {
              existing.applicationId = d.id;
              existing.candidateStatus = data.stage;
              existing.assessmentScore = data.assessmentScore;
              existing.assessmentCompletedAt = data.assessmentCompletedAt;
            }
          }
        });
      }
    }
  } catch (err) {
    console.warn('[CorporateAssessmentService] Error querying applications:', err);
  }

  return list;
}

/**
 * Prepares the assessment payload and stores it in sessionStorage
 * so MultiSectionAssessment loads it smoothly in SEB lockdown mode.
 */
export function prepareCorporateAssessmentForLaunch(assessment, user) {
  if (!assessment) throw new Error('Assessment not provided.');

  const canonicalAss = {
    ...assessment,
    isMultiSection: true,
    strictLockdown: true,
    totalMarks: assessment.maxScore || 100,
    settings: {
      proctoring: assessment.proctoring || {
        enabled: true,
        webcam: true,
        fullScreen: true,
        tabLock: true,
        maxViolations: 3,
      },
      duration_minutes: assessment.duration || 60,
      passing_percentage: 60,
      showResultsImmediately: true,
    },
  };

  sessionStorage.setItem('multisectionAssessmentData', JSON.stringify(canonicalAss));
  sessionStorage.setItem(
    'msaCourseCtx',
    JSON.stringify({
      courseId: 'corporate-hiring',
      seriesId: assessment.category || 'recruiter',
      assessmentId: assessment.id,
      applicationId: assessment.applicationId || '',
      jobId: assessment.jobId || '',
      totalMarks: assessment.maxScore || 100,
      isCorporate: true,
      settings: canonicalAss.settings,
    })
  );

  return `/student/assessment/id/${assessment.slug}`;
}
