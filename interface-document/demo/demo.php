<?php

$config = [
        'user_id'           => 5913,
        'user_code'         => 567449,
        'api_key'           => '30f698e2bde90841a5d7f98b5f2194ae',
    ];

//API授权登录
function auth(){
    global $config;
    
    $api_url = "https://api.yamasakisms.com/api/auth/login";
    
    $post_data = [
        'id'            => $config['user_id'],
        'usercode'      => $config['user_code'],
        'timestamp'     => time(),
        'sign'          => '',
    ];
    ksort($post_data);
    
    $param_str = [];
    foreach ($post_data as $key => $value) {
        if($value === '' || $value === null) continue;
        $param_str[] = "{$key}={$value}";
    }
    $final_str = implode('&', $param_str).$config['api_key'];
    $post_data['sign'] = md5($final_str);
    
    
    $ch = curl_init($api_url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query($post_data),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false
    ]);
    
    $response = curl_exec($ch);
    if ($response === false) {
        $error = curl_error($ch);
        echo "请求失败：{$error}";
        curl_close($ch);
        return;
    }
    
    $result = json_decode($response, true);
    
    if ($result === null && json_last_error() !== JSON_ERROR_NONE){
        curl_close($ch);
        
        $errorMsg = json_last_error_msg();
        $errorCode = json_last_error();
        echo "JSON解析失败：错误码={$errorCode}，错误信息={$errorMsg}";
        return;
    }
    curl_close($ch);
    return $result['data'];
}

//获取账户余额
function balance($access_token){
    global $config;
    
    $api_url = "https://api.yamasakisms.com/api/auth/balance";
    
    $post_data = [
        'usercode'      => $config['user_code'],
        'access_token'  => $access_token,
        'timestamp'     => time(),
        'sign'          => '',
    ];
    ksort($post_data);
    
    $param_str = [];
    foreach ($post_data as $key => $value) {
        if($value === '' || $value === null) continue;
        $param_str[] = "{$key}={$value}";
    }
    $final_str = implode('&', $param_str).$config['api_key'];
    $post_data['sign'] = md5($final_str);
    
    
    $ch = curl_init($api_url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query($post_data),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false
    ]);
    
    $response = curl_exec($ch);
    if ($response === false) {
        $error = curl_error($ch);
        echo "请求失败：{$error}";
        curl_close($ch);
        return;
    }
    
    $result = json_decode($response, true);
    
    if ($result === null && json_last_error() !== JSON_ERROR_NONE){
        curl_close($ch);
        
        $errorMsg = json_last_error_msg();
        $errorCode = json_last_error();
        echo "JSON解析失败：错误码={$errorCode}，错误信息={$errorMsg}";
        return;
    }
    curl_close($ch);
    return $result['data'];
}

//获取平台项目价格
function platforminfo($access_token){
    global $config;
    
    $api_url = "https://api.yamasakisms.com/api/auth/platforminfo";
    
    $post_data = [
        'usercode'      => $config['user_code'],
        'access_token'  => $access_token,
        'platform_type' => 'sms',
        'timestamp'     => time(),
        'sign'          => '',
    ];
    ksort($post_data);
    
    $param_str = [];
    foreach ($post_data as $key => $value) {
        if($value === '' || $value === null) continue;
        $param_str[] = "{$key}={$value}";
    }
    $final_str = implode('&', $param_str).$config['api_key'];
    $post_data['sign'] = md5($final_str);
    
    
    $ch = curl_init($api_url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query($post_data),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false
    ]);
    
    $response = curl_exec($ch);
    if ($response === false) {
        $error = curl_error($ch);
        echo "请求失败：{$error}";
        curl_close($ch);
        return;
    }
    
    $result = json_decode($response, true);
    
    if ($result === null && json_last_error() !== JSON_ERROR_NONE){
        curl_close($ch);
        
        $errorMsg = json_last_error_msg();
        $errorCode = json_last_error();
        echo "JSON解析失败：错误码={$errorCode}，错误信息={$errorMsg}";
        return;
    }
    curl_close($ch);
    return $result['data'];
}

//短信业务取号
function takeSmsPhoneNumber($platform_id,$take_count,$access_token){
    global $config;
    
    $api_url = "https://api.yamasakisms.com/api/auth/takesmsphonenumber";
    
    $post_data = [
        'usercode'      => $config['user_code'],
        'access_token'  => $access_token,
        'platform_id'   => $platform_id,
        'take_count'    => $take_count,
        'timestamp'     => time(),
        'sign'          => '',
    ];
    ksort($post_data);
    
    $param_str = [];
    foreach ($post_data as $key => $value) {
        if($value === '' || $value === null) continue;
        $param_str[] = "{$key}={$value}";
    }
    $final_str = implode('&', $param_str).$config['api_key'];
    $post_data['sign'] = md5($final_str);
    
    
    $ch = curl_init($api_url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query($post_data),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false
    ]);
    
    $response = curl_exec($ch);
    if ($response === false) {
        $error = curl_error($ch);
        echo "请求失败：{$error}";
        curl_close($ch);
        return;
    }
    
    $result = json_decode($response, true);
    
    if ($result === null && json_last_error() !== JSON_ERROR_NONE){
        curl_close($ch);
        
        $errorMsg = json_last_error_msg();
        $errorCode = json_last_error();
        echo "JSON解析失败：错误码={$errorCode}，错误信息={$errorMsg}";
        return;
    }
    curl_close($ch);
    return $result['data'];
}

