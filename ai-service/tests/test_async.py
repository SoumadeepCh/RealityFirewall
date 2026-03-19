import requests
import time
import os

with open("test_large_vid.mp4", "wb") as f:
    f.write(os.urandom(6 * 1024 * 1024)) # 6MB dummy file

with open("test_large_vid.mp4", "rb") as f:
    res = requests.post("http://localhost:8000/analyze", files={"file": f})

print("Status code:", res.status_code)
data = res.json()
print("Response:", data)

if res.status_code == 202:
    task_id = data["task_id"]
    while True:
        status_res = requests.get(f"http://localhost:8000/task/{task_id}")
        sdata = status_res.json()
        print(sdata["status"])
        if sdata["status"] in ["SUCCESS", "FAILURE"]:
            print(sdata)
            break
        time.sleep(2)
