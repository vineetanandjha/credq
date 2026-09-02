param(
    [Parameter(Mandatory=$true)]
    [string]$AccessToken,

    [Parameter(Mandatory=$true)]
    [string]$AccountId,

    [string]$ReadMask = "name,title,storefrontAddress,websiteUri,phoneNumbers,profile"
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

if ($AccessToken -match '^PASTE_' -or $AccountId -match '^PASTE_') {
    Write-Error "Placeholder values detected. Replace PASTE_ACCESS_TOKEN and PASTE_ACCOUNT_ID with real values."
    exit 1
}

$headers = @{ Authorization = "Bearer $AccessToken" }
$parent = "accounts/$AccountId"
$uri = "https://mybusinessbusinessinformation.googleapis.com/v1/$parent/locations?pageSize=100&readMask=$([uri]::EscapeDataString($ReadMask))"

try {
    $response = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers -ContentType "application/json"
    if (-not $response.locations) {
        Write-Output "No locations returned for $parent"
        exit 0
    }

    $response.locations | ForEach-Object {
        [PSCustomObject]@{
            name = $_.name
            title = $_.title
            websiteUri = $_.websiteUri
            primaryPhone = $_.phoneNumbers.primaryPhone
        }
    } | Format-Table -AutoSize
}
catch {
    Write-Error "GBP list request failed: $($_.Exception.Message)"
    $rawError = Get-HttpErrorBody -ErrorRecord $_
    if ($rawError) {
        Write-Error "Google response body: $rawError"
    }
    exit 1
}
