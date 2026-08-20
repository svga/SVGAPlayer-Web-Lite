# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

SVGAPlayer-Web-Lite 是一个轻量的 SVGA 2.x Web 播放器库（npm 包名 `svga`）。它导出 `Parser`（下载与解析）、`Player`（播放与渲染）和 `DB`（IndexedDB 持久化缓存）。不支持 SVGA 1.x 与声音播放。

这是 Web 包，不设置 Android `minSdk` 或 iOS/iPadOS `Deployment Target`。自动化验收覆盖 Chromium、Firefox、WebKit，但不是移动设备或最低系统版本的真机认证。

## 环境与常用命令

要求 Node.js 24.18.1、npm 12.0.2、TypeScript 7，使用 npm：

```sh
npm ci
npm run dev          # Vitest watch
npm test             # Vitest 单元测试
npm run coverage     # Vitest + V8 覆盖率
npm run test:browser # 构建后运行 Playwright 浏览器测试
npm run test:package # 打包文件、ES2017 语法和消费者安装检查
npm run build        # 构建 UMD、CJS、ESM 与声明文件
npm run verify       # lint、类型检查、覆盖率、浏览器和包检查
```

Playwright 配置只包含 Chromium、Firefox、WebKit 三个项目。

## 架构

### 构建与 Worker

`scripts/build.mjs` 先调用本地 TypeScript 7 命令行编译到临时目录，再让 Rollup 分别构建解析 Worker 和主包，并把压缩后的 Worker 内容内联到各产物。只发布根公共接口依赖的五个声明文件；UMD/CJS/ESM 均须小于 88 KiB 原始体积与 25 KiB gzip。构建产物位于 `dist/`，由 `prepack` 自动生成。

解析 Worker 通过 `Blob` 与 `URL.createObjectURL` 启动。`Parser` 默认在 Worker 中运行，严格 CSP 需允许 `worker-src blob:`，不需要 `unsafe-eval`；`isDisableWebWorker: true` 是唯一直接执行模式，仅应在宿主明确允许 `unsafe-eval` 时使用。

### Parser：下载与解析

`src/parser.ts` 负责主线程侧请求、Worker 生命周期、四路并发和 FIFO 排队，使用 `Map` 管理待处理请求、`WeakMap` 保存实例状态，并以 `async` 方法暴露加载流程。

`src/parser/index.ts` 是 Worker 入口：使用 `fetch` 流式下载、`fflate` 流式解压，并使用官方 `protobufjs` minimal runtime 和提交的静态只解码源解码 `MovieEntity`。构建会省略 schema 不需要的 Long 适配器。解析后由 `createVideo` 转为可结构化克隆的 Video 结构；下载、解压、wire 对象数和语义结构均有固定上限。

### Player：现代状态与渲染

`src/player/index.ts` 使用 `WeakMap` 保存运行时状态，基于 `Animator` 驱动时间帧，并维护上限 64 MiB 的 LRU 帧缓存。Player 顺序解码 `Uint8Array` 图片，只释放自己创建的资源。优先使用 `OffscreenCanvas`；不可用、创建失败或设置 `isDisableOffscreenCanvas` 时使用 HTMLCanvas。公开 `config` 是冻结快照，所有变更必须经过 `setConfig` 校验。`progress` 与 `onProcess(progress)` 提供统一进度，`stepToFrame(frame, andPlay)` 复用暂停/继续时间线实现显式逐帧定位；`mount()` 不隐式绘制首帧。

`src/player/render.ts` 使用原生 `Path2D` 绘制路径、椭圆和圆角矩形，并将结果绘制到离屏画布后再提交到可见 Canvas。

### DB：IndexedDB 缓存

`src/db.ts` 延迟打开 IndexedDB，通过结构化克隆持久化包含 `Uint8Array` 图片的稳定 Video 记录。旧格式、损坏或不可验证记录按未命中处理，并在同一事务内尽力删除。

## 依赖与边界

- `fflate` 用于解压；`protobufjs` 使用 8.7.2 minimal runtime，生成器与 schema 溯源见 `src/parser/PROTOBUF_PROVENANCE.md`。
- 支持 OffscreenCanvas 的环境优先走离屏渲染；不支持或显式禁用时使用 HTMLCanvas 降级。该开关属于人工兼容回退，不是 iOS 真机修复声明。
- 禁用 Worker 的主线程路径包含明确的动态代码执行边界，不应为了绕过宿主安全策略而扩大使用范围。
- 不要把本地测试结果表述为真机、发布、部署、平台采用或 SEO 结果。
- 禁止执行发布或部署操作，包括推送 Git 远程仓库、发布 npm 包以及部署到生产环境。

## 变更与验证

修改源码后至少运行与变更相关的 lint、类型检查、Vitest、覆盖率、Playwright 或包检查；完成前运行 `npm run verify`。包检查会安装实际压缩包，并验证 Rollup 与 Vite 4.4.5 production build。只修改构建产物没有意义，`dist/` 应由构建脚本重新生成。

`tests/fixtures/svga/` 中的 17 个 `.svga` 文件全部来自实际业务，属于不可删除或用合成数据替换的回归素材。`tests/unit/production-fixtures.test.ts` 固定校验完整清单与原始字节，并逐个验证解析行为；其中 `show.svga` 是保留的 SVGA 1.x 素材，用于验证当前播放器会明确拒绝不支持的版本。
