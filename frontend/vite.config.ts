// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    server: {
      watch: {
        ignored: ['**/build/**', '**/.output/**', '**/dist/**', '**/.nitro/**'],
      },
    },
    build: {
      rollupOptions: {
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
