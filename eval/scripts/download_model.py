"""Descarga S2 Pro Q6_K + tokenizer (Fish Audio Research License).

Fallback universal para download_model.ps1 / download_model.sh: usa la API de
huggingface_hub, que funciona aunque la CLI `hf` no esté en el PATH.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Cuantizado por defecto: q8_0 (mejor calidad, cabe en >=8 GB VRAM).
# Para GPUs pequeñas: S2_GGUF=s2-pro-q6_k.gguf python download_model.py
DEFAULT_QUANT = "s2-pro-q8_0.gguf"


def main() -> int:
    dest = Path(__file__).resolve().parents[1] / "models" / "s2-pro-gguf"
    dest.mkdir(parents=True, exist_ok=True)
    print(f"Destino: {dest}", flush=True)

    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        print("Instalando huggingface_hub (pip)...", flush=True)
        import subprocess

        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "-U", "huggingface_hub"]
        )
        from huggingface_hub import hf_hub_download

    repo = "rodrigomt/s2-pro-gguf"
    gguf_name = os.environ.get("S2_GGUF") or DEFAULT_QUANT
    files = [gguf_name, "tokenizer.json", "LICENSE.md", "README.md"]
    for filename in files:
        print(f"Descargando {filename}...", flush=True)
        hf_hub_download(repo_id=repo, filename=filename, local_dir=str(dest))

    gguf = dest / gguf_name
    if not gguf.exists():
        print(f"ERROR: no está {gguf}", file=sys.stderr)
        return 1
    print(f"OK — modelo listo: {gguf}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
