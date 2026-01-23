import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Parser } from './parser'
import type { Video, MockWebWorker } from './types'

describe('Parser', () => {
  let originalEval: typeof eval
  let originalBlob: typeof Blob
  let originalURL: typeof URL
  let originalWorker: typeof Worker
  let mockWorkerInstance: any
  let mockMockWorker: MockWebWorker

  beforeEach(() => {
    vi.clearAllMocks()

    // Store original globals
    originalEval = globalThis.eval
    originalBlob = globalThis.Blob
    originalURL = globalThis.URL
    originalWorker = globalThis.Worker

    // Create fresh mock worker instance for each test
    mockWorkerInstance = {
      onmessage: null,
      postMessage: vi.fn(),
      terminate: vi.fn()
    }

    // Mock MockWebWorker
    mockMockWorker = {
      onmessage: vi.fn(),
      onmessageCallback: vi.fn(),
      postMessage: vi.fn()
    }

    // Mock window.SVGAParserMockWorker
    ;(globalThis as any).window = (globalThis as any).window || {}
    ;(globalThis as any).window.SVGAParserMockWorker = undefined

    // Mock Blob
    globalThis.Blob = class MockBlob {
      constructor(public parts: any[], public options?: BlobPropertyBag) {}
    } as any

    // Mock URL.createObjectURL on both globalThis and window
    const mockURL = {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn()
    }
    globalThis.URL = mockURL as any
    ;(globalThis as any).window.URL = mockURL

    // Mock document.createElement for anchor element
    ;(globalThis as any).document = {
      createElement: vi.fn((tag: string) => {
        if (tag === 'a') {
          // Return a mock anchor element that converts relative URLs
          const anchor = {
            _href: '',
            get href() {
              // If the URL is relative, convert it to absolute
              if (this._href.indexOf('http') !== 0) {
                return `http://localhost/${this._href}`
              }
              return this._href
            },
            set href(value: string) {
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
    // Restore original globals
    globalThis.eval = originalEval
    globalThis.Blob = originalBlob
    globalThis.URL = originalURL
    globalThis.Worker = originalWorker
    ;(globalThis as any).window.SVGAParserMockWorker = undefined
  })

  describe('Constructor', () => {
    it('should initialize with default options and create WebWorker', () => {
      // Mock Worker constructor to return our mock instance
      globalThis.Worker = class MockWorker {
        onmessage: ((event: any) => void) | null = null
        postMessage = vi.fn()
        terminate = vi.fn()

        constructor(url: string) {
          // Copy methods from mockWorkerInstance to this instance
          Object.assign(this, mockWorkerInstance)
        }
      } as any

      const parser = new Parser()

      // Should have created a Worker
      expect(parser.worker).toBeDefined()
      expect(parser.worker instanceof (globalThis.Worker as any)).toBe(true)
    })

    it('should use mock worker when isDisableWebWorker=true', () => {
      // Mock eval to set up the mock worker
      globalThis.eval = vi.fn((code: string) => {
        if (code === '#PARSER_V2_INLINE_WORKER#') {
          ;(globalThis as any).window.SVGAParserMockWorker = mockMockWorker
        }
      }) as any

      const parser = new Parser({ isDisableWebWorker: true })

      expect(parser.worker).toBe(mockMockWorker)
    })

    it('should throw when mock worker is undefined', () => {
      // Don't set up window.SVGAParserMockWorker
      ;(globalThis as any).window.SVGAParserMockWorker = undefined

      globalThis.eval = vi.fn(() => {
        // Don't set up the mock worker
      }) as any

      expect(() => new Parser({ isDisableWebWorker: true })).toThrow('SVGAParserMockWorker undefined')
    })
  })

  describe('load() with WebWorker mode', () => {
    beforeEach(() => {
      // Set up Worker to work correctly with instanceof check
      globalThis.Worker = class MockWorker {
        onmessage: ((event: any) => void) | null = null
        postMessage = vi.fn()
        terminate = vi.fn()

        constructor(url: string) {
          Object.assign(this, mockWorkerInstance)
        }
      } as any
    })

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

      // Verify postMessage was called with absolute URL
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({
        url: 'http://localhost/./test.svga',
        options: { isDisableImageBitmapShim: false }
      })

      // Clean up - trigger onmessage to resolve promise
      const worker = parser.worker as any
      if (worker.onmessage) {
        worker.onmessage({ data: {} })
      }
      await loadPromise.catch(() => {})
    })

    it('should handle absolute URL', async () => {
      const parser = new Parser()

      const loadPromise = parser.load('http://example.com/test.svga')

      // Verify postMessage was called with the same URL
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({
        url: 'http://example.com/test.svga',
        options: { isDisableImageBitmapShim: false }
      })

      // Clean up - trigger onmessage to resolve promise
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

      // Clean up
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

      // Get reference to worker's onmessage after it's set
      await new Promise(resolve => queueMicrotask(resolve))
      const worker = parser.worker as any

      // Simulate worker response
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

      // Get reference to worker's onmessage after it's set
      await new Promise(resolve => queueMicrotask(resolve))
      const worker = parser.worker as any

      // Simulate worker error response
      if (worker.onmessage) {
        worker.onmessage({ data: mockError })
      }

      await expect(loadPromise).rejects.toThrow('[SVGA Parser Error] Test error')
    })
  })

  describe('load() with mock worker mode', () => {
    beforeEach(() => {
      // Set up Worker so instanceof check works (but worker will not pass instanceof)
      globalThis.Worker = class MockWorker {
        onmessage: ((event: any) => void) | null = null
        postMessage = vi.fn()
        terminate = vi.fn()
        constructor(url: string) {
          Object.assign(this, mockWorkerInstance)
        }
      } as any

      // Set up mock worker
      globalThis.eval = vi.fn((code: string) => {
        if (code === '#PARSER_V2_INLINE_WORKER#') {
          ;(globalThis as any).window.SVGAParserMockWorker = mockMockWorker
        }
      }) as any
    })

    it('should call onmessageCallback and onmessage synchronously', async () => {
      const parser = new Parser({ isDisableWebWorker: true })
      const mockVideo = { videoItem: {} } as Video

      // Set up onmessage to resolve with mock video BEFORE calling load
      mockMockWorker.onmessage = vi.fn(({ data }: { data: any }) => {
        // Simulate the worker calling onmessageCallback with the result
        if (mockMockWorker.onmessageCallback) {
          mockMockWorker.onmessageCallback(mockVideo)
        }
      })

      const loadPromise = parser.load('http://example.com/test.svga')

      // Verify onmessage was called
      expect(mockMockWorker.onmessage).toHaveBeenCalledWith({
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

      // Set up onmessage to call onmessageCallback with error BEFORE calling load
      mockMockWorker.onmessage = vi.fn(({ data }: { data: any }) => {
        if (mockMockWorker.onmessageCallback) {
          mockMockWorker.onmessageCallback(mockError)
        }
      })

      const loadPromise = parser.load('http://example.com/test.svga')

      await expect(loadPromise).rejects.toThrow('[SVGA Parser Error] Test error')
    })
  })

  describe('destroy()', () => {
    it('should terminate WebWorker when using real Worker', () => {
      globalThis.Worker = class MockWorker {
        onmessage: ((event: any) => void) | null = null
        postMessage = vi.fn()
        terminate = vi.fn()

        constructor(url: string) {
          Object.assign(this, mockWorkerInstance)
        }
      } as any

      const parser = new Parser()
      parser.destroy()

      expect(mockWorkerInstance.terminate).toHaveBeenCalled()
    })

    it('should not terminate when using mock worker', () => {
      // Set up Worker so instanceof check works
      globalThis.Worker = class MockWorker {
        onmessage: ((event: any) => void) | null = null
        postMessage = vi.fn()
        terminate = vi.fn()
        constructor(url: string) {
          Object.assign(this, mockWorkerInstance)
        }
      } as any

      globalThis.eval = vi.fn((code: string) => {
        if (code === '#PARSER_V2_INLINE_WORKER#') {
          ;(globalThis as any).window.SVGAParserMockWorker = mockMockWorker
        }
      }) as any

      const parser = new Parser({ isDisableWebWorker: true })
      parser.destroy()

      // Mock worker doesn't have terminate method
      expect(mockMockWorker.terminate).toBeUndefined()
    })
  })
})
