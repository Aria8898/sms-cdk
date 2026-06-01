# 号码绑定型 CDK（Type C）需求规格

> 状态：需求已确认，可进入实现。
> 平台：yamasakisms（`https://api.yamasakisms.com`）
> 详细接口示例见 `interface-document/demo/`

---

## 一、核心概念

### "绑定"的定义

- CDK 取号成功 = 绑定完成 = CDK 立刻消耗（exhausted）
- CDK 与 order（手机号）一对一永久绑定，直到 order 过期
- 绑定后用户可随时输入同一个 CDK 查询最新验证码

### 核心规则

- 取号即消耗，不可退回（不存在"取号但未使用"的保护机制）
- 有效期固定到**次日 07:00（北京时间 UTC+8）**，不可由管理员配置
- **08:00 前不开放取号**，系统拒绝并提示"请 08:00 后再来取号"
- 一个手机号只能绑定 1 个有效 CDK（系统强约束）
- 用户不可自助换号，只有管理员可操作

### 有效期计算

```
取号时间在 08:00–23:59 → expiresAt = 当日 +1 天的 07:00:00 (UTC+8)
取号时间在 00:00–07:59 → 拒绝取号，提示请 08:00 后再来
```

示例：
- 08:30 取号 → 次日 07:00 到期（约 22.5 小时）
- 23:50 取号 → 次日 07:00 到期（约 7 小时）
- 06:00 取号 → 拒绝

---

## 二、CDK 状态流转

```
active（可使用）
  └─ 用户/管理员取号 → CDK: exhausted（立刻）
                        order: active（expiresAt = 次日 07:00）
                              └─ 到期 → order: expired
```

**与其他类型的关键区别：**

| 对比维度 | 按次型 / 时效型 | 号码绑定型 |
|---|---|---|
| CDK 消耗时机 | 收到第一条短信 | 取号即消耗 |
| CDK exhausted 后 | 不可再用 | 仍可通过 validate 查询绑定的 order |
| order 状态 | pending → received → completed/expired | active → expired（只有两态）|

---

## 三、validate 接口适配

**现有逻辑（需改动）：**
CDK 状态为 `exhausted` → 直接返回错误"CDK 已使用"

**新逻辑（bound 类型专属判断）：**

```
CDK 类型为 bound + 状态为 exhausted
  ├─ 有关联的未过期 order → 正常返回 activeOrder（不报错）
  └─ 有关联的已过期 order → 返回错误，附带过期信息
```

**validate 响应新增字段（bound 类型）：**

```json
{
  "cdkId": "uuid",
  "cdkType": "bound",
  "activeOrder": {
    "orderId": "...",
    "phoneNumber": "+86 138xxxx8888",
    "codeApiUrl": "https://sms.985008.xyz/api/CDK-XXXX-XXXX-XXXX",
    "expiresAt": "2026-06-03T07:00:00+08:00",
    "boundAt": "2026-06-02T14:30:00+08:00"
  }
}
```

**已过期时的错误响应：**

```json
{
  "error": "号码已过期，无法继续接收验证码",
  "expiredAt": "2026-06-03T07:00:00+08:00",
  "boundAt": "2026-06-02T14:30:00+08:00"
}
```

---

## 四、Web 端独立页面

bound 类型使用**独立页面**，不复用现有取号流程页面。

### 页面状态一：未取号

```
┌─────────────────────────────┐
│  [ CDK 输入框               ]│
│  [ 立刻取号 ]                │
└─────────────────────────────┘
```

### 页面状态二：取号成功 / 已取号的 CDK

```
┌─────────────────────────────────────────────┐
│  手机号码：+86 138xxxx8888                   │
│                                             │
│  接码 API：                                  │
│  https://sms.985008.xyz/api/CDK-XXXX  [复制]│
│                                             │
│  预计剩余有效期：XX 小时                      │
│  将于 2026/06/03 07:00 失效                  │
│                                             │
│  已于 2026/06/02 14:30 取号                  │
└─────────────────────────────────────────────┘
```

说明：
- "已于 XX 取号"仅在 CDK **已取号**（即 exhausted）时显示
- 首次取号成功后页面直接切换到此状态
- 再次输入同一 CDK 也直接显示此状态（会话恢复）

### 页面状态三：已过期

```
┌─────────────────────────────────────────────┐
│  该号码已于 2026/06/03 07:00 过期            │
│  最后取号时间：2026/06/02 14:30              │
└─────────────────────────────────────────────┘
```

