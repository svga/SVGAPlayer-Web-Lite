# Render Capability Feature Tree Plan

本文记录将 `RenderCapabilities` 从粗粒度语义字段拆成细粒度渲染能力树的方案。目标是让 Canvas、WebGL、未来 WebGPU 都使用同一套 SVGA 渲染语义能力描述，同时允许 WebGL/WebGPU 逐项补能力。

## 背景

当前 `RenderCapabilities` 是粗粒度字段：

```ts
interface RenderCapabilities {
  imageRendering: boolean
  dynamicTextures: boolean
  shapeFill: boolean
  shapeFillHoles: boolean
  shapeStroke: boolean
  lineDash: boolean
  masks: boolean
  snapshot: boolean
}
```

这个模型适合表达“动画是否用了某类大能力”，但不适合表达 GPU 后端的渐进式支持能力。

例如 WebGL 可能先支持：

```text
rect fill
ellipse fill
```

但仍不支持：

```text
rounded rect fill
path fill
path holes
stroke
mask
line dash
```

此时如果只保留 `shapeFill: boolean`，就会出现语义尴尬：

```text
shapeFill = true
  -> 容易误导外部，以为完整支持所有 shape fill

shapeFill = false
  -> 无法表达 rect / ellipse fill 已经可以渲染
```

因此建议完全用细粒度 feature tree 代替当前粗字段。

## 设计原则

1. Capability 描述 SVGA 渲染语义，不描述 WebGL/WebGPU 的底层 API。
2. `requiredCapabilities` 表达动画实际需要的能力。
3. backend `capabilities` 表达当前后端完整支持的能力。
4. WebGL/WebGPU 后端可以逐项把能力从 `false` 变成 `true`。
5. 不保留 `shapeFill` / `shapeStroke` 这类粗字段作为判断来源。
6. 对外告警和渲染跳过都基于细粒度 capability path。

## 总体结构

建议将 `RenderCapabilities` 拆成：

```ts
interface RenderCapabilities {
  texture: TextureCapabilities
  shape: ShapeCapabilities
  masks: boolean
  snapshot: boolean
}
```

能力路径示例：

```text
texture.static
shape.rect.fill
shape.path.stroke
shape.strokeStyle.lineDash
masks
snapshot
```

## Texture

```ts
interface TextureCapabilities {
  static: boolean
  dynamic: boolean
}
```

字段说明：

| Capability | 含义 |
| --- | --- |
| `static` | 后端可以渲染内容稳定的纹理源，例如 SVGA 内置图片或一次性 replace 图片。通常在 prepare 或 replace / refresh 时上传，后续帧复用。 |
| `dynamic` | 后端可以渲染内容会变化的纹理源，例如动态 canvas / OffscreenCanvas。通常需要在渲染时或每帧重新读取 / 上传当前内容。 |

来源：

| Capability | 来源 |
| --- | --- |
| `texture.static` | `video.images[sprite.imageKey] !== undefined` 或静态 `video.replaceElements[sprite.imageKey] !== undefined` |
| `texture.dynamic` | `video.dynamicElements[sprite.imageKey] !== undefined`，或被标记为动态模式的外部替换资源 |

说明：

- Capability 表达的是纹理更新能力，不表达资源来源。
- `replaceElement` 和 `dynamicElement` 的底层形态都可以是外部 texture source，区别主要是更新策略。
- `replace(..., mode: 'replace')` 可视为 `texture.static`。
- `replace(..., mode: 'dynamic')` 可视为 `texture.dynamic`。

## Shape

```ts
interface ShapeCapabilities {
  rect: ShapePaintCapabilities
  roundedRect: ShapePaintCapabilities
  ellipse: ShapePaintCapabilities
  path: ShapePaintCapabilities
  strokeStyle: StrokeStyleCapabilities
}

interface ShapePaintCapabilities {
  fill: boolean
  stroke: boolean
}

interface StrokeStyleCapabilities {
  width: boolean
  lineCap: boolean
  lineJoin: boolean
  miterLimit: boolean
  lineDash: boolean
}
```

字段说明：

