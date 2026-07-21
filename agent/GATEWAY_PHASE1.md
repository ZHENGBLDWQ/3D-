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

## Generic Windows Local Hub

The previous `x2d` scripts remain for compatibility. New A1, X2D and P2S installations should use the generic multi-device installer:

```powershell
.\agent\install_local_hub.ps1 -LayerTraceUrl "https://your-layertrace-site.example"
```

The installer copies the standard-library-only Python service to the current user's Local AppData, discovers Bambu printers, stores the gateway token and selected printer access codes with Windows DPAPI, and registers a limited-permission scheduled task. The service refreshes DHCP addresses, pulls organization-scoped binding requests, maintains one read-only MQTT monitor per printer, persists events before upload, and reports diagnostics. It never exposes a printer-control command surface.

Day-to-day operations use `manage_local_hub.ps1`. Examples:

```powershell
.\agent\manage_local_hub.ps1 -Action status
.\agent\manage_local_hub.ps1 -Action scan
.\agent\manage_local_hub.ps1 -Action set-credential -Serial "PRINTER_SERIAL"
.\agent\manage_local_hub.ps1 -Action test -Serial "PRINTER_SERIAL"
.\agent\manage_local_hub.ps1 -Action diagnostics
.\agent\manage_local_hub.ps1 -Action restart
```

Diagnostics contain only masked device identifiers and credential-presence flags. Uninstall keeps encrypted credentials by default for recovery; use `uninstall_local_hub.ps1 -RemoveCredentials` only when permanent credential removal is intended.
