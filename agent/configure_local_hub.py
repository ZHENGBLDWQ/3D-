"""Interactive first-run configuration; all secrets are persisted with Windows DPAPI."""
import json
import os
from pathlib import Path
from getpass import getpass

from layertrace_gateway.discovery import BambuDiscovery
from layertrace_gateway.secrets import LocalCredentialStore


def main():
    root = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "LayerTrace" / "LocalHub"
    store = LocalCredentialStore(root / "credentials.json")
    url = os.environ.get("LAYERTRACE_URL", "http://127.0.0.1:3000").rstrip("/")
    token = os.environ.get("LAYERTRACE_GATEWAY_TOKEN", "").strip() or getpass("Gateway token: ").strip()
    if not token.startswith("ltgw_"): raise ValueError("Invalid gateway token")
    store.set_access_code("gateway:token", token)
    root.mkdir(parents=True, exist_ok=True)
    (root / "config.json").write_text(json.dumps({"url":url}, ensure_ascii=False), encoding="utf-8")
    devices = BambuDiscovery(timeout=5).scan()
    print(f"Discovered {len(devices)} Bambu printer(s).")
    for index, printer in enumerate(devices, 1): print(f"[{index}] {printer.name} / {printer.model or 'Bambu'} / {printer.host} / ...{printer.serial[-6:]}")
    selection = input("Printer numbers to monitor (comma separated, blank to configure later): ").strip()
    for raw in selection.split(",") if selection else []:
        printer = devices[int(raw.strip()) - 1]
        code = getpass(f"LAN Access Code for {printer.name}: ").strip()
        if code: store.set_access_code(printer.device_id, code)
    print("Local Hub configuration saved. Secrets are encrypted for the current Windows user.")


if __name__ == "__main__": main()
