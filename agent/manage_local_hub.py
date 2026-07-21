"""Safe local operations and sanitized diagnostics for LayerTrace Local Hub."""
from __future__ import annotations

import argparse
from getpass import getpass
import json
import os
from pathlib import Path
import platform
import sys
import time
from urllib.parse import urlsplit

from layertrace_gateway.discovery import BambuDiscovery
from layertrace_gateway.secrets import LocalCredentialStore
from layertrace_gateway.service import default_connection_factory


def root_path(): return Path(os.environ.get("LOCALAPPDATA", Path.home())) / "LayerTrace" / "LocalHub"


def mask(identifier):
    value = str(identifier or "")
    return f"…{value[-6:]}" if len(value) > 6 else "configured"


def safe_url(value):
    try:
        parsed = urlsplit(str(value or "")); port = parsed.port
        return f"{parsed.scheme}://{parsed.hostname}{f':{port}' if port else ''}" if parsed.scheme and parsed.hostname else "invalid"
    except ValueError: return "invalid"


def read_json(path, fallback):
    try: return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError): return fallback


def diagnostic_report(root, credentials, *, task_state="unknown", now=time.time):
    config = read_json(root / "config.json", {})
    status = read_json(root / "state" / "status.json", {})
    return {"generatedAt":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime(now())),"platform":platform.platform(),"python":platform.python_version(),"serviceTask":task_state,"cloudOrigin":safe_url(config.get("url")),"gatewayTokenConfigured":credentials.has_access_code("gateway:token"),"configuredDevices":[mask(value) for value in credentials.configured_device_ids()],"runtime":status}


def scan_devices(discovery=None):
    return (discovery or BambuDiscovery(timeout=5)).scan()


def close_connection(connection):
    sock = getattr(connection, "sock", None)
    if sock:
        try: sock.close()
        except OSError: pass


def test_connection(printer, credentials, connection_factory=default_connection_factory):
    if not credentials.has_access_code(printer.device_id): return {"ok":False,"device":mask(printer.serial),"error":"credential_missing"}
    connection = None
    try:
        connection = connection_factory(printer.host, printer.serial, credentials.get_access_code(printer.device_id))
        connection.connect(); snapshot = dict(connection.poll())
        return {"ok":True,"device":mask(printer.serial),"model":printer.model or "Bambu","host":printer.host,"state":str(snapshot.get("gcode_state") or "connected").lower()}
    except (OSError, ConnectionError, ValueError) as error:
        return {"ok":False,"device":mask(printer.serial),"error":type(error).__name__}
    finally: close_connection(connection)


def main():
    parser = argparse.ArgumentParser(description="LayerTrace Local Hub operations")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("status"); commands.add_parser("scan"); commands.add_parser("diagnostics")
    for name in ("set-credential","remove-credential","test"):
        command = commands.add_parser(name); command.add_argument("--serial", required=True)
    args = parser.parse_args(); root = root_path(); credentials = LocalCredentialStore(root / "credentials.json")
    task_state = os.environ.get("LAYERTRACE_TASK_STATE", "unknown")
    if args.command == "status": result = {"serviceTask":task_state, **read_json(root / "state" / "status.json", {"state":"not_started"})}
    elif args.command == "diagnostics": result = diagnostic_report(root, credentials, task_state=task_state)
    elif args.command == "scan": result = [{"name":item.name,"model":item.model,"host":item.host,"serial":mask(item.serial),"credentialConfigured":credentials.has_access_code(item.device_id)} for item in scan_devices()]
    elif args.command == "set-credential":
        code = getpass(f"LAN Access Code for …{args.serial[-6:]}: ").strip()
        if not code: raise ValueError("Access Code cannot be empty")
        credentials.set_access_code(f"bambu:{args.serial.upper()}", code); result = {"ok":True,"device":mask(args.serial),"action":"credential_updated"}
    elif args.command == "remove-credential": result = {"ok":credentials.delete_access_code(f"bambu:{args.serial.upper()}"),"device":mask(args.serial),"action":"credential_removed"}
    else:
        printer = next((item for item in scan_devices() if item.serial.upper() == args.serial.upper()), None)
        result = test_connection(printer, credentials) if printer else {"ok":False,"device":mask(args.serial),"error":"device_not_discovered"}
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__": main()
