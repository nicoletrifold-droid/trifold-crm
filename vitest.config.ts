import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  resolve: {
    alias: {
      "@web": path.resolve(__dirname, "packages/web/src"),
      "server-only": path.resolve(__dirname, "packages/web/src/__mocks__/server-only.ts"),
    },
  },
  test: {
    include: [
      "packages/ai/src/**/*.test.ts",
      "packages/shared/src/**/*.test.ts",
      "packages/web/src/**/*.test.ts",
      // Story 900-2a: os scripts de raiz (gate de tenancy) também têm testes. Sem esta
      // linha eles existem no repo e nunca rodam — pior que não existir, porque passam a
      // impressão de estarem cobertos.
      "scripts/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", ".aios-core/**"],
  },
})
