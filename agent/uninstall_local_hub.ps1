param([switch]$RemoveCredentials)

$ErrorActionPreference = "Stop"
$taskName = "LayerTrace Local Hub"
$installRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "LayerTrace\LocalHub"))
$expectedParent = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "LayerTrace"))
if (-not $installRoot.StartsWith($expectedParent, [StringComparison]::OrdinalIgnoreCase)) { throw "Refusing to remove an unexpected path." }

Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
foreach ($name in "app","state") {
    $target = Join-Path $installRoot $name
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
}
if ($RemoveCredentials) {
    foreach ($name in "credentials.json","config.json") {
        $target = Join-Path $installRoot $name
        if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Force }
    }
}
Write-Host "LayerTrace Local Hub service removed." -ForegroundColor Green
Write-Host $(if ($RemoveCredentials) { "Encrypted credentials removed." } else { "Encrypted credentials kept for recovery. Use -RemoveCredentials to delete them." })
