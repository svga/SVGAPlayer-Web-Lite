# WebGL Context Lost Restoration Plan

本文记录 `unify-render-compiler-backends` 中任务 `4.5` 的实现方案：WebGL context lost / restored 后，如何基于 `CompiledAnimation` 重建 GPU 资源，并保持 WebGL backend 不使用 Canvas raster fallback。

## 背景

WebGL context 可能因为 GPU 进程重启、显存压力、页面创建过多 WebGL context、移动端切后台、系统休眠唤醒、驱动异常或浏览器主动回收而 lost。

context lost 后，原有的 `WebGLProgram`、`WebGLBuffer`、`WebGLTexture`、`WebGLFramebuffer` 等 GPU 对象都不可继续使用。Canvas 元素仍存在，但 WebGL 资源已经失效。

因此 WebGLBackend 必须把两类数据分开：

```text
CompiledAnimation
  CPU-side render plan
  reusable after context restore

WebGL resources
  GPU-side temporary resources
  valid only for one WebGL context lifecycle
```

## PixiJS 参考

PixiJS v8 的 WebGL context 生命周期集中在 `GlContextSystem`：

- 初始化 context 后，在 canvas 上监听 `webglcontextlost` 和 `webglcontextrestored`。
- `handleContextLost(event)` 调用 `event.preventDefault()`，让浏览器允许后续 restore。
- 如果 context lost 是 PixiJS 自己通过 `forceContextLoss()` 触发的，会在事件退出后调用 `WEBGL_lose_context.restoreContext()` 主动恢复。
- `handleContextRestored()` 重新读取 WebGL extensions，并触发 renderer 的 `contextChange` runner，让其他系统重建或刷新 GPU 状态。
- `destroy()` 移除事件监听，并通过 `WEBGL_lose_context.loseContext()` 主动释放 GPU 资源。

参考链接：

- PixiJS source: https://raw.githubusercontent.com/pixijs/pixijs/dev/src/rendering/renderers/gl/context/GlContextSystem.ts
- PixiJS API docs: https://pixijs.download/next-v8/docs/rendering.GlContextSystem.html

可借鉴的形状：

```text
canvas.addEventListener('webglcontextlost', handleContextLost)
canvas.addEventListener('webglcontextrestored', handleContextRestored)

handleContextLost:
  preventDefault()
  mark lost
  stop using old GPU resources

handleContextRestored:
  refresh context/extensions
  notify or rebuild dependent GPU resources
```

不直接照搬的点：

- 不引入 PixiJS 依赖。
- 不引入 PixiJS runner/system 架构。
- 不在 WebGLBackend 内部退回 Canvas 绘制。
- 不把 GPU resource 生命周期泄漏到 `CompiledAnimation`。

## 目标

- WebGLBackend 在 context lost 后不再使用旧 GPU 对象。
- WebGLBackend 在 context restored 后，从同一个 `CompiledAnimation` 重新创建 shader、buffer、texture 等资源。
- `destroy()` 能释放当前有效 GPU 资源并移除事件监听。
- restore 失败时进入明确 failed 状态，并抛出可诊断错误。
- 保持 fallback 只发生在 backend selection 边界，不在 WebGLBackend 内部进行 Canvas raster fallback。

## 状态机

```text
ready
  |
  | webglcontextlost
  v
lost
  |
  | webglcontextrestored + rebuild success
  v
ready

lost
  |
  | rebuild failed
  v
failed

ready/lost/failed
  |
  | destroy()
  v
destroyed
```

状态含义：

- `ready`: GPU resources 可用，`renderFrame()` 正常绘制。
- `lost`: context 已丢失，`renderFrame()` no-op，不触碰旧 GPU 对象。
- `failed`: context restored 了，但资源重建失败，`renderFrame()` 抛明确错误。
- `destroyed`: backend 已销毁，事件监听和 GPU resources 已释放。

## 实现方案

### 1. 保存 CPU plan 引用

`WebGLBackend.prepare(animation)` 保存当前 `CompiledAnimation` 引用：

```ts
private animation: CompiledAnimation | null = null

public async prepare(animation: CompiledAnimation): Promise<void> {
  this.animation = animation
  await this.uploadStaticResources(animation)
}
```

这个引用只用于 restore 后重建 GPU 资源。`CompiledAnimation` 仍保持 CPU-side 数据，不反向持有 WebGL resource。

### 2. 拆分 WebGL resource 初始化

当前 WebGLBackend 如果在 constructor 中创建 program / buffer / uniform location，restore 后不方便重建。需要拆成：

```text
constructor:
  save canvas
  bind context lost/restored listeners
  initializeContext()
  initializeResources()

initializeContext:
  canvas.getContext('webgl')
  validate context

initializeResources:
  create shader program
  create buffers
  resolve attributes/uniforms
  set static texture coordinate buffer
  configure blend/viewport state
```

