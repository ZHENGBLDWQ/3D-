"""Local credential storage; secret values have no public serializer."""
from __future__ import annotations
from abc import ABC, abstractmethod
import base64, ctypes, json, os, sys
from ctypes import wintypes
from pathlib import Path

class CredentialStore(ABC):
    @abstractmethod
    def set_access_code(self, device_id: str, access_code: str) -> None: ...
    @abstractmethod
    def get_access_code(self, device_id: str) -> str | None: ...
    @abstractmethod
    def delete_access_code(self, device_id: str) -> bool: ...

class _Blob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]

def _blob(value: bytes):
    buffer = ctypes.create_string_buffer(value)
    return _Blob(len(value), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte))), buffer

def _transform(value: bytes, protect: bool) -> bytes:
    if sys.platform != "win32": raise RuntimeError("Secure credential persistence requires Windows DPAPI")
    source, keepalive = _blob(value); output = _Blob()
    function = ctypes.windll.crypt32.CryptProtectData if protect else ctypes.windll.crypt32.CryptUnprotectData
    description = "LayerTrace Bambu credential" if protect else None
    if not function(ctypes.byref(source), description, None, None, None, 0, ctypes.byref(output)): raise ctypes.WinError()
    try: return ctypes.string_at(output.pbData, output.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(output.pbData)
        del keepalive

class LocalCredentialStore(CredentialStore):
    """Per-user encrypted Windows DPAPI store."""
    def __init__(self, path: Path): self.path = path
    def _read(self):
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
            return value if isinstance(value, dict) else {}
        except (OSError, ValueError): return {}
    def _write(self, values):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(self.path.suffix + ".tmp")
        temporary.write_text(json.dumps(values, separators=(",", ":")), encoding="utf-8")
        os.replace(temporary, self.path)
    def set_access_code(self, device_id, access_code):
        if not device_id or not access_code.strip(): raise ValueError("device_id and access_code are required")
        values = self._read(); values[device_id] = base64.b64encode(_transform(access_code.encode(), True)).decode("ascii"); self._write(values)
    def get_access_code(self, device_id):
        encoded = self._read().get(device_id)
        return _transform(base64.b64decode(encoded), False).decode() if encoded else None
    def delete_access_code(self, device_id):
        values = self._read(); existed = values.pop(device_id, None) is not None
        if existed: self._write(values)
        return existed

    def has_access_code(self, device_id):
        """Checks presence without decrypting or exposing the secret."""
        return device_id in self._read()

    def configured_device_ids(self):
        """Returns identifiers only; encrypted values never leave the store."""
        return sorted(key for key in self._read() if key.startswith("bambu:"))
