# SVGAPlayer-Web-Lite

这是一个 SVGA 在 Web 上的播放器，它的目标是更轻量级、更高效，但同时它也放弃了对一些旧版本浏览器的兼容性支持。

## 目标未来

- [x] 体积 = 80k (gzip = 27kb)
- [x] 兼容 Android 4+ / iOS 9+
- [x] 更好的异步操作
- [x] 多线程 (WebWorker) 解析文件数据

## 实验性

- [ ] 使用 WebAssembly 替代 WebWorker
- [ ] 渲染引擎模拟运行在 WebWorker
- [ ] GPU 加速运算

## 差异

* 不支持声音播放

## 安装

### NPM

```sh
yarn add svga.lite

# 或者

npm i svga.lite
```

### CDN

```html
<script src="https://cdn.jsdelivr.net/npm/svga.lite/svga.lite.min.js"></script>
```

## 使用

### 简单使用

```html
<canvas id="canvas"></canvas>
```

```js
import { Downloader, Parser, Player } from 'svga.lite'

const downloader = new Downloader()
// 默认调用 WebWorker 解析，可配置 new Parser({ disableWorker: true }) 禁止
const parser = new Parser()
const player = new Player('#canvas') // #canvas 是 HTMLCanvasElement

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

### Player.set({ 参数 })

属性名 |  说明 | 类型 | 默认值 | 备注
-|-|-|-|-
loop | 循环次数 | `number` | `0` | 设置为 `0` 时，循环播放
fillMode | 最后停留的目标模式 | `forwards` `backwards` | `forwards` | 类似于 [css animation-fill-mode](https://developer.mozilla.org/zh-CN/docs/Web/CSS/animation-fill-mode)
playMode | 播放模式 | `forwards` `fallbacks` | `forwards` |
startFrame | 开始播放帧 | `number` | `0` |
endFrame | 结束播放帧 | `number` | `0` | 设置为 `0` 时，默认为 SVGA 文件最后一帧

### 支持 1.x 版本 SVGA (v1.2.0+)

```js
import { Downloader, Parser, Player } from 'svga.lite'
import Parser1x from 'svga.lite/parser.1x'
import util from 'svga.lite/util'

const downloader = new Downloader()

const svgaFile = './svga/show.svga'

const fileData = await downloader.get(svgaFile)
// Parser1x 默认调用 WebWorker 解析，可配置 new Parser1x({ disableWorker: true }) 禁止
const parser = util.version(fileData) === 1 ? new Parser1x() : new Parser()

const svgaData = await parser.do(fileData)

const player = new Player('#canvas')

await player.mount(svgaData)

player.start()
```

### 替换元素

你能够通过改变 `svga data` 对应键值的元素

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

### 动态元素

你可以通过 `svga data` 插入一些动态元素

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

### 可复用实例化 Downloader & Parser

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

### 销毁实例 (v1.2.0+)

```js
const parser = new Parser()
parser.destroy()

const player = new Player('#canvas')
player.destroy()
```

### DB (v1.3.0+)

已下载并解析的数据利用 WebSQL 进行持久化缓存，下次可避免重复消耗资源对统一 SVGA 下载和解析

```js
import { Downloader, Parser, Player } from 'svga.lite'
import DB from 'svga.lite/db'

const svgaFile = 'test.svga'
let data = void 0
let db = void 0

try {
  db = new SVGADB()
} catch (error) {
  console.error(error)
}

if (db) {
  const record = (await db.find(svgaFile))[0]
  record && (data = JSON.parse(record.data))
}

if (!data) {
  const downloader = new Downloader()
  const fileData = await downloader.get(svgaFile)
  const parser = new Parser()

  data = await parser.do(fileData)

  // 插入数据
  db && (await db.insert(svgaFile, JSON.stringify(data)))
}

const player = new Player('#canvas')
await player.mount(data)

player.start()
```

## 贡献

我们感谢社区提供错误修正和改进。

```sh
# 开发测试
npm run test

# 构建
npm run build

# 发布
npm publish
```

## LICENSE

[MIT](./LICENSE)
