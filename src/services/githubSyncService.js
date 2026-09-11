/**
 * githubSyncService.js — SEED-IT GitHub Sync Engine
 *
 * Provides one-way synchronization of solved coding problems to the student's
 * personal GitHub repository. Each commit is authored under the user's GitHub identity
 * to illuminate their GitHub Contribution Heatmap and maintain an interview-grade portfolio.
 *
 * Hierarchy:
 *   <repo-name>/
 *   ├── README.md                      # Dynamic portfolio readme with stats, badges & recent activity
 *   ├── .seed-tracker.json              # Sync manifest (tracks solved question IDs, file hashes, timestamps)
 *   └── Problems/
 *       └── <Category-Slug>/
 *           └── <QId>-<Title-Slug>/
 *               ├── README.md          # Problem statement, examples, constraints, tags
 *               └── solution.<ext>     # Solution source code with metadata header
 */

import { db, auth } from '../lib/firebase-config';
import { collection, getDocs, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { GithubAuthProvider, linkWithPopup, signInWithPopup } from 'firebase/auth';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration Keys & Storage Helpers
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEYS = {
  PAT: 'seed_github_pat',
  USERNAME: 'seed_github_username',
  NAME: 'seed_github_name',
  EMAIL: 'seed_github_email',
  AVATAR: 'seed_github_avatar',
  REPO: 'seed_github_repo',
  IS_PRIVATE: 'seed_github_is_private',
  AUTO_SYNC: 'seed_github_auto_sync',
  LAST_SYNC: 'seed_github_last_sync',
  AUTH_METHOD: 'seed_github_auth_method',
};

export const DEFAULT_REPO_NAME = 'seed-it-solutions';

export function getGitHubConfig() {
  const token = localStorage.getItem(STORAGE_KEYS.PAT) || '';
  const username = localStorage.getItem(STORAGE_KEYS.USERNAME) || '';
  const repo = localStorage.getItem(STORAGE_KEYS.REPO) || DEFAULT_REPO_NAME;
  const autoSync = localStorage.getItem(STORAGE_KEYS.AUTO_SYNC) !== 'false';
  const name = localStorage.getItem(STORAGE_KEYS.NAME) || username;
  const email = localStorage.getItem(STORAGE_KEYS.EMAIL) || '';
  const avatar = localStorage.getItem(STORAGE_KEYS.AVATAR) || '';
  const isPrivate = localStorage.getItem(STORAGE_KEYS.IS_PRIVATE) === 'true';
  const authMethod = localStorage.getItem(STORAGE_KEYS.AUTH_METHOD) || 'pat';

  return {
    token,
    username,
    name,
    email,
    avatar,
    repo,
    autoSync,
    isPrivate,
    authMethod,
    isConnected: Boolean(token && username),
  };
}

export function saveGitHubConfig(config) {
  if (config.token !== undefined) localStorage.setItem(STORAGE_KEYS.PAT, config.token.trim());
  if (config.username !== undefined) localStorage.setItem(STORAGE_KEYS.USERNAME, config.username.trim());
  if (config.name !== undefined) localStorage.setItem(STORAGE_KEYS.NAME, config.name.trim());
  if (config.email !== undefined) localStorage.setItem(STORAGE_KEYS.EMAIL, config.email.trim());
  if (config.avatar !== undefined) localStorage.setItem(STORAGE_KEYS.AVATAR, config.avatar.trim());
  if (config.repo !== undefined) localStorage.setItem(STORAGE_KEYS.REPO, (config.repo || DEFAULT_REPO_NAME).trim());
  if (config.autoSync !== undefined) localStorage.setItem(STORAGE_KEYS.AUTO_SYNC, String(config.autoSync));
  if (config.isPrivate !== undefined) localStorage.setItem(STORAGE_KEYS.IS_PRIVATE, String(config.isPrivate));
  if (config.authMethod !== undefined) localStorage.setItem(STORAGE_KEYS.AUTH_METHOD, String(config.authMethod));
}

export function clearGitHubConfig() {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
}

/**
 * Loads the user's private GitHub Sync settings from Firestore (users/{uid}/settings/githubSync).
 * Never exposed to public profiles, leaderboards, or student lists.
 */
export async function fetchGitHubConfigFromFirestore(uid) {
  if (!uid) return getGitHubConfig();
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'settings', 'githubSync'));
    if (snap.exists()) {
      const d = snap.data() || {};
      const config = {
        token: d.token || '',
        username: d.username || '',
        name: d.name || '',
        email: d.email || '',
        avatar: d.avatarUrl || d.avatar || '',
        repo: d.repo || DEFAULT_REPO_NAME,
        autoSync: d.autoSync !== false,
        isPrivate: Boolean(d.isPrivate),
        authMethod: d.authMethod || 'pat',
        isConnected: Boolean(d.token && d.username),
      };
      saveGitHubConfig(config);
      return config;
    }
  } catch (err) {
    console.warn('[githubSyncService] Could not read githubSync from Firestore:', err);
  }
  return getGitHubConfig();
}

