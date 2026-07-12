import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for the forced first-login password-change flow.
 *
 * The building-charges frontend and api-server must already be running via
 * their Replit workflows; the shared proxy exposes them at localhost:80. Set
 * E2E_BASE_URL to override (e.g. the published domain).
 *
 * global-setup provisions a temporary Supabase admin account and global-teardown
 * removes every account created by the run (prefix `e2e-pw-`).
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:80",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
