import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: process.env.CANVAS_URL ?? "http://127.0.0.1:4327",
    viewport: { width: 1440, height: 960 },
    launchOptions: {
      executablePath: process.env.CANVAS_BROWSER,
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  webServer: {
    command: "npm run dev -- --port 4327 --strictPort",
    url: "http://127.0.0.1:4327",
    reuseExistingServer: false,
  },
  reporter: "list",
});
