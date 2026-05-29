# SMS CDK 兑换系统 — 需求文档

## 一、项目概述

用户通过 CDK 兑换码获取一次性手机号码，用于接收指定平台的短信验证码。系统由用户前端页面和管理后台两部分组成，底层对接多个 SMS 平台（统称"运营商"）。

**已接入 / 计划接入的运营商：**

| 内部标识（slug） | 对外别名 | 状态 |
|----------------|---------|------|
| `smspool` | 运营商 A（示例） | 已上线 |
| `smsbower` | 运营商 B（示例） | 开发中 |

> **隐私原则**：C 端用户（web 页面）不会看到任何第三方平台的真实名称、域名或接口信息。所有对外展示均使用管理员配置的别名（alias）。

---

## 二、核心数据模型

```
Provider（运营商，对应一个 SMS 平台）
  └── Service（该运营商对某 ServiceCategory 的具体实现）

ServiceCategory（平台无关的服务类型，如"OpenAI 验证码"）
  └── Service（一个 Category 可有多个 Service，每个绑定不同 Provider）

CDK（兑换码，绑定 ServiceCategory + 可选 countryCode）
  └── Order（每次兑换的订单，下单时绑定具体 Service）
        └── OrderSms（每条收到的短信记录，一个 Order 可有多条）
```

**与旧模型的关键变化：**
- 旧：CDK → Service（含平台信息）
- 新：CDK → ServiceCategory（平台无关），下单时用户选择 Service（即选择运营商）

---

## 三、核心流程

### SMSPool（当前平台）

```
用户输入 CDK
  → 验证 CDK，返回服务信息 + 可用运营商列表
  → 用户确认（可选择运营商，默认使用推荐的）
  → 后端取号
  → 前端轮询短信状态（每 5 秒）
  → 收到短信 → 显示验证码 → CDK 扣 1 次 → 结束
  → 超时 → CDK 不扣次数 → 可重新取号（可换运营商重试）
```

### SMSBower（新平台，有差异）

```
用户输入 CDK
  → 验证 CDK，返回服务信息 + 可用运营商列表
  → 用户确认（可选择运营商）
  → 后端取号
  → 前端轮询短信状态
  → 收到短信（received 状态）→ 显示验证码 → CDK 扣 1 次
        ├── CDK 还有剩余次数（canRetry=true）→ 显示倒计时 + 【再发一条】+ 【完成】
        │       → 点击再发一条 → setStatus=3 → 重新等待 → 再收到 → 再扣 1 次
        │       → 点击完成 / 倒计时归零 → setStatus=6 → 结束
        └── CDK 用完（canRetry=false）→ 显示【再次兑换】，无倒计时显示
                → 点击再次兑换 → 静默 setStatus=6 → 回到首页重新兑换
                → 用户未操作 → 后台倒计时兜底 → setStatus=6 → 结束
  → 超时 → CDK 不扣次数 → 可重新取号（可换运营商重试）
```

**两平台关键差异：**

| 特性 | SMSPool | SMSBower |
|------|---------|----------|
| CDK 扣减时机 | 收到短信后自动完成 | 每次收到短信（received）扣 1 次 |
| 再次接收短信 | 不支持 | 支持（同一激活免费，setStatus=3） |
| 完成激活确认 | 无需 | 需调 setStatus=6，否则激活挂起 |
| 取消订单 | POST /sms/cancel | setStatus=8（购买 2 分钟后才可取消） |

---

## 四、用户侧功能（web 页面，对外开放）

### 4.1 步骤状态机

**SMSPool：**
```
input → confirm → waiting → success
                          → timeout  → confirm（可换运营商重试）
                          → cancel   → confirm（取消，冷却 2 分钟后可操作）
                          → change   → waiting（换号，同 orderId，changeCount+1，最多 2 次）
        error（CDK 无效或已用完）
```

**SMSBower（新增 received 中间态）：**
```
input → confirm → waiting → received → waiting（点再发一条，canRetry=true）
                                     → success（点完成 / 倒计时归零，canRetry=true）
                                     → input（点再次兑换，canRetry=false，后台静默完成）
                          → timeout  → confirm（可换运营商重试）
                          → cancel   → confirm（取消，冷却 2 分钟后可操作）
                          → change   → waiting（换号，同 orderId，changeCount+1，最多 2 次）
        error
```

