<#
    LEGACY QUICK START SCRIPT (NOT FUNCTIONAL IN SUBMISSION)
    ------------------------------------------------------
    This script was used for rapid development and testing only.
    It does NOT work in the submitted version and is provided for reference/documentation purposes only.
    Please use the Windows installer (.exe) in the installer/ folder to run the application.
#>

# Parameters for development/testing (legacy only)
param(
    [switch]$Seed,      # Seed the database (optional)
    [switch]$Monitor,   # Start monitoring backend (default: true)
    [switch]$SafeMode   # Launch Electron in safe mode (disable GPU)
)


# Prevent running as a background job (Electron needs foreground)
try {
    if ($PSPrivateMetadata -and $PSPrivateMetadata.JobId) {
        Write-Host "This script is running as a background PowerShell job (JobId: $($PSPrivateMetadata.JobId))." -ForegroundColor Red
        Write-Host "Run it in the foreground (no trailing '&') so Electron can open a desktop window." -ForegroundColor Yellow
        Write-Host "Example: .\start.ps1 -SafeMode" -ForegroundColor Yellow
        exit 1
    }
}
catch { }


$ErrorActionPreference = 'Stop'

# Trap and print errors
trap {
    Write-Host "`nStartup failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ScriptStackTrace) {
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
    }
    exit 1
}


# Default: monitoring on unless explicitly disabled
if (-not $PSBoundParameters.ContainsKey('Monitor')) {
    $Monitor = $true
}


Write-Host "Starting Activity Monitor (LEGACY SCRIPT)..." -ForegroundColor Cyan


# Set up paths (legacy structure)
$projectRoot = $PSScriptRoot
$fypRoot = $projectRoot
$backendComponent = Join-Path $projectRoot 'activity-monitoring'
$electronDir = Join-Path $projectRoot 'user-interface\electron'
$frontendDir = Join-Path $electronDir 'frontend'
$pythonBackend = Join-Path $projectRoot 'activity-monitoring\python_backend'

if (-not (Test-Path $electronDir)) {
    Write-Host "Electron directory not found at $electronDir. Aborting." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $pythonBackend)) {
    Write-Host "Python backend directory not found at $pythonBackend. Aborting." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $backendComponent)) {
    Write-Host "Backend component directory not found at $backendComponent. Aborting." -ForegroundColor Red
    exit 1
}

Write-Host "Project Root: $projectRoot" -ForegroundColor DarkGray
Write-Host "Electron Dir: $electronDir" -ForegroundColor DarkGray
Write-Host "Python Backend: $pythonBackend" -ForegroundColor DarkGray
Write-Host "Backend Component: $backendComponent" -ForegroundColor DarkGray

$monitorProcess = $null

# STEP 0: Run backend tests and abort on failure (legacy/dev only)  
Write-Host "`nRunning backend tests..." -ForegroundColor Yellow
Push-Location $backendComponent
try {
    python -m unittest discover -s tests -v
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Backend tests failed. Startup aborted." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "Backend tests passed." -ForegroundColor Green
}
finally {
    Pop-Location
}

# Optional: seed database (legacy/dev only)  
if ($Seed) {
    Write-Host "`nSeeding database (reset_and_seed.py)..." -ForegroundColor Yellow
    Push-Location $pythonBackend
    try {
        python reset_and_seed.py
    }
    finally {
        Pop-Location
    }
}

# Helper: Wait for a TCP port to be responsive (legacy/dev only)  
function Wait-Port {
    param(
        [int]$Port = 5173,
        [int]$TimeoutSeconds = 20
    )
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
            $wait = $async.AsyncWaitHandle.WaitOne(1000)
            if ($wait -and $client.Connected) {
                $client.Close()
                return $true
            }
            $client.Close()
        }
        catch { }
    }
    return $false
}

function Stop-ProjectProcesses {
    param(
        [string]$ProjectRoot,
        [string]$FypRoot,
        [string]$ElectronDir,
        [string]$PythonBackend
    )

    $patterns = @($ProjectRoot, $FypRoot, $ElectronDir, $PythonBackend) |
    Where-Object { $_ } |
    ForEach-Object { $_.ToLower() }

    # Do not kill node.exe here; VS Code integrated terminal relies on Node host processes.
    $candidateNames = @('electron.exe', 'python.exe')
    $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $candidateNames -contains $_.Name.ToLower() }

    foreach ($proc in $processes) {
        $cmd = [string]$proc.CommandLine
        $exe = [string]$proc.ExecutablePath
        $haystack = (($cmd + ' ' + $exe).ToLower())

        $isProjectOwned = $false
        foreach ($p in $patterns) {
            if ($haystack -like "*$p*") {
                $isProjectOwned = $true
                break
            }
        }

        if ($isProjectOwned) {
            try {
                Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
            }
            catch { }
        }
    }
}

# STEP 1: Clean existing processes (legacy/dev only)
Write-Host "`nCleaning existing processes..." -ForegroundColor Yellow
Stop-ProjectProcesses -ProjectRoot $projectRoot -FypRoot $fypRoot -ElectronDir $electronDir -PythonBackend $pythonBackend
Start-Sleep -Seconds 1

# Optional: start monitoring backend (src.main) for tracking + API on :5000 (legacy/dev only)  
if ($Monitor) {
    Write-Host "`nStarting monitoring backend (src.main on port 5000)..." -ForegroundColor Green
    try {
        $monitorProcess = Start-Process -FilePath "python" -ArgumentList "-m", "src.main" -WorkingDirectory $pythonBackend -PassThru
        Start-Sleep -Seconds 2
        if ($monitorProcess -and -not $monitorProcess.HasExited) {
            Write-Host "Monitoring backend started (PID: $($monitorProcess.Id))." -ForegroundColor DarkGray
        }
        elseif ($monitorProcess) {
            Write-Host "Monitoring backend exited immediately (PID: $($monitorProcess.Id)). Startup will continue." -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "Failed to start monitoring backend: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "Continuing startup without monitor process." -ForegroundColor Yellow
        $monitorProcess = $null
    }
}

# STEP 2: Optionally start Vite dev server (legacy/dev only)  
$viteJob = $null
if (Test-Path $frontendDir) {
    # Prefer production build if present
    $distIndex = Join-Path $frontendDir 'dist\index.html'
    if (Test-Path $distIndex) {
        Write-Host "`nProduction build found; skipping Vite dev server." -ForegroundColor Green
        $env:SKIP_DEV = '1'
    }
    else {
        Write-Host "`nFrontend found. Starting Vite dev server..." -ForegroundColor Green
        if (-not (Test-Path (Join-Path $frontendDir 'node_modules'))) {
            Write-Host "Installing frontend dependencies (npm install)..." -ForegroundColor Yellow
            Push-Location $frontendDir
            npm install | Out-Null
            Pop-Location
        }
        $viteJob = Start-Job -InitializationScript { $ErrorActionPreference = 'Stop' } -ScriptBlock {
            Set-Location $using:frontendDir
            npm run dev
        }
        Write-Host "Waiting for dev server (checking ports 5173-5175)..." -ForegroundColor Yellow
        $devServerUp = $false
        foreach ($port in 5173, 5174, 5175) {
            if (Wait-Port -Port $port -TimeoutSeconds 8) {
                Write-Host "Dev server is up on port $port." -ForegroundColor Green
                $devServerUp = $true
                break
            }
        }
        if (-not $devServerUp) {
            Write-Host "Dev server did not respond; Electron may fail to load dev UI." -ForegroundColor Red
        }
    }
}
else {
    Write-Host "`nNo frontend directory found; launching Electron without Vite." -ForegroundColor Yellow
    $env:SKIP_DEV = '1'
}

# STEP 3: Start Electron (will spawn Python backend internally, legacy/dev only)  
Write-Host "`nStarting Electron app from '$electronDir'..." -ForegroundColor Green
$env:DEVTOOLS = '1'  # Enable DevTools for demo
Push-Location $electronDir
if (-not (Test-Path (Join-Path $electronDir 'package.json'))) {
    Write-Host "No package.json found in $electronDir. Cannot start Electron." -ForegroundColor Red
    Pop-Location
    exit 1
}
if (-not (Test-Path (Join-Path $electronDir 'node_modules'))) {
    Write-Host "Installing Electron dependencies (npm install)..." -ForegroundColor Yellow
    npm install | Out-Null
}

# In some VS Code integrated terminal environments, npm/electron wrapper env vars
# can prevent GUI startup. Launch electron directly for consistent behavior.
if ($env:ELECTRON_RUN_AS_NODE) {
    Write-Host "Clearing ELECTRON_RUN_AS_NODE for GUI startup." -ForegroundColor DarkGray
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
}

$electronCmd = Join-Path $electronDir 'node_modules\.bin\electron.cmd'
if (-not (Test-Path $electronCmd)) {
    Write-Host "Local Electron binary not found; reinstalling dependencies..." -ForegroundColor Yellow
    npm install | Out-Null
}

$electronArgs = @('.')
if ($SafeMode) {
    Write-Host "Safe mode enabled: launching Electron with GPU acceleration disabled." -ForegroundColor Yellow
    $electronArgs += @('--disable-gpu', '--disable-software-rasterizer')
}

if (Test-Path $electronCmd) {
    Write-Host "Launching Electron directly via local binary..." -ForegroundColor DarkGray
    & $electronCmd @electronArgs
}
else {
    Write-Host "Local binary still missing; using fallback 'npx electron .'" -ForegroundColor Yellow
    npx electron @electronArgs
}
Pop-Location

# STEP 4: Cleanup on exit (legacy/dev only)  
Write-Host "`nShutting down..." -ForegroundColor Red
if ($viteJob) {
    Stop-Job $viteJob -ErrorAction SilentlyContinue
    Remove-Job $viteJob -ErrorAction SilentlyContinue
}
if ($monitorProcess) {
    try {
        if (-not $monitorProcess.HasExited) {
            Stop-Process -Id $monitorProcess.Id -Force -ErrorAction SilentlyContinue
        }
    }
    catch { }
}
Write-Host "Script-owned background processes stopped (global processes left untouched)." -ForegroundColor Green
[switch]$Monitor,
[switch]$SafeMode

try {
    if ($PSPrivateMetadata -and $PSPrivateMetadata.JobId) {
        Write-Host "This script is running as a background PowerShell job (JobId: $($PSPrivateMetadata.JobId))." -ForegroundColor Red
        Write-Host "Run it in the foreground (no trailing '&') so Electron can open a desktop window." -ForegroundColor Yellow
        Write-Host "Example: .\start.ps1 -SafeMode" -ForegroundColor Yellow
        exit 1
    }
}
catch { }

$ErrorActionPreference = 'Stop'

trap {
    Write-Host "`nStartup failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ScriptStackTrace) {
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
    }
    exit 1
}

