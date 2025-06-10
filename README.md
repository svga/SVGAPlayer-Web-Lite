# SVGAPlayer-Web-Lite &middot; [![npm version](https://img.shields.io/npm/v/svga.svg?style=flat)](https://www.npmjs.com/package/svga) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://reactjs.org/docs/how-to-contribute.html#your-first-pull-request)

这是一个 SVGA 在移动端 Web 上的播放器，它的目标是 **更轻量**、**更高效**

## 实现

- [x] 体积 < 60kb (gzip < 18kb)
- [x] 兼容 Android 4.4+ / iOS 9+
- [x] 更好的异步操作
- [x] 多线程 (WebWorker) 解析文件数据
- [x] OffscreenCanvas / ImageBitmap

## 实验性

### 渲染引擎运行在 WebWorker

**目标**: 将主要的渲染逻辑迁移到 WebWorker 中运行，以减轻主线程的负担，提高复杂动画播放时的 UI 响应性和流畅性。核心思路是利用 `OffscreenCanvas` 将Canvas的控制权转移给 Worker。

**技术方案概要**:

1.  **初始化与控制权转移**:
    *   **主线程**: 用户在 `Player` 初始化时提供一个普通的 `HTMLCanvasElement`。
    *   **主线程**: 如果浏览器支持 `OffscreenCanvas` 且此实验性功能被启用，播放器将调用该 `HTMLCanvasElement` 的 `transferControlToOffscreen()` 方法获取一个 `OffscreenCanvas` 对象。
    *   **主线程**: 此 `OffscreenCanvas` 对象被转移 (transfer) 给一个新创建的渲染专用 WebWorker。
    *   **渲染 Worker**: Worker 接收到 `OffscreenCanvas` 对象，并从中获取 2D 上下文 (`offscreenCanvas.getContext('2d')`)，后续所有绘图操作都将在此上下文上进行。
    *   **兼容性**: 如果浏览器不支持 `OffscreenCanvas`，则此功能不可用，播放器应自动回退到主线程渲染模式。

2.  **渲染循环与数据流**:
    *   **主线程**: 动画的帧调度（例如，通过 `Animator` 类）仍在主线程（或其专用的计时 Worker）上进行。主线程计算出当前需要渲染的帧号 (`currentFrame`)。
    *   **主线程**: 为渲染该帧准备数据包，并通过 `postMessage` 发送给渲染 Worker。数据包内容包括：
        *   `currentFrame`: 当前帧号。
        *   `videoEntity`: SVGA 的核心数据结构。理想情况下，这个数据对象（或其不可变部分）在初始化时一次性发送给 Worker 或通过共享内存访问（需谨慎处理可变部分）。
        *   `bitmapsCache`: `videoEntity` 中的图像资源。在主线程 `mount` 阶段，所有图像（无论是 base64 还是外部链接）都应预先加载并转换为 `ImageBitmap` 对象。这些 `ImageBitmap` 对象集合在初始化时一次性转移给 Worker。Worker 内部维护自己的 `bitmapsCache`。
        *   `dynamicElements` / `replaceElements`: 这些动态内容（可能是 `HTMLImageElement` 或 `HTMLCanvasElement`）的处理：
            *   **方案1 (推荐)**: 在主线程上将这些 DOM 元素绘制到临时的 Canvas上，然后通过 `createImageBitmap()` 创建 `ImageBitmap`，再将此 `ImageBitmap` 转移给 Worker。如果这些元素内容频繁变动，主线程需要高效地检测变化、重新生成 `ImageBitmap` 并通知 Worker 更新。
            *   **方案2 (复杂)**: 若要在 Worker 中直接处理矢量或文本类型的动态内容，则 Worker 需要包含相应的绘制逻辑（如路径渲染、文本渲染），这将显著增加 Worker 的复杂度和体积。
        *   其他渲染所需的状态（如播放模式影响的最终帧行为等）。
    *   **渲染 Worker**: 接收到主线程发送的帧数据包。
    *   **渲染 Worker**: 调用内置的 `render` 函数（源自 `src/player/render.ts`，但运行在 Worker 环境），使用接收到的数据在自身的 `OffscreenCanvas` 上执行绘图操作。
    *   **渲染 Worker**: `render` 函数直接使用 Worker 内缓存的 `ImageBitmap`（包括静态图像和动态/替换元素的 `ImageBitmap` 表示）。

3.  **画布尺寸同步**:
    *   主线程的 `HTMLCanvasElement` 的尺寸（由 CSS 或 JS 控制）发生变化时，需要通过 `postMessage` 通知渲染 Worker，以便 Worker 同步更新其 `OffscreenCanvas` 的 `width` 和 `height`。

