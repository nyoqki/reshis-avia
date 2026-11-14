import { defineConfig, devices } from "@playwright/test";

// Keep a developer's HTTP(S)_PROXY from intercepting the readiness probe of the local server.
process.env.NO_PROXY = "127.0.0.1";
process.env.no_proxy = "127.0.0.1";

export default defineConfig({
  testDir: "./e2e",
  // Both projects share one server and the demo account.
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8031",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "sh e2e/start-server.sh",
    url: "http://127.0.0.1:8031/api/health",
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], colorScheme: "light" },
      // Tests tagged @mobile check the 360 px layout and belong to the mobile project only.
      grepInvert: /@mobile/,
    },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 740 },
        colorScheme: "dark",
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