# Default: monitoring on unless explicitly disabled
if (-not $PSBoundParameters.ContainsKey('Monitor')) {
    $Monitor = $true
}

Write-Host "Starting Activity Monitor..." -ForegroundColor Cyan

# Root of the repository
$projectRoot = $PSScriptRoot

# Submission structure: components are directly in project root
$fypRoot = $projectRoot
$backendComponent = Join-Path $projectRoot 'activity-monitoring'
$electronDir = Join-Path $projectRoot 'user-interface\electron'
$frontendDir = Join-Path $electronDir 'frontend'
$pythonBackend = Join-Path $projectRoot 'activity-monitoring\python_backend'

if (-not (Test-Path $electronDir)) {
    Write-Host "Electron directory not found at $electronDir. Aborting." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $pythonBackend)) {
    Write-Host "Python backend directory not found at $pythonBackend. Aborting." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $backendComponent)) {
    Write-Host "Backend component directory not found at $backendComponent. Aborting." -ForegroundColor Red
    exit 1
}

Write-Host "Project Root: $projectRoot" -ForegroundColor DarkGray
Write-Host "Electron Dir: $electronDir" -ForegroundColor DarkGray
Write-Host "Python Backend: $pythonBackend" -ForegroundColor DarkGray
Write-Host "Backend Component: $backendComponent" -ForegroundColor DarkGray

$monitorProcess = $null

# ---------------------------------------------------------------------------
# STEP 0: Run backend tests and abort on failure
# ---------------------------------------------------------------------------
Write-Host "`nRunning backend tests..." -ForegroundColor Yellow
Push-Location $backendComponent
try {
    python -m unittest discover -s tests -v
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Backend tests failed. Startup aborted." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "Backend tests passed." -ForegroundColor Green
}
finally {
    Pop-Location
}

# ---------------------------------------------------------------------------
# Optional: seed database
# ---------------------------------------------------------------------------
if ($Seed) {
    Write-Host "`nSeeding database (reset_and_seed.py)..." -ForegroundColor Yellow
    Push-Location $pythonBackend
    try {
        python reset_and_seed.py
    }
    finally {
        Pop-Location
    }
}

# ---------------------------------------------------------------------------
# Helper: Wait for a TCP port to be responsive
# ---------------------------------------------------------------------------
function Wait-Port {
    param(
        [int]$Port = 5173,
        [int]$TimeoutSeconds = 20
    )
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
            $wait = $async.AsyncWaitHandle.WaitOne(1000)
            if ($wait -and $client.Connected) {
                $client.Close()
                return $true
            }
            $client.Close()
        }
        catch { }
    }
    return $false
}

function Stop-ProjectProcesses {
    param(
        [string]$ProjectRoot,
        [string]$FypRoot,
        [string]$ElectronDir,
        [string]$PythonBackend
    )

    $patterns = @($ProjectRoot, $FypRoot, $ElectronDir, $PythonBackend) |
    Where-Object { $_ } |
    ForEach-Object { $_.ToLower() }

    # Do not kill node.exe here; VS Code integrated terminal relies on Node host processes.
    $candidateNames = @('electron.exe', 'python.exe')
    $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $candidateNames -contains $_.Name.ToLower() }

    foreach ($proc in $processes) {
        $cmd = [string]$proc.CommandLine
        $exe = [string]$proc.ExecutablePath
        $haystack = (($cmd + ' ' + $exe).ToLower())

        $isProjectOwned = $false
        foreach ($p in $patterns) {
            if ($haystack -like "*$p*") {
                $isProjectOwned = $true
                break
            }
        }

        if ($isProjectOwned) {
            try {
                Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
            }
            catch { }
        }
    }
}

# ---------------------------------------------------------------------------
# STEP 1: Clean existing processes
# ---------------------------------------------------------------------------
Write-Host "`nCleaning existing processes..." -ForegroundColor Yellow
Stop-ProjectProcesses -ProjectRoot $projectRoot -FypRoot $fypRoot -ElectronDir $electronDir -PythonBackend $pythonBackend
Start-Sleep -Seconds 1

# ---------------------------------------------------------------------------
# Optional: start monitoring backend (src.main) for tracking + API on :5000
# ---------------------------------------------------------------------------
if ($Monitor) {
    Write-Host "`nStarting monitoring backend (src.main on port 5000)..." -ForegroundColor Green
    try {
        $monitorProcess = Start-Process -FilePath "python" -ArgumentList "-m", "src.main" -WorkingDirectory $pythonBackend -PassThru
        Start-Sleep -Seconds 2
        if ($monitorProcess -and -not $monitorProcess.HasExited) {
            Write-Host "Monitoring backend started (PID: $($monitorProcess.Id))." -ForegroundColor DarkGray
        }
        elseif ($monitorProcess) {
            Write-Host "Monitoring backend exited immediately (PID: $($monitorProcess.Id)). Startup will continue." -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "Failed to start monitoring backend: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "Continuing startup without monitor process." -ForegroundColor Yellow
        $monitorProcess = $null
    }
}

# ---------------------------------------------------------------------------
# STEP 2: Optionally start Vite dev server
# ---------------------------------------------------------------------------
$viteJob = $null
if (Test-Path $frontendDir) {
    # Prefer production build if present
    $distIndex = Join-Path $frontendDir 'dist\index.html'
    if (Test-Path $distIndex) {
        Write-Host "`nProduction build found; skipping Vite dev server." -ForegroundColor Green
        $env:SKIP_DEV = '1'
    }
    else {
        Write-Host "`nFrontend found. Starting Vite dev server..." -ForegroundColor Green
        if (-not (Test-Path (Join-Path $frontendDir 'node_modules'))) {
            Write-Host "Installing frontend dependencies (npm install)..." -ForegroundColor Yellow
            Push-Location $frontendDir
            npm install | Out-Null
            Pop-Location
        }
        $viteJob = Start-Job -InitializationScript { $ErrorActionPreference = 'Stop' } -ScriptBlock {
            Set-Location $using:frontendDir
            npm run dev
        }
        Write-Host "Waiting for dev server (checking ports 5173-5175)..." -ForegroundColor Yellow
        $devServerUp = $false
        foreach ($port in 5173, 5174, 5175) {
            if (Wait-Port -Port $port -TimeoutSeconds 8) {
                Write-Host "Dev server is up on port $port." -ForegroundColor Green
                $devServerUp = $true
                break
            }
        }
        if (-not $devServerUp) {
            Write-Host "Dev server did not respond; Electron may fail to load dev UI." -ForegroundColor Red
        }
    }
}
else {
    Write-Host "`nNo frontend directory found; launching Electron without Vite." -ForegroundColor Yellow
    $env:SKIP_DEV = '1'
}

# ---------------------------------------------------------------------------
# STEP 3: Start Electron (will spawn Python backend internally)
# ---------------------------------------------------------------------------
Write-Host "`nStarting Electron app from '$electronDir'..." -ForegroundColor Green
$env:DEVTOOLS = '1'  # Enable DevTools for demo
Push-Location $electronDir
if (-not (Test-Path (Join-Path $electronDir 'package.json'))) {
    Write-Host "No package.json found in $electronDir. Cannot start Electron." -ForegroundColor Red
    Pop-Location
    exit 1
}
if (-not (Test-Path (Join-Path $electronDir 'node_modules'))) {
    Write-Host "Installing Electron dependencies (npm install)..." -ForegroundColor Yellow
    npm install | Out-Null
}

# In some VS Code integrated terminal environments, npm/electron wrapper env vars
# can prevent GUI startup. Launch electron directly for consistent behavior.
if ($env:ELECTRON_RUN_AS_NODE) {
    Write-Host "Clearing ELECTRON_RUN_AS_NODE for GUI startup." -ForegroundColor DarkGray
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
}

$electronCmd = Join-Path $electronDir 'node_modules\.bin\electron.cmd'
if (-not (Test-Path $electronCmd)) {
    Write-Host "Local Electron binary not found; reinstalling dependencies..." -ForegroundColor Yellow
    npm install | Out-Null
}

$electronArgs = @('.')
if ($SafeMode) {
    Write-Host "Safe mode enabled: launching Electron with GPU acceleration disabled." -ForegroundColor Yellow
    $electronArgs += @('--disable-gpu', '--disable-software-rasterizer')
}

if (Test-Path $electronCmd) {
    Write-Host "Launching Electron directly via local binary..." -ForegroundColor DarkGray
    & $electronCmd @electronArgs
}
else {
    Write-Host "Local binary still missing; using fallback 'npx electron .'" -ForegroundColor Yellow
    npx electron @electronArgs
}
Pop-Location

# ---------------------------------------------------------------------------
# STEP 4: Cleanup on exit
# ---------------------------------------------------------------------------
Write-Host "`nShutting down..." -ForegroundColor Red
if ($viteJob) {
    Stop-Job $viteJob -ErrorAction SilentlyContinue
    Remove-Job $viteJob -ErrorAction SilentlyContinue
}
if ($monitorProcess) {
    try {
        if (-not $monitorProcess.HasExited) {
            Stop-Process -Id $monitorProcess.Id -Force -ErrorAction SilentlyContinue
        }
    }
    catch { }
}
Write-Host "Script-owned background processes stopped (global processes left untouched)." -ForegroundColor Green
[switch]$Monitor,
[switch]$SafeMode
)

