# 贡献指南

## 环境

- Node.js 24.22.1（`.nvmrc`）
- npm 12.2.1（`packageManager` 与 `devEngines` 会强制校验）
- TypeScript 7（本地 devDependency）

```sh
nvm use
npm ci
npm run dev   # Vitest watch
```

## 提交前

快速门禁：

```sh
npm run verify:fast   # lint + format:check + type:check + coverage
```

完整门禁（构建、三浏览器、真实压缩包消费）：

```sh
npm run verify
```

`npm run test:package` 会安装实际 tarball，并验证类型消费矩阵、Rollup、Vite 8、
Vite 4.4.5、Webpack 5、publint 与 attw；这些步骤只使用仓库内工具，不联网安装。
涉及发布产物的改动还应运行 `npm run size`，或直接依赖 `npm run verify`。

只修改 `dist/` 没有意义：它由构建脚本生成且不提交。

## 回归素材

`tests/fixtures/svga/` 中的 17 个 `.svga` 文件全部来自实际业务。不得删除、替换或
用合成数据重建；`tests/unit/production-fixtures.test.ts` 固定校验完整清单、Git blob
哈希和逐个解析行为。`show.svga` 是保留的 SVGA 1.x 素材，必须被明确拒绝。

## 发布流程

本仓库使用 changesets。合并功能改动时请附上 changeset：

```sh
npm run changeset   # 选择 minor / patch 并填写说明
```

维护者发布时：

1. 在 GitHub Actions 手动运行 **Changesets**，它会开或更新 Version Packages PR；
   该工作流不执行 `npm publish`。
2. 合并版本 PR 后，手动运行 **Release verification**。它要求 `release` environment
   的人工审批，执行完整 `npm run verify`、打包并上传带 SHA-256 的 artifact，
   同样不执行 `npm publish`、不打 tag、不推送。
3. 实际发布由维护者在受控环境中完成，并使用 `publishConfig` 中的
   `access: public` 与 `provenance: true`。

自动化验收覆盖 Chromium、Firefox、WebKit，不代表移动设备或最低系统版本的真机认证。
