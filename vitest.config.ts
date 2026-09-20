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
    // *.test.mjs files are node:test / Playwright scripts with their own npm
    // scripts (test:yaniv-edge, test:yaniv-rule-gates); vitest must not collect
    // them. Real vitest suites under tests/e2e/*.test.ts still run.
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.test.mjs"],
  },
});
