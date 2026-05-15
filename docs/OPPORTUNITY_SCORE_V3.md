# Opportunity Score 3.0 评分模型

生成日期：2026-05-12

目标：把商品推荐从“热度排序”升级为“可解释的商业机会判断”。

## 总分公式

```text
Ultimate Opportunity Score =
  demand_score      * 0.18
+ growth_score      * 0.14
+ competition_score * 0.12
+ profit_score      * 0.16
+ supply_score      * 0.12
+ creative_score    * 0.10
+ store_fit_score   * 0.10
+ launch_score      * 0.08
- risk_penalty
```

分数范围：

- 每个维度：0-100
- 风险扣分：0-40
- 最终分：0-100，低于 0 按 0，超过 100 按 100

## 维度定义

### demand_score

判断：有没有真实需求。

输入：

- review_count
- review_score
- gmc_search_volume
- tiktok_views
- xhs_likes
- shopify_orders
- source_count

兜底：

- 没有搜索和订单数据时，用评论、社媒、广告数代理。

证据示例：

- “TikTok 播放量超过 300 万”
- “评论数 6000+，评分 4.7”
- “Google Merchant 搜索量 4.9 万”

### growth_score

判断：是不是正在变热。

输入：

- sales_trend
- 7/14/30 天信号增长
- 新增广告数
- 新增竞品数
- 新增社媒内容数

兜底：

- 没有时间线时，用 `sales_trend` 和最近抓取时间。

证据示例：

- “近 30 天销售趋势 +67%”
- “过去 7 天新增 12 条广告”

### competition_score

判断：竞争是否可进入。

注意：竞争分越高代表越适合进入，不是竞争越强分越高。

输入：

- 同款 source_count
- facebook_ad_count
- competitor_store_count
- price_spread
- top_seller_concentration

兜底：

- 第一版用广告数和来源数估算。

规则：

- 广告数为 0：商业验证不足，分数中等偏低。
- 广告数 3-30：有验证且未过热，分数较高。
- 广告数 100+：可能竞争过强，分数下降。

### profit_score

判断：能不能赚钱。

输入：

- selling_price
- supplier_cost
- shipping_cost
- platform_fee
- payment_fee
- expected_cpa
- refund_rate
- gross_margin
- contribution_margin
- breakeven_roas

兜底：

- 没有供应商成本时，用类目默认成本率估算，并降低置信度。

证据示例：

- “按当前报价，预计毛利率 62%”
- “保本 ROAS 1.7，适合广告测试”

### supply_score

判断：能不能稳定供货。

输入：

- supplier_count
- MOQ
- lead_time_days
- supplier_rating
- sample_status
- customization_available

兜底：

- 没有供应商时，分数不应超过 50。

证据示例：

- “已有 3 个候选供应商”
- “MOQ 低于 50，适合小批量测试”

### creative_score

判断：适不适合内容传播。

输入：

- tiktok_views
- xhs_likes
- creative_asset_count
- hook_count
- visual_demo_score
- emotional_value_score

兜底：

- 没有素材数据时，用类目和社媒热度估算。

证据示例：

- “已有多条短视频素材验证”
- “适合前后对比、开箱、定制过程内容”

### store_fit_score

判断：适不适合当前店铺。

输入：

- shop_category_match
- shop_price_band_match
- historical_winner_similarity
- historical_failed_similarity
- target_margin_match
- shipping_time_match
- blocked_category_match

兜底：

- 没有店铺画像时，默认 50，并提示需要完善画像。

证据示例：

- “价格带与店铺历史爆品接近”
- “类目与当前店铺主营不匹配”

### launch_score

判断：是否适合立刻测试。

输入：

- has_supplier
- has_profit_model
- has_creative_brief
- has_low_risk
- has_listing_content
- has_target_shop

兜底：

- 缺供应商或利润模型时，不超过 60。

证据示例：

- “已有供应商和利润模型，可进入测试”
- “缺少素材和供应商，不建议立即上架”

### risk_penalty

判断：硬风险扣分。

输入：

- trademark_risk
- prohibited_category
- image_copyright_risk
- logistics_risk
- seasonal_risk
- quality_complaint_risk
- price_war_risk

扣分建议：

- 低风险：0-5
- 中风险：6-18
- 高风险：19-40

## 推荐动作规则

| 条件 | recommended_action |
| --- | --- |
| total_score >= 82 且 risk_penalty <= 8 且 launch_score >= 70 | test |
| total_score >= 75 且 supply_score < 60 | source |
| total_score >= 70 且 profit_score < 60 | validate |
| total_score >= 65 且 growth_score >= 70 | observe |
| risk_penalty >= 25 | kill |
| profit_score >= 75 且已有测试正反馈 | scale |
| 其他 | validate |

## 证据结构

每个评分必须至少返回：

```json
{
  "dimension": "demand",
  "evidence_type": "metric",
  "title": "TikTok 热度较高",
  "detail": "该商品相关视频播放量超过 300 万，说明内容侧存在需求。",
  "value": 3000000,
  "source_url": null,
  "confidence": 0.75
}
```

## 第一版实现建议

第一版不要等待所有数据源完整接入。可以用现有字段先跑：

| 当前字段 | 映射维度 |
| --- | --- |
| `review_count` | demand |
| `review_score` | demand |
| `sales_trend` | growth |
| `tiktok_views` | demand / creative |
| `facebook_ad_count` | competition / growth |
| `gmc_search_volume` | demand |
| `profit_margin_estimate` | profit |
| `ai_score` | 辅助参考，不直接替代总分 |
| `source_platform` | source diversity |
| `price` | profit / price band |

## 验收标准

- 每个推荐商品都有 8 维评分。
- 每个维度都有证据或缺数据说明。
- 总分排序能替换当前推荐排序。
- 高风险商品不会无解释排到前列。
- 缺数据商品会降低置信度，而不是伪装成高确定性。

