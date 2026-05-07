# Render Capability Warning and Partial Rendering Plan

本文记录 `requiredCapabilities` 在渲染前告警、渲染中跳过不支持部分的实现方案。

## 背景

当前 `RenderCompiler` 已经能从 SVGA 数据中生成 `CompiledAnimation.requiredCapabilities`，各个 `RenderBackend` 也已经声明自身 `capabilities`。

现状问题是：

- `requiredCapabilities` 主要停留在元数据层，未在渲染前统一暴露给外部。
- WebGLBackend 遇到 shape 或 mask 时会在渲染过程中抛错，中断整帧渲染。
- 使用方无法通过事件提前知道当前动画有哪些能力在当前 backend 下不支持。

本方案只改变能力告警和 unsupported 部分的渲染行为，不改变 backend 选择策略。

## 关键约束

`renderMode: 'auto'` 的语义保持不变：

```text
auto
  -> 只判断浏览器 / canvas 是否支持 WebGL context
  -> WebGL 可用则使用 WebGLBackend
  -> WebGL 不可用则使用 CanvasBackend
```

`auto` 不根据 SVGA 内容或 `requiredCapabilities` 决定 fallback 到 Canvas。

## 目标

1. 渲染前比较 `animation.requiredCapabilities` 和 `backend.capabilities`。
2. 如果存在不支持的能力，通过新增事件通知外部。
3. 同时通过 `console.warn` 提示调试信息。
4. 渲染过程中跳过当前 backend 不支持的部分，继续渲染支持的部分。
5. 不使用 Canvas rasterization 作为 WebGL 内部 fallback。

## 非目标

- 不实现 WebGL shape fill / stroke / mask / lineDash。
- 不让 `auto` 根据 SVGA 数据 fallback 到 Canvas。
- 不把 unsupported shape 或 mask 预渲染到 Canvas 再上传成 WebGL texture。
- 不改变 CanvasBackend 的完整渲染行为。

## 新增事件

建议新增事件名：

```ts
unsupportedCapabilities
```

建议 payload：

```ts
interface SVGAPlayerUnsupportedCapabilitiesPayload {
  backendType: RenderBackendType
  unsupportedCapabilities: RenderCapabilityName[]
  requiredCapabilities: RenderCapabilities
  backendCapabilities: RenderCapabilities
}
```

使用方示例：

```ts
player.on('unsupportedCapabilities', payload => {
  console.log(payload.backendType)
  console.log(payload.unsupportedCapabilities)
})
```

事件触发时机：

```text
load / parse
  -> compile
  -> compare requiredCapabilities with backend.capabilities
  -> emit unsupportedCapabilities if any unsupported capability exists
  -> console.warn
  -> backend.prepare
  -> play / render
```

## Console 提示

使用标准浏览器 API：

```ts
console.warn(message, payload)
```

提示内容应包含：

- 当前 backend type。
- 不支持的 capability 列表。
- unsupported 部分会在渲染时跳过。

示例：

```text
[SVGAPlayer] webgl backend does not support required capabilities:
shapeFill, masks. Unsupported parts will be skipped during rendering.
```

## 能力比较逻辑

统一遍历 `RenderCapabilityName[]`：

```ts
const unsupportedCapabilities = RENDER_CAPABILITY_NAMES.filter(capability => {
  return animation.requiredCapabilities[capability] &&
    !backend.capabilities[capability]
})
```

只要 `requiredCapabilities[capability] === true` 且 `backend.capabilities[capability] === false`，就认为当前 backend 不支持该能力。

## WebGL 渲染时跳过策略

WebGLBackend 当前支持：

- image texture rendering
- replaceElement texture rendering
- dynamicElement texture rendering
- transform
- alpha / blend

WebGLBackend 当前不支持：

- shape fill
- shape fill holes
- shape stroke
- lineDash
- masks
- unsupported path commands
- snapshot

渲染策略：

```text
FrameRenderCommand
  |-- image / replaceElement
  |     `-- supported: render texture
  |
  |-- dynamicElement
  |     `-- supported: render texture
  |
  |-- mask
  |     `-- unsupported: skip mask application
  |
  `-- shapes
        `-- unsupported: skip shapes
```

也就是说，WebGL 渲染时不再因为 `command.mask !== null` 或 `command.shapes.length > 0` 抛错。

如果 sprite 同时包含图片和 shape：

```text
WebGLBackend
  -> render image part
  -> skip shape part
```

如果 sprite 只有 shape，没有图片或动态元素：

```text
WebGLBackend
  -> skip entire visible output for that command
  -> continue next command
```

## Mask 的处理边界

WebGL 不支持 mask 时，不应用 mask，也不报错中断。

这意味着某些动画在 WebGL 下可能比 Canvas 多显示未裁剪的图片区域。

如果产品语义更希望“有 mask 就连被 mask 的图片也跳过”，可以采用更保守策略：

```text
command has mask and backend does not support masks
  -> skip masked image / dynamicElement / shapes for this command
```

建议第一版选择哪种策略需要明确：

- **宽松策略**：跳过 mask 本身，但继续渲染图片。画面可能多显示内容。
- **保守策略**：跳过整个 masked command。画面可能少显示内容。

从“不支持部分跳过，只渲染支持部分”字面看，宽松策略更符合当前需求。

## 测试建议

新增或调整单元测试：

1. `RenderCompiler` 继续断言 shape / mask / dash 能正确进入 `requiredCapabilities`。
2. WebGL 模式 prepare 含 shape / mask 的动画时：
   - 触发 `unsupportedCapabilities` 事件。
   - payload 包含 `shapeFill`、`masks` 等不支持能力。
   - 调用 `console.warn`。
3. WebGLBackend 渲染含 image + shape 的 command 时：
   - 不抛错。
   - 仍调用 WebGL draw path 渲染 image。
4. WebGLBackend 渲染只有 shape 的 command 时：
   - 不抛错。
   - 不产生 WebGL draw call。
5. CanvasBackend 行为不变。
6. `renderMode: 'auto'` 仍只根据 WebGL context 可用性选择 backend。

## 风险

- WebGL 下画面可能与 Canvas 不完全一致，因为 unsupported 部分会被跳过。
- mask 跳过策略会影响视觉结果，需要产品侧确认选择宽松还是保守。
- 如果每次 prepare 都告警，频繁切换 keyed animation 时可能产生多次 warning；这是可接受的显式诊断行为。
- 动态替换资源可能改变 `requiredCapabilities`，需要在 refresh 或重新 prepare 时确认是否再次触发告警。

## 推荐落地顺序

1. 新增 `unsupportedCapabilities` 事件类型和 payload。
2. 在 facade 的 prepare 流程中比较 capabilities，并 emit + `console.warn`。
3. 修改 WebGLBackend：不再因 shape / mask 抛错，改为跳过 unsupported 部分。
4. 补单元测试固定事件、warning、WebGL partial render 行为。
5. 再讨论 mask 使用宽松策略还是保守策略。
