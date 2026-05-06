# SVGA Render Backend Exploration

本文记录对当前 SVGA 播放器从 Canvas 2D 渲染扩展到 WebGL、未来 WebGPU 的探索结论。它不是实现方案锁定稿，而是用于对齐接口边界、fallback 原则和已知技术难点的设计备忘。

## 背景

当前项目用于播放 SVGA 格式动画，目前只支持 Canvas 2D 渲染。期望将 `render` 方法抽离成通用接口，并接入 WebGL 渲染模式。后续可能继续接入 WebGPU，因此通用接口需要避免绑定 Canvas 2D 的 immediate-mode API。

当前大致结构如下：

```text
Parser
  |
  v
VideoEntity
  |
  v
Player
  |-- timeline / lifecycle
  |-- frame cache
  |-- Canvas 2D context
  v
render.ts
  |
  v
CanvasRenderingContext2D
```

当前 `Player` 既负责播放控制，也负责 Canvas 尺寸、清屏、离屏 Canvas、帧缓存和最终绘制。`render.ts` 则直接以 Canvas 2D API 作为目标语言。

## 目标边界

更通用的结构应将播放控制和渲染后端拆开：

```text
Player
  |
  | frame index
  v
RenderController
  |-- backend selection
  |-- resource preparation
  |-- resize / clear / destroy
  v
RenderBackend
  |-- CanvasBackend
  |-- WebGLBackend
  `-- WebGPUBackend (future)
```

核心思想：不要把通用层设计成“抽象版 CanvasContext”，而应抽成更高层的 SVGA 帧渲染协议。这样 Canvas、WebGL、WebGPU 都只是执行同一组 SVGA 渲染语义的不同后端。

对外 API 可以进一步收敛为只导出一个 `SVGAPlayer` 类，由使用方自行实例化。`Parser`、`RenderCompiler`、`RenderBackend`、`Animator` 等保留为内部模块。

```text
SVGAPlayer facade
  |
  |-- parse()
  |     `-- Parser
  |
  |-- compile()
  |     `-- RenderCompiler
  |
  |-- play() / pause() / resume() / stop()
  |     `-- Animator / timeline
  |
  |-- renderFrame()
  |     `-- active RenderBackend
  |
  `-- on()
        `-- event emitter
```

内部职责边界：

```text
Parser:
  bytes / url -> VideoEntity
  - keep existing parser worker for download / inflate / protobuf decode / image extraction

RenderCompiler:
  VideoEntity -> CompiledAnimation
  - normalize resources
  - scan features
  - detect holes / unsupported paths
  - compile frame instructions
  - choose backend
  - backend.prepare

Player timeline:
  CompiledAnimation -> current frame playback

RenderBackend:
  frame commands -> concrete rendering API
```

公开使用方式：

```ts
import { SVGAPlayer } from 'svga'

const player = new SVGAPlayer({
  container,
  renderMode: 'auto'
})

await player.parse('/xx.svga')
await player.compile()
player.play()

player.on('start', () => {})
player.on('process', ({ frame, progress }) => {})
player.on('end', () => {})
```

建议公开方法：

```ts
class SVGAPlayer {
  constructor(options: SVGAPlayerOptions)

  parse(source: string | Video): Promise<Video>
  compile(options?: CompileOptions): Promise<CompiledAnimation>

  play(): void
  pause(): void
  resume(): void
  stop(): void
  clear(): void
  destroy(): void

  on<T extends SVGAPlayerEvent>(
    event: T,
    callback: SVGAPlayerEventMap[T]
  ): () => void
}
```

事件 API 替代原来的 `onStart` / `onResume` / `onPause` / `onStop` / `onProcess` / `onEnd` 属性：

```ts
type SVGAPlayerEventMap = {
  start: () => void
  resume: () => void
  pause: () => void
  stop: () => void
  process: (payload: { frame: number; progress: number }) => void
  end: () => void
  error: (error: Error) => void
}
```

`on()` 应返回取消监听函数：

```ts
const off = player.on('end', () => {})
off()
```

状态流：

```text
idle
  |
  | parse(url | video)
  v
parsed
  |
  | compile()
  v
compiled
  |
  | play()
  v
playing
  |
  | pause()
  v
paused
  |
  | resume()
  v
playing
  |
  | stop()
  v