try {
    if ($PSPrivateMetadata -and $PSPrivateMetadata.JobId) {
        Write-Host "This script is running as a background PowerShell job (JobId: $($PSPrivateMetadata.JobId))." -ForegroundColor Red
        Write-Host "Run it in the foreground (no trailing '&') so Electron can open a desktop window." -ForegroundColor Yellow
        Write-Host "Example: .\start.ps1 -SafeMode" -ForegroundColor Yellow
        exit 1
    }
}
catch { }

$ErrorActionPreference = 'Stop'

trap {
    Write-Host "`nStartup failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ScriptStackTrace) {
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
    }
    exit 1
}

# Default: monitoring on unless explicitly disabled
if (-not $PSBoundParameters.ContainsKey('Monitor')) {
    $Monitor = $true
}

Write-Host "Starting Activity Monitor..." -ForegroundColor Cyan

# Root of the repository
$projectRoot = $PSScriptRoot

# Submission structure: components are directly in project root
$fypRoot = $projectRoot
$backendComponent = Join-Path $projectRoot 'activity-monitoring'
$electronDir = Join-Path $projectRoot 'user-interface\electron'
$frontendDir = Join-Path $electronDir 'frontend'
$pythonBackend = Join-Path $projectRoot 'activity-monitoring\python_backend'

if (-not (Test-Path $electronDir)) {
    Write-Host "Electron directory not found at $electronDir. Aborting." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $pythonBackend)) {
    Write-Host "Python backend directory not found at $pythonBackend. Aborting." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $backendComponent)) {
    Write-Host "Backend component directory not found at $backendComponent. Aborting." -ForegroundColor Red
    exit 1
}

Write-Host "Project Root: $projectRoot" -ForegroundColor DarkGray
Write-Host "Electron Dir: $electronDir" -ForegroundColor DarkGray
Write-Host "Python Backend: $pythonBackend" -ForegroundColor DarkGray
Write-Host "Backend Component: $backendComponent" -ForegroundColor DarkGray

$monitorProcess = $null

# ---------------------------------------------------------------------------
# STEP 0: Run backend tests and abort on failure
# ---------------------------------------------------------------------------
Write-Host "`nRunning backend tests..." -ForegroundColor Yellow
Push-Location $backendComponent
try {
    python -m unittest discover -s tests -v
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Backend tests failed. Startup aborted." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "Backend tests passed." -ForegroundColor Green
}
finally {
    Pop-Location
}

# ---------------------------------------------------------------------------
# Optional: seed database
# ---------------------------------------------------------------------------
if ($Seed) {
    Write-Host "`nSeeding database (reset_and_seed.py)..." -ForegroundColor Yellow
    Push-Location $pythonBackend
    try {
        python reset_and_seed.py
    }
    finally {
        Pop-Location
    }
}

# ---------------------------------------------------------------------------
# Helper: Wait for a TCP port to be responsive
# ---------------------------------------------------------------------------
function Wait-Port {
    param(
        [int]$Port = 5173,
        [int]$TimeoutSeconds = 20
    )
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
            $wait = $async.AsyncWaitHandle.WaitOne(1000)
            if ($wait -and $client.Connected) {
                $client.Close()
                return $true
            }
            $client.Close()
        }
        catch { }
    }
    return $false
}

function Stop-ProjectProcesses {
    param(
        [string]$ProjectRoot,
        [string]$FypRoot,
        [string]$ElectronDir,
        [string]$PythonBackend
    )

    $patterns = @($ProjectRoot, $FypRoot, $ElectronDir, $PythonBackend) |
    Where-Object { $_ } |
    ForEach-Object { $_.ToLower() }

    # Do not kill node.exe here; VS Code integrated terminal relies on Node host processes.
    $candidateNames = @('electron.exe', 'python.exe')
    $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $candidateNames -contains $_.Name.ToLower() }

    foreach ($proc in $processes) {
        $cmd = [string]$proc.CommandLine
        $exe = [string]$proc.ExecutablePath
        $haystack = (($cmd + ' ' + $exe).ToLower())

        $isProjectOwned = $false
        foreach ($p in $patterns) {
            if ($haystack -like "*$p*") {
                $isProjectOwned = $true
                break
            }
        }

        if ($isProjectOwned) {
            try {
                Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
            }
            catch { }
        }
    }
}

# ---------------------------------------------------------------------------
# STEP 1: Clean existing processes
# ---------------------------------------------------------------------------
Write-Host "`nCleaning existing processes..." -ForegroundColor Yellow
Stop-ProjectProcesses -ProjectRoot $projectRoot -FypRoot $fypRoot -ElectronDir $electronDir -PythonBackend $pythonBackend
Start-Sleep -Seconds 1

# ---------------------------------------------------------------------------
# Optional: start monitoring backend (src.main) for tracking + API on :5000
# ---------------------------------------------------------------------------
if ($Monitor) {
    Write-Host "`nStarting monitoring backend (src.main on port 5000)..." -ForegroundColor Green
    try {
        $monitorProcess = Start-Process -FilePath "python" -ArgumentList "-m", "src.main" -WorkingDirectory $pythonBackend -PassThru
        Start-Sleep -Seconds 2
        if ($monitorProcess -and -not $monitorProcess.HasExited) {
            Write-Host "Monitoring backend started (PID: $($monitorProcess.Id))." -ForegroundColor DarkGray
        }
        elseif ($monitorProcess) {
            Write-Host "Monitoring backend exited immediately (PID: $($monitorProcess.Id)). Startup will continue." -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "Failed to start monitoring backend: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "Continuing startup without monitor process." -ForegroundColor Yellow
        $monitorProcess = $null
    }
}

# ---------------------------------------------------------------------------
# STEP 2: Optionally start Vite dev server
# ---------------------------------------------------------------------------
$viteJob = $null
if (Test-Path $frontendDir) {
    # Prefer production build if present
    $distIndex = Join-Path $frontendDir 'dist\index.html'
    if (Test-Path $distIndex) {
        Write-Host "`nProduction build found; skipping Vite dev server." -ForegroundColor Green
        $env:SKIP_DEV = '1'
    }
    else {
        Write-Host "`nFrontend found. Starting Vite dev server..." -ForegroundColor Green
        if (-not (Test-Path (Join-Path $frontendDir 'node_modules'))) {
            Write-Host "Installing frontend dependencies (npm install)..." -ForegroundColor Yellow
            Push-Location $frontendDir
            npm install | Out-Null
            Pop-Location
        }
        $viteJob = Start-Job -InitializationScript { $ErrorActionPreference = 'Stop' } -ScriptBlock {
            Set-Location $using:frontendDir
            npm run dev
        }
        Write-Host "Waiting for dev server (checking ports 5173-5175)..." -ForegroundColor Yellow
        $devServerUp = $false
        foreach ($port in 5173, 5174, 5175) {
            if (Wait-Port -Port $port -TimeoutSeconds 8) {
                Write-Host "Dev server is up on port $port." -ForegroundColor Green
                $devServerUp = $true
                break
            }
        }
        if (-not $devServerUp) {
            Write-Host "Dev server did not respond; Electron may fail to load dev UI." -ForegroundColor Red
        }
    }
}
else {
    Write-Host "`nNo frontend directory found; launching Electron without Vite." -ForegroundColor Yellow
    $env:SKIP_DEV = '1'
}

# ---------------------------------------------------------------------------
# STEP 3: Start Electron (will spawn Python backend internally)
# ---------------------------------------------------------------------------
Write-Host "`nStarting Electron app from '$electronDir'..." -ForegroundColor Green
$env:DEVTOOLS = '1'  # Enable DevTools for demo
Push-Location $electronDir
if (-not (Test-Path (Join-Path $electronDir 'package.json'))) {
    Write-Host "No package.json found in $electronDir. Cannot start Electron." -ForegroundColor Red
    Pop-Location
    exit 1
}
if (-not (Test-Path (Join-Path $electronDir 'node_modules'))) {
    Write-Host "Installing Electron dependencies (npm install)..." -ForegroundColor Yellow
    npm install | Out-Null
}

# In some VS Code integrated terminal environments, npm/electron wrapper env vars
# can prevent GUI startup. Launch electron directly for consistent behavior.
if ($env:ELECTRON_RUN_AS_NODE) {
    Write-Host "Clearing ELECTRON_RUN_AS_NODE for GUI startup." -ForegroundColor DarkGray
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
}

$electronCmd = Join-Path $electronDir 'node_modules\.bin\electron.cmd'
if (-not (Test-Path $electronCmd)) {
    Write-Host "Local Electron binary not found; reinstalling dependencies..." -ForegroundColor Yellow
    npm install | Out-Null
}

$electronArgs = @('.')
if ($SafeMode) {
    Write-Host "Safe mode enabled: launching Electron with GPU acceleration disabled." -ForegroundColor Yellow
    $electronArgs += @('--disable-gpu', '--disable-software-rasterizer')
}

if (Test-Path $electronCmd) {
    Write-Host "Launching Electron directly via local binary..." -ForegroundColor DarkGray
    & $electronCmd @electronArgs
}
else {
    Write-Host "Local binary still missing; using fallback 'npx electron .'" -ForegroundColor Yellow
    npx electron @electronArgs
}
Pop-Location

# ---------------------------------------------------------------------------
# STEP 4: Cleanup on exit
# ---------------------------------------------------------------------------
Write-Host "`nShutting down..." -ForegroundColor Red
if ($viteJob) {
    Stop-Job $viteJob -ErrorAction SilentlyContinue
    Remove-Job $viteJob -ErrorAction SilentlyContinue
}
if ($monitorProcess) {
    try {
        if (-not $monitorProcess.HasExited) {
            Stop-Process -Id $monitorProcess.Id -Force -ErrorAction SilentlyContinue
        }
    }
    catch { }
}
Write-Host "Script-owned background processes stopped (global processes left untouched)." -ForegroundColor Green
[switch]$Monitor,
[switch]$SafeMode
)

