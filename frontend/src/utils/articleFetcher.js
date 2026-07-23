/**
 * articleFetcher.js
 * Helper utility to fetch article JSONs and Course Mapping files from GitHub seed-contents repo,
 * with local fallback support.
 */

const GITHUB_ARTICLES_BASE = 'https://raw.githubusercontent.com/seeditDev/seed-contents/main/articles';
const LOCAL_SEED_ARTICLES_BASE = '/seed-contents/articles';
const LOCAL_ARTICLES_BASE = '/articles';

/**
 * Clean path helper to ensure relative path without leading slashes or 'articles/' prefix.
 */
function normalizeArticlePath(relativePath) {
  if (!relativePath) return '';
  let cleaned = relativePath.trim();
  cleaned = cleaned.replace(/^\/+/, '');
  if (cleaned.startsWith('articles/')) {
    cleaned = cleaned.replace(/^articles\//, '');
  }
  return cleaned;
}

/**
 * Fetch an article or syllabus mapping JSON using GitHub seed-contents primary URL,
 * with local fallback options.
 * @param {string} relativePath - e.g. 'CourseMappingFiles/learn-c-syllabus.json' or 'find-the-largest-element-in-an-array.json'
 * @returns {Promise<Response>} Fetch Response object
 */
export async function fetchArticleFile(relativePath) {
  const cleanPath = normalizeArticlePath(relativePath);
  
  // 1. Primary: GitHub Raw (seed-contents/main/articles/...)
  const githubUrl = `${GITHUB_ARTICLES_BASE}/${cleanPath}`;
  try {
    const res = await fetch(githubUrl);
    if (res.ok) return res;
  } catch (_) {}

  // 2. Local Fallback: /seed-contents/articles/...
  const localSeedUrl = `${LOCAL_SEED_ARTICLES_BASE}/${cleanPath}`;
  try {
    const res = await fetch(localSeedUrl);
    if (res.ok) return res;
  } catch (_) {}

  // 3. Legacy Fallback: /articles/...
  const legacyUrl = `${LOCAL_ARTICLES_BASE}/${cleanPath}`;
  return await fetch(legacyUrl);
}

/**
 * Fetch and parse JSON directly from GitHub seed-contents articles repo.
 */
export async function fetchArticleJson(relativePath) {
  const response = await fetchArticleFile(relativePath);
  if (!response.ok) {
    throw new Error(`Failed to load article ${relativePath}: HTTP ${response.status}`);
  }
  return await response.json();
}
