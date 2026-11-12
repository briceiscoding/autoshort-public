#!/bin/bash
# AutoShort launcher for macOS (start.bat on Windows): installs what is missing, starts the backend and the front end in
# the background, opens the app in its own window. Logs: logs/. Closing the app window stops everything (stop.sh as a
# fallback). Requirements: Node 22, uv, ffmpeg (brew install node uv ffmpeg), claude on PATH for plan proposals.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd)"
mkdir -p logs projects

fail() { echo "$1"; exit 1; }
for tool in uv node npm ffmpeg ffprobe curl; do
  command -v "$tool" >/dev/null || fail "Missing '$tool': brew install node uv ffmpeg"
done

if [ ! -x server/.venv/bin/python ]; then
  echo "Installing the backend environment..."
  uv venv server/.venv --python 3.12
  uv pip install --python server/.venv/bin/python -r server/requirements.txt
fi
if [ ! -d app/node_modules ]; then
  echo "Installing the front end..."
  (cd app && npm install)
fi
if [ ! -x ai/.venv/bin/python ]; then
  echo "Installing the AI environment (a few GB, only once, see logs/install.log)..."
  uv venv ai/.venv --python 3.12 >> logs/install.log 2>&1
  uv pip install --python ai/.venv/bin/python -r ai/requirements.mac.lock.txt >> logs/install.log 2>&1 \
    || fail "AI environment installation failed, see logs/install.log"
fi

# The backend stops itself (and Vite) when the last app window is closed.
export AUTOSHORT_AUTO_EXIT=1
# Operations not yet implemented on the Apple GPU fall back to the CPU instead of failing.
export PYTORCH_ENABLE_MPS_FALLBACK=1

config() { server/.venv/bin/python -c "import json;print(json.load(open('config.json'))['$1'])"; }
BACKEND_PORT="$(config backendPort)"
FRONT_PORT="$(config frontendPort)"

if ! curl -s -o /dev/null "http://127.0.0.1:$BACKEND_PORT/api/health"; then
  (cd server && nohup .venv/bin/python run_server.py > "$ROOT/logs/backend.log" 2> "$ROOT/logs/backend.err.log" &)
fi
if ! curl -s -o /dev/null "http://127.0.0.1:$FRONT_PORT/"; then
  (cd app && nohup npx vite --port "$FRONT_PORT" --strictPort > "$ROOT/logs/frontend.log" 2>&1 &)
fi

for _ in $(seq 1 60); do
  if curl -s -o /dev/null "http://127.0.0.1:$FRONT_PORT/" && curl -s -o /dev/null "http://127.0.0.1:$BACKEND_PORT/api/health"; then
    URL="http://127.0.0.1:$FRONT_PORT/"
    # Own window (no tabs, no address bar) in Chrome or Edge when installed, the default browser otherwise.
    for browser in "Google Chrome" "Microsoft Edge"; do
      if [ -d "/Applications/$browser.app" ]; then
        open -na "$browser" --args --app="$URL" --window-size=1600,960
        exit 0
      fi
    done
    open "$URL"
    exit 0
  fi
  sleep 1
done
fail "AutoShort did not start, see the logs folder."
