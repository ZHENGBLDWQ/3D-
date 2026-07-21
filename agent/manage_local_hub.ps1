param(
    [ValidateSet("status","scan","diagnostics","set-credential","remove-credential","test","restart","stop","start")]
    [string]$Action = "status",
    [string]$Serial = ""
)

$ErrorActionPreference = "Stop"
$taskName = "LayerTrace Local Hub"
$installRoot = Join-Path $env:LOCALAPPDATA "LayerTrace\LocalHub"
$manager = Join-Path $installRoot "app\manage_local_hub.py"
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $task) { throw "LayerTrace Local Hub is not installed." }

if ($Action -eq "restart") { Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue; Start-ScheduledTask -TaskName $taskName; return }
if ($Action -eq "stop") { Stop-ScheduledTask -TaskName $taskName; return }
if ($Action -eq "start") { Start-ScheduledTask -TaskName $taskName; return }
if (-not (Test-Path -LiteralPath $manager)) { throw "Local Hub management tool is missing. Run the installer again." }

$pythonExe = [string]$task.Actions[0].Execute
$arguments = @($manager, $Action)
if ($Action -in @("set-credential","remove-credential","test")) {
    if ([string]::IsNullOrWhiteSpace($Serial)) { throw "-Serial is required for $Action." }
    $arguments += @("--serial", $Serial)
}
$env:LAYERTRACE_TASK_STATE = [string]$task.State
try { & $pythonExe @arguments; $exitCode = $LASTEXITCODE }
finally { Remove-Item Env:LAYERTRACE_TASK_STATE -ErrorAction SilentlyContinue }
exit $exitCode