---

## 五、对外接码 API

### 接口定义

```
GET https://sms.985008.xyz/api/{CDK}
```

- 不透出 yamasakisms 任何信息
- 支持跨域：响应头含 `Access-Control-Allow-Origin: *`
- 适用场景：浏览器扩展、油猴脚本、自动化工具

### 响应格式

**有验证码时：**

```json
{
  "code": 1,
  "msg": "ok",
  "data": {
    "code": "您的 OOOO 验证代码是：141903",
    "code_time": "2026-06-02 14:04:58",
    "expired_date": "2026-06-03 07:00:00"
  }
}
```

**暂无验证码：**

```json
{
  "code": 0,
  "msg": "No verification code",
  "data": {
    "expired_date": "2026-06-03 07:00:00"
  }
}
```

**CDK 无效或已过期：**

```json
{
  "code": 0,
  "msg": "无效的链接/查询码错误"
}
```

说明：
- `code_time` 由本系统记录（非 yamasakisms 返回），每次收到新验证码时写入 `order_sms` 表
- 只返回最新一条验证码
- `expired_date` 固定为次日 `07:00:00`（UTC+8）

### 限速

- 20 次 / 分钟 / CDK
- 超限返回 HTTP 429
- 阈值通过环境变量 `RATE_LIMIT_CODE_API` 配置，默认 `20`

### 服务端缓存

- 使用 Cloudflare Cache API，TTL 3 秒，key = `order_no`
- 同一 CDK 3 秒内重复调用直接返回缓存，不打 yamasakisms
- 缓存命中时响应头附加 `X-Cache: HIT`

### 调用链与验证码历史

```
用户 GET /api/{CDK}
  → 查 CDK → 找关联 order_no
  → 查 3 秒缓存（命中则直接返回）
  → 调 yamasakisms getphonecode(order_no)
  → 对比 order_sms 最后一条：若不同则写入新记录
  → 返回最新验证码
```

**重要限制：** yamasakisms 只返回当前最新一条验证码。若两次调用之间有多条验证码到达，中间的记录将永久丢失，本系统无法获取。

---

## 六、后端架构：BoundSmsProvider 接口

新增独立接口，与现有 `SmsProvider`（poll 型）并列，不混用。

```typescript
interface BoundSmsProvider {
  /** 取号，返回 order_no 和手机号 */
  takeNumber(platformId: string): Promise<{ orderNo: string; phoneNumber: string }>
  /** 获取最新验证码，无码时返回 null */
  getLatestCode(orderNo: string): Promise<{ code: string; codeTime: string } | null>
  /** 释放号码（目前仅管理员手动处理，此方法预留备用） */
  releaseNumber(orderNo: string): Promise<void>
}
```

yamasakisms 适配器实现此接口，未来新增类似平台只需新增适配器文件。

### access_token 管理

yamasakisms 需要先登录获取 `access_token`，与现有 API key 型平台不同。

- 登录接口：`POST /api/auth/login`，返回 `access_token` + `expires_in`（秒）
- 无 refresh token，过期则重新登录
- Cloudflare Workers 无状态，token 必须持久化存储

**新增 `provider_tokens` 表：**

| 字段 | 类型 | 说明 |
|---|---|---|
| `provider_slug` | TEXT PRIMARY KEY | 如 `yamasakisms` |
| `access_token` | TEXT | 当前有效 token |
| `expires_at` | TEXT | 过期时间（ISO 8601） |
| `updated_at` | TEXT | 最后刷新时间 |

每次调用 yamasakisms 前：检查 `expires_at > now`，否则重新 auth 并更新表。

---

## 七、数据库变更

| 表 | 变更 | 说明 |
|---|---|---|
| `cdks` | `cdk_type` 新增枚举值 `'bound'` | 现有字段扩展 |
| `cdks` | `validity_minutes` bound 类型不使用（留 NULL）| 无需新增字段 |
| `orders` | `external_order_id` 存 yamasakisms 的 `order_no` | 现有字段复用 |
| `orders` | `phone_number` 对 `status = active` 的 bound 订单加唯一约束 | 防止同一号码绑定多个 CDK |
| `order_sms` | 无需变更，直接复用存储接码历史 | 现有表复用 |
| `auditLogs` | 新增 event 类型 `'order.rebound'` | 记录换号操作 |
| `provider_tokens` | **新增表**（见上节）| yamasakisms token 持久化 |

**换号审计日志 meta 结构（`event: 'order.rebound'`）：**

