"""Batch S2 Q6_K Spanish tests against local s2.cpp server. Does not load extra GPU models."""
from __future__ import annotations

import json
import time
from pathlib import Path

import requests
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "out"
TEXTS = json.loads((ROOT / "texts" / "pruebas.json").read_text(encoding="utf-8"))
REF = ROOT / "refs" / "qwen_clone_en.wav"
REF_TEXT = "Okay. Yeah. I resent you. I love you. I respect you. But you know what? You blew it! And thanks to you."
URL = "http://127.0.0.1:3030/generate"

JOBS = [
    ("p1_r1", TEXTS["p1_corporativa"]),
    ("p1_r2", TEXTS["p1_corporativa"]),
    ("p1_r3", TEXTS["p1_corporativa"]),
    ("p2_r1", TEXTS["p2_anuncio"]),
    ("p3_r1", TEXTS["p3_cta"]),
    ("p4_r1", TEXTS["p4_emocion"]),
    ("p4_tags_r1", "[pause] Espera... [short pause] esto puede cambiar completamente la forma en que atiendes a tus clientes. [emphasis] Con una sola plataforma, puedes responder, vender y automatizar."),
    ("p5_r1", TEXTS["p5_tecnico"]),
    ("p6_calmado", f"[professional broadcast tone] {TEXTS['p1_corporativa']}"),
    ("p6_energetico", f"[excited] {TEXTS['p2_anuncio']}"),
    ("p6_calido", f"[warm close tone] {TEXTS['p3_cta']}"),
    ("p6_urgente", f"[urgent but natural] {TEXTS['p2_anuncio']}"),
    ("p6_narracion", f"[professional narration] {TEXTS['p4_emocion']}"),
]


def main() -> None:
    OUT.mkdir(exist_ok=True)
    results = []
    for name, text in JOBS:
        dest = OUT / f"s2_q6k_{name}.wav"
        t0 = time.perf_counter()
        with REF.open("rb") as audio:
            r = requests.post(
                URL,
                files={"reference": ("ref.wav", audio, "audio/wav")},
                data={
                    "reference_text": REF_TEXT,
                    "text": text,
                    "params": json.dumps(
                        {
                            "max_new_tokens": 768,
                            "temperature": 0.7,
                            "top_p": 0.8,
                            "top_k": 30,
                        }
                    ),
                },
                timeout=300,
            )
        elapsed = time.perf_counter() - t0
        if r.status_code != 200:
            results.append({"name": name, "error": r.status_code, "body": r.text[:400], "elapsed": elapsed})
            print("FAIL", name, r.status_code, r.text[:200])
            continue
        dest.write_bytes(r.content)
        dur = None
        try:
            data, sr = sf.read(dest)
            dur = float(len(data) / sr)
        except Exception as exc:  # noqa: BLE001
            results.append({"name": name, "error": str(exc), "elapsed": elapsed, "bytes": dest.stat().st_size})
            print("BADWAV", name, exc)
            continue
        rec = {
            "name": name,
            "elapsed_s": round(elapsed, 3),
            "audio_s": round(dur, 3),
            "rtf": round(elapsed / dur, 3) if dur else None,
            "bytes": dest.stat().st_size,
            "path": str(dest),
        }
        results.append(rec)
        print("OK", rec)
        time.sleep(0.5)
    (OUT / "s2_q6k_batch.json").write_text(json.dumps(results, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
