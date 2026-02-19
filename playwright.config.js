import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Open Claude Cowork smoke tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',

  // Maximum time one test can run for
  timeout: 90 * 1000,

  expect: {
    /**
     * Maximum time expect() should wait for the condition to be met.
     */
    timeout: 10000
  },

  // Only run true E2E smoke tests from this suite.
  testMatch: ['**/smoke.spec.js', '**/critical-user-journeys.spec.js'],

  outputDir: 'output/playwright/artifacts',

  // Run tests in files in parallel, but keep tests within each file serial by default
  fullyParallel: false,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only (flaky network/UI timing recovery)
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use
  reporter: [
    ['list'],
    ['json', { outputFile: 'output/playwright/reports/results.json' }],
    ['junit', { outputFile: 'output/playwright/reports/junit.xml' }],
    ['html', { outputFolder: 'output/playwright/report', open: 'never' }]
  ],

  // Shared settings for all the projects below
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    baseURL: process.env.BASE_URL || 'http://localhost:3001',
    actionTimeout: 15000,
    navigationTimeout: 60000,

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // Mobile viewports
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  // Run your local dev server before starting the tests
  webServer: {
    command: 'npm run start:server',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
