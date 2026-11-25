import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier/flat";
import globals from "globals";

export default defineConfig([
  globalIgnores(["dist", "node_modules", "public", "webapp/public"]),

  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.strict, prettier],
    languageOptions: {
      parser: tseslint.parser,
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "error",
    },
  },
  {
    files: ["webapp/src/**/*.ts"],
    languageOptions: { globals: globals.browser },
  },
]);
