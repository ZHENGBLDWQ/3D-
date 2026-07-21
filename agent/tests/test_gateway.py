import unittest
from layertrace_gateway.discovery import DiscoveredPrinter, deduplicate, parse_ssdp_response
from layertrace_gateway.registry import PrinterConnectionRegistry
from layertrace_gateway.secrets import CredentialStore
from layertrace_gateway.mqtt import MultiPrinterMqttManager
from layertrace_gateway.ams import normalize_ams

class MemoryCredentials(CredentialStore):
    def __init__(self): self.values = {}
    def set_access_code(self, device_id, access_code): self.values[device_id] = access_code
    def get_access_code(self, device_id): return self.values.get(device_id)
    def delete_access_code(self, device_id): return self.values.pop(device_id, None) is not None

class FakeConnection:
    def __init__(self): self.closed = False
    def connect(self): pass
    def close(self): self.closed = True

class FakeMqtt:
    failures = 0
    def __init__(self): self.closed = False; self.published = []
    def connect(self, host, username, password):
        if FakeMqtt.failures: FakeMqtt.failures -= 1; raise OSError("offline")
    def subscribe(self, topic, callback): self.topic, self.callback = topic, callback
    def publish(self, topic, payload): self.published.append((topic, payload))
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

    def test_multi_device_connect_and_ip_change_deduplicate(self):
        credentials, now = MemoryCredentials(), [0.0]
        for key in ("bambu:A", "bambu:B"): credentials.set_access_code(key, "local-only")
        manager = MultiPrinterMqttManager(credentials, FakeMqtt, clock=lambda: now[0], jitter=0)
        first = manager.upsert("bambu:A", "A", "10.0.0.1")
        manager.upsert("bambu:B", "B", "10.0.0.2")
        self.assertIs(first, manager.upsert("bambu:A", "A", "10.0.0.9"))
        manager.connect_due(lambda *_: None)
        self.assertEqual(len(manager.sessions), 2)
        self.assertTrue(all(item.connected for item in manager.sessions.values()))

    def test_exponential_reconnect(self):
        credentials, now = MemoryCredentials(), [10.0]
        credentials.set_access_code("bambu:A", "local-only")
        manager = MultiPrinterMqttManager(credentials, FakeMqtt, base_delay=2, clock=lambda: now[0], jitter=0)
        manager.upsert("bambu:A", "A", "10.0.0.1"); FakeMqtt.failures = 1
        manager.connect_due(lambda *_: None)
        self.assertEqual(manager.sessions["bambu:A"].next_retry_at, 12)
        manager.connect_due(lambda *_: None); self.assertFalse(manager.sessions["bambu:A"].connected)
        now[0] = 12; manager.connect_due(lambda *_: None)
        self.assertTrue(manager.sessions["bambu:A"].connected)

    def test_normalizes_and_deduplicates_ams_slots(self):
        report = {"print":{"ams":{"tray_now":"1","ams":[{"id":"0","tray":[{"id":"1","tray_type":"pla","tray_color":"ff0000ff","remain":44},{"id":"1","remain":1}]}]}}}
        slots = normalize_ams(report)
        self.assertEqual(slots, [{"unit":0,"slot":1,"material":"PLA","colorHex":"#FF0000","remainingPercent":44.0,"active":True}])

if __name__ == "__main__": unittest.main()
