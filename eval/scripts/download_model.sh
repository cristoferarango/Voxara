#!/usr/bin/env bash
# Descarga S2 Pro Q6_K + tokenizer (Fish Audio Research License — uso personal/investigación)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="$ROOT/eval/models/s2-pro-gguf"
mkdir -p "$DEST"
echo "Destino: $DEST"

PY=python3
command -v python3 >/dev/null 2>&1 || PY=python

# Asegura huggingface_hub y descarga vía API de Python (robusto sin la CLI `hf` en PATH).
"$PY" -m pip install -U "huggingface_hub" >/dev/null 2>&1 || true
"$PY" "$(dirname "$0")/download_model.py"

GGUF_FILE="$(ls "$DEST"/*.gguf 2>/dev/null | head -n 1 || true)"
if [[ -z "$GGUF_FILE" ]]; then
  echo "No se encontró ningún .gguf en $DEST" >&2
  exit 1
fi
echo "OK — modelo listo: $GGUF_FILE"
