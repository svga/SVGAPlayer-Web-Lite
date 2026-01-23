import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Parser } from './parser'
import type { Video, MockWebWorker } from './types'

describe('Parser', () => {
  let originalWorker: typeof Worker
  let originalDocument: Document | undefined
  let mockWorkerInstance: any
  let constructedUrl: URL | undefined
  let constructedOptions: WorkerOptions | undefined

  beforeEach(() => {
    vi.clearAllMocks()

    originalWorker = globalThis.Worker
    originalDocument = (globalThis as any).document

    mockWorkerInstance = {
      onmessage: null,
      postMessage: vi.fn(),
      terminate: vi.fn()
    }
    constructedUrl = undefined
    constructedOptions = undefined

    globalThis.Worker = class MockWorker {
      onmessage: ((event: any) => void) | null = null
      postMessage = vi.fn()
      terminate = vi.fn()

      constructor (url: string | URL, options?: WorkerOptions) {
        constructedUrl = url instanceof URL ? url : new URL(url)
        constructedOptions = options
        Object.assign(this, mockWorkerInstance)
      }
    } as any

    ;(globalThis as any).document = {
      createElement: vi.fn((tag: string) => {
        if (tag === 'a') {
          const anchor = {
            _href: '',
            get href () {
              if (this._href.indexOf('http') !== 0) {
                return `http://localhost/${this._href}`
              }
              return this._href
            },
            set href (value: string) {
              this._href = value
            }
          }
          return anchor
        }
        return {}
      })
    }
  })

  afterEach(() => {
    globalThis.Worker = originalWorker
    if (originalDocument === undefined) {
      delete (globalThis as any).document
    } else {
      ;(globalThis as any).document = originalDocument
    }
  })

  describe('Constructor', () => {
    it('should initialize with default options and create WebWorker', () => {
      const parser = new Parser()

      expect(parser.worker).toBeDefined()
      expect(parser.worker instanceof (globalThis.Worker as any)).toBe(true)
      expect(String(constructedUrl)).toMatch(/parser\.worker\.js(\?|$)/)
      expect(constructedOptions).toEqual({ type: 'module' })
    })

    it('should use mock worker when isDisableWebWorker=true', () => {
      const parser = new Parser({ isDisableWebWorker: true })

      expect(parser.worker).toBeDefined()
      expect(parser.worker instanceof (globalThis.Worker as any)).toBe(false)
    })
  })

  describe('load() with WebWorker mode', () => {
    it('should throw on undefined URL', async () => {
      const parser = new Parser()

      await expect(parser.load(undefined as any)).rejects.toThrow('url undefined')
    })

    it('should throw when worker is undefined', async () => {
      const parser = new Parser()
      ;(parser as any).worker = undefined

      await expect(parser.load('test.svga')).rejects.toThrow('Parser Worker not found')
    })

    it('should convert relative URL to absolute', async () => {
      const parser = new Parser()

      const loadPromise = parser.load('./test.svga')

      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({
        url: 'http://localhost/./test.svga',
        options: { isDisableImageBitmapShim: false }
      })

      const worker = parser.worker as any
      if (worker.onmessage) {
        worker.onmessage({ data: {} })
      }
      await loadPromise.catch(() => {})
    })

    it('should handle absolute URL', async () => {
      const parser = new Parser()

      const loadPromise = parser.load('http://example.com/test.svga')

      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({
        url: 'http://example.com/test.svga',
        options: { isDisableImageBitmapShim: false }
      })

      const worker = parser.worker as any
      if (worker.onmessage) {
        worker.onmessage({ data: {} })
      }
      await loadPromise.catch(() => {})
    })

    it('should postMessage with correct data', async () => {
      const parser = new Parser()

      const loadPromise = parser.load('http://example.com/test.svga')

      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({
        url: 'http://example.com/test.svga',
        options: { isDisableImageBitmapShim: false }
      })

      const worker = parser.worker as any
      if (worker.onmessage) {
        worker.onmessage({ data: {} })
      }
      await loadPromise.catch(() => {})
    })

    it('should handle WebWorker onmessage and resolve with Video', async () => {
      const parser = new Parser()
      const mockVideo = { videoItem: {} } as Video

      const loadPromise = parser.load('http://example.com/test.svga')

      await new Promise(resolve => queueMicrotask(resolve))
      const worker = parser.worker as any

      if (worker.onmessage) {
        worker.onmessage({ data: mockVideo })
      }

      const result = await loadPromise
      expect(result).toBe(mockVideo)
    })

    it('should reject on worker error', async () => {
      const parser = new Parser()
      const mockError = new Error('[SVGA Parser Error] Test error')

      const loadPromise = parser.load('http://example.com/test.svga')

      await new Promise(resolve => queueMicrotask(resolve))
      const worker = parser.worker as any

      if (worker.onmessage) {
        worker.onmessage({ data: mockError })
      }

      await expect(loadPromise).rejects.toThrow('[SVGA Parser Error] Test error')
    })
  })

  describe('load() with mock worker mode', () => {
    it('should call onmessageCallback and onmessage synchronously', async () => {
      const parser = new Parser({ isDisableWebWorker: true })
      const mockVideo = { videoItem: {} } as Video
      const mockWorker = parser.worker as MockWebWorker

      mockWorker.onmessage = vi.fn(({ data }: { data: any }) => {
        if (mockWorker.onmessageCallback) {
          mockWorker.onmessageCallback(mockVideo)
        }
      })

      const loadPromise = parser.load('http://example.com/test.svga')

      expect(mockWorker.onmessage).toHaveBeenCalledWith({
        data: {
          url: 'http://example.com/test.svga',
          options: { isDisableImageBitmapShim: false }
        }
      })

      const result = await loadPromise
      expect(result).toBe(mockVideo)
    })

    it('should handle mock worker error', async () => {
      const parser = new Parser({ isDisableWebWorker: true })
      const mockError = new Error('[SVGA Parser Error] Test error')
      const mockWorker = parser.worker as MockWebWorker

      mockWorker.onmessage = vi.fn(({ data }: { data: any }) => {
        if (mockWorker.onmessageCallback) {
          mockWorker.onmessageCallback(mockError)
        }
      })

      const loadPromise = parser.load('http://example.com/test.svga')

      await expect(loadPromise).rejects.toThrow('[SVGA Parser Error] Test error')
    })
  })

  describe('destroy()', () => {
    it('should terminate WebWorker when using real Worker', () => {
      const parser = new Parser()
      parser.destroy()

      expect(mockWorkerInstance.terminate).toHaveBeenCalled()
    })

    it('should not terminate when using mock worker', () => {
      const parser = new Parser({ isDisableWebWorker: true })
      parser.destroy()

      const mockWorker = parser.worker as MockWebWorker
      expect((mockWorker as any).terminate).toBeUndefined()
    })
  })
})
