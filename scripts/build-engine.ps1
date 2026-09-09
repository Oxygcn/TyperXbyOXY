$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$Python = Join-Path $Root '.venv\Scripts\python.exe'
$Builder = Join-Path $PSScriptRoot 'build_engine.py'
if (-not (Test-Path -LiteralPath $Python -PathType Leaf)) {
    throw 'Project Python environment is missing. Run scripts/bootstrap.ps1 first.'
}
if (-not (Test-Path -LiteralPath $Builder -PathType Leaf)) {
    throw 'Missing scripts/build_engine.py. Extract BOTH scripts from TyperX-build-fix.zip.'
}
& $Python $Builder
if ($LASTEXITCODE -ne 0) {
    throw "Engine build failed with exit code $LASTEXITCODE. See the first error above."
}
