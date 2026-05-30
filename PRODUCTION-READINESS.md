# 上线准备文档

基于 2026-05-30 安全审核 & 功能评审的完整记录，包含发现的问题、技术决策和实施计划。

---

## 一、安全审核结论

### 已通过 ✅

| 项目 | 说明 |
|------|------|
| SQL 注入防护 | Drizzle ORM 参数化查询，安全 |
| JWT 认证 | HS256，24 小时过期，覆盖所有管理端路由 |
| 登录暴力破解防护 | 5 次失败 → 封禁 15 分钟，记录登录日志 |
| 供应商信息隔离 | C 端只见 alias，真实供应商名/域名/接口不暴露 |
| CDK 随机数质量 | `crypto.getRandomValues`，字符集 32 个，无 modulo bias |
| 超时保护 | 所有外部 API 调用均有 AbortController 超时 |
| XSS 防护 | 纯 API 服务，无 HTML 模板渲染 |

### 风险项及决策

#### 🔴 一期必须修复

**1. validate 端点限流在多节点下失效**
- 问题：当前用内存 Map 实现，Cloudflare 多边缘节点各自独立，可绕过
- 风险：CDK 对外发放后，攻击者可枚举 CDK 码
- 决策：改用 D1 原子 UPSERT 实现固定窗口限流（见"技术方案"章节）

**2. validate 接口错误信息泄露**
- 问题："CDK 不存在" 和 "CDK 已失效" 返回不同错误，攻击者可区分哪些码真实存在
- 决策：统一返回相同错误信息，不暴露码是否存在

#### 🟠 一期修复

**3. SMSBower 取消号码失败被静默吞掉**
- 问题：`cancelOrder` 失败只 `console.warn`，本地标记已取消但运营商侧可能仍计费
- 决策：失败时写入 audit_logs 表记录异常

**4. SMSBower `_getOfficialCountryId` 失败静默降级**
- 问题：`getCountries` 接口超时时，`country` 参数传空，运营商可能分配错误国家号码
- 决策：改为明确报错，不静默降级

**5. timed CDK `validityMinutes` 后端缺少范围校验**
- 问题：前端有 1–10080 限制，但绕过前端可传任意值
- 决策：后端加 `Math.min(10080, Math.max(1, validityMinutes ?? 60))`，一行改动

#### 🟡 暂不处理 / 已接受风险

| 项目 | 理由 |
|------|------|
| 创单竞态条件 | 需用户脚本并发才能触发，正常 UI 流程极低概率，暂不加事务 |
| CORS `origin: '*'` | 真正防线是 JWT token，CORS 只是浏览器限制；对外开放 API 时 `*` 是正确配置 |
| 管理端输入长度校验 | 仅管理员使用，不会恶意输入 |
| `remainingUses` DB 层 CHECK 约束 | SQLite 不支持 ALTER TABLE 加 CHECK，代码层已有 `Math.max(0,...)` 保护 |

---

## 二、功能完善性

### 已完整实现 ✅

- count 型 / timed 型双 CDK 体系
- 订单状态机（pending → received → completed / expired / cancelled）
- 多 SMS 接收 + 换号 + 手动完成
- 池状态缓存 + 强制刷新
- 多供应商适配器（SMSPool / SMSBower）
- 管理端完整 CRUD

### 一期补充功能

| 功能 | 说明 |
|------|------|
| CDK 列表服务端分页 | 当前全量返回 + 前端过滤，数据量大时性能差；改为服务端分页，过滤移到 SQL |
| CDK 批量作废 | 新增 `POST /api/cdks/batch-disable`，前端 CDK 列表加复选框和批量操作栏 |
| pool API 返回真实 `cachedAt` | 当前前端存的是"点击查询的时间"（sessionStorage），并非数据实际更新时间；后端返回 DB 里的 `cached_at`，前端显示"数据时间" |
| Cron 清理超时 pending 订单 | timed CDK 的 pending 订单如果用户不再 poll，会永久挂起；Cron 定期清理 |

### 二期功能（已记录，暂不实现）

- Webhook 告警通知（代码中 `NOTIFY_WEBHOOK_URL` 已占位）
- 订单数据 CSV 导出（对账用）
- 号池健康状态趋势图

---

## 三、日志方案

### 架构设计

| 层 | 实现 | 用途 |
|----|------|------|
| 实时日志 | 结构化 JSON `console.log` | Cloudflare Workers Dashboard 实时 tail，支持字段过滤 |
| 持久审计日志 | D1 `audit_logs` 表 | 历史查询、对账、异常追踪 |
| 请求关联 | requestId（每请求生成 UUID） | 把一次请求的所有日志关联在一起 |

### 结构化日志格式

```typescript
// src/lib/logger.ts
export function log(event: string, meta: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...meta }))
}

// 用法示例
log('order.created', { requestId, cdkId, serviceId, ip })
log('order.status_changed', { requestId, orderId, from: 'pending', to: 'received' })
log('provider.cancel_failed', { requestId, orderId, provider: 'smsbower', error: err.message })
```

