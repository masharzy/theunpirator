import js from "@eslint/js";
import globals from "globals";
import { createRequire } from "node:module";
const dashboardRequire = createRequire(new URL("./apps/dashboard/package.json", import.meta.url));
const nextRequire = createRequire(dashboardRequire.resolve("eslint-config-next"));
const react = nextRequire("eslint-plugin-react");

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.wrangler/**",
      "**/dist/**",
      "**/coverage/**",
      "**/test-results/**",
      "**/playwright-report/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx}"],
    plugins: { react },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.node, ...globals.browser, ...globals.worker },
    },
    rules: {
      "react/jsx-uses-vars": "error",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
];
