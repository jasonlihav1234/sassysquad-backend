import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

/** @type {import('eslint').Linter.Configp[]}  */
export default [
  // 1. global ignore
  { ignores: ["dist", "node_modules", ".bun", "coverage"] },

  {
    files: ["**/*.{js, mjs, cjs, jsx}"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      parser: tseslint.parser,
      parserOptions: {
        sourceType: "module"
      }
    }
  },

  pluginJs.configs.recommended,

  {
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", {"argsIgnorePattern": "^_"}],
      "semi": ["error", "always"],
      "eqeqeq": ["error", "always"]
    }
  }
];
