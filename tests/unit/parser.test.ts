import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Parser } from '../../src/parser'
import { Video } from '../../src/types'

interface RequestEnvelope {
  requestId: number
  url: string
}

interface ResponseEnvelope {
  requestId: number
  video?: Video
  error?: { name: string, message: string }
}

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent<ResponseEnvelope>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: ((event: MessageEvent) => void) | null = null
  readonly requests: RequestEnvelope[] = []
  terminated = 0

  constructor (public readonly blobUrl: string) {
    FakeWorker.instances.push(this)
  }

  postMessage (request: RequestEnvelope): void {
    this.requests.push(request)
  }

  terminate (): void {
    this.terminated++
  }

  respond (response: ResponseEnvelope): void {
    this.onmessage?.({ data: response } as MessageEvent<ResponseEnvelope>)
  }
}

const video = (version: string): Video => ({
  version,
  size: { width: 1, height: 1 },
  fps: 1,
  frames: 1,
  images: {},
  replaceElements: {},
  dynamicElements: {},
  sprites: []
})

describe('Parser request lifecycle', () => {
  const revokeObjectURL = vi.fn()

  beforeEach(() => {
    FakeWorker.instances = []
    revokeObjectURL.mockReset()
    vi.stubGlobal('Worker', FakeWorker)
    vi.stubGlobal('window', {
      URL: {
        createObjectURL: vi.fn(() => 'blob:parser'),
        revokeObjectURL
      },
      SVGAParserMockWorker: undefined
    })
    vi.stubGlobal('document', {
      baseURI: 'https://example.test/base/',
      createElement: () => {
        let href = ''
        return {
          get href () { return href },
          set href (value: string) { href = new URL(value, 'https://example.test/base/').href }
        }
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('matches two out-of-order responses with one installed handler', async () => {
    const parser = new Parser()
    const worker = FakeWorker.instances[0]
    const handler = worker.onmessage
    const first = parser.load('/first.svga')
    const second = parser.load('/second.svga')

    expect(worker.onmessage).toBe(handler)
    expect(worker.requests.map(item => item.url)).toEqual([
      'https://example.test/first.svga',
      'https://example.test/second.svga'
    ])
    worker.respond({ requestId: worker.requests[1].requestId, video: video('second') })
    worker.respond({ requestId: worker.requests[0].requestId, video: video('first') })

    await expect(first).resolves.toMatchObject({ version: 'first' })
    await expect(second).resolves.toMatchObject({ version: 'second' })
  })

  it('resolves relative URLs with the native URL constructor', async () => {
    const createElement = vi.fn(() => {
      let href = ''
      return {
        get href () { return href },
        set href (value: string) { href = new URL(value, 'https://example.test/base/').href }
      }
    })
    vi.stubGlobal('document', {
      baseURI: 'https://example.test/base/page.html',
      createElement
    })
    const parser = new Parser()
    const worker = FakeWorker.instances[0]
    const result = parser.load('../modern.svga')

    expect(worker.requests[0].url).toBe('https://example.test/modern.svga')
    expect(createElement).not.toHaveBeenCalled()
    worker.respond({ requestId: worker.requests[0].requestId, video: video('modern') })
    await expect(result).resolves.toMatchObject({ version: 'modern' })
  })

  it('matches 1000 responses delivered in reverse order', async () => {
    const parser = new Parser()
    const worker = FakeWorker.instances[0]
    const pending = Array.from({ length: 1000 }, (_, index) => parser.load(`/item-${index}.svga`))

    for (let index = 999; index >= 0; index--) {
      worker.respond({ requestId: worker.requests[index].requestId, video: video(String(index)) })
    }

    await expect(Promise.all(pending)).resolves.toEqual(
      Array.from({ length: 1000 }, (_, index) => expect.objectContaining({ version: String(index) }))
    )
  })

  it('destroys idempotently, rejects pending and future loads, and revokes its Blob URL', async () => {
    const parser = new Parser()
    const worker = FakeWorker.instances[0]
    const first = parser.load('/first.svga')
    const second = parser.load('/second.svga')

    parser.destroy()
    parser.destroy()

    await expect(first).rejects.toThrow('destroyed')
    await expect(second).rejects.toThrow('destroyed')
    await expect(parser.load('/later.svga')).rejects.toThrow('destroyed')
    expect(worker.terminated).toBe(1)
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  it('revokes the Blob URL and preserves the error when Worker construction fails', () => {
    const expected = new Error('Worker construction failed')
    vi.stubGlobal('Worker', class {
      constructor () { throw expected }
    })

    expect(() => new Parser()).toThrow(expected)
    expect(window.URL.createObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:parser')
  })

  it.each(['onerror', 'onmessageerror'] as const)('%s rejects every pending request', async eventName => {
    const parser = new Parser()
    const worker = FakeWorker.instances[0]
    const first = parser.load('/first.svga')
    const second = parser.load('/second.svga')

    if (eventName === 'onerror') {
      worker.onerror?.({ message: 'worker crashed' } as ErrorEvent)
    } else {
      worker.onmessageerror?.({ data: null } as MessageEvent)
    }

    await expect(first).rejects.toBeInstanceOf(Error)
    await expect(second).rejects.toBeInstanceOf(Error)
    await expect(parser.load('/after-worker-failure.svga')).rejects.toBeInstanceOf(Error)
    expect(worker.terminated).toBe(1)
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  it('keeps disabled-Worker parser instances isolated', async () => {
    const mocks: Array<{
      onmessageCallback: (data: ResponseEnvelope) => void
      onresponse: (data: ResponseEnvelope) => void
      onmessage: (event: { data: RequestEnvelope }) => void
      postMessage: (data: ResponseEnvelope) => void
      requests: RequestEnvelope[]
    }> = []
    window.eval = () => {
      const mock = {
        onmessageCallback: (_data: ResponseEnvelope) => {},
        onresponse: (_data: ResponseEnvelope) => {},
        requests: [] as RequestEnvelope[],
        postMessage (data: ResponseEnvelope) { this.onresponse(data) },
        onmessage (event: { data: RequestEnvelope }) { this.requests.push(event.data) }
      }
      mocks.push(mock)
      window.SVGAParserMockWorker = mock as never
    }
    const firstParser = new Parser({ isDisableWebWorker: true })
    const secondParser = new Parser({ isDisableWebWorker: true })
    const first = firstParser.load('/first.svga')
    const second = secondParser.load('/second.svga')

    mocks[1].onresponse({ requestId: mocks[1].requests[0].requestId, video: video('second') })
    mocks[0].onresponse({ requestId: mocks[0].requests[0].requestId, video: video('first') })

    await expect(first).resolves.toMatchObject({ version: 'first' })
    await expect(second).resolves.toMatchObject({ version: 'second' })
  })

  it('detaches destroyed direct parser callbacks and only clears its own global mock', () => {
    const mocks: Array<{
      onmessageCallback: (data: ResponseEnvelope) => void
      onresponse: (data: ResponseEnvelope) => void
      onmessage: (event: { data: RequestEnvelope }) => void
      postMessage: (data: ResponseEnvelope) => void
    }> = []
    window.eval = () => {
      const mock = {
        onmessageCallback: (_data: ResponseEnvelope) => {},
        onresponse: (_data: ResponseEnvelope) => {},
        postMessage (data: ResponseEnvelope) { this.onresponse(data) },
        onmessage (_event: { data: RequestEnvelope }) {}
      }
      mocks.push(mock)
      window.SVGAParserMockWorker = mock as never
    }
    const first = new Parser({ isDisableWebWorker: true })
    const firstCallback = mocks[0].onmessageCallback
    const firstResponse = mocks[0].onresponse
    const second = new Parser({ isDisableWebWorker: true })
    const secondCallback = mocks[1].onmessageCallback
    const secondResponse = mocks[1].onresponse

    first.destroy()

    expect(mocks[0].onmessageCallback).not.toBe(firstCallback)
    expect(mocks[0].onresponse).not.toBe(firstResponse)
    expect(window.SVGAParserMockWorker).toBe(mocks[1])

    second.destroy()

    expect(mocks[1].onmessageCallback).not.toBe(secondCallback)
    expect(mocks[1].onresponse).not.toBe(secondResponse)
    expect(window.SVGAParserMockWorker).toBeUndefined()
  })

  it('recreates serialized worker failures as Error instances', async () => {
    const parser = new Parser()
    const worker = FakeWorker.instances[0]
    const result = parser.load('/broken.svga')
    worker.respond({
      requestId: worker.requests[0].requestId,
      error: { name: 'SyntaxError', message: 'bad payload' }
    })

    await expect(result).rejects.toMatchObject({ name: 'SyntaxError', message: 'bad payload' })
    await expect(result).rejects.toBeInstanceOf(Error)
  })

  it('restores null-prototype dictionaries after a real structured clone', async () => {
    const parser = new Parser()
    const worker = FakeWorker.instances[0]
    const result = parser.load('/dangerous-keys.svga')
    const source = video('cloned')
    source.images = Object.create(null)
    Object.defineProperty(source.images, '__proto__', { enumerable: true, value: 'proto-image' })
    Object.defineProperty(source.images, 'constructor', { enumerable: true, value: 'constructor-image' })
    source.replaceElements = Object.create(null)
    source.dynamicElements = Object.create(null)

    const clonedResponse = structuredClone({
      requestId: worker.requests[0].requestId,
      video: source
    })
    const clonedReplaceElements = clonedResponse.video.replaceElements
    const clonedDynamicElements = clonedResponse.video.dynamicElements
    worker.respond(clonedResponse)
    const parsed = await result

    expect(Object.getPrototypeOf(parsed.images)).toBeNull()
    expect(parsed.replaceElements).toBe(clonedReplaceElements)
    expect(parsed.dynamicElements).toBe(clonedDynamicElements)
    expect(Object.getPrototypeOf(parsed.replaceElements)).toBe(Object.prototype)
    expect(Object.getPrototypeOf(parsed.dynamicElements)).toBe(Object.prototype)
    expect(Object.prototype.hasOwnProperty.call(parsed.images, '__proto__')).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(parsed.images, 'constructor')).toBe(true)
  })
})
