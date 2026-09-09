/**
 * Utility for Monaco Editor font measurement and cursor synchronization.
 *
 * Prevents cursor horizontal misalignment/lag (e.g. cursor appearing over 'l'
 * instead of after 'd' when typing "world") caused by:
 * 1. Asynchronous webfont loading (JetBrains Mono swapping in after Monaco initial measurement).
 * 2. Canvas 2D measurement failure when CSS variables (var(--...)) are passed.
 * 3. CSS inheritance of non-zero letter-spacing or ligatures.
 */

export const MONACO_FONT_FAMILY = "'JetBrains Mono', Consolas, 'Courier New', monospace";

export const MONACO_FONT_OPTIONS = {
  fontFamily: MONACO_FONT_FAMILY,
  fontSize: 14,
  letterSpacing: 0,
  fontLigatures: false,
};

let globalFontsHooked = false;

/**
 * Ensures Monaco recalculates character glyph metrics once all web fonts are loaded,
 * and performs immediate + delayed remeasure passes on mount.
 *
 * @param {object} monaco - The monaco instance provided by @monaco-editor/react onMount
 * @param {object} [editor] - The editor instance provided by @monaco-editor/react onMount
 */
export const remeasureMonacoFonts = (monaco, editor) => {
  if (!monaco?.editor) return;

  // 1. Immediate remeasure
  try {
    monaco.editor.remeasureFonts();
  } catch (err) {
    // ignore
  }

  // 2. Remeasure when document.fonts finishes loading all webfonts
  if (typeof document !== 'undefined' && document.fonts) {
    document.fonts.ready.then(() => {
      try {
        monaco.editor.remeasureFonts();
        if (editor && typeof editor.layout === 'function') {
          editor.layout();
        }
      } catch (err) {
        // ignore
      }
    });

    if (!globalFontsHooked) {
      globalFontsHooked = true;
      try {
        document.fonts.addEventListener?.('loadingdone', () => {
          try {
            monaco.editor.remeasureFonts();
          } catch (e) {}
        });
      } catch (e) {}
    }
  }

  // 3. Delayed backup remeasure passes (handles late font swaps, window resizing, or tab changes)
  const delays = [150, 400, 1000];
  delays.forEach((ms) => {
    setTimeout(() => {
      try {
        monaco.editor.remeasureFonts();
        if (editor && typeof editor.layout === 'function') {
          editor.layout();
        }
      } catch (err) {
        // ignore
      }
    }, ms);
  });
};