### requestId 注入方式

```typescript
// Hono 中间件
app.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID())
  await next()
})
```

### audit_logs 表结构

```sql
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,         -- 'cdk.validated' | 'order.created' | 'order.status_changed' | 'cdk.exhausted' | 'cancel.failed'
  entity_type TEXT NOT NULL,   -- 'cdk' | 'order'
  entity_id TEXT NOT NULL,     -- 对应的 cdkId 或 orderId
  meta TEXT,                   -- JSON: ip、旧状态、新状态、错误信息等
  created_at TEXT NOT NULL
);

CREATE INDEX idx_audit_entity ON audit_logs(entity_id, created_at);
CREATE INDEX idx_audit_event ON audit_logs(event, created_at);
```

### 必须记录的关键事件

| 事件 | 触发时机 |
|------|----------|
| `cdk.validated` | 用户成功验证 CDK 码 |
| `order.created` | 创单成功（含 IP） |
| `order.status_changed` | 订单状态流转（pending→received 等） |
| `cdk.exhausted` | CDK 耗尽或过期 |
| `cancel.failed` | 运营商取消号码失败 |

---

## 四、技术方案

### 限流方案：D1 原子 UPSERT 固定窗口

```sql
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,         -- 如 "validate:1.2.3.4"
  count INTEGER NOT NULL DEFAULT 1,
  window_start TEXT NOT NULL
);
```

每次请求执行单条原子操作：

```sql
INSERT INTO rate_limits (key, count, window_start)
VALUES (?, 1, datetime('now'))
ON CONFLICT(key) DO UPDATE SET
  count = CASE
    WHEN window_start > datetime('now', '-60 seconds') THEN count + 1
    ELSE 1
  END,
  window_start = CASE
    WHEN window_start > datetime('now', '-60 seconds') THEN window_start
    ELSE datetime('now')
  END
```

- 每个 IP 只有一行，无存储增长
- INSERT OR UPDATE 原子执行，无竞态
- 存在边界突发（最多 2× 限制量），对 CDK 枚举防护场景可接受
- 不需要 Cron 清理

### SMSBower 国家映射：配置文件 + fallback

- 把两张硬编码表（`ISO_TO_BOWER_KEY` 和 `isoToEngName`）提取到 `src/config/countries.ts`，统一维护
- 新增国家：修改配置文件，重新部署（变动不频繁）
- fallback 逻辑：如果 ISO 码不在 `ISO_TO_BOWER_KEY` 里，跳过内部 API 的国家过滤，由官方 API 路径兜底

### 数据库索引补全（Migration 0012）

```sql
CREATE INDEX IF NOT EXISTS idx_orders_cdk_id ON orders(cdk_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_cdk_status ON orders(cdk_id, status);
CREATE INDEX IF NOT EXISTS idx_order_sms_order_id ON order_sms(order_id);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts(ip_address, created_at);
```

### Migration 规划

| 文件 | 内容 |
|------|------|
| `0012_add_indexes.sql` | 补全 orders / order_sms / login_attempts 索引 |
| `0013_audit_logs.sql` | audit_logs 表 + 索引 |
| `0014_rate_limits.sql` | rate_limits 表 |

---

## 五、一期实施清单

按实施顺序排列：

### DB / Migration
- [ ] `0012` 补全索引
- [ ] `0013` audit_logs 表
- [ ] `0014` rate_limits 表

### 安全
- [ ] validate 端点改用 D1 持久化限流
- [ ] validate 接口"不存在"和"已失效"统一错误信息

### 核心修复
- [ ] pool API 响应加入 `cachedAt` 字段
- [ ] 前端号池监控"数据时间"改为显示 `cachedAt`
- [ ] SMSBower 取消失败写 audit_logs
- [ ] SMSBower `getCountries` 失败改为明确报错
- [ ] timed CDK `validityMinutes` 后端加范围校验
- [ ] SMSBower 国家映射提取到配置文件 + 加 fallback 逻辑

### 新功能
- [ ] CDK 列表服务端分页（过滤移到 SQL，前端加分页控件）
- [ ] CDK 批量作废（后端接口 + 前端复选框）
- [ ] Cron Job 清理超时 pending 订单
- [ ] audit_logs 管理端查询页（按时间/事件类型/entity_id 筛选）

### 日志
- [ ] 全局 requestId 中间件
- [ ] 统一结构化 JSON 日志工具（`src/lib/logger.ts`）
- [ ] 关键路径接入结构化日志
- [ ] 订单状态变更写 audit_logs
- [ ] CDK 核销写 audit_logs

---

## 六、二期 Backlog

| 功能 | 说明 |
|------|------|
| Webhook 告警 | 安全封禁触发、API 连续失败等事件推送 |
| 订单数据 CSV 导出 | 对账用 |
| ~~audit_logs 管理端查询页~~ | 已移至一期 |
| 限流升级为滑动窗口 | 如果边界突发成为实际问题 |
| 供应商删除级联保护 | 删除前检查是否有活跃订单 |
