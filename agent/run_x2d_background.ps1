$ErrorActionPreference = "Stop"

$configPath = Join-Path $env:LOCALAPPDATA "LayerTrace\x2d-agent.json"
$logPath = Join-Path $env:LOCALAPPDATA "LayerTrace\x2d-agent.log"
$pythonExe = "C:\Program Files\LibreOffice\program\python.exe"

if (-not (Test-Path -LiteralPath $configPath)) { exit 2 }
if (-not (Test-Path -LiteralPath $pythonExe)) { exit 3 }

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$tokenSecure = ConvertTo-SecureString $config.token
$accessSecure = ConvertTo-SecureString $config.accessCode
$tokenPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($tokenSecure)
$accessPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($accessSecure)
try {
    $env:LAYERTRACE_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPtr)
    $env:BAMBU_ACCESS_CODE = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($accessPtr)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPtr)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($accessPtr)
}

$env:PRINTER_CONNECTOR = "bambu_lan"
$env:BAMBU_HOST = [string]$config.host
$env:BAMBU_SERIAL = [string]$config.serial
$env:POLL_INTERVAL = "10"

while ($true) {
    & $pythonExe -u (Join-Path $PSScriptRoot "layertrace_agent.py") *>> $logPath
    Start-Sleep -Seconds 10
}
