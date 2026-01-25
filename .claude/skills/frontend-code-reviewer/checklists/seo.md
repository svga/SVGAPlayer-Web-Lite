# SEO Checklist（Google Search Central 导向，HTML/Head 重点）

> 适用：SSR/静态页/可被抓取的 HTML 输出；或 PR 改动了 `<head>`、路由、页面结构、内容模板、图片资源等。

## 0. 基础前提：可抓取、可索引、可理解
- [ ] 页面/站点满足 Google Search Essentials 的“技术要求”（能被抓取、能被解析、能被理解的基础条件）。
- [ ] 站内关键链接可被爬虫发现：使用可抓取的链接（避免只靠 JS click 才出现的导航路径），并确保重要页面能通过站内链接到达。
- [ ] 不触发明显的 spam/误导策略（如果属于营销/内容页改动，尤其注意）。

## 1. Title（影响标题链接 title link）
- [ ] 每个页面都提供 `<title>`。
- [ ] `<title>` 文案：描述性强、简洁、避免“Home/Profile”等模糊词；避免过长/堆砌。

## 2. Meta description（影响 snippet）
- [ ] 为关键页面提供 `<meta name="description" content="...">`（Google 在合适时可能采用它生成摘要）。
- [ ] description **尽量每页唯一**，准确描述该页内容；避免“全站同一句”。
- [ ] 避免关键词列表式堆砌；可以包含对用户有用的结构化信息（作者/日期/价格/开放时间等）。
- [ ] 大站可“程序化生成 description”，但需保证人类可读且多样化。

## 3. Robots / 索引控制（只用 Google 支持的 meta）
- [ ] 若页面应出现在搜索中：确认没有误加 `noindex` / `nofollow` / 过度限制 snippet 的规则。
- [ ] 若页面不应出现在搜索中：用 Google 支持的 robots 相关 meta（`robots`/`googlebot` 等）进行控制，而不是“隐藏内容”。
- [ ] 不要使用 `<meta name="keywords">` 指望提升排名（Google 明确忽略）。

## 4. Canonical（重复 URL / 参数 / 多入口页面）
- [ ] 存在重复或近重复 URL 风险时，在 `<head>` 中加入：
  - `<link rel="canonical" href="https://example.com/path">`
- [ ] canonical 使用**绝对 URL**，并尽量保证站内链接也指向 canonical。
- [ ] CSR/注水式渲染场景：优先在 HTML 源码中给出 canonical，并避免让 JS 在运行期修改 canonical（让 canonical 信息“尽可能清晰”）。

## 5. 图片（Image SEO 关键点）
- [ ] 重要图片使用 `<img src="...">`（Google 可从 `img[src]` 发现图片）；避免把关键图只放在 CSS background 里。
- [ ] 图片都有合适的 `alt`（既利于可访问性，也帮助搜索理解图片内容）。
- [ ] 响应式图片：使用 `srcset` / `<picture>` 时，仍提供 `img[src]` 作为 fallback。
- [ ] 图片体积与清晰度平衡，避免拖慢页面。

## 6. Structured data（可选但高收益）
- [ ] 若页面类型适配（Article/Product/Breadcrumb/FAQ 等），考虑添加结构化数据（优先 JSON-LD）。
- [ ] 结构化数据必须描述**用户可见**内容；不要给不可见内容加结构化数据。
- [ ] 提交前用 Rich Results Test / Schema validator 做基础校验（若团队流程允许）。

## 7. Favicon（搜索结果展示）
- [ ] 首页 `<head>` 添加 favicon 的 `<link rel="icon" href="...">`。
- [ ] favicon：1:1 正方形，至少 8x8px（更推荐 >48x48px）；URL 稳定；允许 Googlebot 抓取。

## 8. Meta tags 注入/变更（JS SEO 风险点）
- [ ] 尽量不要用 JavaScript 注入或改写 meta tags；如必须，务必充分测试（尤其是 canonical/robots/description 等）。