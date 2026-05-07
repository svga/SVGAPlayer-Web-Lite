# Keyed SVGAPlayer Slots Design Notes

本文记录一次探索性 API 讨论：让 `SVGAPlayer` 支持按 `key` 管理多个 SVGA，避免两个或多个动画切换时重复解析，并为后续缓存内部 compiled 数据、替换元素和删除 slot 留出清晰语义。

这不是实现记录，当前源码尚未按本文修改。

## 背景

当前 `SVGAPlayer` 是单动画状态：

```text
SVGAPlayer
  videoEntity
  compiledAnimation
  backend
  animator
```

当前源码流程是：

```text
parse(source)
  -> 保存 this.videoEntity

compile()
  -> 读取 this.videoEntity
  -> 生成 compiledAnimation
  -> 创建并 prepare backend

play()
  -> 播放当前 compiledAnimation
```

目标 public 心智收敛为：

```text
load(source, key)
  -> 把一个 SVGA 加载进播放器

prepare(key)
  -> 可选预热，内部 compile 并 prepare backend

play(key)
  -> 必要时内部 prepare
  -> 播放指定 key
```

这使得同一个实例切换 A/B 两个 SVGA 时，天然会覆盖上一份 `videoEntity`。如果业务频繁在两个 SVGA 之间切换，重复解析会浪费 CPU。

## 目标

- `SVGAPlayer` 内部按 `key` 保存多个已 load 的 SVGA。
- `key` 不传时默认为 `default`。
- public API 使用 `load()` 代替 `parse()`，避免把 parser 阶段暴露给业务。
- `load()` 不再把解析产物作为 public 数据返回，避免业务直接修改 `Video` 内部结构。
- `compile` 降为内部实现细节，不作为主 public API 暴露。
- `play()` 接收 `key`，并在内部完成必要的 compile / prepare。
- `prepare()` 作为可选 public 预热 API，用于避免首次 `play()` 时卡顿。
- 新增 `replace()` 代替直接写 `svga.replaceElements` / `svga.dynamicElements`。
- 新增 `delete()` 清除某个 key 对应的 load / compiled 结果。
- backend 不按 key 缓存；播放器实例只维护一个全局 backend。
- backend 类型在 `new SVGAPlayer()` 时确定，只依赖 `renderMode` 和浏览器 WebGL 支持情况，不依赖某个 SVGA 的内容特征。
- 构造函数彻底收敛为 options 对象，不再保留 `new SVGAPlayer(canvas)` 形式。
- `setConfig()` 只接收 play 相关配置；load / compile / render / backend 配置只在构造阶段处理。
- 新增 `cache()` 方法，由实例按 key 读取内部 parsed 数据并写入 `DB`。
- 每个 `SVGAPlayer` 实例复用单个 `Parser`，URL load 通过实例级队列串行执行，并用 version 防止过期写回。
- 每次实际需要内部 compile 某个 key 时，继续创建新的 `RenderCompiler`，不复用 compiler 实例。
- 删除旧 `Player` runtime 冗余代码，只保留 facade、backend、compiler、animator 等仍在使用的内部模块。

## 非目标

- 本轮不要求扩展 WebGL 绘制能力。
- 本轮不引入新的外部依赖。
- 本轮不把 low-level `Parser` / `Player` 重新暴露给 package consumer。

## Slot 模型

建议内部状态从单个 `videoEntity` 改成 keyed slots：

```text
SVGAPlayer
  activeKey: string | null
  preparedKey: string | null
  backend: RenderBackend
  animator: Animator
  slots: Map<string, SVGAPlayerSlot>

SVGAPlayerSlot
  videoEntity?: Video
  compiledAnimation?: CompiledAnimation
  parser?: Parser
  loadPromise?: Promise<void>
  preparePromise?: Promise<void>
  dirty?: boolean
```

示意：

```text
SVGAPlayer
├─ backend              // 全局唯一，不按 key 缓存
├─ activeKey            // 当前播放中的 key
├─ preparedKey          // 当前 backend 资源对应的 key
└─ slots
   ├─ "default"
   │  ├─ videoEntity
   │  └─ compiledAnimation
   └─ "gift"
      ├─ videoEntity
      └─ compiledAnimation
```