4.  **帧缓存 (`isCacheFrames`)**:
    *   如果启用了帧缓存，此逻辑将完全在渲染 Worker 内部执行。Worker 将渲染完成的帧（其 `OffscreenCanvas` 的内容）绘制到另一个临时的 `OffscreenCanvas`（或直接从自身 `OffscreenCanvas` 创建），然后调用 `transferToImageBitmap()` 生成 `ImageBitmap` 并存储在 Worker 的帧缓存对象中。

5.  **通信协议示例 (主线程 `M` <-> 渲染 Worker `W`)**:
    *   `M -> W`: `{ type: 'init', canvas: OffscreenCanvas, videoData: VideoEntity, initialBitmaps: Map<string, ImageBitmap> }`
    *   `M -> W`: `{ type: 'renderFrame', currentFrame: number, dynamicBitmaps?: Map<string, ImageBitmap> }` (dynamicBitmaps 只在更新时发送)
    *   `M -> W`: `{ type: 'resize', width: number, height: number }`
    *   `M -> W`: `{ type: 'destroy' }`
    *   `W -> M`: `{ type: 'initialized' }`
    *   `W -> M`: `{ type: 'frameRendered', frame: number }` (可选，用于同步或调试)
    *   `W -> M`: `{ type: 'error', message: string }`

6.  **潜在挑战**:
    *   **数据同步**: `videoEntity` 的同步，特别是 `dynamicElements` 和 `replaceElements` 的高效更新。
    *   **图像数据所有权**: `ImageBitmap` 对象一旦被转移 (transfer)，原上下文将失去对其的控制权。需要谨慎管理。
    *   **复杂性增加**: 引入 Worker 会增加代码的整体复杂性，包括消息传递、状态同步和错误处理。
    *   **调试难度**: Worker 内的渲染问题调试起来可能比主线程更困难。
    *   **兼容性与回退**: 必须提供一个健壮的机制，在不支持 `OffscreenCanvas` 的环境中自动回退到主线程渲染。

**预期效果**:
通过将渲染任务移至 WebWorker，可以显著降低主线程的负载，尤其是在播放复杂的 SVGA 动画时，从而改善用户界面的响应速度，减少掉帧，提升整体用户体验。然而，这也带来了额外的复杂性和通信开销，需要在具体实现中仔细权衡。

### 使用 WebAssembly (WASM) 替代 WebWorker 进行 SVGA 解析

**Status**: _详细技术方案与核心Rust代码结构已定义完成。下一步涉及实际的Rust编译、WASM模块在项目中的集成、完整的端到端测试以及解决潜在的构建/依赖问题（例如之前遇到的 `yarn install` 超时）。_

**目标**: 利用 WebAssembly 的高性能特性来替代当前基于 JavaScript 的 WebWorker 进行 SVGA 文件核心解析任务（特别是 Protobuf 解码部分），以期提高解析速度，缩短动画加载时间。

**背景**:
当前 SVGA 解析器在 WebWorker 中运行，主要包含以下步骤：文件获取、Zlib 解压缩（如果需要）、Protobuf 解码（使用 `protobufjs`）以及图像数据预处理。其中，Protobuf 解码对于复杂的 SVGA 文件可能是 CPU 密集型操作。

**技术方案概要 (推荐使用 Rust + `prost` + `wasm-bindgen`)**:

1.  **SVGA `.proto` 文件定义**:
    *   **关键前提**: 需要一份准确的 SVGA 格式的 `.proto` (Protocol Buffers schema) 文件。目前项目中的 `svga-proto.ts` 是 TypeScript 定义，可以作为参考来创建或验证 `.proto` 文件。
    *   如果官方没有提供 `.proto` 文件，需要根据现有实现和 TypeScript 定义精确地反向工程出 `.proto` 文件。

