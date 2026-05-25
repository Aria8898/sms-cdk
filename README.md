# SMS CDK 兑换系统 — 需求文档

## 一、项目概述

用户通过 CDK 兑换码获取一次性手机号码，用于接收指定平台的短信验证码。系统由用户前端页面和管理后台两部分组成，底层对接 SMSPool（及未来其他 SMS 平台）的 API。

---

## 二、核心流程

```
用户输入 CDK
  → 验证 CDK 有效（未过期、有剩余次数、无进行中订单）
  → 后端调用 SMS 平台取号
  → 前端显示号码 + 倒计时
  → 每 5 秒轮询短信状态
  → 收到短信 → 显示内容 → CDK 消耗一次次数 → 结束
  → 超时未收到 → 提示重新获取 → CDK 次数不消耗 → 可重试
```

---

## 三、数据模型关系

```
Provider（SMS 平台，如 SMSPool）
  └── Service（具体服务，如 Twitter、OpenAI）
        └── CDK（兑换码，绑定一个 Service）
              └── Order（每次兑换记录）
```

---

## 四、用户侧功能（前端页面，对外开放）

### 4.1 实现方式

用户端为**单页应用**，通过 `step` 状态控制显示哪个视图，不使用路由跳转。所有数据保存在同一个状态对象中，避免刷新丢失数据和跨页传参的问题。

```
step: 'input' → 'confirm' → 'waiting' → 'success'
                                       → 'timeout' → 'confirm'（重试）
      'error'（CDK 无效或已用完）
```

### 4.2 兑换流程

| 步骤 | 说明 |
|------|------|
| input | 用户输入 CDK，实时格式校验 |
| confirm | 显示服务名称、CDK 剩余可用次数，用户确认 |
| waiting | 显示分配的手机号码、倒计时（来自 SMS 平台 `time_left`） |
| success | 显示短信内容/验证码，CDK 次数 -1，流程结束 |
| timeout | 提示号码已超时，CDK 次数不消耗，可重新取号 |
| error | CDK 无效或已用完时展示，不进入兑换流程 |

### 4.3 限制规则

- 同一 CDK 有**进行中**的订单时，不允许再次兑换（防止并发超出次数）
- CDK 剩余次数为 0 时，直接进入 error 视图
- 无需用户注册，匿名使用

### 4.4 前端轮询

- 间隔：每 **5 秒**轮询一次订单状态
- 后端收到轮询请求后调用 SMS 平台 Check 接口
- 订单状态：`pending` / `completed` / `expired` / `cancelled`

---

## 五、管理后台（仅内部使用，账号密码登录）

### 5.1 登录

- 单账号，用户名 + 密码
- 不对外开放

### 5.2 Provider 管理

| 功能 | 说明 |
|------|------|
| 添加 Provider | 填写平台名称，对应 API Key 存于环境变量 |
| 删除 Provider | 需确认，删除前检查是否有关联 Service |

> API Key 统一存放在环境变量中，不入库，安全可靠。

### 5.3 Service 管理

| 功能 | 说明 |
|------|------|
| 添加 Service | 填写服务名、SMSPool service ID、所属 Provider、成功率阈值、最高单价 |
| 删除 Service | 需确认，删除前检查是否有关联 CDK |
| 编辑配置 | 可修改成功率阈值和最高单价 |

**Service 字段：**

| 字段 | 说明 |
|------|------|
| 服务名 | 如 Twitter、OpenAI |
| 服务缩写 | 用于 CDK 前缀，如 `TW`、`OP` |
| SMSPool service ID | 对接 SMSPool 时的服务标识 |
| 所属 Provider | 选择使用哪个 SMS 平台 |
| 成功率阈值 | 选号时过滤掉低于此成功率的国家（%） |
| 最高单价 | 超过此价格的号码不选（单位：USD） |

### 5.4 CDK 管理

| 功能 | 说明 |
|------|------|
| 批量生成 | 选择 Service、设置每张可用次数、填写生成数量 |
| CDK 列表 | 查看所有 CDK，支持按状态过滤 |
| CDK 详情 | 查看该 CDK 的每次使用记录 |
| 停用 / 启用 | 停用后 CDK 无法被兑换，可随时重新启用；有进行中订单时不允许停用 |
| 删除 | 仅允许删除从未使用过的 CDK（无任何兑换记录），保留审计日志 |

**CDK 格式：**

```
{服务缩写}-XXXX-XXXX-XXXX
示例：OP-A3KF-9ZMR-B72X
```

