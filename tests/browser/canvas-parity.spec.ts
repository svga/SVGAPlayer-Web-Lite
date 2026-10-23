import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { expect, test } from './browser-test'

test('OffscreenCanvas and HTMLCanvas render the same frame', async ({ page }) => {
  await page.goto('about:blank')
  await page.addScriptTag({ path: resolve('dist/index.min.js') })

  const evidence = await page.evaluate(async () => {
    interface BrowserPlayer {
      mount(video: unknown): Promise<void>
      stepToFrame(frame: number): void
      destroy(): void
    }
    const browserWindow = window as unknown as Window & {
      SVGA: { Player: new (options: unknown) => BrowserPlayer }
    }
    const styles = {
      fill: 'rgba(220, 30, 40, 1)',
      stroke: null,
      strokeWidth: null,
      lineCap: null,
      lineJoin: null,
      miterLimit: null,
      lineDash: null,
    }
    const identity = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
    const video = {
      version: '2.0',
      size: { width: 64, height: 64 },
      fps: 10,
      frames: 1,
      images: Object.create(null),
      replaceElements: Object.create(null),
      dynamicElements: Object.create(null),
      sprites: [
        {
          imageKey: 'shape',
          frames: [
            {
              alpha: 1,
              layout: { x: 0, y: 0, width: 64, height: 64 },
              transform: null,
              clipPath: '',
              shapes: [
                { type: 'shape', path: { d: 'M4 4 H60 V60 H4 Z' }, transform: identity, styles },
                {
                  type: 'ellipse',
                  path: { x: 32, y: 32, radiusX: 20, radiusY: 12 },
                  transform: identity,
                  styles: { ...styles, fill: 'rgba(20, 90, 200, 1)' },
                },
                {
                  type: 'rect',
                  path: { x: 12, y: 12, width: 18, height: 10, cornerRadius: 3 },
                  transform: identity,
                  styles: { ...styles, fill: 'rgba(30, 200, 120, 1)' },
                },
              ],
            },
          ],
        },
      ],
    }
    const create = (disabled: boolean): { canvas: HTMLCanvasElement; player: BrowserPlayer } => {
      const canvas = document.createElement('canvas')
      document.body.append(canvas)
      const player = new browserWindow.SVGA.Player({
        container: canvas,
        isDisableOffscreenCanvas: disabled,
      })
      return { canvas, player }
    }
    const offscreen = create(false)
    const html = create(true)
    try {
      await offscreen.player.mount(video)
      await html.player.mount(video)
      offscreen.player.stepToFrame(0)
      html.player.stepToFrame(0)
      const left = offscreen.canvas.getContext('2d')?.getImageData(0, 0, 64, 64).data
      const right = html.canvas.getContext('2d')?.getImageData(0, 0, 64, 64).data
      if (!left || !right) return { mismatches: -1, painted: 0, offscreen: false }
      let mismatches = 0
      let painted = 0
      for (let index = 0; index < left.length; index++) {
        if (left[index] !== right[index]) mismatches++
        if (left[index] !== 0) painted++
      }
      return {
        mismatches,
        painted,
        offscreen: typeof window.OffscreenCanvas === 'function',
      }
    } finally {
      offscreen.player.destroy()
      html.player.destroy()
      offscreen.canvas.remove()
      html.canvas.remove()
    }
  })

  expect(evidence.mismatches).toBe(0)
  expect(evidence.painted).toBeGreaterThan(0)
})

test('worker and direct parsers produce the same video for the same bytes', async ({ page }) => {
  const ORIGIN = 'https://parity.test'
  const fixture = await readFile(resolve('tests/fixtures/svga/11.svga'))
  await page.route(`${ORIGIN}/**`, async (route) => {
    const { pathname } = new URL(route.request().url())
    if (pathname === '/dist.js')
      return route.fulfill({
        body: await readFile(resolve('dist/index.min.js')),
        contentType: 'text/javascript',
      })
    if (pathname === '/fixture.svga')
      return route.fulfill({ body: fixture, contentType: 'application/octet-stream' })
    return route.fulfill({
      body: '<!doctype html><html><body><script src="/dist.js"></script></body></html>',
      contentType: 'text/html',
    })
  })
  await page.goto(`${ORIGIN}/`)

  const evidence = await page.evaluate(
    async ({ data }) => {
      interface BrowserParser {
        load(input: Uint8Array): Promise<{
          size: unknown
          sprites: unknown
          images: Record<string, Uint8Array>
        }>
        destroy(): void
      }
      const browserWindow = window as unknown as Window & {
        SVGA: {
          Parser: new (options?: { isDisableWebWorker: boolean }) => BrowserParser
        }
      }
      const bytes = Uint8Array.from(atob(data), (character) => character.charCodeAt(0))
      const workerParser = new browserWindow.SVGA.Parser()
      const directParser = new browserWindow.SVGA.Parser({ isDisableWebWorker: true })
      try {
        const [fromWorker, fromDirect] = await Promise.all([
          workerParser.load(bytes),
          directParser.load(bytes),
        ])
        const keys = Object.keys(fromWorker.images)
        return {
          sameSize: JSON.stringify(fromWorker.size) === JSON.stringify(fromDirect.size),
          sameSprites: JSON.stringify(fromWorker.sprites) === JSON.stringify(fromDirect.sprites),
          sameKeys: JSON.stringify(keys) === JSON.stringify(Object.keys(fromDirect.images)),
          sameBytes: keys.every((key) => {
            const left = fromWorker.images[key]
            const right = fromDirect.images[key]
            return (
              left.length === right.length && left.every((value, index) => value === right[index])
            )
          }),
          touched: bytes.byteLength,
        }
      } finally {
        workerParser.destroy()
        directParser.destroy()
      }
    },
    { data: fixture.toString('base64') },
  )

  expect(evidence.sameSize).toBe(true)
  expect(evidence.sameSprites).toBe(true)
  expect(evidence.sameKeys).toBe(true)
  expect(evidence.sameBytes).toBe(true)
  expect(evidence.touched).toBe(fixture.byteLength)
})