stopped
```

`play()` 可以要求用户先显式 `parse()` + `compile()`。这样 WebGL fallback、能力判断和编译错误会出现在明确阶段，便于调试。

一个可能的后端接口心智模型：

```ts
interface RenderBackend {
  type: 'canvas' | 'webgl' | 'webgpu'
  init(surface: HTMLCanvasElement): void
  resize(width: number, height: number): void
  prepare(video: Video, assets: RenderAssets): Promise<void>
  renderFrame(frameIndex: number): void
  clear(): void
  destroy(): void
}
```

通用层可以进一步沉淀为 render commands / display list：

```text
FrameCommands
  |-- PushState
  |-- PopState
  |-- SetAlpha
  |-- ApplyTransform
  |-- DrawTexture
  |-- DrawDynamicElement
  |-- BeginMask
  |-- DrawPath
  |-- DrawRect
  |-- DrawEllipse
  |-- Fill
  `-- Stroke
```

这类中间表示比直接抽象 `save`、`transform`、`drawImage`、`clip` 更利于 WebGL/WebGPU 做资源预处理、批处理、纹理管理和 GPU pipeline 适配。

## Compile 阶段

当前 `Player.mount(videoEntity)` 主要做绑定动画数据、设置 canvas 尺寸、清空画布、加载或转换图片资源。未来可以将这些初始化职责迁入 `RenderCompiler.compile()`，让 `SVGAPlayer` 的播放层只负责帧号和生命周期。

需要保留现有 Parser worker 边界：`parse()` 仍负责在 worker 中执行下载、解压、protobuf decode 和图片提取，产出 `VideoEntity`。`compile()` 是 Parser 之后的新阶段，不替代 Parser worker。

```text
parse(url)
  |
  v
ParserWorker
  |-- download
  |-- inflate
  |-- protobuf decode
  |-- image extraction / ImageBitmap when available
  v
VideoEntity
  |
  v
compile(video)
  |
  v
RenderCompiler
  |-- feature scan
  |-- path parse / holes detection
  |-- frame instructions
  |-- backend selection
  v
CompiledAnimation
```

当前 `mount` 职责：

```text
Player.mount(videoEntity)
  |
  |-- currentFrame = 0
  |-- totalFrames = videoEntity.frames - 1
  |-- this.videoEntity = videoEntity
  |-- clearContainer()
  |-- setSize()
  |-- bitmapsCache = {}
  `-- base64 images -> HTMLImageElement / ImageBitmap cache
```

新的 compile 职责：

```text
RenderCompiler.compile(video, options)
  |
  |-- set surface size
  |-- load / normalize images
  |-- scan video features
  |-- parse paths
  |-- detect holes / unsupported paths
  |-- compile frame instructions
  |-- resolve backend
  |-- backend.prepare(compiledPlan)
  v
CompiledAnimation
```

建议产物：

```ts
interface CompiledAnimation {
  video: Video
  size: { width: number, height: number }
  fps: number
  totalFrames: number
  frames: FrameRenderCommands[]
  resources: CompiledResources
  backend: RenderBackend
  requiredCapabilities: RenderCapabilities
}
```

Compile 完成后的原则：

```text
compile 后：
  - 要画什么已经完整确定
  - 后端能力要求已经完整确定
  - 每帧 render 不再解析 SVGA 原始数据
  - 每帧 render 不再解析 path 字符串

render 时：
  - 只读取 compiled.frames[frameIndex]
  - 执行 commands
  - 管理必要的 GPU resource / dynamic texture 状态
```

可以区分两类 compile/prepare 工作：

```text
CPU compile:
  - path parse
  - flatten curves
  - split contours
  - holes detection
  - self-intersection rough check
  - requiredCapabilities scan
  - frame instructions
  - reusable geometry cache

GPU prepare:
  - createTexture
  - createBuffer
  - compileShader / linkProgram
  - framebuffer / stencil resource
```

CPU compile 可以未来迁移到 worker；GPU prepare 必须发生在持有 WebGL context 的线程。第一阶段即使不放 worker，只要避免按帧复制 geometry，内存仍可控。

推荐内存模型：

```text
GeometryCache
  geometryId -> vertices / indices / bounds / capabilities

FrameInstructions
  frameIndex -> [
    { type: 'texture', imageKey, transform, alpha, layout },
    { type: 'shape-fill', geometryId, transform, styleId },
    { type: 'mask-begin', geometryId, transform },
  ]