2.  **创建 Rust 解析库 (Crate)**:
    *   初始化一个新的 Rust 库项目 (e.g., `svga_parser_wasm`)。
    *   **依赖**:
        *   `prost`: 用于处理 Protobuf 编译和运行时。
        *   `prost-build`: 在 `build.rs` 中用于根据 `.proto` 文件生成 Rust 代码。
        *   `wasm-bindgen`: 用于生成 Rust 和 JavaScript 之间的桥接代码。
        *   `serde` (可选，与 `serde-wasm-bindgen` 配合): 如果需要更灵活地将解析后的 Rust 结构体序列化为复杂的 JavaScript 对象。
        *   `flate2` (可选): 如果决定在 WASM 内部处理 Zlib 解压缩。
    *   **代码生成**: 在 `build.rs` 中配置 `prost-build`，使其在编译时根据 `.proto` 文件生成对应的 Rust 结构体和解析逻辑。
    *   **核心解析函数**:
        *   创建一个或多个 `pub` Rust 函数，并使用 `#[wasm_bindgen]` 宏使其可以被 JavaScript 调用。
        *   该函数应接收原始的 SVGA 文件数据（作为一个字节切片 `&[u8]`）作为输入。
        *   函数内部使用 `prost` 生成的代码将字节切片解码为 Rust 结构体。
        *   将解析得到的 Rust 结构体转换为 JavaScript 对象。`wasm-bindgen` 可以直接转换许多简单结构体；对于复杂嵌套结构或需要精确匹配 `VideoEntity` 的场景，可能需要手动映射或使用 `serde` 和 `serde-wasm-bindgen`。
        *   Rust 函数返回这个 JavaScript 对象。错误（如解析失败）应被捕获并转换为 JavaScript Error 对象抛出。

3.  **WASM 模块构建与集成**:
    *   使用 `wasm-pack build --target web` (或 `bundler`/`nodejs`) 来编译 Rust crate。这将生成一个 `.wasm` 文件和相应的 JavaScript 胶水代码。
    *   **运行环境**: 为了避免阻塞主线程，WASM 解析模块本身仍应在一个 WebWorker (下称 "WASM Worker") 中加载和执行。即，用 "WASM in Worker" 替换 "JS in Worker" 的核心解析部分。
    *   **WASM Worker**:
        *   负责加载 `.wasm` 文件和其 JS 胶水代码。
        *   接收主线程传来的原始 SVGA 文件数据（`ArrayBuffer`）。
        *   调用 WASM 导出的解析函数。
        *   将 WASM 返回的 JS 对象发送回主线程。
    *   **主线程 (`Parser` 类)**:
        *   修改 `Parser` 类，使其创建一个 WASM Worker 而不是当前的 JS Worker (如果 `isDisableWebWorker` 为 `false`)。
        *   将获取到的 SVGA 文件 `ArrayBuffer` 发送给 WASM Worker。
        *   接收 Worker 返回的已解析的 JS 对象 (类似 `VideoEntity`)。

4.  **Zlib 解压缩和图像处理**:
    *   **Zlib 解压缩**:
        *   **方案1 (JS Worker)**: 在 WASM Worker 的 JavaScript 侧，接收到 `ArrayBuffer`后，首先使用 `zlibjs`（或Pako等）进行解压缩，然后将解压后的 `ArrayBuffer` 传递给 WASM 解析函数。这保持了 WASM 模块的单一职责（Protobuf 解析）。
        *   **方案2 (WASM)**: 在 Rust 代码中使用 `flate2` 等库进行解压缩。这可能带来性能提升，但增加了 WASM 模块的体积和复杂度。对于追求极致性能的场景可以考虑。
        *   *初步建议采用方案1以简化 WASM 模块的开发。*
    *   **图像数据处理 (`ImageBitmap`)**:
        *   WASM 解析模块返回的应是包含图像元数据（如文件名、base64 编码的图像数据）的结构化对象。
        *   `ImageBitmap` 的创建（从 base64 或其他图像源）涉及浏览器 API，应在数据从 WASM Worker 返回到主线程后，在主线程的 `Parser` 或 Player 的 `mount` 阶段进行，与当前逻辑类似。或者，可以在 WASM Worker 的 JS 侧完成，如果 `createImageBitmap` 在 Worker 中可用且高效。

5.  **与现有 `Parser` 的对比**:
    *   **优点**:
        *   Protobuf 解码速度可能大幅提升，特别是对于大型或结构复杂的 SVGA 文件。
        *   可能减少内存抖动，因为 WASM 操作的是线性内存。
    *   **缺点**:
        *   **构建复杂性**: 引入 Rust 和 `wasm-pack` 到项目构建流程。
        *   **`.proto` 文件依赖**: 强依赖于准确的 `.proto` 文件。
        *   **初始加载**: WASM 文件（通常几十 KB 到几百 KB，取决于复杂度和优化）需要额外加载。
        *   **胶水代码**: JS 与 WASM 之间的数据转换和函数调用会产生一些开销，但通常远小于纯 JS 解析的开销。

