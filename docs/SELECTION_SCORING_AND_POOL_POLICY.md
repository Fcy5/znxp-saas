# 选品评分与候选池策略说明

更新时间：2026-05-14

适用范围：当前定制刺绣选品系统的自动评分、标签初始化和本周候选池生成。

## 一、文档目的

这份文档专门回答 3 个核心问题：

1. `embroidery_fit_score / trend_score / gift_score / campaign_score` 如何合成 `final_selection_score`
2. 自动标签从哪里来，是规则还是模型
3. 每个专题池为什么默认是 15 个候选，后续如何扩展

本文档只讨论当前版本已经落地的规则，不虚构还没上线的能力。

## 二、当前评分不是黑箱

当前 `final_selection_score` 是明确的加权评分，不是简单相加。

代码位置：

- [backend/app/services/selection_scoring.py](/Users/lishidi/Desktop/项目/znxp-saas/backend/app/services/selection_scoring.py)
- [backend/app/core/selection_config.py](/Users/lishidi/Desktop/项目/znxp-saas/backend/app/core/selection_config.py)
- [backend/app/core/config.py](/Users/lishidi/Desktop/项目/znxp-saas/backend/app/core/config.py)

### 当前公式

```text
final_selection_score =
  embroidery_fit_score * 0.30 +
  trend_score * 0.22 +
  gift_score * 0.20 +
  campaign_score * 0.13 +
  profit_score * 0.15
```

当前权重之和固定为 `1.00`。

### 当前权重配置来源

当前权重不是写死在业务函数里，而是来自配置层：

- `selection_weight_embroidery`
- `selection_weight_trend`
- `selection_weight_gift`
- `selection_weight_campaign`
- `selection_weight_profit`

### 当前权重为什么这样定

这是当前版本的第一版业务权重，不是数据回归权重。

当前口径：

- `embroidery_fit_score = 30%`
  因为系统是定制刺绣选品系统，商品是否适合做刺绣改造，是最核心前提。

- `trend_score = 22%`
  因为有热度和传播信号的商品，更适合进入测试和周池优先级排序。

- `gift_score = 20%`
  因为礼物属性、人群清晰度、价格带，会直接影响节日型商品转化。

- `campaign_score = 13%`
  因为是否匹配本周专题，会影响它能否进入本周承接场景。

- `profit_score = 15%`
  因为利润是商业结果必须纳入的约束条件，但不希望它单独压过“刺绣适配”和“礼物表达”。

### 当前结论

这套权重是：

- 可解释的
- 可配置的
- 但还不是数据校准后的最终商业权重

后续应继续通过人工复核结果、实际上架结果、点击/收藏/出单结果做权重校准。

## 三、各评分维度的业务定义

### 1. `embroidery_fit_score`

表示商品是否适合改造成定制刺绣商品。

主要看：

- 是否有明确刺绣载体
- 是否有定制信号
- 是否适合名字、称呼、纪念表达
- 是否有足够视觉承载空间

### 2. `trend_score`

表示商品当前是否存在热度和传播势能。

主要看：

- TikTok 播放
- Facebook 广告数量
- 评论量
- 销售趋势
- AI 评分

### 3. `gift_score`

表示商品是否像一个好卖的礼物。

主要看：

- 礼物语义
- 目标人群是否清晰
- 使用场景是否清晰
- 价格是否在甜区
- 利润是否健康

### 4. `campaign_score`

表示商品和本周专题池是否匹配。

本周专题池包括：

- `Memorial Day`
- `Father's Day`
- `Graduation`
- `Summer`

主要看：

- 标题/描述中的专题关键词
- 是否有专题相关人群
- 是否有专题相关礼物语义

### 5. `profit_score`

表示商品利润空间是否足够支撑进入重点池。

当前利润分不是直接拿利润率原值，而是映射成区间分：

| 利润率 | profit_score |
| --- | --- |
| `>= 60%` | 95 |
| `>= 50%` | 82 |
| `>= 40%` | 68 |
| `>= 30%` | 52 |
| `< 30%` | 30 |

