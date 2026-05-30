# V2 开发计划

基于 [README.md](./README.md) 中的需求设计，分 7 个步骤实施。  
每一步完成后均可独立测试，有实际可见的效果。

> 前提：现有 SMSPool 基础功能已完成（兑换流程、管理后台、号池监控基础版）。

---

## 本地 Mock 开发工具

**目标：** 本地调试体验问题时绕过真实取号和 SMS 接收，无需消耗真实号码或等待短信。

| 层  | 改动                                                                                          |
| --- | --------------------------------------------------------------------------------------------- |
| Web | `apps/web/src/lib/api.ts` 加 mock 实现层（~50 行）                                            |
| Web | `apps/web/src/pages/Home.tsx` 末尾加浮层控制台组件（~70 行，仅 `import.meta.env.DEV` 下渲染） |

**数据库影响：**

- `createOrder` / `pollOrder` / `retryOrder` / `finishOrder` 全部被拦截，**不产生任何订单记录，CDK 不扣次数**
- `validate` 保持真实请求，仅写 `pool_status_cache`（无害缓存）

**控制台 UI（页面右下角浮层）：**

```
┌─────────────────────────┐
│  🧪 Mock 控制台          │
│                         │
│  场景                   │
│  ● received (默认)      │
│  ○ completed (直达成功) │
│  ○ timeout              │
│  ○ create_fail          │
│  ○ retry_fail           │
│  ○ finish_fail          │
│  ○ cancel_fail          │
│  ○ change_fail          │
│                         │
│  延迟  [====|----] 3s   │
│  canRetry  [ON ]        │
│  跳过冷却  [OFF]        │
└─────────────────────────┘
```

**可覆盖的测试场景：**

| 场景                              | 覆盖的 UI 分支                                        |
| --------------------------------- | ----------------------------------------------------- |
| `received` + canRetry=true        | waiting → received，倒计时 + 再发一条 + 完成          |
| `received` + canRetry=false       | waiting → received，仅显示再次兑换                    |
| `completed`                       | waiting → success 直达（SMSPool 路径，跳过 received） |
| `timeout`                         | waiting → timeout                                     |
| `create_fail`                     | confirm 页 createOrder 失败 errorMsg                  |
| `retry_fail`                      | received 页再发一条失败 errorMsg                      |
| `finish_fail`                     | received 页完成失败 errorMsg                          |
| `cancel_fail` + 跳过冷却=ON      | waiting 页取消取号失败 errorMsg                       |
| `change_fail` + 跳过冷却=ON      | waiting 页换号失败 errorMsg                           |
| `received` + 跳过冷却=ON         | waiting 页取消成功（→ confirm）/ 换号成功（新号码）   |
| `received` + 跳过冷却=ON（换 2 次）| 换号上限：按钮置灰"已达换号上限"                   |

**无法覆盖（需真实流程）：**

- CDK 次数实时扣减（使用真实 CDK 验证一次即可）

---

## UI 重建 · 单页渐进展开

**目标：** 将当前分步骤跳转式 UI 重构为单页渐进展开设计，提升信息连续性和使用体验，同时为 Step 6 的多次接码 / 历史记录做好结构准备。

| 层  | 改动                                                                 |
| --- | -------------------------------------------------------------------- |
| Web | `apps/web/src/pages/Home.tsx` 重构为单页三区域布局，移除步骤跳转逻辑 |
| Web | `apps/web/src/index.css` 新增 CSS 变量（主题色、深色模式框架）       |

**三区域结构：**

```
┌─────────────────────────────────────────────────────┐
│  区域 A：CDK 输入 & 状态条（始终渲染）               │
│  初始：大输入框  →  会话激活：信息条 + 输入框锁定     │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│  区域 B：活跃会话（验证通过后展开）                   │
│  confirm 阶段：运营商选择 + 确认按钮                  │
│  会话激活后：左栏（号码+操作）/ 右栏（验证码）         │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│  区域 C：接收历史（收到第一条短信后展开）              │
└─────────────────────────────────────────────────────┘
```

**技术实现要点：**

- 不再用 `step` 状态做全页切换，改为各区域内部维护自身显示逻辑
- 主题色通过 CSS 变量 `--color-primary: #4F46E5` 定义，`.dark` 类切换深色值
- 验证码展示：浅灰背景 + 大号 Indigo 数字（非色块背景）
- 状态徽标：`● 监测中` / `验证码: N/M次` / `换号: N/2次`
- 行动按钮含剩余次数文案：「再发一条（剩 N 次）」
- 移动端：区域 B 双栏折叠为单栏（号码上，验证码下）

