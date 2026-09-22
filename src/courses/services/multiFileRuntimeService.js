/**
 * multiFileRuntimeService.js — In-Browser Multi-Module Bundler for SEED Code Studio
 *
 * Provides a client-side Virtual File System (VFS) and bundler that resolves relative
 * imports (e.g. `import Navbar from './components/Navbar'`) in memory using Sucrase.
 * Zero external servers, Webpack, or Vite dev-server required!
 */

import { transform } from 'sucrase';

/**
 * Normalizes relative file paths (e.g., baseDir: 'src/components', rel: '../utils/math' -> 'src/utils/math')
 */
export function normalizeModulePath(baseDir, relativePath, availableFiles = []) {
  if (!relativePath) return '';
  if (relativePath === 'react' || relativePath === 'react/jsx-runtime') return 'react';
  if (relativePath === 'react-dom' || relativePath === 'react-dom/client') return 'react-dom';

  // If path doesn't start with . or .., it might be an alias or root path
  let pathParts = [];
  if (relativePath.startsWith('.')) {
    const baseParts = baseDir ? baseDir.split('/').filter(Boolean) : [];
    pathParts = baseParts.concat(relativePath.split('/'));
  } else {
    pathParts = relativePath.split('/');
  }

  const stack = [];
  for (const p of pathParts) {
    if (p === '.' || p === '') continue;
    if (p === '..') {
      if (stack.length > 0) stack.pop();
    } else {
      stack.push(p);
    }
  }

  const candidate = stack.join('/');
  if (availableFiles.includes(candidate)) return candidate;

  // Try extensions
  const extensions = ['.jsx', '.js', '.css', '.json', '/index.jsx', '/index.js'];
  for (const ext of extensions) {
    if (availableFiles.includes(candidate + ext)) {
      return candidate + ext;
    }
  }

  return candidate;
}

/**
 * Bundles a Virtual File System map into executable sandbox HTML.
 *
 * @param {Object.<string, string>} files - Map of { 'src/App.jsx': 'code...', 'src/components/Nav.jsx': 'code...' }
 * @param {string} [entryPoint='src/App.jsx'] - Root entry component file
 * @returns {object} { success: boolean, html?: string, error?: string }
 */
