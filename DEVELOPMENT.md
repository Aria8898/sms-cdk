# 开发计划

每一步完成后都有可见的页面效果，按步骤推进。

---

## Step 1：项目骨架搭建

**目标：** 三个应用能本地运行，看到基础页面框架

- 初始化 pnpm monorepo 结构
- 创建 `apps/web`、`apps/admin`、`apps/api` 三个应用
- 配置 TypeScript、Tailwind CSS、基础路由
- `apps/api` 跑通 Hono Hello World

**可见效果：**
- `localhost:5173` → 用户端首页框架（含 CDK 输入框占位）
- `localhost:5174` → 管理后台框架（含侧边栏导航占位）

---

## Step 2：用户端完整 UI（mock 数据）

**目标：** 用户侧完整兑换流程可点击演示，不接真实接口

页面清单：

| 页面 | 路由 | 说明 |
|------|------|------|
| CDK 输入页 | `/` | 输入框 + 提交按钮 |
| CDK 确认页 | `/redeem` | 显示服务名、剩余次数、确认按钮 |
| 等待短信页 | `/waiting` | 手机号 + 倒计时 + 轮询状态 |
| 成功页 | `/success` | 显示短信内容/验证码 |
| 超时页 | `/timeout` | 提示超时 + 重新获取按钮 |
| 错误页 | `/error` | CDK 无效、已用完等提示 |

**可见效果：**
- 完整用户流程可以在本地点击走通（数据全部 mock）

---

## Step 3：管理后台完整 UI（mock 数据）

**目标：** 管理后台所有页面可点击演示，不接真实接口

页面清单：

| 页面 | 路由 | 说明 |
|------|------|------|
| 登录页 | `/login` | 用户名 + 密码 |
| Provider 列表 | `/providers` | 列表 + 添加/删除 |
| Service 列表 | `/services` | 列表 + 添加/编辑/删除 |
| CDK 列表 | `/cdks` | 列表 + 状态筛选 + 批量生成入口 |
| CDK 批量生成 | `/cdks/generate` | 选服务、设次数、填数量、生成 |
| CDK 详情 | `/cdks/:id` | 基本信息 + 使用记录列表 |

**可见效果：**
- 管理后台所有页面可以在本地点击走通（数据全部 mock）

---

## Step 4：数据库 + 管理后台接口

**目标：** 管理后台接入真实数据，可以实际创建和管理数据

- 设计 D1 数据库 Schema（Drizzle）
- 实现管理后台登录接口（JWT）
- 实现 Provider CRUD 接口
- 实现 Service CRUD 接口
- 实现 CDK 生成 + 列表 + 详情接口
- 管理后台前端替换 mock 数据，接入真实 API

数据库表：

```
providers    id, name, slug, created_at
services     id, provider_id, name, short_name, external_service_id, success_rate_threshold, max_price, created_at
cdks         id, code, service_id, total_uses, remaining_uses, status, created_at
orders       id, cdk_id, external_order_id, phone_number, sms_content, verification_code, status, created_at, completed_at, expires_at
```

**可见效果：**
- 登录后台，真实创建 Provider、Service、CDK，刷新后数据仍在

---

## Step 5：SMS 适配器 + 兑换核心流程

**目标：** 用户端接入真实接口，完整兑换流程端到端跑通

- 实现 `SmsProvider` 统一接口定义
- 实现 `SmsPoolAdapter`（取号、查短信、取消）
- 实现选号策略（成功率过滤 + 最低价）
- 实现 CDK 验证接口（含并发事务控制）
- 实现取号接口
- 实现轮询接口（查短信状态）
- 用户端前端替换 mock 数据，接入真实 API

**可见效果：**
- 用真实 CDK 完整走通：输入 → 取号 → 等待 → 收到短信 → 结束

---

## Step 6：超时、错误处理与收尾

**目标：** 所有异常情况处理完整，准备上线

- 超时自动检测（轮询时发现 SMSPool 订单已过期）
- 各类错误提示完善（取号失败、无可用号码等）
- CDK 使用记录写入完整（短信内容、完成时间等）
- 管理后台 CDK 详情页展示真实使用记录

**可见效果：**
- 模拟超时流程可走通
- 管理后台可查看完整兑换记录

---

## Step 7：部署上线

**目标：** 正式部署到 Cloudflare

- 注册/配置域名
- 部署 Workers API
- 部署 Pages（web + admin 分别部署）
- 配置环境变量（SMSPool API Key、JWT Secret 等）
- Cloudflare Access 保护 admin 域名（可选）

**可见效果：**
- 两个线上域名均可访问，完整功能可用

---

## 进度追踪

| Step | 状态 | 备注 |
|------|------|------|
| Step 1：项目骨架 | ⬜ 待开始 | |
| Step 2：用户端 UI | ⬜ 待开始 | |
| Step 3：管理后台 UI | ⬜ 待开始 | |
| Step 4：数据库 + 管理接口 | ⬜ 待开始 | |
| Step 5：SMS 适配器 + 兑换流程 | ⬜ 待开始 | |
| Step 6：超时与收尾 | ⬜ 待开始 | |
| Step 7：部署上线 | ⬜ 待开始 | |
