import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.mjs",
  fullyParallel: true,
  retries: 0,
  use: {baseURL:"http://127.0.0.1:8000",...devices["Desktop Chrome"],headless:true},
  webServer: {
    command:"python3 -m http.server 8000 --bind 127.0.0.1",
    url:"http://127.0.0.1:8000/",
    reuseExistingServer:!process.env.CI,
    timeout:30000
  }
});
