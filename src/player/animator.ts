const WORKER = 'onmessage=function(){setTimeout(postMessage,50/3,0)}'

type Scheduler = Worker | number | null

let runId = 0

function requestFrame (animator: Animator): number {
  let rafId: number
  rafId = window.requestAnimationFrame(() => {
    ;(animator as unknown as { __svgaFrame: (scheduler: number) => void }).__svgaFrame(rafId)
  })
  return rafId
}

export class Animator {
  private __svgaStartTime!: number
  private __svgaFraction: number = 0.0
  private __svgaScheduler: Scheduler = null
  public __svgaNoDelay = false
  public __svgaStart: number = 0
  public __svgaEnd: number = 0
  public __svgaDuration: number = 0
  public __svgaLoopStart: number = 0
  public __svgaLoop: number = 1
  public __svgaFill: number = 0
  public __svgaOnStart: () => void = () => {}
  public __svgaOnUpdate: (currentValue: number) => void = () => {}
  public __svgaOnEnd: () => void = () => {}

  public __svgaClock: () => number = () => {
    return performance.now()
  }

  public __svgaRun (): void {
    this.__svgaStop()
    const marker = -(++runId)
    this.__svgaScheduler = marker
    this.__svgaStartTime = this.__svgaClock()
    this.__svgaFraction = 0.0
    try {
      this.__svgaOnStart()
      if (this.__svgaScheduler !== marker) return
      this.__svgaOnUpdate(this.__svgaStart)
      if (this.__svgaScheduler !== marker) return

      if (!Number.isFinite(this.__svgaDuration) || this.__svgaDuration <= 0 || this.__svgaStart === this.__svgaEnd) {
        this.__svgaStop()
        this.__svgaOnEnd()
        return
      }

      if (this.__svgaNoDelay) this.__svgaTimer()
      else this.__svgaScheduler = requestFrame(this)
    } catch (error) {
      this.__svgaStop()
      throw error
    }
  }

  public __svgaStop (): void {
    const scheduler = this.__svgaScheduler
    this.__svgaScheduler = null
    if (typeof scheduler === 'number') {
      if (scheduler >= 0) window.cancelAnimationFrame(scheduler)
    } else if (scheduler !== null) {
      try { scheduler.terminate() } catch {}
    }
  }

  public get __svgaValue (): number {
    return Math.floor(((this.__svgaEnd - this.__svgaStart) * this.__svgaFraction) + this.__svgaStart)
  }

  private __svgaFrame (scheduler: Worker | number): void {
    if (this.__svgaScheduler !== scheduler) return
    try {
      const ended = this.__svgaDelta(this.__svgaClock() - this.__svgaStartTime)
      if (this.__svgaScheduler !== scheduler) return
      if (ended) {
        this.__svgaStop()
        this.__svgaOnEnd()
      } else if (typeof scheduler === 'number') {
        this.__svgaScheduler = requestFrame(this)
      } else {
        this.__svgaSignal(scheduler)
      }
    } catch (error) {
      this.__svgaStop()
      throw error
    }
  }

  private __svgaTimer (): void {
    let worker: Worker | undefined
    let url: string | undefined
    try {
      url = window.URL.createObjectURL(new Blob([WORKER]))
      worker = new Worker(url)
    } catch {} finally {
      if (url) window.URL.revokeObjectURL(url)
    }
    if (!worker) return void (this.__svgaScheduler = requestFrame(this))
    this.__svgaScheduler = worker
    worker.onmessage = this.__svgaFrame.bind(this, worker)
    worker.onerror = event => {
      event.preventDefault()
      this.__svgaFallback(worker as Worker)
    }
    worker.onmessageerror = () => { this.__svgaFallback(worker as Worker) }
    this.__svgaSignal(worker)
  }

  private __svgaSignal (worker: Worker): void {
    try { worker.postMessage(null) } catch { this.__svgaFallback(worker) }
  }

  private __svgaFallback (worker: Worker): void {
    if (this.__svgaScheduler !== worker) return
    try { worker.terminate() } catch {}
    this.__svgaScheduler = requestFrame(this)
  }

  private __svgaDelta (deltaTime: number): boolean {
    const loopDuration = this.__svgaDuration - this.__svgaLoopStart
    const ended = loopDuration <= 0 || deltaTime >= this.__svgaLoopStart + loopDuration * this.__svgaLoop
    if (ended) {
      this.__svgaFraction = this.__svgaFill === 1 ? 0.0 : 1.0
    } else {
      this.__svgaFraction = deltaTime <= this.__svgaDuration
        ? deltaTime / this.__svgaDuration
        : ((deltaTime - this.__svgaLoopStart) % loopDuration + this.__svgaLoopStart) / this.__svgaDuration
    }
    this.__svgaOnUpdate(this.__svgaValue)
    return ended
  }
}
