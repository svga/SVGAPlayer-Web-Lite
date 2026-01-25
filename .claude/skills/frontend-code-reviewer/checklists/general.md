# Frontend Code Review Checklist (General)

## Design / Architecture
- 模块边界清晰？职责单一？
- 状态管理是否合理？副作用（effects）是否必要且可控？
- 错误处理与空态是否一致？是否符合项目规范？

## Functionality / Correctness
- 边界条件：空值、极值、并发、竞态、重复点击、请求取消
- 表单：校验、禁用态、错误提示、可恢复性
- 数据：类型与运行时一致、兼容旧数据、回滚/灰度可行

## Maintainability
- 命名清晰、抽象层级合适、避免重复
- TS 类型收敛，避免 any 泄漏到外层
- CSS 作用域安全，避免全局污染与脆弱选择器

## A11y / Performance / Security / Tests
- 参见对应专项清单（a11y/performance/security）