import { deflateSync } from 'node:zlib'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ParserWorkerRequest, ParserWorkerResponse, ParserWorkerResult, ParserWorkerScope } from '../../src/parser/protocol'

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  let offset = 0
  for (const part of parts) { result.set(part, offset); offset += part.length }
  return result
}

const repeat = (part: Uint8Array, count: number): Uint8Array => {
  const result = new Uint8Array(part.length * count)
  for (let index = 0; index < count; index++) result.set(part, index * part.length)
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
const textField = (id: number, value: string): Uint8Array => field(id, 2, new TextEncoder().encode(value))
const floatField = (id: number, value: number): Uint8Array => {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setFloat32(0, value, true)
  return field(id, 5, bytes)
}
const frameMessage = (): Uint8Array => floatField(1, 1)
const spriteMessage = (): Uint8Array => concat(textField(1, 'image'), field(2, 2, frameMessage()))
const paramsMessage = (): Uint8Array => concat(floatField(1, 100), floatField(2, 100), field(3, 0, varint(20)), field(4, 0, varint(1)))

function movieBytes (images: Record<string, Uint8Array> = Object.create(null), targetLength?: number): Uint8Array {
  const base = concat(
    textField(1, '2.0'),
    field(2, 2, paramsMessage()),
    ...Object.keys(images).map(key => field(3, 2, concat(textField(1, key), field(2, 2, images[key])))),
    field(4, 2, spriteMessage())
  )
  if (targetLength === undefined) return base
  const tag = varint((99 << 3) | 2)
  let padding = targetLength - base.length - tag.length - 4
  while (varint(padding).length !== targetLength - base.length - tag.length - padding) padding--
  return concat(base, tag, varint(padding), new Uint8Array(padding))
}

const compressedMovie = (images?: Record<string, Uint8Array>, targetLength?: number): Uint8Array =>
  new Uint8Array(deflateSync(movieBytes(images, targetLength)))

const compressedWire = (bytes: Uint8Array): Uint8Array => new Uint8Array(deflateSync(bytes))

interface FetchResult {
  status?: number
  bytes: Uint8Array
  chunks?: number[]
  contentLength?: string
}

let fetchResult: FetchResult
let workerScope: ParserWorkerScope & { postMessage: ReturnType<typeof vi.fn<(response: ParserWorkerResponse, transfer?: Transferable[]) => void>> }
let fetchSignal: AbortSignal | undefined
let cancelReader: ReturnType<typeof vi.fn<() => Promise<void>>>
let releaseReader: ReturnType<typeof vi.fn<() => void>>

function responseBody (bytes: Uint8Array, sizes: number[]): { getReader: () => {
  read: () => Promise<{ done: boolean, value?: Uint8Array }>
  cancel: () => Promise<void>
  releaseLock: () => void
} } {
  let offset = 0
  let index = 0
  return {
    getReader: () => ({
      cancel: cancelReader,
      read: async () => {
        if (offset === bytes.length) return { done: true }
        const end = Math.min(bytes.length, offset + (sizes[index++] ?? bytes.length))
        const value = bytes.slice(offset, end)
        offset = end
        return { done: false, value }
      },
      releaseLock: releaseReader
    })
  }
}

async function runWorker (request: ParserWorkerRequest = { requestId: 7, url: 'https://example.test/file.svga' }): Promise<ParserWorkerResult> {
  await import('../../src/parser/index')
  workerScope.postMessage.mockClear()
  await workerScope.onmessage?.({ data: request } as MessageEvent<ParserWorkerRequest>)
  await vi.waitFor(() => expect(workerScope.postMessage).toHaveBeenCalled())
  return workerScope.postMessage.mock.calls[0][0] as ParserWorkerResult
}

describe('parser worker', () => {
  beforeEach(() => {
    vi.resetModules()
    fetchResult = { bytes: compressedMovie() }
    fetchSignal = undefined
    cancelReader = vi.fn(async () => {})
    releaseReader = vi.fn()
    workerScope = { postMessage: vi.fn<(response: ParserWorkerResponse, transfer?: Transferable[]) => void>() }
    vi.stubGlobal('self', workerScope)
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: { signal: AbortSignal }) => {
      fetchSignal = options.signal
      const status = fetchResult.status ?? 200
      return {
        status,
        statusText: String(status),
        headers: { get: () => fetchResult.contentLength ?? null },
        body: fetchResult.chunks ? responseBody(fetchResult.bytes, fetchResult.chunks) : undefined,
        arrayBuffer: async () => fetchResult.bytes.buffer.slice(fetchResult.bytes.byteOffset, fetchResult.bytes.byteOffset + fetchResult.bytes.byteLength)
      }
    }))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('announces readiness after installing its request handler', async () => {
    await import('../../src/parser/index')
    expect(workerScope.onmessage).toBeTypeOf('function')
    expect(workerScope.postMessage).toHaveBeenCalledOnce()
    expect(workerScope.postMessage).toHaveBeenCalledWith({ ready: true })
  })

  it('returns byte images in a null-prototype map and never uses DOM/base64 image conversion', async () => {
    const images = Object.create(null) as Record<string, Uint8Array>
    Object.defineProperty(images, '__proto__', { enumerable: true, value: Uint8Array.from([1]) })
    Object.defineProperty(images, 'constructor', { enumerable: true, value: Uint8Array.from([2]) })
    images.audio0 = Uint8Array.from([3])
    fetchResult.bytes = compressedMovie(images)
    vi.stubGlobal('createImageBitmap', vi.fn(() => { throw Error('must not run') }))
    vi.stubGlobal('btoa', vi.fn(() => { throw Error('must not run') }))

    const response = await runWorker()
    const parsed = response.video?.images
    expect(Object.getPrototypeOf(parsed)).toBeNull()
    expect(parsed?.__proto__).toEqual(Uint8Array.from([1]))
    expect(parsed?.constructor).toEqual(Uint8Array.from([2]))
    expect(parsed).not.toHaveProperty('audio0')
    expect(createImageBitmap).not.toHaveBeenCalled()
    expect(btoa).not.toHaveBeenCalled()
  })

  it('transfers every unique image ArrayBuffer in real Worker responses', async () => {
    fetchResult.bytes = compressedMovie({ first: Uint8Array.from([1]), second: Uint8Array.from([2]) })
    const response = await runWorker()
    const transfers = workerScope.postMessage.mock.calls[0][1] as ArrayBuffer[]
    const buffers = new Set(Object.values(response.video?.images ?? {}).map(image => image.buffer))
    expect(new Set(transfers)).toEqual(buffers)
    expect(transfers).toHaveLength(buffers.size)
  })

  it('accepts chunked responses and ignores dishonest Content-Length', async () => {
    fetchResult.chunks = [1, 2, 3, 4]
    fetchResult.contentLength = String(100 * 1024 * 1024)
    const response = await runWorker()
    expect(response.video?.size).toEqual({ width: 100, height: 100 })
  })

  it('enforces the compressed limit for streamed response bodies', async () => {
    fetchResult.bytes = new Uint8Array(8 * 1024 * 1024 + 1)
    fetchResult.chunks = [fetchResult.bytes.length]
    expect((await runWorker()).error?.message).toContain('8 MiB')
    expect(cancelReader).toHaveBeenCalledOnce()
    expect(releaseReader).toHaveBeenCalledOnce()
    expect(fetchSignal?.aborted).toBe(true)
  })

  it('normalizes non-Error download failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw 'network failed' }))
    expect((await runWorker()).error).toMatchObject({ name: 'Error', message: expect.stringContaining('network failed') })
  })

  it('rejects an empty compressed payload', async () => {
    fetchResult.bytes = new Uint8Array()
    expect((await runWorker()).error).toBeDefined()
  })

  it('accepts exactly 8 MiB compressed and rejects one byte over', async () => {
    const valid = compressedMovie()
    fetchResult.bytes = concat(valid, new Uint8Array(8 * 1024 * 1024 - valid.length))
    expect((await runWorker()).video).toBeDefined()

    vi.resetModules()
    workerScope = { postMessage: vi.fn<(response: ParserWorkerResponse, transfer?: Transferable[]) => void>() }
    vi.stubGlobal('self', workerScope)
    fetchResult.bytes = concat(fetchResult.bytes, Uint8Array.of(0))
    expect((await runWorker()).error?.message).toContain('8 MiB')
  })

  it('accepts exactly 16 MiB decompressed and rejects one byte over', async () => {
    fetchResult.bytes = compressedMovie(undefined, 16 * 1024 * 1024)
    expect((await runWorker()).video).toBeDefined()

    vi.resetModules()
    workerScope = { postMessage: vi.fn<(response: ParserWorkerResponse, transfer?: Transferable[]) => void>() }
    vi.stubGlobal('self', workerScope)
    fetchResult.bytes = compressedMovie(undefined, 16 * 1024 * 1024 + 1)
    expect((await runWorker()).error?.message).toContain('16 MiB')
  })

  it.each([199, 300, 304, 400, 500])('rejects non-2xx HTTP status %s', async status => {
    fetchResult.status = status
    expect((await runWorker()).error?.message).toContain(String(status))
  })

  it('rejects the v1 ZIP header at the worker call site', async () => {
    fetchResult.bytes = Uint8Array.from([80, 75, 3, 4])
    expect((await runWorker()).error?.message).toContain('version@2')
    expect(fetchSignal?.aborted).toBe(true)
  })

  it.each([
    ['sprites', repeat(field(4, 2, new Uint8Array()), 2_001)],
    ['sprite frames', field(4, 2, repeat(field(2, 2, new Uint8Array()), 500_001))],
    ['shapes', field(4, 2, field(2, 2, repeat(field(5, 2, new Uint8Array()), 100_001)))],
    ['images', repeat(field(3, 2, new Uint8Array()), 513)],
    ['audio entries', repeat(field(5, 2, new Uint8Array()), 513)],
    ['path bytes', field(4, 2, field(2, 2, field(5, 2, field(2, 2, textField(1, 'M'.repeat(1_048_577))))))]
  ])('rejects over-limit %s before the full generated decoder', async (_name, bytes) => {
    fetchResult.bytes = compressedWire(bytes)
    const { com } = await import('../../src/parser/svga.generated')
    const decode = vi.spyOn((com as any).opensource.svga.MovieEntity, 'decode')

    expect((await runWorker()).error?.message).toContain('wire')
    expect(decode).not.toHaveBeenCalled()
  })

  it.each([
    ['a group wire type', Uint8Array.of((4 << 3) | 3)],
    ['a truncated length-delimited field', Uint8Array.of((4 << 3) | 2, 2, 0)],
    ['an unterminated varint', Uint8Array.of(0x80)],
    ['field number zero', Uint8Array.of(0)]
  ])('rejects malformed wire data containing %s before decode', async (_name, bytes) => {
    fetchResult.bytes = compressedWire(bytes)
    const { com } = await import('../../src/parser/svga.generated')
    const decode = vi.spyOn((com as any).opensource.svga.MovieEntity, 'decode')

    expect((await runWorker()).error?.message).toContain('wire')
    expect(decode).not.toHaveBeenCalled()
  })

  it.each([
    ['an overflowing varint', Uint8Array.of(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f)],
    ['a ten-byte continuation varint', Uint8Array.of(0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80)],
    ['a truncated fixed64 field', Uint8Array.of((99 << 3) | 1, 0)],
    ['a truncated fixed32 field', Uint8Array.of((99 << 3) | 5, 0)]
  ])('rejects malformed wire data containing %s', async (_name, bytes) => {
    fetchResult.bytes = compressedWire(bytes)
    expect((await runWorker()).error?.message).toContain('wire')
  })

  it('accepts unknown fixed-width wire fields before decoding the remaining movie', async () => {
    fetchResult.bytes = compressedWire(concat(
      field(99, 1, new Uint8Array(8)),
      field(100, 5, new Uint8Array(4)),
      movieBytes()
    ))
    expect((await runWorker()).video?.size).toEqual({ width: 100, height: 100 })
  })

  it('aborts one direct in-flight request by ID', async () => {
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_url: string, options: { signal: AbortSignal }) => {
      signal = options.signal
      return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
    }))
    await import('../../src/parser/index')
    const parsing = workerScope.onmessage?.({ data: { requestId: 12, url: 'https://example.test/file.svga' } } as MessageEvent<ParserWorkerRequest>)
    await vi.waitFor(() => expect(signal).toBeDefined())
    await workerScope.onmessage?.({ data: { requestId: 12, cancel: true } } as MessageEvent<ParserWorkerRequest>)
    expect(signal?.aborted).toBe(true)
    await parsing
  })

  it('aborts direct in-flight work on the single cancel-all protocol message', async () => {
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_url: string, options: { signal: AbortSignal }) => {
      signal = options.signal
      return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
    }))
    await import('../../src/parser/index')
    const parsing = workerScope.onmessage?.({ data: { requestId: 11, url: 'https://example.test/file.svga' } } as MessageEvent<ParserWorkerRequest>)
    await vi.waitFor(() => expect(signal).toBeDefined())
    await workerScope.onmessage?.({ data: { cancel: true } } as MessageEvent<ParserWorkerRequest>)
    expect(signal?.aborted).toBe(true)
    await parsing
  })
})
