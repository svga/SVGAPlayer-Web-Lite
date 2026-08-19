# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

SVGAPlayer-Web-Lite 是一个轻量的 SVGA 2.x Web 播放器库（npm 包名 `svga`）。它导出 `Parser`（下载与解析）、`Player`（播放与渲染）和 `DB`（IndexedDB 持久化缓存）。不支持 SVGA 1.x 与声音播放。

这是 Web 包，不设置 Android `minSdk` 或 iOS/iPadOS `Deployment Target`。文档支持边界为 Android 8.0+（API 26，使用受维护且可更新的 Chrome 或 WebView）以及 iOS/iPadOS 16+ Safari/WKWebView；原生宿主自行设置最低版本。当前本地 Playwright 测试不是最低版本真机认证。

## 环境与常用命令

要求 Node.js 24.x，使用 npm：

```sh
npm install
npm run dev          # Vitest watch
npm test             # Vitest 单元测试
npm run coverage     # Vitest + V8 覆盖率
npm run test:browser # 构建后运行 Playwright 浏览器测试
npm run test:package # 打包文件、ES2017 语法和消费者安装检查
npm run build        # 构建 UMD、CJS、ESM 与声明文件
npm run verify       # lint、类型检查、覆盖率、浏览器和包检查
```

Playwright 配置包含 Chromium、Firefox、WebKit 和 mobile Chromium 四个项目；这些是本地浏览器自动化项目，不替代最低版本设备认证。

## 架构

### 构建与 Worker

`scripts/build.mjs` 使用 Rollup API 在内存中分别构建解析 Worker 和主包，再把压缩后的 Worker 内容内联到各产物；构建同时生成 TypeScript 声明文件，并检查 UMD/CJS/ESM 包的体积与内联内容。构建产物位于 `dist/`，由 `prepack` 自动生成。

解析 Worker 通过 `Blob` 与 `URL.createObjectURL` 启动。`Parser` 默认在 Worker 中运行；`isDisableWebWorker: true` 是明确的降级边界，会在主线程通过内联 Worker 代码的 `eval` 模拟 Worker，仅应在宿主明确允许该执行边界时使用。

### Parser：下载与解析

`src/parser.ts` 负责主线程侧请求、Worker 生命周期和并发响应匹配，使用 `Map` 管理待处理请求、`WeakMap` 保存实例状态，并以 `async` 方法暴露加载流程。

`src/parser/index.ts` 是 Worker 入口：使用 `fetch` 下载文件，使用 `fflate` 解压，并使用固定提交版本的 `protobufjs` 解码 `MovieEntity`。`src/parser/svga-proto.ts` 由 proto 描述生成，勿手工修改。解析后由 `VideoEntity` 压缩为播放器使用的 Video 结构，并处理图片、帧、形状、透明度、布局、变换和复用帧。

### Player：现代状态与渲染

`src/player/index.ts` 使用 `WeakMap` 保存运行时状态，基于 `Animator` 驱动时间帧，并维护上限 64 MiB 的 LRU 帧缓存。优先使用 `OffscreenCanvas`；不可用或创建失败时保留 HTMLCanvas 降级路径。`replaceElements`、`dynamicElements`、循环、起止帧、交叉观察器和无延迟模式均由公开配置控制。

`src/player/render.ts` 使用原生 `Path2D` 绘制路径、椭圆和圆角矩形，并将结果绘制到离屏画布后再提交到可见 Canvas。

### DB：IndexedDB 缓存

`src/db.ts` 使用 `WeakMap` 保存每个 `DB` 实例的运行时状态，并通过 IndexedDB 持久化可序列化的 Video 数据。使用 DB 时应让 Parser 关闭 ImageBitmap 垫片，以便数据可存储。

## 依赖与边界

- `fflate` 用于解压；`protobufjs` 使用仓库锁定的 git 提交版本，修改前先核对现有测试与类型。
- 支持 OffscreenCanvas 的环境优先走离屏渲染；不支持时使用 HTMLCanvas 降级。
- 禁用 Worker 的主线程路径包含 `eval`，这是显式的执行边界，不应为了绕过宿主安全策略而扩大使用范围。
- 不要把本地测试结果表述为真机、发布、部署、平台采用或 SEO 结果。
- 禁止执行发布或部署操作，包括推送 Git 远程仓库、发布 npm 包以及部署到生产环境。

## 变更与验证

修改源码后至少运行与变更相关的 lint、类型检查、Vitest、覆盖率、Playwright 或包检查；完成前运行 `npm run verify`。只修改构建产物没有意义，`dist/` 应由构建脚本重新生成。

`__test__/svga/` 中的 17 个 `.svga` 文件全部来自实际业务，属于不可删除或用合成数据替换的回归素材。`tests/unit/production-fixtures.test.ts` 固定校验完整清单与原始字节，并逐个验证解析行为；其中 `show.svga` 是保留的 SVGA 1.x 素材，用于验证当前播放器会明确拒绝不支持的版本。