**可见效果：**
CDK 信息始终可见；运营商选择和会话信息在区域 B 内无缝切换；验证码作为视觉焦点突出展示；接收历史在多次接码后自然展开，无需新增页面。

**与其他 Step 的关系：**

- UI 重建可独立完成，不依赖后端 Step 1–8
- 区域 C（接收历史）留好结构后，Step 6 接入时直接填充数据即可

---

## 依赖关系

```
Step 1 (Provider 别名)
  └── Step 2 (ServiceCategory 模型重构)
        └── Step 3 (CDK 国家专属)
              └── Step 4 (validate 改造 + 运营商选择)
                    ├── Step 5 (SMSBower 适配器)  ← 可与 Step 4 并行
                    │     └── Step 6 (SMSBower 兑换流程)
                    │           ├── Step 8 (取消 + 换号)  ← 依赖 Step 6
                    │           └── Step 9 (短效时效型 CDK)  ← 依赖 Step 6
                    └── Step 7 (切换运营商 + 行为日志)  ← 依赖 Step 4 和 Step 6
```

Step 5 的号池监控视图部分可在 Step 4 之前单独完成，不阻塞主流程。

---

## Step 1 · Provider 别名

**目标：** Admin 可为运营商配置对外显示的别名，为 C 端信息隐藏打基础。

| 层    | 改动                                                          |
| ----- | ------------------------------------------------------------- |
| DB    | `providers` 表加 `alias TEXT NOT NULL`                        |
| 后端  | `providers` 路由：创建/编辑 alias 必填校验；响应中不返回 slug |
| Admin | Provider 管理页加 alias 输入框（必填，未填不允许保存）        |

**可见效果**  
Admin 保存 Provider 时必须填写别名（如"运营商 A"）。已有 Provider 需补填后方可继续使用。

**风险提示**  
小改动，无迁移风险。

---

## Step 2 · ServiceCategory 模型重构

**目标：** 将服务类型（如"OpenAI 验证码"）从具体运营商实现中解耦，支持同一服务类型下挂多个运营商。

| 层       | 改动                                                                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB       | 新增 `service_categories` 表（id / name / short_name / created_at）；`services` 加 `category_id`、`is_default`、`pool_status_id`，移除 `name`、`short_name` |
| 数据迁移 | 将现有每条 service 的 name/short_name 写入新建的 service_category 记录，并回填 category_id                                                                  |
| 后端     | 新增 `service_categories` 路由（CRUD）；更新 `services` 路由（按 category 分组返回）；`is_default` 写入时校验同一 category 下唯一                           |
| Admin    | Service 管理页重构为分组视图：ServiceCategory 为一行，展开后展示各运营商实现；支持标记推荐运营商（⭐）                                                      |

**可见效果**  
Admin Service 管理页变为分组形式。可创建服务类型、在同一类型下添加多个运营商实现、切换推荐运营商。现有数据自动迁移，原有兑换流程不中断。

**风险提示**  
本步骤改动最大，涉及核心数据模型变更。需在迁移脚本执行前备份数据，验证迁移前后 CDK 兑换流程正常。

---

## Step 3 · CDK 国家专属 + 格式更新

**目标：** CDK 可绑定指定国家，用于只取特定国家号码的场景。

| 层    | 改动                                                                                                                                                                  |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB    | `cdks` 将 `service_id` 改为 `category_id`（FK → service_categories）；加 `country_code TEXT nullable`（ISO 码，如 `US`）                                              |
| 后端  | CDK 生成逻辑：支持写入 countryCode，更新 CDK 格式生成规则；validate 接口：从 category 获取服务名；选号策略：若 countryCode 非空，仅在该国家范围内选号，无号码直接报错 |
| Admin | CDK 批量生成页加「指定国家」可选下拉（不选则为普通 CDK）；CDK 列表加国家列                                                                                            |
| Web   | confirm 步骤：有 countryCode 时展示国家标记，如「🇺🇸 美国专属」                                                                                                        |

**CDK 格式：**

| 类型     | 格式                     | 示例                |
| -------- | ------------------------ | ------------------- |
| 普通     | `{缩写}-XXXX-XXXX-XXXX`  | `OP-A3KF-9ZMR-B72X` |
| 国家专属 | `{缩写}-{ISO}-XXXX-XXXX` | `OP-US-A3KF-9ZMR`   |

**可见效果**  
Admin 可生成国家专属 CDK，格式上一眼可区分；用户兑换时 confirm 页看到国家标记；取号若该国无库存则直接报错，不 fallback。

