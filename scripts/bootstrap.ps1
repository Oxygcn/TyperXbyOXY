# Initial online setup only. Review and commit generated lockfiles before release.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Run([scriptblock]$Command) { & $Command; if ($LASTEXITCODE -ne 0) { throw "Command failed: $Command" } }
if (-not (Test-Path .venv)) { Run { py -3.12 -m venv .venv } }
$Python = Join-Path $PWD '.venv/Scripts/python.exe'
Run { & $Python -m pip install 'uv==0.8.13' }
Run { & $Python -m uv pip compile bridge/requirements.in --python-version 3.12 --generate-hashes --output-file bridge/requirements.lock }
Run { & $Python -m pip install --require-hashes -r bridge/requirements.lock }
$Lock = Get-Content backend.lock.json | ConvertFrom-Json
if (-not (Test-Path backend)) { Run { git clone --no-checkout $Lock.repository backend } }
Run { git -C backend checkout --detach $Lock.commit }
Run { & $Python scripts/patch-backend.py }
Run { npm install --package-lock-only --ignore-scripts }
Run { npm ci }
Run { cargo generate-lockfile --manifest-path src-tauri/Cargo.toml }
Write-Host 'Review and commit package-lock.json, src-tauri/Cargo.lock, bridge/requirements.lock.'
Write-Host 'Next: ./scripts/build-engine.ps1; npm run desktop:dev'
