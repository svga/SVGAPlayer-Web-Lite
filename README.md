# SVGAPlayer-Web-Lite &middot; [![npm version](https://img.shields.io/npm/v/svga.svg?style=flat)](https://www.npmjs.com/package/svga) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/svga/SVGAPlayer-Web-Lite/pulls)

这是一个 SVGA 在移动端 Web 上的播放器，它的目标是 **更轻量**、**更高效**

## 实现

- [x] 单个 JavaScript 产物 < 88 KiB（gzip < 25 KiB）
- [x] 自动化验收覆盖 Chromium、Firefox、WebKit
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

这是一个 Web 包，不设置 Android `minSdk` 或 iOS/iPadOS `Deployment Target`；原生宿主应用的最低版本由宿主自行设置。项目会在 Chromium、Firefox、WebKit 中自动验收，但不代表任何移动设备或最低系统版本的真机认证。

### CDN

```html
<script src="https://unpkg.com/svga/dist/index.min.js"></script>
```

包只公开根入口 `svga`：ES module 使用 `dist/index.mjs`，CommonJS 使用
`dist/index.cjs`，浏览器 UMD 使用 `dist/index.min.js`。不支持从
`svga/dist/*` 深层导入。

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
  isDisableWebWorker: false
})
```

默认模式在 Blob Worker 中下载并解析文件，不需要 `unsafe-eval`。严格 CSP
至少需要允许实际资源来源，并设置 `worker-src blob:`；旧浏览器可同时设置
`child-src blob:`。只有显式设置 `isDisableWebWorker: true` 的直接模式使用
动态代码执行，因此该模式需要宿主允许 `unsafe-eval`。

Parser 返回的 `Video.images` 是可缓存的 `Uint8Array` 字节。Player 在挂载时
按顺序解码图片，并只释放自己创建的位图或临时对象 URL；调用方提供的替换
元素和动态元素不会被 Player 释放。

解析器拒绝非 2xx 响应、超过 8 MiB 的压缩输入和超过 16 MiB 的解压输出。
解析后还会限制画布边长 4096、画布总像素 16,777,216、帧率 120、帧数
10,000、精灵 2,000、精灵帧 500,000、图形 100,000、图片 512，以及
总路径数据 1,048,576。Player 另限制单张图片 16,777,216 像素、全部图片
33,554,432 像素。

### PlayerConfigOptions

```ts
new Player({
  // 播放动画的 Canvas 元素
  container?: HTMLCanvasElement

  // 循环次数，默认值 0（无限循环）
  loop?: number | boolean

  // 最后停留的目标模式，默认值 forwards
  // 类似于 https://developer.mozilla.org/en-US/docs/Web/CSS/animation-fill-mode
  fillMode?: 'forwards' | 'backwards'

  // 播放模式，默认值 forwards
  playMode?: 'forwards' | 'fallbacks'

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

`player.config` 返回只读快照。配置变更必须通过 `player.setConfig(...)`，无效
的循环、帧范围、容器或布尔配置会立即被拒绝。

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
    const parser = new Parser()
    svga = await parser.load(url)
    await db.insert(url, svga)
  }
  await player.mount(svga)
} catch (error) {
  console.error(error)
}
```

DB 在第一次读写时才打开数据库，使用结构化克隆保存稳定的 Video 数据。
替换元素和动态元素不会进入缓存；旧格式、损坏或超出安全限制的记录按缓存
未命中处理，并在同一事务中尽力删除。

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

项目开发基线为 Node.js 24.18.1、npm 12.0.2 和 TypeScript 7。构建只调用
TypeScript 7 命令行，不依赖已删除的 TypeScript 编程接口。

```sh
# 选择 Node.js 24（使用 nvm 时）
nvm use

# 按锁文件安装依赖
npm ci

# 监听模式，供本地开发时持续运行
npm run dev
```

### 自动检查

以下测试命令都会在完成后退出；`npm run dev` 才是持续监听模式。

- `npm test`：运行一次完整单元测试。
- `npm run coverage`：运行一次单元测试并单独报告语句、分支、函数和行覆盖率。
- `npm run test:browser`：先构建，再在 Chromium、Firefox、WebKit 中运行真实浏览器流程。
- `npm run test:package`：先构建，再生成真实 npm 压缩包，检查确定性构建、精确文件清单、ES2017 语法以及 CommonJS、ESM、UMD、TypeScript 消费方式。
- `npm run verify`：依次运行代码规范、类型、覆盖率、三种浏览器和真实包消费检查；不会在覆盖率之外重复运行单元测试。

测试通过率表示测试用例是否全部成功，覆盖率百分比表示源码被测试执行到的比例，两者是不同指标，不能互相替代。覆盖率硬门槛为 statements 95%、branches 90%、functions 95%、lines 95%；生成的 protobuf 解码器和纯类型声明不参与统计。

## LICENSE

[Apache License 2.0](./LICENSE)
