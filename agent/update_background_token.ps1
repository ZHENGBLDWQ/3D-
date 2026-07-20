$ErrorActionPreference = "Stop"

$tokenFile = Join-Path $env:TEMP "layertrace_x2d.token"
$configPath = Join-Path $env:LOCALAPPDATA "LayerTrace\x2d-agent.json"
$newToken = ([string](Get-Content -LiteralPath $tokenFile -Raw)).Trim()
if (-not $newToken.StartsWith("lt_")) { throw "Invalid replacement token" }

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$config.token = ConvertFrom-SecureString (ConvertTo-SecureString $newToken -AsPlainText -Force)
$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
Remove-Item -LiteralPath $tokenFile -Force
Clear-Variable newToken -ErrorAction SilentlyContinue

Stop-ScheduledTask -TaskName "LayerTrace X2D Agent" -ErrorAction SilentlyContinue
$agentProcesses = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq "python.exe" -and $_.CommandLine -like "*layertrace_agent.py*"
}
foreach ($agentProcess in $agentProcesses) {
    Stop-Process -Id $agentProcess.ProcessId -Force
}
Start-ScheduledTask -TaskName "LayerTrace X2D Agent"
Write-Output "ENCRYPTED_TOKEN_UPDATED_AND_TASK_RESTARTED"
