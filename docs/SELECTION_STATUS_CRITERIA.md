# 选品状态标准说明

更新时间：2026-05-14

适用范围：当前定制刺绣选品系统的本周选品池。

本文档只说明 4 个核心状态：

- `candidate`
- `shortlisted`
- `featured`
- `rejected`

不讨论历史专题池、上架状态、供应链状态、广告投放状态。

---

## 一、文档目的

这份文档用于统一以下问题：

- 候选、重点、主推、淘汰分别是什么意思
- 系统当前按什么规则给商品打状态
- 人工看到某个状态后应该怎么处理
- 共同开发者和运营在讨论状态时使用同一套口径

---

## 二、当前状态体系总览

| 状态 | 中文定义 | 当前作用 |
| --- | --- | --- |
| `candidate` | 候选 | 已进入本周池子，但还没进入重点推进范围 |
| `shortlisted` | 重点 | 已进入本周重点池，值得重点复核和推进 |
| `featured` | 主推 | 本周最优先关注的头部商品 |
| `rejected` | 淘汰 | 当前不建议继续推进 |

这 4 个状态不是展示标签而已，而是选品系统当前的核心决策输出。

---

## 三、状态判定分两层

当前系统对商品状态的形成，分成两层：

### 1. 商品评分层

先根据商品本身的机会强弱，计算综合分：

- `embroidery_fit_score`：刺绣适配分
- `trend_score`：热度分
- `gift_score`：礼物属性分
- `campaign_score`：专题匹配分
- `profit_score`：利润分

当前综合分逻辑为：

```text
final_selection_score =
  embroidery_fit_score * 0.32 +
  trend_score * 0.26 +
  gift_score * 0.22 +
  campaign_score * 0.12 +
  profit_score * 0.8
```

### 2. 本周压缩层

在本周自动选品流程里，系统会先生成 60 个候选款，再做排序压缩：

- 总候选：60
- 重点池：20
- 主推池：8

所以最终状态不只是分数阈值，还会受到本周池内排序影响。

---

## 四、各状态标准

## 1. `candidate` 候选

### 业务定义

商品已经进入本周专题池，但当前还不够强，不属于优先推进对象。

### 当前系统判定

一般情况下，出现以下任意情形会落到 `candidate`：

- 综合分不低，但没有达到重点标准
- 商品和专题有一定相关性
- 有一定礼物属性或定制空间
- 但热度、利润、刺绣适配或竞争力不够突出

当前评分层中，通常是：

```text
35 <= final_selection_score < 60
=> candidate
```

但在本周自动选品里，`candidate` 还包含：

- 已经进入 60 个候选池
- 但排序没有进入前 20

### 当前页面意义

`candidate` 代表：

- 可以继续保留
- 可以人工补标签、补理由、补判断
- 但不应直接列入本周主推

### 人工处理动作

- 看图确认是否真的有刺绣改造空间
- 看是否有清晰人群和节日语义
- 判断是否需要升级为 `shortlisted`
- 若明显不适合，可改为 `rejected`

---

## 2. `shortlisted` 重点

### 业务定义

商品已经通过初筛，进入本周重点推进池。

### 当前系统判定

重点状态有两种来源：

#### 来源 A：评分达到重点标准

```text
final_selection_score >= 60
=> shortlisted
```

#### 来源 B：本周排序进入前 20

当前自动选品会：

1. 生成 60 个候选款
2. 按分数和相关性排序
3. 前 8 个设为 `featured`
4. 第 9 到第 20 个设为 `shortlisted`

所以当前的 `shortlisted` 可以理解为：

- 分数已经过线
- 本周相对排序进入重点范围

### 当前页面意义

`shortlisted` 代表：

- 值得重点复核
- 值得重点比较
- 值得补充选品理由、刺绣策略、节日表达方式

### 人工处理动作

- 检查刺绣位是否真的清晰
- 检查是否有足够差异化表达
- 检查是否适合升级为 `featured`
- 不合格则降回 `candidate` 或改为 `rejected`

---

## 3. `featured` 主推

### 业务定义

商品属于本周优先级最高的一批，适合作为主推候选。

### 当前系统判定

在评分层里，理论标准是：

```text
final_selection_score >= 78
且 manual_review_flag = false
=> featured
```

但当前本周自动选品逻辑中，实际更接近：

- 本周全池排序前 8
- 自动标记为 `featured`