`program`、`positionBuffer`、`texCoordBuffer`、uniform locations 等字段应从 `readonly` 改成可替换字段，因为 restore 后需要重新赋值。

### 3. context lost 处理

```ts
private readonly handleContextLost = (event: Event): void => {
  event.preventDefault()
  this.contextState = 'lost'
  this.clearResourceReferences()
}
```

原则：

- 必须 `preventDefault()`，否则浏览器可能不会 restore。
- 不调用 `deleteTexture/deleteBuffer/deleteProgram`，因为 lost 后这些对象已经不可用。
- 清空本地 resource map，避免后续误用旧引用。
- `renderFrame()` 在 `lost` 状态直接 return。

### 4. context restored 处理

```ts
private readonly handleContextRestored = (): void => {
  this.rebuildAfterRestore().catch(error => {
    this.contextState = 'failed'
    this.restoreError = error instanceof Error ? error : new Error(String(error))
  })
}
```

重建流程：

```text
rebuildAfterRestore:
  if destroyed -> return
  if animation is null -> mark ready, return
  initializeContext()
  initializeResources()
  resize(animation.size.width, animation.size.height)
  uploadStaticResources(animation)
  contextState = ready
```

静态图片 texture 从 `animation.resources.images` 重新上传。

`replaceElements` 与 `dynamicElements` 不长期缓存旧 texture。它们可以继续在 render path 按当前 DOM/canvas/image source 创建或更新纹理，避免 restore 后需要恢复一批外部动态资源状态。

### 5. renderFrame 行为

```text
ready:
  render normally

lost:
  no-op

failed:
  throw restoreError or clear WebGL context restore error

destroyed:
  no-op or throw lifecycle error
```

建议 first pass 使用：

- `lost`: no-op，避免播放 loop 期间连续抛错。
- `failed`: 抛错，让 facade 触发 `error` 事件。
- `destroyed`: no-op，保持 destroy 幂等。

### 6. destroy 行为

`destroy()` 需要：

- 移除 `webglcontextlost` / `webglcontextrestored` listener。
- 如果 context 当前未 lost，删除当前有效的 texture / buffer / program。
- 清空 resource map 和 CPU plan 引用。
- 标记 `contextState = 'destroyed'`。

如果 context 已 lost，避免调用 WebGL delete API，只清空 JS 引用。

## Facade 层策略

第一版 4.5 不做运行中 `auto` fallback。

原因：

- `auto` fallback 已经在 compile/backend selection 边界完成。
- context lost 是运行时 GPU lifecycle 问题，不是 animation capability mismatch。
- 运行中从 WebGLBackend 切 CanvasBackend 需要 facade 暂停播放、创建 Canvas backend、prepare、恢复 current frame，涉及更多状态同步，适合单独任务。

本任务只保证：

```text
WebGL lost -> wait/no-op
WebGL restored -> rebuild GPU resources from CompiledAnimation
restore failed -> emit/throw clear error
```

后续可以新增独立任务：

```text
auto mode runtime fallback:
  WebGL restore failed
    -> destroy WebGLBackend
    -> create CanvasBackend
    -> prepare same CompiledAnimation
    -> render current frame
    -> continue playback
```

## 验收标准

- 可以通过 `WEBGL_lose_context.loseContext()` 模拟 context lost。
- lost 后 `renderFrame()` 不访问旧 texture/program/buffer。
- restored 后重新创建 program、buffer、texture，能继续渲染 image sprite。
- `destroy()` 后不会残留 canvas event listener。
- `webgl` mode 下 restore 失败会抛明确 WebGL restore error。
- `auto` mode 不在 WebGLBackend 内部偷偷用 Canvas raster fallback。

## 需要修改的文件

- `src/player/backend/webgl.ts`
  - 增加 context state。
  - 保存 `CompiledAnimation` 引用。
  - 拆分 context/resource 初始化。
  - 增加 lost/restored rebuild 流程。
  - 调整 destroy 清理逻辑。

- `src/player/backend/types.ts`
  - 暂时不必须修改。
  - 如果 facade 需要感知状态，可后续增加只读状态或事件回调。

- `src/svga-player.ts`
  - 第一版不必须修改。
  - 如果要把 restore failure 统一转成 `error` event，可在后续增强 backend error callback。

## 风险

- 浏览器不保证 lost 后一定 restored。
- restore 事件到来时外部 image/canvas resource 可能已经变化或被销毁。
- context restored 后的 WebGL object 需要全部重新创建，遗漏任一 resource 都可能导致黑屏。
- 当前 WebGLBackend 只支持 image sprite；shape/mask/stroke 仍通过 capability 在 backend selection 前拒绝。
