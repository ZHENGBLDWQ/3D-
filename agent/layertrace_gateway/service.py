"""Long-running, monitor-only Local Hub service for multiple Bambu printers."""
from __future__ import annotations

import json
import os
from pathlib import Path
import threading
import time
import urllib.request

from .discovery import BambuDiscovery
from .monitor import BambuMonitorAdapter, DurableEventOutbox


class GatewayCloudClient:
    def __init__(self, base_url: str, token: str, timeout=10):
        self.base_url, self.token, self.timeout = base_url.rstrip("/"), token, timeout

    def request(self, method="GET", payload=None):
        body = json.dumps(payload).encode() if payload is not None else None
        request = urllib.request.Request(
            f"{self.base_url}/api/gateway-agent", data=body, method=method,
            headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json", "User-Agent": "LayerTrace-Local-Hub/2.0"},
        )
        with urllib.request.urlopen(request, timeout=self.timeout) as response:
            content = response.read().decode("utf-8")
            return json.loads(content) if content else {}

    def bindings(self): return self.request().get("bindings", [])
    def post(self, kind, **values): return self.request("POST", {"type": kind, **values})


class PrinterMonitorWorker:
    def __init__(self, binding, access_code, event_sink, state_dir, connection_factory, *, interval=5, clock=time.time):
        self.binding, self.access_code, self.event_sink = binding, access_code, event_sink
        self.connection_factory, self.interval, self.clock = connection_factory, interval, clock
        self.stop_event, self.thread, self.connected = threading.Event(), None, False
        key = str(binding["bindingId"])
        self.adapter = BambuMonitorAdapter(binding["bindingId"], binding["serial"], event_sink, state_path=Path(state_dir) / f"monitor-{key}.json")

    def start(self):
        if self.thread and self.thread.is_alive(): return
        self.thread = threading.Thread(target=self.run, name=f"bambu-{self.binding['serial'][-6:]}", daemon=True)
        self.thread.start()

    def run(self):
        delay = 1
        while not self.stop_event.is_set():
            connection = None
            try:
                connection = self.connection_factory(self.binding["host"], self.binding["serial"], self.access_code)
                connection.connect(); self.connected, delay = True, 1
                while not self.stop_event.wait(self.interval): self.adapter.observe({"print": dict(connection.poll())})
            except (OSError, ConnectionError, ValueError):
                self.connected = False
                self.stop_event.wait(delay); delay = min(60, delay * 2)
            finally:
                sock = getattr(connection, "sock", None)
                if sock:
                    try: sock.close()
                    except OSError: pass

    def stop(self):
        self.stop_event.set()
        if self.thread: self.thread.join(timeout=3)


class LocalHubService:
    version = "2.0"
    def __init__(self, cloud, credentials, state_dir, connection_factory, *, discovery=None, worker_factory=PrinterMonitorWorker, clock=time.time):
        self.cloud, self.credentials, self.state_dir = cloud, credentials, Path(state_dir)
        self.connection_factory, self.discovery, self.worker_factory, self.clock = connection_factory, discovery or BambuDiscovery(), worker_factory, clock
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.outbox = DurableEventOutbox(self.state_dir / "events.json")
        self.status_path = self.state_dir / "status.json"
        self.workers, self.devices = {}, {}

    def cycle(self):
        discovered = self.discovery.scan()
        for printer in discovered: self.devices[printer.device_id] = printer
        public_devices = []
        for printer in self.devices.values():
            item = printer.public_dict()
            item["lastSeenAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(float(item["lastSeenAt"] or self.clock())))
            public_devices.append(item)
        self.cloud.post("discovery", devices=public_devices)
        bindings = self.cloud.bindings()
        active = set()
        for binding in bindings:
            device_id, host = str(binding.get("deviceId") or ""), str(binding.get("host") or "")
            if not device_id or not host or not self.credentials.has_access_code(device_id): continue
            active.add(int(binding["bindingId"]))
            worker = self.workers.get(int(binding["bindingId"]))
            if worker and (worker.binding["host"] != host or worker.binding["serial"] != binding["serial"]): worker.stop(); worker = None
            if not worker:
                worker = self.worker_factory(binding, self.credentials.get_access_code(device_id), self.outbox.append, self.state_dir, self.connection_factory)
                self.workers[int(binding["bindingId"])] = worker
            worker.start()
        for binding_id in set(self.workers) - active: self.workers.pop(binding_id).stop()
        events = self.outbox.load()
        if events:
            result = self.cloud.post("events", events=events)
            self.outbox.acknowledge(set(result.get("acceptedEventIds") or []))
        pending = sum(1 for binding in bindings if not self.credentials.has_access_code(str(binding.get("deviceId") or "")))
        self.cloud.post("heartbeat", heartbeat={"status":"online" if not pending else "degraded","version":self.version,"diagnostics":{"mode":"monitor_only","discoveredDevices":len(self.devices),"configuredDevices":len(active),"connectedDevices":sum(worker.connected for worker in self.workers.values()),"pendingCredentials":pending}})
        status = {"version":self.version,"mode":"monitor_only","lastCycleAt":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime(self.clock())),"discovered":len(self.devices),"configured":len(active),"connected":sum(worker.connected for worker in self.workers.values()),"pendingCredentials":pending,"queuedEvents":len(self.outbox.load()),"lastErrorType":None}
        self._write_status(status)
        return {key:status[key] for key in ("discovered","configured","connected","pendingCredentials")}

    def _write_status(self, status):
        temporary = self.status_path.with_suffix(".tmp")
        temporary.write_text(json.dumps(status, ensure_ascii=False), encoding="utf-8")
        os.replace(temporary, self.status_path)

    def close(self):
        for worker in self.workers.values(): worker.stop()
        self.workers.clear()


def default_connection_factory(host, serial, access_code):
    from layertrace_agent import BambuMqtt
    return BambuMqtt(host, serial, access_code)


def run():
    root = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "LayerTrace" / "LocalHub"
    from .secrets import LocalCredentialStore
    credentials = LocalCredentialStore(root / "credentials.json")
    token = credentials.get_access_code("gateway:token")
    config_path = root / "config.json"
    if not token or not config_path.exists(): raise RuntimeError("Local Hub is not configured. Run configure_local_hub.py first.")
    config = json.loads(config_path.read_text(encoding="utf-8"))
    service = LocalHubService(GatewayCloudClient(config["url"], token), credentials, root / "state", default_connection_factory)
    try:
        while True:
            try:
                status = service.cycle(); print(time.strftime("%F %T"), json.dumps(status, ensure_ascii=False), flush=True)
            except (OSError, ValueError, json.JSONDecodeError) as error:
                service._write_status({"version":service.version,"mode":"monitor_only","lastCycleAt":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"lastErrorType":type(error).__name__,"queuedEvents":len(service.outbox.load())})
                print(time.strftime("%F %T"), f"sync failed: {type(error).__name__}", flush=True)
            time.sleep(15)
    finally: service.close()