### 4.2 各步骤说明

| 步骤 | 说明 |
|------|------|
| input | 用户输入 CDK，实时格式校验 |
| confirm | 显示服务名、剩余次数、国家限制（若有）、运营商选择 |
| waiting | 显示手机号、倒计时，每 5 秒轮询 |
| received | **SMSBower 独有**：显示验证码；canRetry=true 时显示倒计时 + 【再发一条】+ 【完成】；canRetry=false 时仅显示【再次兑换】 |
| success | 显示验证码，流程结束 |
| timeout | 超时提示，CDK 不扣次数，可重试 |
| error | CDK 无效或已用完 |

### 4.3 运营商选择（confirm 步骤）

```
┌──────────────────────────────────────┐
│  OpenAI 验证码                        │
│  剩余可用：3 次                        │
│  号码国家：🇺🇸 美国（若为国家专属 CDK）  │
│                                      │
│  运营商：  [运营商 A ⭐推荐  ▼]         │
│             ○ 运营商 B（库存不足，灰色）│
│                                      │
│              [确认取号]                │
└──────────────────────────────────────┘
```

- 默认选中 admin 配置的推荐运营商
- 对于国家专属 CDK，无该国库存的运营商自动置灰不可选
- 大多数用户直接点确认，无需关注运营商选择

### 4.4 切换运营商（waiting / timeout 步骤）

用户在等待过程中可切换运营商：
1. 前端调取消接口，旧订单标记为 `cancelled`，`cancelledReason = "用户切换运营商"`
2. 前端回到 confirm 步骤，用户选新运营商，创建新订单
3. 新订单记录 `fromOrderId`，指向被取消的旧订单，方便 admin 追踪切换链路

### 4.5 取消取号（waiting 步骤）

用户在等待阶段可主动放弃本次取号：

- 点击【取消】→ 后端调 `cancelOrder`（SMSBower: setStatus=8）→ 订单标为 `cancelled` → 前端回到 `confirm` 步骤
- 2 分钟冷却期：取号后 2 分钟内按钮禁用，显示剩余倒计时（与换号共用同一倒计时）
- 冷却对齐 SMSBower 平台限制（购买 2 分钟内不可取消，否则报 EARLY_CANCEL_DENIED）
- 取消不消耗 CDK 次数（次数仅在收到短信时扣减）

### 4.6 换号（waiting 步骤）

用户在等待阶段觉得当前号码不合适，可换一个新号：

- 点击【换号】→ 后端取消当前号 + 重新取号（沿用同一运营商）→ 同一 orderId，更新手机号 + changeCount +1
- 2 分钟冷却期：与取消共用同一倒计时
- 换号上限：每次使用最多换号 **2 次**（后端按 `changeCount` 校验，切换浏览器/新 session 重置）
- 达到上限后换号按钮置灰，提示"已达换号上限"
- 换号不消耗 CDK 次数

**换号规则汇总：**

| 条件 | 行为 |
|------|------|
| 距取号 < 2 分钟 | 按钮禁用 + 倒计时 |
| changeCount < 2 | 可换号 |
| changeCount ≥ 2 | 按钮置灰 + "已达换号上限" |
| 换号成功 | 同一 orderId，更新号码，changeCount +1，重新进入 waiting |

### 4.7 【再发一条】按钮（SMSBower）

- 仅 SMSBower 平台且 CDK 有剩余次数时显示
- 点击后：后端调 `setStatus=3`，订单回到 `pending`，前端恢复轮询
- 每次收到新短信：CDK 扣 1 次，判断剩余次数决定是否继续显示该按钮

### 4.8 完成激活逻辑（SMSBower）

以下任一条件触发 `setStatus=6`，订单标为 `completed`：
1. 用户主动点击【完成】（canRetry=true 时可见）
2. 用户点击【再次兑换】（canRetry=false 时，静默 finish 当前订单后回到兑换首页）
3. 倒计时归零（后台兜底调用，不展示给用户）

### 4.9 限制规则

- 同一 CDK 存在 `pending` 或 `received` 状态的订单时，不允许新建订单
- CDK 剩余次数为 0 → 直接进 error
- 无需注册，匿名使用

