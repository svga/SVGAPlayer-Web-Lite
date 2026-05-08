# SVGAPlayer-Web-Pro &middot; [![npm version](https://img.shields.io/npm/v/svga.svg?style=flat)](https://www.npmjs.com/package/svga) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://reactjs.org/docs/how-to-contribute.html#your-first-pull-request)

这是一个 SVGA 在移动端 Web 上的播放器，它的目标是 **更轻量**、**更高效**

## 实现

- [x] 体积 < 60kb (gzip < 18kb)
- [x] 兼容 Android 4.4+ / iOS 9+
- [x] 更好的异步操作
- [x] 多线程 (WebWorker) 解析文件数据
- [x] OffscreenCanvas / ImageBitmap
- [x] `SVGAPlayer` facade：`load()` / `prepare()` / `play()` 隐藏 parser 和 compiler 细节
- [x] keyed slots：同一个播放器实例可按 `key` 管理多个已加载 SVGA，并支持切换播放
- [x] Canvas / WebGL backend：构造时通过 `renderMode: 'canvas' | 'webgl' | 'auto'` 选择渲染后端
- [x] 替换元素与动态元素：通过 `replace({ key, mode, element })` 批量更新指定 slot
- [x] 快照：`snapshot()` 可返回当前 backend 画布表面
- [x] 原版对比页：`__test__/remote-svga-player.html` 可同时对比本地 Canvas / auto / WebGL 与 CDN 原版 `svga.lite`

## 实验性

- [x] WebGL 加速
- [ ] OffscreenCanvas 渲染
- [ ] WebGPU 加速

## 差异

* 不计划支持播放 SVGA 1.x 格式
* 不计划支持 SVGA 内音频解析与播放
* 不计划支持 WebAssembly 解析或渲染路径

## 当前能力状态

### 总览

| 分类 | 能力 |
| --- | --- |
| Public API | `new SVGAPlayer(options)`、`load({ source, key? })`、`prepare(key?)`、`play(key?)`、`start(key?)`、`pause()`、`resume()`、`stop()`、`clear()`、`delete(key?)`、`destroy()` |
| 配置边界 | `container`、`renderMode`、`parserOptions`、`isCacheFrames`、`isUseIntersectionObserver` 为构造期配置；`setConfig()` 只更新播放配置 |
| keyed slots | 默认 `default` key；支持按 key 缓存 parsed / compiled 状态；支持预热、播放切换、删除 slot、过期异步 load 保护 |
| 解析 | URL / 已解析 `Video` 输入；实例级共享 `Parser`；URL load 串行队列；WebWorker / 非 WebWorker parser 选项 |
| 事件 | `start`、`resume`、`pause`、`stop`、`process`、`end`、`error`，`process` 包含 `currentFrame` 和 `progress` |
| 替换与动态元素 | `replace()` 支持 `mode: 'replace'` 和 `mode: 'dynamic'`，并按 key 批量更新目标 slot |
| 缓存 | `cache({ key, id })` 会按需加载独立 DB bundle，并把内部 parsed 数据写入内置 IndexedDB |
| 能力诊断 | 编译阶段记录动画所需能力；WebGL 缺失能力时触发非阻断 `error` 并 `console.warn`，不支持部分会被跳过 |
| 手动验证页 | `__test__/remote-svga-player.html` 支持本地三种 render mode 与原版 `svga.lite` 对比；单帧 fixture 会做 canvas 像素检查，避免空白误判成功 |

### Render 能力

| 能力 | Canvas | WebGL |
| --- | --- | --- |
| 静态图片纹理 | ✓ | ✓ |
| 替换图片纹理 | ✓ | ✓ |
| 动态元素纹理 | ✓ | ✓ |
| transform | ✓ | ✓ |
| alpha | ✓ | ✓ |
| rect fill | ✓ | ✓ |
| rect stroke | ✓ | ✓ |
| rounded rect fill | ✓ | ✓ |
| rounded rect stroke | ✓ | ✓ |
| ellipse fill | ✓ | ✓ |
| ellipse stroke | ✓ | ✓ |
| path fill | ✓ |  |
| path stroke | ✓ |  |
| mask / clipPath | ✓ |  |
| stroke width | ✓ | ✓ |
| stroke lineCap | ✓ |  |
| stroke lineJoin | ✓ |  |
| stroke miterLimit | ✓ |  |
| stroke lineDash | ✓ |  |
| frame cache | ✓ |  |
| snapshot | ✓ | ✓ |
| WebGL context lost / restore |  | ✓ |

