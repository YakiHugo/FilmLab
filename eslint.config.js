import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "server/dist",
      "node_modules",
      "src/lib/renderer/shaders/generated",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "no-control-regex": "off",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/no-access-state-in-setstate": "off",
      "react-hooks/no-set-state-in-effect-cleanup": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/no-set-state-in-passive-effects": "off",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}", "server/src/**/*.ts", "shared/**/*.ts"],
    ignores: [
      "src/utils/createId.ts",
      "shared/createId.ts",
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "crypto",
              importNames: ["randomUUID"],
              message:
                "Do not inline runtime ID generation with randomUUID(). Reuse shared/createId.ts instead.",
            },
            {
              name: "node:crypto",
              importNames: ["randomUUID"],
              message:
                "Do not inline runtime ID generation with randomUUID(). Reuse shared/createId.ts instead.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message:
            "Do not inline runtime ID generation with Math.random(). Reuse shared/createId.ts instead.",
        },
        {
          selector: "MemberExpression[property.name='randomUUID']",
          message:
            "Do not inline runtime ID generation with randomUUID(). Reuse shared/createId.ts instead.",
        },
        {
          selector: "MemberExpression[computed=true][property.value='randomUUID']",
          message:
            "Do not inline runtime ID generation with randomUUID(). Reuse shared/createId.ts instead.",
        },
        {
          selector:
            "Property[key.name='randomUUID'][parent.type='ObjectPattern']",
          message:
            "Do not inline runtime ID generation with randomUUID(). Reuse shared/createId.ts instead.",
        },
        {
          selector: "FunctionDeclaration[id.name='createId']",
          message:
            "Do not redefine createId in runtime code. Import the shared helper from shared/createId.ts.",
        },
        {
          selector: "VariableDeclarator[id.name='createId']",
          message:
            "Do not redefine createId in runtime code. Import the shared helper from shared/createId.ts.",
        },
      ],
    },
  },
  prettier,
);
