import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  forbidOnly: true,
  outputDir: 'test-results',
  webServer: {
    command: 'node scripts/serve-visual-test.mjs --baseline local',
    reuseExistingServer: !process.env.CI,
    url: 'http://127.0.0.1:4173'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    }
  ],
  reporter: 'line',
  testDir: 'tests/browser',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true
  },
  workers: 1
})
