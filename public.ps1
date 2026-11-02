# Public session: open the firewall (one admin prompt), run the server for everyone, and have the elevated helper
# close the firewall again the moment this session ends, no matter how it ends.
param([int]$Port = 8765)
$here = $PSScriptRoot
$rule = "Factorio Ratios public"
$stopFile = Join-Path $env:TEMP "factorio-ratios-stop-$Port"

function Test-Rule { ((netsh advfirewall firewall show rule name="$rule" 2>&1 | Out-String) -match 'Rule Name') }

Remove-Item $stopFile -ErrorAction SilentlyContinue
Write-Host "Opening public access on TCP $Port. Windows will ask for permission once." -ForegroundColor Yellow
$watchdog = $null
try {
    $watchdog = Start-Process powershell -Verb RunAs -WindowStyle Hidden -PassThru -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$here\admin.ps1`"", 'open', '-Port', "$Port", '-WatchPid', "$PID")
} catch { }
# wait for the helper to put the rule in place (or give up)
$deadline = (Get-Date).AddSeconds(90)
while ($watchdog -and -not $watchdog.HasExited -and -not (Test-Rule) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 300 }
if (-not (Test-Rule)) {
    Write-Host "Public access was NOT opened (cancelled or failed). Nothing is exposed." -ForegroundColor Red
    exit 1
}
Write-Host "Firewall open on TCP $Port. It closes again automatically when this window ends." -ForegroundColor Green

try {
    & "$here\serve.ps1" -Port $Port -Public
} finally {
    Write-Host ""
    Write-Host "Closing public access..." -ForegroundColor Yellow
    New-Item -Path $stopFile -ItemType File -Force | Out-Null
    if ($watchdog) { [void]$watchdog.WaitForExit(20000) }
    if (Test-Rule) {
        Write-Host "WARNING: the firewall rule is still there. Run 'Close public access.bat' to remove it." -ForegroundColor Red
    } else {
        Write-Host "Closed. This PC no longer accepts connections on TCP $Port." -ForegroundColor Green
    }
}
