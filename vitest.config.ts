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
    ],
    exclude: ["**/node_modules/**", ".aios-core/**"],
  },
})
