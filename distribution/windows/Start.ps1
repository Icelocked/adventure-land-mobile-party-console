# Starts Party Console Companion's PWA without Docker. Needs party-console
# running on this PC (its Windows ZIP or Docker). First start downloads a
# private, checksum-verified Node runtime from nodejs.org into .\runtime.
# Settings: optional config.env next to this file (see README.txt).
$ErrorActionPreference = 'Stop'
$installRoot = $PSScriptRoot
$nodeVersion = '24.14.0'
$runtimeRoot = Join-Path $installRoot "runtime\node-v$nodeVersion-win-x64"
$nodeExe = Join-Path $runtimeRoot 'node.exe'
$dataDir = Join-Path $installRoot 'data'
$activeFile = Join-Path $installRoot 'active.json'

if (-not (Test-Path -LiteralPath $nodeExe)) {
    if (-not [Environment]::Is64BitOperatingSystem) { throw 'Windows x64 is required.' }
    $runtimeDirectory = Join-Path $installRoot 'runtime'
    New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
    $archiveName = "node-v$nodeVersion-win-x64.zip"
    $archive = Join-Path $runtimeDirectory $archiveName
    $base = "https://nodejs.org/dist/v$nodeVersion"
    Write-Host 'Preparing the private Node runtime...'
    Invoke-WebRequest -UseBasicParsing -Uri "$base/$archiveName" -OutFile $archive
    $checksums = (Invoke-WebRequest -UseBasicParsing -Uri "$base/SHASUMS256.txt").Content
    $line = ($checksums -split "`n" | Where-Object { $_.Trim().EndsWith("  $archiveName") })
    if (-not $line) { throw 'Runtime checksum was not found.' }
    $expected = ($line.Trim() -split '\s+')[0]
    # .NET directly rather than Get-FileHash and Expand-Archive, whose modules
    # don't load when PowerShell inherits PowerShell 7's module path.
    $stream = [IO.File]::OpenRead($archive)
    try { $actual = -join ([Security.Cryptography.SHA256]::Create().ComputeHash($stream) | ForEach-Object { $_.ToString('x2') }) } finally { $stream.Dispose() }
    if ($actual -ne $expected) { throw 'Runtime checksum verification failed.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($archive, $runtimeDirectory)
    Remove-Item -LiteralPath $archive
}

# From here on, a failing step (Tailscale, for one) must not stop the PWA.
$ErrorActionPreference = 'Continue'

# config.env: KEY=VALUE lines for the settings below; anything else is ignored.
$allowed = 'PWA_PORT', 'PWA_HOST', 'CONSOLE_URL', 'NOTIFIER_PORT'
$configFile = Join-Path $installRoot 'config.env'
if (Test-Path -LiteralPath $configFile) {
    foreach ($entry in Get-Content -LiteralPath $configFile) {
        if ($entry -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$' -and $allowed -contains $Matches[1]) {
            Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2]
        }
    }
}
$port = if ($env:PWA_PORT) { $env:PWA_PORT } else { '8080' }
$env:PWA_HOME = $installRoot
$env:PWA_DATA = $dataDir
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

# Once: offer Tailscale Serve, which gives the phone an HTTPS address (needed
# for notifications and Android's "Install app"). Never replaces a Serve
# setup that already exists.
$asked = Join-Path $dataDir 'tailscale-asked'
$tailscale = Get-Command tailscale -ErrorAction SilentlyContinue
if (-not $tailscale -and (Test-Path 'C:\Program Files\Tailscale\tailscale.exe')) { $tailscale = Get-Item 'C:\Program Files\Tailscale\tailscale.exe' }
if ($tailscale -and -not (Test-Path -LiteralPath $asked)) {
    New-Item -ItemType File -Path $asked | Out-Null
    $serve = (& $tailscale.Source serve status 2>&1 | Out-String)
    if ($serve -match 'No serve config') {
        $answer = Read-Host "Let your phone open the PWA over HTTPS with Tailscale Serve? [Y/n]"
        if ($answer -notmatch '^[nN]') {
            & $tailscale.Source serve --bg $port
            Write-Host 'If Tailscale asks you to enable HTTPS certificates, follow its link, then run:'
            Write-Host "  tailscale serve --bg $port"
        }
    } else {
        Write-Host "Tailscale Serve is already set up on this PC; left unchanged. For the PWA: tailscale serve --bg $port"
    }
}
if ($tailscale) {
    try {
        $name = ((& $tailscale.Source status --json | ConvertFrom-Json).Self.DNSName).TrimEnd('.')
        if ($name -and (& $tailscale.Source serve status 2>&1 | Out-String) -match ":${port}\b") { Write-Host "On your phone: https://$name/" }
    } catch { }
}

while ($true) {
    $active = if (Test-Path -LiteralPath $activeFile) { Get-Content -Raw -LiteralPath $activeFile | ConvertFrom-Json } else { $null }
    $root = if ($active -and $active.root) { $active.root } else { 'app' }
    $appRoot = Join-Path $installRoot $root
    Write-Host "Starting Party Console PWA. Open http://localhost:$port once ready. Close this window to stop."
    & $nodeExe (Join-Path $appRoot 'server\supervisor.mjs')
    $code = $LASTEXITCODE
    if ($code -eq 75) { continue }
    # A new version that can't even start goes back to the previous one.
    if ($active -and $active.pending -and $active.previous) {
        Write-Host "The new version failed to start; going back to $($active.previous)."
        # Written without a byte order mark, which Node's JSON.parse rejects.
        [IO.File]::WriteAllText($activeFile, (@{ root = $active.previous } | ConvertTo-Json))
        $updates = Join-Path $dataDir 'updates'
        New-Item -ItemType Directory -Force -Path $updates | Out-Null
        [IO.File]::WriteAllText((Join-Path $updates 'result.json'), (@{ error = "The new version did not start; rolled back" } | ConvertTo-Json))
        continue
    }
    Write-Host "The PWA stopped (exit code $code). Restarting in 10 seconds; close this window to stop."
    Start-Sleep -Seconds 10
}
