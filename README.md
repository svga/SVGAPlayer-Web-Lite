# SVGAPlayer-Web-Lite &middot; [![npm version](https://img.shields.io/npm/v/svga.svg?style=flat)](https://www.npmjs.com/package/svga) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://reactjs.org/docs/how-to-contribute.html#your-first-pull-request)

这是一个 SVGA 在移动端 Web 上的播放器，它的目标是 **更轻量**、**更高效**

## 实现

- [x] 体积 < 60kb (gzip < 18kb)
- [x] 兼容 Android 4.4+ / iOS 9+
- [x] 更好的异步操作
- [x] 多线程 (WebWorker) 解析文件数据
- [x] OffscreenCanvas / ImageBitmap

## 实验性

- [ ] 渲染引擎模拟运行在 WebWorker
- [ ] 使用 WebAssembly 替代 WebWorker
- [ ] GPU 加速运算

## 差异

* 不支持播放 SVGA 1.x 格式
* 不支持声音播放

## 安装

### NPM

```sh
yarn add svga
# 或者
npm i svga
```

### CDN

```html
<script src="https://cdn.jsdelivr.net/npm/svga/dist/index.min.js"></script>
```

## 使用

### 简单使用

```html
<canvas id="canvas"></canvas>
```

```js
import { Parser, Player } from 'svga'

const parser = new Parser()
const svga = await parser.load('xx.svga')

const player = new Player(document.getElementById('canvas'))
await player.mount(svga)

player.onStart = () => console.log('onStart')
player.onResume = () => console.log('onResume')
player.onPause = () => console.log('onPause')
player.onStop = () => console.log('onStop')
player.onProcess = () => console.log('onProcess', player.progress)
player.onEnd = () => console.log('onEnd')

// 开始播放动画
player.start()

// 暂停播放动画
// player.pause()

// 继续播放动画
// player.resume()

// 停止播放动画
// player.stop()

// 清空动画
// player.clear()

// 销毁
// parser.destroy()
// player.destroy()
```

### ParserConfigOptions

```ts
new Parser({
  // 是否取消使用 WebWorker，默认值 false
  isDisableWebWorker: false,

  // 是否取消使用 ImageBitmap 垫片，默认值 false
  isDisableImageBitmapShim: false
})
```

### PlayerConfigOptions

```ts
const enum PLAYER_FILL_MODE {
  FORWARDS = 'forwards',
  BACKWARDS = 'backwards'
}

const enum PLAYER_PLAY_MODE {
  FORWARDS = 'forwards',
  FALLBACKS = 'fallbacks'
}

new Player({
  // 播放动画的 Canvas 元素
  container?: HTMLCanvasElement

  // 循环次数，默认值 0（无限循环）
  loop?: number | boolean

  // 最后停留的目标模式，默认值 forwards
  // 类似于 https://developer.mozilla.org/en-US/docs/Web/CSS/animation-fill-mode
  fillMode?: PLAYER_FILL_MODE

  // 播放模式，默认值 forwards
  playMode?: PLAYER_PLAY_MODE

  // 开始播放的帧数，默认值 0
  startFrame?: number

  // 结束播放的帧数，默认值 0
  endFrame?: number

  // 是否开启缓存已播放过的帧数据，默认值 false
  // 开启后对已绘制的帧进行缓存，提升重复播放动画性能
  isCacheFrames?: boolean

  // 是否开启动画容器视窗检测，默认值 false
  // 开启后利用 Intersection Observer API 检测动画容器是否处于视窗内，若处于视窗外，停止描绘渲染帧避免造成资源消耗
  // https://developer.mozilla.org/zh-CN/docs/Web/API/Intersection_Observer_API
  isUseIntersectionObserver?: boolean

  // 是否使用避免执行延迟，默认值 false
  // 开启后使用 `WebWorker` 确保动画按时执行（避免个别情况下浏览器延迟或停止执行动画任务）
  // https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API#Policies_in_place_to_aid_background_page_performance
  isOpenNoExecutionDelay?: boolean
})
```

### 替换元素 / 插入动态元素

可通过修改解析后的数据元，从而实现修改元素、插入动态元素功能

```js
const svga = await parser.load('xx.svga')

// 替换元素
const image = new Image()
image.src = 'https://xxx.com/xxx.png'
svga.replaceElements['key'] = image

// 动态元素
const text = 'hello gg'
const fontCanvas = document.getElementById('font')
const fontContext = fontCanvas.getContext('2d')
fontCanvas.height = 30
fontContext.font = '30px Arial'
fontContext.textAlign = 'center'
fontContext.textBaseline = 'middle'
fontContext.fillStyle = '#000'
fontContext.fillText(text, fontCanvas.clientWidth / 2, fontCanvas.clientHeight / 2)
svga.dynamicElements['key'] = fontCanvas

await player.mount(svga)
```

### DB

利用 [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) 进行持久化缓存已下载并解析的数据元，可避免重复消耗资源对相同 SVGA 下载和解析

```js
import { DB } from 'svga'

try {
  const url = 'xx.svga'
  const db = DB()
  let svga = await db.find(url)
  if (!svga) {
    const parser = new Parser({ isDisableImageBitmapShim: true })
    svga = await parser.load(url)
    await db.insert(url, svga)
  }
  await player.mount(svga)
} catch (error) {
  console.error(error)
}
```

## Webpack SVGA

SVGA 文件可用 [url-loader](https://www.npmjs.com/package/raw-loader) 配置 Webpack 进行打包构建，例如：

```js
// webpack.config.js
module.exports = {
  module: {
    rules: [
      {
        test: /\.svga$/i,
        use: 'url-loader'
      }
    ]
  }
}

// js
import { Parser } from 'svga'
import XX from './xx.svga'
const parser = new Parser()
const svga = await parser.load(XX)
```

## [VSCode Plugin SVGA Preview](https://marketplace.visualstudio.com/items?itemName=svga-perview.svga-perview)

在 VSCode 编辑器预览 SVGA 文件，感谢 [@ETTTTT](https://github.com/ETTTTT) 提供。

## 贡献

我们感谢社区提供错误修正和改进。

```sh
# 安装依赖
yarn install

# 开发 & 测试
yarn test

# 构建
yarn build
```

## LICENSE

[MIT](./LICENSE)
