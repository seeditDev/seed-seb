/**
 * jsCompiler.js
 * Embedded JavaScript Compiler & Execution Engine for SEED-IT Platform.
 * Features:
 * - High-speed in-browser JS compilation & execution
 * - Intercepts console.log, console.error, process.stdout.write
 * - Provides mocks for require('fs').readFileSync(0, 'utf-8') & require('readline')
 * - Infinite loop protection with configurable execution timeout
 * - Standardized output format matching SEED-IT platform runners
 */

export async function executeJavaScript(code, stdin = "", timeoutMs = 3000) {
  const trimmedCode = String(code || "").trim();
  const noComments = trimmedCode
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
    .replace(/#.*/g, '')
    .trim();

  if (trimmedCode === "" || noComments === "") {
    return {
      stdout: "",
      stderr: "No code submitted in editor. Blank submissions cannot be executed or evaluated.",
      output: "",
      exit_code: 1,
      error: "Blank Code Submitted"
    };
  }

  const stdoutBuffer = [];
  const stderrBuffer = [];
  const cleanStdin = String(stdin || "");
  const stdinLines = cleanStdin.split(/\r?\n/);
  let stdinLineIndex = 0;

  // Format helper for arguments
  const formatArg = (arg) => {
    if (arg === undefined) return 'undefined';
    if (arg === null) return 'null';
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch (_) {
        return String(arg);
      }
    }
    return String(arg);
  };

  // Mock console methods
  const mockConsole = {
    log: (...args) => {
      stdoutBuffer.push(args.map(formatArg).join(' '));
    },
    info: (...args) => {
      stdoutBuffer.push(args.map(formatArg).join(' '));
    },
    warn: (...args) => {
      stderrBuffer.push(`[WARN] ${args.map(formatArg).join(' ')}`);
    },
    error: (...args) => {
      stderrBuffer.push(args.map(formatArg).join(' '));
    }
  };

  // Mock fs module (fs.readFileSync(0, 'utf-8'))
  const mockFs = {
    readFileSync: (fd, encoding) => {
      return cleanStdin;
    },
    readFile: (path, encoding, cb) => {
      const callback = typeof encoding === 'function' ? encoding : cb;
      if (typeof callback === 'function') callback(null, cleanStdin);
      return cleanStdin;
    },
    promises: {
      readFile: async () => cleanStdin
    }
  };

  // Mock process module
  const mockProcess = {
    stdin: {
      on: (event, cb) => {
        if (event === 'data') cb(cleanStdin);
        if (event === 'end') cb();
      },
      read: () => cleanStdin
    },
    stdout: {
      write: (data) => {
        stdoutBuffer.push(String(data));
      }
    },
    stderr: {
      write: (data) => {
        stderrBuffer.push(String(data));
      }
    },
    argv: ['node', 'solution.js'],
    env: {},
    exit: (code = 0) => {
      throw new Error(`__PROCESS_EXIT_${code}__`);
    }
  };

  // Mock readline module
  const mockReadline = {
    createInterface: () => ({
      on: (event, cb) => {
        if (event === 'line') {
          stdinLines.forEach(line => cb(line));
        }
        if (event === 'close') cb();
      },
      question: (query, cb) => {
        const nextLine = stdinLines[stdinLineIndex++] || '';
        cb(nextLine);
      },
      close: () => {}
    })
  };

  // Mock require module
  const mockRequire = (moduleName) => {
    const name = String(moduleName || '').toLowerCase();
    if (name === 'fs') return mockFs;
    if (name === 'readline') return mockReadline;
    if (name === 'process') return mockProcess;
    throw new Error(`Module '${moduleName}' is not available in the embedded sandbox.`);
  };

  let timerId = null;

  try {
    const wrappedFunction = new Function(
      'console',
      'require',
      'process',
      'fs',
      'readline',
      'input',
      `"use strict";
       return (async () => {
         ${code}
       })();`
    );

    const executionPromise = wrappedFunction(
      mockConsole,
      mockRequire,
      mockProcess,
      mockFs,
      mockReadline,
      cleanStdin
    );

    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => {
        reject(new Error(`Time Limit Exceeded (${timeoutMs}ms). Check for infinite loops.`));
      }, timeoutMs);
    });

    await Promise.race([executionPromise, timeoutPromise]);
  } catch (err) {
    if (err.message && err.message.startsWith('__PROCESS_EXIT_')) {
      // Process exited cleanly via process.exit(code)
    } else {
      stderrBuffer.push(err.stack || err.toString());
    }
  } finally {
    if (timerId) clearTimeout(timerId);
  }

  const finalStdout = stdoutBuffer.join('\n');
  const finalStderr = stderrBuffer.join('\n');

  return {
    stdout: finalStdout,
    stderr: finalStderr,
    output: finalStdout || finalStderr,
    exit_code: finalStderr.length > 0 && finalStdout.length === 0 ? 1 : 0,
    error: finalStderr.length > 0 ? (finalStderr.split('\n')[0] || "Runtime Error") : null
  };
}

export default executeJavaScript;
