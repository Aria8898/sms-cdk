# SMSBower API 接口文档

## 概述 (Overview)

API 允许您的软件与我们的激活服务器之间进行通信，以实现短信 (SMS)、OTP 和 PVA 接收过程的自动化。
本 API 与竞品网站完全兼容。

- **基础请求地址:** `https://smsbower.page/stubs/handler_api.php`
- **支持的请求方法:** `GET` 或 `POST`
- **公共必填参数:** `api_key` (必须包含在所有请求中)

---

## 1. 账号与余额

### 获取余额 (Get Balance)

- **请求地址:** `?api_key=$api_key&action=getBalance`
- **参数:**
  - `api_key`: 您的 API 密钥
- **成功响应:** `ACCESS_BALANCE:$yourBalance` (例如: `ACCESS_BALANCE:15.50`)
- **错误码:**
  - `BAD_KEY` - API 密钥无效

---

## 2. 核心功能: 手机号与短信验证码

### 2.1 获取手机号 (Get phone number)

- **请求地址:** `?api_key=$api_key&action=getNumber&service=$service&country=$country&maxPrice=$maxPrice&providerIds=$providerIds&exceptProviderIds=$exceptProviderIds&phoneException=$phoneException&ref=$ref&userID=$userID&minPrice=$minPrice`
- **参数:**
  - `service`: 服务代码 (可选，详见获取服务列表)
  - `country`: 国家代码 (可选，详见获取国家列表)
  - `maxPrice`: 您愿意购买号码的最高价格 (可选)
  - `minPrice`: 您愿意购买号码的最低价格 (可选)
  - `providerIds`: 指定购买的供应商列表，用逗号分隔 (如 `1,2,3`)
  - `exceptProviderIds`: 排除的供应商列表，用逗号分隔 (如 `1,2,3`)
  - `phoneException`: 排除的号码前缀，用逗号分隔。格式：国家代码+掩码的3到6位数字 (如 `7918,7900111`)
  - `ref`: 推荐人 ID (可选)
  - `userID`: 经销商专用的新参数 (详情请联系客服)
- **成功响应:** `ACCESS_NUMBER:$activationId:$phoneNumber`
- **错误码:** `BAD_KEY`, `BAD_ACTION`, `BAD_SERVICE`

### 2.2 获取短信验证码 (Get SMS code)

- **请求地址:** `?api_key=$api_key&action=getStatus&id=$id`
- **参数:**
  - `id`: 激活 ID (即获取手机号接口返回的 `$activationId`)
- **响应格式:**
  - `STATUS_WAIT_CODE` - 等待接收短信
  - `STATUS_WAIT_RETRY:$lastCode` - 等待下一条短信
  - `STATUS_CANCEL` - 激活已取消
  - `STATUS_OK:'activation code'` - 验证码已收到
- **错误码:** `BAD_KEY`, `BAD_ACTION`, `NO_ACTIVATION` (激活 ID 错误)

### 2.3 更改激活状态 (Change of activation status)

- **请求地址:** `?api_key=$api_key&action=setStatus&status=$status&id=$id`
- **参数:**
  - `id`: 激活 ID
  - `status`: 状态码
    - `1` - 告知号码已准备好 (短信已发送到该号码)
    - `3` - 请求另一个验证码 (免费)
    - `6` - 完成激活
    - `8` - 告知号码已被使用并取消激活
- **简单 API 编年史逻辑:**
  - 获取号码后可执行：`8` (取消激活)、`1` (报告短信已发)。
  - 若状态为 `1`：可执行 `8` (取消激活)。
  - 收到验证码后可执行：`3` (请求另一条短信)、`6` (确认并完成激活)。
- **成功响应:**
  - `ACCESS_READY` - 手机已准备好接收短信
  - `ACCESS_RETRY_GET` - 等待新短信
  - `ACCESS_ACTIVATION` - 服务已成功激活
  - `ACCESS_CANCEL` - 激活已取消
- **错误码:** `NO_ACTIVATION`, `BAD_STATUS`, `BAD_KEY`, `BAD_ACTION`, `EARLY_CANCEL_DENIED` (购买号码 2 分钟后才可取消)

