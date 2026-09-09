# SEED-IT Course Authoring Guide & Course Generation Prompt

This guide provides the complete JSON schema specification, validation rules, and an AI generation prompt that you can use to automatically transform your articles and curriculum notes from `C:\Users\ashok\Downloads\SEED works\GitHub\seed-contents\articles` into full SEED-IT LMS courses.

---

## 1. How the System Loads Courses

The platform automatically discovers and loads all courses placed inside:
```
unique/seed-seb/frontend/src/courses/data/realCourses/*.json
```
Vite uses dynamic eager globbing (`import.meta.glob('./realCourses/*.json', { eager: true })`). When you drop a new `.json` course file into this directory, it **instantly appears** in the Course Catalog and My Learning dashboard without needing any code changes or rebuilds.

---

## 2. Complete Course JSON Schema

Every course file should follow this structure:

```json
{
  "courseId": "dsa-foundation-mastery",
  "title": "Data Structures & Algorithms Mastery",
  "slug": "dsa-foundation-mastery",
  "category": "Computer Science",
  "level": "Intermediate",
  "rating": 4.9,
  "reviewsCount": 1240,
  "description": "Master Data Structures and Algorithms with real instructor video lessons, page-by-page interactive reading, mid-lesson checkpoints, and SEED-IT 90% gated MSAs.",
  "thumbnail": "/images/courses/dsa_thumbnail.png",
  "skills": ["Arrays", "Memory Layout", "Two Pointers", "Time Complexity"],
  "modules": [
    {
      "moduleId": "mod-01-arrays",
      "title": "Module 1: Arrays & Memory Fundamentals",
      "description": "Master contiguous memory allocation, array indexing, mid-video checkpoints, and dual 90% gated module assessment.",
      "estimatedMinutes": 52,
      "topics": [
        {
          "topicId": "topic-1-1-what-are-arrays",
          "title": "1.1 Introduction to Arrays",
          "description": "Fundamental array memory representation and indexing mechanics.",
          "mode": "TEXT",
          "duration": "14:00",
          "readingTimeMinutes": 12,
          "pages": [
            {
              "pageId": "p1-intro",
              "title": "Introduction to Memory & Arrays",
              "content": "An array is a linear data structure that stores elements of the same data type in contiguous memory locations...",
              "callout": {
                "type": "NOTE",
                "title": "Key Insight",
                "text": "Every element in an array occupies the exact same number of bytes in RAM. Address = Base + (Index * Element_Size)."
              },
              "illustration": {
                "type": "MEMORY_LAYOUT",
                "title": "RAM Memory Layout",
                "caption": "Index 0 through 4 stored in adjacent 4-byte memory registers: 0x1000, 0x1004, 0x1008, 0x100C."
              },
              "codeCard": {
                "language": "cpp",
                "code": "int arr[5] = {10, 20, 30, 40, 50};\nint first = arr[0];"
              }
            },
            {
              "pageId": "p2-indexing",
              "title": "Zero-Based Indexing Mechanics",
              "content": "The index is not a count; it is a memory offset from the base pointer...",
              "checkpoint": {
                "checkpointId": "cp-text-1-indexing",
                "question": "What is the primary architectural reason why arrays provide O(1) random access?",
                "options": [
                  "Because memory elements are stored contiguously and can be calculated by address",
                  "Because modern CPUs search through the array using parallel threads",
                  "Because the compiler stores array values in cache memory permanently",
                  "Because arrays use binary search trees internally"
                ],
                "correctAnswer": 0,
                "explanation": "Contiguous memory layout allows the CPU to calculate Address = Base + (Index * Element_Size) in O(1) time."
              }
            }
          ],
          "practiceProblems": [
            {
              "problemId": "Q1001",
              "questionId": "Q1001",
              "title": "Two Sum",
              "difficulty": "Easy",
              "description": "Optional: If left blank or mapped to a Question Bank ID ('Q1001'), the SEED compiler automatically loads the problem statement, constraints, boilerplates, and test cases from the Question Bank!"
            },
            {
              "problemId": "Q1002",
              "title": "Find Maximum Element",
              "difficulty": "Easy"
            }
          ]
        },
        {
          "topicId": "topic-1-2-video-traversal",
          "title": "1.2 Video: Array Operations & Traversal",
          "description": "Real instructor video explaining array operations, traversal, and complexity.",
          "mode": "VIDEO",
          "duration": "18:32",
          "videoUrl": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          "checkpoints": [
            {
              "checkpointId": "cp-vid-1",
              "timeSeconds": 15,
              "title": "Mid-Video Checkpoint 1",
              "question": "What is the time complexity of accessing an array element by its index in contiguous memory?",
              "options": [
                "O(1) Constant Time",
                "O(log N) Logarithmic Time",
                "O(N) Linear Time",
                "O(N^2) Quadratic Time"
              ],
              "correctAnswer": 0,
              "explanation": "Index access uses base address + offset arithmetic which computes in O(1) time.",
              "pauseVideo": true,
              "blockSeek": true,
              "required": true
            }
          ]
        },
        {
          "topicId": "topic-1-3-video-and-text",
          "title": "1.3 Dynamic Arrays & Amortized Analysis",
          "description": "Dual-mode lesson offering both real instructor video and equivalent structured text.",
          "mode": "VIDEO_AND_TEXT",
          "duration": "16:40",
          "videoUrl": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
          "readingTimeMinutes": 10,
          "checkpoints": [
            {
              "checkpointId": "cp-hybrid-1",
              "timeSeconds": 20,
              "title": "Checkpoint: Capacity Doubling",
              "question": "When a dynamic array fills its capacity, how does it resize?",
              "options": [
                "It requests 1 additional byte",
                "It allocates a new buffer of 2x size, copies all elements, and frees the old buffer",
                "It automatically converts itself into a linked list in RAM",
                "It deletes the oldest elements to make room"
              ],
              "correctAnswer": 1,
              "explanation": "Dynamic arrays double capacity to maintain O(1) amortized append.",
              "pauseVideo": true,
              "blockSeek": true,
              "required": true
            }
          ],
          "pages": [
            {
              "pageId": "p-hybrid-1",
              "title": "Dynamic Array Architecture",
              "content": "Dynamic arrays maintain an internal buffer and automatically double capacity when full...",
              "codeCard": {
                "language": "cpp",
                "code": "#include <vector>\nstd::vector<int> v;\nv.push_back(10);"
              },
              "checkpoint": {
                "checkpointId": "cp-hybrid-1",
                "question": "What is the amortized cost of push_back in a dynamic array?",
                "options": ["O(1) Amortized", "O(N)", "O(log N)", "O(N^2)"],
                "correctAnswer": 0,
                "explanation": "The doubling factor yields O(1) amortized time."
              }
            }
          ]
        }
      ],
      "msa": {
        "assessmentId": "msa-mod-01-arrays",
        "title": "Module 1 Assessment (MSA)",
        "durationMinutes": 35,
        "passPercent": 90,
        "mcqSection": {
          "totalQuestions": 10,
          "durationMinutes": 20,
          "passCutoffPercent": 90,
          "questions": [
            {
              "questionId": "q1",
              "question": "Which operation provides O(1) constant time access in a standard array?",
              "options": ["Direct Index Access", "Linear Searching", "Insertion at Index 0", "Bubble Sorting"],
              "correctAnswer": 0,
              "explanation": "Contiguous offset evaluation takes O(1) time."
            }
          ]
        },
        "codingSection": {
          "totalQuestions": 2,
          "durationMinutes": 30,
          "passCutoffPercent": 90,
          "problems": [
            {
              "problemId": "p-code-1-reverse-arr",
              "title": "Reverse an Array In-Place",
              "difficulty": "Easy",
              "description": "Given an array of integers, reverse the array in-place with O(1) extra space and print the space-separated reversed elements.",
              "inputFormat": "First line contains integer N. Second line contains N space-separated integers.",
              "outputFormat": "Print the reversed array space-separated on a single line.",
              "constraints": "1 <= N <= 10^5, -10^9 <= arr[i] <= 10^9",
              "starterCode": {
                "cpp": "#include <iostream>\n#include <vector>\n#include <algorithm>\n\nint main() {\n    int n;\n    if (!(std::cin >> n)) return 0;\n    std::vector<int> arr(n);\n    for(int i = 0; i < n; ++i) std::cin >> arr[i];\n    int left = 0, right = n - 1;\n    while (left < right) {\n        std::swap(arr[left], arr[right]);\n        left++;\n        right--;\n    }\n    for(int i = 0; i < n; ++i) std::cout << arr[i] << (i + 1 == n ? \"\" : \" \");\n    std::cout << \"\\n\";\n    return 0;\n}",
                "python": "import sys\ndef main():\n    lines = sys.stdin.read().split()\n    if not lines: return\n    n = int(lines[0])\n    arr = [int(x) for x in lines[1:n+1]]\n    arr.reverse()\n    print(*(arr))\nif __name__ == '__main__':\n    main()",
                "java": "import java.util.Scanner;\npublic class Solution {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (!sc.hasNextInt()) return;\n        int n = sc.nextInt();\n        int[] arr = new int[n];\n        for (int i = 0; i < n; i++) arr[i] = sc.nextInt();\n        for (int i = n - 1; i >= 0; i--) System.out.print(arr[i] + (i == 0 ? \"\" : \" \"));\n        System.out.println();\n    }\n}",
                "c": "#include <stdio.h>\nint main() {\n    int n;\n    if (scanf(\"%d\", &n) != 1) return 0;\n    int arr[n];\n    for (int i = 0; i < n; i++) scanf(\"%d\", &arr[i]);\n    for (int i = n - 1; i >= 0; i--) printf(\"%d%s\", arr[i], (i == 0 ? \"\" : \" \"));\n    printf(\"\\n\");\n    return 0;\n}"
              },
              "sampleTestCases": [
                {
                  "input": "5\n1 2 3 4 5",
                  "expectedOutput": "5 4 3 2 1"
                }
              ],
              "hiddenTestCases": [
                {
                  "input": "1\n99",
                  "expectedOutput": "99"
                }
              ]
            }
          ]
        }
      }
    }
  ]
}
```

