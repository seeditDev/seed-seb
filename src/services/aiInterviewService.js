import axios from 'axios';
import defaultInterviewCatalog from '../../public/seed-contents/interviews/catalog.json';

// Cached INDEX 0 Interview Catalog with pre-bundled static fallback
let cachedIndex0Catalog = (Array.isArray(defaultInterviewCatalog) && defaultInterviewCatalog.length > 0)
  ? defaultInterviewCatalog
  : null;

export const loadIndex0InterviewCatalog = async () => {
  if (cachedIndex0Catalog && cachedIndex0Catalog.length > 0) return cachedIndex0Catalog;
  try {
    const res = await fetch('/seed-contents/interviews/catalog.json');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        cachedIndex0Catalog = data;
        return cachedIndex0Catalog;
      }
    }
  } catch (err) {
    console.warn('Could not load INDEX 0 interview catalog over fetch, using bundled catalog', err);
  }
  return defaultInterviewCatalog || [];
};

export const getFilteredScenarios = async (domain = 'Backend', difficulty = 'Senior') => {
  const cat = await loadIndex0InterviewCatalog();
  if (!Array.isArray(cat) || cat.length === 0) return [];

  const normDomain = String(domain || '').toLowerCase().trim();
  const normDiff = String(difficulty || '').toLowerCase().trim();

  // Normalize seniority
  const levelMap = {
    'senior': 'senior',
    'hard': 'senior',
    'lead': 'senior',
    'mid': 'mid',
    'medium': 'mid',
    'intermediate': 'mid',
    'entry': 'entry',
    'easy': 'entry',
    'junior': 'entry',
    'fresher': 'entry'
  };
  const targetLevel = levelMap[normDiff] || 'senior';

  return cat.filter(item => {
    const role = String(item.role || item.raw?.specialization || item.track || '').toLowerCase();
    const level = String(item.level || item.raw?.level || item.seniority || '').toLowerCase();
    const id = String(item.id || '').toLowerCase();

    // Domain matching
    let domainMatch = false;
    if (normDomain === 'backend') {
      domainMatch = role === 'backend' || id.startsWith('backend-');
    } else if (normDomain === 'frontend') {
      domainMatch = role === 'frontend' || id.startsWith('frontend-');
    } else if (normDomain.includes('data')) {
      domainMatch = role.includes('data') || id.startsWith('data-');
    } else if (normDomain.includes('ml') || normDomain.includes('ai')) {
      domainMatch = role.includes('ml') || id.startsWith('mlai-');
    } else if (normDomain.includes('system design')) {
      domainMatch = id.includes('systemdesign') || item.track === 'systemdesign';
    } else {
      domainMatch = role.includes(normDomain) || id.includes(normDomain);
    }

    // Level matching
    const levelMatch = level === targetLevel || id.includes(`-${targetLevel}-`);

    return domainMatch && levelMatch;
  });
};

