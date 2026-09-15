/**
 * articleFetcher.js
 * Helper utility to fetch article JSONs and Course Mapping files directly from GitHub seed-contents repo,
 * with local fallback support.
 */

/**
 * Clean path helper to ensure relative path without leading slashes.
 */
export function normalizeArticlePath(relativePath) {
  if (!relativePath) return '';
  let cleaned = relativePath.trim().replace(/^\/+/, '');
  if (cleaned.startsWith('articles/')) {
    cleaned = cleaned.replace(/^articles\//, '');
  }
  return cleaned;
}

/**
 * Fetch an article or syllabus mapping JSON strictly from local /seed-contents/ or /articles/
 * @param {string} relativePath - e.g. 'CourseMappingFiles/learn-c-syllabus.json' or 'seed-contents/coding/learn-c-syllabus.json'
 * @returns {Promise<Response>} Fetch Response object
 */
export async function fetchArticleFile(relativePath) {
  if (!relativePath) return null;
  const rawPath = relativePath.trim().replace(/^\/+/, '');

  const candidatePaths = [];
  if (rawPath.startsWith('seed-contents/')) {
    candidatePaths.push(`/${rawPath}`);
    candidatePaths.push(`/${rawPath.replace(/^seed-contents\//, '')}`);
  } else if (rawPath.startsWith('articles/')) {
    candidatePaths.push(`/${rawPath}`);
    candidatePaths.push(`/seed-contents/${rawPath}`);
  } else {
    candidatePaths.push(`/seed-contents/${rawPath}`);
    candidatePaths.push(`/seed-contents/articles/${rawPath}`);
    candidatePaths.push(`/articles/${rawPath}`);
    candidatePaths.push(`/${rawPath}`);
  }

  for (const p of candidatePaths) {
    try {
      const res = await fetch(p);
      if (res.ok) return res;
    } catch (_) {}
  }

  return null;
}

/**
 * Fetch and parse JSON directly from GitHub seed-contents articles repo.
 */
export async function fetchArticleJson(relativePath) {
  const response = await fetchArticleFile(relativePath);
  if (!response || !response.ok) {
    throw new Error(`Failed to load article ${relativePath}: HTTP ${response?.status}`);
  }
  return await response.json();
}