---

## 3. Course Rebuilding AI Prompt

You can copy and paste the prompt below into any AI (or pass it in Antigravity) along with the contents of any article or folder from `C:\Users\ashok\Downloads\SEED works\GitHub\seed-contents\articles`:

````markdown
You are an expert curriculum architect for SEED-IT LMS.
Your task is to transform the provided educational article/notes into a complete SEED-IT course JSON file conforming to the SEED-IT LMS schema.

### Instructions & Rules:
1. Delivery Modes:
   - For reading-heavy topics, set `mode: "TEXT"` with structured `pages` (each with title, content, callouts, illustrations, code cards, and inline checkpoints).
   - For lecture-style topics, set `mode: "VIDEO"` with `videoUrl` and `checkpoints` (timestamped mid-video MCQ checks with pauseVideo: true and blockSeek: true).
   - For comprehensive topics, set `mode: "VIDEO_AND_TEXT"` providing both `videoUrl` and structured `pages`.
2. Content-Driven Duration:
   - Provide realistic estimates for reading time and video duration (e.g. "12:30").
3. Module Assessment (MSA):
   - Every module must conclude with an `msa` object containing:
     - `mcqSection`: 10-20 technical MCQs, 20 minutes duration, `passCutoffPercent: 90`.
     - `codingSection`: 1-3 algorithmic coding problems with starterCode in C++, Java, Python, C, plus sampleTestCases and hiddenTestCases, `passCutoffPercent: 90`.
   - Dual 90% Gating: Note that students must score >= 90% on MCQs AND >= 90% on Coding independently to unlock the next module.
