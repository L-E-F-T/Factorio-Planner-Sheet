# Local session: serve on localhost only. Also notices if a public session was not closed properly.
param([int]$Port = 8765)
$here = $PSScriptRoot
$rule = "Factorio Ratios public"

$shown = (netsh advfirewall firewall show rule name="$rule" 2>&1 | Out-String)
if ($shown -match 'Rule Name') {
    Write-Host "The public firewall rule '$rule' is still present, so this PC is still reachable on TCP $Port." -ForegroundColor Red
    $a = Read-Host "Remove it now? (y/n)"
    if ($a -match '^[Yy]') {
        try { Start-Process powershell -Verb RunAs -Wait -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$here\admin.ps1`"", 'close', '-Port', "$Port") } catch { }
    }
}

& "$here\serve.ps1" -Port $Port
