"""Local Whisper STT for Voxara. POST raw WAV to /transcribe?lang=es"""
from __future__ import annotations

import json
import os
import tempfile
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

PORT = int(os.environ.get("STT_PORT", "3031"))
# large-v3-turbo: calidad casi igual a large-v3 y ~8x más rápido. Cabe de sobra
# en 6 GB de VRAM. Alternativas: large-v3 (máxima calidad), medium, small.
MODEL_NAME = os.environ.get("STT_MODEL", "large-v3-turbo")

_model = None
_model_label = ""


def _add_nvidia_dlls():
    """Windows: CTranslate2 carga cuBLAS/cuDNN dinámicamente y no las encuentra
    solo. Las exponemos desde los paquetes pip nvidia-*-cu12."""
    if os.name != "nt":
        return
    try:
        import nvidia
    except ImportError:
        return
    # `nvidia` es un namespace package: __file__ es None, las rutas viven en __path__.
    roots = [Path(p) for p in list(getattr(nvidia, "__path__", []) or [])]
    if not roots and getattr(nvidia, "__file__", None):
        roots = [Path(nvidia.__file__).resolve().parent]
    for root in roots:
        for sub in ("cublas", "cudnn"):
            for cand in (root / sub / "bin", root / sub / "lib"):
                if cand.is_dir():
                    try:
                        os.add_dll_directory(str(cand))
                    except (AttributeError, OSError):
                        pass
                    os.environ["PATH"] = str(cand) + os.pathsep + os.environ.get("PATH", "")


def _patch_pyav_metadata_errors():
    """PyAV reciente eliminó el kwarg `metadata_errors` que faster-whisper
    todavía pasa a av.open(). Lo absorbemos para que la decodificación siga
    funcionando con cualquier versión de PyAV instalada."""
    try:
        import av
    except ImportError:
        return

    original_open = av.open
    if getattr(original_open, "_voxara_patched", False):
        return

    def open_without_metadata_errors(*args, **kwargs):
        kwargs.pop("metadata_errors", None)
        return original_open(*args, **kwargs)

    open_without_metadata_errors._voxara_patched = True
    av.open = open_without_metadata_errors


def load_model():
    global _model, _model_label
    if _model is not None:
        return _model

    _add_nvidia_dlls()
    _patch_pyav_metadata_errors()
    from faster_whisper import WhisperModel

    # GPU primero; si no hay CUDA utilizable, cae a CPU sin dejar el servidor caído.
    attempts = [
        (MODEL_NAME, "cuda", "float16"),
        (MODEL_NAME, "cpu", "int8"),
        ("small", "cpu", "int8"),
    ]
    last_error = None
    for name, device, compute_type in attempts:
        try:
            _model = WhisperModel(name, device=device, compute_type=compute_type)
            _model_label = f"{name} {device} {compute_type}"
            print(f"[stt] loaded {_model_label}", flush=True)
            return _model
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            print(f"[stt] failed {name}/{device}/{compute_type}: {exc}", flush=True)

    raise RuntimeError(f"no se pudo cargar Whisper: {last_error}")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("[stt]", fmt % args, flush=True)


    def _json(self, code, payload):
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path in ("/", "/health"):
            self._json(200, {"ok": True, "model": _model_label or "lazy"})
            return
        self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/transcribe":
            self._json(404, {"ok": False, "error": "not found"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length < 44:
            self._json(400, {"ok": False, "error": "audio vacío"})
            return
        if length > 80 * 1024 * 1024:
            self._json(413, {"ok": False, "error": "audio demasiado grande"})
            return
        body = self.rfile.read(length)
        lang = (parse_qs(parsed.query).get("lang") or ["es"])[0] or "es"
        if lang == "auto":
            lang = None
        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        try:
            tmp.write(body)
            tmp.close()
            model = load_model()
            segments, info = model.transcribe(
                tmp.name,
                language=lang,
                vad_filter=True,
                beam_size=5,
            )
            parts = [seg.text.strip() for seg in segments if seg.text.strip()]
            text = " ".join(parts).strip()
            self._json(
                200,
                {
                    "ok": True,
                    "text": text,
                    "language": getattr(info, "language", lang),
                    "duration": getattr(info, "duration", None),
                    "model": _model_label,
                },
            )
        except Exception as exc:
            traceback.print_exc()
            self._json(500, {"ok": False, "error": str(exc)})
        finally:
            try:
                os.unlink(tmp.name)
            except OSError:
                pass


def main():
    print(f"[stt] listening on http://127.0.0.1:{PORT}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
