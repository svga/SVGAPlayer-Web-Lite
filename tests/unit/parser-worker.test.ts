import { deflateSync } from 'node:zlib'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Video } from '../../src/types'

interface WorkerResponse {
  requestId: number
  video?: Video
  error?: { name: string, message: string }
}

type InternalMockWorker = NonNullable<Window['SVGAParserMockWorker']> & {
  onresponse: (data: WorkerResponse) => void
}

type FetchOutcome = {
  status?: number
  statusText?: string
  response?: ArrayBuffer
  error?: Error
}

const fetchOutcomes: FetchOutcome[] = []
const fakeFetch = vi.fn(async () => {
  const outcome = fetchOutcomes.shift()
  if (outcome === undefined) throw new Error('missing fetch outcome')
  if (outcome.error !== undefined) throw outcome.error
  const status = outcome.status ?? 200
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: outcome.statusText ?? '',
    arrayBuffer: async () => outcome.response as ArrayBuffer
  }
})

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

const varint = (value: number): Uint8Array => {
  const bytes: number[] = []
  let remaining = value >>> 0
  do {
    bytes.push((remaining & 0x7f) | (remaining > 0x7f ? 0x80 : 0))
    remaining >>>= 7
  } while (remaining > 0)
  return Uint8Array.from(bytes)
}

const field = (id: number, wireType: number, value: Uint8Array): Uint8Array =>
  concat(varint((id << 3) | wireType), wireType === 2 ? varint(value.length) : new Uint8Array(), value)

const textField = (id: number, value: string): Uint8Array =>
  field(id, 2, new TextEncoder().encode(value))

const floatField = (id: number, value: number): Uint8Array => {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setFloat32(0, value, true)
  return field(id, 5, bytes)
}

const frameMessage = (): Uint8Array => floatField(1, 1)

const spriteMessage = (): Uint8Array => concat(
  textField(1, 'image'),
  field(2, 2, frameMessage())
)

const paramsMessage = (params: Record<string, number>): Uint8Array => concat(
  floatField(1, params.viewBoxWidth),
  floatField(2, params.viewBoxHeight),
  field(3, 0, varint(params.fps)),
  field(4, 0, varint(params.frames))
)

const compressedMovie = (overrides: Record<string, unknown> = {}): ArrayBuffer => {
  const object = {
    version: '2.0',
    params: { viewBoxWidth: 100, viewBoxHeight: 100, fps: 20, frames: 1 },
    images: {},
    sprites: [{ imageKey: 'image', frames: [{ alpha: 1, shapes: [] }] }],
    ...overrides
  }
  const params = object.params as Record<string, number>
  const images = object.images as Record<string, Uint8Array>
  const encoded = concat(
    textField(1, object.version),
    field(2, 2, paramsMessage(params)),
    ...Object.keys(images).map(key => field(3, 2, concat(
      textField(1, key),
      field(2, 2, images[key])
    ))),
    field(4, 2, spriteMessage())
  )
  const compressed = deflateSync(encoded)
  return compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength)
}

const runWorker = async (
  response: ArrayBuffer,
  options: { disableBitmap?: boolean, status?: number, error?: Error } = {}
): Promise<{ responses: WorkerResponse[], mock: Window['SVGAParserMockWorker'] }> => {
  fetchOutcomes.push({
    response,
    status: options.status ?? 200,
    statusText: options.status === 500 ? 'Server Error' : '',
    error: options.error
  })
  if (window.SVGAParserMockWorker === undefined) await import('../../src/parser/index')
  const mock = window.SVGAParserMockWorker
  if (mock === undefined) throw new Error('mock worker missing')
  const responses: WorkerResponse[] = []
  ;(mock as InternalMockWorker).onresponse = data => { responses.push(data) }
  mock.onmessage({
    data: {
      requestId: 7,
      url: 'https://example.test/file.svga',
      options: { isDisableImageBitmapShim: options.disableBitmap ?? true }
    } as never
  })
  await vi.waitFor(() => { expect(responses).toHaveLength(1) })
  return { responses, mock }
}

