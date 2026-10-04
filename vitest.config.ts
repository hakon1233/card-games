import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    // tests/e2e holds Playwright specs, run by `pnpm test:e2e`.
    exclude: ["**/node_modules/**", "**/dist/**", "tests/e2e/**"],
  },
});