**风险提示**  
CDK 格式变更，validate 解析逻辑需同步更新，注意已有 CDK（旧格式）仍可正常使用。

---

## Step 4 · validate 改造 + 运营商选择（Web）

**目标：** validate 接口返回可用运营商列表，Web confirm 步骤展示运营商选择，用户可切换。

| 层   | 改动                                                                                                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DB   | 新增 `pool_status_cache` 表（service_id / data / cached_at）；`orders` 加 `service_id`（记录实际使用的运营商）                                                                       |
| 后端 | validate 接口：并发查各运营商号池缓存，返回 pools 列表（alias / isDefault / hasStock）；order 接口：接受并校验 `serviceId` 参数；缓存逻辑：5 分钟 TTL，支持 `?refresh=true` 强制刷新 |
| Web  | confirm 步骤加运营商选择 UI：默认选推荐，可下拉切换，无库存的置灰                                                                                                                    |

**validate 响应示例：**

```json
{
  "cdkId": "uuid",
  "service": "OpenAI 验证码",
  "countryCode": "US",
  "remaining": 3,
  "pools": [
    {
      "serviceId": "uuid-1",
      "alias": "运营商 A",
      "isDefault": true,
      "hasStock": true
    },
    {
      "serviceId": "uuid-2",
      "alias": "运营商 B",
      "isDefault": false,
      "hasStock": false
    }
  ]
}
```

**可见效果**  
用户兑换时可在 confirm 步骤看到运营商选项（显示别名），无库存的自动置灰。现阶段只有 SMSPool 一个选项，但框架已就位，后续接入 SMSBower 自动出现。

**风险提示**  
validate 接口需并发读多个缓存，注意缓存冷启动（首次查询）时的超时处理，建议设 3 秒超时兜底。

---

## Step 5 · SMSBower 适配器 + 号池监控新视图

**目标：** 接入 SMSBower 平台，号池监控支持 SMSBower 专用视图。

| 层    | 改动                                                                                                                                                                                                                                                                                      |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 后端  | 新增 `smsbower.ts`：实现 `orderNumber` / `pollOrder` / `cancelOrder` / `getPoolStatus` / `retryOrder` / `confirmOrder`；更新 `adapters/index.ts`（getProvider 加 smsbower case）；更新 `adapters/types.ts`（PollResult.status 加 `received`，PoolCountryStatus 加 `rank?` / `agentIds?`） |
| 后端  | `pool.ts`：SMSBower 分支，平铺展示所有 position，排序：Gold → Silver → Bronze → rate 降序 → 价格升序；读 pool_status_cache，支持 `?refresh=true`                                                                                                                                          |
| Admin | 号池监控：新增 SMSBower 专用表格（国家 / 交付率 / 等级 / 供应商 ID / 库存 / 价格）；页面顶部加 Rank 等级说明卡片（Gold / Silver / Bronze 交付率区间）                                                                                                                                     |

**SMSBower API 使用：**

| 方法          | 使用接口                                          |
| ------------- | ------------------------------------------------- |
| getPoolStatus | 内部 `getPricesByService`，降级 `getPricesV3`     |
| orderNumber   | 官方 `getNumberV2`（传 providerIds）              |
| pollOrder     | 官方 `getStatus`，STATUS_OK → returned `received` |
| cancelOrder   | 官方 `setStatus&status=8`                         |
| retryOrder    | 官方 `setStatus&status=3`                         |
| confirmOrder  | 官方 `setStatus&status=6`                         |

**activationTime 处理：** 实测为激活创建时间（非到期时间），无法计算剩余秒数，固定返回 1200 秒（20 分钟）。

**可见效果**  
Admin 号池监控可查询 SMSBower 的供应商级别数据，看到 Gold/Silver/Bronze 等级分布和价格。同时 Step 4 的运营商选择中自动出现 SMSBower 选项。

**风险提示**  
SMSBower 内部 API（`smsbower.app`）未公开，可能不稳定，降级逻辑需充分测试。`activationTime` 格式需在实际调试中确认。

---

## Step 6 · SMSBower 完整兑换流程（含再发一条）

**目标：** SMSBower 兑换全流程可用，支持同一激活内多次接收短信。

