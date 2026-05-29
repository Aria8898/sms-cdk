# CDK 类型扩展设计文档

> 本文档记录三种 CDK 类型的需求讨论结果，以及待确认事项。
> 当前阶段：**短效时效型（Type A）已可进入实现，长效 PingMe 型（Type B）待续**。

---

## 一、三种 CDK 类型总览

| 类型 | 暂定名 | 核心限制 | 来源平台 | 状态 |
|------|--------|----------|----------|------|
| 现有 | **按次型** | 次数（N 次用完即止） | SMSPool / SMSBower | 已实现 |
| 新 A | **短效时效型** | 时间（有效期内无限接码） | SMSPool / SMSBower | 需求已确认，可实现 |
| 新 B | **长效 PingMe 型** | 时间 + 条数 | PingMe | 讨论中，暂缓 |

---

## 二、短效时效型（Type A）

### 核心规则

- 一个 CDK 只能激活一次（不可重复取号）
- 用户取到号码后，有效期倒计时**立即开始**（不等收到第一条短信）
- 有效期内，无限次"再发一条"，不扣次数
- 有效期到期后，CDK 状态变为 exhausted，不可再用
- 短效型**不支持续时间**，时间到即结束

### 有效期配置

- 生成 CDK 时，管理员填入有效分钟数（如 20 分钟）
- 有效期存储在 CDK 上（而非写死），前端根据 CDK 配置显示倒计时
- 当前倒计时逻辑需从写死改为读取 CDK 配置

### 未使用保护

- 如果取到号码后，有效期内**一条短信都没收到**，CDK 视为"未使用"
  - **待定**：未使用的 CDK 是否算消耗？是否允许管理员手动重置？

### 取消 / 换号行为

- 有效期开始前（pending 阶段）支持取消、换号，逻辑与按次型相同
- 换号时若旧号恰好收到了短信：**优先保留旧号结果，换号失败/撤销**（方案 Y）
- 收到第一条短信后，进入 received 状态，此时不允许换号

### CDK 状态流转

```
active（未激活）
  └─ 用户取号 → pending（计时开始）
        ├─ 有效期内收到短信 → received（可无限 retry）
        │     └─ 用户手动完成 / 有效期到期 → completed / expired
        └─ 有效期到期（从未收到短信） → expired（视为未使用）
```

### UI 变化（Web 端）

- validate 返回新增字段：`expiresAt`（ISO 时间戳）、`cdkType: 'timed'`
- 有效期开始后，区域 A 状态条显示：`到期时间：2026-05-29 14:20`
- 倒计时根据 `expiresAt` 实时计算，不再写死
- `canRetry` 逻辑：有效期内 → 始终为 true；到期 → false

### 数据库变更

- `cdks` 表新增：
  - `cdk_type TEXT NOT NULL DEFAULT 'count'`（枚举：`count` / `timed`）
  - `validity_minutes INTEGER`（仅 timed 类型有效，生成时填入）
- `orders` 表：`expires_at` 字段已存在，改为从 CDK 配置计算（而非运营商返回的 expiresIn）

### 后端接口变更

| 接口 | 变更内容 |
|------|----------|
| `POST /api/cdk/validate` | 返回新增 `cdkType`、`expiresAt` |
| `POST /api/cdk/order` | timed 类型：`expiresAt = now + validity_minutes * 60s` |
| `GET /api/cdk/order/:id/status` | timed 类型：`canRetry = expiresAt > now`（不检查 remainingUses） |
| `POST /admin/cdks/generate` | 支持传入 `cdkType` 和 `validityMinutes` |

### Admin 端变更

- CDK 生成页：类型选择（按次 / 时效），时效型填有效分钟数
- CDK 列表：类型列，显示"按次"或"时效 XX 分钟"
- Admin 可识别类型，但 Web 端用户不需感知类型差异

---

## 三、长效 PingMe 型（Type B）——待续

> 以下为已确认内容 + 待解答问题，后续继续讨论后补充实现方案。

### 已确认

| 维度 | 结论 |
|------|------|
| 号码来源 | PingMe 平台（`lockNumber` API 申请） |
| 短信接收 | Webhook 推送（PingMe 回调到本系统） |
| 有效期 | 管理员生成时配置，可手动延长 |
| 条数限制 | 有（N 条上限，管理员可补充） |
| 号码复用 | 不允许，CDK 到期后释放号码（调 `unSubNumber`） |
| 释放时机 | 可配置（默认管理员手动，后续可改自动） |
| 号码绑定时机 | 用户首次 validate CDK 时调 `lockNumber`（非生成时） |
| 前端入口 | 当前系统新增独立页面（非复用短效流程） |
| 用户操作流程 | 输入 CDK → 申请号码 → 拿着号码去目标平台 → 检查验证码 |
| Webhook 安全 | 在 URL 中嵌入 secret token，成本低，直接做 |

### 参考截图

用户提供的 Type B 页面原型：
- 输入框：`CDK-XXXX-XXXX-XXXX`
- 按钮：「申请号码」「检查验证码」
- 等待计时：`00:00`
- 结果展示区（大文本框）

### 待确认问题

**E1：申请号码能否重新申请？**
- 申请后号码不理想（如被目标平台识别），能否换号？
- 如果能：旧号如何处理（unSubNumber）？换号是否消耗次数？

**E2："等待计时 00:00"的含义**
- 倒计时到 CDK 到期？
- 还是点击"检查验证码"后的等待计时（防频繁刷新）？

**E3：PingMe 的 `app` 参数配置方式**
- 生成 CDK 时管理员指定（每个 CDK 对应一个固定 app）？
- 还是用户在使用时自选？

**E4："检查验证码"的交互模式**
- 点一次看一次（主动拉取）？
- 还是进入持续监听，有新短信自动刷新（类似当前轮询）？

**E5：独立工具调用时机**
- 独立工具调 API 查验证码时，号码必须已在页面上申请过
- 若独立工具来查时尚未申请号码：应报错还是自动帮其申请？

**E6：Admin 端如何生成 Type B CDK**
- 是否复用现有 CDK 生成页（新增 PingMe 类型选项）？
- 还是独立入口？

---

## 四、三种类型对比（备忘）

```
按次型      → remainingUses 归零 → exhausted
短效时效型  → expiresAt 到期    → expired / exhausted
长效PingMe  → expiresAt 到期 OR remainingUses 归零 → exhausted
```

---

## 五、实现顺序建议

1. **先实现短效时效型（Type A）**
   - DB：`cdks` 加 `cdk_type` + `validity_minutes`
   - 后端：validate / order / status 接口适配 timed 逻辑
   - Web：倒计时改为动态读取，增加到期时间展示
   - Admin：CDK 生成页增加类型选项

2. **后续实现长效 PingMe 型（Type B）**
   - 完成上方待确认问题
   - 新增 PingMe 适配器
   - 新增 Webhook 接收端点
   - 新增独立前端页面
