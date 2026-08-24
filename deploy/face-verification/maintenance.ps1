# Apoyo face-verification maintenance.
#   .\maintenance.ps1            -> show docker disk usage
#   .\maintenance.ps1 -Clean     -> reclaim safe space (dangling images + unused build cache)
#   .\maintenance.ps1 -Restart   -> restart the stack
#   .\maintenance.ps1 -Rebuild   -> rebuild verifier, then prune old cache
#
# NOTE: This never deletes the `postgres-data` volume, so your CompreFace
# service/API key survives. With save_images_to_db=false and capped logs,
# the stack has a fixed footprint and does NOT grow while idle.

param(
  [switch]$Clean,
  [switch]$Restart,
  [switch]$Rebuild
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

if ($Rebuild) {
  docker compose up -d --build
  docker image prune -f            # drop images orphaned by the rebuild
  docker builder prune -f          # drop build cache no longer backing an image
}
elseif ($Restart) {
  docker compose restart
}
elseif ($Clean) {
  docker image prune -f            # dangling images only
  docker builder prune -f          # unreferenced build cache only
  docker container prune -f        # stopped containers only
}

Write-Host "`n=== Docker disk usage ===" -ForegroundColor Cyan
docker system df
