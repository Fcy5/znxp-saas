# Product Graph 数据模型设计

生成日期：2026-05-12

目标：把当前分散的商品、平台来源、广告、供应商、销售结果统一到“商品机会实体”上，为后续评分、情报页、利润和 Launch 闭环打基础。

## 设计原则

1. `product_entities` 是统一商品机会，不等于某个平台上的单个商品。
2. `product_sources` 保存各平台原始商品。
3. `product_signals` 保存随时间变化的信号。
4. `score_evidence` 保存评分证据，让推荐可解释。
5. 当前 `products` 表先保留，作为第一批 source 数据。

## 核心表

### product_entities

统一商品机会表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint | 主键 |
| canonical_title | varchar(500) | 统一标题 |
| normalized_title | varchar(500) | 规范化标题，用于匹配 |
| category | varchar(100) | 统一类目 |
| primary_image | varchar(1000) | 主图 |
| description | text | 摘要描述 |
| status | varchar(50) | active / watching / archived |
| first_seen_at | datetime | 首次发现时间 |
| last_seen_at | datetime | 最近更新时间 |
| source_count | int | 来源数量 |
| confidence | float | 实体归并置信度 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |
| is_deleted | bool | 软删除 |

索引：

- `normalized_title`
- `category`
- `status`
- `last_seen_at`

### product_sources

各平台原始商品来源表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint | 主键 |
| entity_id | bigint | 关联 `product_entities.id` |
| source_platform | varchar(50) | amazon / etsy / shopify / tiktok / facebook / xiaohongshu / gmc / supplier |
| source_id | varchar(255) | 平台原始 ID |
| source_url | varchar(1000) | 来源 URL |
| title | varchar(500) | 原始标题 |
| description | text | 原始描述 |
| image_url | varchar(1000) | 原始主图 |
| price | numeric | 当前价格 |
| currency | varchar(20) | 币种 |
| brand | varchar(255) | 品牌 |
| category | varchar(100) | 原始类目 |
| raw_payload | jsonb | 原始数据 |
| confidence | float | 与实体匹配置信度 |
| fetched_at | datetime | 抓取时间 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

索引：

- `(source_platform, source_id)`
- `entity_id`
- `source_url`
- `fetched_at`

### product_signals

商品信号时间序列表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint | 主键 |
| entity_id | bigint | 关联商品实体 |
| source_id | bigint nullable | 可选关联 source |
| source_platform | varchar(50) | 信号来源 |
| metric_name | varchar(100) | 指标名 |
| metric_value | numeric | 指标值 |
| metric_unit | varchar(50) | 单位 |
| window | varchar(50) | realtime / daily / weekly / monthly |
| country | varchar(20) | 国家 |
| raw_payload | jsonb | 原始数据 |
| confidence | float | 置信度 |
| captured_at | datetime | 信号时间 |
| created_at | datetime | 写入时间 |

指标示例：

- `search_volume`
- `review_count`
- `review_score`
- `facebook_ad_count`
- `tiktok_views`
- `xhs_likes`
- `price`
- `sales_rank`
- `shopify_orders`
- `refund_rate`
- `supplier_cost`

索引：

- `(entity_id, metric_name, captured_at)`
- `(source_platform, metric_name)`
- `captured_at`

### opportunity_scores

商品机会评分表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint | 主键 |
| entity_id | bigint | 商品实体 |
| score_version | varchar(50) | 评分版本，例如 v3 |
| total_score | float | 总分 |
| demand_score | float | 需求分 |
| growth_score | float | 增长分 |
| competition_score | float | 竞争分 |
| profit_score | float | 利润分 |
| supply_score | float | 供应链分 |
| creative_score | float | 内容分 |
| store_fit_score | float | 店铺适配分 |
| launch_score | float | Launch 就绪分 |
| risk_penalty | float | 风险扣分 |
| recommended_action | varchar(50) | observe / validate / source / launch / test / scale / kill |
| summary | text | 评分摘要 |
| input_snapshot | jsonb | 输入快照 |
| created_at | datetime | 创建时间 |

索引：

- `(entity_id, score_version, created_at)`
- `total_score`
- `recommended_action`

### score_evidence

评分证据表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint | 主键 |
| score_id | bigint | 关联 `opportunity_scores.id` |
| entity_id | bigint | 商品实体 |
| dimension | varchar(50) | demand / growth / competition / profit / supply / creative / store_fit / launch / risk |
| evidence_type | varchar(100) | metric / source / trend / rule / ai |
| title | varchar(255) | 证据标题 |
| detail | text | 证据说明 |
| value | numeric nullable | 证据数值 |
| source_url | varchar(1000) nullable | 来源 URL |
| confidence | float | 置信度 |
| created_at | datetime | 创建时间 |

索引：

- `score_id`
- `(entity_id, dimension)`

## 回填策略

第一版从现有 `products` 表回填：

1. 每条 `products` 记录先生成一个 `product_entities`。
2. `products.title` -> `canonical_title`。
3. 规范化标题生成 `normalized_title`。
4. `products.source_platform/source_id/source_url` -> `product_sources`。
5. `review_count/review_score/tiktok_views/facebook_ad_count/gmc_search_volume/price/sales_trend` -> `product_signals`。

后续再做同款归并，不在第一版强行合并。

## 第一版不做

- 不做复杂 embedding 归并。
- 不做向量数据库。
- 不删除现有 `products` 表。
- 不重构所有已有 API。

第一版目标是建立新模型并兼容旧系统。