## 安装

### NPM

```sh
yarn add svga
# 或者
npm i svga
```

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
import { SVGAPlayer } from 'svga'

const player = new SVGAPlayer({
  container: document.getElementById('canvas'),
  renderMode: 'auto'
})

await player.load({ source: 'xx.svga' })

player.on('start', () => console.log('onStart'))
player.on('resume', () => console.log('onResume'))
player.on('pause', () => console.log('onPause'))
player.on('stop', () => console.log('onStop'))
player.on('process', ({ currentFrame, progress }) => console.log('onProcess', currentFrame, progress))
player.on('end', () => console.log('onEnd'))
player.on('error', error => console.error(error))

// 开始播放动画
await player.play()

// 暂停播放动画
// player.pause()

// 继续播放动画
// player.resume()

// 停止播放动画
// player.stop()

// 清空动画
// player.clear()

// 销毁
// player.destroy()
```

### ParserConfigOptions

```ts
new SVGAPlayer({
  container: document.getElementById('canvas'),
  parserOptions: {
    // 是否取消使用 WebWorker，默认值 false
    isDisableWebWorker: false,

    // 是否取消使用 ImageBitmap 垫片，默认值 false
    isDisableImageBitmapShim: false
  }
})
```

### SVGAPlayerInitOptions / Playback Config

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

new SVGAPlayer({
  // 播放动画的 Canvas 元素，构造时必填
  container: HTMLCanvasElement

  // 构造期渲染模式，默认值 auto。auto 只按浏览器 WebGL 可用性选择 WebGL 或 Canvas
  renderMode?: 'auto' | 'canvas' | 'webgl'

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

`setConfig()` 只接受播放配置：`loop`、`fillMode`、`playMode`、`startFrame`、`endFrame`、`loopStartFrame`、`isOpenNoExecutionDelay`。`container`、`renderMode`、`parserOptions`、`isCacheFrames`、`isUseIntersectionObserver` 都是构造期配置。

### 替换元素 / 插入动态元素

使用 `replace()` 对指定 keyed slot 写入替换元素或动态元素，不需要直接修改解析后的数据元。

```js
await player.load({ source: 'xx.svga', key: 'gift' })

// 替换元素
const image = new Image()
image.src = 'https://xxx.com/xxx.png'
player.replace({
  key: 'gift',
  element: {
    key: image
  }
})

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
player.replace({
  key: 'gift',
  mode: 'dynamic',
  element: {
    key: fontCanvas
  }
})

await player.play('gift')
```

### DB

`SVGAPlayer.cache({ key, id })` 会在首次调用时动态加载独立的 DB bundle，把内部 parsed 数据写入内置 [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)。`DB` 不从主包入口导出，避免把 IndexedDB 逻辑打进主 bundle。

缓存写入不需要业务传入 DB 实例；读取缓存仍可由业务自己的持久化逻辑完成，或直接走 URL 重新加载。

```js
import { SVGAPlayer } from 'svga'

try {
  const url = 'xx.svga'
  const player = new SVGAPlayer({
    container: document.getElementById('canvas'),
    parserOptions: {
      // ImageBitmap 数据无法直接存储到 IndexedDB 内
      isDisableImageBitmapShim: true
    }
  })
  await player.load({ source: url })
  await player.cache({ id: url })
  await player.play()
} catch (error) {
  console.error(error)
}
```

## TypeScript 声明 SVGA 文件

```ts
// global.d.ts
declare module '*.svga' {
  const source: string
  export default source
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
import { SVGAPlayer } from 'svga'
import xx from './xx.svga'
const player = new SVGAPlayer({
  container: document.getElementById('canvas')
})
await player.load({ source: xx })
await player.play()
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
import { SVGAPlayer } from 'svga'
import xx from './xx.svga?url'
const player = new SVGAPlayer({
  container: document.getElementById('canvas')
})
await player.load({ source: xx })
await player.play()
```

## [VSCode Plugin SVGA Preview](https://marketplace.visualstudio.com/items?itemName=svga-perview.svga-perview)

在 VSCode 编辑器预览 SVGA 文件，感谢 [@ETTTTT](https://github.com/ETTTTT) 提供。

## 贡献

我们感谢社区提供错误修正和改进。

### 环境要求
Node.js v16.x

```sh
# 安装依赖
yarn install

# 开发 & 测试
yarn test

# 构建
yarn build
```

## LICENSE

[Apache License 2.0](./LICENSE)
