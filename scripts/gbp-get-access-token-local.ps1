param(
    [Parameter(Mandatory = $true)]
    [string]$ClientSecretFile,

    [string]$Scope = "https://www.googleapis.com/auth/business.manage"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ClientSecretFile)) {
    Write-Error "Client secret file not found: $ClientSecretFile"
    exit 1
}

$oauthConfig = Get-Content -LiteralPath $ClientSecretFile -Raw | ConvertFrom-Json
$installed = $oauthConfig.installed

if (-not $installed) {
    Write-Error "Expected an OAuth Desktop client JSON with an 'installed' section."
    exit 1
}

$clientId = $installed.client_id
$clientSecret = $installed.client_secret
$redirectUri = $null

if ($installed.redirect_uris) {
    $redirectUri = $installed.redirect_uris | Where-Object { $_ -match '^http://(localhost|127\.0\.0\.1)' } | Select-Object -First 1
}

if (-not $redirectUri) {
    Write-Error "No localhost redirect URI found in OAuth client JSON. Create/recreate Desktop OAuth client with localhost redirect support."
    exit 1
}

function Get-FreeTcpPort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $port = ($listener.LocalEndpoint).Port
    $listener.Stop()
    return $port
}

# If redirect URI is localhost without explicit port (defaults to 80), switch to an ephemeral
# loopback port so non-admin users can bind the callback listener.
$redirectUriObj = [System.Uri]$redirectUri
if (($redirectUriObj.Host -eq "localhost" -or $redirectUriObj.Host -eq "127.0.0.1") -and $redirectUriObj.IsDefaultPort) {
    $ephemeralPort = Get-FreeTcpPort
    $callbackPath = $redirectUriObj.AbsolutePath
    if ([string]::IsNullOrWhiteSpace($callbackPath)) {
        $callbackPath = "/"
    }
    $redirectUri = "http://127.0.0.1:$ephemeralPort$callbackPath"
    Write-Host "Using loopback callback URI: $redirectUri" -ForegroundColor Cyan
}

$prefix = $redirectUri
if (-not $prefix.EndsWith('/')) {
    $prefix = "$prefix/"
}

$state = [guid]::NewGuid().ToString('N')
$authUrl = "https://accounts.google.com/o/oauth2/v2/auth?client_id=$([uri]::EscapeDataString($clientId))&redirect_uri=$([uri]::EscapeDataString($redirectUri))&response_type=code&scope=$([uri]::EscapeDataString($Scope))&access_type=offline&prompt=consent&state=$state"

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
}
catch {
    Write-Error "Failed to start local callback listener on $prefix. Try closing apps using that port, or use a Desktop OAuth client with a different localhost redirect URI."
    exit 1
}

Write-Host "Opening browser for Google authorization..." -ForegroundColor Cyan
Write-Host "If browser does not open, paste this URL manually:" -ForegroundColor Yellow
Write-Host $authUrl -ForegroundColor Yellow
Start-Process $authUrl | Out-Null

try {
    $context = $listener.GetContext()
}
catch {
    $listener.Stop()
    Write-Error "Did not receive OAuth callback: $($_.Exception.Message)"
    exit 1
}

$request = $context.Request
$response = $context.Response

$html = "<html><body><h2>Authorization received. You can close this tab.</h2></body></html>"
$buffer = [System.Text.Encoding]::UTF8.GetBytes($html)
$response.ContentLength64 = $buffer.Length
$response.ContentType = "text/html"
$response.OutputStream.Write($buffer, 0, $buffer.Length)
$response.OutputStream.Close()
$listener.Stop()

$qs = [System.Web.HttpUtility]::ParseQueryString($request.Url.Query)
$code = $qs.Get("code")
$returnedState = $qs.Get("state")
$oauthError = $qs.Get("error")

if ($oauthError) {
    Write-Error "OAuth authorization error: $oauthError"
    exit 1
}

if (-not $code) {
    Write-Error "No authorization code found in callback."
    exit 1
}

if ($returnedState -ne $state) {
    Write-Error "State mismatch in OAuth callback."
    exit 1
}

$tokenBody = @{
    client_id     = $clientId
    client_secret = $clientSecret
    code          = $code
    grant_type    = "authorization_code"
    redirect_uri  = $redirectUri
}

try {
    $tokenResponse = Invoke-RestMethod -Method Post -Uri "https://oauth2.googleapis.com/token" -Body $tokenBody -ContentType "application/x-www-form-urlencoded"
}
catch {
    Write-Error "Token exchange failed: $($_.Exception.Message)"
    if ($_.ErrorDetails.Message) {
        Write-Error $_.ErrorDetails.Message
    }
    exit 1
}

Write-Host "Authorization successful." -ForegroundColor Green
Write-Host "ACCESS_TOKEN:" -ForegroundColor Cyan
Write-Output $tokenResponse.access_token

if ($tokenResponse.refresh_token) {
    Write-Host "REFRESH_TOKEN:" -ForegroundColor Cyan
    Write-Output $tokenResponse.refresh_token
}

Write-Host "EXPIRES_IN_SECONDS: $($tokenResponse.expires_in)" -ForegroundColor Cyan
