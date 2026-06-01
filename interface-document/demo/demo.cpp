#include <iostream>
#include <string>
#include <map>
#include <vector>
#include <algorithm>
#include <sstream>
#include <iomanip>
#include <ctime>
#include <cstring>
#include <cstdint>

#include <curl/curl.h>

static const int    USER_ID   = 5913;
static const int    USER_CODE = 567449;
static const std::string API_KEY = "30f698e2bde90841a5d7f98b5f2194ae";

class MD5
{
public:
    MD5() { reset(); }

    void update(const unsigned char* data, size_t len)
    {
        uint32_t idx = (count[0] >> 3) & 0x3F;
        uint32_t space = 64 - idx;
        count[0] += static_cast<uint32_t>(len) << 3;
        if (count[0] < (static_cast<uint32_t>(len) << 3)) count[1]++;
        count[1] += static_cast<uint32_t>(len) >> 29;

        if (len >= space)
        {
            std::memcpy(buffer + idx, data, space);
            transform(buffer);
            for (size_t i = space; i + 63 < len; i += 64)
                transform(data + i);
            idx = 0;
        }
        else
        {
            idx = static_cast<uint32_t>(len);
        }
        remaining = static_cast<uint32_t>(len - (space > len ? 0 : space));
        if (remaining > 0)
            std::memcpy(buffer, data + (len > space ? len - remaining : 0), remaining);
    }

    void update(const std::string& s)
    {
        update(reinterpret_cast<const unsigned char*>(s.c_str()), s.size());
    }

    std::string hexdigest()
    {
        unsigned char digest[16];
        finalize(digest);
        std::ostringstream oss;
        for (int i = 0; i < 16; i++)
            oss << std::hex << std::setfill('0') << std::setw(2) << static_cast<int>(digest[i]);
        return oss.str();
    }

private:
    void reset()
    {
        state[0] = 0x67452301;
        state[1] = 0xEFCDAB89;
        state[2] = 0x98BADCFE;
        state[3] = 0x10325476;
        count[0] = 0;
        count[1] = 0;
        remaining = 0;
    }

    void finalize(unsigned char digest[16])
    {
        unsigned char bits[8];
        encode(bits, count, 8);

        uint32_t idx = (count[0] >> 3) & 0x3F;
        uint32_t padLen = (idx < 56) ? (56 - idx) : (120 - idx);
        static const unsigned char padding[64] = { 0x80 };
        update(padding, padLen);
        update(bits, 8);

        encode(digest, state, 16);
        reset();
    }

