import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Animator } from '../../src/player/animator'

interface RafHarness {
  callbacks: Map<number, FrameRequestCallback>
  cancelled: number[]
  requested: number[]
}

function installRaf (): RafHarness {
  let nextId = 1
  const callbacks = new Map<number, FrameRequestCallback>()
  const cancelled: number[] = []
  const requested: number[] = []

  vi.stubGlobal('window', {
    performance: { now: () => 0 },
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      const id = nextId++
      callbacks.set(id, callback)
      requested.push(id)
      return id
    },
    cancelAnimationFrame: (id: number) => {
      callbacks.delete(id)
      cancelled.push(id)
    },
    URL: globalThis.URL
  })
  vi.stubGlobal('performance', { now: () => 0 })

  return { callbacks, cancelled, requested }
}

describe('Animator lifecycle', () => {
  beforeEach(() => {
    installRaf()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps exactly one RAF scheduler after 1000 starts', () => {
    const raf = installRaf()
    const animator = new Animator()
    animator.__svgaStart = 2
    animator.__svgaEnd = 20
    animator.__svgaDuration = 1000
    animator.__svgaClock = () => 0
    const updates: number[] = []
    animator.__svgaOnUpdate = value => updates.push(value)

    for (let index = 0; index < 1000; index++) animator.__svgaRun()

    expect(raf.callbacks).toHaveLength(1)
    expect(raf.cancelled).toHaveLength(999)
    expect(updates).toHaveLength(1000)
    expect(updates.every(value => value === 2)).toBe(true)
  })

  it('ignores an already queued callback from an older run', () => {
    const raf = installRaf()
    const animator = new Animator()
    animator.__svgaStart = 3
    animator.__svgaEnd = 9
    animator.__svgaDuration = 100
    let now = 0
    animator.__svgaClock = () => now
    const updates: number[] = []
    animator.__svgaOnUpdate = value => updates.push(value)

    animator.__svgaRun()
    const staleCallback = raf.callbacks.get(raf.requested[0])
    animator.__svgaRun()
    now = 50
    staleCallback?.(50)

    expect(updates).toEqual([3, 3])
    expect(raf.requested).toHaveLength(2)
    expect(raf.callbacks).toHaveLength(1)
  })

  it('publishes the start value and ends without scheduling for zero duration', () => {
    const raf = installRaf()
    const animator = new Animator()
    animator.__svgaStart = 7
    animator.__svgaEnd = 7
    animator.__svgaDuration = 0
    const updates: number[] = []
    const onEnd = vi.fn()
    animator.__svgaOnUpdate = value => updates.push(value)
    animator.__svgaOnEnd = onEnd

    animator.__svgaRun()

    expect(updates).toEqual([7])
    expect(onEnd).toHaveBeenCalledOnce()
    expect(raf.requested).toHaveLength(0)
    expect(raf.callbacks).toHaveLength(0)
  })

  it('keeps a reverse frame for its full interval before stepping down', () => {
    const raf = installRaf()
    const animator = new Animator()
    animator.__svgaStart = 4
    animator.__svgaEnd = 0
    animator.__svgaDuration = 400
    let now = 0
    const updates: number[] = []
    animator.__svgaClock = () => now
    animator.__svgaOnUpdate = value => updates.push(value)

    animator.__svgaRun()
    let request = raf.requested[raf.requested.length - 1]
    now = 1
    raf.callbacks.get(request)?.(now)
    expect(updates[updates.length - 1]).toBe(4)

    request = raf.requested[raf.requested.length - 1]
    now = 100
    raf.callbacks.get(request)?.(now)
    expect(updates[updates.length - 1]).toBe(3)
  })

  it.each(['__svgaOnStart', '__svgaOnUpdate', '__svgaOnEnd'] as const)(
    'retires the scheduler when %s throws and preserves the error',
    callbackName => {
      const raf = installRaf()
      const animator = new Animator()
      animator.__svgaStart = 0
      animator.__svgaEnd = callbackName === '__svgaOnEnd' ? 0 : 10
      animator.__svgaDuration = callbackName === '__svgaOnEnd' ? 0 : 100
      const expected = new Error(callbackName)
      animator[callbackName] = () => { throw expected }

      expect(() => animator.__svgaRun()).toThrow(expected)
      expect(raf.callbacks).toHaveLength(0)
    }
  )

  it('retires a queued RAF when an update callback throws', () => {
    const raf = installRaf()
    const animator = new Animator()
    animator.__svgaStart = 0
    animator.__svgaEnd = 10
    animator.__svgaDuration = 100
    let now = 0
    animator.__svgaClock = () => now
    let updateCount = 0
    const expected = new Error('scheduled update')
    animator.__svgaOnUpdate = () => {
      updateCount++
      if (updateCount === 2) throw expected
    }

    animator.__svgaRun()
    const requestId = raf.requested[0]
    const callback = raf.callbacks.get(requestId)
    raf.callbacks.delete(requestId)
    now = 50

    expect(() => callback?.(50)).toThrow(expected)
    expect(raf.callbacks).toHaveLength(0)
  })

  it('does not let onUpdate reentrancy schedule a second chain', () => {
    const raf = installRaf()
    const animator = new Animator()
    animator.__svgaEnd = 10
    animator.__svgaDuration = 100
    let now = 0
    let updates = 0
    animator.__svgaClock = () => now
    animator.__svgaOnUpdate = () => {
      updates++
      if (updates === 2) animator.__svgaRun()
    }

    animator.__svgaRun()
    const requestId = raf.requested[0]
    const callback = raf.callbacks.get(requestId)
    raf.callbacks.delete(requestId)
    now = 50
    callback?.(50)

    expect(raf.callbacks).toHaveLength(1)
  })

  it('does not let onEnd reentrancy schedule a second chain', () => {
    const raf = installRaf()
    const animator = new Animator()
    animator.__svgaEnd = 10
    animator.__svgaDuration = 100
    let now = 0
    animator.__svgaClock = () => now
    animator.__svgaOnEnd = () => animator.__svgaRun()

    animator.__svgaRun()
    const requestId = raf.requested[0]
    const callback = raf.callbacks.get(requestId)
    raf.callbacks.delete(requestId)
    now = 100
    callback?.(100)

    expect(raf.callbacks).toHaveLength(1)
  })

  it('pairs timer Workers with termination and immediately revokes Blob URLs', () => {
    const raf = installRaf()
    const createdUrls: string[] = []
    const revokedUrls: string[] = []
    const workers: FakeWorker[] = []

    class FakeWorker {
      public onmessage: (() => void) | null = null
      public readonly terminate = vi.fn()
      public readonly postMessage = vi.fn()

      constructor (public readonly url: string) {
        workers.push(this)
      }
    }

    vi.stubGlobal('Worker', FakeWorker)
    const urlApi = {
      createObjectURL: vi.fn(() => {
        const url = `blob:timer-${createdUrls.length}`
        createdUrls.push(url)
        return url
      }),
      revokeObjectURL: vi.fn((url: string) => revokedUrls.push(url))
    }
    vi.stubGlobal('window', {
      performance: { now: () => 0 },
      requestAnimationFrame: (window as unknown as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame,
      cancelAnimationFrame: (window as unknown as { cancelAnimationFrame: typeof cancelAnimationFrame }).cancelAnimationFrame,
      URL: urlApi
    })

    const animator = new Animator()
    animator.__svgaNoDelay = true
    animator.__svgaStart = 0
    animator.__svgaEnd = 10
    animator.__svgaDuration = 100
    animator.__svgaClock = () => 0

    animator.__svgaRun()
    animator.__svgaRun()
    animator.__svgaStop()
    animator.__svgaStop()

    expect(workers).toHaveLength(2)
    expect(workers[0].terminate).toHaveBeenCalledOnce()
    expect(workers[1].terminate).toHaveBeenCalledOnce()
    expect(workers[0].postMessage).toHaveBeenCalledOnce()
    expect(workers[1].postMessage).toHaveBeenCalledOnce()
    expect(createdUrls).toEqual(revokedUrls)
    expect(raf.callbacks).toHaveLength(0)
  })

  it('falls back to one RAF chain when Worker construction fails', () => {
    const raf = installRaf()
    vi.stubGlobal('Worker', class {
      constructor () { throw new Error('worker unavailable') }
    })
    const animator = new Animator()
    animator.__svgaNoDelay = true
    animator.__svgaEnd = 10
    animator.__svgaDuration = 100

    expect(() => animator.__svgaRun()).not.toThrow()
    expect(raf.callbacks).toHaveLength(1)
    expect(raf.requested).toHaveLength(1)
  })

  it('terminates and falls back to RAF when the initial Worker postMessage fails', () => {
    const raf = installRaf()
    const terminate = vi.fn()
    vi.stubGlobal('Worker', class {
      public onmessage: (() => void) | null = null
      public readonly terminate = terminate
      public postMessage (): void { throw new Error('post failed') }
    })
    const animator = new Animator()
    animator.__svgaNoDelay = true
    animator.__svgaEnd = 10
    animator.__svgaDuration = 100

    expect(() => animator.__svgaRun()).not.toThrow()
    expect(terminate).toHaveBeenCalledOnce()
    expect(raf.callbacks).toHaveLength(1)
  })

  it('prevents the Worker error default and falls back to one RAF chain', () => {
    const raf = installRaf()
    const worker: {
      onmessage: (() => void) | null
      onerror: ((event: ErrorEvent) => void) | null
      onmessageerror: (() => void) | null
      terminate: ReturnType<typeof vi.fn>
      postMessage: ReturnType<typeof vi.fn>
    } = { onmessage: null, onerror: null, onmessageerror: null, terminate: vi.fn(), postMessage: vi.fn() }
    vi.stubGlobal('Worker', function () { return worker })
    const animator = new Animator()
    animator.__svgaNoDelay = true
    animator.__svgaEnd = 10
    animator.__svgaDuration = 100
    animator.__svgaRun()
    const preventDefault = vi.fn()

    worker.onerror?.({ preventDefault } as unknown as ErrorEvent)
    worker.onerror?.({ preventDefault } as unknown as ErrorEvent)

    expect(worker?.terminate).toHaveBeenCalledOnce()
    expect(preventDefault).toHaveBeenCalledTimes(2)
    expect(raf.callbacks).toHaveLength(1)
    expect(raf.requested).toHaveLength(1)
  })

  it('falls back directly on Worker messageerror', () => {
    const raf = installRaf()
    const worker = {
      onmessage: null as (() => void) | null,
      onerror: null as ((event: ErrorEvent) => void) | null,
      onmessageerror: null as (() => void) | null,
      terminate: vi.fn(),
      postMessage: vi.fn()
    }
    vi.stubGlobal('Worker', function () { return worker })
    const animator = new Animator()
    animator.__svgaNoDelay = true
    animator.__svgaEnd = 10
    animator.__svgaDuration = 100
    animator.__svgaRun()

    worker.onmessageerror?.()

    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(raf.callbacks).toHaveLength(1)
  })

  it('continues the same timeline on one RAF when a runtime Worker post fails', () => {
    const raf = installRaf()
      const worker: {
        onmessage: (() => void) | null
        terminate: ReturnType<typeof vi.fn>
        onerror: (() => void) | null
        onmessageerror: (() => void) | null
        postMessage: () => void
      } = {
        onmessage: null,
        onerror: null,
        onmessageerror: null,
        terminate: vi.fn(),
        postMessage: () => {
          posts++
          if (posts === 2) throw new Error('runtime post failed')
        }
      }
      let posts = 0
    vi.stubGlobal('Worker', function () { return worker })
    const animator = new Animator()
    let now = 0
    const updates: number[] = []
    animator.__svgaNoDelay = true
    animator.__svgaEnd = 10
    animator.__svgaDuration = 100
    animator.__svgaClock = () => now
    animator.__svgaOnUpdate = value => updates.push(value)
    animator.__svgaRun()

    now = 50
    expect(() => worker?.onmessage?.()).not.toThrow()

    expect(updates).toEqual([0, 5])
    expect(worker?.terminate).toHaveBeenCalledOnce()
    expect(raf.callbacks).toHaveLength(1)
    expect(raf.requested).toHaveLength(1)
  })
})