**预期效果**:
对于解析性能敏感的应用，使用 WebAssembly 进行核心 Protobuf 解码有望带来显著的速度提升。这将直接改善用户首次加载和解析 SVGA 动画的体验。然而，需要仔细评估其对项目构建流程、代码复杂性和最终包大小的综合影响。

### GPU 加速运算 (基于 WebGPU)

**目标**: 利用 WebGPU API 实现 SVGA 核心渲染操作的 GPU 加速，特别是针对位图雪碧（sprites）的绘制和变换，以期大幅提升渲染性能和降低 CPU 负载。

**背景**:
当前渲染引擎基于 Canvas 2D API，在 CPU 端执行所有绘制命令。对于包含大量位图、复杂变换或高帧率的动画，CPU 渲染可能成为瓶颈。WebGPU 作为现代的底层图形 API，允许开发者直接利用 GPU 的并行处理能力。

**技术方案概要 (初步阶段：聚焦于位图雪碧渲染)**:

1.  **WebGPU 初始化**:
    *   **获取设备与上下文**: 应用程序（播放器）首先请求 `GPUAdapter` 和 `GPUDevice`。
    *   **Canvas 配置**: 为播放器所用的 `HTMLCanvasElement` 创建并配置 `GPUCanvasContext`，确定画布的纹理格式 (通常通过 `navigator.gpu.getPreferredCanvasFormat()`)。

2.  **核心资源管理**:
    *   **纹理 (`GPUTexture`)**:
        *   在 `player.mount()` 阶段，SVGA 文件中的所有图像资源 (`videoEntity.images`) 应被加载并转换为 `ImageBitmap`。
        *   为每个 `ImageBitmap` 创建一个对应的 `GPUTexture`，并使用 `device.queue.copyExternalImageToTexture()` 将图像数据上传到 GPU 纹理中。
        *   维护一个 `imageKey -> GPUTexture` 的映射（缓存）供渲染时快速查找。
        *   创建一或多个 `GPUSampler` 用于纹理采样（例如，配置线性过滤、边缘处理模式）。
    *   **顶点缓冲 (`GPUBuffer` for Vertices)**:
        *   **雪碧几何**: 定义一个标准的四边形（由两个三角形组成，共4个顶点，6个索引）用于绘制所有位图雪碧。每个顶点通常包含 `position` (e.g., 一个单位正方形的角点) 和 `uv` (纹理坐标 `[0,0]` 到 `[1,1]`) 属性。此顶点/索引缓冲可以静态创建并复用。
    *   **Uniform 缓冲 (`GPUBuffer` for Uniforms)**:
        *   **场景/全局 Uniforms**: 包含投影矩阵（例如，一个正交投影矩阵，用于将本地坐标映射到画布的裁剪空间坐标）和可能的全局透明度。此 UBO 在初始化或画布尺寸变化时更新。
        *   **每帧/每雪碧 Uniforms**: 包含每个雪碧在当前帧的变换矩阵 (`frame.transform`)、透明度 (`frame.alpha`) 以及可能的纹理图集信息（如果多个小图被合并到一张大纹理中）。这些数据需要在每帧为每个可见雪碧更新并上传到 GPU。

3.  **渲染管线 (Render Pipeline) 与着色器 (WGSL)**:
    *   **雪碧渲染管线**:
        *   **顶点着色器 (WGSL)**:
            *   输入: 顶点位置 (`vec2f`), 纹理坐标 (`vec2f`)。
            *   Uniforms: 模型视图矩阵 (`mat3x2f` 或 `mat4x4f`，结合了雪碧的变换和视图/投影变换), 投影矩阵。
            *   输出: 裁剪空间位置 (`@builtin(position) vec4f`), 插值后的纹理坐标 (`vec2f`)。
            *   逻辑: `output.position = projectionMatrix * modelViewMatrix * vec4f(input.vertexPosition, 0.0, 1.0); output.texCoord = input.textureCoord;`
        *   **片段着色器 (WGSL)**:
            *   输入: 插值后的纹理坐标 (`vec2f`)。
            *   Uniforms: 雪碧透明度 (`f32`)。
            *   绑定资源: `GPUSampler` 和 `GPUTextureView` (通过 `@group(X) @binding(Y)`)。
            *   输出: 像素颜色 (`@location(0) vec4f`)。
            *   逻辑: `let color = textureSample(myTexture, mySampler, input.texCoord); output.color = vec4f(color.rgb, color.a * spriteAlpha);` (基础的 Alpha 混合)。更复杂的混合模式（如 SVGA 支持的 `ADD`, `MASK` 等）需要更复杂的着色器逻辑和可能的多个渲染通道。
        *   **管线配置**: 定义顶点缓冲布局、绑定组布局（描述 Uniforms、纹理、采样器的组织）、图元拓扑 (`triangle-list`)、颜色目标格式、深度/模板状态（初始阶段可不使用深度）。
    *   **(可选) 简单矢量图形渲染管线**:
        *   对于 SVGA 中的简单闭合填充路径（如矩形、椭圆、凸多边形），可以在主线程或 Worker 中将其**细分 (tessellate)** 成三角形列表。
        *   这些三角形顶点数据（位置、颜色）被加载到 `GPUBuffer` 中。
        *   创建单独的渲染管线，其顶点着色器处理变换，片段着色器输出纯色或渐变色。
        *   *注意：复杂的矢量路径、描边以及抗锯齿的 WebGPU 实现非常复杂，超出了此初步实验性方案的范围。*

