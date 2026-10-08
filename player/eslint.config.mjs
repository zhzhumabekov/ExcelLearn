import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/", "src/generated/", ".cache/"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["*.config.mjs", "scripts/**/*.mjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly", URL: "readonly" } },
  },
);
