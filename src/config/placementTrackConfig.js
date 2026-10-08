/**
 * placementTrackConfig.js
 *
 * Configurable Course & Assessment Blueprints for the SEED 7-Level Placement Track.
 * Configurable display names and parameters as required by Sections 8, 9, 18, 19, 20.
 */

export const PLACEMENT_TRACK_CONFIG = {
  courseId: 'placement-coding-track',
  defaultCourseTitle: 'Placement Coding Track',
  description: 'Seven-level algorithmic and problem-solving milestone progression track for technical campus placements.',
  totalLevels: 7,
  defaultAssessmentDurationMinutes: 240, // 4 hours
  cooldownDays: 15,
  maxMonthlyAttempts: 2,
  modules: [
    {
      level: 1,
      id: 'level-1',
      title: 'Level 1: Algorithmic Foundations',
      description: 'Foundations of arrays, basic string manipulations, mathematical logic, and recursion.',
      prerequisiteLevel: null,
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
      title: 'Level 2: Core Data Structures & Two Pointers',
      description: 'Two pointers, sliding window, prefix sums, binary search basics, and linear data structures.',
      prerequisiteLevel: 1,
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
      title: 'Level 3: Stacks, Queues & Non-Linear Structures',
      description: 'Monotonic stacks, circular queues, binary trees, tree traversals, and hashing techniques.',
      prerequisiteLevel: 2,
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
      title: 'Level 4: Advanced Trees, Heaps & Greedy Logic',
      description: 'Binary Search Trees (BST), priority queues, heaps, greedy paradigms, and intervals.',
      prerequisiteLevel: 3,
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
      title: 'Level 5: Graphs & Breadth/Depth Search',
      description: 'Graph representations, BFS, DFS, cycle detection, topological sorting, and shortest path algorithms.',
      prerequisiteLevel: 4,
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
      title: 'Level 6: Dynamic Programming & Bit Manipulation',
      description: '1D/2D DP, memoization, tabulation, knapsack patterns, bit masking, and combinatorial optimization.',
      prerequisiteLevel: 5,
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
      title: 'Level 7: Hard Algorithms & Enterprise Architecture',
      description: 'Trie structures, segment trees, complex DP on trees/graphs, and FAANG/tier-1 technical interview problems.',
      prerequisiteLevel: 6,
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