| Capability | 含义 |
| --- | --- |
| `rect.fill` | 后端可以填充普通矩形，不包含圆角。 |
| `rect.stroke` | 后端可以描边普通矩形，不包含圆角。 |
| `roundedRect.fill` | 后端可以填充圆角矩形，并正确处理半径 clamp 与圆角边界。 |
| `roundedRect.stroke` | 后端可以描边圆角矩形，并正确处理圆角处的连接。 |
| `ellipse.fill` | 后端可以填充椭圆形，通常通过曲线或多边形近似实现。 |
| `ellipse.stroke` | 后端可以描边椭圆。 |
| `path.fill` | 后端可以填充 `SHAPE` 的通用 path。path 内部的直线、三次贝塞尔、二次贝塞尔和多 contour 由 path adapter 统一处理。 |
| `path.stroke` | 后端可以描边 `SHAPE` 的通用 path。path 内部先被 adapter flatten 成 contour 点集，再生成描边几何。 |
| `strokeStyle.width` | 后端可以应用 `strokeWidth`，即描边宽度不只是默认值。 |
| `strokeStyle.lineCap` | 后端可以应用线段端点样式，例如 `butt`、`round`、`square`。 |
| `strokeStyle.lineJoin` | 后端可以应用线段连接样式，例如 `miter`、`round`、`bevel`。 |
| `strokeStyle.miterLimit` | 后端可以应用 miter join 的斜接限制。 |
| `strokeStyle.lineDash` | 后端可以应用虚线描边模式。 |

来源：

| Capability | 来源 |
| --- | --- |
| `shape.rect.fill` | `shape.type === RECT && styles.fill !== null && cornerRadius === 0` |
| `shape.rect.stroke` | `shape.type === RECT && hasStroke && cornerRadius === 0` |
| `shape.roundedRect.fill` | `shape.type === RECT && styles.fill !== null && cornerRadius > 0` |
| `shape.roundedRect.stroke` | `shape.type === RECT && hasStroke && cornerRadius > 0` |
| `shape.ellipse.fill` | `shape.type === ELLIPSE && styles.fill !== null` |
| `shape.ellipse.stroke` | `shape.type === ELLIPSE && hasStroke` |
| `shape.path.fill` | `shape.type === SHAPE && styles.fill !== null` |
| `shape.path.stroke` | `shape.type === SHAPE && hasStroke` |
| `shape.strokeStyle.width` | `styles.strokeWidth !== null` |
| `shape.strokeStyle.lineCap` | `styles.lineCap !== null` |
| `shape.strokeStyle.lineJoin` | `styles.lineJoin !== null` |
| `shape.strokeStyle.miterLimit` | `styles.miterLimit !== null` |
| `shape.strokeStyle.lineDash` | `styles.lineDash !== null && styles.lineDash.length > 0` |

说明：

- `SHAPE` 不再按 `linePath` / `cubicBezierPath` / `quadraticBezierPath` / `compoundPath` 拆 capability。
- 直线、三次贝塞尔、二次贝塞尔和多 contour 由 path adapter 统一转换成 WebGL 可消费的点集 / 三角形。
- 多 contour 不作为 capability 字段。adapter 约定：多于一个 `moveTo` 时，按 `moveTo` 拆 contour，面积绝对值最大的 contour 作为外轮廓，其余 contour 默认作为 hole。
- 设计侧需要约束导出的多 contour path：一个 `SHAPE` 内面积最大的 contour 是外轮廓，其余 contour 都是洞。不支持一个 `SHAPE` 内多个并列外轮廓、复杂嵌套岛或自交路径的精确 Canvas 等价。
- shape 是主维度，fill / stroke 是作用在该 shape 上的绘制操作。
- `strokeStyle` 不归属于某个具体 shape，因为它描述的是 stroke 操作的样式能力。
- 如果未来需要区分 fill rule，可继续拆：

```ts
nonzeroFillRule: boolean
evenoddFillRule: boolean
```

Stroke 判断：

```ts
const hasStroke =
  styles.stroke !== null ||
  styles.strokeWidth !== null ||
  styles.lineCap !== null ||
  styles.lineJoin !== null ||
  styles.miterLimit !== null ||
  (styles.lineDash !== null && styles.lineDash.length > 0)
```

- `strokeStyle.lineDash` 只影响描边路径，因此归属在 shape 的 stroke style 能力下。

## Masks

```ts
masks: boolean
```

字段说明：

| Capability | 含义 |
| --- | --- |
| `masks` | 后端可以使用 `frame.maskPath` 的通用 path 作为 mask / clip 区域。path 内部由同一套 path adapter 处理。 |

来源：

| Capability | 来源 |
| --- | --- |
| `masks` | `frame.maskPath !== null` |

说明：

- mask path 复用 shape path adapter 的 command 解析、曲线 flatten 和多 contour 约定。
- mask path 的复杂度不再污染 fill capability。

## Renderer 基础执行

以下能力不进入 `RenderCapabilities`：

| 项目 | 处理方式 |
| --- | --- |
| `transform` | SVGA 原始字段是 `Transform { a, b, c, d, tx, ty }`。Canvas 直接调用 `context.transform(...)`；WebGL/WebGPU 优先由 JS 生成矩阵传入 shader，如果某条路径不适合 shader，则 JS 侧预先把坐标乘矩阵。 |
| `alpha` | Canvas 使用 `globalAlpha`；WebGL/WebGPU 使用 uniform alpha + blend。alpha 默认属于 renderer 基础执行逻辑，不触发 unsupported capability、warning 或跳过。 |