- 字符集：大写字母 + 数字，排除易混淆字符（`0` `O` `1` `I` `L`）
- 共 32 个有效字符，12 位随机码

**CDK 状态：**

| 状态 | 说明 |
|------|------|
| 可用 | 有剩余次数，可正常兑换 |
| 使用中 | 有进行中的订单（占用中） |
| 已用完 | 剩余次数为 0 |
| 已停用 | 管理员手动停用，无法兑换，可重新启用 |

**Order 使用记录字段：**

| 字段 | 说明 |
|------|------|
| 兑换时间 | 发起兑换的时间 |
| 分配的号码 | SMSPool 返回的手机号 |
| 短信内容 | 收到的完整短信 |
| 验证码 | 从短信中提取的验证码（如有） |
| 结果 | 成功 / 超时 / 取消 |
| 完成时间 | 收到短信或超时的时间 |

---

## 六、选号策略

后端调用 SMS 平台取号时，按以下规则自动选择国家：

1. 获取该服务下所有可用国家及其成功率和价格
2. 过滤掉成功率低于该 Service 配置阈值的国家
3. 过滤掉单价超过该 Service 最高单价的国家
4. 在剩余国家中选**最便宜**的下单

---

## 七、扩展性设计

采用**适配器模式**隔离 SMS 平台，核心业务逻辑只依赖统一接口：

```
SmsProvider Interface
  ├── orderNumber(serviceId, options)   取号
  ├── checkSms(orderId)                 查短信
  ├── cancelOrder(orderId)              取消订单
  └── getOrderStatus(orderId)           获取订单状态

SmsPoolAdapter   implements SmsProvider   ← 当前实现
FutureAdapter    implements SmsProvider   ← 未来扩展
```

新增 SMS 平台时，只需新增一个适配器 + 配置环境变量，原有 CDK/Order 逻辑无需改动。

---

## 八、第一期 / 第二期范围

### 第一期（当前）
- 用户兑换流程（完整）
- 管理后台（Provider / Service / CDK 管理）
- 选号策略
- 适配器扩展架构

### 第二期
- 数据统计看板（今日消耗次数、余额、成功率等）
- 更多 SMS 平台接入

---

## 九、技术方案

### 部署架构

```
用户 / 管理员浏览器
        ↓ HTTP
Cloudflare Pages（前端静态资源）
        ↓ API 请求
Cloudflare Workers（后端 API）
        ↓
Cloudflare D1（SQLite 数据库）
        ↓
SMSPool API（外部，服务端调用，浏览器不可见）
```

### 域名规划

| 域名 | 用途 |
|------|------|
| `api.yourdomain.com` | Cloudflare Workers，唯一后端入口 |
| `app.yourdomain.com` | 用户兑换页面 |
| `admin.yourdomain.com` | 管理后台，可加 Cloudflare Access 双重防护 |

### 技术选型

| 层 | 选型 |
|---|---|
| 前端 | React + TypeScript + Vite |
| 后端 | Cloudflare Workers + Hono 框架 |
| 数据库 | Cloudflare D1（SQLite） |
| ORM | Drizzle ORM |
| 样式 | Tailwind CSS |
| 管理后台认证 | JWT + Cookie |
| 包管理 | pnpm workspace（monorepo） |

### 项目结构

```
sms-cdk/
  apps/
    web/          # 用户前端（兑换页面）
    admin/        # 管理后台
    api/          # Cloudflare Workers（Hono）
  packages/
    db/           # Drizzle schema + migrations
    adapters/     # SMS 平台适配器
      smspool.ts
      index.ts    # 统一接口定义
```

### 安全说明

所有 SMS 平台的 API 调用均在 Workers 服务端执行，浏览器只能看到自有域名的请求，SMSPool API Key、实际调用接口、请求参数对用户完全不可见。

### 并发控制

CDK 兑换时使用 D1 事务保证原子性，防止同一 CDK 被并发超额使用：

```
BEGIN TRANSACTION
  1. 查询 CDK 是否有效（剩余次数 > 0，无 pending 订单）
  2. 插入 order 记录（status = pending）
COMMIT
↓
调用 SMSPool 取号（事务外）
```

### 免费额度参考

| 服务 | 免费额度 |
|------|------|
| Cloudflare Workers | 100,000 请求/天 |
| Cloudflare D1 | 5GB 存储，500 万行读/天 |
| Cloudflare Pages | 无限制 |
