import VideoEntity from '../parser.worker/video-entity'

/* eslint-disable no-eval */
eval(require('./zip.raw').default)

let worker

if (!self.document) {
  worker = self
} else {
  worker = self.SVGAParser1xMockWorker = {}

  worker.disableWorker = true

  worker.postMessage = function (data) {
    worker.onmessageCallback && worker.onmessageCallback(data)
  }
}

self.SVGAParser1xZip(self)

worker.onmessage = function (event) {
  const files = self.Zip.inflate(new Uint8Array(event.data)).files

  const movie = JSON.parse(Uint8ToString(files['movie.spec'].inflate()))
  const images = {}

  for (var item in movie.images) {
    images[item] = btoa(Uint8ToString(files[item + '.png'].inflate()))
  }

  movie.params = movie.movie
  movie.params.viewBoxWidth = movie.movie.viewBox.width
  movie.params.viewBoxHeight = movie.movie.viewBox.height

  worker.postMessage(new VideoEntity(movie, images))
}

const Uint8ToString = function (u8a) {
  const CHUNK_SZ = 0x8000
  const c = []
  for (var i = 0; i < u8a.length; i += CHUNK_SZ) {
    c.push(String.fromCharCode.apply(null, u8a.subarray(i, i + CHUNK_SZ)))
  }
  return c.join('')
}