describe('parser worker module', () => {
  beforeEach(() => {
    fetchOutcomes.length = 0
    fakeFetch.mockClear()
    vi.resetModules()
    vi.stubGlobal('fetch', fakeFetch)
    vi.stubGlobal('self', {
      document: {},
      createImageBitmap: undefined
    })
    vi.stubGlobal('window', { SVGAParserMockWorker: undefined })
    vi.stubGlobal('btoa', (value: string) => Buffer.from(value, 'binary').toString('base64'))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a structured-clone-safe response envelope', async () => {
    const { responses } = await runWorker(compressedMovie())

    expect(responses[0]).toMatchObject({
      requestId: 7,
      video: { version: '2.0', size: { width: 100, height: 100 } }
    })
    expect(responses[0].error).toBeUndefined()
  })

  it('keeps the declared direct-worker request and response protocol', async () => {
    fetchOutcomes.push({ response: compressedMovie(), status: 200 })
    await import('../../src/parser/index')
    const mock = window.SVGAParserMockWorker
    if (mock === undefined) throw new Error('mock worker missing')
    const responses: Array<Video | Error> = []
    mock.onmessageCallback = data => { responses.push(data) }

    await mock.onmessage({
      data: {
        url: 'https://example.test/legacy-worker.svga',
        options: { isDisableImageBitmapShim: true }
      }
    })

    expect(responses).toHaveLength(1)
    expect(responses[0]).not.toHaveProperty('requestId')
    expect(responses[0]).toMatchObject({ version: '2.0', size: { width: 100, height: 100 } })
  })

  it('downloads through fetch without requiring XMLHttpRequest', async () => {
    const response = compressedMovie()
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: async () => response
    }))
    vi.stubGlobal('XMLHttpRequest', undefined)
    vi.stubGlobal('fetch', fetch)
    await import('../../src/parser/index')
    const mock = window.SVGAParserMockWorker
    if (mock === undefined) throw new Error('mock worker missing')
    const responses: WorkerResponse[] = []
    ;(mock as InternalMockWorker).onresponse = data => { responses.push(data) }

    await mock.onmessage({
      data: {
        requestId: 8,
        url: 'https://example.test/modern.svga',
        options: { isDisableImageBitmapShim: true }
      } as never
    })

    expect(fetch).toHaveBeenCalledWith(
      'https://example.test/modern.svga',
      { signal: expect.any(AbortSignal) }
    )
    expect(responses[0]).toMatchObject({
      requestId: 8,
      video: { version: '2.0', size: { width: 100, height: 100 } }
    })
  })

  it('rejects v1 headers, bad compression, and malformed protobuf as serialized errors', async () => {
    const v1 = Uint8Array.from([80, 75, 3, 4]).buffer
    const badCompression = Uint8Array.from([0, 1, 2, 3]).buffer
    const malformed = deflateSync(Uint8Array.from([255]))
    const malformedBuffer = malformed.buffer.slice(
      malformed.byteOffset,
      malformed.byteOffset + malformed.byteLength
    )

    for (const input of [v1, badCompression, malformedBuffer]) {
      const { responses } = await runWorker(input)
      expect(responses[0]).toMatchObject({ requestId: 7, error: { message: expect.any(String) } })
      expect(responses[0].error).not.toBeInstanceOf(Error)
    }
  })

  it.each([
    ['HTTP failure', { status: 500 }],
    ['network failure', { error: new Error('network failure') }],
    ['abort', { error: Object.assign(new Error('aborted'), { name: 'AbortError' }) }]
  ] as const)('settles a %s exactly once', async (_name, outcome) => {
    const { responses } = await runWorker(compressedMovie(), outcome)

    expect(responses).toHaveLength(1)
    expect(responses[0].error?.message).toEqual(expect.any(String))
  })

  it('uses a null-prototype image dictionary and preserves dangerous own keys', async () => {
    const images = Object.create(null) as Record<string, Uint8Array>
    Object.defineProperty(images, '__proto__', { enumerable: true, value: Uint8Array.from([1]) })
    Object.defineProperty(images, 'constructor', { enumerable: true, value: Uint8Array.from([2]) })
    images.audio0 = Uint8Array.from([3])
    const { responses } = await runWorker(compressedMovie({ images }))
    const parsedImages = responses[0].video?.images

    expect(Object.getPrototypeOf(parsedImages)).toBeNull()
    expect(Object.prototype.hasOwnProperty.call(parsedImages, '__proto__')).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(parsedImages, 'constructor')).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(parsedImages, 'audio0')).toBe(false)
  })

  it('closes prior ImageBitmaps when a later conversion fails', async () => {
    const close = vi.fn()
    const createImageBitmap = vi.fn()
      .mockResolvedValueOnce({ close })
      .mockRejectedValueOnce(new Error('image decode failed'))
    ;(self as unknown as { createImageBitmap: typeof createImageBitmap }).createImageBitmap = createImageBitmap
    const { responses } = await runWorker(compressedMovie({
      images: { first: Uint8Array.from([1]), second: Uint8Array.from([2]) }
    }), { disableBitmap: false })

    expect(responses[0].error?.message).toContain('image decode failed')
    expect(close).toHaveBeenCalledOnce()
  })

  it('transfers every successfully decoded ImageBitmap from a real Worker response', async () => {
    const first = { close: vi.fn() }
    const second = { close: vi.fn() }
    const postMessage = vi.fn()
    const workerScope: {
      document: undefined
      createImageBitmap: ReturnType<typeof vi.fn>
      postMessage: ReturnType<typeof vi.fn>
      onmessage?: (event: { data: unknown }) => Promise<void>
    } = {
      document: undefined,
      createImageBitmap: vi.fn()
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(second),
      postMessage
    }
    vi.stubGlobal('self', workerScope)
    fetchOutcomes.push({
      response: compressedMovie({
        images: { first: Uint8Array.from([1]), second: Uint8Array.from([2]) }
      }),
      status: 200
    })
    await import('../../src/parser/index')

    await workerScope.onmessage?.({
      data: {
        requestId: 9,
        url: 'https://example.test/file.svga',
        options: { isDisableImageBitmapShim: false }
      }
    })

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 9, video: expect.any(Object) }),
      [first, second]
    )
    expect(first.close).not.toHaveBeenCalled()
    expect(second.close).not.toHaveBeenCalled()
  })

  it('keeps successful ImageBitmaps caller-owned in direct mock mode', async () => {
    const bitmap = { close: vi.fn() }
    ;(self as unknown as { createImageBitmap: () => Promise<typeof bitmap> }).createImageBitmap =
      vi.fn(async () => bitmap)
    fetchOutcomes.push({
      response: compressedMovie({ images: { first: Uint8Array.from([1]) } }),
      status: 200
    })
    await import('../../src/parser/index')
    const mock = window.SVGAParserMockWorker
    if (mock === undefined) throw new Error('mock worker missing')
    const postMessage = vi.spyOn(mock, 'postMessage')
    const responses: WorkerResponse[] = []
    ;(mock as InternalMockWorker).onresponse = data => { responses.push(data) }

    await mock.onmessage({
      data: {
        requestId: 10,
        url: 'https://example.test/file.svga',
        options: { isDisableImageBitmapShim: false }
      } as never
    })

    expect(responses[0].video?.images.first).toBe(bitmap)
    expect((postMessage.mock.calls[0] as unknown[])[1]).toBeUndefined()
    expect(bitmap.close).not.toHaveBeenCalled()
  })

  it('closes an ImageBitmap that finishes decoding after a direct-worker cancellation', async () => {
    const bitmap = { close: vi.fn() }
    let finishBitmap: ((value: typeof bitmap) => void) | undefined
    const createImageBitmap = vi.fn(() => new Promise<typeof bitmap>(resolve => { finishBitmap = resolve }))
    ;(self as unknown as { createImageBitmap: typeof createImageBitmap }).createImageBitmap = createImageBitmap
    fetchOutcomes.push({
      response: compressedMovie({ images: { first: Uint8Array.from([1]) } }),
      status: 200
    })
    await import('../../src/parser/index')
    const mock = window.SVGAParserMockWorker
    if (mock === undefined) throw new Error('mock worker missing')
    const parsing = mock.onmessage({
      data: {
        requestId: 11,
        url: 'https://example.test/file.svga',
        options: { isDisableImageBitmapShim: false }
      } as never
    })
    await vi.waitFor(() => { expect(createImageBitmap).toHaveBeenCalledOnce() })

    mock.onmessage({ data: { requestId: 11, cancel: true } as never })
    finishBitmap?.(bitmap)
    await parsing

    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it('cancels and closes resources from an in-flight declared legacy worker request', async () => {
    const bitmap = { close: vi.fn() }
    let finishBitmap: ((value: typeof bitmap) => void) | undefined
    const createImageBitmap = vi.fn(() => new Promise<typeof bitmap>(resolve => { finishBitmap = resolve }))
    ;(self as unknown as { createImageBitmap: typeof createImageBitmap }).createImageBitmap = createImageBitmap
    fetchOutcomes.push({
      response: compressedMovie({ images: { first: Uint8Array.from([1]) } }),
      status: 200
    })
    await import('../../src/parser/index')
    const mock = window.SVGAParserMockWorker
    if (mock === undefined) throw new Error('mock worker missing')
    const parsing = mock.onmessage({
      data: {
        url: 'https://example.test/legacy-worker.svga',
        options: { isDisableImageBitmapShim: false }
      }
    })
    await vi.waitFor(() => { expect(createImageBitmap).toHaveBeenCalledOnce() })

    mock.onmessage({ data: { cancel: true } as never })
    finishBitmap?.(bitmap)
    await parsing

    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it.each([
    { viewBoxWidth: 0, viewBoxHeight: 100, fps: 20, frames: 1 },
    { viewBoxWidth: 100, viewBoxHeight: Number.NaN, fps: 20, frames: 1 },
    { viewBoxWidth: 100, viewBoxHeight: 100, fps: -1, frames: 1 },
    { viewBoxWidth: 100, viewBoxHeight: 100, fps: 20, frames: 0 }
  ])('rejects invalid movie params: $viewBoxWidth/$viewBoxHeight/$fps/$frames', async params => {
    const { responses } = await runWorker(compressedMovie({ params }))

    expect(responses[0].error?.message).toContain('Invalid SVGA movie')
  })

  it('rejects sprites shorter than the declared frame count', async () => {
    const { responses } = await runWorker(compressedMovie({
      params: { viewBoxWidth: 100, viewBoxHeight: 100, fps: 20, frames: 2 }
    }))

    expect(responses[0].error?.message).toContain('Invalid SVGA movie')
  })
})
