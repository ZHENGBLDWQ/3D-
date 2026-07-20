"""LayerTrace local printer agent. Python 3.10+, standard library only."""
import json
import os
import socket
import ssl
import struct
import ftplib
import io
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

from layertrace_gateway.discovery import BambuDiscovery

CLOUD_URL = os.environ.get("LAYERTRACE_URL", "https://layertrace-3d-print-ops.dongwanqing0.chatgpt.site").rstrip("/")
TOKEN = os.environ.get("LAYERTRACE_TOKEN", "").strip()
PRINTER_URL = os.environ.get("PRINTER_URL", "http://127.0.0.1:7125").rstrip("/")
CONNECTOR = os.environ.get("PRINTER_CONNECTOR", "moonraker").lower()
PRINTER_API_KEY = os.environ.get("PRINTER_API_KEY", "")
INTERVAL = max(5, int(os.environ.get("POLL_INTERVAL", "10")))
SPOOLMAN_URL = os.environ.get("SPOOLMAN_URL", "").rstrip("/")
SPOOLMAN_INTERVAL = max(30, int(os.environ.get("SPOOLMAN_INTERVAL", "60")))
STATE_FILE = Path(os.environ.get("LAYERTRACE_STATE_FILE", Path(__file__).with_name(".layertrace_state.json")))
BAMBU_HOST = os.environ.get("BAMBU_HOST", "")
BAMBU_SERIAL = os.environ.get("BAMBU_SERIAL", "")
BAMBU_ACCESS_CODE = os.environ.get("BAMBU_ACCESS_CODE", "")

def discover_bambu(timeout=4):
    # Compatibility adapter: existing single-printer startup now shares the
    # gateway's serial-based discovery and DHCP-safe deduplication.
    return [
        {"host": item.host, "serial": item.serial, "name": item.name, "model": item.model}
        for item in BambuDiscovery(timeout=timeout).scan()
    ]

def mqtt_length(value):
    out = bytearray()
    while True:
        digit = value % 128
        value //= 128
        if value: digit |= 128
        out.append(digit)
        if not value: return bytes(out)

def mqtt_string(value):
    raw = value.encode("utf-8")
    return struct.pack("!H", len(raw)) + raw

class BambuMqtt:
    """Minimal MQTT 3.1.1 TLS client for Bambu LAN developer mode."""
    def __init__(self, host, serial, access_code):
        if (not host or not serial) and access_code:
            devices = discover_bambu()
            selected = next((item for item in devices if not serial or item["serial"] == serial), None)
            if selected: host, serial = selected["host"], selected["serial"]
        if not host or not serial or not access_code:
            raise ValueError("未自动发现打印机；请设置 BAMBU_HOST、BAMBU_SERIAL 和 BAMBU_ACCESS_CODE")
        self.host, self.serial, self.access_code = host, serial, access_code
        self.sock = None
        self.last = {}

    def send(self, kind, payload):
        self.sock.sendall(bytes([kind]) + mqtt_length(len(payload)) + payload)

    def packet(self, timeout=1):
        self.sock.settimeout(timeout)
        first = self.sock.recv(1)
        if not first: raise ConnectionError("Bambu MQTT 连接已关闭")
        multiplier, length = 1, 0
        while True:
            digit = self.sock.recv(1)[0]
            length += (digit & 127) * multiplier
            if not digit & 128: break
            multiplier *= 128
        data = b""
        while len(data) < length: data += self.sock.recv(length - len(data))
        return first[0], data

    def connect(self):
        raw = socket.create_connection((self.host, 8883), timeout=8)
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        self.sock = context.wrap_socket(raw, server_hostname=self.host)
        variable = mqtt_string("MQTT") + bytes([4, 0xC2]) + struct.pack("!H", 30)
        payload = mqtt_string("layertrace-" + uuid.uuid4().hex[:12]) + mqtt_string("bblp") + mqtt_string(self.access_code)
        self.send(0x10, variable + payload)
        kind, response = self.packet(8)
        if kind != 0x20 or len(response) < 2 or response[1] != 0:
            raise ConnectionError("Bambu MQTT 认证失败，请检查 LAN Access Code 与 Developer Mode")
        topic = f"device/{self.serial}/report"
        self.send(0x82, struct.pack("!H", 1) + mqtt_string(topic) + b"\x00")
        self.packet(8)
        self.publish({"pushing": {"sequence_id": "0", "command": "pushall"}})

    def publish(self, value):
        topic = mqtt_string(f"device/{self.serial}/request")
        self.send(0x30, topic + json.dumps(value, separators=(",", ":")).encode())

    def poll(self):
        deadline = time.time() + 2
        while time.time() < deadline:
            try: kind, data = self.packet(max(.1, deadline - time.time()))
            except socket.timeout: break
            if kind >> 4 == 3 and len(data) > 2:
                topic_length = struct.unpack("!H", data[:2])[0]
                try: message = json.loads(data[2 + topic_length:].decode("utf-8"))
                except (ValueError, UnicodeDecodeError): continue
                if isinstance(message.get("print"), dict): self.last.update(message["print"])
        return self.last

