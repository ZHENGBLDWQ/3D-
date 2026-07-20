"""Bambu LAN discovery with stable identity and safe serialization."""
from __future__ import annotations
from dataclasses import dataclass, replace
import socket
import time
from typing import Iterable

SSDP_ADDRESS = ("239.255.255.250", 1900)
SSDP_TARGET = "urn:bambulab-com:device:3dprinter:1"

@dataclass(frozen=True, slots=True)
class DiscoveredPrinter:
    device_id: str
    serial: str
    host: str
    name: str
    model: str
    source: str = "bambu_ssdp"
    last_seen_at: float = 0.0

    def public_dict(self) -> dict[str, object]:
        return {"deviceId": self.device_id, "serial": self.serial, "host": self.host, "name": self.name, "model": self.model, "source": self.source, "lastSeenAt": self.last_seen_at}

def _headers(payload: bytes) -> dict[str, str]:
    result = {}
    for line in payload.decode("utf-8", "replace").splitlines()[1:]:
        if ":" in line:
            key, value = line.split(":", 1)
            result[key.strip().lower()] = value.strip()
    return result

def parse_ssdp_response(payload: bytes, host: str, seen_at: float | None = None) -> DiscoveredPrinter | None:
    headers = _headers(payload)
    serial = headers.get("usn", "").split("::", 1)[0].removeprefix("uuid:").strip() or headers.get("devserial.bambu.com", "").strip()
    if not serial:
        return None
    return DiscoveredPrinter(f"bambu:{serial.upper()}", serial, host, headers.get("devname.bambu.com", "Bambu Lab").strip() or "Bambu Lab", headers.get("devmodel.bambu.com", "").strip(), last_seen_at=seen_at if seen_at is not None else time.time())

def deduplicate(printers: Iterable[DiscoveredPrinter]) -> list[DiscoveredPrinter]:
    unique: dict[str, DiscoveredPrinter] = {}
    for incoming in printers:
        current = unique.get(incoming.device_id)
        if current is None:
            unique[incoming.device_id] = incoming
            continue
        newest, older = (incoming, current) if incoming.last_seen_at >= current.last_seen_at else (current, incoming)
        unique[incoming.device_id] = replace(newest, name=newest.name if newest.name != "Bambu Lab" else older.name, model=newest.model or older.model)
    return sorted(unique.values(), key=lambda item: (item.name.casefold(), item.device_id))

class BambuDiscovery:
    def __init__(self, timeout: float = 4.0, socket_timeout: float = 0.25):
        self.timeout, self.socket_timeout = max(0.1, timeout), max(0.05, socket_timeout)

    @staticmethod
    def request() -> bytes:
        return "\r\n".join(["M-SEARCH * HTTP/1.1", f"HOST: {SSDP_ADDRESS[0]}:{SSDP_ADDRESS[1]}", 'MAN: "ssdp:discover"', "MX: 2", f"ST: {SSDP_TARGET}", "", ""]).encode("ascii")

    def scan(self) -> list[DiscoveredPrinter]:
        found = []
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        try:
            sock.settimeout(self.socket_timeout)
            sock.sendto(self.request(), SSDP_ADDRESS)
            deadline = time.monotonic() + self.timeout
            while time.monotonic() < deadline:
                try: payload, address = sock.recvfrom(8192)
                except socket.timeout: continue
                printer = parse_ssdp_response(payload, address[0])
                if printer: found.append(printer)
        finally:
            sock.close()
        return deduplicate(found)
