import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "src/lib/renderer/shaders/generated"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // React hooks — classic rules only, no compiler rules
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Disable React Compiler rules (not using compiler in this project)
      "react-hooks/no-access-state-in-setstate": "off",
      "react-hooks/no-set-state-in-effect-cleanup": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/no-set-state-in-passive-effects": "off",
      // React refresh
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // TypeScript
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      // Allow control chars in regex (used for binary file detection)
      "no-control-regex": "off",
    },
  },
  prettier,
);