4.  **渲染循环 (每帧)**:
    *   获取当前的 `GPUTextureView` 作为渲染目标（从 `canvasContext.getCurrentTexture()`）。
    *   创建 `GPUCommandEncoder`。
    *   开始一个 `GPURenderPassEncoder`，配置颜色附件（加载操作为 `clear`，存储操作为 `store`，目标为画布纹理视图）。
    *   设置雪碧渲染管线。
    *   设置场景/全局 Uniforms 的绑定组。
    *   设置雪碧几何的顶点/索引缓冲。
    *   **遍历当前 SVGA 帧中的雪碧**:
        *   更新并写入该雪碧的 Uniform 数据（变换矩阵、Alpha值）到对应的 `GPUBuffer`。
        *   创建或获取一个 `GPUBindGroup`，它将此雪碧的 `GPUTextureView`、`GPUSampler` 以及其 Uniform 缓冲绑定到着色器中预期的位置。
        *   设置此绑定组 (`passEncoder.setBindGroup(...)`)。
        *   执行绘制命令 (`passEncoder.drawIndexed(6)` 或 `draw(6)` for a quad)。
    *   (如果实现了简单矢量渲染，则切换管线和资源，进行相应绘制)。
    *   结束渲染通道 (`passEncoder.end()`)。
    *   完成指令编码 (`encoder.finish()`)，得到 `GPUCommandBuffer`。
    *   将指令缓冲提交到设备队列 (`device.queue.submit([...])`)。

5.  **处理 SVGA 特性**:
    *   **图层顺序与混合**: 通过绘制顺序控制图层。正确的 Alpha 混合（尤其是对于半透明雪碧）是默认行为。SVGA 中更高级的混合模式（如 `ADD`, `MASK`, `SCREEN`）需要在片段着色器中专门实现，或者通过多个渲染通道和帧缓冲对象 (FBO) 来实现。
    *   **遮罩 (Clipping / Masks)**:
        *   在 WebGPU 中实现路径遮罩通常使用**模板缓冲 (Stencil Buffer)**。
        *   这需要先将遮罩形状（细分后的三角形）渲染到模板缓冲，然后配置雪碧（或其他元素）的渲染管线，使其在绘制时遵循模板测试的结果。这会增加渲染设置的复杂度。
    *   **动态元素/替换元素**: 与 OffscreenCanvas Worker 方案类似，这些元素在主线程上准备成 `ImageBitmap` 后，再上传/更新到对应的 `GPUTexture` 中。

6.  **挑战与考量**:
    *   **复杂性**: WebGPU API 比 Canvas 2D 更底层，样板代码更多，学习曲线更陡峭。
    *   **资源管理**: 手动管理 GPU 内存（纹理、缓冲区的创建、更新、销毁）至关重要，需要避免泄漏和不必要的开销。
    *   **矢量图形**: 如前所述，完整的高质量矢量渲染（特别是带样式的描边、复杂路径的抗锯齿）是主要难点，可能需要依赖专门的 2D WebGPU 库（如果未来出现成熟方案）或大量自研投入。本方案初步聚焦于位图。
    *   **着色器 (WGSL)**: 需要编写和调试 WGSL 着色器代码。
    *   **兼容性与回退**: 必须提供一个基于 Canvas 2D 的渲染器作为回退方案，用于不支持 WebGPU 的浏览器环境。

**预期效果**:
对于以位图雪碧为主、动画元素数量多、变换频繁的 SVGA 文件，基于 WebGPU 的渲染器有望提供远超 Canvas 2D 的性能，实现更高的帧率和更低的 CPU 使用率。这将为更复杂的视觉效果和动画打开大门。然而，其实现复杂度和对矢量图形支持的局限性是需要考虑的重要因素。

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