## Public API 草案

### constructor

```ts
new SVGAPlayer({
  container,
  renderMode: 'auto',
  parserOptions,
  isCacheFrames,
  isUseIntersectionObserver,
  loop,
  fillMode,
  playMode,
  startFrame,
  endFrame,
  loopStartFrame,
  isOpenNoExecutionDelay
})
```

语义：

- 构造函数只保留 options 对象形式。
- `container` / `renderMode` / `parserOptions` / `isCacheFrames` / `isUseIntersectionObserver` 属于 init 阶段配置。
- play 相关配置也允许在构造时传入，用作初始播放配置。
- `setConfig()` 后续只接受 play 相关配置。
- backend 选择、parser options 保存、intersection observer 初始化等都集中到 private `init()`。

### load

```ts
await player.load(source, key = 'default')
```

语义：

- `source` 可以是 URL 或已有 `Video`。
- 解析成功后，把结果保存到 `slots.get(key).videoEntity`。
- 不再返回 `Video` 给业务直接修改。
- load 失败时触发 `error` 事件，并 reject。
- 如果同一个 `key` 已有 compiled 结果，新的 load 会使该 key 的 compiled 结果失效。

### prepare

```ts
await player.prepare(key = 'default')
```

语义：

- 读取 `slots.get(key).videoEntity`。
- 如果该 key 尚未 compiled，内部执行 compile 并保存 `slots.get(key).compiledAnimation`。
- 使用全局 backend prepare 当前 key 的资源。
- prepare 成功后设置 `preparedKey = key`。
- prepare / compile 失败时触发 `error` 事件，并 reject。
- 如果正在播放另一个 key，先停止当前播放，再 prepare 目标 key。

需要注意：backend 不按 key 缓存，因此全局 backend 同一时间只能 prepare 一份动画资源。`prepare('b')` 后，`preparedKey` 会从 `a` 变成 `b`。

`prepare()` 是可选预热 API。业务可以不调用它，直接调用 `await play(key)`。

### play

```ts
await player.play(key = 'default')
```

语义：

- 如果该 key 尚未 load，直接 throw 并触发 `error` 事件。
- 如果正在播放另一个 key，先停止当前播放。
- 如果该 key 未 compiled、dirty，或 `preparedKey !== key`，内部 `await prepare(key)`。
- prepare 完成后播放 `slots.get(key).compiledAnimation`。
- 设置 `activeKey = key`。

因为 `play()` 可能触发 compile / backend prepare，所以 public API 应是 async。

### replace

采用方案 B：一个方法覆盖 replace 和 dynamic 两类能力。

```ts
player.replace(elementKey, element, {
  key: 'default',
  mode: 'replace'
})

player.replace(elementKey, element, {
  key: 'gift',
  mode: 'dynamic'
})
```

建议类型：

```ts
type SVGAReplaceMode = 'replace' | 'dynamic'

interface SVGAReplaceOptions {
  key?: string
  mode?: SVGAReplaceMode
}
```

语义：

- `mode: 'replace'` 写入 `video.replaceElements[elementKey]`，替换原 bitmap。
- `mode: 'dynamic'` 写入 `video.dynamicElements[elementKey]`，在目标图层位置叠加动态元素。
- `mode` 默认建议为 `'replace'`，因为方法名是 `replace`。
- 如果目标 key 尚未 load，应 throw 并触发 `error`。
- 如果目标 key 已经 compiled，`replace()` 应标记该 slot 为 dirty。
- 如果目标 key 是当前 `preparedKey`，播放器应按 backend 类型刷新资源；刷新成功后可重置 dirty 并继续播放。
- 如果目标 key 不是当前 `preparedKey`，dirty 状态保留到后续 prepare / play 前处理。

dirty 规则很重要，因为当前 Canvas backend 可开启已绘制帧缓存；如果替换元素后不清缓存，可能出现旧帧残留。

