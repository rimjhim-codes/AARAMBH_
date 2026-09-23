param(
  [string]$ApiBase = $(if ($env:AUTH_API_BASE) { $env:AUTH_API_BASE } else { "http://localhost:8080/api" }),
  [string]$Email1,
  [string]$Email2,
  [string]$Password = "TestPassword123!"
)

$ErrorActionPreference = "Stop"
if (-not $Email1 -or -not $Email2) {
  throw "Pass two real inboxes: -Email1 first@example.com -Email2 second@example.com"
}

function Invoke-Auth($method, $path, $body, $session) {
  $params = @{ Method = $method; Uri = "$ApiBase$path"; WebSession = $session; ContentType = "application/json" }
  if ($null -ne $body) { $params.Body = ($body | ConvertTo-Json -Depth 10) }
  Invoke-RestMethod @params
}

function Test-Account($email) {
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  Invoke-Auth POST "/auth/signup" @{ name = "Auth Smoke"; email = $email; password = $Password } $session | Out-Host
  $otp = Read-Host "Enter the OTP received at $email"
  Invoke-Auth POST "/auth/verify-email" @{ email = $email; code = $otp } $session | Out-Host
  Invoke-Auth GET "/auth/me" $null $session | Out-Host
  Invoke-Auth POST "/auth/logout" $null $session | Out-Host
  try {
    Invoke-Auth GET "/auth/me" $null $session | Out-Host
    throw "Expected /auth/me to fail after logout"
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -ne 401) { throw }
  }

  Invoke-Auth POST "/auth/login" @{ email = $email; password = $Password } $session | Out-Host
  Invoke-Auth POST "/auth/refresh" $null $session | Out-Host
  Invoke-Auth GET "/auth/me" $null $session | Out-Host
  Invoke-Auth POST "/auth/logout" $null $session | Out-Host
}

Write-Host "Testing account 1: $Email1"
Test-Account $Email1
Write-Host "Testing account 2: $Email2"
Test-Account $Email2
Write-Host "Auth smoke test completed. Verify both inboxes received distinct OTP emails."
