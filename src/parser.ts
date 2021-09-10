import { Video, MockWebWorker, ParserConfigOptions } from './types'

const INLINE_WORKER_FLAG = '#PARSER_V2_INLINE_WROKER#'

/**
 * SVGA 下载解析器
 */
export class Parser {
  public worker: MockWebWorker | Worker
  private readonly isDisableImageBitmapShim: boolean = false

  constructor (options: ParserConfigOptions = {
    isDisableWebWorker: false,
    isDisableImageBitmapShim: false
  }) {
    const { isDisableWebWorker, isDisableImageBitmapShim } = options
    if (isDisableImageBitmapShim === true) {
      this.isDisableImageBitmapShim = isDisableImageBitmapShim
    }
    if (isDisableWebWorker === true) {
      // eslint-disable-next-line no-eval
      eval(INLINE_WORKER_FLAG)
      if (window.SVGAParserMockWorker === undefined) throw new Error('SVGAParserMockWorker undefined')
      this.worker = window.SVGAParserMockWorker
    } else {
      this.worker = new Worker(window.URL.createObjectURL(new Blob([INLINE_WORKER_FLAG])))
    }
  }

  /**
   * 通过 url 下载并解析 SVGA 文件
   * @param url SVGA 文件的下载链接
   * @returns Promise<SVGA 数据源>
   */
  async load (url: string): Promise<Video> {
    if (url === undefined) throw new Error('url undefined')
    if (this.worker === undefined) throw new Error('Parser Worker not found')
    return await new Promise((resolve, reject) => {
      if (url.indexOf('http') !== 0) {
        const a = document.createElement('a')
        a.href = url
        url = a.href
      }
      const { isDisableImageBitmapShim } = this
      const postData = { url, options: { isDisableImageBitmapShim } }
      if (this.worker instanceof Worker) {
        this.worker.onmessage = ({ data }: { data: Video | Error }) => {
          data instanceof Error ? reject(data) : resolve(data)
        }
        this.worker.postMessage(postData)
      } else {
        this.worker.onmessageCallback = (data: Video | Error) => {
          data instanceof Error ? reject(data) : resolve(data)
        }
        this.worker.onmessage({ data: postData })
      }
    })
  }

  /**
   * 销毁实例
   */
  public destroy (): void {
    if (this.worker instanceof Worker) this.worker.terminate()
  }
}
