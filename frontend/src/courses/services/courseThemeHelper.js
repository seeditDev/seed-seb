/**
 * courseThemeHelper.js
 * Utility to sync course components, Monaco code editors, and assessment views
 * with SEED-IT SEB system theme attributes ('seed-seb', 'light', 'dark', 'dim', etc.).
 */

import { useState, useEffect } from 'react';

export const LIGHT_THEMES = ['seed-seb', 'light', 'red-light', 'bw'];

/**
 * Returns the active system theme identifier from DOM or localStorage.
 */
export const getSystemTheme = () => {
  if (typeof document === 'undefined') return 'seed-seb';
  return (
    document.documentElement.getAttribute('data-theme') ||
    localStorage.getItem('portal_theme') ||
    'seed-seb'
  );
};

/**
 * Returns 'vs' for light/white themes or 'vs-dark' for dark/dim themes.
 */
export const getSystemMonacoTheme = () => {
  const theme = getSystemTheme();
  return LIGHT_THEMES.includes(theme) ? 'vs' : 'vs-dark';
};

/**
 * Reactive React hook that listens to DOM data-theme changes and storage events,
 * updating components immediately when the theme changes.
 */
export const useSystemTheme = () => {
  const [theme, setTheme] = useState(getSystemTheme);

  useEffect(() => {
    const handleThemeUpdate = () => {
      setTheme(getSystemTheme());
    };

    // Listen to attribute changes on <html>
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'data-theme') {
          handleThemeUpdate();
        }
      }
    });

    if (typeof document !== 'undefined') {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
      });
    }

    // Listen to localStorage theme changes from other windows/tabs or events
    window.addEventListener('storage', handleThemeUpdate);
    window.addEventListener('theme-changed', handleThemeUpdate);

    return () => {
      observer.disconnect();
      window.removeEventListener('storage', handleThemeUpdate);
      window.removeEventListener('theme-changed', handleThemeUpdate);
    };
  }, []);

  const isLight = LIGHT_THEMES.includes(theme);
  const monacoTheme = isLight ? 'vs' : 'vs-dark';

  return {
    theme,
    isLight,
    isDark: !isLight,
    monacoTheme
  };
};
