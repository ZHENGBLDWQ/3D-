# Bambu Local Gateway — Phase 1, Iteration 1

This package establishes the local-only boundary for Bambu discovery and binding.

## Implemented

- SSDP discovery for multiple Bambu printers.
- Stable identity (`bambu:<serial>`) and deduplication across DHCP changes.
- Public discovery payloads containing no LAN Access Code.
- Credential store interface and Windows DPAPI implementation.
- Thread-safe registry with one live connection per printer identity.
- Simulated unit tests requiring neither printers nor cloud access.

Run from `agent/`:

```powershell
python -m unittest discover -s tests -v
```

## Security boundary

The LAN Access Code is passed directly to `PrinterConnectionRegistry.bind` and written only through `CredentialStore`. It is never included in discovery records, public payloads, exception messages, or logs. `LocalCredentialStore` refuses persistent storage outside Windows rather than silently writing plaintext. Production should place the encrypted store in a service-user-owned directory such as `%ProgramData%\LayerTrace\credentials.json`.

## Real-device validation still required

- Confirm SSDP headers on current A1, X2D, and P2S firmware.
- Verify hosts with multiple adapters and Windows Firewall enabled.
- Verify MQTT reconnect using credentials retrieved from the store.
- Validate simultaneous connections, printer reboot, DHCP changes, and Access Code rotation.