所以现在的 `featured` 本质上表示：

- 本周头部商品
- 不是绝对终审结果
- 是当前自动系统判断下最值得优先关注的一组

### 当前页面意义

`featured` 代表：

- 进入本周主推区
- 优先展示在周看板
- 优先做进一步人工判断

### 人工处理动作

- 看是否真的适合作为本周头部商品
- 看是否存在明显泛热品误入
- 检查节日表达是否足够明确
- 检查是否适合后续进入上架测试或广告验证

---

## 4. `rejected` 淘汰

### 业务定义

商品当前不建议继续推进。

### 当前系统判定

评分层中的基础规则是：

```text
final_selection_score < 35
=> rejected
```

一般属于以下情况：

- 和本周专题关系弱
- 刺绣适配弱
- 礼物属性弱
- 热度弱且利润弱
- 更像泛商品，不像定制刺绣机会

### 当前页面意义

`rejected` 代表：

- 当前周期不继续推进
- 不进入重点池
- 不进入主推池

### 人工处理动作

- 一般不再继续花时间
- 除非人工判断系统误杀，否则不回拉
- 如需回拉，建议先补标签或补理由再重新评估

---

## 五、当前状态流转关系

当前推荐的状态流转是：

```text
candidate -> shortlisted -> featured
candidate -> rejected
shortlisted -> featured
shortlisted -> candidate
featured -> shortlisted
featured -> rejected
rejected -> candidate
```

说明：

- 允许人工回退
- 允许人工纠正自动判断
- `featured` 不是最终锁死状态

---

## 六、当前系统中的实际口径

为了避免沟通误差，当前项目内统一按下面的解释来理解：

| 状态 | 当前统一口径 |
| --- | --- |
| `candidate` | 已入池，但未进入本周重点推进范围 |
| `shortlisted` | 已进入本周重点池 |
| `featured` | 已进入本周头部主推池 |
| `rejected` | 本周不做 |

也就是说：

- `candidate` 不是没价值，而是暂未优先推进
- `shortlisted` 是重点关注对象
- `featured` 是本周头部对象
- `rejected` 是当前周期放弃对象

---

## 七、当前版本的已知局限

这套状态体系现在已经能跑通，但还不是最终版。

当前已知问题：

1. `featured` 目前仍有“本周排序前 8”的成分，不完全等于终审主推
2. 某些专题池仍可能混入泛热品
3. `manual_review_flag` 仍需要进一步和状态流转联动
4. `Summer`、`Memorial Day` 的召回质量还需要继续优化

所以当前状态建议理解为：

- 已可作为工作流状态使用
- 已可用于周看板和选品推进
- 但仍需要人工复核，不应直接等同于最终商业结论

---

## 八、建议的人工使用规则

为了让团队使用一致，建议按下面执行：

### `candidate`

- 默认先看
- 不急着做主推
- 优先补标签和刺绣判断

### `shortlisted`

- 必须复核
- 必须补充明确选品理由
- 必须做同专题对比

### `featured`

- 必须人工确认
- 必须检查是否有泛热品误入
- 必须确认它能代表本周主推逻辑

### `rejected`

- 默认不继续投入
- 除非有明确证据说明系统误判

---

## 九、当前代码对应位置

状态相关逻辑当前主要在以下文件：

- [backend/app/services/selection_scoring.py](/Users/lishidi/Desktop/项目/znxp-saas/backend/app/services/selection_scoring.py)
- [backend/app/api/v1/products.py](/Users/lishidi/Desktop/项目/znxp-saas/backend/app/api/v1/products.py)
- [frontend/app/(dashboard)/selection/page.tsx](/Users/lishidi/Desktop/项目/znxp-saas/frontend/app/(dashboard)/selection/page.tsx)
- [frontend/app/(dashboard)/selection/library/page.tsx](/Users/lishidi/Desktop/项目/znxp-saas/frontend/app/(dashboard)/selection/library/page.tsx)

---

## 十、最终结论

当前 4 个状态的本质是：

- `candidate`：可留
- `shortlisted`：值得重点推进
- `featured`：本周优先主推
- `rejected`：本周不做

其中：

- 评分逻辑负责判断商品值不值得做
- 本周压缩逻辑负责决定它在 60 -> 20 -> 8 中所处的位置

所以这 4 个状态，既是评分结果，也是当前周选品工作流的阶段标记。
