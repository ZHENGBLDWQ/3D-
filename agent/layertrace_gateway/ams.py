"""Normalize Bambu AMS/tray reports into the shared public event shape."""
from __future__ import annotations

def _color(value: object) -> str | None:
    text = str(value or "").strip().lstrip("#")[:6]
    return f"#{text.upper()}" if len(text) == 6 and all(c in "0123456789abcdefABCDEF" for c in text) else None

def normalize_ams(report: dict) -> list[dict]:
    print_data = report.get("print", report)
    units = print_data.get("ams", {}).get("ams", []) or []
    active_tray = str(print_data.get("ams", {}).get("tray_now", ""))
    slots, seen = [], set()
    for unit in units:
        unit_id = int(unit.get("id", 0) or 0)
        for tray in unit.get("tray", []) or []:
            slot = int(tray.get("id", 0) or 0)
            key = (unit_id, slot)
            if key in seen: continue
            seen.add(key)
            remaining = tray.get("remain")
            slots.append({
                "unit": unit_id, "slot": slot,
                "feedKind": "ams", "toolhead": "main",
                "material": str(tray.get("tray_type") or "").upper() or None,
                "colorHex": _color(tray.get("tray_color")),
                "tagUid": str(tray.get("tag_uid") or "") or None,
                "remainingPercent": max(0, min(100, float(remaining))) if remaining not in (None, "") else None,
                "active": active_tray in {str(slot), f"{unit_id}{slot}"},
            })
    virtual = print_data.get("ams", {}).get("vt_tray")
    if isinstance(virtual, dict) and any(virtual.get(key) for key in ("tray_type", "tray_color", "tag_uid")):
        remaining = virtual.get("remain")
        slots.append({"unit":255,"slot":0,"feedKind":"external","toolhead":str(virtual.get("toolhead") or "main"),"material":str(virtual.get("tray_type") or "").upper() or None,"colorHex":_color(virtual.get("tray_color")),"tagUid":str(virtual.get("tag_uid") or "") or None,"remainingPercent":max(0,min(100,float(remaining))) if remaining not in (None,"") else None,"active":active_tray in {"254","255"}})
    auxiliary = print_data.get("auxiliary_tray")
    if isinstance(auxiliary, dict):
        remaining = auxiliary.get("remain")
        slots.append({"unit":254,"slot":0,"feedKind":"external","toolhead":"auxiliary","material":str(auxiliary.get("tray_type") or "").upper() or None,"colorHex":_color(auxiliary.get("tray_color")),"tagUid":str(auxiliary.get("tag_uid") or "") or None,"remainingPercent":max(0,min(100,float(remaining))) if remaining not in (None,"") else None,"active":bool(auxiliary.get("active"))})
    return slots
