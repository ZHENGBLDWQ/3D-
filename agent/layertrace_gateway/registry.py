"""Thread-safe multi-printer connection registration skeleton."""
from dataclasses import dataclass
from threading import RLock
from typing import Protocol
from .discovery import DiscoveredPrinter
from .secrets import CredentialStore

class PrinterConnection(Protocol):
    def connect(self) -> None: ...
    def close(self) -> None: ...

@dataclass(slots=True)
class RegisteredPrinter:
    printer: DiscoveredPrinter
    connection: PrinterConnection | None = None

class PrinterConnectionRegistry:
    def __init__(self, credentials: CredentialStore):
        self.credentials, self._entries, self._lock = credentials, {}, RLock()
    def bind(self, printer, access_code):
        self.credentials.set_access_code(printer.device_id, access_code)
        with self._lock:
            entry = self._entries.get(printer.device_id)
            if entry: entry.printer = printer
            else: entry = self._entries.setdefault(printer.device_id, RegisteredPrinter(printer))
            return entry
    def register_connection(self, device_id, connection):
        with self._lock:
            entry = self._entries.get(device_id)
            if not entry: raise KeyError("printer must be bound before connection registration")
            if entry.connection is not None and entry.connection is not connection: entry.connection.close()
            entry.connection = connection
    def unbind(self, device_id):
        with self._lock:
            entry = self._entries.pop(device_id, None)
            if entry and entry.connection: entry.connection.close()
        return entry is not None or self.credentials.delete_access_code(device_id)
    def public_devices(self):
        with self._lock: return [entry.printer.public_dict() for entry in self._entries.values()]