    void transform(const unsigned char block[64])
    {
        uint32_t a = state[0], b = state[1], c = state[2], d = state[3];
        uint32_t x[16];
        decode(x, block, 64);

        auto F  = [](uint32_t x, uint32_t y, uint32_t z) { return (x & y) | (~x & z); };
        auto G  = [](uint32_t x, uint32_t y, uint32_t z) { return (x & z) | (y & ~z); };
        auto H  = [](uint32_t x, uint32_t y, uint32_t z) { return x ^ y ^ z; };
        auto I  = [](uint32_t x, uint32_t y, uint32_t z) { return y ^ (x | ~z); };
        auto ROT = [](uint32_t x, uint32_t n) { return (x << n) | (x >> (32 - n)); };
        auto FF = [&](uint32_t& a, uint32_t b, uint32_t c, uint32_t d, uint32_t x, uint32_t s, uint32_t ac)
            { a = ROT(a + F(b, c, d) + x + ac, s) + b; };
        auto GG = [&](uint32_t& a, uint32_t b, uint32_t c, uint32_t d, uint32_t x, uint32_t s, uint32_t ac)
            { a = ROT(a + G(b, c, d) + x + ac, s) + b; };
        auto HH = [&](uint32_t& a, uint32_t b, uint32_t c, uint32_t d, uint32_t x, uint32_t s, uint32_t ac)
            { a = ROT(a + H(b, c, d) + x + ac, s) + b; };
        auto II = [&](uint32_t& a, uint32_t b, uint32_t c, uint32_t d, uint32_t x, uint32_t s, uint32_t ac)
            { a = ROT(a + I(b, c, d) + x + ac, s) + b; };

        FF(a, b, c, d, x[ 0],  7, 0xD76AA478); FF(d, a, b, c, x[ 1], 12, 0xE8C7B756); FF(c, d, a, b, x[ 2], 17, 0x242070DB); FF(b, c, d, a, x[ 3], 22, 0xC1BDCEEE);
        FF(a, b, c, d, x[ 4],  7, 0xF57C0FAF); FF(d, a, b, c, x[ 5], 12, 0x4787C62A); FF(c, d, a, b, x[ 6], 17, 0xA8304613); FF(b, c, d, a, x[ 7], 22, 0xFD469501);
        FF(a, b, c, d, x[ 8],  7, 0x698098D8); FF(d, a, b, c, x[ 9], 12, 0x8B44F7AF); FF(c, d, a, b, x[10], 17, 0xFFFF5BB1); FF(b, c, d, a, x[11], 22, 0x895CD7BE);
        FF(a, b, c, d, x[12],  7, 0x6B901122); FF(d, a, b, c, x[13], 12, 0xFD987193); FF(c, d, a, b, x[14], 17, 0xA679438E); FF(b, c, d, a, x[15], 22, 0x49B40821);

        GG(a, b, c, d, x[ 1],  5, 0xF61E2562); GG(d, a, b, c, x[ 6],  9, 0xC040B340); GG(c, d, a, b, x[11], 14, 0x265E5A51); GG(b, c, d, a, x[ 0], 20, 0xE9B6C7AA);
        GG(a, b, c, d, x[ 5],  5, 0xD62F105D); GG(d, a, b, c, x[10],  9, 0x02441453); GG(c, d, a, b, x[15], 14, 0xD8A1E681); GG(b, c, d, a, x[ 4], 20, 0xE7D3FBC8);
        GG(a, b, c, d, x[ 9],  5, 0x21E1CDE6); GG(d, a, b, c, x[14],  9, 0xC33707D6); GG(c, d, a, b, x[ 3], 14, 0xF4D50D87); GG(b, c, d, a, x[ 8], 20, 0x455A14ED);
        GG(a, b, c, d, x[13],  5, 0xA9E3E905); GG(d, a, b, c, x[ 2],  9, 0xFCEFA3F8); GG(c, d, a, b, x[ 7], 14, 0x676F02D9); GG(b, c, d, a, x[12], 20, 0x8D2A4C8A);

        HH(a, b, c, d, x[ 5],  4, 0xFFFA3942); HH(d, a, b, c, x[ 8], 11, 0x8771F681); HH(c, d, a, b, x[11], 16, 0x6D9D6122); HH(b, c, d, a, x[14], 23, 0xFDE5380C);
        HH(a, b, c, d, x[ 1],  4, 0xA4BEEA44); HH(d, a, b, c, x[ 4], 11, 0x4BDECFA9); HH(c, d, a, b, x[ 7], 16, 0xF6BB4B60); HH(b, c, d, a, x[10], 23, 0xBEBFBC70);
        HH(a, b, c, d, x[13],  4, 0x289B7EC6); HH(d, a, b, c, x[ 0], 11, 0xEAA127FA); HH(c, d, a, b, x[ 3], 16, 0xD4EF3085); HH(b, c, d, a, x[ 6], 23, 0x04881D05);
        HH(a, b, c, d, x[ 9],  4, 0xD9D4D039); HH(d, a, b, c, x[12], 11, 0xE6DB99E5); HH(c, d, a, b, x[15], 16, 0x1FA27CF8); HH(b, c, d, a, x[ 2], 23, 0xC4AC5665);

        II(a, b, c, d, x[ 0],  6, 0xF4292244); II(d, a, b, c, x[ 7], 10, 0x432AFF97); II(c, d, a, b, x[14], 15, 0xAB9423A7); II(b, c, d, a, x[ 5], 21, 0xFC93A039);
        II(a, b, c, d, x[12],  6, 0x655B59C3); II(d, a, b, c, x[ 3], 10, 0x8F0CCC92); II(c, d, a, b, x[10], 15, 0xFFEFF47D); II(b, c, d, a, x[ 1], 21, 0x85845DD1);
        II(a, b, c, d, x[ 8],  6, 0x6FA87E4F); II(d, a, b, c, x[15], 10, 0xFE2CE6E0); II(c, d, a, b, x[ 6], 15, 0xA3014314); II(b, c, d, a, x[13], 21, 0x4E0811A1);
        II(a, b, c, d, x[ 4],  6, 0xF7537E82); II(d, a, b, c, x[11], 10, 0xBD3AF235); II(c, d, a, b, x[ 2], 15, 0x2AD7D2BB); II(b, c, d, a, x[ 9], 21, 0xEB86D391);

        state[0] += a; state[1] += b; state[2] += c; state[3] += d;
    }

    static void decode(uint32_t* output, const unsigned char* input, size_t len)
    {
        for (size_t i = 0, j = 0; j < len; i++, j += 4)
            output[i] = static_cast<uint32_t>(input[j])
                      | (static_cast<uint32_t>(input[j + 1]) << 8)
                      | (static_cast<uint32_t>(input[j + 2]) << 16)
                      | (static_cast<uint32_t>(input[j + 3]) << 24);
    }