try {
    if ($PSPrivateMetadata -and $PSPrivateMetadata.JobId) {
        Write-Host "This script is running as a background PowerShell job (JobId: $($PSPrivateMetadata.JobId))." -ForegroundColor Red
        Write-Host "Run it in the foreground (no trailing '&') so Electron can open a desktop window." -ForegroundColor Yellow
        Write-Host "Example: .\start.ps1 -SafeMode" -ForegroundColor Yellow
        exit 1
    }
}
catch { }

$ErrorActionPreference = 'Stop'

trap {
    Write-Host "`nStartup failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ScriptStackTrace) {
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
    }
    exit 1
}

# Default: monitoring on unless explicitly disabled
if (-not $PSBoundParameters.ContainsKey('Monitor')) {
    $Monitor = $true
}

Write-Host "Starting Activity Monitor..." -ForegroundColor Cyan

# Root of the repository
$projectRoot = $PSScriptRoot

# Submission structure: components are directly in project root
$fypRoot = $projectRoot
$backendComponent = Join-Path $projectRoot 'activity-monitoring'
$electronDir = Join-Path $projectRoot 'user-interface\electron'
$frontendDir = Join-Path $electronDir 'frontend'
$pythonBackend = Join-Path $projectRoot 'activity-monitoring\python_backend'

if (-not (Test-Path $electronDir)) {
    Write-Host "Electron directory not found at $electronDir. Aborting." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $pythonBackend)) {
    Write-Host "Python backend directory not found at $pythonBackend. Aborting." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $backendComponent)) {
    Write-Host "Backend component directory not found at $backendComponent. Aborting." -ForegroundColor Red
    exit 1
}

Write-Host "Project Root: $projectRoot" -ForegroundColor DarkGray
Write-Host "Electron Dir: $electronDir" -ForegroundColor DarkGray
Write-Host "Python Backend: $pythonBackend" -ForegroundColor DarkGray
Write-Host "Backend Component: $backendComponent" -ForegroundColor DarkGray

$monitorProcess = $null

# ---------------------------------------------------------------------------
# STEP 0: Run backend tests and abort on failure
# ---------------------------------------------------------------------------
Write-Host "`nRunning backend tests..." -ForegroundColor Yellow
Push-Location $backendComponent
try {
    python -m unittest discover -s tests -v
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Backend tests failed. Startup aborted." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "Backend tests passed." -ForegroundColor Green
}
finally {
    Pop-Location
}

# ---------------------------------------------------------------------------
# Optional: seed database
# ---------------------------------------------------------------------------
if ($Seed) {
    Write-Host "`nSeeding database (reset_and_seed.py)..." -ForegroundColor Yellow
    Push-Location $pythonBackend
    try {
        python reset_and_seed.py
    }
    finally {
        Pop-Location
    }
}

# ---------------------------------------------------------------------------
# Helper: Wait for a TCP port to be responsive
# ---------------------------------------------------------------------------
function Wait-Port {
    param(
        [int]$Port = 5173,
        [int]$TimeoutSeconds = 20
    )
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
            $wait = $async.AsyncWaitHandle.WaitOne(1000)
            if ($wait -and $client.Connected) {
                $client.Close()
                return $true
            }
            $client.Close()
        }
        catch { }
    }
    return $false
}

function Stop-ProjectProcesses {
    param(
        [string]$ProjectRoot,
        [string]$FypRoot,
        [string]$ElectronDir,
        [string]$PythonBackend
    )

    $patterns = @($ProjectRoot, $FypRoot, $ElectronDir, $PythonBackend) |
    Where-Object { $_ } |
    ForEach-Object { $_.ToLower() }

    # Do not kill node.exe here; VS Code integrated terminal relies on Node host processes.
    $candidateNames = @('electron.exe', 'python.exe')
    $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $candidateNames -contains $_.Name.ToLower() }

    foreach ($proc in $processes) {
        $cmd = [string]$proc.CommandLine
        $exe = [string]$proc.ExecutablePath
        $haystack = (($cmd + ' ' + $exe).ToLower())

        $isProjectOwned = $false
        foreach ($p in $patterns) {
            if ($haystack -like "*$p*") {
                $isProjectOwned = $true
                break
            }
        }

        if ($isProjectOwned) {
            try {
                Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
            }
            catch { }
        }
    }
}

# ---------------------------------------------------------------------------
# STEP 1: Clean existing processes
# ---------------------------------------------------------------------------
Write-Host "`nCleaning existing processes..." -ForegroundColor Yellow
Stop-ProjectProcesses -ProjectRoot $projectRoot -FypRoot $fypRoot -ElectronDir $electronDir -PythonBackend $pythonBackend
Start-Sleep -Seconds 1

# ---------------------------------------------------------------------------
# Optional: start monitoring backend (src.main) for tracking + API on :5000
# ---------------------------------------------------------------------------
if ($Monitor) {
    Write-Host "`nStarting monitoring backend (src.main on port 5000)..." -ForegroundColor Green
    try {
        $monitorProcess = Start-Process -FilePath "python" -ArgumentList "-m", "src.main" -WorkingDirectory $pythonBackend -PassThru
        Start-Sleep -Seconds 2
        if ($monitorProcess -and -not $monitorProcess.HasExited) {
            Write-Host "Monitoring backend started (PID: $($monitorProcess.Id))." -ForegroundColor DarkGray
        }
        elseif ($monitorProcess) {
            Write-Host "Monitoring backend exited immediately (PID: $($monitorProcess.Id)). Startup will continue." -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "Failed to start monitoring backend: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "Continuing startup without monitor process." -ForegroundColor Yellow
        $monitorProcess = $null
    }
}

# ---------------------------------------------------------------------------
# STEP 2: Optionally start Vite dev server
# ---------------------------------------------------------------------------
$viteJob = $null
if (Test-Path $frontendDir) {
    # Prefer production build if present
    $distIndex = Join-Path $frontendDir 'dist\index.html'
    if (Test-Path $distIndex) {
        Write-Host "`nProduction build found; skipping Vite dev server." -ForegroundColor Green
        $env:SKIP_DEV = '1'
    }
    else {
        Write-Host "`nFrontend found. Starting Vite dev server..." -ForegroundColor Green
        if (-not (Test-Path (Join-Path $frontendDir 'node_modules'))) {
            Write-Host "Installing frontend dependencies (npm install)..." -ForegroundColor Yellow
            Push-Location $frontendDir
            npm install | Out-Null
            Pop-Location
        }
        $viteJob = Start-Job -InitializationScript { $ErrorActionPreference = 'Stop' } -ScriptBlock {
            Set-Location $using:frontendDir
            npm run dev
        }
        Write-Host "Waiting for dev server (checking ports 5173-5175)..." -ForegroundColor Yellow
        $devServerUp = $false
        foreach ($port in 5173, 5174, 5175) {
            if (Wait-Port -Port $port -TimeoutSeconds 8) {
                Write-Host "Dev server is up on port $port." -ForegroundColor Green
                $devServerUp = $true
                break
            }
        }
        if (-not $devServerUp) {
            Write-Host "Dev server did not respond; Electron may fail to load dev UI." -ForegroundColor Red
        }
    }
}
else {
    Write-Host "`nNo frontend directory found; launching Electron without Vite." -ForegroundColor Yellow
    $env:SKIP_DEV = '1'
}

# ---------------------------------------------------------------------------
# STEP 3: Start Electron (will spawn Python backend internally)
# ---------------------------------------------------------------------------
Write-Host "`nStarting Electron app from '$electronDir'..." -ForegroundColor Green
$env:DEVTOOLS = '1'  # Enable DevTools for demo
Push-Location $electronDir
if (-not (Test-Path (Join-Path $electronDir 'package.json'))) {
    Write-Host "No package.json found in $electronDir. Cannot start Electron." -ForegroundColor Red
    Pop-Location
    exit 1
}
if (-not (Test-Path (Join-Path $electronDir 'node_modules'))) {
    Write-Host "Installing Electron dependencies (npm install)..." -ForegroundColor Yellow
    npm install | Out-Null
}

# In some VS Code integrated terminal environments, npm/electron wrapper env vars
# can prevent GUI startup. Launch electron directly for consistent behavior.
if ($env:ELECTRON_RUN_AS_NODE) {
    Write-Host "Clearing ELECTRON_RUN_AS_NODE for GUI startup." -ForegroundColor DarkGray
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
}

$electronCmd = Join-Path $electronDir 'node_modules\.bin\electron.cmd'
if (-not (Test-Path $electronCmd)) {
    Write-Host "Local Electron binary not found; reinstalling dependencies..." -ForegroundColor Yellow
    npm install | Out-Null
}

$electronArgs = @('.')
if ($SafeMode) {
    Write-Host "Safe mode enabled: launching Electron with GPU acceleration disabled." -ForegroundColor Yellow
    $electronArgs += @('--disable-gpu', '--disable-software-rasterizer')
}

if (Test-Path $electronCmd) {
    Write-Host "Launching Electron directly via local binary..." -ForegroundColor DarkGray
    & $electronCmd @electronArgs
}
else {
    Write-Host "Local binary still missing; using fallback 'npx electron .'" -ForegroundColor Yellow
    npx electron @electronArgs
}
Pop-Location

# ---------------------------------------------------------------------------
# STEP 4: Cleanup on exit
# ---------------------------------------------------------------------------
Write-Host "`nShutting down..." -ForegroundColor Red
if ($viteJob) {
    Stop-Job $viteJob -ErrorAction SilentlyContinue
    Remove-Job $viteJob -ErrorAction SilentlyContinue
}
if ($monitorProcess) {
    try {
        if (-not $monitorProcess.HasExited) {
            Stop-Process -Id $monitorProcess.Id -Force -ErrorAction SilentlyContinue
        }
    }
    catch { }
}
Write-Host "Script-owned background processes stopped (global processes left untouched)." -ForegroundColor Green
[switch]$Monitor,
[switch]$SafeMode
)