不同 backend 的处理原则：

```text
CanvasBackend
  - 更新引用后，后续绘制会读取新 texture source
  - 如果开启 isCacheFrames，必须清空 frame cache
  - 清理完成后可重置 dirty

WebGLBackend
  - 当前 replace / dynamic 资源可视为 texture source
  - 如果对应 texture 是临时逐帧创建，更新引用即可
  - 如果后续缓存 replace / dynamic texture，则需要更新 elementKey 对应的 texture
  - 刷新完成后可重置 dirty
```

### delete

```ts
player.delete(key = 'default')
```

语义：

- 删除该 key 对应的 parser / load 结果 / compiled 结果。
- 如果该 key 正在 load，销毁 parser 或标记该 load 结果作废。
- 如果该 key 正在播放，先停止播放。
- 如果 `preparedKey === key`，清空当前 backend 画面并把 `preparedKey` 置空。
- 不销毁全局 backend，除非整个 player `destroy()`。
- 删除不存在的 key 是 no-op，方便业务清理。

状态图：

```text
empty
  │ load(key)
  v
loaded
  │ prepare(key) or play(key)
  v
ready / prepared
  │ play(key)
  v
playing

delete(key) 可以从任意状态回到 empty
```

## Backend 生命周期

已确认的设计约束：

```text
backend type = f(renderMode, browserWebGLSupport)
backend type != f(currentSvgaRequiredCapabilities)
```

即 backend 类型在构造时确定：

| renderMode | 构造时行为 |
| --- | --- |
| `canvas` | 直接创建 CanvasBackend |
| `webgl` | 浏览器支持 WebGL 则创建 WebGLBackend，否则 throw |
| `auto` | 浏览器支持 WebGL 则创建 WebGLBackend，否则创建 CanvasBackend |

后续行为：

- `load(key)` 不影响 backend。
- internal `compile(key)` 不重新选择 backend。
- `prepare(key)` 不重新选择 backend。
- `play(key)` 不重新选择 backend。
- backend 不按 key 缓存。
- WebGL 当前不支持的 SVGA 特性后续再扩展；当前阶段不因某个 SVGA 的内容特征自动 fallback 到 Canvas。

因此，在 `auto` 且浏览器支持 WebGL 时，所有 key 都会走 WebGLBackend。若某个 SVGA 使用了当前 WebGLBackend 尚未支持的特性，应该在 prepare / play / render 阶段抛出明确错误，而不是切换到 CanvasBackend。

## Error 事件

当前实现里的 `parse()` 和 `compile()` 已经具备错误事件语义：内部 catch 后 emit `error`，再把错误 throw 出去。

新的 keyed API 应把同样语义延续到 `load()`、`prepare()` 和 async `play()`：

```ts
player.on('error', error => {
  console.error(error)
})

try {
  await player.load(url, 'gift')
  await player.play('gift')
} catch (error) {
  // 流程控制
}
```

需要避免重复处理：业务如果同时监听 `error` 和使用 `try/catch`，同一个错误可能被记录两次。

## DB 缓存

因为 `load()` 不再把 `Video` 返回给业务，DB 缓存也应从“业务拿到 parsed 数据再写 DB”改成实例方法。

草案：

```ts
await player.cache(db, {
  key: 'gift',
  id: 'gift.svga'
})
```

语义：

- `key` 是 SVGA slot key，默认 `default`。
- `id` 是写入 DB 的 IDB key。
- `cache()` 从 `slots.get(key).videoEntity` 读取 parsed 数据。
- 如果目标 key 尚未 load，直接 throw 并触发 `error`。
- 方法内部调用 `db.insert(id, videoEntity)`。

读取缓存仍可通过 `DB` 完成，然后交给 `load()` 保存到指定 key：

```ts
const cached = await db.find('gift.svga')
if (cached !== undefined) {
  await player.load(cached, 'gift')
} else {
  await player.load(url, 'gift')
  await player.cache(db, {
    key: 'gift',
    id: 'gift.svga'
  })
}
```

## 与当前动态元素能力的关系

现有用法是：

