# 2026-05-14 日报 A

## 一、今日目标

推进选品系统的数据规则层，把核心判断逻辑从写死代码推进到可配置、可复用的结构。

---

## 二、今日完成

### 1. 完成选品评分参数配置化

已将以下内容从业务逻辑中抽离：

- 评分权重
- 状态阈值
- 专题池默认配额
- 专题池覆盖配额

实际效果：

- 评分模型不再只能靠改业务函数调整
- 后续可以按配置调整权重和阈值
- 候选池容量不再只能写死 15

当前已配置化的核心参数包括：

- 评分权重
  - 刺绣适配：`0.30`
  - 热度：`0.22`
  - 礼物属性：`0.20`
  - 专题匹配：`0.13`
  - 利润：`0.15`
- 状态阈值
  - `featured = 78`
  - `shortlisted = 60`
  - `rejected = 35`
- 默认专题池目标配额
  - 每池 `15`

---

### 2. 完成专题池配额接入

当前自动选品和候选池接口，已经支持从配置读取专题池目标数量：

- `selection/auto-curate`
- `selection/candidate-pool`

当前默认值：

- Memorial Day：15
- Father's Day：15
- Graduation：15
- Summer：15

实际效果：

- 当前仍保持 `4 * 15 = 60`
- 后续若改专题数量或专题配额，不需要改主业务逻辑
- 后续可按专题单独覆盖，例如：
  - `Graduation = 20`
  - `Summer = 12`

---

### 3. 完成本周视图数据隔离

`library/list` 已新增本周视图过滤能力：

- `current_cycle_only=true`

实际效果：

- `/selection/library` 现在只展示本周选品视图
- 历史专题数据不会再干扰本周工作流
- 当前“本周视图”的口径是：
  - 只看 `Memorial Day / Father's Day / Graduation / Summer`
  - 不混入 `Mother's Day / Valentine's Day` 等历史专题残留

---

## 三、今日结果

当前系统仍能正常跑出本周数据：

| 指标 | 结果 |
| --- | --- |
| 本周候选 | 60 |
| 重点款 | 12 |
| 主推款 | 8 |
| 本周视图总数 | 60 |

---

## 四、验证结果

已验证通过：

- `POST /api/v1/products/selection/auto-curate`
- `GET /api/v1/products/selection/overview`
- `GET /api/v1/products/library/list?current_cycle_only=true`

---

## 五、当前待继续打磨

- `Summer / Memorial Day` 召回质量仍需继续优化
- 专题池配额虽然已配置化，但仍是固定目标值，不是动态配额策略
- 自动标签当前仍以规则初始化为主

---

## 六、今日结论

今天 A 线的核心进展是：  
把选品系统的核心策略层从“写死在逻辑里”推进到了“有配置入口、有配额入口、有本周视图隔离”的结构。