```

避免：

```text
frame 0 -> transformed vertices
frame 1 -> transformed vertices
frame 2 -> transformed vertices
...
```

也就是：缓存 unique shape 的本地 geometry，每帧只保存 geometryId、transform、alpha、style 引用。

## Fallback 原则

认可的 fallback 边界是：WebGL 不可用时整体退回 Canvas，但 WebGL 后端内部不应依赖 Canvas 绘制作为纹理兜底。

```text
preferred: webgl
  |
  |-- WebGL context available
  |     `-- WebGLBackend
  |
  `-- WebGL context unavailable
        `-- CanvasBackend
```

也就是说，fallback 发生在 backend selection 层，而不是 WebGL feature implementation 层。

建议原则：

- `renderMode: 'canvas'`：始终使用 CanvasBackend。
- `renderMode: 'webgl'`：必须使用 WebGLBackend；WebGL 不可用或能力不足时抛错。
- `renderMode: 'auto'`：优先 WebGL；WebGL 不可用或动画特性超出 WebGLBackend 能力时可整体退回 CanvasBackend。

WebGL 后端内部应尽量使用 WebGL-native 方法：

```text
image sprite  -> texture quad
transform     -> matrix uniform / vertex transform
alpha         -> shader uniform / vertex alpha + blending
mask / clip   -> stencil buffer or mask pass
shape fill    -> path flatten + triangulation
stroke        -> stroke geometry
dynamic image -> texture upload/update
```

不建议在 WebGL 后端中做如下常规路径：

```text
complex shape -> Canvas rasterize -> WebGL texture
mask          -> Canvas rasterize -> WebGL texture
whole frame   -> Canvas render    -> WebGL texture
```

这些会让 WebGL 后端变成 Canvas 预渲染加 GPU 合成，也会给未来 WebGPU 后端留下错误接口压力。

## Canvas 容易但 WebGL 明显变难的点

当前 Canvas 渲染代码里有一些 API 使用非常自然，但切换到 WebGL 后需要独立子系统支撑。

| 当前 Canvas 方法或逻辑 | Canvas 为什么容易 | WebGL 难点 |
| --- | --- | --- |
| `context.clip()` | Canvas 内置 path 裁剪 | 需要 stencil buffer、mask pass，或裁剪几何 |
| `fill()` / `stroke()` | Canvas 可直接填充和描边任意 path | WebGL 需要将 path 转换为三角形；stroke 需要生成描边 mesh |
| `bezierCurveTo()` / `quadraticCurveTo()` | Canvas 原生支持曲线 | WebGL 需要曲线离散化、tessellation，或其他曲线渲染方案 |
| `arcTo()` 圆角矩形 | Canvas 原生处理圆角连接 | WebGL 要拆成直线和圆弧 polygon，再填充或描边 |
| `setLineDash()` | Canvas 原生虚线 | WebGL stroke mesh 需要按路径长度切段，处理 dash/gap |
| `lineCap` / `lineJoin` / `miterLimit` | Canvas 原生线端和连接样式 | WebGL 需要自己构造 butt/round/square cap 和 bevel/round/miter join |
| `save()` / `restore()` | Canvas 自动维护状态栈 | WebGL 需要维护 matrix、alpha、blend、stencil、style 等状态栈 |
| `globalAlpha` | Canvas 状态一行设置 | WebGL 需要 blend 设置和 shader uniform / vertex alpha 配合 |
| `drawImage()` | Canvas 可直接绘制 image/canvas/bitmap | WebGL 要管理 texture 创建、上传、更新、尺寸、释放和 context lost 恢复 |
| `toDataURL()` / `transferToImageBitmap()` 帧缓存 | Canvas / OffscreenCanvas 自带快照能力 | WebGL 需要 framebuffer texture 或 readPixels；读回 GPU 数据通常较贵 |

### 1. Mask / Clip

当前 Canvas 逻辑遇到 `frame.maskPath` 时，可以先绘制 path，再调用 `clip()` 限制后续 sprite 绘制。

WebGL 中没有对应的一行 API，通常需要：

- 使用 stencil buffer 标记 mask 覆盖区域。
- 使用单独 mask pass 写入 alpha 或 stencil。
- 将后续 draw call 限制在 stencil / mask 结果内。

这是 WebGL 接入中保真难度最高的部分之一。

### 2. Shape Path Fill

当前 shape path 可以通过 Canvas path 命令直接绘制。WebGL 需要先将 path 转成几何数据。

