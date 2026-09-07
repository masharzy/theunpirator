import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions:
      process.platform === "win32"
        ? { executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" }
        : {},
  },
  webServer: process.env.CI
    ? undefined
    : {
        command: "node node_modules/next/dist/bin/next dev --port 3100",
        url: "http://localhost:3100",
        reuseExistingServer: true,
      },
});