try {
    if ($PSPrivateMetadata -and $PSPrivateMetadata.JobId) {
        Write-Host "This script is running as a background PowerShell job (JobId: $($PSPrivateMetadata.JobId))." -ForegroundColor Red
        Write-Host "Run it in the foreground (no trailing '&') so Electron can open a desktop window." -ForegroundColor Yellow
        Write-Host "Example: .\start.ps1 -SafeMode" -ForegroundColor Yellow
        exit 1
    }
}
catch { }

$ErrorActionPreference = 'Stop'

trap {
    Write-Host "`nStartup failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ScriptStackTrace) {
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
    }
    exit 1
}

# Default: monitoring on unless explicitly disabled
if (-not $PSBoundParameters.ContainsKey('Monitor')) {
    $Monitor = $true
}

Write-Host "Starting Activity Monitor..." -ForegroundColor Cyan

# Root of the repository
$projectRoot = $PSScriptRoot

# Submission structure: components are directly in project root
$fypRoot = $projectRoot
$backendComponent = Join-Path $projectRoot 'activity-monitoring'
$electronDir = Join-Path $projectRoot 'user-interface\electron'
$frontendDir = Join-Path $electronDir 'frontend'
$pythonBackend = Join-Path $projectRoot 'activity-monitoring\python_backend'

if (-not (Test-Path $electronDir)) {
    Write-Host "Electron directory not found at $electronDir. Aborting." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $pythonBackend)) {
    Write-Host "Python backend directory not found at $pythonBackend. Aborting." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $backendComponent)) {
    Write-Host "Backend component directory not found at $backendComponent. Aborting." -ForegroundColor Red
    exit 1
}

Write-Host "Project Root: $projectRoot" -ForegroundColor DarkGray
Write-Host "Electron Dir: $electronDir" -ForegroundColor DarkGray
Write-Host "Python Backend: $pythonBackend" -ForegroundColor DarkGray
Write-Host "Backend Component: $backendComponent" -ForegroundColor DarkGray

$monitorProcess = $null

# ---------------------------------------------------------------------------
# STEP 0: Run backend tests and abort on failure
# ---------------------------------------------------------------------------
Write-Host "`nRunning backend tests..." -ForegroundColor Yellow
Push-Location $backendComponent
try {
    python -m unittest discover -s tests -v
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Backend tests failed. Startup aborted." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "Backend tests passed." -ForegroundColor Green
}
finally {
    Pop-Location
}

# ---------------------------------------------------------------------------
# Optional: seed database
# ---------------------------------------------------------------------------
if ($Seed) {
    Write-Host "`nSeeding database (reset_and_seed.py)..." -ForegroundColor Yellow
    Push-Location $pythonBackend
    try {
        python reset_and_seed.py
    }
    finally {
        Pop-Location
    }
}

# ---------------------------------------------------------------------------
# Helper: Wait for a TCP port to be responsive
# ---------------------------------------------------------------------------
function Wait-Port {
    param(
        [int]$Port = 5173,
        [int]$TimeoutSeconds = 20
    )
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
            $wait = $async.AsyncWaitHandle.WaitOne(1000)
            if ($wait -and $client.Connected) {
                $client.Close()
                return $true
            }
            $client.Close()
        }
        catch { }
    }
    return $false
}

function Stop-ProjectProcesses {
    param(
        [string]$ProjectRoot,
        [string]$FypRoot,
        [string]$ElectronDir,
        [string]$PythonBackend
    )

    $patterns = @($ProjectRoot, $FypRoot, $ElectronDir, $PythonBackend) |
    Where-Object { $_ } |
    ForEach-Object { $_.ToLower() }

    # Do not kill node.exe here; VS Code integrated terminal relies on Node host processes.
    $candidateNames = @('electron.exe', 'python.exe')
    $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $candidateNames -contains $_.Name.ToLower() }

    foreach ($proc in $processes) {
        $cmd = [string]$proc.CommandLine
        $exe = [string]$proc.ExecutablePath
        $haystack = (($cmd + ' ' + $exe).ToLower())

        $isProjectOwned = $false
        foreach ($p in $patterns) {
            if ($haystack -like "*$p*") {
                $isProjectOwned = $true
                break
            }
        }

        if ($isProjectOwned) {
            try {
                Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
            }
            catch { }
        }
    }
}

# ---------------------------------------------------------------------------
# STEP 1: Clean existing processes
# ---------------------------------------------------------------------------
Write-Host "`nCleaning existing processes..." -ForegroundColor Yellow
Stop-ProjectProcesses -ProjectRoot $projectRoot -FypRoot $fypRoot -ElectronDir $electronDir -PythonBackend $pythonBackend
Start-Sleep -Seconds 1

# ---------------------------------------------------------------------------
# Optional: start monitoring backend (src.main) for tracking + API on :5000
# ---------------------------------------------------------------------------
if ($Monitor) {
    Write-Host "`nStarting monitoring backend (src.main on port 5000)..." -ForegroundColor Green
    try {
        $monitorProcess = Start-Process -FilePath "python" -ArgumentList "-m", "src.main" -WorkingDirectory $pythonBackend -PassThru
        Start-Sleep -Seconds 2
        if ($monitorProcess -and -not $monitorProcess.HasExited) {
            Write-Host "Monitoring backend started (PID: $($monitorProcess.Id))." -ForegroundColor DarkGray
        }
        elseif ($monitorProcess) {
            Write-Host "Monitoring backend exited immediately (PID: $($monitorProcess.Id)). Startup will continue." -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "Failed to start monitoring backend: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "Continuing startup without monitor process." -ForegroundColor Yellow
        $monitorProcess = $null
    }
}

# ---------------------------------------------------------------------------
# STEP 2: Optionally start Vite dev server
# ---------------------------------------------------------------------------
$viteJob = $null
if (Test-Path $frontendDir) {
    # Prefer production build if present
    $distIndex = Join-Path $frontendDir 'dist\index.html'
    if (Test-Path $distIndex) {
        Write-Host "`nProduction build found; skipping Vite dev server." -ForegroundColor Green
        $env:SKIP_DEV = '1'
    }
    else {
        Write-Host "`nFrontend found. Starting Vite dev server..." -ForegroundColor Green
        if (-not (Test-Path (Join-Path $frontendDir 'node_modules'))) {
            Write-Host "Installing frontend dependencies (npm install)..." -ForegroundColor Yellow
            Push-Location $frontendDir
            npm install | Out-Null
            Pop-Location
        }
        $viteJob = Start-Job -InitializationScript { $ErrorActionPreference = 'Stop' } -ScriptBlock {
            Set-Location $using:frontendDir
            npm run dev
        }
        Write-Host "Waiting for dev server (checking ports 5173-5175)..." -ForegroundColor Yellow
        $devServerUp = $false
        foreach ($port in 5173, 5174, 5175) {
            if (Wait-Port -Port $port -TimeoutSeconds 8) {
                Write-Host "Dev server is up on port $port." -ForegroundColor Green
                $devServerUp = $true
                break
            }
        }
        if (-not $devServerUp) {
            Write-Host "Dev server did not respond; Electron may fail to load dev UI." -ForegroundColor Red
        }
    }
}
else {
    Write-Host "`nNo frontend directory found; launching Electron without Vite." -ForegroundColor Yellow
    $env:SKIP_DEV = '1'
}

# ---------------------------------------------------------------------------
# STEP 3: Start Electron (will spawn Python backend internally)
# ---------------------------------------------------------------------------
Write-Host "`nStarting Electron app from '$electronDir'..." -ForegroundColor Green
$env:DEVTOOLS = '1'  # Enable DevTools for demo
Push-Location $electronDir
if (-not (Test-Path (Join-Path $electronDir 'package.json'))) {
    Write-Host "No package.json found in $electronDir. Cannot start Electron." -ForegroundColor Red
    Pop-Location
    exit 1
}
if (-not (Test-Path (Join-Path $electronDir 'node_modules'))) {
    Write-Host "Installing Electron dependencies (npm install)..." -ForegroundColor Yellow
    npm install | Out-Null
}

# In some VS Code integrated terminal environments, npm/electron wrapper env vars
# can prevent GUI startup. Launch electron directly for consistent behavior.
if ($env:ELECTRON_RUN_AS_NODE) {
    Write-Host "Clearing ELECTRON_RUN_AS_NODE for GUI startup." -ForegroundColor DarkGray
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
}

$electronCmd = Join-Path $electronDir 'node_modules\.bin\electron.cmd'
if (-not (Test-Path $electronCmd)) {
    Write-Host "Local Electron binary not found; reinstalling dependencies..." -ForegroundColor Yellow
    npm install | Out-Null
}

$electronArgs = @('.')
if ($SafeMode) {
    Write-Host "Safe mode enabled: launching Electron with GPU acceleration disabled." -ForegroundColor Yellow
    $electronArgs += @('--disable-gpu', '--disable-software-rasterizer')
}

if (Test-Path $electronCmd) {
    Write-Host "Launching Electron directly via local binary..." -ForegroundColor DarkGray
    & $electronCmd @electronArgs
}
else {
    Write-Host "Local binary still missing; using fallback 'npx electron .'" -ForegroundColor Yellow
    npx electron @electronArgs
}
Pop-Location

# ---------------------------------------------------------------------------
# STEP 4: Cleanup on exit
# ---------------------------------------------------------------------------
Write-Host "`nShutting down..." -ForegroundColor Red
if ($viteJob) {
    Stop-Job $viteJob -ErrorAction SilentlyContinue
    Remove-Job $viteJob -ErrorAction SilentlyContinue
}
if ($monitorProcess) {
    try {
        if (-not $monitorProcess.HasExited) {
            Stop-Process -Id $monitorProcess.Id -Force -ErrorAction SilentlyContinue
        }
    }
    catch { }
}
Write-Host "Script-owned background processes stopped (global processes left untouched)." -ForegroundColor Green
[switch]$Monitor,
[switch]$SafeMode
)