| 层    | 改动                                                                                                                                                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB    | 新增 `order_sms` 表（id / order_id / sms_content / verification_code / received_at）；`orders.status` 支持 `received` 值                                                                                                                          |
| 后端  | pollOrder 检测到 `received` 状态时：写入 order_sms、扣减 CDK、返回 `received` + `canRetry`；新增 `POST /api/cdk/order/:id/retry`（调 retryOrder，订单回到 pending）；新增 `POST /api/cdk/order/:id/finish`（调 confirmOrder，订单标为 completed） |
| Web   | received 状态 UI：显示验证码；canRetry=true 时显示倒计时 + 【再发一条】+ 【完成】；canRetry=false 时仅显示【再次兑换】（静默 finish 当前订单 + 回到 input）；倒计时后台兜底自动调 finish（不展示给用户）                                          |
| Admin | CDK 详情订单记录：展示 order_sms 多条短信历史（短信内容 / 验证码 / 接收时间）                                                                                                                                                                     |

**received 状态下的 CDK 扣减规则：**

| 事件                  | 操作                                                             |
| --------------------- | ---------------------------------------------------------------- |
| STATUS_OK（收到短信） | 写 order_sms + CDK 扣 1 次                                       |
| 扣后 remaining > 0    | 前端显示【再发一条】                                             |
| 扣后 remaining = 0    | 仅显示【再次兑换】，无倒计时；用户点击或后台倒计时兜底时自动完成 |

**可见效果**  
SMSBower 完整兑换链路可用：取号 → 收到验证码 → 可选再发一条（扣次数）或完成；Admin CDK 详情可看到同一订单内的多条短信记录。

**风险提示**  
received 状态下可能存在并发重复扣减（轮询和 retry 同时触发），需在写 order_sms 时加幂等判断（如检查同一 order 在同一秒内是否已有记录）。

---

## Step 7 · 切换运营商 + 完整行为日志

**目标：** 用户遇到取号失败或超时时可主动切换运营商重试，Admin 可追踪完整切换链路。

| 层    | 改动                                                                                                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB    | `orders` 加 `cancelled_reason TEXT nullable`、`from_order_id TEXT nullable`（FK → orders.id）                                                                                                     |
| 后端  | 取消订单接口接受可选 `reason` 参数；新建订单接口接受可选 `fromOrderId` 参数；切换逻辑：cancel 旧 order（reason = `user_switched_pool`）→ 前端回 confirm → 新建 order（fromOrderId = 旧 order id） |
| Web   | waiting / timeout 步骤加「换一个运营商试试」入口；点击后回到 confirm 步骤，自动选中另一个运营商                                                                                                   |
| Admin | CDK 详情：订单列表展示 cancelledReason 中文文案；切换链路展示（订单 #1 [已取消 - 用户切换运营商] → 订单 #2 [已完成]）                                                                             |

**cancelledReason 文案：**

| 枚举值               | 显示文案       |
| -------------------- | -------------- |
| `timeout`            | 超时未收到短信 |
| `user_switched_pool` | 用户切换运营商 |
| `user_cancelled`     | 用户主动取消   |

**可见效果**  
用户超时或失败后可一键切换运营商重试，CDK 次数不额外消耗；Admin CDK 详情能看到完整切换链路，知道用户等了多久、切换了几次。

**风险提示**  
切换时需确保旧订单已 cancel 且 SMSBower 已调 setStatus=8（尽力，忽略失败），再创建新订单，避免出现两个 pending 订单。

---

## Step 8 · 取消取号 + 换号

**目标：** 用户在等待阶段可主动取消或换一个号码，提升兑换体验，同时通过冷却期和换号上限防止滥用。

| 层   | 改动                                                                                                                                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB   | `orders` 表加 `change_count INTEGER NOT NULL DEFAULT 0`                                                                                                                                                                                                                   |
| 后端 | 新增 `POST /api/cdk/order/:id/cancel`：校验 order 处于 pending 状态，调 adapter.cancelOrder()，标记为 cancelled；`POST /api/cdk/order/:id/change`：校验 changeCount < 2，调 cancelOrder() + orderNumber()，同一 orderId 更新号码 / expiresIn / changeCount +1 / orderedAt |
| 后端 | `POST /api/cdk/order` 响应新增 `changeCount` 和 `orderedAt` 字段                                                                                                                                                                                                          |
| Web  | waiting 步骤新增【取消】【换号】两个按钮；共用一个 2 分钟倒计时（`orderedAt + 120s - now`）；换号 changeCount ≥ 2 时按钮置灰 + "已达换号上限"；取消成功后回到 confirm 步骤                                                                                                |

**后端校验逻辑：**

| 接口   | 校验条件                                             |
| ------ | ---------------------------------------------------- |
| cancel | order.status === 'pending'                           |
| change | order.status === 'pending' AND order.changeCount < 2 |

**冷却期与换号上限说明：**