export function bundleVirtualFileSystem(files = {}, entryPoint = 'src/App.jsx') {
  try {
    const filePaths = Object.keys(files);
    if (filePaths.length === 0) {
      return {
        success: false,
        error: 'No files provided in Virtual File System.'
      };
    }

    // Determine entry file
    let entryKey = entryPoint;
    if (!files[entryKey]) {
      // Find fallback: 'App.jsx', 'src/App.jsx', 'src/index.jsx', or first .jsx file
      entryKey = filePaths.find(f => f.endsWith('App.jsx')) ||
                 filePaths.find(f => f.endsWith('.jsx')) ||
                 filePaths[0];
    }

    // Transpile each JS/JSX file into CommonJS
    const transpiledModules = {};
    const cssModules = {};
    const jsonModules = {};

    for (const [filePath, content] of Object.entries(files)) {
      if (filePath.endsWith('.css')) {
        cssModules[filePath] = content;
      } else if (filePath.endsWith('.json')) {
        try {
          jsonModules[filePath] = JSON.parse(content);
        } catch {
          jsonModules[filePath] = {};
        }
      } else {
        // Assume JS / JSX
        try {
          const compiled = transform(content || '', {
            transforms: ['jsx', 'imports'],
            jsxRuntime: 'classic',
            production: false
          });
          transpiledModules[filePath] = compiled.code;
        } catch (err) {
          return {
            success: false,
            error: `Transpilation error in "${filePath}": ${err.message}`
          };
        }
      }
    }

    // Generate sandboxed HTML payload
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SEED Code Studio Preview</title>
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
    .btn-primary { background: #2563eb; color: #ffffff; border: 1px solid #1d4ed8; }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-secondary { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; }
    .btn-secondary:hover { background: #e2e8f0; }
    .btn-danger { background: #ef4444; color: white; border: 1px solid #dc2626; }
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
  </style>
  <script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
</head>
<body>
  <div id="seed-error-banner"></div>
  <div id="root"></div>

  <script>
    // Console Interceptor
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
    // In-Browser Module Registry & Virtual Require Engine
    (function() {
      const availableFiles = ${JSON.stringify(filePaths)};
      const transpiled = ${JSON.stringify(transpiledModules)};
      const cssMap = ${JSON.stringify(cssModules)};
      const jsonMap = ${JSON.stringify(jsonModules)};

      const moduleRegistry = {};
      const moduleCache = {};

      // Register compiled code
      for (const [path, code] of Object.entries(transpiled)) {
        moduleRegistry[path] = new Function('module', 'exports', 'require', code);
      }

      function normalizePath(baseDir, rel) {
        if (!rel) return '';
        if (rel === 'react' || rel === 'react/jsx-runtime') return 'react';
        if (rel === 'react-dom' || rel === 'react-dom/client') return 'react-dom';

        let parts = [];
        if (rel.startsWith('.')) {
          const baseParts = baseDir ? baseDir.split('/').filter(Boolean) : [];
          parts = baseParts.concat(rel.split('/'));
        } else {
          parts = rel.split('/');
        }

        const stack = [];
        for (const p of parts) {
          if (p === '.' || p === '') continue;
          if (p === '..') {
            if (stack.length > 0) stack.pop();
          } else {
            stack.push(p);
          }
        }
        const candidate = stack.join('/');
        if (availableFiles.includes(candidate)) return candidate;

        const exts = ['.jsx', '.js', '.css', '.json', '/index.jsx', '/index.js'];
        for (const ext of exts) {
          if (availableFiles.includes(candidate + ext)) return candidate + ext;
        }
        return candidate;
      }

      function makeRequire(currentFilePath) {
        const lastSlash = currentFilePath.lastIndexOf('/');
        const currentDir = lastSlash !== -1 ? currentFilePath.substring(0, lastSlash) : '';

        return function require(specifier) {
          if (specifier === 'react' || specifier === 'react/jsx-runtime') {
            return window.React;
          }
          if (specifier === 'react-dom' || specifier === 'react-dom/client') {
            return window.ReactDOM;
          }

          const target = normalizePath(currentDir, specifier);

          if (moduleCache[target]) {
            return moduleCache[target].exports;
          }

          // Handle CSS imports
          if (target.endsWith('.css') || cssMap[target] !== undefined) {
            const css = cssMap[target] || '';
            const style = document.createElement('style');
            style.setAttribute('data-file', target);
            style.textContent = css;
            document.head.appendChild(style);
            return {};
          }

          // Handle JSON imports
          if (target.endsWith('.json') || jsonMap[target] !== undefined) {
            return jsonMap[target] || {};
          }

          if (!moduleRegistry[target]) {
            throw new Error(
              'Cannot resolve module "' + specifier + '" from "' + currentFilePath + '". ' +
              'Available files in workspace: ' + availableFiles.join(', ')
            );
          }

          const mod = { exports: {} };
          moduleCache[target] = mod;
          moduleRegistry[target](mod, mod.exports, makeRequire(target));
          return mod.exports;
        };
      }

      // Inject any pre-existing CSS files (e.g. styles.css)
      for (const [cPath, cText] of Object.entries(cssMap)) {
        const st = document.createElement('style');
        st.setAttribute('data-file', cPath);
        st.textContent = cText;
        document.head.appendChild(st);
      }

      try {
        const rootRequire = makeRequire('');
        const entryExport = rootRequire('${entryKey}');
        const ComponentToMount = entryExport.default || entryExport;

        if (!ComponentToMount) {
          throw new Error('Entry module "${entryKey}" did not export a React component. Make sure you use "export default function App()".');
        }

        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(React.createElement(ComponentToMount));
      } catch (err) {
        console.error(err.message);
        const banner = document.getElementById('seed-error-banner');
        if (banner) {
          banner.style.display = 'block';
          banner.textContent = 'Bootstrap Error: ' + err.message;
        }
      }
    })();
  </script>
</body>
</html>`;

    return {
      success: true,
      html,
      entryPoint: entryKey,
      fileCount: filePaths.length
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Failed to bundle Virtual File System.'
    };
  }
}

/**
 * Validates tasks in a multi-file project.
 * Supports:
 * - `fileExists`: verifies target file exists in workspace
 * - `fileContentRegex`: verifies target file contains pattern
 * - `domSelector` & `expectedText`: verifies rendered DOM output
 * - `simulateAction`: clicks an element and tests state transition
 */
export async function evaluateMultiFileTasks(tasks = [], files = {}, iframeElement = null) {
  if (!Array.isArray(tasks) || tasks.length === 0) return [];

  const iframeDoc = iframeElement?.contentDocument || iframeElement?.contentWindow?.document;
  const results = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    let passed = false;
    let feedback = '';

    try {
      // 1. File existence check
      if (task.requiredFile) {
        const exists = Boolean(files[task.requiredFile]);
        if (!exists) {
          results.push({
            id: task.id || i,
            passed: false,
            message: task.failMessage || `File "${task.requiredFile}" was not found in the file explorer.`
          });
          continue;
        }
      }

      // 2. File content regex check
      if (task.fileContentRegex && task.targetFile) {
        const content = files[task.targetFile] || '';
        const flags = task.regexFlags || 'm';
        const regex = new RegExp(task.fileContentRegex, flags);
        if (!regex.test(content)) {
          results.push({
            id: task.id || i,
            passed: false,
            message: task.failMessage || `Expected pattern matching "${task.fileContentRegex}" in ${task.targetFile}.`
          });
          continue;
        }
      }

      // 3. DOM output checks
      if (task.domSelector && iframeDoc) {
        const el = iframeDoc.querySelector(task.domSelector);
        if (!el) {
          results.push({
            id: task.id || i,
            passed: false,
            message: `Element "${task.domSelector}" was not rendered in the preview.`
          });
          continue;
        }

        if (task.expectedText) {
          const text = (el.textContent || '').trim();
          if (!text.toLowerCase().includes(task.expectedText.toLowerCase())) {
            results.push({
              id: task.id || i,
              passed: false,
              message: `Expected "${task.domSelector}" to contain "${task.expectedText}", but found "${text}".`
            });
            continue;
          }
        }

        // 4. Action simulation
        if (task.simulateAction === 'click') {
          el.click();
          await new Promise(r => setTimeout(r, 60));

          if (task.afterActionSelector) {
            const afterEl = iframeDoc.querySelector(task.afterActionSelector);
            if (!afterEl) {
              results.push({
                id: task.id || i,
                passed: false,
                message: `Element "${task.afterActionSelector}" not found after interaction.`
              });
              continue;
            }
            if (task.afterActionExpectedText) {
              const aText = (afterEl.textContent || '').trim();
              if (!aText.toLowerCase().includes(task.afterActionExpectedText.toLowerCase())) {
                results.push({
                  id: task.id || i,
                  passed: false,
                  message: `After click, expected "${task.afterActionExpectedText}" in ${task.afterActionSelector}.`
                });
                continue;
              }
            }
          }
        }
      }

      passed = true;
      feedback = 'Passed';
    } catch (e) {
      passed = false;
      feedback = e.message || 'Verification error';
    }

    results.push({
      id: task.id || i,
      passed,
      message: passed ? 'Passed' : feedback
    });
  }

  return results;
}