try {
    if ($PSPrivateMetadata -and $PSPrivateMetadata.JobId) {
        Write-Host "This script is running as a background PowerShell job (JobId: $($PSPrivateMetadata.JobId))." -ForegroundColor Red
        Write-Host "Run it in the foreground (no trailing '&') so Electron can open a desktop window." -ForegroundColor Yellow
        Write-Host "Example: .\start.ps1 -SafeMode" -ForegroundColor Yellow
        exit 1
    }
}
catch { }

$ErrorActionPreference = 'Stop'

trap {
    Write-Host "`nStartup failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ScriptStackTrace) {
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
    }
    exit 1
}

# Default: monitoring on unless explicitly disabled
if (-not $PSBoundParameters.ContainsKey('Monitor')) {
    $Monitor = $true
}

Write-Host "Starting Activity Monitor..." -ForegroundColor Cyan

# Root of the repository
$projectRoot = $PSScriptRoot

# Submission structure: components are directly in project root
$fypRoot = $projectRoot
$backendComponent = Join-Path $projectRoot 'activity-monitoring'
$electronDir = Join-Path $projectRoot 'user-interface\electron'
$frontendDir = Join-Path $electronDir 'frontend'
$pythonBackend = Join-Path $projectRoot 'activity-monitoring\python_backend'

if (-not (Test-Path $electronDir)) {
    Write-Host "Electron directory not found at $electronDir. Aborting." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $pythonBackend)) {
    Write-Host "Python backend directory not found at $pythonBackend. Aborting." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $backendComponent)) {
    Write-Host "Backend component directory not found at $backendComponent. Aborting." -ForegroundColor Red
    exit 1
}

Write-Host "Project Root: $projectRoot" -ForegroundColor DarkGray
Write-Host "Electron Dir: $electronDir" -ForegroundColor DarkGray
Write-Host "Python Backend: $pythonBackend" -ForegroundColor DarkGray
Write-Host "Backend Component: $backendComponent" -ForegroundColor DarkGray

$monitorProcess = $null

# ---------------------------------------------------------------------------
# STEP 0: Run backend tests and abort on failure
# ---------------------------------------------------------------------------
Write-Host "`nRunning backend tests..." -ForegroundColor Yellow
Push-Location $backendComponent
try {
    python -m unittest discover -s tests -v
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Backend tests failed. Startup aborted." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "Backend tests passed." -ForegroundColor Green
}
finally {
    Pop-Location
}

# ---------------------------------------------------------------------------
# Optional: seed database
# ---------------------------------------------------------------------------
if ($Seed) {
    Write-Host "`nSeeding database (reset_and_seed.py)..." -ForegroundColor Yellow
    Push-Location $pythonBackend
    try {
        python reset_and_seed.py
    }
    finally {
        Pop-Location
    }
}

# ---------------------------------------------------------------------------
# Helper: Wait for a TCP port to be responsive
# ---------------------------------------------------------------------------
function Wait-Port {
    param(
        [int]$Port = 5173,
        [int]$TimeoutSeconds = 20
    )
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
            $wait = $async.AsyncWaitHandle.WaitOne(1000)
            if ($wait -and $client.Connected) {
                $client.Close()
                return $true
            }
            $client.Close()
        }
        catch { }
    }
    return $false
}

function Stop-ProjectProcesses {
    param(
        [string]$ProjectRoot,
        [string]$FypRoot,
        [string]$ElectronDir,
        [string]$PythonBackend
    )

    $patterns = @($ProjectRoot, $FypRoot, $ElectronDir, $PythonBackend) |
    Where-Object { $_ } |
    ForEach-Object { $_.ToLower() }

    # Do not kill node.exe here; VS Code integrated terminal relies on Node host processes.
    $candidateNames = @('electron.exe', 'python.exe')
    $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $candidateNames -contains $_.Name.ToLower() }

    foreach ($proc in $processes) {
        $cmd = [string]$proc.CommandLine
        $exe = [string]$proc.ExecutablePath
        $haystack = (($cmd + ' ' + $exe).ToLower())

        $isProjectOwned = $false
        foreach ($p in $patterns) {
            if ($haystack -like "*$p*") {
                $isProjectOwned = $true
                break
            }
        }

        if ($isProjectOwned) {
            try {
                Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
            }
            catch { }
        }
    }
}

# ---------------------------------------------------------------------------
# STEP 1: Clean existing processes
# ---------------------------------------------------------------------------
Write-Host "`nCleaning existing processes..." -ForegroundColor Yellow
Stop-ProjectProcesses -ProjectRoot $projectRoot -FypRoot $fypRoot -ElectronDir $electronDir -PythonBackend $pythonBackend
Start-Sleep -Seconds 1

# ---------------------------------------------------------------------------
# Optional: start monitoring backend (src.main) for tracking + API on :5000
# ---------------------------------------------------------------------------
if ($Monitor) {
    Write-Host "`nStarting monitoring backend (src.main on port 5000)..." -ForegroundColor Green
    try {
        $monitorProcess = Start-Process -FilePath "python" -ArgumentList "-m", "src.main" -WorkingDirectory $pythonBackend -PassThru
        Start-Sleep -Seconds 2
        if ($monitorProcess -and -not $monitorProcess.HasExited) {
            Write-Host "Monitoring backend started (PID: $($monitorProcess.Id))." -ForegroundColor DarkGray
        }
        elseif ($monitorProcess) {
            Write-Host "Monitoring backend exited immediately (PID: $($monitorProcess.Id)). Startup will continue." -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "Failed to start monitoring backend: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "Continuing startup without monitor process." -ForegroundColor Yellow
        $monitorProcess = $null
    }
}

# ---------------------------------------------------------------------------
# STEP 2: Optionally start Vite dev server
# ---------------------------------------------------------------------------
$viteJob = $null
if (Test-Path $frontendDir) {
    # Prefer production build if present
    $distIndex = Join-Path $frontendDir 'dist\index.html'
    if (Test-Path $distIndex) {
        Write-Host "`nProduction build found; skipping Vite dev server." -ForegroundColor Green
        $env:SKIP_DEV = '1'
    }
    else {
        Write-Host "`nFrontend found. Starting Vite dev server..." -ForegroundColor Green
        if (-not (Test-Path (Join-Path $frontendDir 'node_modules'))) {
            Write-Host "Installing frontend dependencies (npm install)..." -ForegroundColor Yellow
            Push-Location $frontendDir
            npm install | Out-Null
            Pop-Location
        }
        $viteJob = Start-Job -InitializationScript { $ErrorActionPreference = 'Stop' } -ScriptBlock {
            Set-Location $using:frontendDir
            npm run dev
        }
        Write-Host "Waiting for dev server (checking ports 5173-5175)..." -ForegroundColor Yellow
        $devServerUp = $false
        foreach ($port in 5173, 5174, 5175) {
            if (Wait-Port -Port $port -TimeoutSeconds 8) {
                Write-Host "Dev server is up on port $port." -ForegroundColor Green
                $devServerUp = $true
                break
            }
        }
        if (-not $devServerUp) {
            Write-Host "Dev server did not respond; Electron may fail to load dev UI." -ForegroundColor Red
        }
    }
}
else {
    Write-Host "`nNo frontend directory found; launching Electron without Vite." -ForegroundColor Yellow
    $env:SKIP_DEV = '1'
}

# ---------------------------------------------------------------------------
# STEP 3: Start Electron (will spawn Python backend internally)
# ---------------------------------------------------------------------------
Write-Host "`nStarting Electron app from '$electronDir'..." -ForegroundColor Green
$env:DEVTOOLS = '1'  # Enable DevTools for demo
Push-Location $electronDir
if (-not (Test-Path (Join-Path $electronDir 'package.json'))) {
    Write-Host "No package.json found in $electronDir. Cannot start Electron." -ForegroundColor Red
    Pop-Location
    exit 1
}
if (-not (Test-Path (Join-Path $electronDir 'node_modules'))) {
    Write-Host "Installing Electron dependencies (npm install)..." -ForegroundColor Yellow
    npm install | Out-Null
}

# In some VS Code integrated terminal environments, npm/electron wrapper env vars
# can prevent GUI startup. Launch electron directly for consistent behavior.
if ($env:ELECTRON_RUN_AS_NODE) {
    Write-Host "Clearing ELECTRON_RUN_AS_NODE for GUI startup." -ForegroundColor DarkGray
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
}

$electronCmd = Join-Path $electronDir 'node_modules\.bin\electron.cmd'
if (-not (Test-Path $electronCmd)) {
    Write-Host "Local Electron binary not found; reinstalling dependencies..." -ForegroundColor Yellow
    npm install | Out-Null
}

$electronArgs = @('.')
if ($SafeMode) {
    Write-Host "Safe mode enabled: launching Electron with GPU acceleration disabled." -ForegroundColor Yellow
    $electronArgs += @('--disable-gpu', '--disable-software-rasterizer')
}

if (Test-Path $electronCmd) {
    Write-Host "Launching Electron directly via local binary..." -ForegroundColor DarkGray
    & $electronCmd @electronArgs
}
else {
    Write-Host "Local binary still missing; using fallback 'npx electron .'" -ForegroundColor Yellow
    npx electron @electronArgs
}
Pop-Location

# ---------------------------------------------------------------------------
# STEP 4: Cleanup on exit
# ---------------------------------------------------------------------------
Write-Host "`nShutting down..." -ForegroundColor Red
if ($viteJob) {
    Stop-Job $viteJob -ErrorAction SilentlyContinue
    Remove-Job $viteJob -ErrorAction SilentlyContinue
}
if ($monitorProcess) {
    try {
        if (-not $monitorProcess.HasExited) {
            Stop-Process -Id $monitorProcess.Id -Force -ErrorAction SilentlyContinue
        }
    }
    catch { }
}
Write-Host "Script-owned background processes stopped (global processes left untouched)." -ForegroundColor Green
[switch]$Monitor,
[switch]$SafeMode
)

