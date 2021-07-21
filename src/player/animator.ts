const WORKER = 'onmessage = function () {setTimeout(function() {postMessage(null)}, 1 / 60)}'

export class Animator {
  private isRunning = false
  private startTime = 0
  private currentFrication: number = 0.0
  private worker: Worker | null = null
  public isOpenNoExecutionDelay = false
  public startValue: number = 0
  public endValue: number = 0
  public duration: number = 0
  public loop: number = 1
  public fillRule: number = 0
  public onStart: () => void = () => {}
  public onUpdate: (currentValue: number) => void = () => {}
  public onEnd: () => void = () => {}

  public currentTimeMillsecond: () => number = () => {
    if (window.performance === undefined) {
      return Date.now()
    }
    return performance.now()
  }

  public start (): void {
    this.isRunning = true
    this.startTime = this.currentTimeMillsecond()
    this.currentFrication = 0.0
    if (this.isOpenNoExecutionDelay && this.worker === null) {
      this.worker = new Worker(window.URL.createObjectURL(new Blob([WORKER])))
    }
    this.onStart()
    this.doFrame()
  }

  public stop (): void {
    this.isRunning = false
    if (this.worker !== null) {
      this.worker.terminate()
      this.worker = null
    }
  }

  public get animatedValue (): number {
    return Math.floor(((this.endValue - this.startValue) * this.currentFrication) + this.startValue)
  }

  private doFrame (): void {
    if (this.isRunning) {
      this.doDeltaTime(this.currentTimeMillsecond() - this.startTime)
      if (this.isRunning) {
        if (this.worker !== null) {
          this.worker.onmessage = this.doFrame.bind(this)
          this.worker.postMessage(null)
        } else {
          window.requestAnimationFrame(this.doFrame.bind(this))
        }
      }
    }
  }

  private doDeltaTime (deltaTime: number): void {
    if (deltaTime >= this.duration * this.loop) {
      this.currentFrication = this.fillRule === 1 ? 0.0 : 1.0
      this.isRunning = false
    } else {
      this.currentFrication = deltaTime % this.duration / this.duration
    }
    this.onUpdate(this.animatedValue)
    if (!this.isRunning) {
      if (this.worker !== null) {
        this.worker.terminate()
        this.worker = null
      }
      this.onEnd()
    }
  }
}