4. Output Format:
   - Output ONLY raw valid JSON (no markdown fences, no surrounding prose) ready to be saved as a `.json` file in `frontend/src/courses/data/realCourses/<course-id>.json`.

### Source Article Content to Convert:
[PASTE ARTICLE CONTENT OR FILE PATH HERE]
````

---

## 4. Summary of Supported Delivery Modes

| Mode | Main Content Delivery | Video Engine | Page Reader | Mid-Content Checkpoint |
| :--- | :--- | :--- | :--- | :--- |
| **TEXT** | Page-by-page reading | None | Yes (illustrations, code blocks, callouts) | Inline question blocks advancing to next page |
| **VIDEO** | Real instructor video | Yes (`videoUrl`, custom scrubber, time markers) | Optional transcript/notes | Timestamp-based auto-pause overlay with forward-seek lock |
| **VIDEO + TEXT** | Student toggleable (`[ 🎥 Video ]` ⟷ `[ 📖 Text ]`) | Yes (`videoUrl`) | Yes (full equivalent written lesson) | Synchronized checkpoint completion across both modes |

---

## 5. Course MSA Dual 90% Gating Rule

```
Module MSA
   ├── Section 1: MCQ Assessment (10-20 Questions, 20 mins)
   │      └── Score ≥ 90% Required
   │
   └── Section 2: Coding Assessment (1-3 Problems, SEED Desktop Compiler Bridge)
          └── Score ≥ 90% Required

Result:
   MCQ ≥ 90%  AND  Coding ≥ 90%  ===>  MSA PASSED  ===>  NEXT MODULE UNLOCKED
   MCQ 100%   AND  Coding 80%   ===>  MSA FAILED  ===>  Module Remains Locked
```
- Local persistence tracks module unlocks, MSA scores, and passed checkpoints in `localStorage` (`seed_course_progress_<uid>_<courseId>`) ensuring reliable progression even without custom Firestore security rules.