try {
    if ($PSPrivateMetadata -and $PSPrivateMetadata.JobId) {
        Write-Host "This script is running as a background PowerShell job (JobId: $($PSPrivateMetadata.JobId))." -ForegroundColor Red
        Write-Host "Run it in the foreground (no trailing '&') so Electron can open a desktop window." -ForegroundColor Yellow
        Write-Host "Example: .\start.ps1 -SafeMode" -ForegroundColor Yellow
        exit 1
    }
}
catch { }

$ErrorActionPreference = 'Stop'

trap {
    Write-Host "`nStartup failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ScriptStackTrace) {
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
    }
    exit 1
}

# Default: monitoring on unless explicitly disabled
if (-not $PSBoundParameters.ContainsKey('Monitor')) {
    $Monitor = $true
}

Write-Host "Starting Activity Monitor..." -ForegroundColor Cyan

# Root of the repository
$projectRoot = $PSScriptRoot

# Submission structure: components are directly in project root
$fypRoot = $projectRoot
$backendComponent = Join-Path $projectRoot 'activity-monitoring'
$electronDir = Join-Path $projectRoot 'user-interface\electron'
$frontendDir = Join-Path $electronDir 'frontend'
$pythonBackend = Join-Path $projectRoot 'activity-monitoring\python_backend'

if (-not (Test-Path $electronDir)) {
    Write-Host "Electron directory not found at $electronDir. Aborting." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $pythonBackend)) {
    Write-Host "Python backend directory not found at $pythonBackend. Aborting." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $backendComponent)) {
    Write-Host "Backend component directory not found at $backendComponent. Aborting." -ForegroundColor Red
    exit 1
}

Write-Host "Project Root: $projectRoot" -ForegroundColor DarkGray
Write-Host "Electron Dir: $electronDir" -ForegroundColor DarkGray
Write-Host "Python Backend: $pythonBackend" -ForegroundColor DarkGray
Write-Host "Backend Component: $backendComponent" -ForegroundColor DarkGray

$monitorProcess = $null

# ---------------------------------------------------------------------------
# STEP 0: Run backend tests and abort on failure
# ---------------------------------------------------------------------------
Write-Host "`nRunning backend tests..." -ForegroundColor Yellow
Push-Location $backendComponent
try {
    python -m unittest discover -s tests -v
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Backend tests failed. Startup aborted." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "Backend tests passed." -ForegroundColor Green
}
finally {
    Pop-Location
}

# ---------------------------------------------------------------------------
# Optional: seed database
# ---------------------------------------------------------------------------
if ($Seed) {
    Write-Host "`nSeeding database (reset_and_seed.py)..." -ForegroundColor Yellow
    Push-Location $pythonBackend
    try {
        python reset_and_seed.py
    }
    finally {
        Pop-Location
    }
}

# ---------------------------------------------------------------------------
# Helper: Wait for a TCP port to be responsive
# ---------------------------------------------------------------------------
function Wait-Port {
    param(
        [int]$Port = 5173,
        [int]$TimeoutSeconds = 20
    )
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
            $wait = $async.AsyncWaitHandle.WaitOne(1000)
            if ($wait -and $client.Connected) {
                $client.Close()
                return $true
            }
            $client.Close()
        }
        catch { }
    }
    return $false
}

function Stop-ProjectProcesses {
    param(
        [string]$ProjectRoot,
        [string]$FypRoot,
        [string]$ElectronDir,
        [string]$PythonBackend
    )

    $patterns = @($ProjectRoot, $FypRoot, $ElectronDir, $PythonBackend) |
    Where-Object { $_ } |
    ForEach-Object { $_.ToLower() }

    # Do not kill node.exe here; VS Code integrated terminal relies on Node host processes.
    $candidateNames = @('electron.exe', 'python.exe')
    $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $candidateNames -contains $_.Name.ToLower() }

    foreach ($proc in $processes) {
        $cmd = [string]$proc.CommandLine
        $exe = [string]$proc.ExecutablePath
        $haystack = (($cmd + ' ' + $exe).ToLower())

        $isProjectOwned = $false
        foreach ($p in $patterns) {
            if ($haystack -like "*$p*") {
                $isProjectOwned = $true
                break
            }
        }

        if ($isProjectOwned) {
            try {
                Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
            }
            catch { }
        }
    }
}

# ---------------------------------------------------------------------------
# STEP 1: Clean existing processes
# ---------------------------------------------------------------------------
Write-Host "`nCleaning existing processes..." -ForegroundColor Yellow
Stop-ProjectProcesses -ProjectRoot $projectRoot -FypRoot $fypRoot -ElectronDir $electronDir -PythonBackend $pythonBackend
Start-Sleep -Seconds 1

# ---------------------------------------------------------------------------
# Optional: start monitoring backend (src.main) for tracking + API on :5000
# ---------------------------------------------------------------------------
if ($Monitor) {
    Write-Host "`nStarting monitoring backend (src.main on port 5000)..." -ForegroundColor Green
    try {
        $monitorProcess = Start-Process -FilePath "python" -ArgumentList "-m", "src.main" -WorkingDirectory $pythonBackend -PassThru
        Start-Sleep -Seconds 2
        if ($monitorProcess -and -not $monitorProcess.HasExited) {
            Write-Host "Monitoring backend started (PID: $($monitorProcess.Id))." -ForegroundColor DarkGray
        }
        elseif ($monitorProcess) {
            Write-Host "Monitoring backend exited immediately (PID: $($monitorProcess.Id)). Startup will continue." -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "Failed to start monitoring backend: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "Continuing startup without monitor process." -ForegroundColor Yellow
        $monitorProcess = $null
    }
}

# ---------------------------------------------------------------------------
# STEP 2: Optionally start Vite dev server
# ---------------------------------------------------------------------------
$viteJob = $null
if (Test-Path $frontendDir) {
    # Prefer production build if present
    $distIndex = Join-Path $frontendDir 'dist\index.html'
    if (Test-Path $distIndex) {
        Write-Host "`nProduction build found; skipping Vite dev server." -ForegroundColor Green
        $env:SKIP_DEV = '1'
    }
    else {
        Write-Host "`nFrontend found. Starting Vite dev server..." -ForegroundColor Green
        if (-not (Test-Path (Join-Path $frontendDir 'node_modules'))) {
            Write-Host "Installing frontend dependencies (npm install)..." -ForegroundColor Yellow
            Push-Location $frontendDir
            npm install | Out-Null
            Pop-Location
        }
        $viteJob = Start-Job -InitializationScript { $ErrorActionPreference = 'Stop' } -ScriptBlock {
            Set-Location $using:frontendDir
            npm run dev
        }
        Write-Host "Waiting for dev server (checking ports 5173-5175)..." -ForegroundColor Yellow
        $devServerUp = $false
        foreach ($port in 5173, 5174, 5175) {
            if (Wait-Port -Port $port -TimeoutSeconds 8) {
                Write-Host "Dev server is up on port $port." -ForegroundColor Green
                $devServerUp = $true
                break
            }
        }
        if (-not $devServerUp) {
            Write-Host "Dev server did not respond; Electron may fail to load dev UI." -ForegroundColor Red
        }
    }
}
else {
    Write-Host "`nNo frontend directory found; launching Electron without Vite." -ForegroundColor Yellow
    $env:SKIP_DEV = '1'
}

# ---------------------------------------------------------------------------
# STEP 3: Start Electron (will spawn Python backend internally)
# ---------------------------------------------------------------------------
Write-Host "`nStarting Electron app from '$electronDir'..." -ForegroundColor Green
$env:DEVTOOLS = '1'  # Enable DevTools for demo
Push-Location $electronDir
if (-not (Test-Path (Join-Path $electronDir 'package.json'))) {
    Write-Host "No package.json found in $electronDir. Cannot start Electron." -ForegroundColor Red
    Pop-Location
    exit 1
}
if (-not (Test-Path (Join-Path $electronDir 'node_modules'))) {
    Write-Host "Installing Electron dependencies (npm install)..." -ForegroundColor Yellow
    npm install | Out-Null
}

# In some VS Code integrated terminal environments, npm/electron wrapper env vars
# can prevent GUI startup. Launch electron directly for consistent behavior.
if ($env:ELECTRON_RUN_AS_NODE) {
    Write-Host "Clearing ELECTRON_RUN_AS_NODE for GUI startup." -ForegroundColor DarkGray
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
}

$electronCmd = Join-Path $electronDir 'node_modules\.bin\electron.cmd'
if (-not (Test-Path $electronCmd)) {
    Write-Host "Local Electron binary not found; reinstalling dependencies..." -ForegroundColor Yellow
    npm install | Out-Null
}

$electronArgs = @('.')
if ($SafeMode) {
    Write-Host "Safe mode enabled: launching Electron with GPU acceleration disabled." -ForegroundColor Yellow
    $electronArgs += @('--disable-gpu', '--disable-software-rasterizer')
}

if (Test-Path $electronCmd) {
    Write-Host "Launching Electron directly via local binary..." -ForegroundColor DarkGray
    & $electronCmd @electronArgs
}
else {
    Write-Host "Local binary still missing; using fallback 'npx electron .'" -ForegroundColor Yellow
    npx electron @electronArgs
}
Pop-Location

# ---------------------------------------------------------------------------
# STEP 4: Cleanup on exit
# ---------------------------------------------------------------------------
Write-Host "`nShutting down..." -ForegroundColor Red
if ($viteJob) {
    Stop-Job $viteJob -ErrorAction SilentlyContinue
    Remove-Job $viteJob -ErrorAction SilentlyContinue
}
if ($monitorProcess) {
    try {
        if (-not $monitorProcess.HasExited) {
            Stop-Process -Id $monitorProcess.Id -Force -ErrorAction SilentlyContinue
        }
    }
    catch { }
}
Write-Host "Script-owned background processes stopped (global processes left untouched)." -ForegroundColor Green
[switch]$Monitor,
[switch]$SafeMode
)

