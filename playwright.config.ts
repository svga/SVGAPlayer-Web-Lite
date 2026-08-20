import { defineConfig, devices } from '@playwright/test'

const visualTestUrl = 'http://127.0.0.1:4174'

export default defineConfig({
  forbidOnly: true,
  outputDir: 'test-results',
  webServer: {
    command: 'SVGA_VISUAL_PORT=4174 node scripts/serve-visual-test.mjs --baseline local',
    reuseExistingServer: false,
    url: visualTestUrl
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
    baseURL: visualTestUrl,
    headless: true
  },
  workers: 1
})
