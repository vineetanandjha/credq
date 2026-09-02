param(
    [Parameter(Mandatory=$true)]
    [string]$AccessToken,

    [Parameter(Mandatory=$true)]
    [string]$LocationId,

    [string]$Description,
    [string]$WebsiteUri,
    [string]$PrimaryPhone,
    [switch]$ValidateOnly
)

$ErrorActionPreference = "Stop"

$updateMask = @()
$body = @{ name = "locations/$LocationId" }

if ($PSBoundParameters.ContainsKey("Description")) {
    $body.profile = @{ description = $Description }
    $updateMask += "profile"
}

if ($PSBoundParameters.ContainsKey("WebsiteUri")) {
    $body.websiteUri = $WebsiteUri
    $updateMask += "websiteUri"
}

if ($PSBoundParameters.ContainsKey("PrimaryPhone")) {
    $body.phoneNumbers = @{ primaryPhone = $PrimaryPhone }
    $updateMask += "phoneNumbers.primaryPhone"
}

if ($updateMask.Count -eq 0) {
    Write-Error "Nothing to update. Pass at least one of: -Description, -WebsiteUri, -PrimaryPhone"
    exit 1
}

$headers = @{ Authorization = "Bearer $AccessToken" }
$query = "updateMask=$([uri]::EscapeDataString(($updateMask -join ',')))"
if ($ValidateOnly) {
    $query += "&validateOnly=true"
}

$uri = "https://mybusinessbusinessinformation.googleapis.com/v1/locations/$LocationId?$query"
$jsonBody = $body | ConvertTo-Json -Depth 6

try {
    $response = Invoke-RestMethod -Method Patch -Uri $uri -Headers $headers -ContentType "application/json" -Body $jsonBody
    if ($ValidateOnly) {
        Write-Output "Validation successful. No changes were written."
    }
    else {
        Write-Output "GBP location updated successfully: locations/$LocationId"
    }
    $response | ConvertTo-Json -Depth 8
}
catch {
    Write-Error "GBP patch request failed: $($_.Exception.Message)"
    if ($_.ErrorDetails.Message) {
        Write-Error $_.ErrorDetails.Message
    }
    exit 1
}
