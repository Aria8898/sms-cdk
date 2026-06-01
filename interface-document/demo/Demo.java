import java.io.BufferedReader;
import java.io.DataOutputStream;
import java.io.InputStreamReader;
import java.io.UnsupportedEncodingException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;

public class Demo {

    private static final int USER_ID = 5913;
    private static final int USER_CODE = 567449;
    private static final String API_KEY = "30f698e2bde90841a5d7f98b5f2194ae";

    public static void main(String[] args) {
        // Disable SSL verification for demo purposes (matching PHP's CURLOPT_SSL_VERIFYPEER => false)
        disableSslVerification();

        System.out.println("Authenticating...");
        String authResponse = auth();
        System.out.println("Auth Response: " + authResponse);

        String accessToken = extractAccessToken(authResponse);
        if (accessToken != null) {
            System.out.println("Access Token: " + accessToken);

            System.out.println("\nGetting Balance...");
            System.out.println(balance(accessToken));

            // System.out.println("\nGetting Platform Info...");
            // System.out.println(platformInfo(accessToken));

            // System.out.println("\nTaking Phone Number...");
            // System.out.println(takeSmsPhoneNumber(128, 1, accessToken));

            // String orderNo = "389684649653202944";
            
            // System.out.println("\nGetting Code...");
            // System.out.println(getCode(orderNo, accessToken));
            
            // System.out.println("\nStopping Take Phone Number...");
            // System.out.println(stopTakeSmsPhoneNumber(orderNo, accessToken));

            // System.out.println("\nFreeing Phone Number...");
            // System.out.println(freedSmsPhoneNumber(orderNo, accessToken));

            // System.out.println("\nAdding to Blacklist...");
            // System.out.println(addBlackSmsPhoneNumber(orderNo, accessToken));
        }
    }

    // API授权登录
    public static String auth() {
        String apiUrl = "https://api.yamasakisms.com/api/auth/login";
        Map<String, String> params = new HashMap<>();
        params.put("id", String.valueOf(USER_ID));
        params.put("usercode", String.valueOf(USER_CODE));
        return makeRequest(apiUrl, params);
    }

    // 获取账户余额
    public static String balance(String accessToken) {
        String apiUrl = "https://api.yamasakisms.com/api/auth/balance";
        Map<String, String> params = new HashMap<>();
        params.put("usercode", String.valueOf(USER_CODE));
        params.put("access_token", accessToken);
        return makeRequest(apiUrl, params);
    }

    // 获取平台项目价格
    public static String platformInfo(String accessToken) {
        String apiUrl = "https://api.yamasakisms.com/api/auth/platforminfo";
        Map<String, String> params = new HashMap<>();
        params.put("usercode", String.valueOf(USER_CODE));
        params.put("access_token", accessToken);
        params.put("platform_type", "sms");
        return makeRequest(apiUrl, params);
    }

    // 短信业务取号
    public static String takeSmsPhoneNumber(int platformId, int takeCount, String accessToken) {
        String apiUrl = "https://api.yamasakisms.com/api/auth/takesmsphonenumber";
        Map<String, String> params = new HashMap<>();
        params.put("usercode", String.valueOf(USER_CODE));
        params.put("access_token", accessToken);
        params.put("platform_id", String.valueOf(platformId));
        params.put("take_count", String.valueOf(takeCount));
        return makeRequest(apiUrl, params);
    }

    // 取消短信业务取号
    public static String stopTakeSmsPhoneNumber(String orderNo, String accessToken) {
        String apiUrl = "https://api.yamasakisms.com/api/auth/stoptakesmsphonenumber";
        Map<String, String> params = new HashMap<>();
        params.put("usercode", String.valueOf(USER_CODE));
        params.put("access_token", accessToken);
        params.put("order_no", orderNo);
        return makeRequest(apiUrl, params);
    }

    // 取消接码
    public static String freedSmsPhoneNumber(String orderNo, String accessToken) {
        String apiUrl = "https://api.yamasakisms.com/api/auth/freedsmsphonenumber";
        Map<String, String> params = new HashMap<>();
        params.put("usercode", String.valueOf(USER_CODE));
        params.put("access_token", accessToken);
        params.put("order_no", orderNo);
        return makeRequest(apiUrl, params);
    }

