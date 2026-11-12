@echo off
rem Stops the AutoShort backend and front end: processes listening on their ports, and any process started from this
rem folder (backend run_server.py, Vite), with their children.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root = (Resolve-Path '.').Path;" ^
  "$c = Get-Content config.json -Raw | ConvertFrom-Json;" ^
  "$ids = @(Get-NetTCPConnection -State Listen -LocalPort $c.backendPort, $c.frontendPort -ErrorAction SilentlyContinue | ForEach-Object OwningProcess);" ^
  "$ids += Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($root) -and $_.CommandLine -match 'run_server\.py|vite' } | ForEach-Object ProcessId;" ^
  "$ids | Where-Object { $_ -gt 0 } | Sort-Object -Unique | ForEach-Object { taskkill /PID $_ /T /F 2>$null | Out-Null }"
echo AutoShort stopped.
