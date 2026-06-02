备用文档，暂时用不到

请求 - 登录
curl 'https://www.yamasakisms.com/app/admin/account/login' \
 -H 'accept: _/_' \
 -H 'accept-language: zh-CN,zh;q=0.9' \
 -H 'content-type: application/x-www-form-urlencoded; charset=UTF-8' \
 -b 'PHPSID=fb05894a4887da4145516042344ff2d6' \
 -H 'origin: https://www.yamasakisms.com' \
 -H 'priority: u=1, i' \
 -H 'referer: https://www.yamasakisms.com/8A3537FF' \
 -H 'sec-ch-ua: "Chromium";v="148", "Microsoft Edge";v="148", "Not/A)Brand";v="99"' \
 -H 'sec-ch-ua-mobile: ?0' \
 -H 'sec-ch-ua-platform: "macOS"' \
 -H 'sec-fetch-dest: empty' \
 -H 'sec-fetch-mode: cors' \
 -H 'sec-fetch-site: same-origin' \
 -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0' \
 -H 'x-requested-with: XMLHttpRequest' \
 --data-raw 'username=mb95&password=bYu7bbF4B2XY&captcha=mfGc'

返回
{
"code": 0,
"data": {
"nickname": "mb95",
"token": "fb05894a4887da4145516042344ff2d6"
},
"msg": "登录成功"
}

请求 验证码
curl 'https://www.yamasakisms.com/app/admin/account/captcha/login?v=1780370537006' \
 -H 'accept: image/avif,image/webp,image/apng,image/svg+xml,image/_,_/\*;q=0.8' \
 -H 'accept-language: zh-CN,zh;q=0.9' \
 -b 'PHPSID=fb05894a4887da4145516042344ff2d6' \
 -H 'priority: i' \
 -H 'referer: https://www.yamasakisms.com/8A3537FF' \
 -H 'sec-ch-ua: "Chromium";v="148", "Microsoft Edge";v="148", "Not/A)Brand";v="99"' \
 -H 'sec-ch-ua-mobile: ?0' \
 -H 'sec-ch-ua-platform: "macOS"' \
 -H 'sec-fetch-dest: image' \
 -H 'sec-fetch-mode: no-cors' \
 -H 'sec-fetch-site: same-origin' \
 -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0'

返回的是图片，https://www.yamasakisms.com/app/admin/account/captcha/login?v=1780370537006

请求-取号
curl 'https://www.yamasakisms.com/app/admin/takesms/takeNumber' \
 -H 'accept: application/json, text/javascript, _/_; q=0.01' \
 -H 'accept-language: zh-CN,zh;q=0.9' \
 -H 'content-type: application/x-www-form-urlencoded; charset=UTF-8' \
 -b 'PHPSID=fb05894a4887da4145516042344ff2d6' \
 -H 'origin: https://www.yamasakisms.com' \
 -H 'priority: u=1, i' \
 -H 'referer: https://www.yamasakisms.com/app/admin/takesms/index' \
 -H 'sec-ch-ua: "Chromium";v="148", "Microsoft Edge";v="148", "Not/A)Brand";v="99"' \
 -H 'sec-ch-ua-mobile: ?0' \
 -H 'sec-ch-ua-platform: "macOS"' \
 -H 'sec-fetch-dest: empty' \
 -H 'sec-fetch-mode: cors' \
 -H 'sec-fetch-site: same-origin' \
 -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0' \
 -H 'x-requested-with: XMLHttpRequest' \
 --data-raw 'platform_id=318&take_count=1'

返回
{
"code": 0,
"data": {
"balance": "200.00",
"take_ids": [
1325435
]
},
"msg": "ok"
}

请求
curl 'https://www.yamasakisms.com/app/admin/takesms/index' \
 -H 'accept: application/json, text/javascript, _/_; q=0.01' \
 -H 'accept-language: zh-CN,zh;q=0.9' \
 -H 'content-type: application/x-www-form-urlencoded; charset=UTF-8' \
 -b 'PHPSID=fb05894a4887da4145516042344ff2d6' \
 -H 'origin: https://www.yamasakisms.com' \
 -H 'priority: u=1, i' \
 -H 'referer: https://www.yamasakisms.com/app/admin/takesms/index' \
 -H 'sec-ch-ua: "Chromium";v="148", "Microsoft Edge";v="148", "Not/A)Brand";v="99"' \
 -H 'sec-ch-ua-mobile: ?0' \
 -H 'sec-ch-ua-platform: "macOS"' \
 -H 'sec-fetch-dest: empty' \
 -H 'sec-fetch-mode: cors' \
 -H 'sec-fetch-site: same-origin' \
 -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0' \
 -H 'x-requested-with: XMLHttpRequest' \
 --data-raw 'page=1&limit=30&field=id_order&order=desc'

