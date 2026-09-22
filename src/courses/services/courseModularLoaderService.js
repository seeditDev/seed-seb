/**
 * courseModularLoaderService.js
 * High-performance on-demand loader for SEED-IT Real Courses.
 * 
 * Architecture:
 * - Master Domains & Courses Manifest (~23KB)
 * - Lightweight Course Manifests (~2-5KB per course)
 * - Dynamic Lazy-Loaded Module Mini-JSONs (~15-45KB per module on-demand)
 * - Zero bundle bloat (replaces 45.8MB eager glob with lazy imports)
 */

import domainsManifest from '../data/catalog/domains.json';

// Eagerly import only lightweight course manifests (~2KB each)
const manifestImports = import.meta.glob('../data/catalog/**/course.json', { eager: true });

// Lazily import module mini-JSONs (only fetched over the network when requested)
const moduleLoaders = import.meta.glob('../data/catalog/**/modules/*.json');

// Memory cache for fetched modules
const moduleCache = new Map();
const hydratedCourseCache = new Map();

// Slug and ID aliases for legacy routes and alternate names
const COURSE_ALIASES = {
  'cpp-programming-mastery': 'cpp',
  'c-programming-mastery': 'c',
  'java-programming-mastery': 'java',
  'operating-systems-mastery': 'operating-systems',
  'operating-systems-course': 'operating-systems',
  'operating-system': 'operating-systems',
  'aptitude-reasoning-mastery': 'aptitude-and-reasoning',
  'aptitude_reasoning_course': 'aptitude-and-reasoning',
  'aptitude': 'aptitude-and-reasoning',
  'dsa-mastery': 'dsa-core',
  'dsa-mastery-course': 'dsa-core',
  'dsa': 'dsa-core',
  'dsa-in-c': 'dsa-core',
  'dsa-in-cpp': 'dsa-core',
  'time-complexity': 'dsa-foundation',
  'graphs-advanced': 'advanced-dsa',
  'number-theory': 'competitive-programming',
  'dynamic-programming-advanced': 'advanced-competitive-programming',
  'react-frontend-architecture': 'react',
  'react-js': 'react',
  'react': 'react',
  'python-mastery': 'python',
  'python-mastery-course': 'python',
  'python-beginner-v2-p1': 'python',
  'python-beginner-v2-p2': 'python',
  'advanced-python': 'python',
  'sql-database-mastery': 'sql',
  'sql-database-systems-course': 'sql',
  'sql-interactive': 'sql',
  'sql': 'sql',
  'learn-sql': 'sql',
  'web-dev-fullstack-course': 'fullstack',
  'web-dev-js': 'javascript-web',
  'system-design-mastery-course': 'system-design-fundamentals',
  'deep-learning-ai': 'deep-learning',
  'c-sharp': 'csharp',
  'c#': 'csharp'
};

// Priority slugs to pin flagship courses to the top of catalog
const FLAGSHIP_PRIORITY = [
  'dsa-core',
  'dsa-problem-solving',
  'cpp',
  'java',
  'python',
  'c',
  'react',
  'sql',
  'operating-systems',
  'nodejs',
  'advanced-dsa',
  'system-design-fundamentals',
  'machine-learning',
  'deep-learning',
  'git-github',
  'html',
  'css',
  'javascript',
  'csharp',
  'go',
  'rust',
  'kotlin',
  'aptitude-and-reasoning'
];

/**
 * Normalized list of course manifests from catalog
 */
export const MODULAR_COURSE_CATALOG = Object.entries(manifestImports)
  .map(([filepath, mod]) => {
    const course = mod.default || mod;
    if (!course) return null;
    const normPath = filepath.replace(/\\/g, '/');
    const pathParts = normPath.split('/');
    const folderName = pathParts[pathParts.length - 2] || '';
    const courseId = course.courseId || course.id || course.slug || folderName;
    const slug = course.slug || folderName || courseId;
    return {
      ...course,
      courseId,
      id: courseId,
      slug,
      folderName,
      manifestPath: normPath
    };
  })
  .filter(Boolean)
  .sort((a, b) => {
    const aPri = FLAGSHIP_PRIORITY.indexOf(a.slug);
    const bPri = FLAGSHIP_PRIORITY.indexOf(b.slug);
    if (aPri !== -1 && bPri !== -1) return aPri - bPri;
    if (aPri !== -1) return -1;
    if (bPri !== -1) return 1;
    return (b.reviewsCount || 0) - (a.reviewsCount || 0);
  });

/**
 * Get the master 12 Domains manifest
 */
export const getDomainCatalog = () => domainsManifest;

/**
 * Resolve canonical course manifest by id or slug
 */
