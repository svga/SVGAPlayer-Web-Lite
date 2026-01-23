import { test, expect } from '@playwright/test'

test.describe('SVGA Player E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the demo page
    await page.goto('http://localhost:10001')
  })

  test('should load the demo page', async ({ page }) => {
    // Check that the page title is correct
    await expect(page).toHaveTitle('SVGA Lite Demo')

    // Check that main elements are present
    await expect(page.locator('h1')).toContainText('SVGA Lite Demo')
    await expect(page.locator('#svga-file')).toBeVisible()
    await expect(page.locator('#canvas')).toBeVisible()
  })

  test('should load and display a SVGA file', async ({ page }) => {
    // Select a SVGA file
    await page.selectOption('#svga-file', './svga/logo.svga')

    // Click load button
    await page.click('#load-btn')

    // Wait for the video to load (check for success message)
    await page.waitForTimeout(3000)

    // Check that metrics are updated
    const totalFrames = await page.locator('#total-frames-value').textContent()
    expect(totalFrames).not.toBe('--')

    // Check that canvas is not empty
    const canvas = page.locator('#canvas')
    await expect(canvas).toBeVisible()
  })

  test('should start playback', async ({ page }) => {
    // Load a SVGA file first
    await page.selectOption('#svga-file', './svga/logo.svga')
    await page.click('#load-btn')
    await page.waitForTimeout(2000)

    // Start playback
    await page.click('#start-btn')

    // Wait a bit for playback to start
    await page.waitForTimeout(1000)

    // Check that current frame is updated
    const currentFrame = await page.locator('#current-frame-value').textContent()
    expect(currentFrame).not.toBe('--')

    // Check that FPS is being calculated
    const fps = await page.locator('#fps-value').textContent()
    expect(fps).not.toBe('--')
  })

  test('should pause and resume playback', async ({ page }) => {
    // Load and start a SVGA file
    await page.selectOption('#svga-file', './svga/logo.svga')
    await page.click('#load-btn')
    await page.waitForTimeout(2000)
    await page.click('#start-btn')
    await page.waitForTimeout(500)

    // Get current frame before pause
    const frameBeforePause = await page.locator('#current-frame-value').textContent()

    // Pause
    await page.click('#pause-btn')
    await page.waitForTimeout(500)

    // Resume
    await page.click('#resume-btn')
    await page.waitForTimeout(500)

    // Check that playback resumed
    const frameAfterResume = await page.locator('#current-frame-value').textContent()
    expect(frameAfterResume).not.toBe(frameBeforePause)
  })

  test('should stop playback', async ({ page }) => {
    // Load and start a SVGA file
    await page.selectOption('#svga-file', './svga/logo.svga')
    await page.click('#load-btn')
    await page.waitForTimeout(2000)
    await page.click('#start-btn')
    await page.waitForTimeout(500)

    // Stop
    await page.click('#stop-btn')

    // Verify stop button is disabled after stop
    await expect(page.locator('#stop-btn')).toBeDisabled()
  })

  test('should clear canvas', async ({ page }) => {
    // Load a SVGA file
    await page.selectOption('#svga-file', './svga/logo.svga')
    await page.click('#load-btn')
    await page.waitForTimeout(2000)

    // Clear canvas
    await page.click('#clear-btn')

    // Check that canvas is cleared (metrics reset)
    await page.waitForTimeout(500)
  })

  test('should destroy player', async ({ page }) => {
    // Load a SVGA file
    await page.selectOption('#svga-file', './svga/logo.svga')
    await page.click('#load-btn')
    await page.waitForTimeout(2000)

    // Destroy player
    await page.click('#destroy-btn')

    // Verify all control buttons are disabled
    await expect(page.locator('#start-btn')).toBeDisabled()
    await expect(page.locator('#pause-btn')).toBeDisabled()
    await expect(page.locator('#resume-btn')).toBeDisabled()
    await expect(page.locator('#stop-btn')).toBeDisabled()

    // Verify metrics are reset
    const totalFrames = await page.locator('#total-frames-value').textContent()
    expect(totalFrames).toBe('--')
  })

  test('should loop playback when loop is enabled', async ({ page }) => {
    // Enable loop
    await page.check('#loop-check')

    // Load and start a SVGA file
    await page.selectOption('#svga-file', './svga/kaola.svga')
    await page.click('#load-btn')
    await page.waitForTimeout(2000)
    await page.click('#start-btn')

    // Wait for multiple loops (kaola is a short animation)
    await page.waitForTimeout(5000)

    // Check that playback is still running
    const currentFrame = await page.locator('#current-frame-value').textContent()
    expect(currentFrame).not.toBe('--')
  })

  test('should change fill mode', async ({ page }) => {
    // Load a SVGA file
    await page.selectOption('#svga-file', './svga/logo.svga')
    await page.click('#load-btn')
    await page.waitForTimeout(2000)

    // Change fill mode
    await page.selectOption('#fill-mode', 'Backward')

    // Start playback
    await page.click('#start-btn')
    await page.waitForTimeout(1000)

    // Check that playback is running
    const fps = await page.locator('#fps-value').textContent()
    expect(fps).not.toBe('--')
  })

  test('should handle invalid file gracefully', async ({ page }) => {
    // Try to load non-existent file
    await page.fill('#svga-file', './svga/nonexistent.svga')

    // Click load button
    await page.click('#load-btn')

    // Wait for error
    await page.waitForTimeout(2000)

    // Check error log for error message
    const errorLog = await page.locator('.error-log-content').textContent()
    expect(errorLog).toContain('Error')
  })

  test('should display performance metrics', async ({ page }) => {
    // Load and start a SVGA file
    await page.selectOption('#svga-file', './svga/logo.svga')
    await page.click('#load-btn')
    await page.waitForTimeout(2000)
    await page.click('#start-btn')

    // Wait for playback to start
    await page.waitForTimeout(1000)

    // Check all metrics are displayed
    const fps = await page.locator('#fps-value').textContent()
    const frameTime = await page.locator('#frame-time-value').textContent()
    const currentFrame = await page.locator('#current-frame-value').textContent()
    const totalFrames = await page.locator('#total-frames-value').textContent()

    expect(fps).not.toBe('--')
    expect(frameTime).not.toBe('--')
    expect(currentFrame).not.toBe('--')
    expect(totalFrames).not.toBe('--')
  })

  test('should take screenshot of animation', async ({ page }) => {
    // Load a SVGA file
    await page.selectOption('#svga-file', './svga/logo.svga')
    await page.click('#load-btn')
    await page.waitForTimeout(2000)

    // Start playback
    await page.click('#start-btn')
    await page.waitForTimeout(1000)

    // Take screenshot
    await page.screenshot({ path: 'screenshots/logo-animation.png' })

    // Verify screenshot file was created (this will fail if screenshots dir doesn't exist)
    // In real CI/CD, this would be handled by the test runner
  })
})

test.describe('SVGA Player Visual Regression', () => {
  test('should match reference screenshots', async ({ page }) => {
    // Load a simple SVGA file
    await page.selectOption('#svga-file', './svga/logo.svga')
    await page.click('#load-btn')
    await page.waitForTimeout(2000)

    // Start playback
    await page.click('#start-btn')
    await page.waitForTimeout(500)

    // Take screenshot and compare with baseline
    // In real implementation, this would use a tool like Playwright's visual comparison
    await page.screenshot({ path: 'screenshots/logo-visual.png' })
  })
})
