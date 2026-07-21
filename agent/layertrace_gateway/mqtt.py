"""Reliable multi-printer MQTT session orchestration.

The transport is injected so production can use paho-mqtt while tests stay
deterministic. Credentials are fetched only at connect time and are never
stored on a session or included in events.
"""
from __future__ import annotations
from dataclasses import dataclass
import random
import time
from typing import Callable, Protocol
from .secrets import CredentialStore

class MqttTransport(Protocol):
    def connect(self, host: str, username: str, password: str) -> None: ...
    def subscribe(self, topic: str, callback: Callable[[dict], None]) -> None: ...
    def close(self) -> None: ...

@dataclass(slots=True)
class SessionState:
    device_id: str
    serial: str
    host: str
    connected: bool = False
    attempts: int = 0
    next_retry_at: float = 0
    transport: MqttTransport | None = None

class MultiPrinterMqttManager:
    def __init__(self, credentials: CredentialStore, transport_factory: Callable[[], MqttTransport], *, base_delay=1.0, max_delay=60.0, jitter=0.2, clock=time.monotonic, rng=random.random):
        self.credentials, self.transport_factory = credentials, transport_factory
        self.base_delay, self.max_delay, self.jitter = base_delay, max_delay, jitter
        self.clock, self.rng, self.sessions = clock, rng, {}

    def upsert(self, device_id: str, serial: str, host: str) -> SessionState:
        session = self.sessions.get(device_id)
        if session:
            if session.host != host:
                session.host = host
                if session.transport: session.transport.close()
                session.transport, session.connected, session.next_retry_at = None, False, 0
            return session
        session = SessionState(device_id, serial, host)
        self.sessions[device_id] = session
        return session

    def connect_due(self, on_message: Callable[[str, dict], None]) -> None:
        now = self.clock()
        for session in list(self.sessions.values()):
            if session.connected or session.next_retry_at > now: continue
            secret = self.credentials.get_access_code(session.device_id)
            if not secret: continue
            transport = self.transport_factory()
            try:
                transport.connect(session.host, "bblp", secret)
                transport.subscribe(f"device/{session.serial}/report", lambda message, device_id=session.device_id: on_message(device_id, message))
                session.transport, session.connected, session.attempts = transport, True, 0
            except Exception:
                transport.close()
                self.mark_disconnected(session.device_id)

    def mark_disconnected(self, device_id: str) -> None:
        session = self.sessions[device_id]
        if session.transport: session.transport.close()
        session.transport, session.connected = None, False
        session.attempts += 1
        delay = min(self.max_delay, self.base_delay * (2 ** (session.attempts - 1)))
        session.next_retry_at = self.clock() + delay * (1 + self.jitter * self.rng())

    def close(self) -> None:
        for session in self.sessions.values():
            if session.transport: session.transport.close()
            session.connected = False

