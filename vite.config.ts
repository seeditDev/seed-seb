// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));


function ssrOptimizerPlugin() {
  const ssrStubs: Record<string, string> = {
    '@tensorflow/tfjs': path.resolve(__dirname, 'src/stubs/tfjs-stub.js'),
    'face-api.js': path.resolve(__dirname, 'src/stubs/faceapi-stub.js'),
    'mermaid': path.resolve(__dirname, 'src/stubs/mermaid-stub.js'),
    'alasql': path.resolve(__dirname, 'src/stubs/alasql-stub.js'),
  };

  return {
    name: 'ssr-optimizer-plugin',
    enforce: 'pre' as const,
    resolveId(id: string, importer: string | undefined, options: any) {
      const isSsr = Boolean(
        options?.ssr ||
        (this as any)?.environment?.name === 'ssr' ||
        (this as any)?.environment?.name === 'nitro'
      );
      if (isSsr) {
        if (id.endsWith('moduleLoaders.js') || id.endsWith('moduleLoaders')) {
          return path.resolve(__dirname, 'src/courses/services/moduleLoaders.ssr.js');
        }
        if (ssrStubs[id]) {
          return ssrStubs[id];
        }
      }
      return null;
    },
  };
}

function isolateFaceApiTfEnginePlugin() {
  return {
    name: 'isolate-faceapi-tfengine',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (id.includes('face-api.js') || id.includes('face-api')) {
        if (code.includes('_tfengine')) {
          return {
            code: code.replaceAll('_tfengine', '_faceapi_tfengine'),
            map: null,
          };
        }
      }
      return null;
    },
  };
}

export default defineConfig({
  nitro: {
    preset: "cloudflare-module",
    compatibilityDate: "2024-09-23",
    alias: {
      'mermaid': path.resolve(__dirname, 'src/stubs/mermaid-stub.js'),
      'alasql': path.resolve(__dirname, 'src/stubs/alasql-stub.js'),
      [path.resolve(__dirname, 'src/courses/services/moduleLoaders.js')]: path.resolve(__dirname, 'src/courses/services/moduleLoaders.ssr.js'),
    },
    hooks: {
      compiled(nitro: any) {
        try {
          const serverDir = nitro?.options?.output?.serverDir || path.resolve(__dirname, '.output/server');
          const serverEntry = path.resolve(serverDir, 'index.mjs');
          if (fs.existsSync(serverEntry)) {
            let content = fs.readFileSync(serverEntry, 'utf8');
            if (!content.includes('export { AssessmentSessionDO }')) {
              content += '\nexport { AssessmentSessionDO } from "./_ssr/ssr.mjs";\n';
              fs.writeFileSync(serverEntry, content, 'utf8');
              console.log('[nitro:hook] Successfully patched AssessmentSessionDO export into .output/server/index.mjs');
            }
          }
        } catch (e) {
          console.warn('[nitro:hook] Patch error:', e);
        }
      },
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: {
      port: 5173, entry: "server" },
  },
  vite: {
    plugins: [
      isolateFaceApiTfEnginePlugin(),
      ssrOptimizerPlugin(),
    ],
    server: {
      watch: {
        ignored: ['**/build/**', '**/.output/**', '**/dist/**', '**/.nitro/**'],
      },
    },
    ssr: {
      external: ['react-native', 'react-native-fs', 'react-native-fetch-blob'],
    },
    build: {
      rollupOptions: {
        external: ['react-native', 'react-native-fs', 'react-native-fetch-blob'],
        output: {
          manualChunks(id) {
            if (id.includes('realCourses') && id.endsWith('.json')) {
              const match = id.match(/realCourses[/\\]([^/\\]+)\.json/);
              if (match) {
                return `course-${match[1]}`;
              }
              return 'course-data';
            }
          },
        },
      },
    },
    optimizeDeps: {
      include: [
        "react-icons/fa",
        "dompurify",
        "sonner",
        "axios",
        "katex",
        "firebase/app",
        "firebase/auth",
        "firebase/firestore",
        "firebase/database",
        "firebase/storage",
        "@tanstack/react-query",
      ],
    },
  },
});
