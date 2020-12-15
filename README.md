# SVGAPlayer-Web-Lite

这是一个 SVGA 在移动端 Web 上的播放器，它的目标是 **更轻量**、**更高效**，但它也放弃了对旧版本浏览器的兼容性支持。

[English](./README.en.md)

## 依赖 Promise

若出现 `Promise is not a constructor` 等问题，外链 polyfill 或配置 babel 进行兼容

```html
<script src="https://cdn.jsdelivr.net/npm/es6-promise@4/dist/es6-promise.auto.min.js"></script>
```

## 实现

- [x] 体积 = 55kb (gzip = 18kb)
- [x] 兼容 Android 4.4+ / iOS 9+
- [x] 更好的异步操作
- [x] 多线程 (WebWorker) 解析文件数据
- [x] OffscreenCanvas

## 实验性

- [ ] 渲染引擎模拟运行在 WebWorker
- [ ] 使用 WebAssembly 替代 WebWorker
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
// 默认调用 WebWorker 线程解析
// 可配置 new Parser({ disableWorker: true }) 禁止
const parser = new Parser()
// #canvas 是 HTMLCanvasElement
const player = new Player('#canvas')

;(async () => {
  const fileData = await downloader.get('./xxx.svga')
  const svgaData = await parser.do(fileData)

  player.set({ loop: 1 })

  await player.mount(svgaData)

  player
    // 开始动画事件回调
    .$on('start', () => console.log('event start'))
    // 暂停动画事件回调
    .$on('pause', () => console.log('event pause'))
    // 停止动画事件回调
    .$on('stop', () => console.log('event stop'))
    // 动画结束事件回调
    .$on('end', () => console.log('event end'))
    // 清空动画事件回调
    .$on('clear', () => console.log('event clear'))
    // 动画播放中事件回调
    .$on('process', () => console.log('event process', player.progress))

  // 开始播放动画
  player.start()

  // 暂停播放东湖
  // player.pause()

  // 停止播放动画
  // player.stop()

  // 清空动画
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
cacheFrames（v1.5+）| 是否缓存帧 | `boolean` | `false` | 开启后对已绘制的帧进行缓存，提升重复播放动画性能
intersectionObserverRender（v1.5+）| 是否开启动画容器视窗检测 | `boolean` | `false` | 开启后利用 [Intersection Observer API](https://developer.mozilla.org/zh-CN/docs/Web/API/Intersection_Observer_API) 检测动画容器是否处于视窗内，若处于视窗外，停止描绘渲染帧避免造成资源消耗
noExecutionDelay(v1.5+) | 是否避免执行延迟 | `boolean` | `false` | 开启后使用 `WebWorker` 确保动画按时执行（ [一些情况下浏览器会延迟或停止执行一些任务](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API#Policies_in_place_to_aid_background_page_performance) ）

### 支持 1.x 版本 SVGA

```js
import { Downloader, Parser, Player } from 'svga.lite'
import Parser1x from 'svga.lite/parser.1x'
import * as util from 'svga.lite/util'

const downloader = new Downloader()
const svgaFile = './svga/show.svga'
const fileData = await downloader.get(svgaFile)

// Parser1x 默认调用 WebWorker 线程解析
// 可配置 new Parser1x({ disableWorker: true }) 禁止
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

你可以通过 `svga data` 插入一些[动态元素](https://developer.mozilla.org/en/docs/Web/API/CanvasRenderingContext2D/drawImage)

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

为动态元素设置自适应参数 `fit`，参考[例子](./tests/11.test-dynamicElement.html).

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

### 销毁实例

```js
const downloader = new Downloader()
downloader.destroy()

const parser = new Parser()
parser.destroy()

const player = new Player('#canvas')
player.destroy()
```

### DB (v1.5+)

已下载并解析的数据利用 IndexedDB 进行持久化缓存，下次可避免重复消耗资源对统一 SVGA 下载和解析

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

  // 插入数据
  db && (await db.insert(svgaFile, data))
}

const player = new Player('#canvas')
await player.mount(data)

player.start()
```

## Downloader Cancel (v1.4.0+)

你可以取消下载中的 SVGA 文件请求

```js
downloader.get('test.svga').then((fileData) => {
  console.log('下载完成')
}).catch(error => {
  console.log('catch', error)
})

setTimeout(() => {
  downloader.cancel() // 或者 downloader.destroy()
}, 1000)
```

## 贡献

我们感谢社区提供错误修正和改进。

```sh
# 安装依赖
yarn install

# 开发测试
yarn test

# 构建
yarn build
```

## LICENSE

[MIT](./LICENSE)