### 4.10 Web 前端 UI 设计规范

#### 整体布局：单页渐进展开

所有兑换步骤在同一页面内通过显示 / 隐藏切换，不做全页跳转。页面分三个区域，随流程推进逐步展开：

**区域 A — CDK 输入 & 状态条（始终显示）**

| 状态 | 表现 |
|------|------|
| 初始 | 居中大输入框 + 立即兑换按钮，单栏简洁 |
| 验证通过后 | 收缩为顶部信息条：CDK 码 / 服务名 / 剩余次数 / 清除按钮 |
| 会话激活中 | 输入框锁定（disabled + 锁图标），点清除按钮方可解锁并清除当前会话 |

**区域 B — 活跃会话（验证通过后展开）**

区域 B 内容随状态替换，不整体消失：

| 状态 | 内容 |
|------|------|
| confirm 阶段 | 运营商选择列表 + 确认兑换按钮（方案 B：运营商选择即区域 B 初始内容） |
| 确认后（waiting / received） | 左右双栏会话面板 |
| 结束后（success / timeout） | 结果提示 + 再次兑换入口，右侧保留最后一条验证码 |

双栏会话面板布局：

```
┌──────────────────────────┐ ┌──────────────────────────┐
│  左栏：绑定号码           │ │  右栏：最新验证码          │
│  +1 234 567 8901  [复制] │ │                          │
│  美国 · 运营商 A          │ │      470712              │  ← 大号数字，Indigo 色
│  ● 正在监测 OpenAI 短信   │ │  [复制验证码]             │
│                          │ │  原始短信: yes|您的...     │
│  [换号（剩2次）]  [取消]  │ │                          │
└──────────────────────────┘ └──────────────────────────┘
```

移动端：双栏折叠为单栏，号码在上，验证码在下。

**区域 C — 接收历史（收到第一条短信后展开，全宽）**

- 最新一条在上，按时间倒序排列
- 每条记录：验证码 / 原始短信内容 / 接收时间
- 多次接码（SMSBower 再发一条）场景下自然累积

#### 设计规范

| 项目 | 规范 |
|------|------|
| 主题色 | Indigo `#4F46E5`，通过 CSS 变量 `--color-primary` 定义，全局统一引用 |
| 深色模式 | 框架预留，`.dark` 类切换 CSS 变量值，现阶段不强制要求完整实现 |
| 背景 | 纯白 `#FFFFFF`，区域间用浅灰卡片区分层次 |
| 卡片样式 | 仅用 shadow，不用 border |
| 验证码展示 | 白 / 浅灰背景 + 大号 Indigo 数字，数字本身是视觉焦点，不用色块背景压字 |
| 状态徽标 | 关键状态压缩为小徽标显示，如 `● 监测中` `验证码: 1/3次` `换号: 0/2次` |
| 行动按钮文案 | 含剩余次数，如「再发一条（剩 2 次）」，用户点前知代价 |
| 响应式 | 桌面优先，移动端双栏折叠为单栏 |
| 主题色变更 | 改 CSS 变量一处，全局生效，无需 find & replace |

---

## 五、管理后台（仅内部，账号密码登录）

### 5.1 Provider 管理

| 字段 | 说明 |
|------|------|
| name | 内部名称，如 "SMSBower"（仅 admin 可见） |
| slug | 代码标识，如 "smsbower"（不对外暴露） |
| alias | **必填**，对外别名，如 "运营商 B"（web 端显示此字段） |

> alias 为必填项，未填写不允许保存 Provider。API Key 存于环境变量，不入库。

### 5.2 ServiceCategory + Service 管理（合并页面）

管理页以 **ServiceCategory 为分组**，展开后管理各运营商实现：

```
┌─ OpenAI 验证码 ────────────────────────── [+ 添加运营商] ─┐
│  ⭐ 运营商 A   code: go   poolId: 247   maxPrice: $0.2    │
│     运营商 B   code: 47   poolId: -     maxPrice: $0.3    │
└──────────────────────────────────────────────────────────┘
[+ 新建服务类型]
```

⭐ 表示推荐运营商（isDefault = true），每个 Category 只能有一个。

**ServiceCategory 字段：**

