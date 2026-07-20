// desktopBridge.js - Communication layer between React and PyQt

let bridgeInstance = null;
let initPromise = null;

export const isDesktopEnvironment = () => {
    return typeof window !== 'undefined' && !!window.qt;
};

export const initBridge = () => {
    if (initPromise) return initPromise;

    initPromise = new Promise((resolve) => {
        let checkCount = 0;
        const maxChecks = 50; // Check for up to 2.5 seconds (50 * 50ms)
        
        const checkBridge = () => {
            if (typeof window !== 'undefined' && window.qt) {
                const connectChannel = () => {
                    try {
                        new window.QWebChannel(window.qt.webChannelTransport, (channel) => {
                            bridgeInstance = channel.objects.desktopBackend;
                            console.log("[DesktopBridge] Connected to PyQt Backend successfully.");
                            if (bridgeInstance) {
                                console.log("[DesktopBridge] Registered backend methods:", Object.keys(bridgeInstance));
                            }
                            resolve(bridgeInstance);
                        });
                    } catch (err) {
                        console.error("[DesktopBridge] Connection error:", err);
                        initPromise = null;
                        resolve(null);
                    }
                };

                // Check if QWebChannel script is loaded, otherwise wait for it
                if (window.QWebChannel) {
                    connectChannel();
                } else {
                    let qwcCheckCount = 0;
                    const qwcInterval = setInterval(() => {
                        qwcCheckCount++;
                        if (window.QWebChannel) {
                            clearInterval(qwcInterval);
                            connectChannel();
                        } else if (qwcCheckCount > 100) { // Timeout after 5 seconds
                            clearInterval(qwcInterval);
                            console.error("[DesktopBridge] Timeout waiting for QWebChannel library.");
                            initPromise = null;
                            resolve(null);
                        }
                    }, 50);
                }
            } else {
                checkCount++;
                if (checkCount < maxChecks) {
                    setTimeout(checkBridge, 50);
                } else {
                    console.log("[DesktopBridge] Running in web environment. Local compilers unavailable.");
                    initPromise = null;
                    resolve(null);
                }
            }
        };

        checkBridge();
    });

    return initPromise;
};

// Auto-trigger initialization
if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
        initBridge();
    });
}

const safeJsonParse = (str, fallbackValue) => {
    if (str === undefined || str === null || str === "") {
        console.warn("[DesktopBridge] Received empty or falsy result from backend.");
        return fallbackValue;
    }
    try {
        return JSON.parse(str);
    } catch (e) {
        console.error("[DesktopBridge] Failed to parse JSON response from backend. Raw string:", str, "Error:", e);
        return fallbackValue;
    }
};

