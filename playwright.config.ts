import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  forbidOnly: true,
  outputDir: 'test-results',
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
    headless: true
  },
  workers: 1
})
