# Conventional Comments (for PR reviews)

格式：
<label> [decorations]: <subject>
[discussion]

常用 label：
- issue：问题（可加 blocking/non-blocking）
- suggestion：建议改进
- question：询问澄清
- praise：肯定亮点
- nit：小建议/风格（不阻断）

示例：
- issue (blocking): 这里的 XSS 风险需要处理（innerHTML）
- suggestion (non-blocking): 可以将重复的格式化逻辑抽到 util
- question: 这里是否需要兼容旧接口字段？
- praise: 错误态处理很完整，覆盖了重试与空态