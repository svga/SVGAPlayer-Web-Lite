const WORKER = '#INLINE_PARSER1x_WROKER#'

export default class Parser implements Parser {
  public worker?: any

  constructor ({ disableWorker } = { disableWorker: false }) {
    if (!disableWorker) {
      this.worker = new Worker(window.URL.createObjectURL(new Blob([WORKER])))
    } else {
      /* eslint-disable */
      eval(WORKER)
      this.worker = (<any>window).SVGAParserMockWorker
    }
  }

  do (data: ArrayBuffer): void | Promise<Object> {
    const dataHeader = new Uint8Array(data, 0, 4)

    if (!(dataHeader[0] == 80 && dataHeader[1] == 75 && dataHeader[2] == 3 && dataHeader[3] == 4)) {
      throw 'this parser only support version@1.x of svga.'
    }

    if (!data) {
      throw new Error('Parser Data not found')
    }

    if (!this.worker) {
      throw new Error('Parser Worker not found')
    }

    return new Promise((resolve, reject) => {
      if (this.worker.disableWorker) {
        this.worker.onmessageCallback = (data: VideoEntity) => {
          resolve(data)
        }

        this.worker.onmessage({ data })
      } else {
         this.worker.postMessage(data)

        this.worker.onmessage = ({ data }: { data: VideoEntity }) => {
          resolve(data)
        }
      }
    })
  }

  destroy () {
    this.worker.terminate && this.worker.terminate() && (this.worker = null)
  }
}
