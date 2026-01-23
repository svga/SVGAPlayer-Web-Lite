import { Video, MockWebWorker, ParserConfigOptions } from './types'
import { createParserMockWorker } from './parser/worker-core'

/**
 * SVGA 下载解析器
 */
export class Parser {
  public worker: MockWebWorker | Worker
  private readonly isDisableImageBitmapShim: boolean

  constructor (options: ParserConfigOptions = {}) {
    const { isDisableWebWorker, isDisableImageBitmapShim } = options
    this.isDisableImageBitmapShim = isDisableImageBitmapShim ?? false

    if (isDisableWebWorker === true) {
      this.worker = createParserMockWorker()
      return
    }

    this.worker = new Worker(new URL('./parser.worker.js', import.meta.url), { type: 'module' })
  }

  /**
   * 通过 url 下载并解析 SVGA 文件
   * @param url SVGA 文件的下载链接
   * @returns Promise<SVGA 数据源>
   */
  async load (url: string): Promise<Video> {
    if (url === undefined) throw new Error('url undefined')

    const postData = { url: this.normalizeURL(url), options: { isDisableImageBitmapShim: this.isDisableImageBitmapShim } }

    return new Promise<Video>((resolve, reject) => {
      const handleMessage = (data: Video | Error) => {
        data instanceof Error ? reject(data) : resolve(data)
      }

      if (this.worker === undefined) {
        reject(new Error('Parser Worker not found'))
        return
      }

      this.postMessage(postData, handleMessage)
    })
  }

  private postMessage (postData: { url: string, options: { isDisableImageBitmapShim: boolean } }, callback: (data: Video | Error) => void): void {
    if (this.worker instanceof Worker) {
      this.worker.onmessage = (event: MessageEvent<Video | Error>) => callback(event.data)
      this.worker.postMessage(postData)
    } else {
      this.worker.onmessageCallback = callback
      this.worker.onmessage({ data: postData })
    }
  }

  private normalizeURL (url: string): string {
    if (url.startsWith('http')) return url

    const anchor = document.createElement('a')
    anchor.href = url
    return anchor.href
  }

  public destroy (): void {
    if (this.worker instanceof Worker) {
      this.worker.terminate()
    }
  }
}
