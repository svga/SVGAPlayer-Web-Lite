const WORKER = 'onmessage = function () {setTimeout(function() {postMessage(null)}, 1000 / 60)}'

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

  public currentTimeMillsecond = (): number => {
    return window.performance === undefined ? Date.now() : performance.now()
  }

  private isRunning = false
  private startTime = 0
  private currentFrication = 0.0
  private worker: Worker | null = null

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
    this.worker?.terminate()
    this.worker = null
  }

  public get animatedValue (): number {
    return Math.floor(((this.endValue - this.startValue) * this.currentFrication) + this.startValue)
  }

  private doFrame (): void {
    if (!this.isRunning) return

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

  private doDeltaTime (deltaTime: number): void {
    if (deltaTime >= this.loopStart + (this.duration - this.loopStart) * this.loop) {
      this.currentFrication = this.fillRule === 1 ? 0 : 1
      this.isRunning = false
    } else {
      this.currentFrication = deltaTime <= this.duration
        ? deltaTime / this.duration
        : ((deltaTime - this.loopStart) % (this.duration - this.loopStart) + this.loopStart) / this.duration
    }
    this.onUpdate(this.animatedValue)
    if (!this.isRunning) {
      this.worker?.terminate()
      this.worker = null
      this.onEnd()
    }
  }
}
