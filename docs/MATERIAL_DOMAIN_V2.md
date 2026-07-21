# Material domain v2

This schema separates unopened warehouse stock from serialized, opened spools used by printers. It is intentionally a data foundation only: Bambu Studio remains the sole print-control surface.

## Authority and lifecycle

- `material_catalog_items` describes a material product and its official/custom color metadata.
- `material_purchase_lots` captures procurement cost and traceability.
- `material_spools` is the unique physical spool. Its state is `sealed`, `open_storage`, `in_use`, `empty`, `scrapped`, or the migration-only `needs_count`.
- `material_spool_movements` is the immutable sub-ledger. Moving a spool from warehouse to a printer changes its location and state without reducing organization assets. A `consume`, `loss`, or `scrap` movement reduces net material.
- `printer_feed_positions` models AMS, AMS Lite, AMS HT, and external feeds independently from main/auxiliary/left/right toolheads.
- `spool_bindings` maps one physical spool to one active feed position. Unknown RFID or third-party material remains unbound instead of being guessed.
- `print_sessions` provides an idempotent observation identity for Bambu Studio or printer reprints.
- `print_material_usage_lines` splits model, support, support interface, purge, wipe tower, brim, calibration, and unknown use across spools and toolheads.
- `spool_weight_checks` records immutable gross/tare/net measurements. Any variance is posted through a separate `adjust` movement.

All domain rows carry `organization_id`. Cross-organization joins are rejected by database triggers, active spool/feed bindings are unique, and settled usage, movements, and weight checks cannot be rewritten or deleted.

## Legacy compatibility

Migration 0041 never deletes or rewrites `material_batches`, `inventory_transactions`, or existing printer allocations. Each organization/batch pair is projected into a catalog item, purchase lot, and a single `needs_count` spool. This placeholder preserves the aggregate grams but must be physically counted and split into serialized spools before v2 becomes authoritative.

`material_inventory_v2_compat` exposes the legacy batch identifier and projected remaining grams. During phases 11–13, APIs may dual-write legacy balances and the v2 ledger. New consumers should read serialized spools; old reports may continue reading `material_batches` until their cutover is complete.
