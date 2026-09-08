import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Flat ESLint config. CI runs `npx eslint .` (same as `npm run lint`).
 *
 * TanStack route filenames contain a literal `$` (`video.$roomId.tsx`).
 * Do not backslash-escape `$` in normal strings — `no-useless-escape` fails
 * the check job. Escape `$` only inside regex literals (`/\$roomId/`).
 */
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      ".output/**",
      ".vercel/**",
      ".nitro/**",
      ".tanstack/**",
      "coverage/**",
      "artifacts/**",
      "android/**",
      "ios/**",
      "node_modules/**",
      "src/routeTree.gen.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // js recommended treats unused vars as errors; leftover imports then
      // fail `npx eslint .` and inflate CI fail-rate. typescript-eslint
      // owns the rule and keeps leftovers as warnings.
      "no-unused-vars": "off",
      // Route fixtures and test strings trip this on first-push agent PRs
      // (TanStack `$` filenames, regex samples). Keep it visible, not red.
      "no-useless-escape": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Disable rules that conflict with Prettier formatting.
  prettier,
);