| 字段 | 说明 |
|------|------|
| name | 服务名，如"OpenAI 验证码" |
| shortName | CDK 前缀，如 `OP` |

**Service 字段：**

| 字段 | 说明 |
|------|------|
| categoryId | 所属 ServiceCategory |
| providerId | 所属 Provider |
| externalServiceId | 下单用的服务 ID（SMSPool: 数字；SMSBower: 字符串 code） |
| poolStatusId | **SMSBower 专用**：号池查询用的数字 ID；SMSPool 留空 |
| isDefault | 是否为该 Category 的推荐运营商 |
| successRateThreshold | 选号成功率/交付率门槛（%） |
| maxPrice | 最高单价（USD） |
| blockedCountries | 屏蔽国家名单，JSON 数组，存 ISO 码 |

### 5.3 号池监控

顶部选 ServiceCategory + 运营商，点击查询。数据来自缓存（5 分钟更新一次），支持手动刷新。

#### SMSPool 视图

| 字段 | 说明 |
|------|------|
| 国家 / 代码 | 国家全称 + ISO 码 |
| 成功率 | 带进度条，低于阈值标红 |
| 最低价格 | 当前最低单价 |
| 库存 | 0 标红，< 10 标黄 |
| 策略状态 | 符合（绿）/ 不符合原因 / 已屏蔽（橙） |

摘要卡片：可用国家数、符合策略数、已屏蔽数、优选前 3 国家。

#### SMSBower 视图（按 position 平铺）

| 字段 | 说明 |
|------|------|
| 国家 / ISO | 国家全称 + ISO 码 |
| 交付率 | 国家级别 rate 字段（%） |
| 等级 | Gold / Silver / Bronze |
| 供应商 ID | Agent ID（下单时传入） |
| 库存 | 该 position 可用数量 |
| 价格 | 该 position 单价 |

排序：Gold 优先 → 交付率降序 → 价格升序。

### 5.4 CDK 管理

批量生成时可配置：

| 字段 | 说明 |
|------|------|
| ServiceCategory | 服务类型 |
| countryCode | 可选，指定国家（ISO 码，如 `US`）；不填则为普通 CDK |
| totalUses | 每张可用次数 |
| 数量 | 生成张数 |

**CDK 格式：**

| 类型 | 格式 | 示例 |
|------|------|------|
| 普通 CDK | `{缩写}-XXXX-XXXX-XXXX` | `OP-A3KF-9ZMR-B72X` |
| 国家专属 CDK | `{缩写}-{ISO}-XXXX-XXXX` | `OP-US-A3KF-9ZMR` |

- 字符集：大写字母 + 数字，排除易混淆字符（`0` `O` `1` `I` `L`）
- 已创建的 CDK 不允许修改 countryCode

**CDK 状态：**

| 状态 | 说明 |
|------|------|
| 可用 | 有剩余次数 |
| 使用中 | 有 pending / received 订单 |
| 已用完 | 剩余次数为 0 |
| 已停用 | 管理员手动停用 |

**CDK 详情（订单记录）：**

每条订单展示：取号时间、运营商（alias）、手机号、短信历史（多条）、结果、完成时间。

若订单因切换运营商被取消：

```
订单 #1  运营商 A  [已取消 - 用户切换运营商]  12:00 创建，等待 1分02秒
  ↓ 用户主动切换
订单 #2  运营商 B  [已完成]                  12:01 创建，验证码 755206
```

### 5.5 cancelledReason 文案

| 枚举值 | 显示文案 |
|--------|---------|
| `timeout` | 超时未收到短信 |
| `user_switched_pool` | 用户切换运营商 |
| `user_cancelled` | 用户主动取消 |

---

## 六、选号策略

### 通用逻辑

1. 若 CDK 指定了 `countryCode`，仅在该国家范围内选号；无可用号码则**直接报错**，不 fallback 到其他国家
2. 若无 `countryCode`，按以下各平台策略自动选择最优国家

### SMSPool 策略

1. 调 `/request/success_rate` 获取所有国家成功率 / 价格 / 库存
2. 排除 `blockedCountries`
3. 过滤 `success_rate < successRateThreshold` 或 `price > maxPrice` 的国家
4. 按价格升序，依次尝试前 3 个下单
5. 无符合条件时，fallback 到未屏蔽国家中成功率最高的前 3 个