class ImplicitFTP_TLS(ftplib.FTP_TLS):
    def connect(self, host="", port=0, timeout=-999, source_address=None):
        if host: self.host = host
        if port: self.port = port
        self.sock = socket.create_connection((self.host, self.port), self.timeout if timeout == -999 else timeout, source_address)
        self.af = self.sock.family
        self.sock = self.context.wrap_socket(self.sock, server_hostname=self.host)
        self.file = self.sock.makefile("r", encoding=self.encoding)
        self.welcome = self.getresp()
        return self.welcome

def bambu_status(client):
    p = client.poll()
    state = str(p.get("gcode_state", "online")).lower()
    mapped = {"running":"printing", "pause":"paused", "failed":"error", "finish":"online", "idle":"online"}.get(state, state)
    active_tray = str(p.get("tray_now", ""))
    slots = []
    def remaining_percent(value):
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        return round(max(0.0, min(100.0, number)), 1) if number >= 0 else None
    ams = p.get("ams") or {}
    for unit in ams.get("ams", []) or []:
        unit_id = int(unit.get("id", 0))
        for tray in unit.get("tray", []) or []:
            tray_id = int(tray.get("id", 0))
            global_id = str(unit_id * 4 + tray_id)
            slots.append({"unit":unit_id,"tray":tray_id,"material":tray.get("tray_type") or "","colorHex":str(tray.get("tray_color") or "").lstrip("#")[:8],"remainingPercent":remaining_percent(tray.get("remain")),"tagUid":tray.get("tag_uid") or "","active":active_tray in (global_id, str(tray_id))})
    virtual = ams.get("vt_tray")
    if isinstance(virtual, dict) and virtual.get("tray_type"):
        slots.append({"unit":255,"tray":0,"material":virtual.get("tray_type") or "","colorHex":str(virtual.get("tray_color") or "").lstrip("#")[:8],"remainingPercent":remaining_percent(virtual.get("remain")),"tagUid":virtual.get("tag_uid") or "","active":active_tray in ("254","255")})
    return {"state":mapped,"nozzleTemp":p.get("nozzle_temper"),"bedTemp":p.get("bed_temper"),"filename":p.get("subtask_name") or p.get("gcode_file"),"progress":p.get("mc_percent"),"ams":slots,"bambu":{"remainingMinutes":p.get("mc_remaining_time"),"layer":p.get("layer_num"),"totalLayers":p.get("total_layer_num"),"hms":p.get("hms") or [],"wifiSignal":p.get("wifi_signal")}}