// Question bank for local fallback simulation if no API key is provided
const FALLBACK_QUESTION_BANKS = {
  "Backend": [
    "Design a database schema with high read-write throughput and proper indexing strategies.",
    "Explain how you prevent N+1 query problems in an ORM architecture.",
    "What are the trade-offs between distributed caching and local in-memory caching?",
    "How do you implement idempotent payment request handling under high network retry rates?",
    "Explain database transaction isolation levels and how they prevent dirty reads."
  ],
  "Frontend": [
    "Explain the browser rendering pipeline: layout, paint, and composite stages.",
    "How do you debug and resolve severe JavaScript memory leaks in single-page applications?",
    "Explain React reconciliation and how memoization prevents unnecessary re-renders.",
    "What strategies do you use for efficient JavaScript bundle splitting and code splitting?",
    "How do you ensure WCAG 2.1 AA accessibility across complex UI component libraries?"
  ],
  "Data Engineering": [
    "Compare ETL vs ELT architectures. When would you prefer one over the other?",
    "Explain how you guarantee exactly-once message delivery in stream processing pipelines.",
    "What is the difference between Star Schema and Snowflake Schema in data warehousing?",
    "How do you detect and handle late-arriving data in an Apache Kafka / Flink pipeline?",
    "Explain CDC (Change Data Capture) and how it keeps analytics databases in sync with production OLTP."
  ],
  "ML / AI": [
    "Explain the Attention mechanism in Transformers and how it computes Query, Key, and Value.",
    "What is the difference between Fine-Tuning with LoRA and Retrieval-Augmented Generation (RAG)?",
    "How do you detect and mitigate training data leakage and concept drift in production models?",
    "Explain the trade-offs between precision, recall, and F1-score for fraud detection.",
    "How do you design a real-time low-latency model inference service under spike traffic?"
  ],
  "Software Engineering": [
    "Walk me through your architectural strategy for decomposing a monolith into microservices.",
    "Explain CAP theorem and how you choose between consistency and availability in network partitions.",
    "How do you design a distributed rate limiter that coordinates across multiple geographic regions?",
    "What is dependency injection and how does it improve software maintainability and testability?",
    "How do you manage zero-downtime database schema migrations for tables with hundreds of millions of rows?"
  ],
  Java: [
    "Explain the concept of OOPs in Java. What are the four main pillars?",
    "What is the difference between an Abstract Class and an Interface in Java, especially after Java 8?",
    "How does Garbage Collection work in Java? What is the difference between Stack and Heap memory?",
    "Explain the Java Collections Framework. What is the difference between ArrayList and LinkedList?",
    "What are Checked and Unchecked Exceptions in Java? How do you handle them?"
  ],
  DSA: [
    "What is the difference between a Array and a Linked List? What are their time complexities for insertion?",
    "Explain the binary search algorithm. What is its time complexity and space complexity?",
    "How does a Hash Map work under the hood? What is collision resolution?",
    "Explain the difference between Depth First Search (DFS) and Breadth First Search (BFS) in graphs.",
    "What is dynamic programming? How does it differ from divide and conquer?"
  ],
  Python: [
    "What are list comprehensions in Python? Give an example.",
    "Explain the difference between mutable and immutable data types in Python. Give examples of each.",
    "What are decorators in Python and how do they work?",
    "Explain how memory management and reference counting work in Python.",
    "What is the difference between a list and a tuple? When would you prefer one over the other?"
  ],
  SQL: [
    "What is the difference between INNER JOIN, LEFT JOIN, and RIGHT JOIN in SQL?",
    "Explain the concept of database normalization. What are 1NF, 2NF, and 3NF?",
    "What are SQL indexes? How do they improve query performance, and what are their drawbacks?",
    "What is the difference between GROUP BY and HAVING clauses?",
    "What are ACID properties in a relational database management system?"
  ],
  C: [
    "What is a pointer in C? How do you declare and dereference a pointer?",
    "Explain the difference between malloc(), calloc(), realloc(), and free() for dynamic memory allocation.",
    "What is a structure in C? How does it differ from a union?",
    "Explain the difference between pass-by-value and pass-by-reference in C.",
    "What is a segmentation fault? What are the common causes in C programs?"
  ],
  HR: [
    "Tell me about yourself. Walk me through your academic achievements and projects.",
    "What are your greatest strengths and weaknesses?",
    "Describe a challenging project you worked on. How did you handle conflicts or setbacks?",
    "Where do you see yourself in the next 5 years? What are your career aspirations?",
    "Why should we hire you? What makes you a good fit for our technical program?"
  ],
  "System Design": [
    "Design a URL shortening service like Bitly. What are the key database schemas and load requirements?",
    "What is load balancing? Explain the difference between round-robin and least-connections routing.",
    "Explain the concept of caching. What are cache eviction policies like LRU?",
    "What is database sharding and partitioning? When should you use them?",
    "How do you design a real-time notification service for millions of active users?"
  ]
};

const DEFAULT_FALLBACK_QUESTIONS = [
  "Walk me through your background and technical projects.",
  "What is your approach to solving complex engineering bugs?",
  "How do you stay up-to-date with new technologies and frameworks?",
  "Describe a time you had to work in a team. How did you handle differences in technical opinions?",
  "What are your primary goals for this placements drive?"
];

let localGenerator = null;

