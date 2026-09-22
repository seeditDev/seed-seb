/**
 * courseCatalogData.js
 * High-performance course catalog data provider.
 * Powered by Modular Mini-JSON architecture across 12 Domains.
 * 
 * Replaces monolithic 45.8MB eager glob with lightweight course manifests
 * and dynamic on-demand module mini-JSON loading.
 */

import { 
  MODULAR_COURSE_CATALOG, 
  getCourseManifest, 
  getDomainCatalog, 
  loadCourseModule, 
  hydrateFullCourse 
} from '../services/courseModularLoaderService';

export const COURSE_CATALOG = MODULAR_COURSE_CATALOG;

export const getCourseById = (courseIdOrSlug) => {
  return getCourseManifest(courseIdOrSlug);
};

export {
  getDomainCatalog,
  loadCourseModule,
  hydrateFullCourse
};

export default {
  COURSE_CATALOG,
  getCourseById,
  getDomainCatalog,
  loadCourseModule,
  hydrateFullCourse
};
