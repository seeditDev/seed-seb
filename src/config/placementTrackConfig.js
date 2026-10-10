/**
 * placementTrackConfig.js
 *
 * Configurable Course & Assessment Blueprints for the SEED 7-Level Placement Track.
 * 1,081 Total Questions across 7 curated milestone tiers.
 */

export const PLACEMENT_TRACK_CONFIG = {
  courseId: 'placement-coding-track',
  defaultCourseTitle: 'Placement Coding Track',
  description: 'Seven-level algorithmic and problem-solving milestone progression track for technical campus placements.',
  totalLevels: 7,
  totalQuestions: 1081,
  defaultAssessmentDurationMinutes: 240, // 4 hours
  cooldownDays: 15,
  maxMonthlyAttempts: 2,
  modules: [
    {
      level: 1,
      id: 'level-1',
      title: 'Level 1: Absolute Foundations & Logic Building',
      shortTitle: 'Foundations & Logic Building',
      description: 'Foundations of arrays, basic string manipulations, mathematical logic, and recursion.',
      whoFor: '1st-year students with zero prior DSA knowledge.',
      whatYouPractice: 'Number logic (primes, factorials, digit extraction), basic loops, condition branching, and basic character manipulations.',
      outcome: 'Pure syntax fluency in C, C++, Java, or Python without compiler errors.',
      targetCompanies: ['College Labs', 'Campus Coding Drives', 'Technical Screening'],
      placementMilestone: 'College Lab & Syntax Mastery',
      totalQuestions: 321,
      prerequisiteLevel: null,
      topics: [
        { id: 'l1-t1', name: 'Arrays and Array Operations', count: 42, defaultSolved: 8 },
        { id: 'l1-t2', name: 'Strings and String Manipulation', count: 58, defaultSolved: 12 },
        { id: 'l1-t3', name: 'Mathematical Logic', count: 44, defaultSolved: 6 },
        { id: 'l1-t4', name: 'Recursion', count: 46, defaultSolved: 4 },
        { id: 'l1-t5', name: 'Time and Space Complexity', count: 38, defaultSolved: 0 },
        { id: 'l1-t6', name: 'Problem Solving Patterns', count: 52, defaultSolved: 0 },
        { id: 'l1-t7', name: 'Mixed Practice Set', count: 41, defaultSolved: 0 }
      ],
      rewards: {
        xp: 300,
        credits: 50,
        badgeName: 'Level 1 Foundations',
        certificate: 'Level 1 Completion Certificate'
      },
      assessment: {
        id: 'l1-placement-clearance',
        slug: 'l1-placement-clearance',
        title: 'Level 1 Placement Clearance Assessment',
        durationMinutes: 240,
        passPercentage: 70,
        targetQuestionCount: 16,
        type: 'multisection',
        sectionType: 'coding',
        proctored: true,
        audioProctored: true,
        proctorMode: 'face+audio',
        cameraRequired: true,
        audioRequired: true,
        proctorConfig: {
          enabled: true,
          cameraRequired: true,
          audioRequired: true,
          proctorMode: 'face+audio',
          maxViolations: 100,
          maxCameraViolations: 100,
          maxAudioViolations: 100,
          tabSwitchLimit: 100,
          autoSubmitOnViolation: false
        },
        questions: [
          'Q0.56', 'Q0.57', 'Q0.58', 'Q0.59', 'Q0.60',
          'Q0.61', 'Q0.62', 'Q0.63', 'Q0.64', 'Q0.65',
          'Q0.66', 'Q0.67', 'Q0.68', 'Q0.69', 'Q0.70', 'Q0.71'
        ]
      }
    },
    {
      level: 2,
      id: 'level-2',
      title: 'Level 2: Core Data Fundamentals',
      shortTitle: 'Core Data Fundamentals',
      description: 'Two pointers, sliding window basics, prefix sums, binary search basics, and elementary data structures.',
      whoFor: 'Students who completed L1 foundations or have elementary syntax fluency.',
      whatYouPractice: '50 Easy Arrays, 40 Easy Strings, 20 Math & Numbers, 10 Linear/Binary Search & Sorting, 10 Bit Manipulation.',
      outcome: 'You master running sums, palindromes, anagrams, two-pointer basics, and elementary binary search.',
      targetCompanies: ['TCS NQT', 'Infosys', 'Wipro', 'Accenture', 'Cognizant', 'Capgemini'],
      placementMilestone: 'Mass Recruiter Screening',
      totalQuestions: 130,
      prerequisiteLevel: 1,
      topics: [
        { id: 'l2-t1', name: 'Easy Arrays & Running Sums', count: 50, defaultSolved: 0 },
        { id: 'l2-t2', name: 'Easy Strings, Palindromes & Anagrams', count: 40, defaultSolved: 0 },
        { id: 'l2-t3', name: 'Math & Number Theory Fundamentals', count: 20, defaultSolved: 0 },
        { id: 'l2-t4', name: 'Linear / Binary Search & Basic Sorting', count: 10, defaultSolved: 0 },
        { id: 'l2-t5', name: 'Bit Manipulation Foundations', count: 10, defaultSolved: 0 }
      ],
      rewards: {
        xp: 450,
        credits: 75,
        badgeName: 'Level 2 Data Specialist',
        certificate: 'Level 2 Core Data Certificate'
      },
      assessment: {
        id: 'L2-CLEARANCE',
        title: 'Level 2 Placement Clearance Assessment',
        durationMinutes: 240,
        passPercentage: 70,
        targetQuestionCount: 16
      }
    },
    {
      level: 3,
      id: 'level-3',
      title: 'Level 3: Intermediate Linear & Hashing',
      shortTitle: 'Intermediate Linear & Hashing',
      description: 'Hash tables, frequency maps, two pointers (3Sum), sliding window, and search optimizations.',
      whoFor: 'Aspiring engineers targeting higher package service & product companies.',
      whatYouPractice: '40 Hash Tables (Two Sum, frequency maps), 30 Two Pointers (3Sum), 25 Sliding Window, 20 Binary Search Variations, 15 Sorting & Greedy Warmup.',
      outcome: 'You learn how to eliminate brute-force O(N²) time complexity using HashMaps, dynamic windows, and optimal pointer movements.',
      targetCompanies: ['TCS Digital', 'Cognizant GenC Elevate', 'Mindtree', 'Virtusa', 'Hexaware'],
      placementMilestone: 'High-Tier Service Packages',
      totalQuestions: 130,
      prerequisiteLevel: 2,
      topics: [
        { id: 'l3-t1', name: 'Hash Tables (Two Sum, Frequency Maps)', count: 40, defaultSolved: 0 },
        { id: 'l3-t2', name: 'Two Pointers (3Sum, Pair Reductions)', count: 30, defaultSolved: 0 },
        { id: 'l3-t3', name: 'Sliding Window (Dynamic & Fixed)', count: 25, defaultSolved: 0 },
        { id: 'l3-t4', name: 'Binary Search Variations', count: 20, defaultSolved: 0 },
        { id: 'l3-t5', name: 'Sorting & Greedy Warmup', count: 15, defaultSolved: 0 }
      ],
      rewards: {
        xp: 600,
        credits: 100,
        badgeName: 'Level 3 Hash & Linear Master',
        certificate: 'Level 3 Intermediate DSA Certificate'
      },
      assessment: {
        id: 'L3-CLEARANCE',
        title: 'Level 3 Placement Clearance Assessment',
        durationMinutes: 240,
        passPercentage: 70,
        targetQuestionCount: 16
      }
    },
    {
      level: 4,
      id: 'level-4',
      title: 'Level 4: Matrices, Stacks, Queues & Lists',
      shortTitle: 'Matrices, Stacks, Queues & Lists',
      description: '2D matrices, linked list reversal & cycle detection, monotonic stacks, and state machine queues.',
      whoFor: 'Engineers targeting mid-tier product companies and startup technical rounds.',
      whatYouPractice: '40 2D Matrices (Spiral, rotation, diagonal math), 30 Linked Lists (cycle detection, reversal, merge), 30 Stacks (Monotonic, Parentheses, Daily Temperatures), 25 Queues, Recursion & Simulation.',
      outcome: 'You master pointer memory, node linkages, grid coordinates, and LIFO/FIFO state machines.',
      targetCompanies: ['Zoho', 'Freshworks', 'PayU', 'Juspay', 'Hexaware', 'Cisco'],
      placementMilestone: 'Mid-Tier Product Companies',
      totalQuestions: 125,
      prerequisiteLevel: 3,
      topics: [
        { id: 'l4-t1', name: '2D Matrices (Spiral, Rotation, Diagonal)', count: 40, defaultSolved: 0 },
        { id: 'l4-t2', name: 'Linked Lists (Cycles, Reversal, Merge)', count: 30, defaultSolved: 0 },
        { id: 'l4-t3', name: 'Stacks (Monotonic, Parentheses, Temperatures)', count: 30, defaultSolved: 0 },
        { id: 'l4-t4', name: 'Queues, Recursion & Simulation', count: 25, defaultSolved: 0 }
      ],
      rewards: {
        xp: 750,
        credits: 120,
        badgeName: 'Level 4 Structure Architect',
        certificate: 'Level 4 Linear Structures Certificate'
      },
      assessment: {
        id: 'L4-CLEARANCE',
        title: 'Level 4 Placement Clearance Assessment',
        durationMinutes: 240,
        passPercentage: 70,
        targetQuestionCount: 16
      }
    },
    {
      level: 5,
      id: 'level-5',
      title: 'Level 5: Hierarchical Structures & Greedy',
      shortTitle: 'Hierarchical Structures & Greedy',
      description: 'Binary trees, BST, LCA, heaps, priority queues, greedy interval scheduling, and binary search on answer.',
      whoFor: 'Candidates targeting Tier-1 product giants and global innovation labs.',
      whatYouPractice: '45 Binary Trees & BST (traversals, LCA, diameter, validate BST), 30 Heaps & Priority Queues (top K frequent, Kth largest), 30 Greedy & Intervals (merge intervals, jump game), 20 Binary Search on Answer / Prefix Sums.',
      outcome: 'You conquer non-linear hierarchical data structures and optimal greedy decision-making.',
      targetCompanies: ['Amazon', 'Flipkart', 'Walmart Labs', 'Oracle', 'Adobe', 'Intuit'],
      placementMilestone: 'Tier-1 Product Companies',
      totalQuestions: 125,
      prerequisiteLevel: 4,
      topics: [
        { id: 'l5-t1', name: 'Binary Trees & BST (Traversals, LCA, Diameter)', count: 45, defaultSolved: 0 },
        { id: 'l5-t2', name: 'Heaps & Priority Queues (Top K, Kth Largest)', count: 30, defaultSolved: 0 },
        { id: 'l5-t3', name: 'Greedy & Intervals (Merge, Jump Game)', count: 30, defaultSolved: 0 },
        { id: 'l5-t4', name: 'Binary Search on Answer / Prefix Sums', count: 20, defaultSolved: 0 }
      ],
      rewards: {
        xp: 900,
        credits: 140,
        badgeName: 'Level 5 Tree & Greedy Specialist',
        certificate: 'Level 5 Hierarchical DSA Certificate'
      },
      assessment: {
        id: 'L5-CLEARANCE',
        title: 'Level 5 Placement Clearance Assessment',
        durationMinutes: 240,
        passPercentage: 70,
        targetQuestionCount: 16
      }
    },
    {
      level: 6,
      id: 'level-6',
      title: 'Level 6: Graphs, Backtracking & Search',
      shortTitle: 'Graphs, Backtracking & Search',
      description: 'Graph BFS/DFS, topological sorting, backtracking permutations, hard two-pointer drills, and bit masking.',
      whoFor: 'Engineers targeting high-package product firms and fintech trading desks.',
      whatYouPractice: '45 Graphs (Grid BFS/DFS, Topological Sort, cycle detection, rotting oranges), 30 Backtracking (Subsets II, Permutations, N-Queens), 35 Advanced Arrays & Hard Two-Pointers (Trapping Rain Water, 4Sum), 15 Bit Manipulation & Advanced Math.',
      outcome: 'You master multi-state decision trees, connected network traversals, and complex search optimizations.',
      targetCompanies: ['Microsoft', 'Uber', 'Goldman Sachs', 'Morgan Stanley', 'Atlassian'],
      placementMilestone: 'High-Package Product & Fintech',
      totalQuestions: 125,
      prerequisiteLevel: 5,
      topics: [
        { id: 'l6-t1', name: 'Graphs (BFS/DFS, Topological Sort, Cycles)', count: 45, defaultSolved: 0 },
        { id: 'l6-t2', name: 'Backtracking (Subsets, Permutations, N-Queens)', count: 30, defaultSolved: 0 },
        { id: 'l6-t3', name: 'Advanced Arrays & Hard Two-Pointers (Rain Water)', count: 35, defaultSolved: 0 },
        { id: 'l6-t4', name: 'Bit Manipulation & Advanced Math', count: 15, defaultSolved: 0 }
      ],
      rewards: {
        xp: 1100,
        credits: 160,
        badgeName: 'Level 6 Graph & Search Master',
        certificate: 'Level 6 Advanced Search Certificate'
      },
      assessment: {
        id: 'L6-CLEARANCE',
        title: 'Level 6 Placement Clearance Assessment',
        durationMinutes: 240,
        passPercentage: 70,
        targetQuestionCount: 16
      }
    },
    {
      level: 7,
      id: 'level-7',
      title: 'Level 7: Dynamic Programming & Elite Placement',
      shortTitle: 'Dynamic Programming & Elite',
      description: '1D/2D DP, knapsack, LCS, LIS, hard histograms, shortest paths, tries, and FAANG interview problems.',
      whoFor: 'Top-tier candidates cracking top CTC / FAANG product company hiring rounds.',
      whatYouPractice: '55 Dynamic Programming (1D, 2D, Knapsack, LCS, LIS, Edit Distance), 30 Hard Arrays & Histograms (Largest Rectangle, Hard Sliding Window), 20 Hard Graphs & Shortest Paths (Dijkstra, Bellman-Ford, Alien Dictionary), 20 Tries & Hard Trees.',
      outcome: 'You achieve full placement eligibility, cracking the highest package technical interview rounds in tech.',
      targetCompanies: ['Google', 'Meta', 'Apple', 'DE Shaw', 'Citadel', 'Snowflake'],
      placementMilestone: 'FAANG & Elite Hiring Rounds',
      totalQuestions: 125,
      prerequisiteLevel: 6,
      topics: [
        { id: 'l7-t1', name: 'Dynamic Programming (1D, 2D, Knapsack, LCS, LIS)', count: 55, defaultSolved: 0 },
        { id: 'l7-t2', name: 'Hard Arrays & Histograms (Largest Rectangle)', count: 30, defaultSolved: 0 },
        { id: 'l7-t3', name: 'Hard Graphs & Shortest Paths (Dijkstra, Alien Dict)', count: 20, defaultSolved: 0 },
        { id: 'l7-t4', name: 'Tries & Hard Trees (Prefix Trees, Word Search)', count: 20, defaultSolved: 0 }
      ],
      rewards: {
        xp: 1500,
        credits: 200,
        badgeName: 'Level 7 Elite Placement Certified',
        certificate: 'SEED 100% Placement Clearance Certificate'
      },
      assessment: {
        id: 'L7-CLEARANCE',
        title: 'Level 7 Placement Clearance Assessment',
        durationMinutes: 240,
        passPercentage: 70,
        targetQuestionCount: 16
      }
    }
  ]
};
