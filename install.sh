#!/usr/bin/env bash
# Voxara — instalador rápido (clone → npm → modelo → Docker S2 Pro → UI)
#
# Un solo comando (recomendado):
#   curl -fsSL https://gist.githubusercontent.com/cristoferarango/e57bc3ff03f64184dc84a44a25a5808b/raw/voxara-ios | bash
#
# Desde el repo:
#   curl -fsSL https://raw.githubusercontent.com/cristoferarango/Voxara/main/install.sh | bash
#   ./install.sh
#
# Opciones:
#   --dir PATH       Destino (default: $HOME/Voxara)
#   --skip-model     No descarga el GGUF
#   --skip-docker    No construye ni arranca s2eval
#   --with-stt       Prepara Whisper (Audio → texto)
#   --no-ui          No lanza npm run dev al final (por defecto sí)

set -euo pipefail

REPO_URL="https://github.com/cristoferarango/Voxara.git"
INSTALL_DIR="${VOXARA_DIR:-}"
SKIP_MODEL=0
SKIP_DOCKER=0
WITH_STT=0
START_UI=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) INSTALL_DIR="$2"; shift 2 ;;
    --skip-model) SKIP_MODEL=1; shift ;;
    --skip-docker) SKIP_DOCKER=1; shift ;;
    --with-stt) WITH_STT=1; shift ;;
    --no-ui) START_UI=0; shift ;;
    --start-ui) START_UI=1; shift ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *) echo "Opción desconocida: $1" >&2; exit 1 ;;
  esac
done

step() { printf '\n\033[36m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[32mOK  %s\033[0m\n' "$*"; }
warn() { printf '    \033[33m!   %s\033[0m\n' "$*"; }
die()  { printf '\033[31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

need() {
  command -v "$1" >/dev/null 2>&1 || die "Falta '$1'. $2"
}

is_voxara_root() {
  local d="$1"
  [[ -f "$d/package.json" && -f "$d/eval/s2.cpp/CMakeLists.txt" ]] || return 1
  grep -q '"name"[[:space:]]*:[[:space:]]*"voxara"' "$d/package.json"
}

echo ""
echo "  Voxara — instalador rápido"
echo "  https://corporacionarango.com"
echo "  Modelo S2 Pro: Fish Audio Research License (personal/investigación)"
echo ""

step "Comprobando prerrequisitos"
need git "https://git-scm.com/downloads"
need node "Node.js 18+ https://nodejs.org"
need npm "viene con Node.js"
NODE_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
[[ "$NODE_MAJOR" -ge 18 ]] || die "Node.js 18+ requerido (tienes $(node -v))"
ok "Node $(node -v), npm $(npm -v)"

if [[ "$SKIP_DOCKER" -eq 0 ]]; then
  need docker "Docker con GPU NVIDIA"
  docker info >/dev/null 2>&1 || die "Docker no responde"
  ok "Docker disponible"
  if ! docker info 2>/dev/null | grep -qi nvidia; then
    warn "No se detectó nvidia en docker info; el contenedor puede fallar sin GPU"
  else
    ok "GPU NVIDIA visible para Docker"
  fi
fi

if [[ "$SKIP_MODEL" -eq 0 ]]; then
  if command -v python3 >/dev/null 2>&1; then PY=python3
  elif command -v python >/dev/null 2>&1; then PY=python
  else die "Falta Python 3 (para huggingface_hub)"; fi
  ok "Python listo ($PY)"
fi

step "Preparando el repositorio"
ROOT=""
if is_voxara_root "$(pwd)"; then
  ROOT="$(pwd)"
  ok "Usando repo actual: $ROOT"
else
  [[ -n "$INSTALL_DIR" ]] || INSTALL_DIR="$HOME/Voxara"
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    ROOT="$(cd "$INSTALL_DIR" && pwd)"
    step "Actualizando $ROOT"
    (cd "$ROOT" && git pull --ff-only) || warn "git pull falló; se continúa con la copia local"
  else
    [[ ! -e "$INSTALL_DIR" ]] || die "La carpeta '$INSTALL_DIR' existe pero no es Voxara. Usa --dir"
    step "Clonando $REPO_URL → $INSTALL_DIR"
    git clone "$REPO_URL" "$INSTALL_DIR"
    ROOT="$(cd "$INSTALL_DIR" && pwd)"
  fi
  is_voxara_root "$ROOT" || die "$ROOT no parece Voxara completo"
  ok "Repo en $ROOT"
fi

cd "$ROOT"

step "npm install"
npm install
ok "Dependencias UI instaladas"

if [[ "$SKIP_MODEL" -eq 0 ]]; then
  step "Descargando S2 Pro Q6_K (~varios GB; puede tardar)"
  bash "$ROOT/eval/scripts/download_model.sh"
  ok "Modelo listo"
else
  warn "Omitida descarga del modelo (--skip-model)"
fi

if [[ "$SKIP_DOCKER" -eq 0 ]]; then
  step "Construyendo imagen y arrancando s2eval (:3030)"
  bash "$ROOT/eval/scripts/start_s2.sh"
  ok "Motor S2 Pro en http://127.0.0.1:3030"
else
  warn "Omitido Docker (--skip-docker)"
fi

if [[ "$WITH_STT" -eq 1 ]]; then
  step "Preparando Audio → texto (Whisper)"
  VENV="$ROOT/eval/.venv"
  REQ="$ROOT/eval/scripts/requirements-stt.txt"
  if [[ ! -x "$VENV/bin/python" ]]; then
    "$PY" -m venv "$VENV"
    "$VENV/bin/python" -m pip install -U pip
    "$VENV/bin/python" -m pip install -r "$REQ"
  fi
  ok "STT listo. Arranca con: ./eval/scripts/start_stt.sh"
else
  warn "STT omitido (usa --with-stt para instalar Whisper)"
fi

echo ""
echo "============================================"
echo "  Voxara instalado en:"
echo "  $ROOT"
echo "============================================"
echo ""
echo "  Motor:  http://127.0.0.1:3030"
echo "  UI:     http://127.0.0.1:5173"
echo ""
echo "  Si el motor se queda ocupado: docker restart s2eval"
echo "  Licencias: Apache-2.0 (código) + Fish Audio Research (modelo)"
echo "  https://corporacionarango.com"
echo ""

if [[ "$START_UI" -eq 1 ]]; then
  step "Arrancando UI en http://127.0.0.1:5173 (Ctrl+C para salir)"
  npm run dev
else
  echo "  UI omitida (--no-ui). Arranca con: cd \"$ROOT\" && npm run dev"
  echo ""
fi
