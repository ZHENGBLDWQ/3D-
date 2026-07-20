$ErrorActionPreference = "Stop"

$tokenFile = Join-Path $env:TEMP "layertrace_x2d.token"
if (-not (Test-Path -LiteralPath $tokenFile)) {
    Write-Host "The temporary Agent token is missing." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}
$tokenPlain = ([string](Get-Content -LiteralPath $tokenFile -Raw)).Trim()
if (-not $tokenPlain.StartsWith("lt_")) {
    Write-Host "The temporary Agent token is invalid." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}

$accessPlain = ""
while ([string]::IsNullOrWhiteSpace($accessPlain)) {
    $accessSecureInput = Read-Host "Type the printer LAN Access Code, then press Enter" -AsSecureString
    $accessPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($accessSecureInput)
    try { $accessPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($accessPtr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($accessPtr) }
}

$tokenSecure = ConvertTo-SecureString $tokenPlain -AsPlainText -Force
$accessSecure = ConvertTo-SecureString $accessPlain -AsPlainText -Force
$configDir = Join-Path $env:LOCALAPPDATA "LayerTrace"
$configPath = Join-Path $configDir "x2d-agent.json"
New-Item -ItemType Directory -Path $configDir -Force | Out-Null
@{
    host = "192.168.2.186"
    serial = "20P6BJ643001689"
    token = ConvertFrom-SecureString $tokenSecure
    accessCode = ConvertFrom-SecureString $accessSecure
} | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
Remove-Item -LiteralPath $tokenFile -Force
Clear-Variable tokenPlain, accessPlain -ErrorAction SilentlyContinue

$runner = Join-Path $PSScriptRoot "run_x2d_background.ps1"
$taskName = "LayerTrace X2D Agent"
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "python.exe" -and $_.CommandLine -like "*layertrace_agent.py*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-ScheduledTask -TaskName $taskName

Write-Host "LayerTrace background Agent installed and started." -ForegroundColor Green
Write-Host "Credentials are encrypted for the current Windows user." -ForegroundColor Green
Read-Host "Press Enter to close"