    // 加入黑名单
    public static String addBlackSmsPhoneNumber(String orderNo, String accessToken) {
        String apiUrl = "https://api.yamasakisms.com/api/auth/addblacksmsphonenumber";
        Map<String, String> params = new HashMap<>();
        params.put("usercode", String.valueOf(USER_CODE));
        params.put("access_token", accessToken);
        params.put("order_no", orderNo);
        return makeRequest(apiUrl, params);
    }

    // 获取验证码
    public static String getCode(String orderNo, String accessToken) {
        String apiUrl = "https://api.yamasakisms.com/api/auth/getphonecode";
        Map<String, String> params = new HashMap<>();
        params.put("usercode", String.valueOf(USER_CODE));
        params.put("access_token", accessToken);
        params.put("order_no", orderNo);
        return makeRequest(apiUrl, params);
    }

    private static String makeRequest(String urlStr, Map<String, String> params) {
        try {
            // Add timestamp
            params.put("timestamp", String.valueOf(System.currentTimeMillis() / 1000));

            // Generate signature
            String sign = generateSign(params);
            params.put("sign", sign);

            // Build query string
            StringBuilder postData = new StringBuilder();
            for (Map.Entry<String, String> param : params.entrySet()) {
                if (postData.length() != 0) postData.append('&');
                postData.append(URLEncoder.encode(param.getKey(), "UTF-8"));
                postData.append('=');
                postData.append(URLEncoder.encode(param.getValue(), "UTF-8"));
            }
            byte[] postDataBytes = postData.toString().getBytes("UTF-8");

            URL url = new URL(urlStr);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            conn.setRequestProperty("Content-Length", String.valueOf(postDataBytes.length));
            conn.setDoOutput(true);

            try (DataOutputStream wr = new DataOutputStream(conn.getOutputStream())) {
                wr.write(postDataBytes);
            }

            StringBuilder content;
            try (BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream()))) {
                String line;
                content = new StringBuilder();
                while ((line = in.readLine()) != null) {
                    content.append(line);
                    content.append(System.lineSeparator());
                }
            }
            return content.toString();

        } catch (Exception e) {
            e.printStackTrace();
            return null;
        }
    }

    private static String generateSign(Map<String, String> params) {
        // Sort keys
        List<String> sortedKeys = new ArrayList<>(params.keySet());
        Collections.sort(sortedKeys);

        StringBuilder sb = new StringBuilder();
        for (String key : sortedKeys) {
            String value = params.get(key);
            if (value != null && !value.isEmpty()) {
                if (sb.length() > 0) {
                    sb.append('&');
                }
                sb.append(key).append('=').append(value);
            }
        }
        sb.append(API_KEY);
        return md5(sb.toString());
    }

    private static String md5(String s) {
        try {
            MessageDigest digest = MessageDigest.getInstance("MD5");
            byte[] hash = digest.digest(s.getBytes("UTF-8"));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (NoSuchAlgorithmException | UnsupportedEncodingException e) {
            throw new RuntimeException(e);
        }
    }

    private static String extractAccessToken(String json) {
        // Simple regex to extract access_token for demo purposes
        if (json == null) return null;
        String key = "\"access_token\":\"";
        int start = json.indexOf(key);
        if (start == -1) return null;
        start += key.length();
        int end = json.indexOf("\"", start);
        if (end == -1) return null;
        return json.substring(start, end);
    }
    
    private static void disableSslVerification() {
        try {
            // Create a trust manager that does not validate certificate chains
            javax.net.ssl.TrustManager[] trustAllCerts = new javax.net.ssl.TrustManager[] {
                new javax.net.ssl.X509TrustManager() {
                    public java.security.cert.X509Certificate[] getAcceptedIssuers() { return null; }
                    public void checkClientTrusted(java.security.cert.X509Certificate[] certs, String authType) { }
                    public void checkServerTrusted(java.security.cert.X509Certificate[] certs, String authType) { }
                }
            };
            // Install the all-trusting trust manager
            javax.net.ssl.SSLContext sc = javax.net.ssl.SSLContext.getInstance("SSL");
            sc.init(null, trustAllCerts, new java.security.SecureRandom());
            javax.net.ssl.HttpsURLConnection.setDefaultSSLSocketFactory(sc.getSocketFactory());
            // Create all-trusting host name verifier
            javax.net.ssl.HostnameVerifier allHostsValid = new javax.net.ssl.HostnameVerifier() {
                public boolean verify(String hostname, javax.net.ssl.SSLSession session) { return true; }
            };
            // Install the all-trusting host verifier
            javax.net.ssl.HttpsURLConnection.setDefaultHostnameVerifier(allHostsValid);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
