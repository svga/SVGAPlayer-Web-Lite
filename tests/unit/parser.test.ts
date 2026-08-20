import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Parser } from '../../src/parser'
import type { Video } from '../../src/types'

type Request =
  | { requestId: number, url: string }
  | { requestId: number, cancel: true }
  | { cancel: true }
type Response = { requestId: number, video?: Video, error?: { name: string, message: string } }

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent<Response>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: ((event: MessageEvent) => void) | null = null
  readonly requests: Request[] = []
  terminated = 0

  constructor (public readonly blobUrl: string) { FakeWorker.instances.push(this) }
  postMessage (request: Request): void { this.requests.push(request) }
  terminate (): void { this.terminated++ }
  respond (response: Response): void { this.onmessage?.({ data: response } as MessageEvent<Response>) }
}

const nullMap = <T> (): Record<string, T> => Object.create(null) as Record<string, T>
const video = (version: string): Video => ({
  version,
  size: { width: 1, height: 1 },
  fps: 1,
  frames: 1,
  images: nullMap(),
  replaceElements: nullMap(),
  dynamicElements: nullMap(),
  sprites: []
})

describe('Parser request lifecycle', () => {
  const revokeObjectURL = vi.fn()

  beforeEach(() => {
    FakeWorker.instances = []
    revokeObjectURL.mockReset()
    vi.stubGlobal('Worker', FakeWorker)
    vi.stubGlobal('window', {
      URL: { createObjectURL: vi.fn(() => 'blob:parser'), revokeObjectURL }
    })
    vi.stubGlobal('document', { baseURI: 'https://example.test/base/' })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('revokes the Blob URL immediately after successful Worker construction', () => {
    new Parser()
    expect(FakeWorker.instances[0].blobUrl).toBe('blob:parser')
    expect(revokeObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:parser')
  })

  it('revokes the Blob URL and preserves a construction failure', () => {
    const failure = Error('construction failed')
    vi.stubGlobal('Worker', class { constructor () { throw failure } })
    expect(() => new Parser()).toThrow(failure)
    expect(revokeObjectURL).toHaveBeenCalledOnce()
  })

  it('posts at most four loads, queues FIFO, and matches out-of-order responses', async () => {
    const parser = new Parser()
    const worker = FakeWorker.instances[0]
    const pending = Array.from({ length: 6 }, (_, index) => parser.load(`/item-${index}.svga`))

    expect(worker.requests.map(request => 'url' in request && request.url)).toEqual([
      'https://example.test/item-0.svga',
      'https://example.test/item-1.svga',
      'https://example.test/item-2.svga',
      'https://example.test/item-3.svga'
    ])
    const posted = worker.requests as Array<{ requestId: number, url: string }>
    worker.respond({ requestId: posted[2].requestId, video: video('2') })
    expect((worker.requests[4] as { url: string }).url).toBe('https://example.test/item-4.svga')
    worker.respond({ requestId: posted[0].requestId, video: video('0') })
    expect((worker.requests[5] as { url: string }).url).toBe('https://example.test/item-5.svga')

    const active = worker.requests.filter(request => 'url' in request) as Array<{ requestId: number, url: string }>
    for (const request of [...active].reverse()) {
      const index = Number(/item-(\d+)/.exec(request.url)?.[1])
      if (index !== 0 && index !== 2) worker.respond({ requestId: request.requestId, video: video(String(index)) })
    }
    await expect(Promise.all(pending)).resolves.toEqual(
      Array.from({ length: 6 }, (_, index) => expect.objectContaining({ version: String(index) }))
    )
  })

  it('starts the 30-second timeout only when a queued request is posted', async () => {
    vi.useFakeTimers()
    const parser = new Parser()
    const worker = FakeWorker.instances[0]
    const pending = Array.from({ length: 5 }, (_, index) => parser.load(`/item-${index}.svga`))
    const observed = pending.map(promise => promise.catch(error => error as Error))

    await vi.advanceTimersByTimeAsync(30_000)
    expect(worker.requests.filter(request => 'url' in request)).toHaveLength(5)
    const fifth = worker.requests.filter(request => 'url' in request)[4] as { requestId: number, url: string }
    expect(await Promise.all(observed.slice(0, 4))).toEqual(Array(4).fill(expect.objectContaining({ message: expect.stringContaining('timeout') })))

    await vi.advanceTimersByTimeAsync(29_999)
    worker.respond({ requestId: fifth.requestId, video: video('last') })
    await expect(pending[4]).resolves.toMatchObject({ version: 'last' })
  })

  it('allows only resolved http, https, data, and blob URLs without deduplication', async () => {
    const parser = new Parser()
    const worker = FakeWorker.instances[0]
    const allowed = [
      parser.load('/relative.svga'),
      parser.load('http://example.test/a.svga'),
      parser.load('data:application/octet-stream;base64,AA=='),
      parser.load('blob:https://example.test/id')
    ]
    const rejected = [
      parser.load('file:///tmp/a.svga'),
      parser.load('javascript:alert(1)'),
      parser.load('ftp://example.test/a.svga')
    ]
    await Promise.all(rejected.map(result => expect(result).rejects.toThrow('protocol')))
    expect(worker.requests.filter(request => 'url' in request)).toHaveLength(4)
    const first = worker.requests[0] as { requestId: number, url: string }
    worker.respond({ requestId: first.requestId, video: video('first') })
    const duplicateOne = parser.load('/same.svga')
    worker.respond({ requestId: (worker.requests[1] as { requestId: number }).requestId, video: video('http') })
    const duplicateTwo = parser.load('/same.svga')

    const loads = worker.requests.filter(request => 'url' in request) as Array<{ requestId: number, url: string }>
    expect(loads.filter(request => request.url.endsWith('/same.svga'))).toHaveLength(2)
    for (const request of loads) worker.respond({ requestId: request.requestId, video: video(request.url) })
    await Promise.all([...allowed, duplicateOne, duplicateTwo])
  })

  it('destroys once, terminates once, and rejects queued, in-flight, and future loads', async () => {
    const parser = new Parser()
    const worker = FakeWorker.instances[0]
    const pending = Array.from({ length: 6 }, (_, index) => parser.load(`/item-${index}.svga`))
    const observed = pending.map(promise => expect(promise).rejects.toThrow('destroyed'))
    parser.destroy()
    parser.destroy()
    await Promise.all(observed)
    await expect(parser.load('/later.svga')).rejects.toThrow('destroyed')
    expect(worker.terminated).toBe(1)
  })

  it('runs direct mode in a local self scope and cancels it exactly once on destroy', async () => {
    const ports: Array<{
      onmessage?: (event: { data: Request }) => void
      postMessage: (response: Response) => void
      requests: Request[]
    }> = []
    const FunctionMock = vi.fn(function () {
      return (port: typeof ports[number]) => {
        port.requests = []
        port.onmessage = event => { port.requests.push(event.data) }
        ports.push(port)
      }
    })
    vi.stubGlobal('Function', FunctionMock)

    const parser = new Parser({ isDisableWebWorker: true })
    const result = parser.load('/direct.svga')
    const request = ports[0].requests[0] as { requestId: number, url: string }
    ports[0].postMessage({ requestId: request.requestId, video: video('direct') })
    await expect(result).resolves.toMatchObject({ version: 'direct' })
    const pending = parser.load('/pending.svga')
    const observed = expect(pending).rejects.toThrow('destroyed')
    parser.destroy()
    parser.destroy()
    await observed

    expect(FunctionMock).toHaveBeenCalledWith('self', expect.any(String))
    expect(ports[0].requests.filter(item => 'cancel' in item && !('requestId' in item))).toHaveLength(1)
  })
})
