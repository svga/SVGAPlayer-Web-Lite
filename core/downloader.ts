export default class Downloader {
  request: XMLHttpRequest | null

  constructor () {
    this.request = null
  }

  get (svgaResourceLink: string): Promise<ArrayBuffer> {
    if (!svgaResourceLink) {
      throw new Error('download link undefined')
    }

    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest()

      request.open('GET', svgaResourceLink, true)
      request.responseType = 'arraybuffer'
      request.onloadend = () => {
        if (request.response && (request.status === 200 || request.status === 304)) {
          resolve(request.response)
        } else {
          reject(request)
        }
      }
      request.onerror = () => reject(request.response)
      request.send()

      this.request = request
    })
  }

  cancel (): void {
    this.request && (this.request.abort())
  }

  destroy (): void {
    this.request && (this.request.abort())
  }
}
