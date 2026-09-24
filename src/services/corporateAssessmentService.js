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
 * Fetch all available corporate assessments for a candidate:
 * 1. SEED National Benchmark Exam (Litmus-Grade)
 * 2. Real company screening assessments assigned to this student in Firestore
 */
export async function getCorporateAssessmentsForStudent(studentUid) {
  const list = [SEED_BENCHMARK_ASSESSMENT];

  try {
    if (studentUid) {
      // Check for real assigned assessments from Firestore jobApplications
      const appsQuery = query(
        collection(db, 'jobApplications'),
        where('studentUid', '==', studentUid)
      );
      const snap = await getDocs(appsQuery);
      if (!snap.empty) {
        snap.forEach((d) => {
          const data = d.data();
          if (data.stage === 'shortlisted' && (data.assessmentTitle || data.assignedAssessment)) {
            list.push({
              id: data.assessmentId || `assessment-${d.id}`,
              slug: data.assessmentSlug || `recruiter-${d.id}`,
              name: data.assessmentTitle || `${data.companyName} Screening Round`,
              title: data.assessmentTitle || `${data.companyName} Screening Round`,
              description: data.assessmentDescription || `Proctored technical screening assigned by ${data.companyName}.`,
              category: 'recruiter',
              isCorporate: true,
              companyId: data.companyId,
              companyName: data.companyName,
              jobId: data.jobId,
              jobTitle: data.jobTitle,
              difficulty: data.difficulty || 'Medium',
              duration: data.duration || 60,
              maxScore: data.maxScore || 100,
              badge: 'Interview Gateway',
              proctoring: {
                enabled: true,
                webcam: true,
                fullScreen: true,
                tabLock: true,
                maxViolations: 2,
              },
              sections: data.sections || [],
              applicationId: d.id,
              candidateStatus: data.stage,
              assessmentScore: data.assessmentScore,
              assessmentCompletedAt: data.assessmentCompletedAt,
            });
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