def bambu_upload_and_start(client, filename, content, plate_index=0):
    ftp = ImplicitFTP_TLS(timeout=30)
    ftp.context.check_hostname = False
    ftp.context.verify_mode = ssl.CERT_NONE
    ftp.connect(BAMBU_HOST, 990)
    ftp.login("bblp", BAMBU_ACCESS_CODE)
    ftp.prot_p()
    remote = f"cache/{filename}"
    ftp.storbinary(f"STOR {remote}", io.BytesIO(content))
    ftp.quit()
    client.publish({"print":{"sequence_id":"0","command":"project_file","param":f"Metadata/plate_{plate_index + 1}.gcode","subtask_name":filename,"plate_idx":plate_index,"url":f"file:///sdcard/{remote}","timelapse":False,"bed_leveling":True,"flow_cali":False,"vibration_cali":True,"layer_inspect":False,"use_ams":True}})

def estimate_3mf_grams(content):
    total = 0.0
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            candidates = [name for name in archive.namelist() if name.lower().endswith("slice_info.config")]
            for name in candidates:
                root = ET.fromstring(archive.read(name))
                for element in root.iter():
                    for key in ("used_g", "weight", "filament_weight"):
                        try: total += max(0.0, float(element.attrib.get(key, 0)))
                        except (TypeError, ValueError): pass
    except (zipfile.BadZipFile, KeyError, ET.ParseError):
        return 0.0
    return round(total, 2)

