$ErrorActionPreference = "Stop"

$tokenFile = Join-Path $env:TEMP "layertrace_x2d.token"
if (-not (Test-Path -LiteralPath $tokenFile)) {
    Write-Host "The temporary LayerTrace Agent token file is missing. Generate a new token from Device Management." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}

$agentToken = ([string](Get-Content -LiteralPath $tokenFile -Raw)).Trim()
if (-not $agentToken.StartsWith("lt_")) {
    Write-Host "The temporary LayerTrace Agent token is invalid. Generate a new token from Device Management." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}
Remove-Item -LiteralPath $tokenFile -Force

$accessCode = ""
while ([string]::IsNullOrWhiteSpace($accessCode)) {
    $secureCode = Read-Host "Type the LAN Access Code, then press Enter (nothing will appear while typing)" -AsSecureString
    $codePtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureCode)
    try {
        $accessCode = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($codePtr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($codePtr)
    }
    if ([string]::IsNullOrWhiteSpace($accessCode)) {
        Write-Host "No code was entered. Please type it before pressing Enter." -ForegroundColor Yellow
    }
}

$env:LAYERTRACE_TOKEN = $agentToken
$env:PRINTER_CONNECTOR = "bambu_lan"
$env:BAMBU_HOST = "192.168.2.186"
$env:BAMBU_SERIAL = "20P6BJ643001689"
$env:BAMBU_ACCESS_CODE = $accessCode
$env:POLL_INTERVAL = "10"

Clear-Variable accessCode -ErrorAction SilentlyContinue
Write-Host "Connecting to X2D showroom printer 3 (192.168.2.186)..." -ForegroundColor Cyan
$pythonExe = "C:\Program Files\LibreOffice\program\python.exe"
if (-not (Test-Path -LiteralPath $pythonExe)) {
    Write-Host "Python 3.12 runtime was not found." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}
& $pythonExe -u (Join-Path $PSScriptRoot "layertrace_agent.py")
$agentExitCode = $LASTEXITCODE

Write-Host "Agent stopped with exit code $agentExitCode." -ForegroundColor Yellow
Read-Host "Press Enter to close"
