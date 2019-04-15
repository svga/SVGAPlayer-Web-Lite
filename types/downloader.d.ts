interface Downloader {
  request (svgaResourceLink: string): Promise<ArrayBuffer>
}