## 四、状态阈值也已配置化

当前状态阈值来自配置：

- `selection_threshold_featured`
- `selection_threshold_shortlisted`
- `selection_threshold_rejected`

当前默认值：

| 状态阈值 | 当前值 |
| --- | --- |
| `featured` | 78 |
| `shortlisted` | 60 |
| `rejected` | 35 |

含义：

- `>= 78` 且不需要人工复核，可进入 `featured`
- `>= 60` 可进入 `shortlisted`
- `< 35` 进入 `rejected`
- 中间区域为 `candidate`

## 五、自动标签目前不是 NLP 抽取

当前“自动补标签”更准确的说法是：

**规则驱动的标签初始化**

而不是成熟的 NLP/LLM 标签抽取系统。

### 当前标签来源

当前标签主要来自两部分：

#### 1. 专题默认标签

例如：

- `Father's Day`
  - `audience_tags = ["dad", "family", "gift_buyer"]`
  - `scenario_tags = ["gift", "family", "bbq"]`

- `Graduation`
  - `audience_tags = ["graduate", "family", "gift_buyer"]`
  - `scenario_tags = ["gift", "school", "celebration"]`

#### 2. 专题关键词和候选规则

例如：

- 商品文本里是否命中 `father / dad / graduation / memorial / summer`
- 是否带有 `custom / personalized / name / photo / keepsake`

### 当前没有做到的事

当前系统还没有正式上线这些能力：

- 全量 NLP 标签抽取
- LLM 结构化标签归类
- 标签准确率评估体系
- 标签人工标注基准集

### 当前准确率结论

当前没有正式的准确率数字。

原因是：

- 还没建立人工标注集
- 还没做 precision / recall 评估
- 现在只能说它是“初始化标签规则”，不能说它是“高准确率自动标签”

## 六、为什么每个专题池默认是 15 个候选

当前每池 15 个，不是技术图省事，也不是随机数。

它来自当前周运营目标：

```text
4 个专题池 * 15 个候选 = 60 个候选
60 个候选 -> 压缩成 20 个重点 -> 压缩成 8 个主推
```

所以当前 `15` 的来源是：

- 本周工作流设计
- 周运营节奏
- 人工复核负载可控

它是业务配额，不是算法自然最优数。

## 七、15 个候选已经改成可配置

当前不再把 `15` 硬编码在业务逻辑里。

现在已经抽成配置项：

- `selection_default_campaign_target`
- `selection_campaign_quota_overrides`

### 默认配额

```text
selection_default_campaign_target = 15
```

表示：

- 如果没有专题单独配置，就默认每池 15 个

### 覆盖配额

```json
{"Graduation": 20, "Summer": 12}
```

表示：

- `Graduation` 抓 20 个
- `Summer` 抓 12 个
- 其他专题继续走默认值

### 当前结论

这意味着：

- 以后专题池数量变了，不需要改业务代码
- 以后每个专题池容量不同，也不需要改业务代码
- 只需要调整配置

## 八、当前版本统一口径

### 关于评分

不要说：

- 系统自动黑箱判断

应该说：

- 系统按可解释的加权评分模型计算 `final_selection_score`
- 当前权重是第一版业务权重，已配置化，可持续校准

### 关于标签

不要说：

- 系统已经实现智能高准确率自动标签

应该说：

- 系统当前实现的是规则驱动的标签初始化
- 仍需人工修正
- 暂无正式准确率评估值

### 关于 15 个候选

不要说：

- 技术上默认写 15 个，先这样用

应该说：

- 当前每池 15 个来自本周业务配额设计
- 且已支持配置化，后续可按专题差异调整

## 九、最终结论

当前这三件事已经明确：

1. `final_selection_score` 是加权评分
2. 当前标签来源是规则初始化，不是成熟 NLP 抽取
3. 每池 15 个候选是业务配额，并且现在已经做成可配置

因此，当前系统虽然仍在第一版阶段，但在以下三个关键问题上已经不再是黑箱：

- 权重来源
- 标签来源
- 候选池容量来源
