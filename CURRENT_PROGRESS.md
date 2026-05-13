# ZNXP SaaS 当前进度记录

更新时间：2026-05-09

## 当前目标

老板要求把系统拆开：选品、SEO、广告、运营分别成为独立系统，但保留一个统一中控台控制。

用户确认：
- 不做权限和角色。
- 不拆数据库。
- 不拆后端服务。
- 只拆系统入口和前端产品结构。

## 已保存的回滚点

拆分前已提交一次：

```bash
f4e640f docs: 保存用户手册v2.0当前版本
```

如果当前拆分方向需要大幅回退，可以回到这个提交点。

## 当前未提交改动

当前有一批前端系统拆分改动尚未提交，主要包括：

- 新增中控台：`/control-center`
- 新增系统入口：
  - `/selection`
  - `/seo`
  - `/ads`
  - `/operations`
- 新增系统功能页路径：
  - `/selection/products`
  - `/selection/library`
  - `/selection/xiaohongshu`
  - `/selection/facebook`
  - `/selection/suppliers`
  - `/seo/shopify-ai`
  - `/ads/gmc`
  - `/operations/shops`
  - `/operations/published`
- 旧路径保留 redirect：
  - `/dashboard`
  - `/products`
  - `/library`
  - `/shopify-ai`
  - `/gmc`
  - `/shops`
  - `/published`
  - `/agent`
- 全局左侧导航已从 `frontend/app/(dashboard)/layout.tsx` 移除。
- 新增系统内顶部横向导航：`frontend/components/layout/system-nav.tsx`
- 新增各系统 layout：
  - `frontend/app/(dashboard)/selection/layout.tsx`
  - `frontend/app/(dashboard)/seo/layout.tsx`
  - `frontend/app/(dashboard)/ads/layout.tsx`
  - `frontend/app/(dashboard)/operations/layout.tsx`

## 用户反馈和当前问题

第一版错误方向：
- 我最初做成了左侧系统分组菜单。
- 用户明确说不是这种效果。

用户真正想要：
- 左边导航不显示。
- 先进入中控台总览。
- 点对应模块，才进入对应系统。
- 进入系统后不能丢原功能入口。

第二版问题：
- 移除左侧导航后，很多原来的入口被藏起来了。
- 用户反馈：选品系统里原来那么多东西不见了，首页推荐、上架功能等看不到。

已补救：
- 给每个系统补了顶部横向系统内导航。
- 选品系统现在应有：选品总览、选品大厅、我的选品库、小红书/Instagram、FB广告库、供应商。
- 运营系统现在应有：运营总览、AI 运营工作台、我的店铺、上架历史。
- SEO 系统现在应有：SEO 总览、Shopify AI 优化。
- 广告系统现在应有：广告总览、Google 购物广告、FB 广告库。

用户进一步补充：
- 运营系统要加上社媒视频生成。
- 运营系统要加上社媒文案生成。
- 运营系统要加上我的店铺诊脉功能。

已调整：
- 将原 AI Agent 工作台从 `/control-center/agent` 移到 `/operations/agent`。
- `/agent` 和 `/control-center/agent` 保留 redirect 到 `/operations/agent`。
- 运营系统总览新增入口：店铺智能诊脉、社媒文案生成、社媒视频生成。
- 运营系统顶部导航新增：AI 运营工作台。

注意：这只是补救版，还需要用户确认 UI 和路径体验是否符合预期。

## 数据情况

用户问“我的数据为什么都没了”。

结论：
- 数据没有删。
- 本次只改前端路由和导航，没有动后端 API、数据库、迁移。
- 当时数据看起来没了，是因为前端启动了，但后端 `localhost:8000` 没启动。
- `frontend/.env.local` 里写了：

```env
NEXT_PUBLIC_API_BASE=http://localhost:8000/api/v1
```

所以本地必须启动后端。

已直连远程 MySQL 验证商品数据仍在：

- 总商品数：25206
- amazon：917
- etsy：3378
- facebook：175
- google：2972
- shopify：7344
- tiktok：10420

当前已启动过：
- 前端：`http://localhost:3000`
- 后端：`http://localhost:8000`

## 验证情况

系统拆分改动后执行过：

```bash
cd frontend
npm run build
```

结果：构建通过。

`npm run lint` 仍失败，但主要是项目原本存在的 ESLint 问题，例如：
- `any`
- `<img>`
- effect 里同步 setState
- 未转义引号

