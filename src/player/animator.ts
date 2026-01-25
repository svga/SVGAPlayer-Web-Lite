const FRAME_INTERVAL_MS = 1000 / 60
const WORKER_CODE = `onmessage = function() { setTimeout(function() { postMessage(null) }, ${FRAME_INTERVAL_MS}) }`

const FILL_MODE_FORWARDS = 0
const FILL_MODE_BACKWARDS = 1

export class Animator {
  public isOpenNoExecutionDelay = false
  public startValue = 0
  public endValue = 0
  public duration = 0
  public loopStart = 0
  public loop = 1
  public fillRule = 0
  public onStart = () => {}
  public onUpdate = (currentValue: number) => {}
  public onEnd = () => {}

  public currentTimeMillsecond (): number {
    return performance?.now() ?? Date.now()
  }

  private isRunning = false
  private startTime = 0
  private currentFrication = 0.0
  private worker: Worker | null = null
  private boundDoFrame: (() => void) | null = null

  public start (): void {
    this.stop()
    this.isRunning = true
    this.startTime = this.currentTimeMillsecond()
    this.currentFrication = 0.0
    this.boundDoFrame = this.doFrame.bind(this)

    if (this.isOpenNoExecutionDelay && this.worker === null) {
      this.worker = new Worker(window.URL.createObjectURL(new Blob([WORKER_CODE])))
    }

    this.onStart()
    this.doFrame()
  }

  public stop (): void {
    this.isRunning = false
    this.terminateWorker()
  }

  public get animatedValue (): number {
    return Math.floor(((this.endValue - this.startValue) * this.currentFrication) + this.startValue)
  }

  private doFrame (): void {
    if (!this.isRunning) return

    const deltaTime = this.currentTimeMillsecond() - this.startTime
    this.doDeltaTime(deltaTime)

    if (this.isRunning) {
      this.scheduleNextFrame()
    }
  }

  private scheduleNextFrame (): void {
    if (this.worker !== null) {
      this.worker.onmessage = this.boundDoFrame!
      this.worker.postMessage(null)
    } else {
      window.requestAnimationFrame(this.boundDoFrame!)
    }
  }

  private doDeltaTime (deltaTime: number): void {
    const totalDuration = this.calculateTotalDuration()

    if (deltaTime >= totalDuration) {
      this.currentFrication = this.fillRule === FILL_MODE_BACKWARDS ? 0 : 1
      this.isRunning = false
    } else {
      this.currentFrication = this.calculateFrication(deltaTime)
    }

    this.onUpdate(this.animatedValue)

    if (!this.isRunning) {
      this.terminateWorker()
      this.onEnd()
    }
  }

  private calculateTotalDuration (): number {
    const loopDuration = this.duration - this.loopStart
    return this.loopStart + loopDuration * this.loop
  }

  private calculateFrication (deltaTime: number): number {
    if (deltaTime < this.duration) {
      return deltaTime / this.duration
    }

    const loopDuration = this.duration - this.loopStart
    const timeInLoop = (deltaTime - this.loopStart) % loopDuration
    return (timeInLoop + this.loopStart) / this.duration
  }

  private terminateWorker (): void {
    this.worker?.terminate()
    this.worker = null
  }
}
