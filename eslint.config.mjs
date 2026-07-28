import { defineConfig, globalIgnores } from "eslint/config";
import eslint from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
  },
  {
    ...reactHooks.configs.flat["recommended-latest"],
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
  },
  {
    ...nextPlugin.configs["core-web-vitals"],
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
  },
  globalIgnores([
    ".next/**",
    "dist/**",
    "out/**",
    "build/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