这些不是本次拆分造成的构建阻塞。

## 下次继续时建议

1. 先不要提交当前拆分改动。
2. 让用户确认当前“中控台 -> 系统总览 -> 系统内功能导航”的产品形态。
3. 如果用户仍觉得复杂，应考虑更接近“每个系统像独立应用”的方案：
   - 中控台只展示四个系统入口。
   - 每个系统页面顶部有系统名、返回中控台、功能导航。
   - 不出现全局大侧边栏。
   - 原功能不能隐藏。
   - 运营系统必须包含店铺诊脉、社媒文案、社媒视频、店铺管理、上架历史。
4. 确认后再提交拆分改动。
5. 如果要回退，使用提交 `f4e640f` 作为拆分前快照，但不要随意执行破坏性 git 命令。

## 2026-05-09 补充进度

今天新增确认了一个线上问题：不是后端挂掉，而是前端线上实际可访问路由与代码里大量链接不一致。

已确认的线上现状：
- `https://.../products`、`/library`、`/facebook`、`/xiaohongshu`、`/suppliers`、`/shops`、`/published`、`/gmc` 是线上实际可访问的顶层路径。
- `https://.../selection/products`、`/selection/library`、`/operations/shops`、`/operations/published`、`/ads/gmc` 等嵌套路由在线上会 404。
- 服务器本机验证过：
  - `http://127.0.0.1:8000/health` 返回 200
  - `http://127.0.0.1:8000/api/v1/products/recommendations` 返回 200
  - 所以后端 API 本身正常，404 不是 FastAPI 故障。

已做的临时线上兜底：
- 给站点 Nginx 增加了 rewrite 兼容，把旧路径永久跳转到当前真实可用路径：
  - `/selection/products` -> `/products`
  - `/selection/library` -> `/library`
  - `/selection/facebook` -> `/facebook`
  - `/selection/xiaohongshu` -> `/xiaohongshu`
  - `/selection/suppliers` -> `/suppliers`
  - `/operations/shops` -> `/shops`
  - `/operations/published` -> `/published`
  - `/ads/gmc` -> `/gmc`
- curl 验证结果已经是 301 跳转，不再直接 404。

本地代码层已开始修正，但还没收尾提交：
- 目标是把前端所有用户入口统一改到线上真实可用的顶层路由，不长期依赖 Nginx rewrite。
- 已经改动的方向：
  - 顶层 `/products`、`/library`、`/facebook`、`/xiaohongshu`、`/suppliers`、`/shops`、`/published`、`/gmc` 改为直接渲染真实页面，而不是再 redirect 去坏路由。
  - 侧边栏、搜索、商品卡片、中控台、Agent 任务卡片等入口开始从 `/selection/...`、`/operations/shops`、`/ads/gmc` 改到顶层路径。
- 这一轮代码还未重新 build、未提交、未推送。

下次继续时优先顺序：
1. 完成所有路由入口统一替换，补全遗漏页面。
2. 本地 `npm run build` 验证一次。
3. 提交一条专门的“路由统一 / 线上 404 修复” commit。
4. 部署后再把 Nginx rewrite 保留一段时间，作为兼容层。

## 2026-05-13 选品系统整改进度

本轮目标：
- 不直接替用户自动选品。
- 从全量商品池出发，先按专题展示候选商品，再允许用户一键入库。
- 给入库商品补上选品决策字段和编辑入口。

本轮已完成：

1. 后端选品决策字段接入
- `backend/app/models/product.py`
- `backend/app/schemas/product.py`
- `backend/app/api/v1/products.py`

已接入到 `user_products` 的核心字段包括：
- 标签：`season_tags`、`holiday_tags`、`audience_tags`、`scenario_tags`
- 专题与阶段：`weekly_campaign`、`event_window`、`selection_status`
- 判断：`selection_reason`、`selection_confidence`、`manual_review_flag`
- 刺绣适配：`embroidery_position`、`customization_type`、`embroidery_visibility`、`giftability`、`personalization_complexity`
- 内容与评分：`content_hook`、`visual_impact`、`video_potential`、`ugc_potential`、`trend_score`、`embroidery_fit_score`、`gift_score`、`campaign_score`、`final_selection_score`

2. 线上数据库已补字段
- 远程 MySQL 的 `user_products` 表已实际加上上述新列。
- 不是只改了 ORM；当前线上表结构已经能承接这些字段。

