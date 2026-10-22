import { defineConfig, devices } from '@playwright/test'

const visualPort = Number(process.env.SVGA_VISUAL_PORT ?? 4174)
const visualTestUrl = `http://127.0.0.1:${visualPort}`

export default defineConfig({
  forbidOnly: true,
  outputDir: 'test-results',
  retries: process.env.CI ? 2 : 0,
  webServer: {
    command: 'node scripts/serve-visual-test.mjs --baseline local',
    env: { SVGA_VISUAL_PORT: String(visualPort) },
    reuseExistingServer: false,
    url: visualTestUrl,
  },
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
  ],
  reporter: [['line'], ['html', { open: 'never' }]],
  testDir: 'tests/browser',
  use: {
    baseURL: visualTestUrl,
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  workers: 1,
})