    static void encode(unsigned char* output, const uint32_t* input, size_t len)
    {
        for (size_t i = 0, j = 0; j < len; i++, j += 4)
        {
            output[j]     = static_cast<unsigned char>(input[i] & 0xFF);
            output[j + 1] = static_cast<unsigned char>((input[i] >> 8) & 0xFF);
            output[j + 2] = static_cast<unsigned char>((input[i] >> 16) & 0xFF);
            output[j + 3] = static_cast<unsigned char>((input[i] >> 24) & 0xFF);
        }
    }

    uint32_t state[4];
    uint32_t count[2];
    unsigned char buffer[64];
    uint32_t remaining;
};

static size_t writeCallback(void* contents, size_t size, size_t nmemb, void* userp)
{
    size_t total = size * nmemb;
    auto* str = static_cast<std::string*>(userp);
    str->append(static_cast<char*>(contents), total);
    return total;
}

static std::string urlEncode(const std::string& value)
{
    CURL* curl = curl_easy_init();
    if (!curl) return value;
    char* escaped = curl_easy_escape(curl, value.c_str(), static_cast<int>(value.size()));
    std::string result(escaped ? escaped : value);
    curl_free(escaped);
    curl_easy_cleanup(curl);
    return result;
}

/// <summary>
/// 生成签名 (Generate Signature)
/// 规则: 按参数名排序 -> 拼接 key=value&... -> 拼接 API_KEY -> MD5
/// </summary>
static std::string generateSign(const std::map<std::string, std::string>& param)
{
    std::vector<std::string> keys;
    for (const auto& kv : param)
        keys.push_back(kv.first);
    std::sort(keys.begin(), keys.end());

    std::ostringstream oss;
    for (size_t i = 0; i < keys.size(); i++)
    {
        const std::string& value = param.at(keys[i]);
        if (value.empty()) continue;
        if (oss.tellp() > 0) oss << "&";
        oss << keys[i] << "=" << value;
    }
    oss << API_KEY;

    MD5 md5;
    md5.update(oss.str());
    return md5.hexdigest();
}

/// <summary>
/// 发送HTTP请求 (Send HTTP Request)
/// </summary>
static std::string makeRequest(const std::string& url, std::map<std::string, std::string> param)
{
    int timestamp = static_cast<int>(std::time(nullptr));
    param["timestamp"] = std::to_string(timestamp);
    param["sign"] = generateSign(param);

    std::ostringstream postData;
    for (auto it = param.begin(); it != param.end(); ++it)
    {
        if (it != param.begin()) postData << "&";
        postData << urlEncode(it->first) << "=" << urlEncode(it->second);
    }
    std::string postStr = postData.str();

    CURL* curl = curl_easy_init();
    if (!curl) return "Error: curl_easy_init failed";

    std::string response;
    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, postStr.c_str());
    curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, static_cast<long>(postStr.size()));
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, writeCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 30L);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 0L);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 0L);

    CURLcode res = curl_easy_perform(curl);
    if (res != CURLE_OK)
        response = std::string("Error: ") + curl_easy_strerror(res);

    curl_easy_cleanup(curl);
    return response;
}

/// <summary>
/// 提取Token (Extract Token)
/// 简单的JSON解析
/// </summary>
static std::string extractAccessToken(const std::string& json)
{
    if (json.empty()) return "";
    const std::string key = "\"access_token\":\"";
    size_t start = json.find(key);
    if (start == std::string::npos) return "";
    start += key.size();
    size_t end = json.find("\"", start);
    if (end == std::string::npos) return "";
    return json.substr(start, end - start);
}

/// <summary>
/// 登录授权 (Login/Auth)
/// 获取 access_token，后续所有接口调用都需要使用此 token。
/// </summary>
static std::string auth()
{
    std::string apiUrl = "https://api.yamasakisms.com/api/auth/login";
    std::map<std::string, std::string> param;
    param["id"] = std::to_string(USER_ID);
    param["usercode"] = std::to_string(USER_CODE);
    return makeRequest(apiUrl, param);
}

/// <summary>
/// 查询余额 (Query Balance)
/// </summary>
static std::string balance(const std::string& accessToken)
{
    std::string apiUrl = "https://api.yamasakisms.com/api/auth/balance";
    std::map<std::string, std::string> param;
    param["usercode"] = std::to_string(USER_CODE);
    param["access_token"] = accessToken;
    return makeRequest(apiUrl, param);
}

