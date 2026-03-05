import globals from "globals";
import pluginJs from "@eslint/js";

/** @type {import('eslint').Linter.Configp[]}  */
export default [
  // 1. global ignore
  { ignores: ["dist", "node_modules", ".bun", "coverage"] }

  {
    files: ["**/*.{js, mjs, cjs, jsx}"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      }
    }
  },

  pluginJs.configs.recommended,

  {
    rules: {
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "no-undef": "error",
      "semi": ["error", "always"],
      "eqeqeq": ["error", "always"]
    }
  }
];