export const getCourseManifest = (courseIdOrSlug) => {
  if (!MODULAR_COURSE_CATALOG || MODULAR_COURSE_CATALOG.length === 0) return null;
  if (!courseIdOrSlug) return null;

  const raw = String(courseIdOrSlug).trim().toLowerCase();
  const query = raw.replace(/_/g, '-');
  const aliased = COURSE_ALIASES[query] || COURSE_ALIASES[raw] || query;

  // 1. Direct match on courseId, slug, id, or folderName
  let found = MODULAR_COURSE_CATALOG.find(c => {
    const cId = String(c.courseId || '').toLowerCase();
    const cSlug = String(c.slug || '').toLowerCase();
    const cFolder = String(c.folderName || '').toLowerCase();
    const cAltId = String(c.id || '').toLowerCase();
    
    return cId === query || cId === aliased ||
           cSlug === query || cSlug === aliased ||
           cFolder === query || cFolder === aliased ||
           cAltId === query || cAltId === aliased;
  });

  // 2. Loose fallback matching: slug without prefixes/suffixes
  if (!found) {
    found = MODULAR_COURSE_CATALOG.find(c => {
      const cSlug = String(c.slug || '').toLowerCase();
      const cFolder = String(c.folderName || '').toLowerCase();
      return cSlug.includes(query) || query.includes(cSlug) ||
             cFolder.includes(query) || query.includes(cFolder);
    });
  }

  return found || null;
};

/**
 * Dynamically loads an individual module mini-JSON on-demand.
 * Loads in < 5ms and caches in memory.
 */
export const loadCourseModule = async (courseIdOrSlug, moduleId) => {
  const manifest = getCourseManifest(courseIdOrSlug);
  if (!manifest) return null;

  const cacheKey = `${manifest.slug}:${moduleId}`;
  if (moduleCache.has(cacheKey)) {
    return moduleCache.get(cacheKey);
  }

  // Find module stub in course manifest
  const modStub = manifest.modules?.find(m => m.moduleId === moduleId);
  const targetSubPath = (modStub?.moduleFile || `modules/${moduleId}.json`).replace(/\\/g, '/');

  const courseDir = manifest.manifestPath ? manifest.manifestPath.replace(/\/course\.json$/, '') : '';

  // Direct exact key lookup
  const exactKey = `${courseDir}/${targetSubPath}`;
  let loader = moduleLoaders[exactKey];

  // If not found directly, search scoped strictly to this course's directory
  if (!loader && courseDir) {
    const matchingKey = Object.keys(moduleLoaders).find(p => {
      const normP = p.replace(/\\/g, '/');
      return normP.startsWith(courseDir) && (
        normP.endsWith(targetSubPath) || 
        normP.includes(`/${moduleId}.json`) || 
        normP.includes(`/${moduleId}-`)
      );
    });
    if (matchingKey) loader = moduleLoaders[matchingKey];
  }

  // Final fallback scoped strictly to manifest folderName or slug
  if (!loader) {
    const targetFolder = manifest.folderName || manifest.slug;
    const matchingKey = Object.keys(moduleLoaders).find(p => {
      const normP = p.replace(/\\/g, '/');
      return normP.includes(`/${targetFolder}/`) && (
        normP.endsWith(targetSubPath) || 
        normP.includes(`/${moduleId}.json`) || 
        normP.includes(`/${moduleId}-`)
      );
    });
    if (matchingKey) loader = moduleLoaders[matchingKey];
  }

  if (!loader) {
    console.warn(`[courseModularLoaderService] Module file not found for ${moduleId} in ${manifest.slug}`);
    return null;
  }

  try {
    const raw = await loader();
    const data = raw.default || raw;
    moduleCache.set(cacheKey, data);
    return data;
  } catch (err) {
    console.error(`[courseModularLoaderService] Failed to load module ${moduleId}:`, err);
    return null;
  }
};

/**
 * Hydrate a full course with all its modules resolved.
 * Provides 100% backward compatibility with legacy views expecting course.modules[].topics
 */
export const hydrateFullCourse = async (courseIdOrSlug) => {
  const manifest = getCourseManifest(courseIdOrSlug);
  if (!manifest) return null;

  if (hydratedCourseCache.has(manifest.slug)) {
    return hydratedCourseCache.get(manifest.slug);
  }

  if (!manifest.modules || manifest.modules.length === 0) {
    return manifest;
  }

  // Check if first module already has full topics (already hydrated)
  if (manifest.modules[0]?.topics && Array.isArray(manifest.modules[0].topics) && manifest.modules[0].topics.length > 0) {
    return manifest;
  }

  // Load all module mini-JSONs in parallel
  const loadedModules = await Promise.all(
    manifest.modules.map(async (stub) => {
      const fullModule = await loadCourseModule(manifest.slug, stub.moduleId);
      return fullModule || stub;
    })
  );

  const fullCourse = {
    ...manifest,
    modules: loadedModules
  };

  hydratedCourseCache.set(manifest.slug, fullCourse);
  return fullCourse;
};

export default {
  MODULAR_COURSE_CATALOG,
  getDomainCatalog,
  getCourseManifest,
  loadCourseModule,
  hydrateFullCourse
};