/// <summary>
/// 获取平台信息 (Get Platform Info)
/// </summary>
static std::string platformInfo(const std::string& accessToken)
{
    std::string apiUrl = "https://api.yamasakisms.com/api/auth/platforminfo";
    std::map<std::string, std::string> param;
    param["usercode"] = std::to_string(USER_CODE);
    param["access_token"] = accessToken;
    param["platform_type"] = "sms";
    return makeRequest(apiUrl, param);
}

/// <summary>
/// 获取手机号 (Get Phone Number)
/// </summary>
static std::string takeSmsPhoneNumber(int platformId, int takeCount, const std::string& accessToken)
{
    std::string apiUrl = "https://api.yamasakisms.com/api/auth/takesmsphonenumber";
    std::map<std::string, std::string> param;
    param["usercode"] = std::to_string(USER_CODE);
    param["access_token"] = accessToken;
    param["platform_id"] = std::to_string(platformId);
    param["take_count"] = std::to_string(takeCount);
    return makeRequest(apiUrl, param);
}

/// <summary>
/// 停止获取手机号 (Stop Getting Phone Number)
/// </summary>
static std::string stopTakeSmsPhoneNumber(const std::string& orderNo, const std::string& accessToken)
{
    std::string apiUrl = "https://api.yamasakisms.com/api/auth/stoptakesmsphonenumber";
    std::map<std::string, std::string> param;
    param["usercode"] = std::to_string(USER_CODE);
    param["access_token"] = accessToken;
    param["order_no"] = orderNo;
    return makeRequest(apiUrl, param);
}

/// <summary>
/// 释放手机号 (Free/Release Phone Number)
/// </summary>
static std::string freedSmsPhoneNumber(const std::string& orderNo, const std::string& accessToken)
{
    std::string apiUrl = "https://api.yamasakisms.com/api/auth/freedsmsphonenumber";
    std::map<std::string, std::string> param;
    param["usercode"] = std::to_string(USER_CODE);
    param["access_token"] = accessToken;
    param["order_no"] = orderNo;
    return makeRequest(apiUrl, param);
}

/// <summary>
/// 拉黑手机号 (Blacklist Phone Number)
/// </summary>
static std::string addBlackSmsPhoneNumber(const std::string& orderNo, const std::string& accessToken)
{
    std::string apiUrl = "https://api.yamasakisms.com/api/auth/addblacksmsphonenumber";
    std::map<std::string, std::string> param;
    param["usercode"] = std::to_string(USER_CODE);
    param["access_token"] = accessToken;
    param["order_no"] = orderNo;
    return makeRequest(apiUrl, param);
}

/// <summary>
/// 获取验证码 (Get Verification Code)
/// </summary>
static std::string getCode(const std::string& orderNo, const std::string& accessToken)
{
    std::string apiUrl = "https://api.yamasakisms.com/api/auth/getphonecode";
    std::map<std::string, std::string> param;
    param["usercode"] = std::to_string(USER_CODE);
    param["access_token"] = accessToken;
    param["order_no"] = orderNo;
    return makeRequest(apiUrl, param);
}

int main()
{
    curl_global_init(CURL_GLOBAL_DEFAULT);

    std::cout << "Authenticating..." << std::endl;
    std::string authResponse = auth();
    std::cout << "Auth Response: " << authResponse << std::endl;

    std::string accessToken = extractAccessToken(authResponse);
    if (!accessToken.empty())
    {
        std::cout << "Access Token: " << accessToken << std::endl;

        std::cout << "\nGetting Balance..." << std::endl;
        std::cout << balance(accessToken) << std::endl;

        // std::cout << "\nGetting Platform Info..." << std::endl;
        // std::cout << platformInfo(accessToken) << std::endl;

        // std::cout << "\nTaking Phone Number..." << std::endl;
        // std::cout << takeSmsPhoneNumber(128, 1, accessToken) << std::endl;

        // std::string orderNo = "389684649653202944";

        // std::cout << "\nGetting Code..." << std::endl;
        // std::cout << getCode(orderNo, accessToken) << std::endl;

        // std::cout << "\nStopping Take Phone Number..." << std::endl;
        // std::cout << stopTakeSmsPhoneNumber(orderNo, accessToken) << std::endl;

        // std::cout << "\nFreeing Phone Number..." << std::endl;
        // std::cout << freedSmsPhoneNumber(orderNo, accessToken) << std::endl;

        // std::cout << "\nAdding to Blacklist..." << std::endl;
        // std::cout << addBlackSmsPhoneNumber(orderNo, accessToken) << std::endl;
    }

    std::cout << "Press any key to exit..." << std::endl;
    std::cin.get();

    curl_global_cleanup();
    return 0;
}