- 2 分钟冷却对齐 SMSBower EARLY_CANCEL_DENIED 限制，对 SMSPool 同样适用（统一体验）
- 冷却期由前端通过 `orderedAt` 字段计算，无需后端额外接口
- 换号上限 2 次存于后端 `change_count`，切换浏览器 / 新 session 从 0 重计（可接受）

**可见效果**  
waiting 步骤出现取消和换号按钮；取号后 2 分钟内按钮禁用并显示倒计时；换号 2 次后按钮置灰；取消后回到运营商选择步骤。

**风险提示**  
换号时需先取消再取号，若取号失败（如无库存），旧号已释放。建议后端先调 cancelOrder 再调 orderNumber，失败时返回明确错误，前端提示用户重试。

---

## Step 9 · 短效时效型 CDK（Type A）

**目标：** 支持以时间为限制的 CDK 类型，有效期内无限接码不扣次数，到期自动失效。

> 完整需求规格见 [CDK-TYPE-A-SPEC.md](./CDK-TYPE-A-SPEC.md)。

| 层 | 改动 |
|----|------|
| DB | `cdks` 表新增 `cdk_type TEXT NOT NULL DEFAULT 'count'`（枚举：`count` / `timed`）；新增 `validity_minutes INTEGER` |
| 后端 | `validate`：检测进行中订单返回 `activeOrder`；timed CDK 过期时错误响应附带 `expiresAt` + `lastOrderedAt` |
| 后端 | `order`：timed 类型 `expiresAt = now + validity_minutes × 60s` |
| 后端 | `order/:id/change`：timed 类型换号时同步重置 `expiresAt` |
| 后端 | `order/:id/status`：timed 类型 `canRetry = expiresAt > now`；`expired` 路径区分两种情况（见下） |
| 后端 | `admin/cdks/generate`：新增 `cdkType` / `validityMinutes` 参数 |
| Web | 会话恢复：validate 返回 `activeOrder` 时跳过 confirm，直接还原到 pending/received 状态 |
| Web | 过期提示：展示"CDK 已于 XX 过期，最后取号时间：YY" |
| Web | 离开页面警告：timed CDK 在 pending/received 状态下显示提示条"请在有效期内完成操作，到期后将无法继续" |
| Web | 倒计时改为根据 `expiresAt` 动态计算；区域 A 状态条显示到期时间 |
| Admin | CDK 生成页加类型选择（按次 / 时效）+ 有效分钟数输入；CDK 列表加类型列 |

**核心状态流转（两种 expired 路径）：**

| 情况 | 订单状态 | CDK 状态 | 说明 |
|------|----------|----------|------|
| pending 到期，0 条短信 | `expired` | `active` | 未激活，不算消耗，CDK 可再次使用 |
| received 到期，≥1 条短信 | `expired` | `exhausted` | 已激活，算消耗，CDK 不可再用 |

**注：** "激活"定义为收到至少 1 条短信（取号 ≠ 激活）。换号后 `expiresAt` 重置（每次换号从换号时刻重新计算有效期）。

**会话恢复** 同时对 count 型 CDK 生效（validate 统一处理 `activeOrder`，count 型 received 状态也可恢复）。

**可见效果**
Admin 可生成时效型 CDK，填入有效分钟数；用户兑换时倒计时根据 CDK 配置显示；有效期内无限再发一条不扣次；用户中途离开页面，有效期内重新输入 CDK 可恢复当前会话；时效到期后 CDK 自动失效，未收到短信的 CDK 可再次使用。

**风险提示**
`expired` 路径需区分"未激活到期"和"已激活到期"两种情况，状态更新逻辑需确保 CDK 状态与订单状态同步写入，避免 CDK 错误归还 active 或错误标为 exhausted。

---

## 各步骤风险一览

| Step | 改动规模 | 主要风险                                                             |
| ---- | -------- | -------------------------------------------------------------------- |
| 1    | 小       | 无                                                                   |
| 2    | **大**   | 数据迁移，需备份；迁移前后核心流程需回归测试                         |
| 3    | 中       | CDK 格式变更，旧 CDK 需兼容解析                                      |
| 4    | 中       | 缓存冷启动超时；validate 并发请求多个外部 API                        |
| 5    | 大       | SMSBower 内部 API 稳定性                                             |
| 6    | 中       | received 并发重复扣减 CDK                                            |
| 7    | 小       | 切换时两个订单并存的状态一致性                                       |
| 8    | 小       | 换号时 cancelOrder 成功但 orderNumber 失败，旧号已释放需提示用户重试 |
| 9    | 中       | expired 路径需区分两种情况，CDK 状态与订单状态需同步写入；validate 改动涉及 count 和 timed 两种类型，需回归测试 |
