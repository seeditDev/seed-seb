/**
 * reactRuntimeService.js — SEED In-Browser React Execution Engine
 *
 * Transpiles JSX/ES6 in real-time using Sucrase (zero heavy bundler required)
 * and generates a secure, sandboxed execution document for an iframe preview.
 * Includes console interception, error boundary, and automated DOM testing.
 */

import { transform } from 'sucrase';

/**
 * Transpiles JSX into executable JavaScript for the sandboxed iframe.
 * Handles imports by aliasing React hooks and components to window.React.
 */
export function compileReactCode(rawCode) {
  try {
    let cleanCode = rawCode || '';

    // Strip React import statements since React is globally available in the sandbox
    cleanCode = cleanCode.replace(
      /import\s+React\s*(?:,\s*\{([^}]+)\})?\s*from\s*['"]react['"];?/g,
      (match, hooks) => {
        if (!hooks) return '';
        const hookNames = hooks.split(',').map(h => h.trim()).filter(Boolean);
        return `const { ${hookNames.join(', ')} } = React;`;
      }
    );

    // Handle standard named react imports
    cleanCode = cleanCode.replace(
      /import\s*\{([^}]+)\}\s*from\s*['"]react['"];?/g,
      (match, hooks) => {
        const hookNames = hooks.split(',').map(h => h.trim()).filter(Boolean);
        return `const { ${hookNames.join(', ')} } = React;`;
      }
    );

    // Strip other common styling / asset imports
    cleanCode = cleanCode.replace(/import\s+['"][^'"]+\.css['"];?/g, '');
    cleanCode = cleanCode.replace(/import\s+.*\s+from\s+['"][^'"]+['"];?/g, '');

    // Convert export default to window.__SEED_APP__
    let detectedAppIdentifier = 'App';
    if (/export\s+default\s+function\s+([A-Za-z0-9_$]+)/.test(cleanCode)) {
      const match = cleanCode.match(/export\s+default\s+function\s+([A-Za-z0-9_$]+)/);
      detectedAppIdentifier = match[1];
      cleanCode = cleanCode.replace(/export\s+default\s+function\s+([A-Za-z0-9_$]+)/, 'function $1');
    } else if (/export\s+default\s+([A-Za-z0-9_$]+)/.test(cleanCode)) {
      const match = cleanCode.match(/export\s+default\s+([A-Za-z0-9_$]+)/);
      detectedAppIdentifier = match[1];
      cleanCode = cleanCode.replace(/export\s+default\s+([A-Za-z0-9_$]+);?/, '');
    }

    // Run Sucrase JSX transformation
    const compiled = transform(cleanCode, {
      transforms: ['jsx'],
      jsxRuntime: 'classic',
      production: false
    });

    return {
      success: true,
      code: compiled.code,
      appIdentifier: detectedAppIdentifier,
      error: null
    };
  } catch (err) {
    return {
      success: false,
      code: '',
      appIdentifier: 'App',
      error: err.message || 'JSX Transpilation Error'
    };
  }
}

/**
 * Generates the full HTML payload to inject into the preview iframe.
 */
export function generateSandboxHtml({ compiledJs, appIdentifier = 'App', css = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SEED React Sandbox</title>
  <!-- Modern Utility CSS & Font -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #ffffff;
      color: #0f172a;
      padding: 16px;
      line-height: 1.5;
    }
    button {
      font-family: inherit;
      cursor: pointer;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 500;
      font-size: 14px;
      transition: all 0.15s ease;
    }
    .btn-primary {
      background: #2563eb;
      color: #ffffff;
      border: 1px solid #1d4ed8;
    }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-secondary {
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
    }
    .btn-secondary:hover { background: #e2e8f0; }
    .btn-danger {
      background: #ef4444;
      color: white;
      border: 1px solid #dc2626;
    }
    input, textarea, select {
      font-family: inherit;
      padding: 8px 12px;
      border: 1.5px solid #cbd5e1;
      border-radius: 6px;
      font-size: 14px;
      outline: none;
    }
    input:focus, textarea:focus, select:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    }
    /* Runtime Error Banner */
    #seed-error-banner {
      display: none;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-left: 4px solid #ef4444;
      border-radius: 6px;
      padding: 12px 14px;
      color: #991b1b;
      font-size: 13px;
      font-family: monospace;
      white-space: pre-wrap;
      margin-bottom: 12px;
    }
    ${css || ''}
  </style>
  <!-- React 18 / 19 UMD from CDN (Loaded securely inside sandboxed frame) -->
  <script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
