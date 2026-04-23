import urllib.request
import json
import pymysql

db = pymysql.connect(host="52.8.149.180", user="znxp", password="ZRiACK48n2h7WJtJ", database="znxp")
cur = db.cursor()
cur.execute("SELECT access_token FROM google_oauth_tokens LIMIT 1")
token = cur.fetchone()[0]
print("token prefix:", token[:30])

# 检查 token 的实际 scope
info_req = urllib.request.Request(f"https://oauth2.googleapis.com/tokeninfo?access_token={token}")
try:
    info_r = urllib.request.urlopen(info_req)
    info = json.loads(info_r.read().decode())
    print("token scope:", info.get("scope", "NO SCOPE"))
    print("token email:", info.get("email", ""))
except Exception as e:
    print("tokeninfo error:", e)

# 先列出可访问的客户账号
list_req = urllib.request.Request(
    "https://googleads.googleapis.com/v19/customers:listAccessibleCustomers",
    headers={"Authorization": "Bearer " + token, "developer-token": "ZhtA8OONYyUntoDCFzY4EA"},
)
try:
    list_r = urllib.request.urlopen(list_req)
    print("Accessible customers:", list_r.read().decode()[:500])
except urllib.error.HTTPError as e:
    print("listAccessibleCustomers ERROR", e.code, e.read().decode()[:500])

url = "https://googleads.googleapis.com/v19/customers/6454868629/googleAds:search"
body = json.dumps({"query": "SELECT campaign.name FROM campaign LIMIT 1"}).encode()
headers = {
    "Authorization": "Bearer " + token,
    "developer-token": "ZhtA8OONYyUntoDCFzY4EA",
    "Content-Type": "application/json",
}
req = urllib.request.Request(url, data=body, headers=headers, method="POST")
try:
    r = urllib.request.urlopen(req)
    print("SUCCESS:", r.read().decode()[:500])
except urllib.error.HTTPError as e:
    print("HTTP ERROR", e.code, e.read().decode()[:800])
except Exception as e:
    print("ERROR:", e)