### SMSBower 策略

1. 调内部接口 `getPricesByService?serviceId={poolStatusId}` 获取所有 position（含等级、交付率、agentIds）；失败时降级至官方 `getPricesV3`
2. 排除 `blockedCountries`（按 ISO 码）
3. 过滤 `rate < successRateThreshold` 或 `price > maxPrice` 的 position
4. 排序：Gold 优先 → rate 降序 → price 升序，取前 3 个
5. 每个 position 用其 `agentIds` 调官方 `getNumberV2` 下单
6. 无符合条件时，fallback 到未屏蔽国家中 rate 最高的前 3 个 position

---

## 七、数据库 Schema

### 新增表

```sql
-- 平台无关的服务类型
CREATE TABLE service_categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  short_name TEXT NOT NULL,  -- CDK 前缀，如 OP
  created_at TEXT NOT NULL
);

-- 每条收到的短信（支持同一订单多条）
CREATE TABLE order_sms (
  id                TEXT PRIMARY KEY,
  order_id          TEXT NOT NULL,  -- FK → orders.id
  sms_content       TEXT,
  verification_code TEXT,
  received_at       TEXT NOT NULL
);

-- 号池状态缓存（按 service 粒度，5 分钟 TTL）
CREATE TABLE pool_status_cache (
  service_id TEXT PRIMARY KEY,  -- FK → services.id
  data       TEXT NOT NULL,     -- JSON
  cached_at  TEXT NOT NULL
);
```

### 修改表

**`providers` 表（新增字段）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| alias | TEXT NOT NULL | 对外显示名，必填 |

**`services` 表（调整）：**

| 变更 | 说明 |
|------|------|
| 移除 `name`、`short_name` | 迁移至 `service_categories` |
| 新增 `category_id` | FK → service_categories.id |
| 新增 `is_default` | BOOLEAN，该 Category 下的推荐运营商 |
| 新增 `pool_status_id` | TEXT nullable，SMSBower 号池查询用 |

**`cdks` 表（调整）：**

| 变更 | 说明 |
|------|------|
| `service_id` → `category_id` | FK → service_categories.id |
| 新增 `country_code` | TEXT nullable，ISO 码，如 `US` |

**`orders` 表（新增字段）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `service_id` | TEXT NOT NULL | 本次下单实际使用的 Service（FK） |
| `cancelled_reason` | TEXT nullable | 取消原因枚举 |
| `from_order_id` | TEXT nullable | 切换运营商时，指向被取消的上一个订单 |
| `change_count` | INTEGER NOT NULL DEFAULT 0 | 换号次数，每次换号 +1，上限 2 次；换浏览器（新 session）重置 |

**`orders.status` 新增值：**

| 值 | 说明 |
|----|------|
| `received` | **新增**，SMSBower 已收到短信，等待用户操作 |

---

## 八、API 接口

### validate 接口（变更）

`POST /api/cdk/validate`

```json
// 响应
{
  "cdkId": "uuid",
  "service": "OpenAI 验证码",
  "countryCode": "US",
  "remaining": 3,
  "pools": [
    { "serviceId": "uuid-1", "alias": "运营商 A", "isDefault": true,  "hasStock": true  },
    { "serviceId": "uuid-2", "alias": "运营商 B", "isDefault": false, "hasStock": false }
  ]
}
```

- `alias` 替代真实 providerName，C 端不可见任何平台信息
- `hasStock` 基于缓存（5 分钟），支持 `?refresh=true` 强制刷新
- 对于国家专属 CDK，`hasStock` 仅考虑该国是否有库存

### order 接口（变更）

`POST /api/cdk/order`

```json
// 请求（新增 serviceId 参数）
{ "cdkId": "uuid", "serviceId": "uuid-1" }
```

### order 接口响应（新增字段）

```json
{
  "orderId": "uuid",
  "phoneNumber": "1xxxxxxxxxx",
  "expiresIn": 1200,
  "changeCount": 0,
  "orderedAt": "2026-05-28T10:00:00.000Z"
}
```

- `changeCount`：当前换号次数，前端用于判断是否显示换号按钮
- `orderedAt`：取号时间，前端用于计算 2 分钟冷却是否结束

