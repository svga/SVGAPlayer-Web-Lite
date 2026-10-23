# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

SVGAPlayer-Web-Lite 是一个轻量的 SVGA 2.x Web 播放器库（npm 包名 `svga`）。它导出 `Parser`（下载与解析）、`Player`（播放与渲染）和 `DB`（IndexedDB 持久化缓存）。不支持 SVGA 1.x 与声音播放。

这是 Web 包，不设置 Android `minSdk` 或 iOS/iPadOS `Deployment Target`。自动化验收覆盖 Chromium、Firefox、WebKit，但不是移动设备或最低系统版本的真机认证。

## 环境与常用命令

要求 Node.js 24.22.1（见 `.nvmrc`）、npm 12.2.1、TypeScript 7，使用 npm：

```sh
npm ci               # 按锁文件安装
npm run dev          # Vitest watch
npm test             # Vitest 单次运行
npx vitest run tests/unit/player-mount.test.ts   # 单个单元测试文件
npx vitest run -t "关键字"                  # 按用例名过滤

npm run lint         # oxlint，--deny-warnings，排除 generated 解码器
npm run format:check # oxfmt 格式检查
npm run type:check   # tsc --noEmit
npm run coverage     # Vitest + V8 覆盖率，带硬门槛
npm run test:browser # 构建后运行 Playwright 浏览器测试
npm run test:package # 打包文件、ES2017 语法和消费者安装检查
npm run build        # 构建 UMD、CJS、ESM 与声明文件
npm run size         # 产物体积、占位符、new Function 和声明闭包检查
npm run verify       # lint、格式、类型、覆盖率、浏览器和包检查
npm run visual       # 构建后启动 127.0.0.1:4173 可视化检验台
npm run clean        # 清理 dist、coverage、test-results、playwright-report

npm run build && npx playwright test tests/browser/umd-acceptance.spec.ts --project=chromium
```

`npm run verify` 不重复运行单元测试：`coverage` 已包含。覆盖率硬门槛为 statements 95%、branches 90%、functions 95%、lines 95%，`src/parser/svga.generated.ts` 不参与统计。

Playwright 配置只包含 Chromium、Firefox、WebKit 三个项目；`webServer` 会以 `--baseline local` 在 4174 端口自启。

## 架构

### 构建与 Worker

`scripts/build.mjs` 先调用本地 TypeScript 7 命令行编译到临时目录，再让 Rollup 把解析 Worker 单独打成 IIFE 并压缩，然后分别构建 UMD、CJS、ESM 主包，并把 Worker 内容内联到各产物。`src/parser.ts` 中的 `#PARSER_V2_INLINE_WROKER#` 占位符在每个产物中必须恰好出现一次，否则构建失败；Rollup 警告会被当作错误。

只发布根公共接口依赖的 6 个声明文件：`index.d.ts`、`index.d.mts`（ESM 条件的别名，内容为 `export * from './index.js'`）、`db.d.ts`、`parser.d.ts`、`player/index.d.ts`、`types.d.ts`。打包清单为 13 个文件。UMD/CJS/ESM 均须小于 90,112 字节（88 KiB）原始体积与 25,600 字节（25 KiB）gzip。`dist/` 每次构建先整体删除，它已被 `.gitignore` 忽略，由 `prepack` 自动生成，不要手工编辑。

解析 Worker 通过 `Blob` 与 `URL.createObjectURL` 启动。`Parser` 默认在 Worker 中运行，严格 CSP 需允许 `worker-src blob:`，不需要 `unsafe-eval`；`isDisableWebWorker: true` 是唯一直接执行模式，仅应在宿主明确允许 `unsafe-eval` 时使用。

### Parser：下载与解析

`src/parser.ts` 负责主线程侧请求、Worker 生命周期、并发上限（`maxInFlight`，默认 4，可设 1–8）和 FIFO 排队，使用 `Map` 管理待处理请求、`WeakMap` 保存实例状态，并以 `async` 方法暴露加载流程。`load()` 接受 URL 或字节输入，并支持 `signal`、`onProgress`、`timeout`（默认 30 秒）和 `headers`；取消以 `AbortError` 拒绝。Worker 返回结果会在主线程再次经过 `validate-video.ts` 校验后才 resolve。Worker 协议定义在 `src/parser/protocol.ts`。

`src/parser/index.ts` 是 Worker 入口：使用 `fetch` 流式下载、`fflate` 流式解压，并使用官方 `protobufjs` minimal runtime 和提交的静态只解码源解码 `MovieEntity`。构建会省略 schema 不需要的 Long 适配器。解析后由 `createVideo` 转为可结构化克隆的 Video 结构；下载、解压、wire 对象数和语义结构均有固定上限。数值上限集中在 `src/internal/limits.ts`，语义校验集中在 `src/validate-video.ts`，README 维护面向用户的上限清单。

