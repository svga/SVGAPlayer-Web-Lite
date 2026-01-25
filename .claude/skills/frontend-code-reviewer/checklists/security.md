# Security Checklist (Frontend-focused)

## XSS / 注入
- 是否使用了 innerHTML / dangerouslySetInnerHTML？
- 富文本、markdown、第三方内容：是否做了可信来源限制与净化？
- URL/querystring 拼接：是否可能注入脚本/HTML？
- DOM 操作：是否直接把不可信字符串塞进 DOM？

## CSP / 资源加载
- 是否引入了新的第三方脚本域名？是否需要更新 CSP？
- 是否有 inline script/style 的新增？是否会迫使 CSP 放宽？

## 敏感数据
- 是否把 token/PII 写入 localStorage、日志、埋点？
- 错误上报是否脱敏？

## 依赖与第三方 SDK
- 新增依赖是否必要？是否来自可信来源？
- SDK 是否会影响性能/隐私合规？