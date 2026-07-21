param([string]$LayerTraceUrl = "http://127.0.0.1:3000")

$ErrorActionPreference = "Stop"
$installRoot = Join-Path $env:LOCALAPPDATA "LayerTrace\LocalHub"
$appRoot = Join-Path $installRoot "app"
$pythonCandidates = @(
    (Get-Command python.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1),
    (Get-Command py.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1),
    "C:\Program Files\Python313\python.exe",
    "C:\Program Files\Python312\python.exe"
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
$pythonExe = $null
foreach ($candidate in $pythonCandidates) {
    try { & $candidate --version 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { $pythonExe = $candidate; break } } catch {}
}
if (-not $pythonExe) { throw "Python 3.10 or newer was not found. Install Python, then run this installer again." }

New-Item -ItemType Directory -Path $appRoot -Force | Out-Null
foreach ($file in "layertrace_agent.py","configure_local_hub.py","run_local_hub.py") { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination $appRoot -Force }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "layertrace_gateway") -Destination $appRoot -Recurse -Force

$gatewayToken = ""
while ([string]::IsNullOrWhiteSpace($gatewayToken)) {
    $secureToken = Read-Host "Paste the one-time Local Hub gateway token" -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    try { $gatewayToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
$env:LAYERTRACE_URL = $LayerTraceUrl.TrimEnd("/")
$env:LAYERTRACE_GATEWAY_TOKEN = $gatewayToken
try { & $pythonExe (Join-Path $appRoot "configure_local_hub.py") }
finally {
    Remove-Item Env:LAYERTRACE_GATEWAY_TOKEN -ErrorAction SilentlyContinue
    Remove-Item Env:LAYERTRACE_URL -ErrorAction SilentlyContinue
    Clear-Variable gatewayToken -ErrorAction SilentlyContinue
}
if ($LASTEXITCODE -ne 0) { throw "Local Hub configuration failed." }

$runner = Join-Path $appRoot "run_local_hub.py"
$taskName = "LayerTrace Local Hub"
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $pythonExe -Argument "-u `"$runner`"" -WorkingDirectory $appRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -RestartCount 20 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host "LayerTrace Local Hub installed and started." -ForegroundColor Green
Write-Host "Configuration: $installRoot" -ForegroundColor Green
Write-Host "The task runs as the current Windows user so DPAPI credentials remain readable." -ForegroundColor Green