### Player：现代状态与渲染

`src/player/index.ts` 通过 `WeakMap` 保存 `PlayerContext`（状态、挂载 token、Animator、画布、配置、observer、图片与帧缓存），公开声明不再暴露内部字段。terser 用 `properties: /^__svga/` 混淆内部属性名，因此新增内部字段必须沿用 `__svga` 前缀，且它们不是公共 API。Player 基于 `Animator` 驱动时间帧；`isCacheFrames: true` 时维护上限 64 MiB 的 LRU 帧缓存。Player 顺序解码 `Uint8Array` 图片，只释放自己创建的资源。优先使用 `OffscreenCanvas`；不可用、创建失败或设置 `isDisableOffscreenCanvas` 时使用 HTMLCanvas。公开 `config` 是冻结快照，所有变更必须经过 `setConfig` 校验。`progress` 与 `onProcess(progress)` 提供统一进度，`state` 与 `isPlaying` 暴露生命周期，`stepToFrame(frame, andPlay)` 复用暂停/继续时间线实现显式逐帧定位；`mount()` 不隐式绘制首帧。每个 `await` 之后都会检查挂载 token 和销毁状态，过期挂载只释放本次创建的资源。

`src/player/render.ts` 使用原生 `Path2D` 绘制路径、椭圆和圆角矩形，并将结果绘制到离屏画布后再提交到可见 Canvas。

### DB：IndexedDB 缓存

`src/db.ts` 延迟打开 IndexedDB，通过结构化克隆持久化包含 `Uint8Array` 图片的稳定 Video 记录。旧格式、损坏或不可验证记录按未命中处理，并在同一事务内尽力删除。

## 测试与可视化

- `tests/unit/`：Vitest，默认 Node 环境，使用 `fake-indexeddb` 和全局 stub 模拟浏览器 API。
- `tests/browser/`：Playwright，加载真实 UMD 产物；`visual-performance.spec.ts` 在 Chromium 全量巡检 17 个素材。
- `tests/visual/`：本地检验台页面，由 `scripts/serve-visual-test.mjs` 提供，本身不是测试文件。

`npm run visual` 在 `127.0.0.1:4173` 启动检验台；Playwright 的 `webServer` 固定使用 4174 和 `--baseline local`。检验台默认基线是 npm `latest`（解析并缓存确切版本），也可用 `--baseline <semver>` 固定。比较结果只用于同机同浏览器的趋势诊断，不是 CI 性能门槛；基线不可用时双版本比较和导出会显式禁用。

CI（`.github/workflows/verify.yml`）在 PR 和 push 上按 `.nvmrc` 安装 Node 24、强制 npm 12.2.1、安装 Chromium/Firefox/WebKit，然后运行 `npm run verify`。`changesets.yml` 仅在手动触发时开或更新 Version Packages PR，不发布；`release-verify.yml` 需 `release` environment 人工审批，只做校验、打包和 artifact 上传，不执行 `npm publish`、打 tag 或推送。

## 依赖与边界

- `fflate` 用于解压；`protobufjs` 使用 8.8.1 minimal runtime，生成器与 schema 溯源见 `src/parser/PROTOBUF_PROVENANCE.md`。
- 支持 OffscreenCanvas 的环境优先走离屏渲染；不支持或显式禁用时使用 HTMLCanvas 降级。该开关属于人工兼容回退，不是 iOS 真机修复声明。
- 禁用 Worker 的主线程路径包含明确的动态代码执行边界，不应为了绕过宿主安全策略而扩大使用范围。
- 不要把本地测试结果表述为真机、发布、部署、平台采用或 SEO 结果。
- 禁止执行发布或部署操作，包括推送 Git 远程仓库、发布 npm 包以及部署到生产环境。

## 变更与验证

修改源码后至少运行与变更相关的 lint、类型检查、Vitest、覆盖率、Playwright 或包检查；完成前运行 `npm run verify`。包检查会安装实际压缩包，并验证 bundler/node16/nodenext/CJS 类型消费、深层导入拒绝、Rollup、Vite 8、Vite 4.4.5、Webpack 5、publint 与 attw。只修改构建产物没有意义，`dist/` 应由构建脚本重新生成。

`tests/fixtures/svga/` 中的 17 个 `.svga` 文件全部来自实际业务，属于不可删除或用合成数据替换的回归素材。`tests/unit/production-fixtures.test.ts` 固定校验完整清单与原始字节，并逐个验证解析行为；增删或替换素材必须同步该清单。其中 `show.svga` 是保留的 SVGA 1.x 素材，用于验证当前播放器会明确拒绝不支持的版本。
