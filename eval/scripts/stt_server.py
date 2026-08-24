"""Local Whisper STT for Voxara. POST raw WAV to /transcribe?lang=es"""
from __future__ import annotations

import json
import os
import tempfile
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

PORT = int(os.environ.get("STT_PORT", "3031"))
MODEL_NAME = os.environ.get("STT_MODEL", "small")

_model = None
_model_label = ""


def load_model():
    global _model, _model_label
    if _model is not None:
        return _model
    from faster_whisper import WhisperModel

    try:
        _model = WhisperModel(MODEL_NAME, device="cuda", compute_type="float16")
        _model_label = f"{MODEL_NAME} cuda float16"
        print(f"[stt] loaded {_model_label}", flush=True)
        return _model
    except Exception as exc:
        print(f"[stt] CUDA failed ({exc}); using small on CPU", flush=True)
        _model = WhisperModel("small", device="cpu", compute_type="int8")
        _model_label = "small cpu int8"
        print(f"[stt] loaded {_model_label}", flush=True)
        return _model


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
