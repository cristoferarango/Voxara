#!/usr/bin/env bash
set -euo pipefail
EVAL="$(cd "$(dirname "$0")/.." && pwd)"
MODEL="$EVAL/models/s2-pro-gguf"
GGUF="$MODEL/s2-pro-q6_k.gguf"
TOK="$MODEL/tokenizer.json"

if [[ ! -f "$GGUF" || ! -f "$TOK" ]]; then
  echo "Falta el modelo. Ejecuta: ./eval/scripts/download_model.sh" >&2
  exit 1
fi
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
  --model /models/s2-pro-q6_k.gguf \
  --tokenizer /models/tokenizer.json \
  --cuda 0 \
  --codec-cpu \
  --server --host 0.0.0.0 --port 3030

echo "OK — http://127.0.0.1:3030"
echo "Luego: npm install && npm run dev"
