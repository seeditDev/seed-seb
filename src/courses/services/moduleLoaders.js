/**
 * Client module loaders map for modular courses.
 * Uses Vite import.meta.glob to dynamically load individual module JSONs on demand.
 */
export const moduleLoaders = import.meta.glob('../data/catalog/**/modules/*.json');