</head>
<body>
  <div id="seed-error-banner"></div>
  <div id="root"></div>

  <script>
    // Console Interceptor to forward output to SEED host
    (function() {
      const origLog = console.log;
      const origWarn = console.warn;
      const origError = console.error;

      function formatArg(arg) {
        if (arg === null) return 'null';
        if (arg === undefined) return 'undefined';
        if (typeof arg === 'object') {
          try { return JSON.stringify(arg, null, 2); } catch (_) { return String(arg); }
        }
        return String(arg);
      }

      function sendToParent(type, args) {
        try {
          const text = Array.from(args).map(formatArg).join(' ');
          window.parent.postMessage({ type: 'SEED_CONSOLE', level: type, text }, '*');
        } catch (_) {}
      }

      console.log = function(...args) { origLog.apply(console, args); sendToParent('log', args); };
      console.warn = function(...args) { origWarn.apply(console, args); sendToParent('warn', args); };
      console.error = function(...args) { origError.apply(console, args); sendToParent('error', args); };

      window.addEventListener('error', function(e) {
        const banner = document.getElementById('seed-error-banner');
        if (banner) {
          banner.style.display = 'block';
          banner.textContent = 'Runtime Error: ' + (e.message || 'An unknown error occurred');
        }
        sendToParent('error', [e.message]);
      });
    })();
  </script>

  <script>
    try {
      // Execute compiled student component
      ${compiledJs}

      // Resolve Root App component
      const ComponentToRender = typeof ${appIdentifier} !== 'undefined' ? ${appIdentifier} : (typeof App !== 'undefined' ? App : null);
      if (!ComponentToRender) {
        throw new Error('Component "${appIdentifier}" was not defined. Make sure you export default function ${appIdentifier}() or function App().');
      }

      const root = ReactDOM.createRoot(document.getElementById('root'));
      root.render(React.createElement(ComponentToRender));
    } catch (err) {
      console.error(err.message);
      const banner = document.getElementById('seed-error-banner');
      if (banner) {
        banner.style.display = 'block';
        banner.textContent = 'Render Error: ' + err.message;
      }
    }
  </script>
</body>
</html>`;
}

/**
 * Validates tasks against the student's code and the live rendered iframe.
 * Supports static code checks (Regex) and dynamic DOM assertions.
 */
export async function evaluateTasks(tasks = [], rawCode = '', iframeElement = null) {
  if (!Array.isArray(tasks) || tasks.length === 0) return [];

  const iframeDoc = iframeElement?.contentDocument || iframeElement?.contentWindow?.document;
  const results = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    let passed = false;
    let feedback = '';

    try {
      // 1. Static Regex / AST Check
      if (task.testRegex) {
        const flags = task.regexFlags !== undefined ? task.regexFlags : 'm';
        const regex = new RegExp(task.testRegex, flags);
        if (!regex.test(rawCode)) {
          results.push({
            id: task.id || i,
            passed: false,
            message: task.failMessage || `Requirement not met: expected pattern matching "${task.testRegex}".`
          });
          continue;
        }
      }

      // 1b. Forbidden pattern check (e.g. no direct mutation or no var)
      if (task.forbiddenRegex) {
        const flags = task.regexFlags !== undefined ? task.regexFlags : 'm';
        const fRegex = new RegExp(task.forbiddenRegex, flags);
        if (fRegex.test(rawCode)) {
          results.push({
            id: task.id || i,
            passed: false,
            message: task.failMessage || `Disallowed pattern detected: "${task.forbiddenRegex}".`
          });
          continue;
        }
      }

      // 2. DOM Inspection Checks
      if (task.domSelector && iframeDoc) {
        const el = iframeDoc.querySelector(task.domSelector);
        if (!el) {
          results.push({
            id: task.id || i,
            passed: false,
            message: `Element matching "${task.domSelector}" was not found in the preview.`
          });
          continue;
        }

        if (task.expectedText) {
          const text = (el.textContent || '').trim();
          if (!text.toLowerCase().includes(task.expectedText.toLowerCase())) {
            results.push({
              id: task.id || i,
              passed: false,
              message: `Expected "${task.domSelector}" to contain text "${task.expectedText}", but found "${text}".`
            });
            continue;
          }
        }

        // 3. Interactive DOM Simulation (e.g. click button and verify state changed)
        if (task.simulateAction === 'click') {
          el.click();
          // Give React 50ms to flush state and re-render
          await new Promise(res => setTimeout(res, 60));

          if (task.afterActionSelector) {
            const afterEl = iframeDoc.querySelector(task.afterActionSelector);
            if (!afterEl) {
              results.push({
                id: task.id || i,
                passed: false,
                message: `Element "${task.afterActionSelector}" was not found after action.`
              });
              continue;
            }
            if (task.afterActionExpectedText) {
              const afterText = (afterEl.textContent || '').trim();
              if (!afterText.toLowerCase().includes(task.afterActionExpectedText.toLowerCase())) {
                results.push({
                  id: task.id || i,
                  passed: false,
                  message: `After interaction, expected "${afterText}" to include "${task.afterActionExpectedText}".`
                });
                continue;
              }
            }
          }
        }
      }

      // If all configured checks passed
      passed = true;
      feedback = 'Passed';
    } catch (err) {
      passed = false;
      feedback = err.message || 'Validation error';
    }

    results.push({
      id: task.id || i,
      passed,
      message: passed ? 'Check passed!' : feedback
    });
  }

  return results;
}
