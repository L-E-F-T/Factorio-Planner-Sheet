# The only part that needs Administrator. The launchers run it through a UAC prompt; you do not run it yourself.
#   admin.ps1 open  -Port 8765 -WatchPid <pid>   reserve http://+:PORT/ for normal users, add an inbound firewall rule
#                                                for TCP PORT, then stay in the background and remove the rule again
#                                                as soon as process <pid> (the public session) is gone or asks to stop
#   admin.ps1 close -Port 8765                   remove the firewall rule now (the URL reservation is harmless and stays)
param([Parameter(Mandatory = $true)][ValidateSet('open', 'close')][string]$Action, [int]$Port = 8765, [int]$WatchPid = 0)

$rule = "Factorio Ratios public"
$url = "http://+:$Port/"
$stopFile = Join-Path $env:TEMP "factorio-ratios-stop-$Port"

function Remove-Rule { netsh advfirewall firewall delete rule name="$rule" | Out-Null }

if ($Action -eq 'close') {
    Remove-Rule
    Remove-Item $stopFile -ErrorAction SilentlyContinue
    exit 0
}

$ok = $true
# D:(A;;GX;;;WD) = Everyone may listen on this URL. Lets the server run as a normal user instead of as admin.
$have = (netsh http show urlacl url=$url | Out-String)
if ($have -notmatch [regex]::Escape($url)) {
    netsh http add urlacl url=$url sddl='D:(A;;GX;;;WD)' | Out-Null
    if ($LASTEXITCODE -ne 0) { $ok = $false }
}
# A separate localhost reservation next to the + one makes http.sys ignore a localhost listener; remove it if present.
$lh = "http://localhost:$Port/"
if ((netsh http show urlacl url=$lh | Out-String) -match [regex]::Escape($lh)) { netsh http delete urlacl url=$lh | Out-Null }

Remove-Rule
netsh advfirewall firewall add rule name="$rule" dir=in action=allow protocol=TCP localport=$Port | Out-Null
if ($LASTEXITCODE -ne 0) { $ok = $false }
if (-not $ok) { Remove-Rule; exit 1 }

if ($WatchPid -gt 0) {
    # Watchdog: wait until the public session ends, however it ends, then close the firewall again.
    Remove-Item $stopFile -ErrorAction SilentlyContinue
    while ($true) {
        if (Test-Path $stopFile) { break }
        if (-not (Get-Process -Id $WatchPid -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 500
    }
    Remove-Rule
    Remove-Item $stopFile -ErrorAction SilentlyContinue
}
exit 0
