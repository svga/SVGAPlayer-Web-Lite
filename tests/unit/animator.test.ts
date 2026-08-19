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
    animator.startValue = 2
    animator.endValue = 20
    animator.duration = 1000
    animator.currentTimeMillsecond = () => 0
    const updates: number[] = []
    animator.onUpdate = value => updates.push(value)

    for (let index = 0; index < 1000; index++) animator.start()

    expect(raf.callbacks).toHaveLength(1)
    expect(raf.cancelled).toHaveLength(999)
    expect(updates).toHaveLength(1000)
    expect(updates.every(value => value === 2)).toBe(true)
  })

  it('ignores an already queued callback from an older run', () => {
    const raf = installRaf()
    const animator = new Animator()
    animator.startValue = 3
    animator.endValue = 9
    animator.duration = 100
    let now = 0
    animator.currentTimeMillsecond = () => now
    const updates: number[] = []
    animator.onUpdate = value => updates.push(value)

    animator.start()
    const staleCallback = raf.callbacks.get(raf.requested[0])
    animator.start()
    now = 50
    staleCallback?.(50)

    expect(updates).toEqual([3, 3])
    expect(raf.requested).toHaveLength(2)
    expect(raf.callbacks).toHaveLength(1)
  })

  it('publishes the start value and ends without scheduling for zero duration', () => {
    const raf = installRaf()
    const animator = new Animator()
    animator.startValue = 7
    animator.endValue = 7
    animator.duration = 0
    const updates: number[] = []
    const onEnd = vi.fn()
    animator.onUpdate = value => updates.push(value)
    animator.onEnd = onEnd

    animator.start()

    expect(updates).toEqual([7])
    expect(onEnd).toHaveBeenCalledOnce()
    expect(raf.requested).toHaveLength(0)
    expect(raf.callbacks).toHaveLength(0)
  })

  it.each(['onStart', 'onUpdate', 'onEnd'] as const)(
    'retires the scheduler when %s throws and preserves the error',
    callbackName => {
      const raf = installRaf()
      const animator = new Animator()
      animator.startValue = 0
      animator.endValue = callbackName === 'onEnd' ? 0 : 10
      animator.duration = callbackName === 'onEnd' ? 0 : 100
      const expected = new Error(callbackName)
      animator[callbackName] = () => { throw expected }

      expect(() => animator.start()).toThrow(expected)
      expect(raf.callbacks).toHaveLength(0)
    }
  )

  it('retires a queued RAF when an update callback throws', () => {
    const raf = installRaf()
    const animator = new Animator()
    animator.startValue = 0
    animator.endValue = 10
    animator.duration = 100
    let now = 0
    animator.currentTimeMillsecond = () => now
    let updateCount = 0
    const expected = new Error('scheduled update')
    animator.onUpdate = () => {
      updateCount++
      if (updateCount === 2) throw expected
    }

    animator.start()
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
    animator.endValue = 10
    animator.duration = 100
    let now = 0
    let updates = 0
    animator.currentTimeMillsecond = () => now
    animator.onUpdate = () => {
      updates++
      if (updates === 2) animator.start()
    }

    animator.start()
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
    animator.endValue = 10
    animator.duration = 100
    let now = 0
    animator.currentTimeMillsecond = () => now
    animator.onEnd = () => animator.start()

    animator.start()
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
    animator.isOpenNoExecutionDelay = true
    animator.startValue = 0
    animator.endValue = 10
    animator.duration = 100
    animator.currentTimeMillsecond = () => 0

    animator.start()
    animator.start()
    animator.stop()
    animator.stop()

    expect(workers).toHaveLength(2)
    expect(workers[0].terminate).toHaveBeenCalledOnce()
    expect(workers[1].terminate).toHaveBeenCalledOnce()
    expect(workers[0].postMessage).toHaveBeenCalledOnce()
    expect(workers[1].postMessage).toHaveBeenCalledOnce()
    expect(createdUrls).toEqual(revokedUrls)
    expect(raf.callbacks).toHaveLength(0)
  })
})
