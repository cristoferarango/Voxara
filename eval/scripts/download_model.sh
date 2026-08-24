#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="$ROOT/eval/models/s2-pro-gguf"
mkdir -p "$DEST"
echo "Destino: $DEST"

if ! command -v hf >/dev/null 2>&1 && ! command -v huggingface-cli >/dev/null 2>&1; then
  python3 -m pip install -U "huggingface_hub[cli]"
fi
CLI=hf
command -v hf >/dev/null 2>&1 || CLI=huggingface-cli

"$CLI" download rodrigomt/s2-pro-gguf s2-pro-q6_k.gguf tokenizer.json LICENSE.md README.md --local-dir "$DEST"
test -f "$DEST/s2-pro-q6_k.gguf"
echo "OK — modelo listo: $DEST/s2-pro-q6_k.gguf"
