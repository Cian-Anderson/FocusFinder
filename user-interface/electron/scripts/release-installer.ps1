param(
    [ValidateSet("patch", "minor", "major")]
    [string]$Bump = "patch",
    [string]$Version,
    [switch]$NoBump,
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$electronDir = Resolve-Path (Join-Path $scriptDir "..")
$packageJsonPath = Join-Path $electronDir "package.json"
$selfPackageDir = Join-Path $electronDir "node_modules\adhd-activity-monitor"

# Guard against accidental self-dependency loops in npm metadata.
npm --prefix $electronDir pkg delete "dependencies.adhd-activity-monitor" | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "[release-installer] Failed to sanitize self-dependency metadata"
}
if (Test-Path $selfPackageDir) {
    Remove-Item $selfPackageDir -Recurse -Force
}

if (-not $NoBump) {
    if ($Version) {
        Write-Host "[release-installer] Setting version to $Version"
        npm --prefix $electronDir version $Version --no-git-tag-version | Out-Host
    }
    else {
        Write-Host "[release-installer] Bumping $Bump version"
        npm --prefix $electronDir version $Bump --no-git-tag-version | Out-Host
    }
}
else {
    Write-Host "[release-installer] No version bump requested"
}

$packageData = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
Write-Host "[release-installer] Building installer for version $($packageData.version)"

$buildArgs = @{}
if ($SkipInstall) {
    $buildArgs.SkipInstall = $true
}

& (Join-Path $scriptDir "build-installer.ps1") @buildArgs
if ($LASTEXITCODE -ne 0) {
    throw "[release-installer] Build script failed (exit code $LASTEXITCODE)"
}

Write-Host "[release-installer] Completed build for version $($packageData.version)"
