import { defineConfig } from '@playwright/test';

if (!process.env.Z_READER_PERF_BASE_URL) {
  throw new Error('Run npm run test:perf:production to start isolated production servers.');
}

export default defineConfig({
  testDir: './tests/performance',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  outputDir: 'performance-results/artifacts',
  reporter: [['list'], ['json', { outputFile: 'performance-results/results.json' }]],
  use: {
    baseURL: process.env.Z_READER_PERF_BASE_URL,
    browserName: 'chromium',
    viewport: { width: 1280, height: 800 },
    locale: 'zh-CN',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {},
  },
});
