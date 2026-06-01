# API 接入示例说明文档

本项目包含了使用 **Python**、**Java**、**C# (.NET 2.0)**、**易语言**、**PHP** 和 **C++** 实现的 API 接入示例代码。

## ⚠️ 重要流程说明
**所有 API 调用必须遵循以下流程：**
1.  **第一步：调用 `Auth` (登录授权) 接口**。
    *   使用 `user_id` 和 `user_code` 进行签名验证。
    *   接口返回结果中包含 `access_token` 和 `expires_in`。
2.  **第二步：保存 Token 并处理过期**。
    *   `access_token` 是调用后续接口的凭证。
    *   `expires_in` 表示 Token 的有效时长（秒）。
    *   **重要**：当 `access_token` 到期后，必须重新调用 `Auth` 接口获取新的 Token，否则会导致鉴权失败。
3.  **第三步：调用其他业务接口** (如查询余额、获取号码等)。
    *   后续所有接口请求参数中都**必须**包含上一步获取的 `access_token`。

> **注意**：如果跳过第一步直接调用业务接口，或者使用了过期的 Token，服务器将返回鉴权失败错误。

## 通用配置
在运行任何示例之前，请确保在源代码中设置以下配置信息：
- **user_id**: 您的用户 ID（例如：`5913`）
- **user_code**: 您的用户代码（例如：`567449`）
- **api_key**: 您的 API 密钥（例如：`30f698e2bde90841a5d7f98b5f2194ae`）

---

## 1. Python 示例 (`demo.py`)

### 环境要求
- **Python 2.7** 或 **Python 3.x**
- 使用的标准库：`urllib`、`urllib2` (Py2) / `urllib.request` (Py3)、`json`、`hashlib`、`ssl`。

### 说明
该脚本已针对 Python 2.7（您当前的环境）进行了兼容性编写，同时也支持 Python 3。
- **SSL 验证**：脚本包含绕过 SSL 证书验证的逻辑 (`context = ssl._create_unverified_context()`)，以便在开发环境或证书受限的环境中正常运行。
- **签名逻辑**：自动对参数进行排序并生成 MD5 签名。

### 运行方法
```bash
python demo.py
```

---

## 2. Java 示例 (`Demo.java`)

### 环境要求
- **JDK 1.6** 或更高版本。
- 无需外部依赖（仅使用标准 `java.net.HttpURLConnection`）。

### 说明
- 这是一个纯 Java 实现，不依赖任何第三方 JSON 库（示例中使用简单的字符串解析）。
- 包含 `disableSslVerification()` 方法用于在测试时绕过 SSL 检查。
- `main` 方法演示了完整的授权登录和余额查询流程。

### 运行方法
1. **编译**：
   ```bash
   javac Demo.java
   ```
2. **运行**：
   ```bash
   java Demo
   ```

---

## 3. C# .NET 示例 (`Demo.cs`)

### 环境要求
- **.NET Framework 2.0** 或更高版本。
- 使用 `System.Net.WebRequest` 和 `System.Security.Cryptography`。

### 说明
- 严格遵循 .NET 2.0 语法标准，兼容旧版系统。
- 使用 `ServicePointManager.ServerCertificateValidationCallback` 处理 SSL 验证问题。
- 根据 .NET 2.0 标准手动实现参数排序、MD5 签名生成和 URL 编码。

### 运行方法
1. **编译**（使用 .NET Framework 自带的 `csc` 编译器）：
   ```cmd
   csc Demo.cs
   ```
2. **运行**：
   ```cmd
   Demo.exe
   ```

---

## 4. 易语言示例 (`demo_e_language.txt`)

### 环境要求
- **易语言 IDE**
- **精易模块**：推荐使用，用于处理 HTTP 请求 (`网页_访问_对象`) 和时间戳。

### 说明
由于易语言使用二进制源文件 (`.e`)，无法直接提供文本源码，因此 `demo_e_language.txt` 提供的是**核心逻辑描述和代码片段**。
- 您需要新建一个易语言项目，并将逻辑复制进去。
- 文档中详细列出了 `Auth` (登录) 和 `Balance` (余额) 的子程序实现。
- 包含了 API 要求的字典排序和 MD5 签名生成逻辑。

### 使用方法
1. 打开易语言 IDE。
2. 新建一个“Windows 窗口程序”。
3. 在模块引用表中添加“精易模块”。
4. 参考文本文件中的变量定义和子程序代码，将其复制到您的项目中。
5. 编译并运行。

---

## 5. PHP 示例 (`demo.php`)

### 环境要求
- **PHP 5.4** 或更高版本。
- 需要启用 **cURL** 扩展（`php_curl`）。

### 说明
- 使用 `curl` 扩展发送 HTTP POST 请求。
- 通过 `CURLOPT_SSL_VERIFYPEER` 和 `CURLOPT_SSL_VERIFYHOST` 关闭 SSL 证书验证。
- 使用 `ksort()` 对参数进行字典排序，`md5()` 生成 MD5 签名。
- 每个业务函数独立封装，与 C# 版本的 API 函数一一对应。

### 运行方法
```bash
php demo.php
```

---

## 6. C++ 示例 (`demo.cpp`)

### 环境要求
- **C++11** 或更高版本。
- **libcurl** 开发库（用于 HTTP 请求）。
- **CMake 3.10+**（推荐构建方式）。

### 说明
- 使用 **libcurl** 发送 HTTPS POST 请求，通过 `CURLOPT_SSL_VERIFYPEER=0` 跳过 SSL 验证。
- 自包含 **MD5 实现**（[MD5](demo.cpp#L18-L158)），无需 OpenSSL 等外部依赖。
- 签名逻辑 [generateSign](demo.cpp#L179-L198) 完全遵循参数排序 → `key=value&...` 拼接 → 追加 `API_KEY` → MD5 的规则。
- 所有 8 个 API 接口函数与 C# 原版一一对应，主函数 `main` 演示了完整的登录 → 获取余额流程。

### 运行方法

**方式一：CMake 构建（推荐）**

```bash
# 安装 libcurl（Windows 下通过 vcpkg）
vcpkg install curl:x64-windows

# 构建
cmake -B build -DCMAKE_TOOLCHAIN_FILE=<vcpkg_root>/scripts/buildsystems/vcpkg.cmake
cmake --build build

# 运行
.\build\Debug\demo.exe
```

**方式二：MSVC 命令行直接编译**

```cmd
cl /EHsc /std:c++11 demo.cpp /I<curl_include> /link <curl_lib> ws2_32.lib wldap32.lib
```

> **注意**：libcurl 在 Windows 上的库文件通常为 `libcurl.lib`，使用时还需链接 `ws2_32.lib` 和 `wldap32.lib`。