返回
{
"code": 0,
"msg": "ok",
"count": 6,
"data": [
{
"add_time": "2026-06-02 11:11:10",
"admin_id": 167,
"card_type_id": 93,
"device_id": 131,
"first_recvcode_time": 0,
"id": "1325260",
"id_order": 1325260,
"ip_address": "172.56.179.202",
"is_api": 1,
"is_del": 0,
"last_recvcode_time": 0,
"last_time": "2026-06-02T11:17:23Z",
"member_id": 7815,
"member_type": 2,
"nickname": "mb95",
"order_no": "452308174301560832",
"order_status": "8208",
"parent_member_id": 6826,
"phone_id": 195708,
"phone_number": "08028381613",
"platform_id": 318,
"platform_name": "贝宝",
"port_name": "COM139",
"price": 10,
"purchase_price": 5,
"recv_callback_time": 0,
"recvcode_expire_time": 1780456272,
"refund_time": 1780370243,
"reserve_id": 0,
"reserve_time": 0,
"stop_timeout": "2026-06-02 11:17:23",
"take_callback_time": 0,
"take_expire_time": 1780369930,
"take_time": "1780369872",
"username": "mb95",
"_version_": 1866853508708302800,
"_root_": "1325260",
"sms_content_count": 0,
"parent_member_nickname": "BMW",
"reserve_timeout": false,
"online": true,
"device_name": "B11",
"com_name": "COM139"
},
{
"add_time": "2026-06-02 11:09:16",
"admin_id": 167,
"card_type_id": 93,
"device_id": 131,
"first_recvcode_time": 0,
"id": "1325249",
"id_order": 1325249,
"ip_address": "172.56.179.202",
"is_api": 1,
"is_del": 0,
"last_recvcode_time": 0,
"last_time": "2026-06-02T11:17:58Z",
"member_id": 7815,
"member_type": 2,
"nickname": "mb95",
"order_no": "452307695056191488",
"order_status": "8208",
"parent_member_id": 6826,
"phone_id": 195709,
"phone_number": "09032677420",
"platform_id": 318,
"platform_name": "贝宝",
"port_name": "COM140",
"price": 10,
"purchase_price": 5,
"recv_callback_time": 0,
"recvcode_expire_time": 1780456158,
"refund_time": 1780370278,
"reserve_id": 0,
"reserve_time": 0,
"stop_timeout": "2026-06-02 11:17:57",
"take_callback_time": 0,
"take_expire_time": 1780369816,
"take_time": "1780369758",
"username": "mb95",
"_version_": 1866853545409511400,
"_root_": "1325249",
"sms_content_count": 0,
"parent_member_nickname": "BMW",
"reserve_timeout": false,
"online": true,
"device_name": "B11",
"com_name": "COM140"
},
{
"add_time": "2026-06-02 10:39:44",
"admin_id": 167,
"card_type_id": 93,
"device_id": 131,
"first_recvcode_time": 0,
"id": "1324886",
"id_order": 1324886,
"ip_address": "172.56.179.202",
"is_api": 1,
"is_del": 0,
"last_recvcode_time": 0,
"last_time": "2026-06-02T11:18:05Z",
"member_id": 7815,
"member_type": 2,
"nickname": "mb95",
"order_no": "452300263743586304",
"order_status": "8208",
"parent_member_id": 6826,
"phone_id": 195718,
"phone_number": "08014899021",
"platform_id": 318,
"platform_name": "贝宝",
"port_name": "COM149",
"price": 10,
"purchase_price": 5,
"recv_callback_time": 0,
"recvcode_expire_time": 1780454386,
"refund_time": 1780370285,
"reserve_id": 0,
"reserve_time": 0,
"stop_timeout": "2026-06-02 11:18:04",
"take_callback_time": 0,
"take_expire_time": 1780368044,
"take_time": "1780367986",
"username": "mb95",
"_version_": 1866853552752689200,
"_root_": "1324886",
"sms_content_count": 0,
"parent_member_nickname": "BMW",
"reserve_timeout": false,
"online": true,
"device_name": "B11",
"com_name": "COM149"
},
{
"add_time": "2026-06-02 10:34:59",
"admin_id": 167,
"card_type_id": 93,
"device_id": 131,
"first_recvcode_time": 0,
"id": "1324825",
"id_order": 1324825,
"ip_address": "172.56.179.202",
"is_api": 1,
"is_del": 0,
"last_recvcode_time": 0,
"last_time": "2026-06-02T10:35:01Z",
"member_id": 7815,
"member_type": 2,
"nickname": "mb95",
"order_no": "452299070397063168",
"order_status": "4",
"parent_member_id": 6826,
"phone_id": 195719,
"phone_number": "08083733704",
"platform_id": 318,
"platform_name": "贝宝",
"port_name": "COM150",
"price": 10,
"purchase_price": 5,
"recv_callback_time": 0,
"recvcode_expire_time": 1780454101,
"refund_time": 0,
"reserve_id": 0,
"reserve_time": 0,
"stop_timeout": 0,
"take_callback_time": 0,
"take_expire_time": 1780367759,
"take_time": "1780367701",
"username": "mb95",
"_version_": 1866850843269005300,
"_root_": "1324825",
"sms_content_count": 0,
"parent_member_nickname": "BMW",
"reserve_timeout": false,
"online": true,
"device_name": "B11",
"com_name": "COM150"
},
{
"add_time": "2026-06-02 01:49:58",
"admin_id": 167,
"card_type_id": 93,
"device_id": 146,
"first_recvcode_time": 0,
"id": "1322033",
"id_order": 1322033,
"ip_address": "172.56.179.202",
"is_api": 0,
"is_del": 0,
"last_recvcode_time": 0,
"last_time": "2026-06-02T01:51:41Z",
"member_id": 7815,
"member_type": 2,
"nickname": "mb95",
"order_no": "452166945551187968",
"order_status": 8208,
"parent_member_id": 6826,
"phone_id": 153835,
"phone_number": "08028425583",
"platform_id": 318,
"platform_name": "贝宝",
"port_name": "COM106",
"price": 10,
"purchase_price": 5,
"recv_callback_time": 0,
"recvcode_expire_time": 1780422600,
"refund_time": 1780336301,
"reserve_id": 0,
"reserve_time": 0,
"stop_timeout": "2026-06-02 01:51:41",
"take_callback_time": 0,
"take_expire_time": 1780336258,
"take_time": 1780336200,
"username": "mb95",
"_version_": 1866817918165057500,
"_root_": "1322033",
"sms_content_count": 0,
"parent_member_nickname": "BMW",
"reserve_timeout": false,
"online": false,
"device_name": "",
"com_name": ""
},
{
"add_time": "2026-06-01 14:28:50",
"admin_id": 167,
"card_type_id": 93,
"device_id": 138,
"first_recvcode_time": 1780295553,
"id": "1313705",
"id_order": 1313705,
"ip_address": "172.56.179.202",
"is_api": 0,
"is_del": 0,
"last_recvcode_time": 1780367585,
"last_time": "2026-06-02T10:33:09Z",
"member_id": 7815,
"member_type": 2,
"nickname": "mb95",
"order_no": "451995531808362496",
"order_status": 4,
"parent_member_id": 6826,
"phone_id": 191360,
"phone_number": "08026448038",
"platform_id": 318,
"platform_name": "贝宝",
"port_name": "COM143",
"price": 10,
"purchase_price": 5,
"recv_callback_time": 0,
"recvcode_expire_time": 1780381733,
"refund_time": 0,
"reserve_id": 0,
"reserve_time": 0,
"sms_content": {
"sms_id": 1563044,
"recv_time": 1780367585,
"content": "PayPal: 電話番号をご確認いただきありがとうございます。取引のアラートは、ログインまたはアプリをダウンロードして取得できます。"
},
"stop_timeout": 0,
"take_callback_time": 0,
"take_expire_time": 1780295390,
"take_time": 1780295333,
"username": "mb95",
"_version_": 1866850725929156600,
"_root_": "1313705",
"sms_content_count": 29,
"parent_member_nickname": "BMW",
"reserve_timeout": false,
"online": true,
"device_name": "B18",
"com_name": "COM143"
}
],
"ext": {
"total_price": "20.00",
"total_purchase_price": "10.00"
}
}

请求 取消
curl 'https://www.yamasakisms.com/app/admin/takesms/stopRecvCode' \
 -H 'accept: application/json, text/javascript, _/_; q=0.01' \
 -H 'accept-language: zh-CN,zh;q=0.9' \
 -H 'content-type: application/x-www-form-urlencoded; charset=UTF-8' \
 -b 'PHPSID=fb05894a4887da4145516042344ff2d6' \
 -H 'origin: https://www.yamasakisms.com' \
 -H 'priority: u=1, i' \
 -H 'referer: https://www.yamasakisms.com/app/admin/takesms/index' \
 -H 'sec-ch-ua: "Chromium";v="148", "Microsoft Edge";v="148", "Not/A)Brand";v="99"' \
 -H 'sec-ch-ua-mobile: ?0' \
 -H 'sec-ch-ua-platform: "macOS"' \
 -H 'sec-fetch-dest: empty' \
 -H 'sec-fetch-mode: cors' \
 -H 'sec-fetch-site: same-origin' \
 -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0' \
 -H 'x-requested-with: XMLHttpRequest' \
 --data-raw 'id=1325260'