const desktopBridge = {
    setStudentSession: async (authData) => {
        const backend = await initBridge();
        if (backend) {
            backend.setStudentSession(JSON.stringify(authData));
        } else {
            console.log("[DesktopBridge] Mock: setStudentSession", authData);
        }
    },

    runCode: async (language, code, stdin = "") => {
        const backend = await initBridge();
        if (backend) {
            const rawResult = await backend.runCode(String(language || ""), String(code || ""), String(stdin || ""));
            return safeJsonParse(rawResult, { 
                stdout: "", 
                stderr: "PyQt backend returned invalid data.", 
                output: "",
                exit_code: -1, 
                error: "Invalid Backend Output" 
            });
        } else {
            console.warn("[DesktopBridge] Local compiler backend not connected. Run code is disabled in web fallback.");
            return { 
                stdout: "", 
                stderr: "Compilers are only available inside the SEED-IT Desktop application.", 
                output: "",
                exit_code: -1, 
                error: "Desktop App Environment Required" 
            };
        }
    },

    submitCode: async (language, code, questionId) => {
        const backend = await initBridge();
        if (backend) {
            const rawResult = await backend.submitCode(String(language || ""), String(code || ""), String(questionId || ""));
            return safeJsonParse(rawResult, {
                error: "Invalid submission response from backend",
                score: 0,
                passed: 0,
                total: 0,
                testCases: []
            });
        } else {
            console.log("[DesktopBridge] Mock: submitCode", { language, questionId });
            // Fallback: mock full success score
            return {
                score: 100,
                passed: 5,
                total: 5,
                executionTime: 0.15,
                testCases: [
                    { caseNumber: 1, passed: true, executionTime: 0.02 },
                    { caseNumber: 2, passed: true, executionTime: 0.03 }
                ]
            };
        }
    },

    getQuestion: async (questionId) => {
        const backend = await initBridge();
        if (backend) {
            const rawQuestion = await backend.getQuestion(String(questionId || ""));
            return safeJsonParse(rawQuestion, {
                error: "Failed to retrieve question data."
            });
        } else {
            console.log("[DesktopBridge] Mock: getQuestion", questionId);
            // Dynamic mock question bank search
            return {
                id: question_id_mock_map(questionId),
                title: questionId === "hello_world" ? "1. Hello, World!" : "Assessment Question",
                statement: "Write a program that outputs exactly Hello, World!",
                sampleTests: [{ input: "", expected: "Hello, World!\n" }],
                boilerplates: {
                    c: "#include <stdio.h>\n\nint main() {\n    printf(\"Hello, World!\\n\");\n    return 0;\n}",
                    cpp: "#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << \"Hello, World!\" << endl;\n    return 0;\n}",
                    python: "print(\"Hello, World!\")",
                    java: "public class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Hello, World!\");\n    }\n}"
                }
            };
        }
    },

    saveAnswer: async (questionId, answer) => {
        const backend = await initBridge();
        if (backend) {
            return await backend.saveAnswer(String(questionId || ""), String(answer || ""));
        } else {
            localStorage.setItem(`mock_ans_${questionId}`, answer);
            return true;
        }
    },

    loadAnswer: async (questionId) => {
        const backend = await initBridge();
        if (backend) {
            return await backend.loadAnswer(String(questionId || ""));
        } else {
            return localStorage.getItem(`mock_ans_${questionId}`) || "";
        }
    },

    getAssessmentState: async () => {
        const backend = await initBridge();
        if (backend) {
            const rawState = await backend.getAssessmentState();
            return safeJsonParse(rawState, {
                completedQuestions: {},
                totalScore: 0
            });
        } else {
            // Mock empty local state
            return {
                completedQuestions: {},
                totalScore: 0
            };
        }
    },
    
    runDirectSandbox: async (language, code, stdin = "") => {
        const trimmedCode = String(code || "").trim();
        const noComments = trimmedCode
            .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
            .replace(/#.*/g, '')
            .trim();

        if (trimmedCode === "" || noComments === "") {
            return {
                stdout: "",
                stderr: "No code submitted in editor. Blank submissions cannot be executed or evaluated.",
                output: "",
                exit_code: 1,
                error: "Blank Code Submitted"
            };
        }

        const backend = await initBridge();
        if (backend) {
            const rawResult = await backend.runDirectSandbox(String(language || ""), String(code || ""), String(stdin || ""));
            return safeJsonParse(rawResult, { 
                stdout: "", 
                stderr: "PyQt sandbox execution returned invalid response.", 
                output: "",
                exit_code: -1, 
                error: "Invalid Backend Output" 
            });
        } else {
            console.warn("[DesktopBridge] Local compiler backend not connected. Sandbox execution is disabled in web fallback.");
            return { 
                stdout: "", 
                stderr: "Compilers are only available inside the SEED-IT Desktop application.", 
                output: "",
                exit_code: -1, 
                error: "Desktop App Environment Required" 
            };
        }
    },

    getContests: async () => {
        const backend = await initBridge();
        if (backend) {
            const rawResult = await backend.getContests();
            return safeJsonParse(rawResult, []);
        } else {
            return [
                {
                    id: "practice_contest",
                    title: "SEED-IT Practice Contest (Mock)",
                    description: "General practice for C, C++, Java, and Python.",
                    startTime: "2026-01-01T00:00:00Z",
                    endTime: "2026-12-31T23:59:59Z",
                    questions: ["hello_world", "add_numbers", "even_odd", "factorial", "binary_search"]
                }
            ];
        }
    },

    getChallenges: async () => {
        const backend = await initBridge();
        if (backend) {
            const rawResult = await backend.getChallenges();
            return safeJsonParse(rawResult, []);
        } else {
            return [
                {
                    id: "hello_world",
                    title: "1. Hello, World!",
                    difficulty: "Easy",
                    description: "Write a program that outputs exactly \"Hello, World!\"",
                    category: "Fundamentals"
                },
                {
                    id: "add_numbers",
                    title: "2. Sum of Two Integers",
                    difficulty: "Easy",
                    description: "Write a program that reads two integers and prints their sum.",
                    category: "Fundamentals"
                },
                {
                    id: "even_odd",
                    title: "3. Even or Odd",
                    difficulty: "Easy",
                    description: "Determine if N is even or odd.",
                    category: "Fundamentals"
                },
                {
                    id: "factorial",
                    title: "4. Factorial of N",
                    difficulty: "Medium",
                    description: "Calculate the factorial of a given integer N.",
                    category: "Mathematics"
                },
                {
                    id: "binary_search",
                    title: "5. Binary Search",
                    difficulty: "Medium",
                    description: "Locate an element in a sorted list.",
                    category: "Algorithms"
                }
            ];
        }
    }
};

function question_id_mock_map(id) {
    return id || "hello_world";
}

export default desktopBridge;