try {
    if ($PSPrivateMetadata -and $PSPrivateMetadata.JobId) {
        Write-Host "This script is running as a background PowerShell job (JobId: $($PSPrivateMetadata.JobId))." -ForegroundColor Red
        Write-Host "Run it in the foreground (no trailing '&') so Electron can open a desktop window." -ForegroundColor Yellow
        Write-Host "Example: .\start.ps1 -SafeMode" -ForegroundColor Yellow
        exit 1
    }
}
catch { }

$ErrorActionPreference = 'Stop'

trap {
    Write-Host "`nStartup failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ScriptStackTrace) {
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
    }
    exit 1
}

# Default: monitoring on unless explicitly disabled
if (-not $PSBoundParameters.ContainsKey('Monitor')) {
    $Monitor = $true
}

Write-Host "Starting Activity Monitor..." -ForegroundColor Cyan

# Root of the repository
$projectRoot = $PSScriptRoot

# Submission structure: components are directly in project root
$fypRoot = $projectRoot
$backendComponent = Join-Path $projectRoot 'activity-monitoring'
$electronDir = Join-Path $projectRoot 'user-interface\electron'
$frontendDir = Join-Path $electronDir 'frontend'
$pythonBackend = Join-Path $projectRoot 'activity-monitoring\python_backend'

if (-not (Test-Path $electronDir)) {
    Write-Host "Electron directory not found at $electronDir. Aborting." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $pythonBackend)) {
    Write-Host "Python backend directory not found at $pythonBackend. Aborting." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $backendComponent)) {
    Write-Host "Backend component directory not found at $backendComponent. Aborting." -ForegroundColor Red
    exit 1
}

Write-Host "Project Root: $projectRoot" -ForegroundColor DarkGray
Write-Host "Electron Dir: $electronDir" -ForegroundColor DarkGray
Write-Host "Python Backend: $pythonBackend" -ForegroundColor DarkGray
Write-Host "Backend Component: $backendComponent" -ForegroundColor DarkGray

$monitorProcess = $null

# ---------------------------------------------------------------------------
# STEP 0: Run backend tests and abort on failure
# ---------------------------------------------------------------------------
Write-Host "`nRunning backend tests..." -ForegroundColor Yellow
Push-Location $backendComponent
try {
    python -m unittest discover -s tests -v
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Backend tests failed. Startup aborted." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "Backend tests passed." -ForegroundColor Green
}
finally {
    Pop-Location
}

# ---------------------------------------------------------------------------
# Optional: seed database
# ---------------------------------------------------------------------------
if ($Seed) {
    Write-Host "`nSeeding database (reset_and_seed.py)..." -ForegroundColor Yellow
    Push-Location $pythonBackend
    try {
        python reset_and_seed.py
    }
    finally {
        Pop-Location
    }
}

# ---------------------------------------------------------------------------
# Helper: Wait for a TCP port to be responsive
# ---------------------------------------------------------------------------
function Wait-Port {
    param(
        [int]$Port = 5173,
        [int]$TimeoutSeconds = 20
    )
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
            $wait = $async.AsyncWaitHandle.WaitOne(1000)
            if ($wait -and $client.Connected) {
                $client.Close()
                return $true
            }
            $client.Close()
        }
        catch { }
    }
    return $false
}

function Stop-ProjectProcesses {
    param(
        [string]$ProjectRoot,
        [string]$FypRoot,
        [string]$ElectronDir,
        [string]$PythonBackend
    )

    $patterns = @($ProjectRoot, $FypRoot, $ElectronDir, $PythonBackend) |
    Where-Object { $_ } |
    ForEach-Object { $_.ToLower() }

    # Do not kill node.exe here; VS Code integrated terminal relies on Node host processes.
    $candidateNames = @('electron.exe', 'python.exe')
    $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $candidateNames -contains $_.Name.ToLower() }

    foreach ($proc in $processes) {
        $cmd = [string]$proc.CommandLine
        $exe = [string]$proc.ExecutablePath
        $haystack = (($cmd + ' ' + $exe).ToLower())

        $isProjectOwned = $false
        foreach ($p in $patterns) {
            if ($haystack -like "*$p*") {
                $isProjectOwned = $true
                break
            }
        }

        if ($isProjectOwned) {
            try {
                Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
            }
            catch { }
        }
    }
}

# ---------------------------------------------------------------------------
# STEP 1: Clean existing processes
# ---------------------------------------------------------------------------
Write-Host "`nCleaning existing processes..." -ForegroundColor Yellow
Stop-ProjectProcesses -ProjectRoot $projectRoot -FypRoot $fypRoot -ElectronDir $electronDir -PythonBackend $pythonBackend
Start-Sleep -Seconds 1

# ---------------------------------------------------------------------------
# Optional: start monitoring backend (src.main) for tracking + API on :5000
# ---------------------------------------------------------------------------
if ($Monitor) {
    Write-Host "`nStarting monitoring backend (src.main on port 5000)..." -ForegroundColor Green
    try {
        $monitorProcess = Start-Process -FilePath "python" -ArgumentList "-m", "src.main" -WorkingDirectory $pythonBackend -PassThru
        Start-Sleep -Seconds 2
        if ($monitorProcess -and -not $monitorProcess.HasExited) {
            Write-Host "Monitoring backend started (PID: $($monitorProcess.Id))." -ForegroundColor DarkGray
        }
        elseif ($monitorProcess) {
            Write-Host "Monitoring backend exited immediately (PID: $($monitorProcess.Id)). Startup will continue." -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "Failed to start monitoring backend: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "Continuing startup without monitor process." -ForegroundColor Yellow
        $monitorProcess = $null
    }
}

# ---------------------------------------------------------------------------
# STEP 2: Optionally start Vite dev server
# ---------------------------------------------------------------------------
$viteJob = $null
if (Test-Path $frontendDir) {
    # Prefer production build if present
    $distIndex = Join-Path $frontendDir 'dist\index.html'
    if (Test-Path $distIndex) {
        Write-Host "`nProduction build found; skipping Vite dev server." -ForegroundColor Green
        $env:SKIP_DEV = '1'
    }
    else {
        Write-Host "`nFrontend found. Starting Vite dev server..." -ForegroundColor Green
        if (-not (Test-Path (Join-Path $frontendDir 'node_modules'))) {
            Write-Host "Installing frontend dependencies (npm install)..." -ForegroundColor Yellow
            Push-Location $frontendDir
            npm install | Out-Null
            Pop-Location
        }
        $viteJob = Start-Job -InitializationScript { $ErrorActionPreference = 'Stop' } -ScriptBlock {
            Set-Location $using:frontendDir
            npm run dev
        }
        Write-Host "Waiting for dev server (checking ports 5173-5175)..." -ForegroundColor Yellow
        $devServerUp = $false
        foreach ($port in 5173, 5174, 5175) {
            if (Wait-Port -Port $port -TimeoutSeconds 8) {
                Write-Host "Dev server is up on port $port." -ForegroundColor Green
                $devServerUp = $true
                break
            }
        }
        if (-not $devServerUp) {
            Write-Host "Dev server did not respond; Electron may fail to load dev UI." -ForegroundColor Red
        }
    }
}
else {
    Write-Host "`nNo frontend directory found; launching Electron without Vite." -ForegroundColor Yellow
    $env:SKIP_DEV = '1'
}

# ---------------------------------------------------------------------------
# STEP 3: Start Electron (will spawn Python backend internally)
# ---------------------------------------------------------------------------
Write-Host "`nStarting Electron app from '$electronDir'..." -ForegroundColor Green
$env:DEVTOOLS = '1'  # Enable DevTools for demo
Push-Location $electronDir
if (-not (Test-Path (Join-Path $electronDir 'package.json'))) {
    Write-Host "No package.json found in $electronDir. Cannot start Electron." -ForegroundColor Red
    Pop-Location
    exit 1
}
if (-not (Test-Path (Join-Path $electronDir 'node_modules'))) {
    Write-Host "Installing Electron dependencies (npm install)..." -ForegroundColor Yellow
    npm install | Out-Null
}

# In some VS Code integrated terminal environments, npm/electron wrapper env vars
# can prevent GUI startup. Launch electron directly for consistent behavior.
if ($env:ELECTRON_RUN_AS_NODE) {
    Write-Host "Clearing ELECTRON_RUN_AS_NODE for GUI startup." -ForegroundColor DarkGray
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
}

$electronCmd = Join-Path $electronDir 'node_modules\.bin\electron.cmd'
if (-not (Test-Path $electronCmd)) {
    Write-Host "Local Electron binary not found; reinstalling dependencies..." -ForegroundColor Yellow
    npm install | Out-Null
}

$electronArgs = @('.')
if ($SafeMode) {
    Write-Host "Safe mode enabled: launching Electron with GPU acceleration disabled." -ForegroundColor Yellow
    $electronArgs += @('--disable-gpu', '--disable-software-rasterizer')
}

if (Test-Path $electronCmd) {
    Write-Host "Launching Electron directly via local binary..." -ForegroundColor DarkGray
    & $electronCmd @electronArgs
}
else {
    Write-Host "Local binary still missing; using fallback 'npx electron .'" -ForegroundColor Yellow
    npx electron @electronArgs
}
Pop-Location

# ---------------------------------------------------------------------------
# STEP 4: Cleanup on exit
# ---------------------------------------------------------------------------
Write-Host "`nShutting down..." -ForegroundColor Red
if ($viteJob) {
    Stop-Job $viteJob -ErrorAction SilentlyContinue
    Remove-Job $viteJob -ErrorAction SilentlyContinue
}
if ($monitorProcess) {
    try {
        if (-not $monitorProcess.HasExited) {
            Stop-Process -Id $monitorProcess.Id -Force -ErrorAction SilentlyContinue
        }
    }
    catch { }
}
Write-Host "Script-owned background processes stopped (global processes left untouched)." -ForegroundColor Green