说明：

- transform 和 alpha 不决定“这段 SVGA 是否可以被渲染”，只是 renderer 如何执行。
- 如果 alpha 在某个后端没有生效，表现会偏不透明，但不应该由 capability diff 负责。
- 如果 transform 在某个后端完全不可用，该后端应视为不可用，而不是返回一个 unsupported capability。

## Snapshot

```ts
snapshot: boolean
```

字段说明：

| Capability | 含义 |
| --- | --- |
| `snapshot` | 后端可以获取当前渲染结果的快照。具体输出格式由上层 API 决定，例如 base64、HTMLImageElement、ImageBitmap、Blob 或 canvas。 |

说明：

- `snapshot` 只关心能否获取当前画面快照，不区分快照输出格式。
- frame cache 属于播放器业务 / 性能策略，不属于渲染语义 capability。

## Path Parser 增强

当前 `parsePath()` 返回：

```ts
interface ParsedPath {
  commands: PathCommand[]
  contourCount: number
  hasHoles: boolean
  hasUnsupportedCommands: boolean
}
```

新的 capability 不再把 path command 类型拆成独立字段。parser 需要稳定输出 command 序列和 contour 信息，供 path adapter 使用。

```ts
interface ParsedPath {
  commands: PathCommand[]
  contourCount: number
  hasMultipleContours: boolean
  hasUnsupportedCommands: boolean
}
```

说明：

- 当前 `hasHoles` 命名不准确，实际只是 `contourCount > 1`。
- 建议后续改名为 `hasMultipleContours`。
- `line` / `cubicBezier` / `quadraticBezier` 不作为 capability path；它们是 adapter 内部处理的 command 类型。
- `A/a` arc 当前不作为已支持 path command，进入 compile diagnostics。

## Path Adapter

WebGL/WebGPU 没有 Canvas 的 path API，因此 `shape.path.fill` / `shape.path.stroke` 背后需要一层 path adapter。

adapter 输入：

```ts
interface PathAdapterInput {
  commands: PathCommand[]
}
```

adapter 输出：

```ts
interface PathAdapterOutput {
  contours: Point[][]
  fillVertices?: number[]
  fillIndices?: number[]
  strokeVertices?: number[]
  strokeIndices?: number[]
}
```

处理规则：

1. 按 `moveTo` 拆分 contour。
2. `lineTo` 直接追加点。
3. `bezierCurveTo` 使用 JS/CPU 自适应采样或固定误差阈值 flatten 成多段 line。
4. `quadraticCurveTo` 使用 JS/CPU 自适应采样或固定误差阈值 flatten 成多段 line。
5. `closePath` 关闭当前 contour。
6. fill 时：
   - 单 contour：直接 `earcut(points, [], 2)`。
   - 多 contour：计算每个 contour 的 signed area，取 `abs(area)` 最大的 contour 作为外轮廓，其余 contour 默认作为 hole，再调用 `earcut(outer + holes, holeIndices, 2)`。
7. stroke 时：每个 contour 单独生成 stroke mesh，不依赖 `earcut`。

数据约束：

- 一个 `SHAPE` 中如果存在多个 contour，面积最大的 contour 视为外轮廓，其余 contour 视为 hole。
- 设计侧需要保证导出的 path 满足该约束。
- 不追求复杂嵌套、多并列外轮廓、自交 path 与 Canvas `fill()` 完全一致。
- 由于该规则固定在 adapter 中，多 contour 不需要独立 `multiContourFill` capability。

## Compile Diagnostics

parser 不能识别的 path command 不属于 backend capability。

原因是 capability 描述的是“后端是否能渲染某个已知 SVGA 语义”，例如直线路径、三次贝塞尔路径、mask、stroke dash 等。未知 command 没有稳定语义，不能定义成 `backend.capabilities.xxx = true / false`，也不应该进入 `requiredCapabilities`。

建议将这类信息放到编译诊断中：

```ts
interface RenderCompileDiagnostics {
  unsupportedPathCommands: UnsupportedPathCommandDiagnostic[]
}

interface UnsupportedPathCommandDiagnostic {
  owner: 'shape' | 'mask'
  geometryId: string
  method: string
  rawPath?: string
}
```

字段说明：

