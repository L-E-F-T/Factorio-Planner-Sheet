# Static file server for the Factorio Ratios app (no Python/Node needed). Runs as a normal user.
#   serve.ps1 -Port 8765            listens on localhost only (nothing outside this PC can reach it)
#   serve.ps1 -Port 8765 -Public    listens on every interface (needs the URL reservation that admin.ps1 makes)
# Press Q in the window to stop. Ctrl+C also works.
param([int]$Port = 8765, [string]$Root = $PSScriptRoot, [switch]$Public, [switch]$NoBrowser)

$Root = (Resolve-Path $Root).Path
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='application/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8';
            '.png'='image/png'; '.json'='application/json'; '.svg'='image/svg+xml'; '.ico'='image/x-icon'; '.webmanifest'='application/manifest+json'; '.txt'='text/plain'; '.md'='text/plain; charset=utf-8' }

# Who already has this port registered with Windows' HTTP service (http.sys)? Returns @{Pid; Image; CommandLine; Started} or $null.
function Get-PortOwner([int]$Port) {
    try {
        $txt = (netsh http show servicestate view=requestq | Out-String)
        foreach ($b in ($txt -split '(?m)^Request queue name:')) {
            if ($b -notmatch "HTTP://[^\s]*:$Port/") { continue }
            $m = [regex]::Match($b, 'ID:\s*(\d+),\s*image:\s*(.+)')
            if (-not $m.Success) { continue }
            $ownerPid = [int]$m.Groups[1].Value
            $cmd = $null; $started = $null
            try { $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$ownerPid" -ErrorAction Stop).CommandLine } catch { }
            try { $started = (Get-Process -Id $ownerPid -ErrorAction Stop).StartTime } catch { }
            return @{ Pid = $ownerPid; Image = $m.Groups[2].Value.Trim(); CommandLine = $cmd; Started = $started }
        }
    } catch { }
    return $null
}

function Start-Listener([string]$prefix) {
    $l = New-Object System.Net.HttpListener
    $l.Prefixes.Add($prefix)
    $l.Start()
    return $l
}
$listener = $null
$boundAll = $false
try {
    if ($Public) {
        $listener = Start-Listener "http://+:$Port/"
    } else {
        # LOCAL. Once PUBLIC has reserved http://+:PORT/ with Windows, that is the address that works for a normal
        # user (an explicit localhost registration is refused, or registered but never routed to). With the public
        # firewall rule absent, nothing outside this PC can connect to it. On a PC where PUBLIC was never run the
        # reservation does not exist, the + bind is denied, and plain localhost is used.
        try {
            $listener = Start-Listener "http://+:$Port/"
            $boundAll = $true
        } catch [System.Net.HttpListenerException] {
            if ($_.Exception.ErrorCode -ne 5) { throw }
            $listener = Start-Listener "http://localhost:$Port/"
        }
    }
} catch {
    $err = $_.Exception.Message
    $owner = Get-PortOwner $Port
    Write-Host ""
    if ($owner -and $owner.CommandLine -match 'local\.ps1|public\.ps1|serve\.ps1') {
        # a Factorio Ratios window is already serving this port: the usual cause is the .bat being started twice
        $mode = if ($owner.CommandLine -match 'public') { 'PUBLIC' } else { 'LOCAL' }
        $since = if ($owner.Started) { ' since ' + $owner.Started.ToString('h:mm tt') } else { '' }
        Write-Host "Factorio Ratios is already running in another window ($mode$since)." -ForegroundColor Yellow
        if ($Public) {
            Write-Host "Close that window first, then start PUBLIC again."
            exit 1
        }
        Write-Host "This window is not needed; the running one serves http://localhost:$Port/."
        if (-not $NoBrowser) { Start-Process "http://localhost:$Port/" }
        exit 0
    }
    if ($Public) {
        Write-Host "Could not listen on all interfaces on port $Port." -ForegroundColor Red
        Write-Host "Either the address is not reserved yet (Start PUBLIC.bat does that, it needs the admin prompt accepted)"
        Write-Host "or something else is already using port $Port."
    } else {
        Write-Host "Could not listen on port $Port. Something else is already using that port." -ForegroundColor Red
    }
    if ($owner) { Write-Host ("Port $Port is held by process {0}: {1}" -f $owner.Pid, $owner.Image) }
    Write-Host $err
    exit 1
}

$local = "http://localhost:$Port/"
Write-Host ""
Write-Host "Factorio Ratios  -  serving $Root" -ForegroundColor Yellow
Write-Host "  This PC:            $local"
if ($Public) {
    $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -ExpandProperty IPAddress
    foreach ($ip in $ips) { Write-Host "  Your network (LAN): http://$ip`:$Port/" }
    $pub = $null
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $pub = (Invoke-RestMethod -Uri 'https://api.ipify.org' -TimeoutSec 6).Trim()
    } catch { }
    if ($pub) {
        Write-Host "  Give your friends:  http://$pub`:$Port/" -ForegroundColor Green
        Write-Host "  (works once your router forwards TCP $Port to this PC; from inside your own network use the LAN address)"
    } else {
        Write-Host "  Public address:     could not look it up (no internet?). It is the WAN address on your router."
    }
    Write-Host "  Mode: PUBLIC. Connections are listed below as they come in."
} else {
    Write-Host "  Mode: LOCAL. Only this PC can open it."
    if ($boundAll) { Write-Host "  (The firewall is closed for this port, so no one outside this PC can connect.)" }
}
Write-Host "  Press Q to stop." -ForegroundColor Yellow
Write-Host ""
if (-not $NoBrowser) { Start-Process $local }

function Send-File($ctx) {
    $req = $ctx.Request; $res = $ctx.Response
    try {
        $rel = [Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
        if ($rel -eq '') { $rel = 'index.html' }
        $rel = $rel -replace '/', '\'
        $full = [IO.Path]::GetFullPath((Join-Path $Root $rel))
        if (-not $full.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $full -PathType Leaf) -or $rel -like 'tools\*' -or $rel -like '*.ps1' -or $rel -like '*.bat') {
            $res.StatusCode = 404
            $bytes = [Text.Encoding]::UTF8.GetBytes("404 not found")
        } else {
            $ext = [IO.Path]::GetExtension($full).ToLower()
            $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
            $res.Headers['Cache-Control'] = 'no-cache'
            $bytes = [IO.File]::ReadAllBytes($full)
        }
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
        if ($Public -and $rel -notlike 'icons\*') {
            Write-Host ("  {0:HH:mm:ss}  {1,-15}  GET /{2}" -f (Get-Date), $req.RemoteEndPoint.Address, ($rel -replace '\\', '/'))
        }
    } catch {
        try { $res.StatusCode = 500 } catch {}
    } finally {
        try { $res.OutputStream.Close() } catch {}
    }
}

$pending = $null
try {
    while ($listener.IsListening) {
        if ($null -eq $pending) { $pending = $listener.GetContextAsync() }
        if ($pending.Wait(250)) {
            $ctx = $pending.Result
            $pending = $null
            Send-File $ctx
        }
        try {
            if ([Console]::KeyAvailable) {
                $k = [Console]::ReadKey($true)
                if ($k.Key -eq 'Q') { Write-Host "Stopping."; break }
            }
        } catch { }
    }
} finally {
    try { $listener.Stop(); $listener.Close() } catch {}
    Write-Host "Server stopped."
}
