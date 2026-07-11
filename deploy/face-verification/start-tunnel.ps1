# Expose local verifier to Supabase (trycloudflare quick tunnel).
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

if (-not (Test-Path (Join-Path $root "cloudflared.exe"))) {
  Write-Host "Downloading cloudflared..."
  Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" `
    -OutFile (Join-Path $root "cloudflared.exe") -UseBasicParsing
}

Write-Host "Starting tunnel to http://localhost:8090"
Write-Host "Copy the https://....trycloudflare.com URL, then run:"
Write-Host "  cd ..\.."
Write-Host "  npm run supabase -- secrets set FACE_VERIFY_SERVICE_URL=https://YOUR-URL.trycloudflare.com FACE_VERIFY_SERVICE_KEY=1234567890"
Write-Host ""

Push-Location $root
& .\cloudflared.exe tunnel --url http://localhost:8090