---

## 3. 核心 V2/V3 升级接口

### 3.1 获取手机号 V2 (Get phone number V2)

_功能同 Get phone number，但返回更详细的 JSON 信息。_

- **请求地址:** `?api_key=$api_key&action=getNumberV2&...` (参数同 V1 接口)
- **成功响应:**
  ```json
  {
    "activationId": "id",
    "phoneNumber": "number",
    "activationCost": "activationCost",
    "countryCode": "countryCode",
    "canGetAnotherSms": "canGetAnotherSms",
    "activationTime": "activationTime",
    "activationOperator": "activationOperator"
  }
  ```

````

---

## 4. 价格、服务与国家查询

### 4.1 获取价格 (Get prices)

* **请求地址:** `?api_key=$api_key&action=getPrices&service=$service&country=$country`
* **成功响应:**
```json
{
    "Country": {
        "Service": {
            "cost": "Cost",
            "count": "Count"
        }
    }
}

````

### 4.2 获取全量价格列表 V2 (Get full prices list v2)

- **请求地址:** `?api_key=$api_key&action=getPricesV2&service=$service&country=$country`
- **成功响应:**

```json
{
  "country": {
    "service": {
      "price1": "count",
      "price2": "count",
      "price3": "count"
    }
  }
}
```

### 4.3 获取全量价格列表 V3 (Get full prices list v3)

- **请求地址:** `?api_key=$api_key&action=getPricesV3&service=$service&country=$country`
- **成功响应:**

```json
{
    "country": {
        "service": {
            "provider 1 id": {
                "count": "count",
                "price": "price",
                "provider_id": "provider id"
            },
            "provider 2 id": { ... }
        }
    }
}

```

### 4.4 服务列表 (List of services)

- **请求地址:** `?api_key=$api_key&action=getServicesList`
- **成功响应:**

```json
{
  "status": "success",
  "services": [{ "code": "kt", "name": "KakaoTalk" }]
}
```

### 4.5 国家列表 (List of countries)

- **请求地址:** `?api_key=$api_key&action=getCountries`
- **成功响应:**

```json
[
  {
    "id": 1003,
    "rus": "Бермуды",
    "eng": "Bermuda",
    "chn": "百慕大"
  }
]
```

### 4.6 按服务获取热门国家 (Get top countries by service)

- **请求地址:** `?api_key=$api_key&action=getTopCountriesByService&service=$service`
- **说明:** 返回特定服务的前 10 个热门国家（按内部优先级排序）。
- **成功响应示例:**

```json
{
  "usa": {
    "3170": { "price": 0.12, "count": 542 },
    "4120": { "price": 0.14, "count": 301 }
  },
  "canada": {
    "2211": { "price": 0.11, "count": 190 }
  }
}
```

---

## 5. 支付与回调

### 5.1 获取静态钱包地址 (Get static wallet)

- **请求地址:** `https://smsbower.page/api/payment/getActualWalletAddress?api_key=$api_key&coin=$coin&network=$network`
- **参数:**
- `coin`: 币种 (例如: `usdt`, `trx`)
- `network`: 网络名称 (例如: `tron`)

- **成功响应:**

```json
{
  "wallet_address": "TFGMAwTfxtxKvy1mTTHr7XJaXeumjdmhGg"
}
```

### 5.2 Webhook 通知 (Notification via Webhook)

当接收到验证码后，服务器会自动推送到您的 Webhook，无需轮询。

- **IP 白名单:** 请确保您的服务器允许来自 `167.235.198.205` 的请求。
- **请求方式:** `POST`
- **数据示例:**

```json
{
  "activationId": 123456,
  "service": "go",
  "text": "Sms text",
  "code": "12345",
  "country": 2,
  "receivedAt": "2023-01-01 12:00:00"
}
```

- **服务器响应要求:** 您的脚本必须返回 HTTP 状态码 `200`。
  _(如果服务器未响应，系统将在 1 分钟和 5 分钟后分别重试。如果失败 3 次，将在个人中心报错)。_

```

```
