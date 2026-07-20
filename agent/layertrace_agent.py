"""LayerTrace local printer agent. Python 3.10+, standard library only."""
import json
import os
import time
import urllib.error
import urllib.request

CLOUD_URL = os.environ.get("LAYERTRACE_URL", "https://layertrace-3d-print-ops.dongwanqing0.chatgpt.site").rstrip("/")
TOKEN = os.environ["LAYERTRACE_TOKEN"]
PRINTER_URL = os.environ.get("PRINTER_URL", "http://127.0.0.1:7125").rstrip("/")
CONNECTOR = os.environ.get("PRINTER_CONNECTOR", "moonraker").lower()
PRINTER_API_KEY = os.environ.get("PRINTER_API_KEY", "")
INTERVAL = max(5, int(os.environ.get("POLL_INTERVAL", "10")))

def request_json(url, method="GET", data=None, headers=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method, headers={"Content-Type": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=8) as response:
        return json.loads(response.read().decode())

def moonraker_status():
    query = "extruder&heater_bed&print_stats&virtual_sdcard"
    result = request_json(f"{PRINTER_URL}/printer/objects/query?{query}")["result"]["status"]
    stats, sd = result.get("print_stats", {}), result.get("virtual_sdcard", {})
    return {"state": stats.get("state", "online"), "nozzleTemp": result.get("extruder", {}).get("temperature"), "bedTemp": result.get("heater_bed", {}).get("temperature"), "filename": stats.get("filename"), "progress": round(float(sd.get("progress", 0)) * 100, 1)}

def octoprint_status():
    headers = {"X-Api-Key": PRINTER_API_KEY}
    printer = request_json(f"{PRINTER_URL}/api/printer", headers=headers)
    job = request_json(f"{PRINTER_URL}/api/job", headers=headers)
    flags = printer.get("state", {}).get("flags", {})
    state = "printing" if flags.get("printing") else "paused" if flags.get("paused") else "error" if flags.get("error") else "online"
    temps = printer.get("temperature", {})
    return {"state": state, "nozzleTemp": temps.get("tool0", {}).get("actual"), "bedTemp": temps.get("bed", {}).get("actual"), "filename": job.get("job", {}).get("file", {}).get("name"), "progress": job.get("progress", {}).get("completion")}

def report(payload):
    return request_json(f"{CLOUD_URL}/api/agent", "POST", payload, {"Authorization": f"Bearer {TOKEN}"})

def main():
    print(f"LayerTrace agent started: {CONNECTOR} @ {PRINTER_URL}")
    while True:
        try:
            payload = moonraker_status() if CONNECTOR == "moonraker" else octoprint_status()
            result = report(payload)
            print(time.strftime("%F %T"), result.get("printer", {}).get("name"), payload["state"], payload.get("progress"))
        except (urllib.error.URLError, KeyError, ValueError, TimeoutError) as error:
            print(time.strftime("%F %T"), "sync failed:", error)
        time.sleep(INTERVAL)

if __name__ == "__main__":
    main()
