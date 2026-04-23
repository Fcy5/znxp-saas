import urllib.request
import json
import pymysql

db = pymysql.connect(host="52.8.149.180", user="znxp", password="ZRiACK48n2h7WJtJ", database="znxp")
cur = db.cursor()
cur.execute("SELECT access_token FROM google_oauth_tokens LIMIT 1")
token = cur.fetchone()[0]
print("token prefix:", token[:30])

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
