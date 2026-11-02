# Safety net: remove the public firewall rule if a public session was closed by killing the window.
param([int]$Port = 8765)
$here = $PSScriptRoot
try {
    $p = Start-Process powershell -Verb RunAs -Wait -PassThru -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$here\admin.ps1`"", 'close', '-Port', "$Port")
    if ($p.ExitCode -eq 0) { Write-Host "Public access closed. This PC no longer accepts connections on TCP $Port." -ForegroundColor Green }
} catch { Write-Host "Cancelled; nothing changed." }
