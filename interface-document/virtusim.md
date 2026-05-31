# VirtuSIM API Documentation

## API Protocol for working with VirtuSIM

API is a protocol between your software and our server. It is needed for the automatization of the SMS, OTP, and PVA receiving process on your side. Our API is fully compatible with competitor sites.

- **Base Endpoint:** `https://virtusim.com/api/v2/json`
- **Allowed Methods:** `POST` or `GET`
- **Authentication:** All requests must contain an API key in the form of the `api_key` GET parameter.
- **Support:** Please request an API key if there is anything missing to our CS at [VirtuSIM Telegram Bot](https://t.me/virtusim_bot).

---

## Account

### 1. Account Balance Check

Check the current balance of your VirtuSIM account.

- **Method:** `GET`
- **Endpoint:** `https://virtusim.com/api/v2/json.php`
- **Authorization:** Digest Auth
- **Parameters:**
  - `api_key`: (String) Your API Key
  - `action`: `balance`

**Example Request (cURL):**

```bash
curl --location '[https://virtusim.com/api/v2/json.php?api_key=&action=balance](https://virtusim.com/api/v2/json.php?api_key=&action=balance)'

```

**Example Response (200 OK):**

```json
{
  "status": false,
  "data": {
    "msg": "Incorrect API Key"
  }
}
```

---

### 2. Balance Mutation

Retrieve the balance logs and mutation history.

- **Method:** `GET`
- **Endpoint:** `https://virtusim.com/api/v2/json.php`
- **Parameters:**
- `api_key`: (String) Your API Key
- `action`: `balance_logs`

**Example Request (cURL):**

```bash
curl --location '[https://virtusim.com/api/v2/json.php?api_key=&action=balance_logs](https://virtusim.com/api/v2/json.php?api_key=&action=balance_logs)'

```

**Example Response (200 OK):**

```json
{
  "status": false,
  "data": {
    "msg": "Incorrect API Key"
  }
}
```

---

### 3. Recent Activity

Retrieve the recent activity of your account.

- **Method:** `GET`
- **Endpoint:** `https://virtusim.com/api/v2/json.php`
- **Parameters:**
- `api_key`: (String) Your API Key
- `action`: `recent_activity`

**Example Request (cURL):**

```bash
curl --location '[https://virtusim.com/api/v2/json.php?api_key=&action=recent_activity](https://virtusim.com/api/v2/json.php?api_key=&action=recent_activity)'

```

**Example Response (200 OK):**

```json
{
  "status": false,
  "data": {
    "msg": "Incorrect API Key"
  }
}
```

````markdown
## Service

### 1. List Service

Retrieve a list of available services, optionally filtered by country and specific service name.

- **Method:** `GET`
- **Endpoint:** `https://virtusim.com/api/v2/json.php`
- **Authorization:** Digest Auth
- **Parameters:**
  - `api_key`: (String) Your API Key
  - `action`: `services`
  - `country`: (String) Optional. The target country (e.g., `Russia`).
  - `service`: (String) Optional. The target service name (e.g., `Whatsapp`).

**Example Request (cURL):**

```bash
curl --location '[https://virtusim.com/api/v2/json.php?api_key=&action=services&country=Russia&service=](https://virtusim.com/api/v2/json.php?api_key=&action=services&country=Russia&service=)'
```
````

**Example Response (200 OK):**

```json
{
  "status": true,
  "data": [
    {
      "id": "556",
      "name": "Whatsapp",
      "price": "17500",
      "is_promo": "1",
      "tersedia": "13347",
      "country": "Russia",
      "status": "1",
      "category": "OTP"
    }
  ]
}
```

---

### 2. List Country

Retrieve a list of available countries.

- **Method:** `GET`
- **Endpoint:** `https://virtusim.com/api/v2/json.php`
- **Parameters:**
- `api_key`: (String) Your API Key
- `action`: `list_country`

**Example Request (cURL):**

```bash
curl --location '[https://virtusim.com/api/v2/json.php?api_key=&action=list_country](https://virtusim.com/api/v2/json.php?api_key=&action=list_country)'

```

**Example Response:**
_This request doesn't return any response body._

---

### 3. List Operator

Retrieve a list of available operators for a specific country.

- **Method:** `GET`
- **Endpoint:** `https://virtusim.com/api/v2/json.php`
- **Parameters:**
- `api_key`: (String) Your API Key
- `action`: `list_operator`
- `country`: (String) The target country (e.g., `Russia`).

**Example Request (cURL):**

```bash
curl --location '[https://virtusim.com/api/v2/json.php?api_key=&action=list_operator&country=Russia](https://virtusim.com/api/v2/json.php?api_key=&action=list_operator&country=Russia)'

```

**Example Response (200 OK):**

```json
{
  "status": true,
  "data": [
    "any",
    "beeline",
    "megafon",
    "mts",
    "sber",
    "tele2",
    "rostelecom",
    "aiva",
    "yota",
    "simsim",
    "ttk",
    "center2m",
    "mtt",
    "motiv",
    "tinkoff",
    "ezmobile",
    "winmobile",
    "lycamobile",
    "matrix",
    "danycom",
    "mtt_virtual",
    "gazprombank_mobile",
    "vtb_mobile",
    "mcn",
    "aquafon",
    "mir_telecom"
  ]
}
```

```

```

````markdown
## Transaction

### 1. Active Transaction

Retrieve a list of your currently active orders/transactions.

- **Method:** `GET`
- **Endpoint:** `https://virtusim.com/api/v2/json.php`
- **Authorization:** Digest Auth
- **Parameters:**
  - `api_key`: (String) Your API Key
  - `action`: `active_order`

**Example Request (cURL):**

```bash
curl --location '[https://virtusim.com/api/v2/json.php?api_key=&action=active_order](https://virtusim.com/api/v2/json.php?api_key=&action=active_order)'
```
````

**Example Response (200 OK):**

```json
{
  "status": false,
  "msg": "No active orders"
}
```

---

### 2. New Transaction

Create a new order/transaction for a specific service and operator.

- **Method:** `GET`
- **Endpoint:** `https://virtusim.com/api/v2/json.php`
- **Authorization:** Digest Auth
- **Parameters:**
- `api_key`: (String) Your API Key
- `action`: `order`
- `service`: (String) Service ID. _Note: You can get this from the `List Service` endpoint._
- `operator`: (String) Operator name. _Note: You can get this from the `List Operator` endpoint by country._

**Example Request (cURL):**

```bash
curl --location '[https://virtusim.com/api/v2/json.php?api_key=&action=order&service=743&operator=any](https://virtusim.com/api/v2/json.php?api_key=&action=order&service=743&operator=any)'

```

**Example Response:**
_This request doesn't return any response body._

---

### 3. Reactive Number

Reactivate a previously used number by its transaction ID.

- **Method:** `GET`
- **Endpoint:** `https://virtusim.com/api/v2/json.php`
- **Authorization:** Digest Auth
- **Parameters:**
- `api_key`: (String) Your API Key
- `action`: `reactive_order`
- `id`: (String) The transaction ID you wish to reactivate.

**Example Request (cURL):**

```bash
curl --location '[https://virtusim.com/api/v2/json.php?api_key=&action=reactive_order&id=123123](https://virtusim.com/api/v2/json.php?api_key=&action=reactive_order&id=123123)'

```

**Example Response:**
_This request doesn't return any response body._

---

### 4. Check Transaction Status

Check the current status of a specific transaction by its ID.

- **Method:** `GET`
- **Endpoint:** `https://virtusim.com/api/v2/json.php`
- **Authorization:** Digest Auth
- **Parameters:**
- `api_key`: (String) Your API Key
- `action`: `status`
- `id`: (String) The transaction ID to check.

**Example Request (cURL):**

```bash
curl --location '[https://virtusim.com/api/v2/json.php?api_key=&action=status&id=885887](https://virtusim.com/api/v2/json.php?api_key=&action=status&id=885887)'

```

**Example Response:**
_This request doesn't return any response body._

```

```

````markdown
### 5. Change Transaction Status

Update the status of an existing transaction.

- **Method:** `GET`
- **Endpoint:** `https://virtusim.com/api/v2/json.php`
- **Authorization:** Digest Auth
- **Parameters:**
  - `api_key`: (String) Your API Key
  - `action`: `set_status`
  - `id`: (String) The transaction ID.
  - `status`: (Integer) The new status code to set.
- **List Of Status:**
  - `1` = Ready
  - `2` = Cancel
  - `3` = Resend
  - `4` = Completed

**Example Request (cURL):**

```bash
curl --location '[https://virtusim.com/api/v2/json.php?api_key=&action=set_status&id=269046&status=1](https://virtusim.com/api/v2/json.php?api_key=&action=set_status&id=269046&status=1)'
```
````

**Example Response:**
_This request doesn't return any response body._

---

### 6. Order History

Retrieve the history of your previous orders.

- **Method:** `GET`
- **Endpoint:** `https://virtusim.com/api/v2/json.php`
- **Parameters:**
- `api_key`: (String) Your API Key
- `action`: `order_history`

**Example Request (cURL):**

```bash
curl --location '[https://virtusim.com/api/v2/json.php?api_key=&action=order_history](https://virtusim.com/api/v2/json.php?api_key=&action=order_history)'

```

**Example Response:**
_This request doesn't return any response body._

---

### 7. Detail Order

Get detailed information about a specific order by its ID.

- **Method:** `GET`
- **Endpoint:** `https://virtusim.com/api/v2/json.php`
- **Parameters:**
- `api_key`: (String) Your API Key
- `action`: `detail_order`
- `id`: (String) The specific order ID you want to look up.

**Example Request (cURL):**

```bash
curl --location '[https://virtusim.com/api/v2/json.php?api_key=&action=detail_order&id=123](https://virtusim.com/api/v2/json.php?api_key=&action=detail_order&id=123)'

```

**Example Response:**
_This request doesn't return any response body._

```

```

````markdown
## Deposit

### 1. Deposit

Initiate a deposit to your account balance using various payment methods.

- **Method:** `GET`
- **Endpoint:** `https://virtusim.com/api/v2/json.php`
- **Parameters:**
  - `api_key`: (String) Your API Key
  - `action`: `deposit`
  - `method`: (Integer) The payment method ID.
  - `amount`: (Integer) The deposit amount.
  - `phone`: (String) Your associated phone number.
- **List Number Method:**
  - `20` = QRIS
  - `22` = USDCBSC - CRYPTO
  - `23` = USDTBSC - CRYPTO
  - `24` = BTC - CRYPTO
  - `25` = ETH - CRYPTO
  - `26` = SOLANA - CRYPTO

**Example Request (cURL):**

```bash
curl --location '[https://virtusim.com/api/v2/json.php?api_key=&action=deposit&method=20&amount=20000&phone=81201212](https://virtusim.com/api/v2/json.php?api_key=&action=deposit&method=20&amount=20000&phone=81201212)'
```
````

**Example Response:**
_This request doesn't return any response body._

```

```
