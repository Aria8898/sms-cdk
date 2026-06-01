# -*- coding: utf-8 -*-
import time
import hashlib
import urllib
import urllib2
import json
import ssl

# Configuration
CONFIG = {
    'user_id': 5913,
    'user_code': 567449,
    'api_key': '30f698e2bde90841a5d7f98b5f2194ae'
}

def generate_sign(params):
    """
    Generate signature for the request.
    """
    # Filter out empty or None values and sort by key
    keys = sorted(params.keys())
    
    param_list = []
    for key in keys:
        value = params[key]
        if value is not None and value != '':
            param_list.append("%s=%s" % (key, value))
    
    # Join with & and append api_key
    final_str = '&'.join(param_list) + CONFIG['api_key']
    
    # Calculate MD5
    return hashlib.md5(final_str.encode('utf-8')).hexdigest()

def make_request(url, data):
    """
    Helper function to make POST request using urllib2.
    """
    # Add timestamp
    data['timestamp'] = int(time.time())
    
    # Generate signature
    data['sign'] = generate_sign(data)
    
    # Encode data
    encoded_data = urllib.urlencode(data)
    
    try:
        # Create a context that doesn't verify SSL certificates (if supported)
        if hasattr(ssl, '_create_unverified_context'):
            context = ssl._create_unverified_context()
            response = urllib2.urlopen(url, encoded_data, context=context, timeout=30)
        else:
            # For older Python versions, verification might not be default or enforced strictly
            response = urllib2.urlopen(url, encoded_data, timeout=30)
            
        result_str = response.read()
        result = json.loads(result_str)
        return result.get('data')
    except urllib2.HTTPError as e:
        print "HTTP Error: %s" % e.code
        print e.read()
    except urllib2.URLError as e:
        print "URL Error: %s" % e.reason
    except ValueError:
        print "JSON decode failed"
        print result_str
    except Exception as e:
        print "Request failed: %s" % e
    return None

def auth():
    """
    API授权登录
    """
    api_url = "https://api.yamasakisms.com/api/auth/login"
    data = {
        'id': CONFIG['user_id'],
        'usercode': CONFIG['user_code']
    }
    return make_request(api_url, data)

def balance(access_token):
    """
    获取账户余额
    """
    api_url = "https://api.yamasakisms.com/api/auth/balance"
    data = {
        'usercode': CONFIG['user_code'],
        'access_token': access_token
    }
    return make_request(api_url, data)

def platform_info(access_token):
    """
    获取平台项目价格
    """
    api_url = "https://api.yamasakisms.com/api/auth/platforminfo"
    data = {
        'usercode': CONFIG['user_code'],
        'access_token': access_token,
        'platform_type': 'sms'
    }
    return make_request(api_url, data)

def take_sms_phone_number(platform_id, take_count, access_token):
    """
    短信业务取号
    """
    api_url = "https://api.yamasakisms.com/api/auth/takesmsphonenumber"
    data = {
        'usercode': CONFIG['user_code'],
        'access_token': access_token,
        'platform_id': platform_id,
        'take_count': take_count
    }
    return make_request(api_url, data)

def stop_take_sms_phone_number(order_no, access_token):
    """
    取消短信业务取号
    """
    api_url = "https://api.yamasakisms.com/api/auth/stoptakesmsphonenumber"
    data = {
        'usercode': CONFIG['user_code'],
        'access_token': access_token,
        'order_no': order_no
    }
    return make_request(api_url, data)

def freed_sms_phone_number(order_no, access_token):
    """
    取消接码
    """
    api_url = "https://api.yamasakisms.com/api/auth/freedsmsphonenumber"
    data = {
        'usercode': CONFIG['user_code'],
        'access_token': access_token,
        'order_no': order_no
    }
    return make_request(api_url, data)

def add_black_sms_phone_number(order_no, access_token):
    """
    加入黑名单
    """
    api_url = "https://api.yamasakisms.com/api/auth/addblacksmsphonenumber"
    data = {
        'usercode': CONFIG['user_code'],
        'access_token': access_token,
        'order_no': order_no
    }
    return make_request(api_url, data)

def get_code(order_no, access_token):
    """
    获取验证码
    """
    api_url = "https://api.yamasakisms.com/api/auth/getphonecode"
    data = {
        'usercode': CONFIG['user_code'],
        'access_token': access_token,
        'order_no': order_no
    }
    return make_request(api_url, data)

if __name__ == "__main__":
    # Example usage
    print "Authenticating..."
    auth_result = auth()
    if auth_result:
        print "Auth Result:", auth_result
        access_token = auth_result.get('access_token')
        
        if access_token:
            print "\nGetting Balance..."
            print balance(access_token)
            
            # print "\nGetting Platform Info..."
            # print platform_info(access_token)
            
            # print "\nTaking Phone Number..."
            # # platform_id needs to be valid
            # # result = take_sms_phone_number(128, 1, access_token)
            # # print result
            
            # Example order_no
            # order_no = '389684649653202944'
            
            # print "\nGetting Code..."
            # print get_code(order_no, access_token)
            
            # print "\nStopping Take Phone Number..."
            # print stop_take_sms_phone_number(order_no, access_token)
            
            # print "\nFreeing Phone Number..."
            # print freed_sms_phone_number(order_no, access_token)
            
            # print "\nAdding to Blacklist..."
            # print add_black_sms_phone_number(order_no, access_token)
