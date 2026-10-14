#!/usr/bin/env bash
set -euo pipefail
EVAL="$(cd "$(dirname "$0")/.." && pwd)"
MODEL="$EVAL/models/s2-pro-gguf"
TOK="$MODEL/tokenizer.json"

# Elige el mejor cuantizado disponible (q8_0 = más calidad en >=8 GB VRAM;
# q6_k para 6-8 GB). Se puede forzar con S2_GGUF=s2-pro-q6_k.gguf.
GGUF_NAME="${S2_GGUF:-}"
if [[ -z "$GGUF_NAME" ]]; then
  for cand in s2-pro-q8_0.gguf s2-pro-q6_k.gguf; do
    if [[ -f "$MODEL/$cand" ]]; then GGUF_NAME="$cand"; break; fi
  done
fi
GGUF="$MODEL/$GGUF_NAME"

if [[ -z "$GGUF_NAME" || ! -f "$GGUF" || ! -f "$TOK" ]]; then
  echo "Falta el modelo. Ejecuta: ./eval/scripts/download_model.sh" >&2
  exit 1
fi
echo "Modelo: $GGUF_NAME"

if [[ ! -f "$EVAL/s2.cpp/CMakeLists.txt" ]]; then
  echo "Falta eval/s2.cpp" >&2
  exit 1
fi

echo "Build imagen s2cpp:cuda..."
docker build -f "$EVAL/docker/s2cpp.Dockerfile" -t s2cpp:cuda "$EVAL"

docker rm -f s2eval >/dev/null 2>&1 || true
mkdir -p "$EVAL/out" "$EVAL/refs"

echo "Arrancando s2eval en :3030..."
docker run -d --name s2eval --gpus all \
  -p 3030:3030 \
  -v "$MODEL:/models" \
  -v "$EVAL/refs:/refs" \
  -v "$EVAL/out:/out" \
  s2cpp:cuda \
  --model "/models/$GGUF_NAME" \
  --tokenizer /models/tokenizer.json \
  --cuda 0 \
  --codec-cpu \
  --server --host 0.0.0.0 --port 3030

echo "OK — http://127.0.0.1:3030"
echo "Luego: npm install && npm run dev"
