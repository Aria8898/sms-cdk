using System;
using System.Collections.Generic;
using System.Text;
using System.Net;
using System.IO;
using System.Security.Cryptography;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;

namespace Demo
{
    class Program
    {
        private static int USER_ID = 5913;
        private static int USER_CODE = 567449;
        private static string API_KEY = "30f698e2bde90841a5d7f98b5f2194ae";

        static void Main(string[] args)
        {
            // Disable SSL verification
            ServicePointManager.ServerCertificateValidationCallback = delegate { return true; };

            Console.WriteLine("Authenticating...");
            string authResponse = Auth();
            Console.WriteLine("Auth Response: " + authResponse);

            string accessToken = ExtractAccessToken(authResponse);
            if (!string.IsNullOrEmpty(accessToken))
            {
                Console.WriteLine("Access Token: " + accessToken);

                Console.WriteLine("\nGetting Balance...");
                Console.WriteLine(Balance(accessToken));

                // Console.WriteLine("\nGetting Platform Info...");
                // Console.WriteLine(PlatformInfo(accessToken));

                // Console.WriteLine("\nTaking Phone Number...");
                // Console.WriteLine(TakeSmsPhoneNumber(128, 1, accessToken));

                // string orderNo = "389684649653202944";

                // Console.WriteLine("\nGetting Code...");
                // Console.WriteLine(GetCode(orderNo, accessToken));

                // Console.WriteLine("\nStopping Take Phone Number...");
                // Console.WriteLine(StopTakeSmsPhoneNumber(orderNo, accessToken));

                // Console.WriteLine("\nFreeing Phone Number...");
                // Console.WriteLine(FreedSmsPhoneNumber(orderNo, accessToken));

                // Console.WriteLine("\nAdding to Blacklist...");
                // Console.WriteLine(AddBlackSmsPhoneNumber(orderNo, accessToken));
            }

            Console.WriteLine("Press any key to exit...");
            Console.ReadKey();
        }

        /// <summary>
        /// 登录授权 (Login/Auth)
        /// 获取 access_token，后续所有接口调用都需要使用此 token。
        /// </summary>
        /// <returns>JSON 响应字符串</returns>
        public static string Auth()
        {
            string apiUrl = "https://api.yamasakisms.com/api/auth/login";
            Dictionary<string, string> param = new Dictionary<string, string>();
            param.Add("id", USER_ID.ToString());
            param.Add("usercode", USER_CODE.ToString());
            return MakeRequest(apiUrl, param);
        }

        /// <summary>
        /// 查询余额 (Query Balance)
        /// </summary>
        /// <param name="accessToken">接口访问凭证</param>
        /// <returns>JSON 响应字符串</returns>
        public static string Balance(string accessToken)
        {
            string apiUrl = "https://api.yamasakisms.com/api/auth/balance";
            Dictionary<string, string> param = new Dictionary<string, string>();
            param.Add("usercode", USER_CODE.ToString());
            param.Add("access_token", accessToken);
            return MakeRequest(apiUrl, param);
        }

        /// <summary>
        /// 获取平台信息 (Get Platform Info)
        /// </summary>
        /// <param name="accessToken">接口访问凭证</param>
        /// <returns>JSON 响应字符串</returns>
        public static string PlatformInfo(string accessToken)
        {
            string apiUrl = "https://api.yamasakisms.com/api/auth/platforminfo";
            Dictionary<string, string> param = new Dictionary<string, string>();
            param.Add("usercode", USER_CODE.ToString());
            param.Add("access_token", accessToken);
            param.Add("platform_type", "sms");
            return MakeRequest(apiUrl, param);
        }

        /// <summary>
        /// 获取手机号 (Get Phone Number)
        /// </summary>
        /// <param name="platformId">项目/平台ID</param>
        /// <param name="takeCount">获取数量</param>
        /// <param name="accessToken">接口访问凭证</param>
        /// <returns>JSON 响应字符串</returns>
        public static string TakeSmsPhoneNumber(int platformId, int takeCount, string accessToken)
        {
            string apiUrl = "https://api.yamasakisms.com/api/auth/takesmsphonenumber";
            Dictionary<string, string> param = new Dictionary<string, string>();
            param.Add("usercode", USER_CODE.ToString());
            param.Add("access_token", accessToken);
            param.Add("platform_id", platformId.ToString());
            param.Add("take_count", takeCount.ToString());
            return MakeRequest(apiUrl, param);
        }

        /// <summary>
        /// 停止获取手机号 (Stop Getting Phone Number)
        /// </summary>
        /// <param name="orderNo">订单号</param>
        /// <param name="accessToken">接口访问凭证</param>
        /// <returns>JSON 响应字符串</returns>
        public static string StopTakeSmsPhoneNumber(string orderNo, string accessToken)
        {
            string apiUrl = "https://api.yamasakisms.com/api/auth/stoptakesmsphonenumber";
            Dictionary<string, string> param = new Dictionary<string, string>();
            param.Add("usercode", USER_CODE.ToString());
            param.Add("access_token", accessToken);
            param.Add("order_no", orderNo);
            return MakeRequest(apiUrl, param);
        }

