import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/", "src/generated/"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["*.config.mjs"],
    languageOptions: { globals: { process: "readonly" } },
  },
);
