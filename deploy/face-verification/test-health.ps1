# Quick local health check for Apoyo face verification stack.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "==> Docker containers"
Push-Location $root
docker compose ps
Pop-Location

Write-Host "`n==> Verifier health (http://localhost:8090/health)"
try {
  $health = Invoke-RestMethod -Uri "http://localhost:8090/health" -TimeoutSec 10
  Write-Host ($health | ConvertTo-Json -Compress)
} catch {
  Write-Warning "Verifier not reachable on :8090 — is apoyo-face-verifier running?"
}

Write-Host "`n==> Verifier modules (id OCR + face)"
$ErrorActionPreference = "Continue"
$mods = docker compose -f (Join-Path $root "docker-compose.yml") exec -T apoyo-face-verifier python -c "import id_match; import main; print('ok')" 2>&1
$ErrorActionPreference = "Stop"
if ($LASTEXITCODE -eq 0) {
  Write-Host $mods
} else {
  Write-Warning "Could not verify verifier modules inside container: $mods"
}

Write-Host "`n==> CompreFace UI (http://localhost:8000)"
try {
  $ui = Invoke-WebRequest -Uri "http://localhost:8000" -TimeoutSec 10 -UseBasicParsing
  Write-Host "CompreFace UI HTTP $($ui.StatusCode)"
} catch {
  Write-Warning "CompreFace UI not reachable — check compreface-api/admin logs."
}

$key = (Get-Content (Join-Path $root ".env") -ErrorAction SilentlyContinue | Where-Object { $_ -match '^COMPREFACE_API_KEY=' }) -replace '^COMPREFACE_API_KEY=', ''
if ($key) {
  Write-Host "`nCompreFace API key is set in .env."
} else {
  Write-Host "`nDemo Verification API key: 00000000-0000-0000-0000-000000000004"
}

Write-Host "`nFor phone testing, keep cloudflared running:"
Write-Host "  .\cloudflared.exe tunnel --url http://localhost:8090"
Write-Host "Then update Supabase FACE_VERIFY_SERVICE_URL to the trycloudflare.com URL."