3. 选品接口已打通
- `/api/v1/products/library/list` 已返回选品字段
- `/api/v1/products/{id}` 详情已返回 `selection_meta`
- 新增 `PATCH /api/v1/products/{id}/selection-meta`
- `save` / `batch-save` 默认写入 `selection_status="candidate"`

4. 选品库页面已改成工作台
- 路径：`/selection/library`
- 已支持按 `selection_status` 和 `weekly_campaign` 筛选
- 商品卡片已显示状态和专题池标记

5. 商品详情页已增加选品决策面板
- 路径：`/selection/products/[id]`
- 可编辑并保存：
  - 专题池
  - 选品状态
  - 季节/节日/人群/场景标签
  - 刺绣位置
  - 定制类型
  - 选品理由
  - 内容切入口
  - 趋势分
  - 刺绣适配分

6. `/selection` 首页已改成专题候选池入口
- 不再是空入口页。
- 当前会从全量商品池拉取专题候选商品，再允许用户一键入库。
- 当前专题：
  - `Father's Day`
  - `Mother's Day`
  - `Graduation`
  - `Summer`
  - `Evergreen Gifts`
  - `Pet Keepsake`
- 每个专题已提供：
  - `查看更多`
  - `一键入库`

当前链路：
发现商品 -> 选择专题池/人群/场景 -> 加入候选 -> 进入选品库继续筛选

## 2026-05-13 第二天进度补充

今天对照《定制刺绣选品系统极致化本周计划》的“2026-05-13 周三：整改选品池结构”继续收口，当前这一天的目标已完成。

本轮新增完成：

1. 选品池规则收紧到周计划版本
- 本周专题池从之前的扩展版，收口为 4 个：
  - `Memorial Day`
  - `Father's Day`
  - `Graduation`
  - `Summer`
- 选品状态补齐为：
  - `pending`
  - `candidate`
  - `shortlisted`
  - `featured`
  - `rejected`

2. `/products` 入库流程完成闭环
- 单个商品点击 `+` 不再直接进入选品库。
- 会先弹出入库面板，要求补：
  - `weekly_campaign`
  - 至少 1 个 `audience_tags`
  - 至少 1 个 `scenario_tags`
- 批量加入选品库也改成同样流程，先统一填写，再批量入库。

3. `/selection` 专题候选池改成带默认信息入库
- `一键入库` 不再只是保存商品。
- 会按专题自动写入对应的默认专题池和基础标签，减少后续手工补录。

4. `/library` 更像筛货工作台
- 专题筛选只保留本周 4 个专题池。
- 状态筛选补上 `待筛选`。
- 对缺少核心信息的商品增加 `待补标签` 提示，便于后续继续清理。

5. 商品详情页规则与入库规则统一
- 商品详情里的选品决策保存前，也要求：
  - 必须有专题池
  - 必须至少有一个人群标签
  - 必须至少有一个场景标签

当前结果：
- `/products` 已从“看货页”升级成“初筛候选入口”
- `/library` 已从“收藏夹”升级成“候选筛选工作台”
- 商品进入选品库时已经带有最基本的选品结构，不再是无标签收藏

本地验证：
- `cd frontend && npm run build` 已通过

当前未提交：
- 第二天闭环改动目前只在本地工作区，尚未提交、尚未推送

下次继续建议：
1. 把今天这轮“第二天闭环”改动提交成单独 commit。
2. 部署到线上后，确认：
   - `/selection`
   - `/products`
   - `/library`
   三个页面的体验是否符合预期。
3. 然后进入周四任务：从候选商品里继续建立“重点款”判断流程。
- 全量商品池 -> 专题候选池 -> 一键入库 -> 选品库 -> 商品详情页补选品决策

7. 前端稳定性修复
- 修复了 `frontend/components/product/product-card.tsx` 里的嵌套链接问题，避免 hydration / DOM 报错。

本轮验证：
- `python3 -m compileall backend/app` 通过
- `cd frontend && npm run build` 通过

当前状态判断：
- 选品系统第 1 天任务可视为完成。
- 已完成“从全量商品池分类查看，再一键入库”的入口整改。
- 还未完成自动打标签、自动评分、批量状态流转等更深层自动化能力。

注意：
- 本轮改动尚未提交 git。
- 用户要求确认无误后再提交。