```json
{
  "orderId": "...",
  "cdkCode": "CDK-XXXX-XXXX-XXXX",
  "oldPhoneNumber": "+86 138xxxx1111",
  "newPhoneNumber": "+86 138xxxx2222",
  "oldOrderNo": "389684649653202944",
  "newOrderNo": "389684649653209999",
  "newExpiresAt": "2026-06-03T07:00:00+08:00",
  "operatedBy": "admin"
}
```

注：旧号码的释放由管理员自行在 yamasakisms 平台处理，本系统只做 DB 记录更新。

---

## 八、后端接口变更

| 接口 | 变更内容 |
|---|---|
| `POST /api/cdk/validate` | bound 类型 exhausted 后不报错，改为查关联 order 返回 activeOrder；已过期时返回过期信息 |
| `POST /api/cdk/order` | bound 类型：调 yamasakisms takeNumber → 存 order_no → 标记 CDK exhausted → expiresAt = 次日 07:00（UTC+8）；取号时间 < 08:00 返回 400 |
| `GET /api/{CDK}` | **新增**，对外接码接口，含 CORS、限速、3 秒缓存 |
| `POST /admin/cdks/generate` | 新增 `cdkType: 'bound'` 支持；bound 类型不需要 `validityMinutes` |
| `POST /admin/orders/:id/rebind` | **新增**，管理员换号：更新 phone_number、external_order_id、expires_at，写 auditLog |
| `POST /admin/orders/manual-bind` | **新增**，手动绑定：输入 cdkCode + phoneNumber + orderNo → 创建 order、标记 CDK exhausted |

**新增环境变量：**

| 变量 | 默认值 | 说明 |
|---|---|---|
| `RATE_LIMIT_CODE_API` | `20` | 接码 API 每分钟每 CDK 最大请求次数 |
| `YAMASAKISMS_USER_ID` | — | yamasakisms 账户 user_id |
| `YAMASAKISMS_USER_CODE` | — | yamasakisms 账户 user_code |
| `YAMASAKISMS_API_KEY` | — | yamasakisms 签名用 api_key |

---

## 九、Admin 端变更

### 现有页面扩展

| 页面 | 变更内容 |
|---|---|
| **CDK 生成页** | 类型选项新增"号码绑定型"；选中后隐藏有效期填写项；显示平台 platform_id 选择 |
| **CDK 列表页** | 类型列新增"绑定型"标签；绑定型额外显示绑定号码、过期时间 |
| **CDK 详情页** | bound 类型专属展示：手机号、接码链接（含复制按钮）、取号时间、过期时间、接码历史记录 |
| **Providers 页** | yamasakisms 需要填写 user_id + user_code + api_key（三个字段，而非单一 api_key）；显示 token 状态和余额 |

### 新增页面：Bound 订单管理

**列表字段：**

| 字段 | 说明 |
|---|---|
| CDK | CDK 代码 |
| 手机号 | 绑定的号码 |
| 状态 | 生效中 / 已过期 |
| 取号时间 | order 创建时间 |
| 过期时间 | 次日 07:00 |
| 最后接码 | 最近一条验证码的到达时间 |
| 操作 | 换号、复制接码链接 |

**筛选条件：** 状态（生效中 / 已过期）、日期范围

**手动绑定表单字段：**

```
CDK 代码:   [ CDK-XXXX-XXXX-XXXX      ]
手机号码:   [ +86 138xxxx8888          ]
Order No:   [ 389684649653202944       ]  ← 从 yamasakisms 平台取号后获得
```

提交后系统自动生成接码链接并展示。

**换号表单字段：**

```
当前手机号: +86 138xxxx1111（只读展示）
新手机号:   [ +86 138xxxx2222          ]
新 Order No:[ 389684649653209999       ]  ← 管理员已在 yamasakisms 取好新号
```

换号后 expiresAt 重新计算（换号当日的次日 07:00）。
旧号码释放由管理员自行在 yamasakisms 平台操作，本系统不处理。

---

## 十、可扩展性说明

本设计已将 bound 型平台抽象为独立的 `BoundSmsProvider` 接口。未来接入新平台（流程类似 yamasakisms）时：

1. 新建适配器文件，实现 `BoundSmsProvider` 接口（3 个方法）
2. 在 `adapters/index.ts` 注册新平台 slug
3. 如需独立 auth 机制，在 `provider_tokens` 表新增一条记录即可
4. 无需改动 CDK 状态机、接码 API、Admin 页面的核心逻辑
