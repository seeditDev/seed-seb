/**
 * Empty SSR module loaders map.
 * Prevents bundling 600+ course module JSON files into the SSR server worker bundle.
 */
export const moduleLoaders = {};