```ts
const svga = await player.parse('xx.svga')
svga.dynamicElements['key'] = fontCanvas
await player.compile()
```

keyed 设计后，业务不再拿到 `Video`，改为：

```ts
await player.load('xx.svga', 'gift')
player.replace('key', fontCanvas, {
  key: 'gift',
  mode: 'dynamic'
})
await player.play('gift')
```

替换原图则为：

```ts
player.replace('avatar', image, {
  key: 'gift',
  mode: 'replace'
})
```

## setConfig 边界

`setConfig()` 只涉及 play 时相关的配置；影响 load、compile、绘制或 backend 选择的配置都应放到构造 / private `init()` 阶段处理。

建议拆分：

```ts
interface SVGAPlayerInitOptions {
  container: HTMLCanvasElement
  renderMode?: RenderMode
  parserOptions?: ParserConfigOptions
  isCacheFrames?: boolean
  isUseIntersectionObserver?: boolean
}

interface SVGAPlayerPlayConfigOptions {
  loop?: number | boolean
  fillMode?: PLAYER_FILL_MODE
  playMode?: PLAYER_PLAY_MODE
  startFrame?: number
  endFrame?: number
  loopStartFrame?: number
  isOpenNoExecutionDelay?: boolean
}
```

构造函数可以接收 init + play 配置；`setConfig()` 只接收 `SVGAPlayerPlayConfigOptions`。通过 interface 收窄类型边界即可，不需要对多余字段做运行时 throw。

## Parser 生命周期

每个 `SVGAPlayer` 实例最多持有一个 `Parser`。

```text
SVGAPlayer
  parser: Parser | null
  loadQueue: Promise<void>
  slots: Map<string, SVGAPlayerSlot>
```

设计原则：

- `Parser` 按需懒创建，复用构造阶段固定的 `parserOptions`。
- URL `load()` 通过实例级 `loadQueue` 串行执行。
- 串行是必要的，因为当前 `Parser.load()` 会设置 worker 的 `onmessage` / `onmessageCallback`；并发 load 可能造成响应错配。
- `load(Video, key)` 不需要 parser，可直接写入 slot；如果要严格保持调用顺序，也可以走同一条 queue。
- 单次 load 失败不应打断后续队列，queue 应在下一次任务前吞掉上一轮 reject。
- `destroy()` 终止 shared parser，并让后续 queue 结果作废。

建议用 slot version 防过期写回：

```text
load(urlA, "gift") starts with version 1
load(urlB, "gift") starts with version 2

urlA finishes after urlB:
  version mismatch -> discard urlA result

delete("gift"):
  increment version -> pending load result cannot recreate the deleted slot
```

这样可以保证同一个 key 连续 load 时，后一次调用成为最终结果；删除 key 后，旧的异步结果不会把 slot 复活。

## 冗余旧 Player 删除

`src/player/index.ts` 是旧 `Player` runtime。当前 facade 迁移后，它已经不再被新 `SVGAPlayer` 调用，package main entry 也不再 re-export `Player`。

删除范围建议：

```text
src/player/index.ts
src/player/render.ts
```

保留范围：

```text
src/player/animator.ts
src/player/backend/*
src/player/compiler/*
```

原因：

- `Animator` 仍由 `SVGAPlayer` 播放生命周期使用。
- backend 和 compiler 仍是 facade 内部的渲染/编译实现。
- `render.ts` 只服务旧 `Player` 的 immediate Canvas 绘制路径；删除旧 `Player` 后应随之删除。

删除前需要跑 typecheck 和单元测试，确认没有残留 import、声明输出或测试依赖。

## RenderCompiler 生命周期

每次实际需要内部 compile 某个 key 时，继续创建新的 `RenderCompiler`。

原因：

- 当前 `RenderCompiler` 实例内部持有 `geometryIndex`、`geometryKeyToId`、`geometries`、`requiredCapabilities` 等累积状态。
- 新建实例可以自然保证每次 compile 状态干净。
- `new RenderCompiler()` 本身只创建少量空对象和基础状态，内存成本很小。
- 真正占内存的是 compile 结果 `CompiledAnimation`，而不是短生命周期的 compiler 实例。
- key 已经 compiled 且不 dirty 时，后续 `play(key)` 不会重新 compile，也不会重新创建 compiler。