### 新增接口

| 接口 | 说明 |
|------|------|
| `POST /api/cdk/order/:id/retry` | SMSBower 再发一条（setStatus=3） |
| `POST /api/cdk/order/:id/finish` | SMSBower 完成激活（setStatus=6） |
| `POST /api/cdk/order/:id/cancel` | 取消取号（setStatus=8），订单标为 cancelled，仅 waiting 阶段可用 |
| `POST /api/cdk/order/:id/change` | 换号：取消当前号 + 重取（同一 orderId，changeCount+1，上限 2 次） |

**change 接口响应：**

```json
{
  "orderId": "uuid",
  "phoneNumber": "1xxxxxxxxxx（新号）",
  "expiresIn": 1200,
  "changeCount": 1,
  "orderedAt": "2026-05-28T10:02:00.000Z"
}
```

---

## 九、适配器接口

```typescript
interface SmsProvider {
  // 所有平台必须实现
  orderNumber(serviceId: string, options: OrderOptions): Promise<OrderResult>
  pollOrder(orderId: string): Promise<PollResult>
  cancelOrder(orderId: string): Promise<void>
  getPoolStatus(serviceId: string): Promise<PoolCountryStatus[]>

  // 可选，仅 SMSBower 实现
  retryOrder?(orderId: string): Promise<void>    // setStatus=3
  confirmOrder?(orderId: string): Promise<void>  // setStatus=6
}

// PollResult.status 新增 'received'
type OrderStatus = 'pending' | 'received' | 'completed' | 'expired' | 'cancelled'

interface PoolCountryStatus {
  countryId: number | string
  name: string
  shortName: string       // ISO 码
  price: number
  lowPrice: number
  successRate: number     // SMSPool: success_rate；SMSBower: rate 字段
  stock: number
  rank?: 'gold' | 'silver' | 'bronze'   // SMSBower 扩展
  agentIds?: number[]                    // SMSBower 扩展
}
```

**API Key 路由（已修复）：**

```typescript
function getApiKey(slug: string, env: Bindings): string {
  switch (slug) {
    case 'smspool':  return env.SMSPOOL_API_KEY
    case 'smsbower': return env.SMSBOWER_API_KEY
    default: throw new Error(`Unknown provider: ${slug}`)
  }
}
```

---

## 十、SMSBower API 使用说明

| 功能 | 接口 | 备注 |
|------|------|------|
| 号池监控（主） | `GET https://smsbower.app/activations/getPricesByService?serviceId={id}` | 内部接口，含 rank/rate，无需 api_key |
| 号池监控（降级） | 官方 `getPricesV3` | 主接口失败时使用，无 rank/rate |
| 取号 | 官方 `getNumberV2` | 传 `service={code}&providerIds={agentId}&maxPrice={}` |
| 查询短信 | 官方 `getStatus` | 返回字符串状态 |
| 完成激活 | 官方 `setStatus&status=6` | 必须调用，否则激活挂起 |
| 取消 | 官方 `setStatus&status=8` | 购买 2 分钟内不可取消 |
| 再发一条 | 官方 `setStatus&status=3` | 免费，同一激活 25 分钟内 |

**`getStatus` 状态映射：**

| SMSBower 返回 | 内部 status | 备注 |
|--------------|------------|------|
| `STATUS_WAIT_CODE` | pending | 等待短信 |
| `STATUS_WAIT_RETRY:code` | pending | 正常流程不会触发 |
| `STATUS_OK:code` | received | 收到验证码，等待用户操作 |
| `STATUS_CANCEL` | cancelled | 已取消 |
| expiresAt 过期 | expired | 本地判断 |

**`activationTime` 处理：** 格式待调试确认，当前默认 1500 秒（25 分钟）兜底。

---

## 十一、开发范围

### 当前第一期
- 用户兑换流程（含运营商选择、切换、SMSBower ANOTHER SMS）
- 管理后台（Provider / ServiceCategory / Service / CDK 管理）
- 号池监控（SMSPool + SMSBower 两种视图，带缓存）
- 选号策略（含国家专属 CDK、屏蔽国家、成功率过滤）
- 订单行为日志（切换运营商链路追踪）
- **SMSBower 完整接入**

