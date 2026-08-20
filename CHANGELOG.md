# 更新日志

本项目的所有重要变更都会记录在此文件中。

本文档格式参考 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [Semantic Versioning 2.0.0](https://semver.org/lang/zh-CN/spec/v2.0.0.html)。

## [Unreleased]

目标版本：`2.2.0`

> 兼容性边界：默认渲染路径仍优先使用 OffscreenCanvas；音频素材只渲染动画，不播放声音；桌面浏览器自动化测试不代表 iOS 真机认证。

### 新增

- 新增只读属性 `player.progress`，用于获取当前播放进度。未挂载时返回 `0`，挂载后返回 `0` 到 `1` 的归一化值，单帧动画返回 `1`。
- `onProcess(progress)` 现在接收与 `player.progress` 一致的进度值，已有无参数回调仍可继续使用。
- 新增 `stepToFrame(frame, andPlay = false)`，可定位并立即绘制有效播放区间内的指定帧；默认停留在目标帧，传入 `true` 时从该帧继续播放。
- 新增 `isDisableOffscreenCanvas` 配置，可通过 `setConfig()` 动态切换到普通 HTML Canvas 渲染路径，作为兼容性回退选项。

### 变更

- 明确首帧展示方式：`mount()` 不会隐式绘制画面，需要在装载后调用 `stepToFrame(0)` 显示第一帧。
- 补充保持素材宽高比的响应式 Canvas 用法，避免容器尺寸变化导致动画变形。
- 补充 Parser 和 Player 实例复用、重复挂载与销毁说明，明确资源生命周期。
- 完善发布包消费支持：新增配置与播放器 API 的类型可从根入口直接使用，并支持 Rollup 和 Vite 4.4.5 生产构建。

### 修复

- 修复同一 Parser 实例并发加载时只有最后一个请求返回的问题，各请求现在可独立完成。
- 修复 HTTP 请求已成功完成后仍可能被错误取消的问题。
- 确保解析器不依赖 `.svga` 文件后缀，无后缀 HTTP 地址也可正常加载。
- 修复空路径或无效路径数据导致动画渲染失败的问题。
- 修复带音频数据的素材无法解码动画的问题；音频数据会被忽略，动画可继续静音渲染。
- 修复重复挂载、缓存路径切换或销毁后播放器自产资源未完整释放的问题。
