import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
// Story 900-14 — piso de isolamento das rotas em service-role.
import noUnscopedAdminClient from "./eslint-rules/no-unscoped-admin-client.mjs";

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
  {
    // Story 900-14: `warn`, não `error`, e isso é deliberado — 178 arquivos de legado ainda
    // usam o client cru. Virar `error` antes de migrá-los quebraria o build no primeiro dia.
    // A promoção para `error` é da 900-15, junto com a migração das rotas.
    plugins: { aios: { rules: { "no-unscoped-admin-client": noUnscopedAdminClient } } },
    rules: { "aios/no-unscoped-admin-client": "warn" },
  },
]);

export default eslintConfig;
