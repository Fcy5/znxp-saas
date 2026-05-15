# 2026-05-13 每日汇报

## 一、今日目标

把选品系统从“能看商品”推进到“能生成本周候选、能自动评分、能看到本周选品结果”。

---

## 二、今日新增功能

### 1. 固定本周专题池

**需求背景**  
专题池命名不统一，影响本周目标收口和页面统计。

**新增内容**  
统一本周专题池为：
- Memorial Day
- Father's Day
- Graduation
- Summer

前后端已统一专题池和状态枚举，并增加接口校验。

**实际效果**  
- 非法专题值不能再写入
- `/selection`、选品库、商品详情的专题池口径一致

---

### 2. 新增选品评分服务

**需求背景**  
系统之前只有收藏和字段，没有真正的自动判断能力。

**新增内容**  
新增自动评分与理由生成，支持输出：
- `embroidery_fit_score`
- `trend_score`
- `gift_score`
- `campaign_score`
- `final_selection_score`
- `selection_reason`
- `recommended_status`

**实际效果**  
- 商品保存选品信息时会自动生成分数和理由
- 系统可以自动推荐进入候选、重点、主推

---

### 3. 打通选品保存链路

**需求背景**  
评分函数如果不接入真实接口，结果无法进入业务流程。

**新增内容**  
选品信息保存接口已接入自动评分逻辑，保存时自动回填分数、理由和推荐状态。

**实际效果**  
- 已通过真实接口验证
- 分数和理由已进入真实数据链路

---

### 4. 新增候选池与总览接口

**需求背景**  
`/selection` 首页之前靠前端拼数据，统计口径不稳定。

**新增内容**  
新增接口：
- `GET /api/v1/products/selection/candidate-pool`
- `GET /api/v1/products/selection/overview`

**实际效果**  
- 候选区有独立接口
- 首页状态统计、专题池进度、高分候选都由后端统一返回

---

### 5. 完成 `/selection` 第一版作战台

**需求背景**  
此前 `/selection` 更像入口页，不是实际工作台。

**新增内容**  
- 状态统计卡片
- 专题池进度区
- 高分候选区
- 生成本周候选按钮
- 选品库分数筛选

**实际效果**  
- `/selection` 已能作为本周选品作战台使用

---

### 6. 新增本周自动选品流程

**需求背景**  
必须真正跑出本周候选结果，不能只停留在页面和接口层。

**新增内容**  
新增接口：
- `POST /api/v1/products/selection/auto-curate`

支持：
- 按 4 个专题池各生成 15 个候选
- 自动补标签
- 自动评分
- 自动生成理由
- 自动分配状态

**实际效果**  
已实际跑出本周选品结果。

---

## 三、今日结果

| 指标 | 结果 |
| --- | --- |
| 候选款 | 60 |
| 重点款（shortlisted） | 12 |
| 主推款（featured） | 8 |
| 重点池合计（shortlisted + featured） | 20 |
| 专题池 | 4 |
| 每个专题池候选数 | 15 |

---

## 四、专题池分布

| 专题池 | 候选 | 重点 | 主推 | 合计 |
| --- | --- | --- | --- | --- |
| Memorial Day | 13 | 1 | 1 | 15 |
| Father's Day | 14 | 0 | 1 | 15 |
| Graduation | 2 | 9 | 4 | 15 |
| Summer | 11 | 2 | 2 | 15 |

---

## 五、验证结果

已验证通过：

- `GET /api/v1/products/selection/candidate-pool`
- `GET /api/v1/products/selection/overview`
- `POST /api/v1/products/selection/auto-curate`
- `PATCH /api/v1/products/{id}/selection-meta`
- `/selection`
- `/selection/library`

---

## 六、未完成项

- 候选池规则还不够精细，`Summer`、`Memorial Day` 仍有泛热品
- 缺少重点款人工复核和批量状态调整
- 评分逻辑仍是第一版

---

## 七、明日重点

1. 优化候选池召回质量  
2. 增加重点款人工复核与批量调整  
3. 继续优化评分准确度  
