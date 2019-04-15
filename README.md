# SVGA.Lite

This is a SVGA player on the Web, and its goal is to be lighter and more efficient, But at the same time it also gave up compatibility support for some older browsers.

[简体中文](./README.zh-CN.md)

## Target Future

- [x] Size = 80kb (gzip = 27kb)
- [x] Compatible Android 4+ / iOS 9+
- [x] Better Asynchronous Operation
- [x] Multi-threaded (WebWorker) parsing file data

## Experimental

- [ ] Use WebAssembly instead of WebWorker
- [ ] Rendering engine simulation runs in the WebWorker
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

## Simple Use

```html
<canvas id="canvas"></canvas>
```

```js
import { Downloader, Parser, Player } from 'svga.lite'

const downloader = new Downloader()
// calls WebWorker parsing by default, configurable `new Parser({ disableWorker: true })`
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

## Support v1.x of SVGA (v1.2.0+)

```js
import { Downloader, Parser, Player } from 'svga.lite'
import Parser1x from 'svga.lite/parser.1x'
import util from 'svga.lite/util'

const downloader = new Downloader()

const svgaFile = './svga/show.svga'

const fileData = await downloader.get(svgaFile)

// Parser1x calls WebWorker parsing by default, configurable `new Parser1x({ disableWorker: true })`
const parser = util.version(fileData) === 1 ? new Parser1x() : new Parser()

const svgaData = await parser.do(fileData)

const player = new Player('#canvas')

await player.mount(svgaData)

player.start()
```

## Replace Element

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

## Dynamic Element

You can insert some dynamic elements with `svga data`.

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

## Reusable instantiated Downloader & Parser

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

## Destroy Instance (v1.2.0+)

```js
const parser = new Parser()
parser.destroy()

const player = new Player('#canvas')
player.destroy()
```

## LICENSE

[MIT](./LICENSE)