def bambu_usage_event(payload):
    state = load_usage_state()
    job = state.get("bambuJob")
    active = next((slot for slot in payload.get("ams", []) if slot.get("active")), {})
    if payload.get("state") == "printing" and not job:
        pending = state.get("bambuPending", {})
        job = {"filename":payload.get("filename") or pending.get("filename", ""),"estimatedGrams":pending.get("estimatedGrams", 0),"startedAt":time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),"material":active.get("material", ""),"unit":active.get("unit"),"tray":active.get("tray"),"external":not bool(pending)}
        state["bambuJob"] = job
        save_usage_state(state)
        if job["external"]:
            return {**job,"phase":"started","consumedGrams":0,"result":""}
    elif job and payload.get("state") in ("online", "error"):
        progress = max(0.0, min(100.0, float(payload.get("progress") or 0)))
        consumed = float(job.get("estimatedGrams", 0)) * (1 if payload.get("state") == "online" else progress / 100)
        event = {**job,"phase":"finished","progressPercent":progress,"consumedGrams":round(consumed,2),"result":"完成" if payload.get("state") == "online" else "失败","completedAt":time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        state.pop("bambuJob", None)
        state.pop("bambuPending", None)
        save_usage_state(state)
        return event
    return None

def request_json(url, method="GET", data=None, headers=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method, headers={"Content-Type": "application/json", "User-Agent": "LayerTrace-Agent/1.0", **(headers or {})})
    with urllib.request.urlopen(req, timeout=8) as response:
        content = response.read().decode()
        return json.loads(content) if content else {}

def download_file(file_id, command_id):
    req = urllib.request.Request(f"{CLOUD_URL}/api/agent?file={file_id}&command={command_id}", headers={"Authorization": f"Bearer {TOKEN}", "User-Agent": "LayerTrace-Agent/1.0"})
    with urllib.request.urlopen(req, timeout=120) as response:
        return response.read()

def upload_file(url, filename, content, fields=None, headers=None):
    boundary = f"----LayerTrace{uuid.uuid4().hex}"
    chunks = []
    for name, value in (fields or {}).items():
        chunks.extend([f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode()])
    chunks.extend([f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\nContent-Type: application/octet-stream\r\n\r\n".encode(), content, f"\r\n--{boundary}--\r\n".encode()])
    req = urllib.request.Request(url, data=b"".join(chunks), method="POST", headers={"Content-Type": f"multipart/form-data; boundary={boundary}", **(headers or {})})
    with urllib.request.urlopen(req, timeout=180) as response:
        body = response.read().decode()
        return json.loads(body) if body else {}

def moonraker_status():
    query = "extruder&heater_bed&print_stats&virtual_sdcard"
    result = request_json(f"{PRINTER_URL}/printer/objects/query?{query}")["result"]["status"]
    stats, sd = result.get("print_stats", {}), result.get("virtual_sdcard", {})
    return {"state": stats.get("state", "online"), "nozzleTemp": result.get("extruder", {}).get("temperature"), "bedTemp": result.get("heater_bed", {}).get("temperature"), "filename": stats.get("filename"), "progress": round(float(sd.get("progress", 0)) * 100, 1), "filamentUsed": stats.get("filament_used")}

def octoprint_status():
    headers = {"X-Api-Key": PRINTER_API_KEY}
    printer = request_json(f"{PRINTER_URL}/api/printer", headers=headers)
    job = request_json(f"{PRINTER_URL}/api/job", headers=headers)
    flags = printer.get("state", {}).get("flags", {})
    state = "printing" if flags.get("printing") else "paused" if flags.get("paused") else "error" if flags.get("error") else "online"
    temps = printer.get("temperature", {})
    return {"state": state, "nozzleTemp": temps.get("tool0", {}).get("actual"), "bedTemp": temps.get("bed", {}).get("actual"), "filename": job.get("job", {}).get("file", {}).get("name"), "progress": job.get("progress", {}).get("completion")}

def spoolman_spools():
    rows = request_json(f"{SPOOLMAN_URL}/api/v1/spool")
    result = []
    for spool in rows:
        filament = spool.get("filament") or {}
        vendor = filament.get("vendor") or {}
        result.append({"id": spool["id"], "filamentName": filament.get("name"), "vendor": vendor.get("name") if isinstance(vendor, dict) else str(vendor), "material": filament.get("material"), "colorHex": filament.get("color_hex"), "initialWeight": spool.get("initial_weight"), "remainingWeight": spool.get("remaining_weight"), "usedWeight": spool.get("used_weight"), "location": spool.get("location"), "lotNr": spool.get("lot_nr"), "archived": spool.get("archived", False), "lastUsed": spool.get("last_used")})
    return result

def load_usage_state():
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}

def save_usage_state(state):
    temporary = STATE_FILE.with_suffix(".tmp")
    temporary.write_text(json.dumps(state), encoding="utf-8")
    temporary.replace(STATE_FILE)

def track_spool_usage(payload, spool_id):
    if not SPOOLMAN_URL or CONNECTOR != "moonraker" or not spool_id or payload.get("filamentUsed") is None:
        return
    current = max(0.0, float(payload["filamentUsed"]))
    filename = payload.get("filename") or ""
    state = load_usage_state()
    same_session = state.get("spoolId") == spool_id and state.get("filename") == filename and current >= float(state.get("filamentUsed", 0))
    delta = current - float(state.get("filamentUsed", 0)) if same_session else 0
    if delta > 0.01:
        request_json(f"{SPOOLMAN_URL}/api/v1/spool/{spool_id}/use", "PUT", {"use_length": round(delta, 3)})
    save_usage_state({"spoolId": spool_id, "filename": filename, "filamentUsed": current, "updatedAt": time.time()})

def report(payload):
    return request_json(f"{CLOUD_URL}/api/agent", "POST", payload, {"Authorization": f"Bearer {TOKEN}"})

def execute_command(command, bambu=None):
    name = command["name"]
    if name == "start":
        payload = command.get("payload", {})
        filename = os.path.basename(payload["filename"])
        content = download_file(payload["fileId"], command["id"])
        if CONNECTOR == "bambu_lan":
            state = load_usage_state()
            state["bambuPending"] = {"filename":filename,"estimatedGrams":estimate_3mf_grams(content)}
            save_usage_state(state)
            bambu_upload_and_start(bambu, filename, content, int(payload.get("plateIndex", 0)))
        elif CONNECTOR == "moonraker":
            upload_file(f"{PRINTER_URL}/server/files/upload", filename, content)
            request_json(f"{PRINTER_URL}/printer/print/start?filename={urllib.parse.quote(filename)}", "POST")
        else:
            upload_file(f"{PRINTER_URL}/api/files/local", filename, content, {"select": "true", "print": "true"}, {"X-Api-Key": PRINTER_API_KEY})
        return
    if CONNECTOR == "bambu_lan":
        bambu.publish({"print":{"sequence_id":"0","command":"stop" if name == "cancel" else name}})
    elif CONNECTOR == "moonraker":
        request_json(f"{PRINTER_URL}/printer/print/{name}", "POST")
    else:
        headers = {"X-Api-Key": PRINTER_API_KEY}
        payload = {"command": "cancel"} if name == "cancel" else {"command": "pause", "action": name}
        request_json(f"{PRINTER_URL}/api/job", "POST", payload, headers)

def main():
    print(f"LayerTrace agent started: {CONNECTOR} @ {PRINTER_URL}")
    missing = []
    if not TOKEN:
        missing.append("LAYERTRACE_TOKEN")
    if CONNECTOR == "bambu_lan" and not BAMBU_ACCESS_CODE:
        missing.append("BAMBU_ACCESS_CODE")
    if missing:
        print("等待配置：请在 local-hub/.env 中填写 " + "、".join(missing))
        while True:
            time.sleep(3600)
    bambu = None
    if CONNECTOR == "bambu_lan":
        bambu = BambuMqtt(BAMBU_HOST, BAMBU_SERIAL, BAMBU_ACCESS_CODE)
        bambu.connect()
        print(f"Bambu LAN connected: {BAMBU_HOST} / {BAMBU_SERIAL}")
    last_spool_sync = 0
    while True:
        try:
            payload = moonraker_status() if CONNECTOR == "moonraker" else bambu_status(bambu) if CONNECTOR == "bambu_lan" else octoprint_status()
            if CONNECTOR == "bambu_lan":
                usage = bambu_usage_event(payload)
                if usage: payload["usage"] = usage
            if SPOOLMAN_URL and time.time() - last_spool_sync >= SPOOLMAN_INTERVAL:
                try:
                    payload["spools"] = spoolman_spools()
                    last_spool_sync = time.time()
                except (urllib.error.URLError, KeyError, ValueError, TimeoutError) as spool_error:
                    print(time.strftime("%F %T"), "Spoolman sync failed:", spool_error)
            result = report(payload)
            try:
                track_spool_usage(payload, result.get("printer", {}).get("activeSpoolId"))
            except (urllib.error.URLError, KeyError, ValueError, TimeoutError, OSError) as usage_error:
                print(time.strftime("%F %T"), "Spoolman usage update failed:", usage_error)
            print(time.strftime("%F %T"), result.get("printer", {}).get("name"), payload["state"], payload.get("progress"))
            command = result.get("command")
            if command:
                try:
                    execute_command(command, bambu)
                    report({**payload, "ack": {"id": command["id"], "ok": True, "result": "本地代理执行成功"}})
                    print(time.strftime("%F %T"), "command completed:", command["name"])
                except (urllib.error.URLError, ValueError, TimeoutError) as command_error:
                    report({**payload, "ack": {"id": command["id"], "ok": False, "result": str(command_error)}})
                    print(time.strftime("%F %T"), "command failed:", command_error)
        except (urllib.error.URLError, KeyError, ValueError, TimeoutError, OSError, ConnectionError) as error:
            print(time.strftime("%F %T"), "sync failed:", error)
            if CONNECTOR == "bambu_lan":
                try:
                    bambu = BambuMqtt(BAMBU_HOST, BAMBU_SERIAL, BAMBU_ACCESS_CODE)
                    bambu.connect()
                except (OSError, ConnectionError, ValueError) as reconnect_error:
                    print(time.strftime("%F %T"), "Bambu reconnect failed:", reconnect_error)
        time.sleep(INTERVAL)

if __name__ == "__main__":
    main()
