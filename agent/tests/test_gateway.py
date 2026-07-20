import unittest
from layertrace_gateway.discovery import DiscoveredPrinter, deduplicate, parse_ssdp_response
from layertrace_gateway.registry import PrinterConnectionRegistry
from layertrace_gateway.secrets import CredentialStore

class MemoryCredentials(CredentialStore):
    def __init__(self): self.values = {}
    def set_access_code(self, device_id, access_code): self.values[device_id] = access_code
    def get_access_code(self, device_id): return self.values.get(device_id)
    def delete_access_code(self, device_id): return self.values.pop(device_id, None) is not None

class FakeConnection:
    def __init__(self): self.closed = False
    def connect(self): pass
    def close(self): self.closed = True

class GatewayTests(unittest.TestCase):
    def test_parses_response_without_credentials(self):
        raw = b"HTTP/1.1 200 OK\r\nUSN: uuid:01S00A123::urn:x\r\nDevName.bambu.com: Farm A1\r\nDevModel.bambu.com: A1\r\n\r\n"
        printer = parse_ssdp_response(raw, "192.168.1.20", 10)
        self.assertEqual(printer.device_id, "bambu:01S00A123")
        self.assertEqual(printer.public_dict()["model"], "A1")
        self.assertNotIn("accessCode", printer.public_dict())

    def test_deduplicates_serial_across_ip_changes(self):
        old = DiscoveredPrinter("bambu:SERIAL", "SERIAL", "192.168.1.10", "Printer", "A1", last_seen_at=1)
        new = DiscoveredPrinter("bambu:SERIAL", "SERIAL", "192.168.1.25", "Printer", "A1", last_seen_at=2)
        result = deduplicate([old, new])
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].host, "192.168.1.25")

    def test_registry_never_exposes_access_code(self):
        credentials = MemoryCredentials(); registry = PrinterConnectionRegistry(credentials)
        printer = DiscoveredPrinter("bambu:SERIAL", "SERIAL", "10.0.0.2", "X2D", "X2D")
        registry.bind(printer, "top-secret")
        self.assertNotIn("top-secret", repr(registry.public_devices()))
        self.assertEqual(credentials.get_access_code(printer.device_id), "top-secret")

    def test_replacing_connection_closes_old_connection(self):
        registry = PrinterConnectionRegistry(MemoryCredentials())
        printer = DiscoveredPrinter("bambu:SERIAL", "SERIAL", "10.0.0.2", "P2S", "P2S")
        registry.bind(printer, "secret")
        first, second = FakeConnection(), FakeConnection()
        registry.register_connection(printer.device_id, first)
        registry.register_connection(printer.device_id, second)
        self.assertTrue(first.closed); self.assertFalse(second.closed)

if __name__ == "__main__": unittest.main()