| 字段 | 含义 |
| --- | --- |
| `unsupportedPathCommands` | parser / compiler 发现但无法映射到已知 path 语义的命令列表。 |
| `owner` | 未识别命令来自 shape 还是 mask。 |
| `geometryId` | 受影响的几何对象标识，用于告警、事件和渲染跳过定位。 |
| `method` | 未识别的 path command，例如未来 SVGA 数据中出现但当前 parser 不认识的命令。 |
| `rawPath` | 可选原始 path 字符串，便于调试。 |

处理策略：

- `requiredCapabilities` 只由已识别的几何、样式、纹理、mask、transform、snapshot 能力生成。
- `unsupportedPathCommands` 不参与 capability diff。
- 渲染前可以把 diagnostics 合并进 warning / event，告诉外部有数据无法完整解析。
- 渲染过程中如果某个 shape / mask 带有 unsupported path diagnostics，建议跳过受影响的完整 shape / mask，而不是跳过单个 command，因为未知 command 可能改变后续路径拓扑。

## Capability Diff

当需要比较动画需求和后端能力时，不再比较粗字段，而是递归比较 feature tree。

结果建议使用 capability path：

```ts
type CapabilityPath =
  | 'texture.static'
  | 'texture.dynamic'
  | 'shape.rect.fill'
  | 'shape.rect.stroke'
  | 'shape.roundedRect.fill'
  | 'shape.roundedRect.stroke'
  | 'shape.ellipse.fill'
  | 'shape.ellipse.stroke'
  | 'shape.path.fill'
  | 'shape.path.stroke'
  | 'shape.strokeStyle.width'
  | 'shape.strokeStyle.lineCap'
  | 'shape.strokeStyle.lineJoin'
  | 'shape.strokeStyle.miterLimit'
  | 'shape.strokeStyle.lineDash'
  | 'masks'
  | 'snapshot'
```

Unsupported event 可以返回：

```ts
interface SVGAPlayerUnsupportedCapabilitiesPayload {
  backendType: RenderBackendType
  unsupportedCapabilities: CapabilityPath[]
  requiredCapabilities: RenderCapabilities
  backendCapabilities: RenderCapabilities
}
```

## WebGL 初始能力示例

按当前 WebGLBackend 能力，初始声明应类似：

```ts
const webglCapabilities: RenderCapabilities = {
  texture: {
    static: true,
    dynamic: true
  },
  shape: {
    rect: { fill: false, stroke: false },
    roundedRect: { fill: false, stroke: false },
    ellipse: { fill: false, stroke: false },
    path: { fill: false, stroke: false },
    strokeStyle: {
      width: false,
      lineCap: false,
      lineJoin: false,
      miterLimit: false,
      lineDash: false
    }
  },
  masks: false,
  snapshot: false
}
```

第一批补 WebGL geometry 后，可以逐项打开：

```ts
shape.rect.fill = true
shape.ellipse.fill = true
shape.path.fill = true // path adapter + earcut ready 后打开
```

## Canvas 初始能力示例

CanvasBackend 可以声明几乎完整能力：

```ts
const canvasCapabilities: RenderCapabilities = {
  texture: {
    static: true,
    dynamic: true
  },
  shape: {
    rect: { fill: true, stroke: true },
    roundedRect: { fill: true, stroke: true },
    ellipse: { fill: true, stroke: true },
    path: { fill: true, stroke: true },
    strokeStyle: {
      width: true,
      lineCap: true,
      lineJoin: true,
      miterLimit: true,
      lineDash: true
    }
  },
  masks: true,
  snapshot: true
}
```

说明：

- parser 不能识别的 path command 不属于 backend capability，应进入 compile diagnostics。

## 推荐迁移顺序

1. 新增 feature tree 类型。
2. 用 feature tree 替换 `emptyCapabilities()`。
3. 修改 compiler 的 feature scan，按 geometry / style 填细字段；path 命令类型不再生成独立 capability。
4. 修改 CanvasBackend / WebGLBackend capabilities 声明。
5. 新增 capability diff helper，返回 capability path 列表。
6. 基于 capability path 实现 unsupported event / warning。
7. 新增 path adapter：解析 `PathCommand[]`，flatten 曲线，按最大面积 contour + holes 约定生成 earcut 输入。
8. WebGLBackend 改为按 shape 级 capability 判断能否渲染。
9. 再逐步补 `shape.rect.fill`、`shape.ellipse.fill`、`shape.roundedRect.fill`、`shape.path.fill` 等 WebGL native / adapter 渲染能力。

## 关键收益

- 不再需要解释 `shapeFill` 半支持到底算 true 还是 false。
- WebGL 可以逐项补能力，外部也能看到精确 unsupported path。
- WebGPU 可以复用同一套 `requiredCapabilities` scan。
- Canvas 作为 fallback backend 时也能用同一套 capability diff 和诊断机制。
