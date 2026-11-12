#!/bin/bash
# Stops the AutoShort backend and front end on macOS (stop.bat on Windows): the processes listening on their ports and
# the processes started from this folder (job scripts, Vite).
cd "$(dirname "$0")"
ROOT="$(pwd)"
port() { server/.venv/bin/python -c "import json;print(json.load(open('config.json'))['$1'])"; }
for p in "$(port backendPort)" "$(port frontendPort)"; do
  lsof -nP -t -iTCP:"$p" -sTCP:LISTEN 2>/dev/null | xargs kill -9 2>/dev/null
done
pgrep -f "$ROOT/(server/jobs|app/node_modules)/" | xargs kill -9 2>/dev/null
echo "AutoShort stopped."
