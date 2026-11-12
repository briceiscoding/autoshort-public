@echo off
rem AutoShort launcher: installs what is missing, starts the backend and the front end hidden, opens the browser.
rem Logs: logs\backend.log and logs\frontend.log. Closing the app window stops everything (stop.bat as a fallback).
cd /d "%~dp0"

if not exist "server\.venv\Scripts\python.exe" (
  echo Installing the backend environment...
  uv venv server\.venv --python 3.12 || goto :error
  uv pip install --python server\.venv\Scripts\python.exe -r server\requirements.txt || goto :error
)
if not exist "app\node_modules" (
  echo Installing the front end...
  pushd app
  call npm install || goto :error
  popd
)
if not exist logs mkdir logs
if not exist "ai\.venv\Scripts\python.exe" (
  echo Installing the AI environment ^(GPU, a few GB, only once^)...
  uv venv ai\.venv --python 3.12 >> logs\install.log 2>&1 || goto :error
  uv pip install --python ai\.venv\Scripts\python.exe -r ai\requirements.lock.txt --extra-index-url https://download.pytorch.org/whl/cu126 --index-strategy unsafe-best-match >> logs\install.log 2>&1 || goto :error
)
if not exist projects mkdir projects
rem The backend stops itself (and Vite) when the last app window is closed.
set AUTOSHORT_AUTO_EXIT=1

for /f %%p in ('server\.venv\Scripts\python.exe -c "import json;print(json.load(open('config.json'))['backendPort'])"') do set BACKEND_PORT=%%p
for /f %%p in ('server\.venv\Scripts\python.exe -c "import json;print(json.load(open('config.json'))['frontendPort'])"') do set FRONT_PORT=%%p

curl -s -o nul http://127.0.0.1:%BACKEND_PORT%/api/health || powershell -NoProfile -Command "Start-Process -WindowStyle Hidden -FilePath '%~dp0server\.venv\Scripts\python.exe' -ArgumentList 'run_server.py' -WorkingDirectory '%~dp0server' -RedirectStandardOutput '%~dp0logs\backend.log' -RedirectStandardError '%~dp0logs\backend.err.log'"
curl -s -o nul http://127.0.0.1:%FRONT_PORT%/ || powershell -NoProfile -Command "Start-Process -WindowStyle Hidden -FilePath 'cmd.exe' -ArgumentList '/c npx vite --port %FRONT_PORT% --strictPort > ..\logs\frontend.log 2>&1' -WorkingDirectory '%~dp0app'"

for /l %%i in (1,1,60) do (
  curl -s -o nul http://127.0.0.1:%FRONT_PORT%/ && curl -s -o nul http://127.0.0.1:%BACKEND_PORT%/api/health && goto :open
  timeout /t 1 /nobreak >nul
)
echo AutoShort did not start, see the logs folder.
pause
exit /b 1

:open
rem Own window (no tabs, no address bar), in the usual Chrome profile, else Edge (always on Windows); Firefox has no
rem such window mode.
set URL=http://127.0.0.1:%FRONT_PORT%/
set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe
set EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if not exist "%EDGE%" set EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe
if exist "%CHROME%" (
  start "" "%CHROME%" --app=%URL% --window-size=1600,960
) else if exist "%EDGE%" (
  start "" "%EDGE%" --app=%URL% --window-size=1600,960
) else (
  start "" %URL%
)
exit /b 0

:error
echo Installation failed, see the messages above.
pause
exit /b 1
