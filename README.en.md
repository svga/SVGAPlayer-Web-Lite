# SVGAPlayer-Web-Lite

This is a SVGA player on the Web, and its goal is to be **lighter** and more **efficient**, But at the same time it also gave up compatibility support for some older browsers.

## Depend on Promise

If there is a problem such as `Promise is not a constructor`, the outer chain polyfill or the configuration babel is compatible

```html
<script src="https://cdn.jsdelivr.net/npm/es6-promise@4/dist/es6-promise.auto.min.js"></script>
```

## Target Future

- [x] Size = 80kb (gzip = 27kb)
- [x] Compatible Android 4.4+ / iOS 9+
- [x] Better Asynchronous Operation
- [x] Multi-threaded (WebWorker) parsing file data
- [x] OffscreenCanvas

## Experimental

- [ ] Rendering engine simulation runs in the WebWorker
- [ ] Use WebAssembly instead of WebWorker
- [ ] GPU accelerated operation

## Diff

* not support play sound

## Install

### NPM

```sh
yarn add svga.lite

# or

npm i svga.lite
```

### CDN

```html
<script src="https://cdn.jsdelivr.net/npm/svga.lite/svga.lite.min.js"></script>
```

## Use

### Simple Use

```html
<canvas id="canvas"></canvas>
```

```js
import { Downloader, Parser, Player } from 'svga.lite'

const downloader = new Downloader()
// calls WebWorker parsing by default
// configurable `new Parser({ disableWorker: true })`
const parser = new Parser()
const player = new Player('#canvas') // #canvas is HTMLCanvasElement

;(async () => {
  const fileData = await downloader.get('./xxx.svga')
  const svgaData = await parser.do(fileData)

  player.set({
    loop: 1,
    fillMode: 'forwards'
  })

  await player.mount(svgaData)

  player
    .$on('start', () => console.log('event start'))
    .$on('pause', () => console.log('event pause'))
    .$on('stop', () => console.log('event stop'))
    .$on('end', () => console.log('event end'))
    .$on('clear', () => console.log('event clear'))
    .$on('process', () => console.log('event process', player.progress))

  player.start()
  // player.pause()
  // player.stop()
  // player.clear()
})()
```

### Support v1.x of SVGA

```js
import { Downloader, Parser, Player } from 'svga.lite'
import Parser1x from 'svga.lite/parser.1x'
import * as util from 'svga.lite/util'

const downloader = new Downloader()
const svgaFile = './svga/show.svga'
const fileData = await downloader.get(svgaFile)

// Parser1x calls WebWorker parsing by default
// configurable `new Parser1x({ disableWorker: true })`
const parser = util.version(fileData) === 1 ? new Parser1x() : new Parser()
const svgaData = await parser.do(fileData)

const player = new Player('#canvas')
await player.mount(svgaData)

player.start()
```

### Replace Element

You can change the elements of the `svga data` corresponding to the key values.

```js
import { Downloader, Parser, Player } from 'svga.lite'

const downloader = new Downloader()
const parser = new Parser()
const player = new Player('#canvas')

;(async () => {
  const fileData = await downloader.get('./xxx.svga')
  const svgaData = await parser.do(fileData)

  const image = new Image()
  image.src = 'https://xxx.com/xxx.png'
  svgaData.images['key'] = image

  await player.mount(svgaData)

  player.start()
})()
```

### Dynamic Element

You can insert some [dynamic elements](https://developer.mozilla.org/en/docs/Web/API/CanvasRenderingContext2D/drawImage) with `svga data`.

```js
const text = 'hello gg'
const fontCanvas = document.getElementById('font')
const fontContext = fontCanvas.getContext('2d')
fontCanvas.height = 30
fontContext.font = '30px Arial'
fontContext.textAlign = 'center'
fontContext.textBaseline = 'middle'
fontContext.fillStyle = '#000'
fontContext.fillText(text, fontCanvas.clientWidth / 2, fontCanvas.clientHeight / 2)

const { Downloader, Parser, Player } = SVGA

const downloader = new Downloader()
const parser = new Parser()
const player = new Player('#canvas')

const svgaFile = './svga/kingset.svga'

const fileData = await downloader.get(svgaFile)
const svgaData = await parser.do(fileData)

svgaData.dynamicElements['banner'] = fontCanvas

await player.mount(svgaData)

player.start()
```

Set `fit` strategy of the dynamic element, check out [example](./tests/11.test-dynamicElement.html).

```js
const video = document.getElementById('video')
const { Downloader, Parser, Player } = SVGA

const downloader = new Downloader()
const parser = new Parser()
const player = new Player('#canvas')

const svgaFile = './svga/kingset.svga'

const fileData = await downloader.get(svgaFile)
const svgaData = await parser.do(fileData)

// fit: "fill", "cover", "contain", "none"
svgaData.dynamicElements['99'] = {source: video, fit: "fill"}

await player.mount(svgaData)

player.start()
```

### Reusable instantiated Downloader & Parser

```js
import { Downloader, Parser, Player } from 'svga.lite'

const downloader = new Downloader()
const parser = new Parser()

const player1 = new Player('#canvas1')
const player2 = new Player('#canvas2')

const fileData1 = await downloader.get('./1.svga')
const fileData2 = await downloader.get('./2.svga')

const svgaData1 = await parser.do(fileData1)
const svgaData2 = await parser.do(fileData2)

await player1.mount(svgaData1)
await player2.mount(svgaData2)

player1.start()
player2.start()
```

### Destroy Instance

```js
const downloader = new Downloader()
downloader.destroy()

const parser = new Parser()
parser.destroy()

const player = new Player('#canvas')
player.destroy()
```

### DB (v1.5+)

The downloaded and parsed data is persisted and cached using IndexedDB, and the next time you can avoid reusing resources for unified SVGA download and parsing

```js
import { Downloader, Parser, Player } from 'svga.lite'
import DB from 'svga.lite/db'

const svgaFile = 'test.svga'
let data = void 0
let db = void 0

try {
  db = new DB()
} catch (error) {
  console.error(error)
}

if (db) {
  data = await db.find(svgaFile)
}

if (!data) {
  const downloader = new Downloader()
  const fileData = await downloader.get(svgaFile)
  const parser = new Parser()

  data = await parser.do(fileData)

  // insert data to db
  db && (await db.insert(svgaFile, data))
}

const player = new Player('#canvas')
await player.mount(data)

player.start()
```

## Downloader Cancel

You can cancel the SVGA file request in the download

```js
downloader.get('test.svga').then((fileData) => {
  console.log('download complete')
}).catch(error => {
  console.log('catch', error)
})

setTimeout(() => {
  downloader.cancel() // or downloader.destroy()
}, 1000)
```

## Contributing

We are grateful to the community for contributing bugfixes and improvements.

```sh
# Installation dependencies
yarn install

# Development & Test
yarn test

# Build
yarn build
```

## LICENSE

[MIT](./LICENSE)
