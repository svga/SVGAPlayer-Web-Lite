/// <reference path="../types/svga.d.ts" />

const WORKER = '#INLINE_PARSER_WROKER#'

export default class Parser implements Parser {
  public worker?: any

  constructor ({ disableWorker } = { disableWorker: false }) {
    const evalWorker = () => {
      /* eslint-disable */
      eval(WORKER)
      this.worker = (<any>window).SVGAParserMockWorker
    }

    if (!disableWorker) {
      const worker = new Worker(window.URL.createObjectURL(new Blob([WORKER])))
      worker.onmessage = ({ data }) => {
        if (!data) {
          console.warn('[SVGA] Lack of WebWorker Environment, disable WebWorker')
          worker.terminate()
          evalWorker()
        }
      }
      worker.postMessage('check')

      this.worker = new Worker(window.URL.createObjectURL(new Blob([WORKER])))
    } else {
      evalWorker()
    }
  }

  do (data: ArrayBuffer): void | Promise<Object> {
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
    this.worker.terminate && this.worker.terminate()
  }
}
