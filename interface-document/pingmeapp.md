# PingMe 验证码小助手 API 文档 备用 质量太差暂弃

**欢迎使用 PingMe API 进行批量接码**

**开通步骤：**

1. 注册或登录您的网页端账户并找到 API 管理栏。
2. 填写您的回调 URL 以完成 API 申请。（**注意：** 请确保您的 URL 支持 `POST` 请求，否则会导致 API 请求失败）。
3. 接入前，请确保您的账户中有足够的余额以请求 API。
4. 如有问题，请联系客服：support@pingme.tel。

> **⚠️ 环境说明**
> `https://api.pingme.tel` 优先
> `https://api.pingmeapp.net` 备用

---

## 全局请求头 (Headers)

除特殊说明外，所有 API 请求需包含以下 Headers：

- `Accept`: `application/json`
- `Content-Type`: `application/json`
- `x-app-key`: _（开通时提供）_

---

## 1. 获取项目列表

执行以下命令后，获得项目的名字，用作获取号码 API 里的参数。

- **接口地址:** `https://api.pingme.tel/thirdparty/getAppList`
- **请求方式:** `GET` / `POST`

**请求示例 (cURL):**

```bash
curl -H 'Accept: application/json' \
     -H 'x-app-key: key' \
     -H 'Content-Type: application/json' \
     -d '{"userId":"xxx"}' \
     [https://api.pingme.tel/thirdparty/getAppList](https://api.pingme.tel/thirdparty/getAppList)

```

---

## 2. 获取号码 (Lock Number)

- **接口地址:** `https://api.pingme.tel/thirdparty/lockNumber`
- **请求方式:** `POST`

**请求参数:**

- `userId`: 开通时确定的用户 ID
- `app`: 需要接受验证码的 App
- `number`: 留空表示获取新号码，有值表示使用以前用过的号码
- `countryCode`: 默认是 `US`，支持 `US` 或 `GB`

**请求示例 (cURL):**

```bash
curl -X POST '[https://api.pingme.tel/thirdparty/lockNumber](https://api.pingme.tel/thirdparty/lockNumber)' \
     -H 'Accept: application/json' \
     -H 'Content-Type: application/json' \
     -H 'X-app-key: xxx' \
     -d '{"userId":"xxx","app":"jd","number":""}'

```

**成功返回示例:**

```json
{
  "retcode": 0,
  "retmsg": "success",
  "result": {
    "number": "16510000000",
    "price": 0.5
  }
}
```

**失败返回示例:**

```json
{
  "retcode": 100004,
  "retmsg": "",
  "result": {}
}
```

_错误码说明: 100000 内部错误，100004 缺少参数，300002 余额不足，500000 没有可用号码，500001 锁定太多号码，500002 号码不存在或者已过期。_

---

## 3. 订阅号码 (Sub Number)

- **接口地址:** `https://api.pingme.tel/thirdparty/subNumber`
- **请求方式:** `POST`

**请求参数:**

- `userId`: 用户 ID，不能为空
- `app`: 指定 App，不能为空
- `number`: 需要订阅的号码，不能为空

**请求示例 (cURL):**

```bash
curl -X POST '[https://api.pingme.tel/thirdparty/subNumber](https://api.pingme.tel/thirdparty/subNumber)' \
     -H 'Accept: application/json' \
     -H 'Content-Type: application/json' \
     -H 'X-app-key: xxx' \
     -d '{"userId":"xxx","app":"jd","number":"1xxxxxxxxxx"}'

```

**返回状态:**

- `200`: 请求成功
- `403`: 请求失败，没权限

**成功返回示例:**

```json
{
  "retcode": 0,
  "retmsg": "success",
  "result": {}
}
```

_(失败错误码: 100000 内部错误，100004 缺少参数，300002 余额不足)_

---

## 4. 退订号码 (Unsub Number)

- **接口地址:** `https://api.pingme.tel/thirdparty/unSubNumber`
- **请求方式:** `POST`

**请求参数:**

- `userId`: 用户 ID，不能为空
- `app`: 指定 App，不能为空
- `number`: 需要退订的号码，不能为空

**请求示例 (cURL):**

```bash
curl -X POST '[https://api.pingme.tel/thirdparty/unSubNumber](https://api.pingme.tel/thirdparty/unSubNumber)' \
     -H 'Accept: application/json' \
     -H 'Content-Type: application/json' \
     -H 'X-app-key: xxx' \
     -d '{"userId":"xxx","app":"jd","number":"1xxxxxxxxxx"}'

```

**返回状态:**

- `200`: 请求成功
- `403`: 请求失败，没权限

**成功返回示例:**

```json
{
  "retcode": 0,
  "retmsg": "success",
  "result": {}
}
```

_(失败错误码: 100000 内部错误，100004 缺少参数)_

---

## 5. 获取未过期的验证码号码列表

- **接口地址:** `https://api.pingme.tel/thirdparty/getNumberList`
- **请求方式:** `GET`

**请求参数:**

- `userId`: 用户 ID，不能为空
- `app`: 如果为空返回所有未过期号码；不为空则获取指定 App 的号码

**请求示例 (cURL):**

```bash
curl '[https://api.pingme.tel/thirdparty/getNumberList?userId=xxx&app=](https://api.pingme.tel/thirdparty/getNumberList?userId=xxx&app=)' \
     -H 'Accept: application/json' \
     -H 'Content-Type: application/json' \
     -H 'X-app-key: xxx'

```

**返回字段说明:**

- `phone`：号码
- `subStatus`：0 表示未订阅，1 表示已订阅
- `nextPaymentDate`：有效期
- `subRent`：新订阅的月租
- `codeRate`：短信费率
- `monthRent`：当前月租（当 subStatus=1 时）

**成功返回示例:**

```json
{
  "retcode": 0,
  "retmsg": "success",
  "result": {
    "numbers": [
      {
        "phone": "168151020115",
        "nextPaymentDate": "2021-11-22 (Expiry Date)",
        "subStatus": 0,
        "subRent": "$0.5 / Month",
        "app": "jd",
        "monthRent": "",
        "name": "JD",
        "telCode": "1",
        "codeRate": "$0.2 / SMS"
      }
    ]
  }
}
```

_(失败错误码: 100000 内部错误，100004 缺少参数)_

---

## 6. 短信回调 (Webhook Callback)

需要在系统内提前配置好您的回调地址。

- **请求方式:** `POST`
- **Content-Type:** `application/json`

**接收参数:**

- `userId`: 用户 ID
- `app`: 应用名称
- `from`: App 提供商的号码（可能是字符串，不一定是纯数字）
- `to`: 接收号码
- `text`: 短信内容
- `time`: 时间

**回调数据格式示例:**

```json
{
  "app": "jd",
  "from": "14160000000",
  "to": "16470000000",
  "userId": "xxx",
  "text": "[jd] code is 5611",
  "time": "2021-03-25T03:17:06.050Z"
}
```

```

```
