# 号池监控 - SMSBower 分类增强规格文档

> 当前阶段：**方案已确认，可进入实现**
> 背景：SMSBower 号池监控目前只有平铺列表，缺少 SMSPool 侧已有的「符合策略 / 已屏蔽」分类和摘要汇总。本文档记录对齐方案。

---

## 一、现状与问题

### SMSPool（已有）
- 返回带策略状态的国家列表：`blocked`、`qualifies`、`strategyRank`
- 摘要卡片：当前策略 / 可用国家数 / 符合策略数 / 已屏蔽数 / 优选前 3
- Tab 切换：全部 / 符合策略 / 已屏蔽

### SMSBower（现状）
- 后端只做过滤（stock < 10 丢弃）+ 排序（Gold→Silver→Bronze），返回原始 `positions[]`
- 前端 `BowerTable` 是纯平铺表，无摘要、无 Tab、无策略状态
- 返回的 `service` 对象不含 `maxPrice`、`blockedCountries` 等策略字段

---

## 二、SMSBower 的特殊性

| 特性 | SMSPool | SMSBower |
|---|---|---|
| 每国行数 | 1 条 | 可能多条（不同 rank / 价格） |
| 质量指标 | `successRate`（数值） | `rank`（Gold / Silver / Bronze） |
| successRate | 有实际数值 | **永远为 0**（内部 API 和 V3 均不提供数值） |
| 数据来源 | 单一 API | 内部 API（优先）/ 官方 V3（降级兜底） |
| shortName 格式 | ISO 码 | 内部 API：ISO 码；V3 降级：bower key（如 `usa`） |

---

## 三、方案设计

### 3.1 Position 合并规则

同一国家、同等级、同价格的多条 position → 合并为 1 条：
- `stock`：加总
- `agentIds`：合并去重
- 其余字段取第一条

不同 rank 或不同价格 → 保留为独立行（展示为多行）。

合并后每行有明确的 `(country, rank, price)`，可单独计算策略状态。

### 3.2 「符合策略」定义

SMSBower 的 `successRate` 永远为 0，**不参与策略判断**。

| 状态 | 条件 |
|---|---|
| 已屏蔽 | 国家 ISO 码在 `blockedCountries` 中 |
| 符合策略 | 未屏蔽 + rank 为 Gold 或 Silver + `price ≤ maxPrice` |
| 不符合策略 | Bronze，或价格超限（未屏蔽） |

> Bronze 在监控中标记为「不符合策略」，但**下单时仍作为兜底**使用（选项 A）。
> 这样做的原因：用户拿到 Bronze 号质量偏低但能完成验证，优于直接报错。
> 如果某国 Bronze 持续质量差，可通过 `blockedCountries` 精准屏蔽该国。

### 3.3 摘要汇总（唯一国家粒度）

所有计数均以**唯一国家**为单位，不以行数计。

| 指标 | 说明 |
|---|---|
| 可用国家 | stock ≥ 10 的唯一国家总数 |
| 符合策略 | 有至少 1 行符合策略的唯一国家数 |
| 已屏蔽 | 在 `blockedCountries` 中的唯一国家数 |
| 优选前 3 | 符合策略的国家中，取该国最高 rank 行的价格排序，取前 3 |

> 摘要按国家计，Tab 里仍按行展示（一国多行照常显示）。数字解读：「5 个国家符合策略」，Tab 里可能看到超过 5 行（因同一国家可能有多个符合的 rank）。

### 3.4 「当前策略」卡片内容

SMSBower 侧不展示成功率阈值（因为该字段对 SMSBower 无意义），只展示有效数据：

```
当前策略
等级  Gold / Silver
价格  ≤ $X.XX
```

### 3.5 已屏蔽国家匹配

`blockedCountries` 存储 ISO 码（如 `US`、`RU`）。

- 内部 API 的 `shortName` 是 ISO 码 → 直接大写匹配
- V3 降级的 `shortName` 是 bower key（如 `usa`）→ 需反向映射：bower key → ISO 码

需在 `smsbower.ts` 中补充 `bowerKeyToIso` 映射（复用现有 `isoToSmsBowerKey` 反转）。

### 3.6 「全部」Tab 排序

保持现有逻辑：Gold → Silver → Bronze → successRate↓ → price↑ → stock↓

### 3.7 V3 降级提示

当数据来自官方 V3 降级路径时（内部 API 不可用），在 admin 端显示 banner 提示：

> 当前数据来自降级路径（V3），交付率不可用

此提示**仅在 admin 端展示**，不影响用户端。

### 3.8 rank 信息可见范围

Gold / Silver / Bronze 等级信息**仅在 admin 端展示**，用户端（`apps/web`）不做任何变更。

---

## 四、改动范围

### 后端：`apps/api/src/routes/pool.ts`

SMSBower 分支新增：
1. 查询 `maxPrice`、`blockedCountries` 并加入返回的 `service` 对象
2. positions 合并逻辑（同国 + 同 rank + 同价格 → 合并）
3. 每行计算 `blocked`、`qualifies`
4. 计算 `summary`（唯一国家粒度）
5. 标记数据来源（`dataSource: 'internal' | 'v3'`）供前端判断是否展示降级 banner

### 后端：`apps/api/src/adapters/smsbower.ts`

1. 补充 `bowerKeyToIso` 反向映射（约 20 条）
2. `getPoolStatus` 返回值新增 `dataSource` 字段标识数据来源

### 前端类型：`apps/admin/src/lib/api.ts`

`PoolStatusResult` smsbower 分支：
- `service` 补充 `maxPrice`、`blockedCountries`
- `BowerPosition` 补充 `blocked`、`qualifies` 字段
- 顶层补充 `summary`、`dataSource` 字段

### 前端视图：`apps/admin/src/pages/PoolMonitor.tsx`

新增 `BowerView` 组件（替换现有 `BowerTable`），包含：
- 摘要卡片（当前策略 / 可用国家 / 符合策略 / 已屏蔽 / 优选前 3）
- V3 降级 banner（条件显示）
- Tab 切换（全部 / 符合策略 / 已屏蔽）
- 表格新增「策略状态」列（已屏蔽 / 符合策略 / 不符合策略 + Bronze 标注）

---

## 五、不改动的部分

| 项目 | 原因 |
|---|---|
| `apps/web` 全部 | rank 信息不对用户暴露，下单逻辑不变 |
| SMSPool 分支逻辑 | 独立分支，本次不涉及 |
| `blockedCountries` 输入格式 | 继续使用 ISO 码，后端做 bowerKey 适配 |
| stock < 10 过滤门槛 | 保留现有逻辑 |
| Bronze 下单行为 | 仍作为兜底，不修改 `orderNumber` 方法 |