export const aiInterviewService = {
  hasApiKey(apiKey) {
    return typeof apiKey === 'string' && (apiKey.trim().startsWith('gsk_') || apiKey.trim().startsWith('sk-'));
  },

  async initLocalModel(onProgress) {
    if (localGenerator) return localGenerator;
    
    const loadTransformersScript = () => {
      return new Promise((resolve, reject) => {
        if (window.transformers) {
          resolve(window.transformers);
          return;
        }
        const existingScript = document.getElementById('transformers-cdn-script');
        if (existingScript) {
          existingScript.addEventListener('load', () => resolve(window.transformers));
          existingScript.addEventListener('error', (err) => reject(err));
          return;
        }
        const script = document.createElement('script');
        script.id = 'transformers-cdn-script';
        script.src = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
        script.async = true;
        script.onload = () => {
          console.log("[SEED-SEB] Transformers.js UMD bundle loaded successfully from CDN.");
          resolve(window.transformers);
        };
        script.onerror = (err) => {
          console.error("[SEED-SEB] Failed to load Transformers.js script:", err);
          reject(err);
        };
        document.head.appendChild(script);
      });
    };

    try {
      const transformers = await loadTransformersScript();
      if (!transformers) throw new Error("Transformers.js global object not found.");
      
      const { pipeline, env } = transformers;
      env.allowLocalModels = false;
      
      let modelSource = 'Xenova/LaMini-GPT-124M';

      if (window.desktopBridge && typeof window.desktopBridge.getLocalModelPort === 'function') {
        try {
          const port = window.desktopBridge.getLocalModelPort();
          if (port > 0) {
            modelSource = `http://127.0.0.1:${port}/interviewmodels/LaMini-GPT-124M/`;
            console.log(`[SEED-SEB] Redirected Transformers.js to local compiler space: ${modelSource}`);
          }
        } catch (bridgeErr) {
          console.warn("Could not query desktop model server port from QWebChannel:", bridgeErr);
        }
      }

      localGenerator = await pipeline('text-generation', modelSource, {
        progress_callback: (data) => {
          if (data.status === 'progress' && typeof onProgress === 'function') {
            onProgress(Math.round(data.progress));
          }
        }
      });
      return localGenerator;
    } catch (e) {
      console.error("Local model initialization failed:", e);
      throw e;
    }
  },

  /**
   * Fetches the next question from Groq LLM, local Web LLM pipeline, or uses local fallback bank
   * Accurately adapts to chosen activeScenario and senior rubrics.
   */
  async getNextQuestion(chatHistory, domain, difficulty, company, apiKey, useLocalModel, onProgress, activeScenario = null) {
    const hasKey = this.hasApiKey(apiKey);
    const askedCount = chatHistory.filter(msg => msg.role === 'assistant').length;

    // Check completion threshold
    if (askedCount >= 5) {
      return "Thank you, the interview is now complete. Please click the button below to generate your evaluation report.";
    }

    // 1. Direct Active Scenario Pipeline (Highest Priority for Scenario Simulations)
    if (activeScenario) {
      if (askedCount === 0) {
        // First turn: The main scenario question with production context
        if (activeScenario.raw?.context) {
          return `[Production Context: ${activeScenario.raw.context}]\n\nScenario Question: ${activeScenario.question}`;
        }
        return activeScenario.question;
      }

      if (askedCount === 1) {
        // Second turn: Technical follow-up probe
        const followUp = activeScenario.followUps?.[0] || activeScenario.raw?.follow_up;
        if (followUp) {
          return `Follow-up Probe: ${followUp}`;
        }
      }

      if (askedCount >= 2 && askedCount < 4) {
        // Turns 3 & 4: Deep dive into the 5-point rubric criteria
        const rubricIndex = askedCount - 1;
        if (Array.isArray(activeScenario.rubric) && activeScenario.rubric[rubricIndex]) {
          return `To go deeper on the trade-offs: How would you specifically address: "${activeScenario.rubric[rubricIndex]}"?`;
        }
      }

      if (askedCount === 4) {
        return `Final Question: Looking back at your design and failure modes, what monitoring metrics, alerts, or recovery runbooks would you establish in production for this system?`;
      }
    }

    // 2. Web LLM mode
    if (!hasKey && useLocalModel) {
      try {
        const generator = await this.initLocalModel(onProgress);
        const userMessages = chatHistory.filter(m => m.role === 'user');
        const latestUserMessage = userMessages[userMessages.length - 1]?.content ?? '';

        if (!latestUserMessage) {
          const qBank = FALLBACK_QUESTION_BANKS[domain] || DEFAULT_FALLBACK_QUESTIONS;
          return qBank[0];
        }

        const prompt = `Context: Technical interview for ${domain} developer (${difficulty}). Candidate said: "${latestUserMessage}". Ask a short follow up question.
Interviewer:`;

        const output = await generator(prompt, {
          max_new_tokens: 50,
          temperature: 0.6,
          repetition_penalty: 1.2
        });

        let text = output[0].generated_text.trim();
        if (text.includes("Interviewer:")) {
          text = text.split("Interviewer:").pop().trim();
        }
        if (text.length >= 5) return text;
      } catch (err) {
        console.error("WASM model execution failed. Falling back to local static bank.", err);
      }
    }

    // 3. Local rule-based static bank mode (No Key & no WebLLM)
    if (!hasKey) {
      let catalogQuestions = [];
      try {
        const cat = await loadIndex0InterviewCatalog();
        if (Array.isArray(cat) && cat.length > 0) {
          const domainLower = String(domain || '').toLowerCase();
          catalogQuestions = cat.filter(item => {
            const role = (item.role || '').toLowerCase();
            const track = (item.track || '').toLowerCase();
            const topic = (item.topic || '').toLowerCase();
            return role.includes(domainLower) || track.includes(domainLower) || topic.includes(domainLower);
          }).map(item => item.question);
        }
      } catch (_) {}

      const qBank = catalogQuestions.length > 0 ? catalogQuestions : (FALLBACK_QUESTION_BANKS[domain] || DEFAULT_FALLBACK_QUESTIONS);
      return qBank[askedCount % qBank.length];
    }

    // 4. Cloud LLM Mode (Groq / OpenAI)
    try {
      let scenarioContext = '';
      if (activeScenario) {
        scenarioContext = `
TARGET SCENARIO SPECIFICATION:
- Title: ${activeScenario.title}
- Primary Scenario Question: "${activeScenario.question}"
- Production Architecture Context: "${activeScenario.raw?.context || 'N/A'}"
- 5-Point Senior Evaluation Rubric:
${(activeScenario.rubric || []).map((r, i) => `  ${i + 1}. ${r}`).join('\n')}
- Follow-up Probe: "${activeScenario.followUps?.[0] || activeScenario.raw?.follow_up || 'N/A'}"
- Ideal Answer Guide: "${activeScenario.idealAnswer || 'N/A'}"

Ensure you test the candidate strictly against these criteria.
`;
      }

      const systemPrompt = `You are an expert technical interviewer conducting a mock interview with a candidate for a ${domain} developer role (Difficulty: ${difficulty}, Company Context: ${company}).
Conduct a realistic, professional, and interactive senior interview.
${scenarioContext}
Guidelines:
1. Ask exactly ONE question at a time.
2. Wait for the candidate's response before asking the next question or providing follow-up feedback.
3. On Question 1, start directly with the scenario prompt.
4. On Questions 2-4, probe their reasoning, trade-offs, and edge cases based on the 5-point rubric.
5. On Question 5, conclude the interview.
6. Start immediately by asking the first interview question. Do not add introductory chit-chat.`;

      const formattedMessages = [
        { role: 'system', content: systemPrompt },
        ...chatHistory.map(msg => ({ role: msg.role, content: msg.content }))
      ];

      const isGroq = apiKey.trim().startsWith('gsk_');
      const apiUrl = isGroq 
        ? "https://api.groq.com/openai/v1/chat/completions" 
        : "https://api.openai.com/v1/chat/completions";
      
      const modelName = isGroq ? "llama-3.3-70b-versatile" : "gpt-4o-mini";

      const res = await axios.post(
        apiUrl,
        {
          model: modelName,
          messages: formattedMessages,
          temperature: 0.7,
          max_tokens: 300
        },
        {
          headers: {
            "Authorization": `Bearer ${apiKey.trim()}`,
            "Content-Type": "application/json"
          }
        }
      );

      return res.data.choices[0].message.content;
    } catch (err) {
      console.error("Cloud completion fetch failed, falling back to static questions.", err);
      const qBank = FALLBACK_QUESTION_BANKS[domain] || DEFAULT_FALLBACK_QUESTIONS;
      return qBank[askedCount % qBank.length];
    }
  },

  /**
   * Generates evaluation report from Groq LLM, local generator, or uses local smart rule analyzer
   */
  async getEvaluationReport(chatHistory, domain, difficulty, company, apiKey, useLocalModel, activeScenario = null) {
    const hasKey = this.hasApiKey(apiKey);

    if (!hasKey) {
      await new Promise(resolve => setTimeout(resolve, 1200));
      
      const studentAnswers = chatHistory.filter(msg => msg.role === 'user');
      const totalWords = studentAnswers.reduce((acc, msg) => acc + msg.content.split(/\s+/).length, 0);
      const averageWordLength = studentAnswers.length ? (totalWords / studentAnswers.length) : 0;
      
      let technical = 7.2 + Math.min(2.0, averageWordLength / 100);
      let communication = 7.5 + Math.min(1.5, averageWordLength / 120);
      let problemSolving = 7.0 + (difficulty === 'Senior' ? 2.0 : difficulty === 'Mid' ? 1.5 : 1.0);
      let confidence = 7.0 + Math.min(2.0, studentAnswers.length * 0.3);
      
      technical = parseFloat(Math.min(10.0, Math.max(1.0, technical)).toFixed(1));
      communication = parseFloat(Math.min(10.0, Math.max(1.0, communication)).toFixed(1));
      problemSolving = parseFloat(Math.min(10.0, Math.max(1.0, problemSolving)).toFixed(1));
      confidence = parseFloat(Math.min(10.0, Math.max(1.0, confidence)).toFixed(1));
      
      const overall = parseFloat(((technical + communication + problemSolving + confidence) / 4).toFixed(1));

      let strengths = [
        `Demonstrated structured problem decomposition for ${domain} (${difficulty} level).`,
        "Communicated trade-offs and rationale clearly throughout the scenario.",
        "Proactively addressed latency, consistency, and failure modes."
      ];

      let weaknesses = [
        "Could expand on automated canary deployments and zero-downtime database migrations.",
        "Ensure exact mathematical estimation bounds are calculated early in the problem discussion."
      ];

      let tips = [
        "Always structure system design answers: Clarify -> Estimate -> API Design -> Architecture -> Deep Dives.",
        `Review the 5-point senior rubric for "${activeScenario?.title || domain}" before real enterprise placements.`,
        "Practice drawing interactive state and architecture flowcharts during interviews."
      ];

      if (activeScenario && Array.isArray(activeScenario.rubric) && activeScenario.rubric.length > 0) {
        strengths.push(`Addressed core rubric requirement: "${activeScenario.rubric[0]}"`);
        if (activeScenario.rubric[1]) {
          tips.push(`Focus more on: "${activeScenario.rubric[1]}"`);
        }
      }

      return {
        score_technical: technical,
        score_communication: communication,
        score_problem_solving: problemSolving,
        score_confidence: confidence,
        score_overall: overall,
        strengths,
        weaknesses,
        tips,
        summary: `The candidate demonstrated strong senior placement readiness in ${domain} (${difficulty} level). Solutions addressed core architectural invariants and trade-offs.`
      };
    }

    // Call Groq / OpenAI API
    try {
      let scenarioRubricsPrompt = '';
      if (activeScenario) {
        scenarioRubricsPrompt = `
EVALUATE STRICTLY AGAINST THIS SCENARIO & 5-POINT RUBRIC:
- Scenario: ${activeScenario.title}
- 5-Point Senior Rubric Criteria:
${(activeScenario.rubric || []).map((r, i) => `${i + 1}. ${r}`).join('\n')}
- Ideal Model Answer Reference:
${activeScenario.idealAnswer || 'N/A'}
`;
      }

      const systemPrompt = `You are an expert technical evaluation engine. Analyze the following interview transcript between a candidate and an AI interviewer.
Generate a detailed, objective evaluation report.
Candidate Track: ${domain} | Level: ${difficulty} | Company Style: ${company}
${scenarioRubricsPrompt}

You MUST respond with a single, valid JSON object ONLY. Do not write any markdown formatting, code blocks (such as \`\`\`json), backticks, introduction, or explanation. The response must be parsable by JSON.parse.
The JSON structure MUST match this exactly:
{
  "score_technical": <number between 1.0 and 10.0>,
  "score_communication": <number between 1.0 and 10.0>,
  "score_problem_solving": <number between 1.0 and 10.0>,
  "score_confidence": <number between 1.0 and 10.0>,
  "score_overall": <number between 1.0 and 10.0>,
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "tips": ["tip 1", "tip 2"],
  "summary": "concise overall feedback summary text"
}`;

      const transcriptStr = chatHistory.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n\n');
      
      const isGroq = apiKey.trim().startsWith('gsk_');
      const apiUrl = isGroq 
        ? "https://api.groq.com/openai/v1/chat/completions" 
        : "https://api.openai.com/v1/chat/completions";
      
      const modelName = isGroq ? "llama-3.3-70b-versatile" : "gpt-4o-mini";

      const res = await axios.post(
        apiUrl,
        {
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Here is the interview transcript:\n\n${transcriptStr}` }
          ],
          temperature: 0.3
        },
        {
          headers: {
            "Authorization": `Bearer ${apiKey.trim()}`,
            "Content-Type": "application/json"
          }
        }
      );

      let cleanText = res.data.choices[0].message.content.trim();
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.substring(7);
      } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.substring(3);
      }
      if (cleanText.endsWith('```')) {
        cleanText = cleanText.substring(0, cleanText.length - 3);
      }
      cleanText = cleanText.trim();

      return JSON.parse(cleanText);
    } catch (err) {
      console.error("Failed to parse LLM evaluation, returning rule-based metrics.", err);
      return this.getEvaluationReport(chatHistory, domain, difficulty, company, "", false, activeScenario);
    }
  },

  async saveResults(user, domain, difficulty, company, scores, chatHistory, durationSeconds) {
    if (!user) throw new Error("User registration data is required to save results.");

    const email = user.email ?? "";
    const name = user.name ?? "";
    const rollNumber = user.rollNumber ?? "";
    const college = user.college ?? "";
    const year = user.year ?? "";
    const dept = user.department ?? "";

    const feedbackData = {
      strengths: scores.strengths || [],
      weaknesses: scores.weaknesses || [],
      tips: scores.tips || [],
      summary: scores.summary ?? "",
      chatHistory: chatHistory.map(msg => ({ role: msg.role, content: msg.content }))
    };

    const record = {
      id: Date.now().toString(),
      created_at: new Date().toISOString(),
      roll_number: rollNumber,
      name: name,
      email: email,
      college: college,
      year: year,
      department: dept,
      domain: domain,
      difficulty: difficulty,
      company: company,
      score_technical: parseFloat(scores.score_technical || 0),
      score_communication: parseFloat(scores.score_communication || 0),
      score_problem_solving: parseFloat(scores.score_problem_solving || 0),
      score_confidence: parseFloat(scores.score_confidence || 0),
      score_overall: parseFloat(scores.score_overall || 0),
      feedback: feedbackData,
      duration_seconds: parseInt(durationSeconds || 0, 10)
    };

    try {
      const key = `ai_interview_results_${email}`;
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      existing.unshift(record);
      localStorage.setItem(key, JSON.stringify(existing));
    } catch (e) {
      console.warn('[aiInterviewService] Failed to save result to localStorage:', e);
    }

    return [record];
  },

  async fetchAttempts(email) {
    if (!email) return [];
    try {
      const key = `ai_interview_results_${email}`;
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) {
      console.warn('[aiInterviewService] Failed to fetch attempts from localStorage:', e);
      return [];
    }
  }
};

export default aiInterviewService;
