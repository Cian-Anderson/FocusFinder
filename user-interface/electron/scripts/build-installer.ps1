param(
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$electronDir = Resolve-Path (Join-Path $scriptDir "..")
$frontendDir = Join-Path $electronDir "frontend"

function Invoke-NpmChecked {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Args,
        [Parameter(Mandatory = $true)]
        [string]$StepName
    )

    npm @Args
    if ($LASTEXITCODE -ne 0) {
        throw "[build-installer] Step failed: $StepName (exit code $LASTEXITCODE)"
    }
}

Write-Host "[build-installer] Electron directory: $electronDir"

if (-not $SkipInstall) {
    Write-Host "[build-installer] Installing Electron dependencies with npm ci..."
    Invoke-NpmChecked -Args @("--prefix", "$electronDir", "ci") -StepName "Electron dependency install"

    Write-Host "[build-installer] Installing frontend dependencies with npm ci..."
    Invoke-NpmChecked -Args @("--prefix", "$frontendDir", "ci") -StepName "Frontend dependency install"
}

Write-Host "[build-installer] Building frontend and Windows installer..."
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
Invoke-NpmChecked -Args @("--prefix", "$electronDir", "run", "dist:win") -StepName "Windows installer build"

Write-Host "[build-installer] Done. Installer artifacts are in: $(Join-Path $electronDir 'release')"