可能流程：

```text
SVG-like path
  |
  v
parse commands
  |
  v
flatten curves
  |
  v
triangulate fill polygon
  |
  v
draw triangles
```

难点包括曲线精度、复杂路径、自交路径、填充规则和性能缓存。

#### Holes and Fill Rule

Canvas 不需要从 SVGA path 中显式读出“哪个 contour 是外轮廓，哪个 contour 是洞”。它接收的是一串 path 命令，并在 `fill()` 时由浏览器内部图形实现根据填充规则判断哪些区域是 inside，哪些区域是 outside。

当前项目中 `drawBezier` 只是将 path 命令逐条喂给 Canvas，然后调用 `context.fill()`：

```ts
context.beginPath()
// moveTo / lineTo / bezierCurveTo / quadraticCurveTo / closePath ...
context.fill()
```

`context.fill()` 默认使用 `nonzero` winding rule。它的大致逻辑是：从某个点向外画一条射线，统计路径绕这个点的方向次数。

```text
顺时针边穿过：+1
逆时针边穿过：-1

winding number != 0 -> inside
winding number == 0 -> outside
```

因此洞通常可以通过方向相反的 sub-path 表达：

```text
outer contour: clockwise
inner contour: counter-clockwise
```

如果使用 `evenodd` rule，则通过射线穿过边的次数判断：

```text
cross count is odd  -> inside
cross count is even -> outside
```

Canvas 支持显式传入 fill rule：

```ts
context.fill('nonzero')
context.fill('evenodd')
```

但当前项目没有传参，因此实际是 Canvas 默认的 `nonzero`。

WebGL 没有 Canvas 这样的 path fill 内建能力。如果使用 earcut 一类 triangulation 工具，调用方需要显式提供 holes：

```ts
earcut(vertices, holes, 2)
```

这意味着 WebGLBackend 不能只把 SVGA path 命令原样交给 GPU，而需要补上 Canvas 内部原本隐藏的分析过程：

```text
SVGA path commands
  |
  v
split into sub-paths / contours
  |
  v
flatten curves into points
  |
  v
calculate signed area and winding
  |
  v
build containment tree
  |
  v
classify outer contours and holes
  |
  v
triangulate
```

一个可行的基础判断流程：

```text
1. 按 moveTo / closePath 分割 contour
2. 将曲线离散成 points
3. 计算每个 contour 的 signed area
4. 用方向和包含关系推断 outer / hole
5. 按 nonzero 规则组织 triangulation 输入
```

简单的 compound path 可以这样处理；但如果路径自交、多个 contour 相互重叠，或 fill rule 语义复杂，仅靠 signed area 和 containment tree 可能无法稳定复现 Canvas 输出。此类情况应进入能力评估：`renderMode = webgl` 时可以抛 unsupported，`renderMode = auto` 时整体退 CanvasBackend。

### 3. Stroke

Stroke 通常比 fill 更难。Canvas 可以直接处理 `strokeWidth`、`lineCap`、`lineJoin`、`miterLimit`、`lineDash`，但 WebGL 需要为路径生成描边几何。

```text
path centerline
  |
  v
offset left/right edges
  |
  |-- lineCap geometry
  |-- lineJoin geometry
  |-- miter limit handling
  `-- dash segmentation
  |
  v
stroke triangles
```

如果第一阶段 WebGL 后端要控制范围，stroke 可以按能力逐步支持：先支持基础实线 stroke，再补 lineJoin / lineCap，最后补 lineDash。

### 4. Rect / Rounded Rect / Ellipse

普通矩形对 WebGL 很简单，可以直接画两个三角形。圆角矩形和椭圆则需要生成近似几何。

```text
rect
  `-- two triangles

rounded rect
  `-- straight edges + arc segments + triangulation

ellipse
  `-- polygon approximation or triangle fan
```

Canvas 里的椭圆目前本身也是用 4 段贝塞尔模拟；WebGL 可选择直接离散成 polygon。

### 5. Image / ReplaceElement / DynamicElement

图片 sprite 是 WebGL 最自然的部分：

```text
image bitmap
  |
  v
WebGLTexture
  |
  v
quad vertices + transform + alpha
```

但替换元素和动态元素需要定义纹理生命周期：

- 何时上传 texture。
- `HTMLCanvasElement` / `OffscreenCanvas` 类型动态元素是否每帧更新。
- 如何判断内容是否 dirty。
- 如何释放 texture。
- WebGL context lost 后如何恢复。

