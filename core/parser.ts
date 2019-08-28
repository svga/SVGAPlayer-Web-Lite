/// <reference path="../types/svga.d.ts" />

const WORKER = '#INLINE_PARSER_WROKER#'

interface mockWebWorker {
  disableWorker: Boolean
  onmessage: (data: any) => void
  onmessageCallback: (data: any) => void
}

export default class Parser {
  public worker?: mockWebWorker | Worker

  constructor ({ disableWorker } = { disableWorker: false }) {
    if (!disableWorker) {
      this.worker = new Worker(window.URL.createObjectURL(new Blob([WORKER])))
    } else {
      /* eslint-disable */
      eval(WORKER)
      this.worker = (<any>window).SVGAParserMockWorker
    }
  }

  do (data: ArrayBuffer): Promise<Object> {
    const dataHeader = new Uint8Array(data, 0, 4)

    if (dataHeader[0] == 80 && dataHeader[1] == 75 && dataHeader[2] == 3 && dataHeader[3] == 4) {
      throw 'this parser not support version@1.x of svga.'
    }

    if (!data) {
      throw new Error('Parser Data not found')
    }

    if (!this.worker) {
      throw new Error('Parser Worker not found')
    }

    return new Promise((resolve, reject) => {
      if ((this.worker as mockWebWorker).disableWorker) {
        const worker = (this.worker as mockWebWorker)

        worker.onmessageCallback = (data: VideoEntity) => {
          resolve(data)
        }

        worker.onmessage({ data })
      } else {
        const worker = (this.worker as Worker)

        worker.postMessage(data)

        worker.onmessage = ({ data }: { data: VideoEntity }) => {
          resolve(data)
        }
      }
    })
  }

  destroy () {
    const worker = this.worker! as Worker

    worker.terminate && worker.terminate()
  }
}
