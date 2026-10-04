import { defineConfig, devices } from "@playwright/test";

// Smoke tests against a production build served locally (`pnpm build` first).
// Set E2E_BASE_URL to test a server you started yourself instead.
const PORT = 7121;
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  use: { baseURL, headless: true },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm start --hostname 127.0.0.1 --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: false,
      },
});