### 6. Frame Cache / Snapshot

当前 Canvas 帧缓存可以基于 `toDataURL()` 或 `transferToImageBitmap()`。WebGL 下如果要做整帧缓存，应优先考虑 framebuffer texture，而不是频繁 readPixels。

```text
render frame
  |
  v
framebuffer texture cache
  |
  v
draw cached texture on repeat
```

readPixels 会把 GPU 数据同步读回 CPU，通常会带来明显性能压力，应谨慎使用。

## WebGL 接入阶段建议

如果坚持 WebGL-native，不使用 Canvas 作为内部纹理兜底，可以按能力分阶段推进。

### Phase 1: GPU Image Sprite

目标：

- WebGL context 初始化和后端选择。
- 图片资源上传为 texture。
- sprite quad 绘制。
- transform、alpha、blend。
- replaceElement / dynamicElement 作为 texture 源。
- WebGL 不可用时整体退 Canvas。

暂不完整支持的能力可以通过 backend capability 明确暴露。

### Phase 2: Basic Shape Fill

目标：

- rect fill。
- ellipse fill。
- simple path fill。
- path flatten 和基础 triangulation。

### Phase 3: Mask / Clip

目标：

- 基于 stencil buffer 或 mask pass 实现 `clipPath` / `maskPath`。
- 保证 sprite 图片、shape 和动态元素在 mask 下的合成顺序正确。

### Phase 4: Stroke Completeness

目标：

- strokeWidth。
- lineJoin。
- lineCap。
- miterLimit。
- lineDash。

这一阶段最容易拉长周期，建议不要阻塞 WebGL 图片 sprite 的第一阶段落地。

## 能力声明

建议后端声明能力，RenderController 在 `mount` 或 `prepare` 时判断当前动画是否可由目标后端完整渲染。

```ts
interface RenderCapabilities {
  image: boolean
  dynamicTexture: boolean
  shapeFill: boolean
  shapeStroke: boolean
  clipPath: boolean
  lineDash: boolean
  snapshot: boolean
}
```

能力不足时，策略可以是：

```text
renderMode = canvas
  -> use CanvasBackend

renderMode = webgl
  -> if unsupported, throw

renderMode = auto
  -> if unsupported, fallback to CanvasBackend
```

这个策略能保持 WebGL 后端语义干净：WebGL 负责 WebGL-native 渲染，Canvas 只作为整体后端 fallback，而不是 WebGL 内部的功能兜底。

## 关键设计原则

- 通用接口描述 SVGA 渲染语义，而不是复制 Canvas 2D API。
- GPU backend 不依赖 Canvas rasterization 作为 feature fallback。
- Canvas fallback 只发生在 backend selection 层。
- WebGL/WebGPU 能力不足要显式暴露，而不是静默降级。
- Player 负责播放生命周期，RenderBackend 负责渲染资源和帧绘制。
- 帧缓存、资源上传、context lost 恢复应归属渲染后端或 RenderController，而不是散落在 Player 中。

## PixiJS 参考方案

PixiJS v8 是一个值得参考的 GPU 2D 渲染架构样本，但本项目只参考方案，不直接引入 `pixi.js` 依赖。

参考边界：

```text
参考：
  - GraphicsContext / instructions
  - ShapeBuilder / geometry builder
  - Renderer backend / capabilities
  - Stencil mask 思路
  - Texture lifecycle / GC 思路

不引入：
  - pixi.js dependency
  - scene graph 全家桶
  - event system
  - asset loader
  - filter system
  - large renderer framework
```

PixiJS 的核心启发是：不要把 Canvas API 逐个映射到 WebGL，而是先把绘制意图记录成中间指令，再编译为 GPU 可消费的 geometry、texture、shader resources 和 batches。

```text
PixiJS shape
  |
  v
GraphicsContext instructions
  |
  v
shape builders / geometry batches
  |
  v
WebGLRenderer / WebGPURenderer
```

对应到本项目，可以形成轻量版：

```text
SVGA VideoEntity
  |
  v
FrameCommandCompiler
  |
  v
RenderBackend
  |-- CanvasBackend
  |-- WebGLBackend
  `-- WebGPUBackend (future)
