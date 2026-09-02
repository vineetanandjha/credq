param(
    [Parameter(Mandatory = $true)]
    [string]$ClientSecretFile,

    [string]$Scope = "https://www.googleapis.com/auth/business.manage",

    [int]$MaxWaitSeconds = 600
)

$ErrorActionPreference = "Stop"

function Get-HttpErrorBody {
    param(
        [Parameter(Mandatory = $true)]
        $ErrorRecord
    )

    if ($ErrorRecord.ErrorDetails -and $ErrorRecord.ErrorDetails.Message) {
        return $ErrorRecord.ErrorDetails.Message
    }

    try {
        $response = $ErrorRecord.Exception.Response
        if ($null -ne $response -and $null -ne $response.Content) {
            return $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        }
    }
    catch {
        return $null
    }

    return $null
}

if (-not (Test-Path -LiteralPath $ClientSecretFile)) {
    Write-Error "Client secret file not found: $ClientSecretFile"
    exit 1
}

try {
    $oauthConfig = Get-Content -LiteralPath $ClientSecretFile -Raw | ConvertFrom-Json
}
catch {
    Write-Error "Failed to parse OAuth client file: $($_.Exception.Message)"
    exit 1
}

$installed = $oauthConfig.installed
if (-not $installed) {
    Write-Error "Expected an OAuth Desktop client JSON with an 'installed' section."
    exit 1
}

$clientId = $installed.client_id
$clientSecret = $installed.client_secret

if (-not $clientId -or -not $clientSecret) {
    Write-Error "client_id or client_secret missing in the OAuth client file."
    exit 1
}

$deviceCodeBody = @{
    client_id = $clientId
    scope     = $Scope
}

try {
    $deviceCodeResponse = Invoke-RestMethod -Method Post -Uri "https://oauth2.googleapis.com/device/code" -Body $deviceCodeBody -ContentType "application/x-www-form-urlencoded"
}
catch {
    Write-Error "Failed to start device OAuth flow: $($_.Exception.Message)"
    $rawError = Get-HttpErrorBody -ErrorRecord $_
    if ($rawError) {
        Write-Error "Google response body: $rawError"
        if ($rawError -match '"error"\s*:\s*"invalid_client"' -and $rawError -match 'Invalid client type') {
            Write-Error "This OAuth client type does not support device flow. Use scripts/gbp-get-access-token-local.ps1 instead."
        }
    }
    exit 1
}

Write-Host "Open this URL:" -ForegroundColor Cyan
Write-Host "  $($deviceCodeResponse.verification_url)" -ForegroundColor Yellow
Write-Host "Enter this code:" -ForegroundColor Cyan
Write-Host "  $($deviceCodeResponse.user_code)" -ForegroundColor Yellow
Write-Host "Waiting for authorization..." -ForegroundColor Cyan

$deviceCode = $deviceCodeResponse.device_code
$interval = [int]($deviceCodeResponse.interval)
if ($interval -lt 1) { $interval = 5 }

$startedAt = Get-Date
$tokenUri = "https://oauth2.googleapis.com/token"

while ($true) {
    if (((Get-Date) - $startedAt).TotalSeconds -gt $MaxWaitSeconds) {
        Write-Error "Timed out waiting for authorization."
        exit 1
    }

    Start-Sleep -Seconds $interval

    $tokenBody = @{
        client_id     = $clientId
        client_secret = $clientSecret
        device_code   = $deviceCode
        grant_type    = "urn:ietf:params:oauth:grant-type:device_code"
    }

    try {
        $tokenResponse = Invoke-RestMethod -Method Post -Uri $tokenUri -Body $tokenBody -ContentType "application/x-www-form-urlencoded"
        Write-Host "Authorization successful." -ForegroundColor Green
        Write-Host "ACCESS_TOKEN:" -ForegroundColor Cyan
        Write-Output $tokenResponse.access_token

        if ($tokenResponse.refresh_token) {
            Write-Host "REFRESH_TOKEN:" -ForegroundColor Cyan
            Write-Output $tokenResponse.refresh_token
        }

        Write-Host "EXPIRES_IN_SECONDS: $($tokenResponse.expires_in)" -ForegroundColor Cyan
        exit 0
    }
    catch {
        $rawError = Get-HttpErrorBody -ErrorRecord $_
        if (-not $rawError) {
            Write-Error "Token polling failed: $($_.Exception.Message)"
            exit 1
        }

        try {
            $errObj = $rawError | ConvertFrom-Json
            $errCode = $errObj.error
        }
        catch {
            Write-Error "Token polling failed: $rawError"
            exit 1
        }

        switch ($errCode) {
            "authorization_pending" { continue }
            "slow_down" { $interval += 5; continue }
            "access_denied" { Write-Error "Authorization was denied."; exit 1 }
            "expired_token" { Write-Error "Device code expired. Re-run the script."; exit 1 }
            default {
                Write-Error "Token polling failed: $rawError"
                exit 1
            }
        }
    }
}