        /// <summary>
        /// 释放手机号 (Free/Release Phone Number)
        /// </summary>
        /// <param name="orderNo">订单号</param>
        /// <param name="accessToken">接口访问凭证</param>
        /// <returns>JSON 响应字符串</returns>
        public static string FreedSmsPhoneNumber(string orderNo, string accessToken)
        {
            string apiUrl = "https://api.yamasakisms.com/api/auth/freedsmsphonenumber";
            Dictionary<string, string> param = new Dictionary<string, string>();
            param.Add("usercode", USER_CODE.ToString());
            param.Add("access_token", accessToken);
            param.Add("order_no", orderNo);
            return MakeRequest(apiUrl, param);
        }

        /// <summary>
        /// 拉黑手机号 (Blacklist Phone Number)
        /// </summary>
        /// <param name="orderNo">订单号</param>
        /// <param name="accessToken">接口访问凭证</param>
        /// <returns>JSON 响应字符串</returns>
        public static string AddBlackSmsPhoneNumber(string orderNo, string accessToken)
        {
            string apiUrl = "https://api.yamasakisms.com/api/auth/addblacksmsphonenumber";
            Dictionary<string, string> param = new Dictionary<string, string>();
            param.Add("usercode", USER_CODE.ToString());
            param.Add("access_token", accessToken);
            param.Add("order_no", orderNo);
            return MakeRequest(apiUrl, param);
        }

        /// <summary>
        /// 获取验证码 (Get Verification Code)
        /// </summary>
        /// <param name="orderNo">订单号</param>
        /// <param name="accessToken">接口访问凭证</param>
        /// <returns>JSON 响应字符串</returns>
        public static string GetCode(string orderNo, string accessToken)
        {
            string apiUrl = "https://api.yamasakisms.com/api/auth/getphonecode";
            Dictionary<string, string> param = new Dictionary<string, string>();
            param.Add("usercode", USER_CODE.ToString());
            param.Add("access_token", accessToken);
            param.Add("order_no", orderNo);
            return MakeRequest(apiUrl, param);
        }

        /// <summary>
        /// 发送HTTP请求 (Send HTTP Request)
        /// </summary>
        /// <param name="url">请求URL</param>
        /// <param name="param">请求参数字典</param>
        /// <returns>响应内容</returns>
        private static string MakeRequest(string url, Dictionary<string, string> param)
        {
            try
            {
                // Add timestamp
                TimeSpan t = (DateTime.UtcNow - new DateTime(1970, 1, 1));
                int timestamp = (int)t.TotalSeconds;
                param.Add("timestamp", timestamp.ToString());

                // Generate signature
                string sign = GenerateSign(param);
                param.Add("sign", sign);

                // Build query string
                StringBuilder postData = new StringBuilder();
                foreach (KeyValuePair<string, string> pair in param)
                {
                    if (postData.Length > 0) postData.Append("&");
                    postData.Append(Uri.EscapeDataString(pair.Key));
                    postData.Append("=");
                    postData.Append(Uri.EscapeDataString(pair.Value));
                }
                byte[] data = Encoding.UTF8.GetBytes(postData.ToString());

                WebRequest request = WebRequest.Create(url);
                request.Method = "POST";
                request.ContentType = "application/x-www-form-urlencoded";
                request.ContentLength = data.Length;

                using (Stream stream = request.GetRequestStream())
                {
                    stream.Write(data, 0, data.Length);
                }

                using (WebResponse response = request.GetResponse())
                {
                    using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                    {
                        return reader.ReadToEnd();
                    }
                }
            }
            catch (Exception ex)
            {
                return "Error: " + ex.Message;
            }
        }

        /// <summary>
        /// 生成签名 (Generate Signature)
        /// 规则: 按参数名排序 -> 拼接 key=value&... -> 拼接 API_KEY -> MD5
        /// </summary>
        /// <param name="param">参数字典</param>
        /// <returns>签名字符串</returns>
        private static string GenerateSign(Dictionary<string, string> param)
        {
            List<string> sortedKeys = new List<string>(param.Keys);
            sortedKeys.Sort(StringComparer.Ordinal);

            StringBuilder sb = new StringBuilder();
            foreach (string key in sortedKeys)
            {
                string value = param[key];
                if (!string.IsNullOrEmpty(value))
                {
                    // PHP's logic: if($value === '' || $value === null) continue;
                    // In C#, checking IsNullOrEmpty covers null and empty string.
                    if (sb.Length > 0)
                    {
                        sb.Append("&");
                    }
                    sb.Append(key).Append("=").Append(value);
                }
            }
            sb.Append(API_KEY);
            return CalculateMD5(sb.ToString());
        }

        /// <summary>
        /// 计算MD5 (Calculate MD5)
        /// </summary>
        /// <param name="input">输入字符串</param>
        /// <returns>MD5哈希字符串</returns>
        private static string CalculateMD5(string input)
        {
            using (MD5 md5 = MD5.Create())
            {
                byte[] inputBytes = Encoding.UTF8.GetBytes(input);
                byte[] hashBytes = md5.ComputeHash(inputBytes);

                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < hashBytes.Length; i++)
                {
                    sb.Append(hashBytes[i].ToString("x2"));
                }
                return sb.ToString();
            }
        }

        /// <summary>
        /// 提取Token (Extract Token)
        /// 简单的JSON解析
        /// </summary>
        /// <param name="json">JSON字符串</param>
        /// <returns>access_token</returns>
        private static string ExtractAccessToken(string json)
        {
            if (string.IsNullOrEmpty(json)) return null;
            string key = "\"access_token\":\"";
            int start = json.IndexOf(key);
            if (start == -1) return null;
            start += key.Length;
            int end = json.IndexOf("\"", start);
            if (end == -1) return null;
            return json.Substring(start, end - start);
        }
    }
}
