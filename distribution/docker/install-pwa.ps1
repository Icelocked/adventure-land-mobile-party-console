# Adds Party Console Companion's PWA to a party-console that runs in Docker:
# finds party-console's Compose project, starts compose.pwa.yaml (next to this
# file) in it, and offers Tailscale Serve for the phone. Safe to run again; it
# then updates the PWA to the latest release.
# Docker writes warnings and progress to stderr, which Windows PowerShell
# would turn into errors under 'Stop'; every step checks its exit code instead.
$ErrorActionPreference = 'Continue'
$composeFile = Join-Path $PSScriptRoot 'compose.pwa.yaml'
$port = if ($env:PWA_PORT) { $env:PWA_PORT } else { '8080' }

function Stop-Install($message) {
    Write-Host ''
    Write-Host $message -ForegroundColor Red
    exit 1
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Stop-Install 'Docker was not found. If party-console runs without Docker, use the Windows package (party-console-companion-pwa-windows-*.zip) instead.' }
docker info *> $null
if ($LASTEXITCODE -ne 0) { Stop-Install 'Docker is not running. Start Docker Desktop, wait until it is ready, and run this again.' }
docker compose version *> $null
if ($LASTEXITCODE -ne 0) { Stop-Install 'Docker Compose is not available. Update Docker Desktop and run this again.' }

# Compose labels of the containers for one service. docker inspect's JSON,
# because Windows PowerShell mangles the quotes a --format template needs.
function Get-ComposeContainers($filters) {
    $ids = @(docker ps -aq @($filters | ForEach-Object { '--filter', $_ }))
    if ($ids.Count -eq 0) { return @() }
    # foreach, not the pipeline: Windows PowerShell passes a JSON array on as one object.
    $parsed = docker inspect $ids | Out-String | ConvertFrom-Json
    foreach ($container in $parsed) { [pscustomobject]@{ Labels = $container.Config.Labels; Running = $container.State.Running } }
}

# party-console's container carries its Compose project name.
$consoles = @(Get-ComposeContainers @('label=com.docker.compose.service=party-console') | ForEach-Object {
    "$($_.Labels.'com.docker.compose.project')|$(if ($_.Running) { 'running' } else { 'stopped' })"
})
if ($consoles.Count -eq 0) { Stop-Install 'party-console was not found in Docker. Install and start it first; if it runs without Docker, use the Windows package instead.' }
$projects = @($consoles | ForEach-Object { $_.Split('|')[0] } | Select-Object -Unique)
if ($env:PARTY_CONSOLE_PROJECT) {
    if ($projects -notcontains $env:PARTY_CONSOLE_PROJECT) { Stop-Install "No party-console in Docker project '$($env:PARTY_CONSOLE_PROJECT)'. Found: $($projects -join ', ')" }
    $project = $env:PARTY_CONSOLE_PROJECT
} elseif ($projects.Count -gt 1) {
    for ($i = 0; $i -lt $projects.Count; $i++) { Write-Host "  [$($i + 1)] $($projects[$i])" }
    $pick = Read-Host 'More than one party-console found. Add the PWA to which one?'
    if (-not ($pick -match '^\d+$') -or [int]$pick -lt 1 -or [int]$pick -gt $projects.Count) { Stop-Install 'Nothing chosen; nothing was changed.' }
    $project = $projects[[int]$pick - 1]
} else {
    $project = $projects[0]
}
if (-not ($consoles -contains "$project|running")) { Write-Host "Note: party-console ($project) is not running right now; the PWA will connect once it is." -ForegroundColor Yellow }
Write-Host "Found party-console in Docker project '$project'."

# A PWA set up by hand in party-console's own compose.yaml stays as it is.
$existing = @(Get-ComposeContainers @("label=com.docker.compose.project=$project", 'label=com.docker.compose.service=party-console-pwa') | ForEach-Object { $_.Labels.'com.docker.compose.project.config_files' })
if ($existing.Count -gt 0 -and -not ($existing[0] -match 'compose\.pwa\.yaml')) {
    Stop-Install "The PWA is already set up in $($existing[0]). Update it there (docker compose pull; docker compose up -d), or remove its services from that file and run this again."
}

# The PWA shares party-console's project, so Compose would call party-console
# an "orphan" and suggest --remove-orphans, which would delete it.
$env:COMPOSE_IGNORE_ORPHANS = 'True'
Write-Host 'Downloading the PWA...'
docker compose -p $project -f $composeFile pull
if ($LASTEXITCODE -ne 0) { Stop-Install 'Downloading the PWA image failed. Check your internet connection and run this again.' }
docker compose -p $project -f $composeFile up -d
if ($LASTEXITCODE -ne 0) { Stop-Install "Starting the PWA failed. If port $port is taken, set another one first, e.g. in PowerShell: `$env:PWA_PORT=8081; .\install-pwa.ps1" }

$ready = $false
for ($i = 0; $i -lt 30 -and -not $ready; $i++) {
    try { $ready = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://127.0.0.1:$port/").StatusCode -eq 200 } catch { Start-Sleep -Seconds 1 }
}
if (-not $ready) { Stop-Install "The PWA started but doesn't answer on port $port yet. Check: docker compose -p $project -f `"$composeFile`" logs" }
Write-Host ''
Write-Host "The PWA is running: http://localhost:$port" -ForegroundColor Green

# Tailscale Serve gives the phone an HTTPS address (needed for notifications
# and Android's "Install app"). An existing Serve setup is never replaced.
$tailscale = Get-Command tailscale -ErrorAction SilentlyContinue
if (-not $tailscale -and (Test-Path 'C:\Program Files\Tailscale\tailscale.exe')) { $tailscale = Get-Item 'C:\Program Files\Tailscale\tailscale.exe' }
if ($tailscale) {
    $serve = (& $tailscale.Source serve status 2>&1 | Out-String)
    if ($serve -match 'No serve config') {
        $answer = Read-Host 'Let your phone open the PWA over HTTPS with Tailscale Serve? [Y/n]'
        if ($answer -notmatch '^[nN]') {
            & $tailscale.Source serve --bg $port
            Write-Host 'If Tailscale asked you to enable HTTPS certificates, follow its link, then run:'
            Write-Host "  tailscale serve --bg $port"
        }
    } elseif ($serve -notmatch ":$port") {
        Write-Host "Tailscale Serve is already set up on this PC; left unchanged. For the PWA: tailscale serve --bg $port"
    }
    try {
        $name = ((& $tailscale.Source status --json | ConvertFrom-Json).Self.DNSName).TrimEnd('.')
        if ($name -and (& $tailscale.Source serve status 2>&1 | Out-String) -match ":${port}\b") { Write-Host "On your phone: https://$name/" -ForegroundColor Green }
    } catch { }
} else {
    Write-Host 'To use it from your phone, see DEPLOYMENT.md section 4b (Tailscale).'
}
Write-Host ''
Write-Host 'Updates: in the app, Settings -> Party Console PWA.'
Write-Host "To remove it (party-console stays): docker compose -p $project -f `"$composeFile`" rm --stop --force"
