# 短效时效型 CDK（Type A）需求规格

> 状态：需求已确认，可进入实现。
> 依赖：Step 6（SMSBower 完整兑换流程）完成后实施。

---

## 一、核心概念

### "激活"的定义

- **取号（pending）≠ 激活**
- **取号 + 收到至少 1 条短信（received）= 激活**

此定义决定 CDK 是否算消耗（见状态流转）。

### 核心规则

- 有效期倒计时从**取号时**立即开始（不等收到第一条短信）
- 有效期内，无限次"再发一条"，**不扣次数**
- 短效型**不支持续时间**，到期即结束
- 有效期由管理员生成 CDK 时填入，存储在 CDK 记录上

---

## 二、CDK 状态流转

```
active（可使用）
  └─ 用户取号 → pending（expiresAt = now + validity_minutes × 60s）
        ├─ 有效期内收到第一条短信 → received（可无限 retry，不扣次数）
        │     ├─ 用户手动完成 → 订单: completed，CDK: exhausted
        │     └─ 有效期到期   → 订单: expired，CDK: exhausted
        └─ 有效期到期（从未收到短信，未激活）
              → 订单: expired，CDK: 回到 active（可再次使用）
```

**两种 expired 路径的 CDK 状态差异：**

| 情况 | 订单状态 | CDK 状态 | 说明 |
|------|----------|----------|------|
| pending 到期，0 条短信 | `expired` | `active` | 未激活，不算消耗，CDK 可再次使用 |
| received 到期，≥1 条短信 | `expired` | `exhausted` | 已激活，算消耗，CDK 不可再用 |

---

## 三、取消 / 换号行为

- `pending` 阶段支持取消、换号，逻辑与按次型相同（含 2 分钟冷却、2 次上限）
- **换号后 `expiresAt` 重置**：新号从换号时刻重新计算（`now + validity_minutes × 60s`）
- 换号时若旧号恰好收到了短信：**保留旧号结果，换号撤销**（方案 Y）
- 进入 `received` 状态后：**不允许换号**

---

## 四、会话恢复

适用范围：**timed 型和 count 型均支持**（在 validate 接口统一实现）。

**场景**：用户取号后离开页面，在有效期内重新打开页面并输入同一 CDK。

**行为**：
- validate 检测到该 CDK 存在进行中的订单（`pending` 或 `received` 状态，且 `expiresAt > now`）
- 返回 `activeOrder` 字段，前端跳过 confirm 步骤，直接还原到对应页面状态：
  - `pending` → 还原到等待页，显示剩余时间继续等
  - `received` → 还原到验证码页，显示已收到的短信和剩余时间

**`activeOrder` 字段结构：**

```json
{
  "activeOrder": {
    "orderId": "...",
    "status": "pending",
    "phoneNumber": "+1...",
    "expiresAt": "2026-05-30T14:20:00Z",
    "smsContent": null,
    "verificationCode": null,
    "canRetry": true
  }
}
```

---

## 五、过期 CDK 的展示

当用户输入一个已过期的 timed CDK（CDK 状态为 `exhausted`，且是时效型到期）：

- validate 返回错误响应，附带过期信息：

```json
{
  "error": "CDK 已过期",
  "expiresAt": "2026-05-29T14:20:00Z",
  "lastOrderedAt": "2026-05-29T13:58:00Z"
}
```

- 前端展示：`CDK 已于 [expiresAt] 过期，最后取号时间：[lastOrderedAt]`

---

## 六、离开页面警告（Web）

- 触发条件：timed CDK 处于 `pending` 或 `received` 状态时
- 在页面显示醒目警告提示条
- 文案：**「请在有效期内完成操作，到期后将无法继续」**

---

## 七、数据库变更

| 表 | 字段 | 说明 |
|----|------|------|
| `cdks` | `cdk_type TEXT NOT NULL DEFAULT 'count'` | 枚举：`count` / `timed` |
| `cdks` | `validity_minutes INTEGER` | 仅 timed 类型有效，生成时填入 |
| `orders` | `expires_at`（已存在） | timed 类型改为从 CDK 配置计算，不再使用运营商返回的 expiresIn |

---

## 八、后端接口变更

| 接口 | 变更内容 |
|------|----------|
| `POST /api/cdk/validate` | ① 正常响应新增 `cdkType`、`expiresAt`；② 检测进行中订单时返回 `activeOrder`；③ 已过期时错误响应新增 `expiresAt`、`lastOrderedAt` |
| `POST /api/cdk/order` | timed 类型：`expiresAt = now + validity_minutes × 60s` |
| `POST /api/cdk/order/:id/change` | timed 类型：同步重置 `expiresAt = now + validity_minutes × 60s` |
| `GET /api/cdk/order/:id/status` | timed 类型：`canRetry = expiresAt > now`（不检查 remainingUses）；`expired` 路径区分两种情况（见状态流转） |
| `POST /admin/cdks/generate` | 新增 `cdkType`（`count`/`timed`）和 `validityMinutes` 参数 |

**validate 正常响应示例（timed 型，无进行中订单）：**

```json
{
  "cdkId": "uuid",
  "service": "OpenAI 验证码",
  "cdkType": "timed",
  "expiresAt": null,
  "remaining": null,
  "pools": [...]
}
```

**validate 正常响应示例（timed 型，有进行中订单）：**

```json
{
  "cdkId": "uuid",
  "service": "OpenAI 验证码",
  "cdkType": "timed",
  "expiresAt": null,
  "remaining": null,
  "pools": [...],
  "activeOrder": {
    "orderId": "...",
    "status": "received",
    "phoneNumber": "+1...",
    "expiresAt": "2026-05-30T14:20:00Z",
    "smsContent": "Your code is 123456",
    "verificationCode": "123456",
    "canRetry": true
  }
}
```

---

## 九、Web 端变更

| 改动 | 说明 |
|------|------|
| 会话恢复 | validate 返回 `activeOrder` 时，跳过 confirm，直接还原到 pending/received 页面状态 |
| 过期提示 | validate 返回过期错误时，展示"CDK 已于 XX 过期，最后取号时间：YY" |
| 离开页面警告 | timed CDK 在 pending/received 状态下，显示警告提示条 |
| 倒计时 | 从写死改为根据 `expiresAt` 动态计算 |
| 区域 A 状态条 | timed CDK 取号后显示到期时间：`到期时间：2026-05-30 14:20` |
| canRetry 逻辑 | timed：`expiresAt > now`；count：`remainingUses > 0`（保持不变） |

---

## 十、Admin 端变更

| 改动 | 说明 |
|------|------|
| CDK 生成页 | 新增类型选择（按次 / 时效）；时效型额外填写有效分钟数 |
| CDK 列表 | 新增类型列，显示"按次"或"时效 XX 分钟" |
