import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi", ".vercel", "tools/.venv"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
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
    },
  },
  {
    // Code that runs in the browser never imports server-only modules (secrets,
    // service keys, paid API calls). Types are fine: they vanish at build time.
    // Server code is reached through `createServerFn` in `*.functions.ts`.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.server.ts", "src/**/*.functions.ts", "src/server.ts", "src/test/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/*.server", "**/*.server.ts"],
              allowTypeImports: true,
              message:
                "Browser code can't import server-only modules. Call a server function from a `*.functions.ts` file instead (type imports are fine).",
            },
          ],
        },
      ],
    },
  },
  eslintPluginPrettier,
);