后续只有在确认 compiler 实例创建本身成为性能问题时，才考虑为 `RenderCompiler` 增加显式 `reset()` 并复用实例。

## 已确认问题

### prepare 是否允许打断当前播放

选择 A：如果 `prepare(key)` 的 key 与 `activeKey` 不同，且当前正在播放，则先停止当前播放，然后 prepare 新 key。

原因：backend 全局唯一，`prepare(otherKey)` 会替换全局 backend 当前资源。先停止当前播放可以避免 active animation 和 backend resources 错配。

### play 自动 prepare

`play(key)` 自动处理未 compiled、dirty、或 `preparedKey !== key` 的情况，内部调用 `await prepare(key)`。因此 `play()` 是 async public API。

### prepare 作为可选预热 API

`prepare(key)` 作为 public 预热 API 保留。业务可以提前调用它来把目标 key 编译并准备到全局 backend，减少后续 `play(key)` 的首帧等待。

由于 backend 全局唯一，`prepare(otherKey)` 会替换当前 backend 资源；如果当前正在播放另一个 key，按上面的规则先停止当前播放。

### replace 后如何处理 dirty

`replace()` 后标记 dirty，不同 backend / mode 按资源层处理：

- Canvas 模式更新引用并清空 frame cache。
- WebGL 模式更新引用；如果对应 texture 已缓存，则更新 elementKey 对应 texture。
- refresh 成功后重置 dirty，并允许当前播放继续。
- 如果目标 key 不是当前 prepared key，dirty 保留到后续 prepare / play 前处理。

### delete 不存在的 key

`delete(key)` 删除不存在的 key 是 no-op。

### constructor 形态

彻底收敛 API，只保留 options 对象形式，不再保留 `new SVGAPlayer(canvas)`。

### DB 缓存

实例暴露 `cache()` 方法，内部按传入 key 读取 parsed 数据，并调用 `DB` 保存。

### Parser 复用与串行 load

每个实例复用单个 `Parser`。URL `load()` 通过 promise queue 串行执行，并通过 slot version 防止连续 load / delete 后的过期写回。

### RenderCompiler 不复用实例

每次实际需要内部 compile 某个 key 时，继续创建新的 `RenderCompiler`。新实例保证 compile 状态干净；内存主要消耗来自 cached `CompiledAnimation`，不是 compiler 实例本身。

### 旧 Player 删除

删除不再被调用的旧 `Player` runtime：`src/player/index.ts` 和随它使用的 `src/player/render.ts`。保留 `animator`、backend、compiler。

## 小结

本次讨论收敛出的核心方向：

```text
1. 用 key 管理多个 loaded / compiled SVGA slot。
2. public API 使用 load，不再把 Video 暴露给业务修改。
3. replace(elementKey, element, { key, mode }) 替代直接修改 dynamicElements / replaceElements。
4. delete(key) 删除对应 slot；如果正在播放则停止。
5. backend 全局唯一，不按 key 缓存。
6. backend 在 new SVGAPlayer() 时根据 renderMode + 浏览器 WebGL 支持确定。
7. auto 只看浏览器 WebGL 支持，不看 SVGA 内容特征。
8. setConfig 只接收 play 相关配置，init/backend/parser/render 配置只在构造阶段处理。
9. constructor 只保留 options 对象形式。
10. cache(db, { key, id }) 由实例读取内部 parsed 数据并写入 DB。
11. compile 降为内部实现；play(key) 是 async，并自动 prepare。
12. prepare(key) 作为可选 public 预热 API。
13. 每个实例复用单个 Parser，URL load 串行排队，并用 version 防过期写回。
14. 每次实际内部 compile 时继续 new RenderCompiler，不复用 compiler 实例。
15. 删除旧 Player runtime 冗余代码：src/player/index.ts 和 src/player/render.ts。
```
