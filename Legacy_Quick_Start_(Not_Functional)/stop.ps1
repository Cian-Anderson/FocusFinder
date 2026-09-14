# Activity Monitor Cleanup Script
Write-Host "🛑 Stopping Activity Monitor..." -ForegroundColor Red

Get-Process | Where-Object {
    $_.ProcessName -eq 'electron' -or 
    $_.ProcessName -eq 'python' -or 
    $_.ProcessName -eq 'node'
} | Where-Object {
    $_.Path -like "*final-year-project*" -or $_.Path -like "*activity-monitoring-component*"
} | Stop-Process -Force -ErrorAction SilentlyContinue

Start-Sleep -Seconds 1
Write-Host "✅ All processes stopped" -ForegroundColor Green
