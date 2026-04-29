import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: [
      "packages/ai/src/**/*.test.ts",
      "packages/shared/src/**/*.test.ts",
      "packages/web/src/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", ".aios-core/**"],
  },
})
