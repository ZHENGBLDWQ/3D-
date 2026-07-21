# Slice metadata import protocol

`layertrace.slice-metadata/v1` is a read-only hand-off between a watched export directory and later inventory settlement. It does not open or automate Bambu Studio, upload files, or control printers.

## Producer workflow

1. The operator exports a **sliced** `.3mf` or `.gcode` file to an inbox.
2. `SliceInboxWatcher` waits until file size and modification time remain stable for the configured settle window.
3. The parser calculates the SHA-256 fingerprint from the original bytes.
4. The watcher emits one payload per fingerprint. The host Agent decides how to transport it.
5. A later API may map usage rows to the `0041` material-usage tables. This module performs no database writes.

## Payload

- `file`: format, SHA-256 fingerprint, byte length and plate count.
- `usage[]`: plate, filament, toolhead, feature, extrusion length and estimated grams.
- `layers[]`: per-layer grams plus cumulative grams, allowing a failed print to settle up to its last confirmed layer.
- `source`: file name, observed time and watch root.

Feature values are fixed: `model`, `support`, `support_interface`, `purge`, `wipe_tower`, `brim`, `calibration`, `unknown`.

Unknown slicer comments are deliberately classified as `unknown`; callers must not guess. Likewise, a `T0`/`T1` command identifies a raw tool/filament index but does not universally prove a physical X2D toolhead. Callers may provide an explicit `toolheadByTool` mapping such as `{0: "main", 1: "auxiliary"}` from a trusted machine profile; otherwise `toolhead` remains `unknown` while `toolIndex` is retained.

Weight is derived from extrusion length, filament diameter and material density. The default is 1.75 mm and 1.24 g/cm3; callers should provide density per filament for financial use.

## CLI

```powershell
node slice-metadata/cli.mjs D:\LayerTrace\PrintInbox\job.3mf
```

The JSON output can be queued by the local Agent. The CLI is an inspection/import tool only.