/**
 * Persists the user's GitHub Sync settings to their private Firestore document (users/{uid}/settings/githubSync).
 */
export async function saveGitHubConfigToFirestore(uid, config) {
  saveGitHubConfig(config);
  if (!uid) return;
  try {
    await setDoc(
      doc(db, 'users', uid, 'settings', 'githubSync'),
      {
        token: config.token || '',
        username: config.username || '',
        name: config.name || '',
        email: config.email || '',
        avatarUrl: config.avatar || '',
        repo: config.repo || DEFAULT_REPO_NAME,
        autoSync: config.autoSync !== false,
        isPrivate: Boolean(config.isPrivate),
        authMethod: config.authMethod || 'pat',
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('[githubSyncService] Could not persist githubSync to Firestore:', err);
  }
}

/**
 * Clears the user's private GitHub credentials from Firestore and localStorage.
 */
export async function clearGitHubConfigFromFirestore(uid) {
  clearGitHubConfig();
  if (!uid) return;
  try {
    await setDoc(
      doc(db, 'users', uid, 'settings', 'githubSync'),
      {
        token: '',
        username: '',
        name: '',
        email: '',
        avatarUrl: '',
        isConnected: false,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('[githubSyncService] Could not clear githubSync in Firestore:', err);
  }
}

/**
 * Connect with GitHub via Firebase OAuth Popup (NO PAT REQUIRED).
 */
export async function connectWithGitHubOAuth(uid, repoName = DEFAULT_REPO_NAME, isPrivate = false) {
  const provider = new GithubAuthProvider();
  provider.addScope('repo');

  let token = null;
  let credential = null;

  try {
    if (auth.currentUser && !auth.currentUser.isAnonymous) {
      const result = await linkWithPopup(auth.currentUser, provider);
      credential = GithubAuthProvider.credentialFromResult(result);
      token = credential?.accessToken;
    } else {
      const result = await signInWithPopup(auth, provider);
      credential = GithubAuthProvider.credentialFromResult(result);
      token = credential?.accessToken;
    }
  } catch (authErr) {
    if (
      authErr.code === 'auth/credential-already-in-use' ||
      authErr.code === 'auth/provider-already-linked' ||
      authErr.code === 'auth/account-exists-with-different-credential'
    ) {
      const result = await signInWithPopup(auth, provider);
      credential = GithubAuthProvider.credentialFromResult(result);
      token = credential?.accessToken;
    } else {
      throw authErr;
    }
  }

  if (!token) {
    throw new Error('Failed to obtain GitHub OAuth token. Please verify permissions or enter a PAT.');
  }

  const profile = await verifyGitHubToken(token);
  const cleanRepo = repoName || DEFAULT_REPO_NAME;
  await getOrCreateRepo(token, profile.username, cleanRepo, isPrivate);

  const config = {
    token,
    username: profile.username,
    name: profile.name,
    email: profile.email,
    avatar: profile.avatarUrl,
    repo: cleanRepo,
    isPrivate,
    autoSync: true,
    authMethod: 'oauth',
  };

  await saveGitHubConfigToFirestore(uid, config);
  return config;
}

// ─────────────────────────────────────────────────────────────────────────────
// UTF-8 Base64 Encoders & Text Utilities
// ─────────────────────────────────────────────────────────────────────────────

function toBase64Utf8(str) {
  return btoa(unescape(encodeURIComponent(str || '')));
}

function fromBase64Utf8(base64Str) {
  try {
    return decodeURIComponent(escape(atob(base64Str.replace(/\s/g, ''))));
  } catch {
    return atob(base64Str.replace(/\s/g, ''));
  }
}

export function slugify(str) {
  if (!str) return 'general';
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getLangExtension(lang) {
  const clean = String(lang || '').toLowerCase().trim();
  switch (clean) {
    case 'python':
    case 'python3':
    case 'py':
      return 'py';
    case 'cpp':
    case 'c++':
      return 'cpp';
    case 'c':
      return 'c';
    case 'java':
      return 'java';
    case 'javascript':
    case 'js':
      return 'js';
    case 'typescript':
    case 'ts':
      return 'ts';
    default:
      return 'txt';
  }
}

export function getSolutionFileName(lang) {
  const ext = getLangExtension(lang);
  if (ext === 'java') return 'Solution.java';
  return `solution.${ext}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub REST API Integration
// ─────────────────────────────────────────────────────────────────────────────

const GITHUB_API_BASE = 'https://api.github.com';

function getHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

/**
 * Verify GitHub Personal Access Token and fetch profile details.
 */
export async function verifyGitHubToken(token) {
  const cleanToken = (token || '').trim();
  if (!cleanToken) {
    throw new Error('Please enter a valid GitHub Personal Access Token.');
  }

  const res = await fetch(`${GITHUB_API_BASE}/user`, {
    headers: getHeaders(cleanToken),
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Invalid or expired Personal Access Token. Please check your token.');
    }
    if (res.status === 403) {
      throw new Error('GitHub API rate limit exceeded or token lacks required permissions.');
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || `GitHub error: ${res.statusText}`);
  }

  const data = await res.json();
  let email = data.email || '';

  // If primary email is private, attempt fetching from /user/emails
  if (!email) {
    try {
      const emailRes = await fetch(`${GITHUB_API_BASE}/user/emails`, {
        headers: getHeaders(cleanToken),
      });
      if (emailRes.ok) {
        const emails = await emailRes.json();
        const primary = emails.find((e) => e.primary && e.verified) || emails[0];
        if (primary) email = primary.email;
      }
    } catch {
      // Non-fatal: email fallback to no-reply
    }
  }

  if (!email) {
    email = `${data.id}+${data.login}@users.noreply.github.com`;
  }

  return {
    username: data.login,
    name: data.name || data.login,
    email,
    avatarUrl: data.avatar_url,
    publicRepos: data.public_repos,
    totalPrivateRepos: data.total_private_repos || 0,
  };
}

/**
 * Ensures the target repository exists, creating it if necessary.
 */
export async function getOrCreateRepo(token, owner, repoName, isPrivate = false) {
  const cleanRepo = slugify(repoName || DEFAULT_REPO_NAME);

  // Check if repository exists
  const checkRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${cleanRepo}`, {
    headers: getHeaders(token),
  });

  if (checkRes.ok) {
    const repoData = await checkRes.json();
    return {
      repoName: cleanRepo,
      htmlUrl: repoData.html_url,
      defaultBranch: repoData.default_branch || 'main',
      isNew: false,
    };
  }

  if (checkRes.status === 404) {
    // Repository does not exist -> create it automatically
    const createRes = await fetch(`${GITHUB_API_BASE}/user/repos`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({
        name: cleanRepo,
        description: '⚡ Problem solving solutions & algorithmic tracks — Synced from SEED-IT Platform',
        private: Boolean(isPrivate),
        auto_init: true,
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      throw new Error(`Failed to create repository "${cleanRepo}": ${err.message || createRes.statusText}`);
    }

    const created = await createRes.json();
    return {
      repoName: cleanRepo,
      htmlUrl: created.html_url,
      defaultBranch: created.default_branch || 'main',
      isNew: true,
    };
  }

  const err = await checkRes.json().catch(() => ({}));
  throw new Error(`Error accessing repository "${cleanRepo}": ${err.message || checkRes.statusText}`);
}

/**
  * Alias for getOrCreateRepo for dashboard backwards-compatibility.
  */
export const createRepository = getOrCreateRepo;

/**
  * Convenience alias to save personal access token.
  */
export const saveGitHubPat = (token) => saveGitHubConfig({ token, authMethod: 'pat' });

/**
  * Disconnect GitHub integration and wipe local config.
  */
export const disconnectGitHub = clearGitHubConfig;

/**
  * Verify GitHub token and credentials.
  */
export const testGitHubConnection = verifyGitHubToken;

/**
  * Fetch list of user's personal repositories.
  */
export async function fetchUserRepositories(token) {
  if (!token) return [];
  try {
    const res = await fetch(`${GITHUB_API_BASE}/user/repos?sort=updated&per_page=100`, {
      headers: getHeaders(token),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[githubSyncService] fetchUserRepositories error:', err);
    return [];
  }
}


/**
 * Fetch a file from the repository to get its current content and SHA.
 */
export async function getRepoFile(token, owner, repo, path) {
  const res = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}`, {
    headers: getHeaders(token),
  });

  if (res.status === 404) {
    return { exists: false, sha: null, content: null };
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed reading ${path}: ${err.message || res.statusText}`);
  }

  const data = await res.json();
  return {
    exists: true,
    sha: data.sha,
    content: data.content ? fromBase64Utf8(data.content) : '',
  };
}

/**
 * Create or update a file in the repository.
 */
export async function putRepoFile(token, owner, repo, path, contentStr, commitMessage, sha = null, author = null) {
  const bodyPayload = {
    message: commitMessage,
    content: toBase64Utf8(contentStr),
  };

  if (sha) {
    bodyPayload.sha = sha;
  }

  if (author && author.name && author.email) {
    bodyPayload.committer = {
      name: author.name,
      email: author.email,
    };
    bodyPayload.author = {
      name: author.name,
      email: author.email,
    };
  }

  const res = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: getHeaders(token),
    body: JSON.stringify(bodyPayload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed committing ${path}: ${err.message || res.statusText}`);
  }

  const data = await res.json();
  return {
    commitSha: data.commit?.sha,
    commitUrl: data.commit?.html_url,
    contentUrl: data.content?.html_url,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Content & README Generators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prepend a structured header comment to user solution code.
 */
export function formatSolutionCode(code, language, question, stats = {}) {
  const cleanCode = (code || '').trim();
  const qId = question?.questionId || question?.id || 'Q';
  const qTitle = question?.title || question?.name || 'Problem';
  const qDiff = question?.difficulty || 'Medium';
  const qCat = question?.category || 'General';
  const dateStr = new Date().toISOString().split('T')[0];
  const langKey = String(language || 'python3').toLowerCase();
  const isPython = langKey.includes('py');

  const testsPassed = stats.testsPassed ?? stats.passedTests;
  const testsTotal = stats.totalTests ?? stats.testsTotal;
  const score = stats.score !== undefined ? `${stats.score}%` : '100%';

  const statsLine = testsPassed !== undefined && testsTotal !== undefined
    ? `Test Cases: ${testsPassed} / ${testsTotal} Passed (${score})`
    : `Score: ${score}`;

  if (isPython) {
    return `"""
Problem: ${qId} - ${qTitle}
Category: ${qCat}
Difficulty: ${qDiff}
Platform: SEED-IT Platform (https://seed-it.com)
Date Solved: ${dateStr}
Language: ${language}
${statsLine}
"""

${cleanCode}
`;
  }

  return `/**
 * Problem: ${qId} - ${qTitle}
 * Category: ${qCat}
 * Difficulty: ${qDiff}
 * Platform: SEED-IT Platform (https://seed-it.com)
 * Date Solved: ${dateStr}
 * Language: ${language}
 * ${statsLine}
 */

${cleanCode}
`;
}

/**
 * Generate formatted Markdown README for the individual problem folder.
 */
export function formatProblemReadme(question) {
  const qId = question?.questionId || question?.id || 'Q';
  const qTitle = question?.title || question?.name || 'Problem';
  const qDiff = question?.difficulty || 'Medium';
  const qCat = question?.category || 'General';
  const description = question?.description || question?.problemStatement || 'No description provided.';
  const sampleTestCases = question?.testCases?.sample || question?.sampleTestCases || [];
  const constraints = question?.constraints || [];
  const tags = question?.tags || [qCat];

  let diffBadgeColor = 'orange';
  if (qDiff.toLowerCase() === 'easy' || qDiff.toLowerCase() === 'beginner') diffBadgeColor = 'brightgreen';
  else if (qDiff.toLowerCase() === 'hard') diffBadgeColor = 'red';

  let md = `# [${qId}] ${qTitle}\n\n`;
  md += `![Difficulty](https://img.shields.io/badge/Difficulty-${encodeURIComponent(qDiff)}-${diffBadgeColor}?style=flat-square) `;
  md += `![Category](https://img.shields.io/badge/Category-${encodeURIComponent(qCat)}-blue?style=flat-square) `;
  md += `![Platform](https://img.shields.io/badge/Platform-SEED--IT-indigo?style=flat-square)\n\n`;

  md += `## 📝 Problem Statement\n\n${description}\n\n`;

  if (Array.isArray(sampleTestCases) && sampleTestCases.length > 0) {
    md += `## 🧪 Examples\n\n`;
    sampleTestCases.forEach((tc, idx) => {
      md += `### Example ${idx + 1}\n\n`;
      md += `**Input:**\n\`\`\`text\n${tc.input || '(None)'}\n\`\`\`\n\n`;
      md += `**Expected Output:**\n\`\`\`text\n${tc.expected || tc.expectedOutput || ''}\n\`\`\`\n\n`;
      if (tc.explanation) {
        md += `**Explanation:** ${tc.explanation}\n\n`;
      }
    });
  }

  if (Array.isArray(constraints) && constraints.length > 0) {
    md += `## ⚠️ Constraints\n\n`;
    constraints.forEach((c) => {
      md += `- ${c}\n`;
    });
    md += `\n`;
  }

  if (Array.isArray(tags) && tags.length > 0) {
    md += `## 🏷️ Tags\n\n`;
    tags.forEach((t) => {
      md += `\`${t}\` `;
    });
    md += `\n\n`;
  }

  md += `---\n*Solved on [SEED-IT Platform](https://seed-it.com).*\n`;
  return md;
}

/**
 * Generate root portfolio README.md with summary counters and interactive indexes.
 */
export function generateRootReadme(manifest) {
  const problems = Object.values(manifest.problems || {}).sort(
    (a, b) => new Date(b.lastSolvedAt).getTime() - new Date(a.lastSolvedAt).getTime()
  );

  const total = problems.length;
  let easy = 0;
  let medium = 0;
  let hard = 0;
  const langCounts = {};
  const categoryMap = {};

  problems.forEach((p) => {
    const diff = (p.difficulty || 'Medium').toLowerCase();
    if (diff === 'easy' || diff === 'beginner') easy++;
    else if (diff === 'hard') hard++;
    else medium++;

    (p.languages || []).forEach((l) => {
      const normL = l.toLowerCase();
      langCounts[normL] = (langCounts[normL] || 0) + 1;
    });

    const cat = p.category || 'General';
    if (!categoryMap[cat]) categoryMap[cat] = [];
    categoryMap[cat].push(p);
  });

  let md = `# ⚡ SEED-IT Problem Solving Portfolio\n\n`;
  md += `Automated problem solving repository and day-to-day coding tracks powered by [SEED-IT Platform](https://seed-it.com).\n\n`;

  md += `## 📊 Progress & Statistics\n\n`;
  md += `![Total Solved](https://img.shields.io/badge/Solved-${total}%20Problems-blue?style=for-the-badge&logo=codeforces) `;
  md += `![Easy](https://img.shields.io/badge/Easy-${easy}-brightgreen?style=for-the-badge) `;
  md += `![Medium](https://img.shields.io/badge/Medium-${medium}-orange?style=for-the-badge) `;
  md += `![Hard](https://img.shields.io/badge/Hard-${hard}-red?style=for-the-badge)\n\n`;

  if (Object.keys(langCounts).length > 0) {
    md += `### 💻 Languages Breakdown\n\n`;
    Object.entries(langCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([lang, cnt]) => {
        md += `- **${lang.toUpperCase()}**: ${cnt} solution${cnt > 1 ? 's' : ''}\n`;
      });
    md += `\n`;
  }

  md += `## 📅 Recent Activity (Day-to-Day Solving Log)\n\n`;
  md += `| Date | Problem | Category | Difficulty | Languages | Folder |\n`;
  md += `| :--- | :--- | :--- | :---: | :---: | :---: |\n`;

  const recent = problems.slice(0, 20);
  if (recent.length === 0) {
    md += `| — | *No problems synced yet* | — | — | — | — |\n`;
  } else {
    recent.forEach((p) => {
      const dStr = p.lastSolvedAt ? p.lastSolvedAt.split('T')[0] : '—';
      const langs = (p.languages || []).join(', ');
      md += `| ${dStr} | [${p.questionId} - ${p.title}](./${p.folderPath}) | ${p.category} | \`${p.difficulty}\` | ${langs} | [View](./${p.folderPath}) |\n`;
    });
  }
  md += `\n`;

  md += `## 📂 Problem Index by Topic\n\n`;
  Object.keys(categoryMap)
    .sort()
    .forEach((cat) => {
      const list = categoryMap[cat];
      md += `<details>\n<summary><b>📁 ${cat} (${list.length} Problem${list.length > 1 ? 's' : ''})</b></summary>\n\n`;
      list.forEach((p) => {
        md += `- [${p.questionId} - ${p.title}](./${p.folderPath}) — \`${p.difficulty}\`\n`;
      });
      md += `\n</details>\n\n`;
    });

  md += `---\n*Maintained automatically by SEED-IT GitHub Sync.*\n`;
  return md;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Push Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pushes a single solved problem solution and updates repository documentation.
 *
 * @param {object} question       - Problem definition object
 * @param {string} code           - Code submitted by the student
 * @param {string} language       - Programming language string (e.g. 'python3', 'cpp', 'java')
 * @param {object} [stats]        - { testsPassed, totalTests, score }
 * @param {object} [customConfig] - Optional override of stored GitHub config
 * @returns {Promise<object>}     - { success: true, commitUrl, fileUrl, repoUrl, problemPath }
 */
export async function pushProblemSolution(question, code, language, stats = {}, customConfig = null) {
  const config = customConfig || getGitHubConfig();
  if (!config.isConnected) {
    throw new Error('GitHub is not connected. Please connect your GitHub account in Settings.');
  }

  const { token, username, name, email, repo, isPrivate } = config;
  const authorInfo = { name: name || username, email: email || `${username}@users.noreply.github.com` };

  // 1. Ensure target repo exists
  const repoInfo = await getOrCreateRepo(token, username, repo, isPrivate);

  // 2. Compute canonical folder & file paths
  const qId = question?.questionId || question?.id || 'Q';
  const qTitle = question?.title || question?.name || 'Problem';
  const qCat = question?.category || 'General';
  const qDiff = question?.difficulty || 'Medium';

  const catSlug = slugify(qCat);
  const probSlug = `${slugify(qId)}-${slugify(qTitle)}`;
  const folderPath = `Problems/${catSlug}/${probSlug}`;

  const fileName = getSolutionFileName(language);
  const solutionFilePath = `${folderPath}/${fileName}`;
  const readmeFilePath = `${folderPath}/README.md`;

  // 3. Format solution code with top metadata header
  const formattedCode = formatSolutionCode(code, language, question, stats);

  // 4. Commit Solution Code File
  const existingCode = await getRepoFile(token, username, repo, solutionFilePath);
  const commitMsg = `Solve: [${qId}] ${qTitle} (${qDiff}) - ${language.toUpperCase()} | SEED-IT`;

  const codeCommit = await putRepoFile(
    token,
    username,
    repo,
    solutionFilePath,
    formattedCode,
    commitMsg,
    existingCode.sha,
    authorInfo
  );

  // 5. Commit Problem README.md if not already present or updated
  const existingReadme = await getRepoFile(token, username, repo, readmeFilePath);
  const problemReadmeContent = formatProblemReadme(question);
  await putRepoFile(
    token,
    username,
    repo,
    readmeFilePath,
    problemReadmeContent,
    `Docs: [${qId}] ${qTitle} Problem Statement | SEED-IT`,
    existingReadme.sha,
    authorInfo
  );

  // 6. Update Manifest (.seed-tracker.json) and Root Portfolio README.md
  try {
    const manifestFile = await getRepoFile(token, username, repo, '.seed-tracker.json');
    let manifest = { version: '1.0.0', lastSynced: new Date().toISOString(), problems: {} };
    if (manifestFile.exists && manifestFile.content) {
      try {
        manifest = JSON.parse(manifestFile.content);
      } catch {
        // Fallback to fresh manifest
      }
    }

    const cleanQKey = String(qId).trim();
    const existingEntry = manifest.problems[cleanQKey] || {};
    const existingLangs = new Set(existingEntry.languages || []);
    existingLangs.add(language);

    manifest.problems[cleanQKey] = {
      questionId: cleanQKey,
      title: qTitle,
      category: qCat,
      difficulty: qDiff,
      folderPath,
      languages: Array.from(existingLangs),
      lastSolvedAt: new Date().toISOString(),
    };
    manifest.lastSynced = new Date().toISOString();

    // Commit updated manifest
    await putRepoFile(
      token,
      username,
      repo,
      '.seed-tracker.json',
      JSON.stringify(manifest, null, 2),
      `Update sync manifest: [${qId}] | SEED-IT`,
      manifestFile.sha,
      authorInfo
    );

    // Commit updated root README.md
    const rootReadmeFile = await getRepoFile(token, username, repo, 'README.md');
    const newRootReadme = generateRootReadme(manifest);
    await putRepoFile(
      token,
      username,
      repo,
      'README.md',
      newRootReadme,
      `Update portfolio index: [${qId}] ${qTitle} | SEED-IT`,
      rootReadmeFile.sha,
      authorInfo
    );
  } catch (manifestErr) {
    console.warn('[githubSyncService] Manifest/Root Readme update notice:', manifestErr);
    // Non-fatal: solution file commit was already successful
  }

  localStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());

  return {
    success: true,
    commitSha: codeCommit.commitSha,
    commitUrl: codeCommit.commitUrl,
    fileUrl: codeCommit.contentUrl,
    repoUrl: repoInfo.htmlUrl,
    problemPath: folderPath,
  };
}

/**
 * Convenience wrapper to sync a single solved problem to GitHub.
 * Automatically loads user's private configuration from Firestore if needed.
 */
export async function syncSolvedProblemToGitHub(uid, problemData) {
  try {
    const config = uid ? await fetchGitHubConfigFromFirestore(uid) : getGitHubConfig();
    if (!config || !config.isConnected) {
      return { success: false, message: 'GitHub not connected' };
    }

    const question = {
      questionId: problemData.questionId || problemData.id,
      id: problemData.questionId || problemData.id,
      title: problemData.title || problemData.questionTitle || 'Solved Problem',
      difficulty: problemData.difficulty || 'Medium',
      category: problemData.category || 'Practice',
      description: problemData.description || `Solution for ${problemData.title || problemData.questionId}.`,
      testCases: problemData.testCases
    };

    return await pushProblemSolution(
      question,
      problemData.code,
      problemData.language || 'python3',
      { score: 100 },
      config
    );
  } catch (err) {
    console.warn('[githubSyncService] syncSolvedProblemToGitHub error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Batch-syncs all accepted solutions previously recorded in Firestore for this student.
 */
export async function batchSyncAllSolved(uid, onProgress = null) {
  const config = getGitHubConfig();
  if (!config.isConnected) {
    throw new Error('GitHub is not connected.');
  }

  // Read solutions from userSolutions/{uid}/solutions
  const solutionsRef = collection(db, `userSolutions/${uid}/solutions`);
  const snapshot = await getDocs(solutionsRef);

  if (snapshot.empty) {
    return { synced: 0, total: 0, message: 'No accepted solutions found to sync.' };
  }

  const docs = snapshot.docs.map((d) => d.data()).filter((d) => d.code && d.questionId);
  const total = docs.length;
  let synced = 0;
  let errors = 0;

  for (let i = 0; i < total; i++) {
    const s = docs[i];
    if (onProgress) {
      onProgress({ current: i + 1, total, currentQuestion: s.questionTitle || s.questionId });
    }

    try {
      const mockQ = {
        questionId: s.questionId,
        id: s.questionId,
        title: s.questionTitle || s.questionId,
        category: s.category || 'Practice',
        difficulty: s.difficulty || 'Medium',
        description: s.description || `Solution for ${s.questionTitle || s.questionId}.`,
      };

      await pushProblemSolution(
        mockQ,
        s.code,
        s.language || 'python3',
        { score: 100, testsPassed: s.testsPassed, totalTests: s.testsTotal },
        config
      );
      synced++;
      // Polite rate delay between batch commits
      await new Promise((resolve) => setTimeout(resolve, 600));
    } catch (e) {
      console.warn(`[githubSyncService] Failed syncing ${s.questionId}:`, e);
      errors++;
    }
  }

  return { synced, errors, total };
}