### 第二期
- 数据统计看板（消耗次数、余额、成功率趋势）
- 更多运营商接入

---

## 十二、技术方案

### 部署架构

```
用户 / 管理员浏览器
        ↓
Cloudflare Pages（前端静态资源）
        ↓
Cloudflare Workers（后端 API，Hono 框架）
        ↓
Cloudflare D1（SQLite，含号池状态缓存）
        ↓
各运营商 API（服务端调用，对用户完全不可见）
```

### 技术选型

| 层 | 选型 |
|---|---|
| 前端 | React + TypeScript + Vite + Tailwind CSS |
| 后端 | Cloudflare Workers + Hono |
| 数据库 | Cloudflare D1（SQLite）+ Drizzle ORM |
| 认证 | JWT + Cookie（管理后台） |
| 包管理 | pnpm workspace（monorepo） |

### 项目结构

```
sms-cdk/
  apps/
    web/          # 用户前端（兑换页面）
    admin/        # 管理后台
    api/          # Cloudflare Workers
      src/
        adapters/
          smspool.ts      # SMSPool 适配器
          smsbower.ts     # SMSBower 适配器（开发中）
          index.ts        # provider 工厂 + getApiKey
          types.ts        # 接口类型定义
        routes/
          cdk.ts          # 兑换流程（含 retry / finish）
          pool.ts         # 号池监控（含缓存逻辑）
          services.ts     # Service + Category 管理
          providers.ts    # Provider 管理
          cdks.ts         # CDK 管理
        db/
          schema.ts       # Drizzle schema
```

### 安全说明

- 所有运营商 API 调用在 Workers 服务端执行，浏览器只见自有域名请求
- 运营商真实名称、slug、接口地址、API Key 对 C 端完全不可见
- C 端接口只返回 alias（别名）和内部 UUID，无任何可推断第三方平台的信息

### 并发控制

```
BEGIN TRANSACTION
  1. 查询 CDK 有效性（剩余次数 > 0，无 pending/received 订单）
  2. 插入 order（status = pending，绑定 serviceId）
COMMIT
↓
调用运营商 API 取号（事务外）
```

### 免费额度参考

| 服务 | 免费额度 |
|------|------|
| Cloudflare Workers | 100,000 请求/天 |
| Cloudflare D1 | 5GB 存储，500 万行读/天 |
| Cloudflare Pages | 无限制 |

---

## 十三、本地开发 Mock 方案

为方便本地调试体验问题，web 前端提供 mock 模式，绕过真实取号和等待短信的流程。

### Mock 范围

| 方法 | Mock 后行为 | 数据库影响 |
|------|------------|----------|
| `validate` | 保持真实（检查 CDK 有效性） | 写 pool_status_cache（无害缓存） |
| `createOrder` | 直接返回假号码 | **无写入** |
| `pollOrder` | 按场景返回预设结果 | **无写入，CDK 不扣次数** |
| `retryOrder` | 直接返回 success | **无写入** |
| `finishOrder` | 直接返回 success | **无写入** |

### 实现方式

页面右下角浮层控制台（仅开发模式渲染），包含：
- **场景选择**：控制 pollOrder / createOrder 的返回行为
- **延迟配置**：模拟等待感（1–10 秒）
- **canRetry 开关**：测试"再发一条"与"再次兑换"两个分支

无需配置环境变量，开关在 UI 上操作，切换实时生效。

### 可覆盖的测试场景

| 场景 | 覆盖的 UI 分支 |
|------|--------------|
| `received` + canRetry=true | waiting → received，倒计时 + 再发一条 + 完成 |
| `received` + canRetry=false | waiting → received，仅显示再次兑换 |
| `completed` | waiting → success 直达（SMSPool 路径） |
| `timeout` | waiting → timeout |
| `create_fail` | confirm 页 createOrder 失败 errorMsg |
| `retry_fail` | received 页再发一条失败 errorMsg |
| `finish_fail` | received 页完成失败 errorMsg |

### 无法 mock 的场景

- CDK 次数实时扣减：使用真实 CDK 验证一次即可，不需要反复调

---

## 十四、开发计划

详见 [DEVELOPMENT-V2.md](./DEVELOPMENT-V2.md)。