//取消短信业务取号
function stopTakeSmsPhoneNumber($order_no,$access_token){
    global $config;
    
    $api_url = "https://api.yamasakisms.com/api/auth/stoptakesmsphonenumber";
    
    $post_data = [
        'usercode'      => $config['user_code'],
        'access_token'  => $access_token,
        'order_no'      => $order_no,
        'timestamp'     => time(),
        'sign'          => '',
    ];
    ksort($post_data);
    
    $param_str = [];
    foreach ($post_data as $key => $value) {
        if($value === '' || $value === null) continue;
        $param_str[] = "{$key}={$value}";
    }
    $final_str = implode('&', $param_str).$config['api_key'];
    $post_data['sign'] = md5($final_str);
    
    
    $ch = curl_init($api_url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query($post_data),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false
    ]);
    
    $response = curl_exec($ch);
    if ($response === false) {
        $error = curl_error($ch);
        echo "请求失败：{$error}";
        curl_close($ch);
        return;
    }
    
    $result = json_decode($response, true);
    
    if ($result === null && json_last_error() !== JSON_ERROR_NONE){
        curl_close($ch);
        
        $errorMsg = json_last_error_msg();
        $errorCode = json_last_error();
        echo "JSON解析失败：错误码={$errorCode}，错误信息={$errorMsg}";
        return;
    }
    curl_close($ch);
    return $result['data'];
}

//取消接码
function freedSmsPhoneNumber($order_no,$access_token){
    global $config;
    
    $api_url = "https://api.yamasakisms.com/api/auth/freedsmsphonenumber";
    
    $post_data = [
        'usercode'      => $config['user_code'],
        'access_token'  => $access_token,
        'order_no'      => $order_no,
        'timestamp'     => time(),
        'sign'          => '',
    ];
    ksort($post_data);
    
    $param_str = [];
    foreach ($post_data as $key => $value) {
        if($value === '' || $value === null) continue;
        $param_str[] = "{$key}={$value}";
    }
    $final_str = implode('&', $param_str).$config['api_key'];
    $post_data['sign'] = md5($final_str);
    
    
    $ch = curl_init($api_url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query($post_data),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false
    ]);
    
    $response = curl_exec($ch);
    if ($response === false) {
        $error = curl_error($ch);
        echo "请求失败：{$error}";
        curl_close($ch);
        return;
    }
    
    $result = json_decode($response, true);
    
    if ($result === null && json_last_error() !== JSON_ERROR_NONE){
        curl_close($ch);
        
        $errorMsg = json_last_error_msg();
        $errorCode = json_last_error();
        echo "JSON解析失败：错误码={$errorCode}，错误信息={$errorMsg}";
        return;
    }
    curl_close($ch);
    return $result['data'];
}

//加入黑名单
function addBlackSmsPhoneNumber($order_no,$access_token){
    global $config;
    
    $api_url = "https://api.yamasakisms.com/api/auth/addblacksmsphonenumber";
    
    $post_data = [
        'usercode'      => $config['user_code'],
        'access_token'  => $access_token,
        'order_no'      => $order_no,
        'timestamp'     => time(),
        'sign'          => '',
    ];
    ksort($post_data);
    
    $param_str = [];
    foreach ($post_data as $key => $value) {
        if($value === '' || $value === null) continue;
        $param_str[] = "{$key}={$value}";
    }
    $final_str = implode('&', $param_str).$config['api_key'];
    $post_data['sign'] = md5($final_str);
    
    
    $ch = curl_init($api_url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query($post_data),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false
    ]);
    
    $response = curl_exec($ch);
    if ($response === false) {
        $error = curl_error($ch);
        echo "请求失败：{$error}";
        curl_close($ch);
        return;
    }
    
    $result = json_decode($response, true);
    
    if ($result === null && json_last_error() !== JSON_ERROR_NONE){
        curl_close($ch);
        
        $errorMsg = json_last_error_msg();
        $errorCode = json_last_error();
        echo "JSON解析失败：错误码={$errorCode}，错误信息={$errorMsg}";
        return;
    }
    curl_close($ch);
    return $result['data'];
}

// 获取验证码
function getCode($order_no,$access_token){
    global $config;
    
    $api_url = "https://api.yamasakisms.com/api/auth/getphonecode";
    
    $post_data = [
        'usercode'      => $config['user_code'],
        'access_token'  => $access_token,
        'order_no'      => $order_no,
        'timestamp'     => time(),
        'sign'          => '',
    ];
    ksort($post_data);
    
    $param_str = [];
    foreach ($post_data as $key => $value) {
        if($value === '' || $value === null) continue;
        $param_str[] = "{$key}={$value}";
    }
    $final_str = implode('&', $param_str).$config['api_key'];
    $post_data['sign'] = md5($final_str);
    
    
    $ch = curl_init($api_url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query($post_data),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false
    ]);
    
    $response = curl_exec($ch);
    if ($response === false) {
        $error = curl_error($ch);
        echo "请求失败：{$error}";
        curl_close($ch);
        return;
    }
    
    $result = json_decode($response, true);
    
    if ($result === null && json_last_error() !== JSON_ERROR_NONE){
        curl_close($ch);
        
        $errorMsg = json_last_error_msg();
        $errorCode = json_last_error();
        echo "JSON解析失败：错误码={$errorCode}，错误信息={$errorMsg}";
        return;
    }
    curl_close($ch);
    return $result['data'];
}

/*
$result = auth();

$access_token = $result['access_token'];
*/
//$access_token = 'c55ebd2743fed71ed26af2b3520dd4af';

//$result = balance($access_token);
//$result = platforminfo($access_token);
//$result = takeSmsPhoneNumber(128,1,$access_token); 389684649653202944 
//$result = getCode('389684649653202944',$access_token);   
//$result = stopTakeSmsPhoneNumber('389684649653202944',$access_token);  
//$result = freedSmsPhoneNumber('389684649653202944',$access_token);  
//$result = addBlackSmsPhoneNumber('389684649653202944',$access_token);  

print_r($result);

    
