const WORKER = 'onmessage=function(){setTimeout(postMessage,50/3,0)}'

type Scheduler = Worker | number | null

let runId = 0

function requestFrame (animator: Animator): number {
  let rafId: number
  rafId = window.requestAnimationFrame(() => {
    ;(animator as unknown as { doFrame: (scheduler: number) => void }).doFrame(rafId)
  })
  return rafId
}

export class Animator {
  private isRunning!: boolean
  private startTime!: number
  private currentFrication: number = 0.0
  private worker: Scheduler = null
  public isOpenNoExecutionDelay = false
  public startValue: number = 0
  public endValue: number = 0
  public duration: number = 0
  public loopStart: number = 0
  public loop: number = 1
  public fillRule: number = 0
  public onStart: () => void = () => {}
  public onUpdate: (currentValue: number) => void = () => {}
  public onEnd: () => void = () => {}

  public currentTimeMillsecond: () => number = () => {
    return performance.now()
  }

  public start (): void {
    this.stop()
    const marker = -(++runId)
    this.worker = marker
    this.startTime = this.currentTimeMillsecond()
    this.currentFrication = 0.0
    try {
      this.onStart()
      if (this.worker !== marker) return
      this.onUpdate(this.startValue)
      if (this.worker !== marker) return

      if (!Number.isFinite(this.duration) || this.duration <= 0 || this.startValue === this.endValue) {
        this.stop()
        this.onEnd()
        return
      }

      if (this.isOpenNoExecutionDelay) {
        const workerUrl = window.URL.createObjectURL(new Blob([WORKER]))
        try {
          this.worker = new Worker(workerUrl)
        } finally {
          window.URL.revokeObjectURL(workerUrl)
        }
        const worker = this.worker as Worker
        worker.onmessage = this.doFrame.bind(this, worker)
        worker.postMessage(null)
      } else {
        this.worker = requestFrame(this)
      }
    } catch (error) {
      this.stop()
      throw error
    }
  }

  public stop (): void {
    const scheduler = this.worker
    this.worker = null
    if (typeof scheduler === 'number') {
      if (scheduler >= 0) window.cancelAnimationFrame(scheduler)
    } else if (scheduler !== null) scheduler.terminate()
  }

  public get animatedValue (): number {
    return Math.floor(((this.endValue - this.startValue) * this.currentFrication) + this.startValue)
  }

  private doFrame (scheduler: Worker | number): void {
    if (this.worker !== scheduler) return
    try {
      const ended = this.doDeltaTime(this.currentTimeMillsecond() - this.startTime)
      if (this.worker !== scheduler) return
      if (ended) {
        this.stop()
        this.onEnd()
      } else if (typeof scheduler === 'number') {
        this.worker = requestFrame(this)
      } else {
        scheduler.postMessage(null)
      }
    } catch (error) {
      this.stop()
      throw error
    }
  }

  private doDeltaTime (deltaTime: number): boolean {
    const loopDuration = this.duration - this.loopStart
    const ended = loopDuration <= 0 || deltaTime >= this.loopStart + loopDuration * this.loop
    if (ended) {
      this.currentFrication = this.fillRule === 1 ? 0.0 : 1.0
    } else {
      this.currentFrication = deltaTime <= this.duration
        ? deltaTime / this.duration
        : ((deltaTime - this.loopStart) % loopDuration + this.loopStart) / this.duration
    }
    this.onUpdate(this.animatedValue)
    return ended
  }
}
