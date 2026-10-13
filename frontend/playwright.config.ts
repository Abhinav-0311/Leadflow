import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100", channel: "chromium", timezoneId: "Asia/Kolkata", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
  webServer: [
    {
      command: `"${process.platform === "win32" ? "..\\.venv\\Scripts\\python.exe" : "../.venv/bin/python"}" -m uvicorn app.main:app --host 127.0.0.1 --port 18000`,
      cwd: "../backend",
      env: { DATABASE_URL: "sqlite:///./e2e.db" },
      url: "http://127.0.0.1:18000/api/health",
      reuseExistingServer: false,
    },
    {
      command: "npx next dev --hostname 127.0.0.1 --port 3100",
      env: { API_URL: "http://127.0.0.1:18000" },
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
