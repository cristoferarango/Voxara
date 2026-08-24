#!/usr/bin/env bash
set -euo pipefail
EVAL="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$EVAL/.venv"
PY="$VENV/bin/python"
REQ="$(dirname "$0")/requirements-stt.txt"

if [[ ! -x "$PY" ]]; then
  python3 -m venv "$VENV"
  "$PY" -m pip install -U pip
  "$PY" -m pip install -r "$REQ"
fi

echo "STT en http://127.0.0.1:3031 ..."
exec "$PY" "$(dirname "$0")/stt_server.py"
