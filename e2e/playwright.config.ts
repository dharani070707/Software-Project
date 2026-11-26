import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',

  // Shared database, so tests run one at a time to avoid interfering with each other
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: 0,                       // no retries, so a failure is a real failure in your stats

  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'results.json' }],   // use this for the pass/fail summary table
    ['list'],
  ],

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8081',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit',   use: { ...devices['Desktop Safari'] } },
  ],
});
