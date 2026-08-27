import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// NOTE: Prettier is intentionally NOT integrated as an ESLint plugin.
// Running prettier/prettier inside ESLint produces ~30k noisy formatting
// warnings on this mixed-style codebase and slows linting significantly.
// Run Prettier separately: `npx prettier --write src/` for formatting.
// ESLint here handles logic/correctness rules only.

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi", ".tanstack", ".nitro", ".wrangler", "build", "coverage", "node_modules", "src/legacy/**"] },

  // ── TypeScript / TSX ────────────────────────────────────────────────────────
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Intentional swallowed catches are common in defensive patterns; warn don't error
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },

  // ── JavaScript / JSX ────────────────────────────────────────────────────────
  // The majority of the frontend is .js/.jsx. This block ensures core rules —
  // including invalid syntax patterns like await-in-non-async — are enforced
  // across all source files, not only TypeScript.
  {
    extends: [js.configs.recommended],
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,   // ES2021+ needed for numeric separators (100_000)
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Warn rather than error to allow gradual cleanup of existing code
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-undef": "warn",
      // Intentional swallowed catches are common in defensive patterns; warn don't error
      "no-empty": ["warn", { allowEmptyCatch: true }],
      // Catch await-in-non-async and similar async misuse
      "no-async-promise-executor": "error",
      "require-await": "warn",
    },
  },
);

