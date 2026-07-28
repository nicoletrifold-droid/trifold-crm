import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Assets estáticos servidos como estão (ex.: opus/encoderWorker.min.js,
    // worker vendored do gravador de áudio) — não são código nosso p/ lintar.
    "public/**",
  ]),
]);

export default eslintConfig;
