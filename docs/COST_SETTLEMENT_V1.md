# Classified material settlement

`POST /api/cost-settlement` connects read-only Bambu monitoring to the serialized spool ledger without taking over printer control.

## Workflow

1. `action: import` accepts `layertrace.slice-metadata/v1`, a trusted organization printer, and stores one canonical estimate per SHA-256 fingerprint. Repeated imports return the same session.
2. `action: reserve` attaches the fingerprint to a real `print_session`. A caller may supply explicit `feedPositionByFilament` entries. Only a currently bound spool in the same organization is accepted. Missing mappings remain unbound; reservation never changes spool grams.
3. `action: measure` records a scale-derived gram value on an unsettled usage line. It overrides the slicer estimate during settlement.
4. `action: settle` accepts `completed`, `failed`, or `cancelled`. Completed jobs use the full estimate. Failed/cancelled jobs require `lastLayerByPlate` and use per-feature cumulative layer grams. Missing layer evidence remains pending.
5. Known, bound lines produce one immutable `consume` movement per spool and usage line. `unknown`, unbound, and insufficient-stock lines are never guessed. Fully settled jobs post their classified material cost once to the order/job profit ledger.

`GET /api/cost-settlement` is the read-only classified cost view. It groups each print session by purpose and toolhead and links the totals to the print job, product, order, quantity, and per-unit material cost.

The canonical fingerprint is also recorded in the audit log when reserved. This allows settlement to recover the slice metadata if a later monitor snapshot replaces the session telemetry JSON.
