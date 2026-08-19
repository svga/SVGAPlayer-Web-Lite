# SVGAPlayer-Web-Lite &middot; [![npm version](https://img.shields.io/npm/v/svga.svg?style=flat)](https://www.npmjs.com/package/svga) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/svga/SVGAPlayer-Web-Lite/pulls)

这是一个 SVGA 在移动端 Web 上的播放器，它的目标是 **更轻量**、**更高效**

## 实现

- [x] 单个 JavaScript 产物 < 60 KiB（gzip < 18 KiB）
- [x] 面向 Android 8.0+（API 26，使用受维护且可更新的 Chrome 或 WebView）与 iOS/iPadOS 16+ Safari/WKWebView
- [x] 使用 ES2017 语法；安装包检查会验证 ES2017 语法解析
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
npm install svga
```

这是一个 Web 包，不设置 Android `minSdk` 或 iOS/iPadOS `Deployment Target`；原生宿主应用的最低版本由宿主自行设置。当前本地 Playwright 测试用于浏览器行为和包消费验证，不代表最低版本设备上的真机认证。

### CDN

```html
<script src="https://unpkg.com/svga/dist/index.min.js"></script>
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
player.onProcess = () => console.log('onProcess', player.currentFrame / player.totalFrames)
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
  // 播放完成后停在首帧
  FORWARDS = 'forwards',
  // 播放完成后停在尾帧
  BACKWARDS = 'backwards'
}

const enum PLAYER_PLAY_MODE {
  // 顺序播放
  FORWARDS = 'forwards',
  // 倒序播放
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

  // 循环播放开始的帧数，可设置每次循环从中间开始。默认值 0，每次播放到 endFrame 后，跳转到此帧开始循环，若此值小于 startFrame 则不生效
  // 类似于 https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/loopStart
  loopStartFrame?: number

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
  const db = new DB()
  let svga = await db.find(url)
  if (!svga) {
    // Parser 需要配置取消使用 ImageBitmap 特性，ImageBitmap 数据无法直接存储到 DB 内
    const parser = new Parser({ isDisableImageBitmapShim: true })
    svga = await parser.load(url)
    await db.insert(url, svga)
  }
  await player.mount(svga)
} catch (error) {
  console.error(error)
}
```

## TypeScript 声明 SVGA 文件

```ts
// global.d.ts
declare module '*.svga'
```

## Webpack SVGA

SVGA 文件可用 [url-loader](https://www.npmjs.com/package/url-loader) 配置 Webpack 进行打包构建，例如：

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
import xx from './xx.svga'
const parser = new Parser()
const svga = await parser.load(xx)
```

## Vite SVGA

SVGA 文件可通过配置 Vite 作为 [静态资源](https://vitejs.dev/guide/assets.html#explicit-url-imports) 打包构建，例如：

```js
// vite.config.ts
export default defineConfig({
  assetsInclude: [
    'svga'
  ]
})

// js
import { Parser } from 'svga'
import xx from './xx.svga?url'
const parser = new Parser()
const svga = await parser.load(xx)
```

## [VSCode Plugin SVGA Preview](https://marketplace.visualstudio.com/items?itemName=svga-perview.svga-perview)

在 VSCode 编辑器预览 SVGA 文件，感谢 [@ETTTTT](https://github.com/ETTTTT) 提供。

## 贡献

我们感谢社区提供错误修正和改进。

### 环境要求

项目开发基线为 Node.js 24 和 `package.json` 中 `packageManager` 指定的 npm 版本。

```sh
# 选择 Node.js 24（使用 nvm 时）
nvm use

# 按锁文件安装依赖
npm ci --allow-git=root

# 监听模式，供本地开发时持续运行
npm run dev
```

### 自动检查

以下测试命令都会在完成后退出；`npm run dev` 才是持续监听模式。

- `npm test`：运行一次完整单元测试。
- `npm run coverage`：运行一次单元测试并单独报告语句、分支、函数和行覆盖率。
- `npm run test:browser`：先构建，再在桌面 Chromium、Firefox、WebKit 和移动 Chromium 视口中运行真实浏览器流程。
- `npm run test:package`：先构建，再生成真实 npm 压缩包，检查确定性构建、精确文件清单、ES2017 语法以及 CommonJS、ESM、UMD、TypeScript 消费方式。
- `npm run verify`：依次运行代码规范、类型、覆盖率、四种浏览器和真实包消费检查；不会在覆盖率之外重复运行单元测试。

测试通过率表示测试用例是否全部成功，覆盖率百分比表示源码被测试执行到的比例，两者是不同指标，不能互相替代。

## LICENSE

[Apache License 2.0](./LICENSE)
