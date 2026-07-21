"""Read-only Bambu monitoring adapter and durable event outbox.

This module deliberately exposes no printer command/publish surface. Bambu
Studio and the printer remain the only control plane; LayerTrace observes.
"""
from __future__ import annotations
from hashlib import sha256
import json
from pathlib import Path
from threading import RLock
import time
from typing import Callable

from .ams import normalize_ams

TERMINAL = {"FINISH": "completed", "FAILED": "failed", "CANCELLED": "cancelled"}
STATES = {"RUNNING": "printing", "PAUSE": "paused", "IDLE": "idle", **TERMINAL}

class DurableEventOutbox:
    """Append-before-send outbox; acknowledged events are removed atomically."""
    def __init__(self, path: str | Path): self.path, self._lock = Path(path), RLock()
    def load(self) -> list[dict]:
        with self._lock:
            try: return json.loads(self.path.read_text(encoding="utf-8"))
            except (OSError, ValueError): return []
    def append(self, event: dict) -> None:
        with self._lock:
            events = self.load()
            if not any(item.get("id") == event.get("id") for item in events): events.append(event)
            self._write(events)
    def acknowledge(self, event_ids: set[str]) -> None:
        with self._lock: self._write([event for event in self.load() if event.get("id") not in event_ids])
    def _write(self, events: list[dict]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(self.path.suffix + ".tmp")
        temporary.write_text(json.dumps(events, ensure_ascii=False), encoding="utf-8")
        temporary.replace(self.path)

class BambuMonitorAdapter:
    """Normalizes MQTT reports into idempotent, monitor-only public events."""
    monitor_only = True
    def __init__(self, binding_id: int, serial: str, emit: Callable[[dict], None], *, clock=time.time, state_path: str | Path | None = None):
        self.binding_id, self.serial, self.emit, self.clock = binding_id, serial, emit, clock
        self.state_path = Path(state_path) if state_path else None
        state = self._load_state()
        self.session_key: str | None = state.get("sessionKey")
        self.last_status = str(state.get("lastStatus") or "unknown")

    def observe(self, report: dict) -> list[dict]:
        data = report.get("print", report)
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(self.clock()))
        raw_state = str(data.get("gcode_state") or "IDLE").upper()
        status = STATES.get(raw_state, "unknown")
        filename = str(data.get("subtask_name") or data.get("gcode_file") or "")
        task_id = str(data.get("subtask_id") or data.get("task_id") or "")
        if status == "printing" and not self.session_key:
            # Task id is stable across agent restarts. Without one, persist the
            # generated key until a terminal state is observed.
            seed = f"{self.serial}|{task_id or filename}|{now if not self.state_path else ''}"
            self.session_key = sha256(seed.encode()).hexdigest()[:32]
        session_key = self.session_key
        events: list[dict] = []
        snapshot = {"bindingId":self.binding_id,"status":status,"progressPercent":data.get("mc_percent"),"remainingSeconds":_minutes(data.get("mc_remaining_time")),"currentFile":filename,"nozzleTemperatureC":data.get("nozzle_temper"),"nozzleTargetTemperatureC":data.get("nozzle_target_temper"),"bedTemperatureC":data.get("bed_temper"),"bedTargetTemperatureC":data.get("bed_target_temper"),"currentLayer":data.get("layer_num"),"totalLayers":data.get("total_layer_num"),"taskId":task_id or None,"sessionKey":session_key,"observedAt":now}
        events.append(self._event("printer.snapshot", now, snapshot, f"snapshot:{now}"))
        slots = normalize_ams(report)
        events.append(self._event("printer.materials", now, {"bindingId":self.binding_id,"slots":slots}, f"materials:{now}"))
        if session_key and status != self.last_status and status in {"printing","paused","completed","failed","cancelled"}:
            phase = "started" if status == "printing" and self.last_status not in {"printing","paused"} else status
            events.append(self._event("print.session", now, {**snapshot,"phase":phase,"externalSessionKey":session_key,"source":"bambu_studio"}, f"session:{session_key}:{phase}:{now}"))
        if status in {"completed","failed","cancelled"}: self.session_key = None
        self.last_status = status
        self._save_state()
        for event in events: self.emit(event)
        return events

    def _event(self, kind: str, occurred_at: str, data: dict, suffix: str) -> dict:
        event_id = sha256(f"{self.serial}|{suffix}".encode()).hexdigest()
        return {"id":event_id,"type":kind,"occurredAt":occurred_at,"data":data}

    def _load_state(self) -> dict:
        if not self.state_path: return {}
        try: return json.loads(self.state_path.read_text(encoding="utf-8"))
        except (OSError, ValueError): return {}

    def _save_state(self) -> None:
        if not self.state_path: return
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.state_path.with_suffix(self.state_path.suffix + ".tmp")
        temporary.write_text(json.dumps({"sessionKey":self.session_key,"lastStatus":self.last_status}),encoding="utf-8")
        temporary.replace(self.state_path)

def _minutes(value):
    try: return max(0, int(float(value) * 60))
    except (TypeError, ValueError): return None