```

### 可借鉴点

| 本项目问题 | PixiJS 处理方式 | 本项目可参考方向 |
| --- | --- | --- |
| Canvas immediate drawing 难以迁移 | `GraphicsContext` 记录绘制 instructions，真正渲染时再处理 | 增加 SVGA frame commands / display list |
| `drawImage` / 多纹理 | texture + geometry + shader resources，通常不同图片不需要不同 shader | 图片 sprite 用同一 texture shader，切换 texture/resource/uniform |
| rect / ellipse / rounded rect / path | shape builders 将 shape 转 points、vertices、indices | 为 SVGA shape 建轻量 ShapeBuilder |
| fill | path 转 polygon 后 triangulation | fill 走三角化，输出 GPU geometry |
| stroke | `buildLine` 生成 stroke mesh，处理 cap/join/miter | stroke 独立为几何算法，不依赖 shader 自动解决 |
| mask / clip | `StencilMask` 使用 stencil buffer 裁剪渲染 | SVGA `maskPath` / `clipPath` 优先考虑 stencil/mask pass |
| frame flatten / cache | `cacheAsTexture` / `generateTexture` 渲染为 texture | WebGL 帧缓存优先 framebuffer texture，避免频繁 readPixels |
| WebGL/WebGPU 后端差异 | Shader 同时支持 `GlProgram` 和 `GpuProgram`，resources 接口一致 | 上层语义共用，后端分别实现 shader/program/resource |

### 参考链接

- PixiJS 架构说明：<https://pixijs.com/8.x/guides/concepts/architecture>
- PixiJS Renderers：<https://pixijs.com/8.x/guides/components/renderers>
- PixiJS Graphics guide：<https://pixijs.com/8.x/guides/components/scene-objects/graphics>
- PixiJS Scene Graph：<https://pixijs.com/8.x/guides/concepts/scene-graph>
- PixiJS Shader API：<https://pixijs.download/v8.14.3/docs/rendering.Shader.html>
- PixiJS StencilMask API：<https://pixijs.download/v8.18.1/docs/rendering.StencilMask.html>
- PixiJS MaskOptions API：<https://pixijs.download/v8.18.1/docs/scene.MaskOptions.html>
- PixiJS `GraphicsContext` 源码：<https://raw.githubusercontent.com/pixijs/pixijs/dev/src/scene/graphics/shared/GraphicsContext.ts>
- PixiJS `buildContextBatches` 源码：<https://raw.githubusercontent.com/pixijs/pixijs/dev/src/scene/graphics/shared/utils/buildContextBatches.ts>
- PixiJS `buildGeometryFromPath` 源码：<https://raw.githubusercontent.com/pixijs/pixijs/dev/src/scene/graphics/shared/utils/buildGeometryFromPath.ts>
- PixiJS `ShapeBuildCommand` 源码：<https://raw.githubusercontent.com/pixijs/pixijs/dev/src/scene/graphics/shared/buildCommands/ShapeBuildCommand.ts>
- PixiJS `buildLine` 源码：<https://raw.githubusercontent.com/pixijs/pixijs/dev/src/scene/graphics/shared/buildCommands/buildLine.ts>
- PixiJS `triangulateWithHoles` 源码：<https://raw.githubusercontent.com/pixijs/pixijs/dev/src/scene/graphics/shared/utils/triangulateWithHoles.ts>

### 对本项目的轻量接口启发

可以参考 PixiJS 的思想，但保持本项目接口更小：

```ts
type RenderCommand =
  | {
      type: 'texture'
      imageKey: string
      transform: Transform
      alpha: number
      layout: Rect
    }
  | {
      type: 'shape-fill'
      shape: VideoFrameShape
      transform: Transform
      style: VideoStyles
    }
  | {
      type: 'shape-stroke'
      shape: VideoFrameShape
      transform: Transform
      style: VideoStyles
    }
  | {
      type: 'mask-begin'
      path: MaskPath
    }
  | {
      type: 'mask-end'
    }

interface ShapeBuilder {
  build(shape: VideoFrameShape): Geometry
}

interface RenderBackend {
  type: 'canvas' | 'webgl' | 'webgpu'
  capabilities: RenderCapabilities
  prepare(video: Video): Promise<void>
  render(commands: RenderCommand[]): void
  destroy(): void
}
```

这套接口不要求引入 PixiJS，只保留其关键架构经验：WebGL 的难点不是“换 shader”，而是把 Canvas 的过程式绘图提前编译成 GPU 能消费的数据。
