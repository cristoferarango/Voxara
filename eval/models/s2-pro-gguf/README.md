---
license: other
license_name: fish-audio-research-license
license_link: https://huggingface.co/rodrigomt/s2-pro-gguf/blob/main/LICENSE.md
language:
- multilingual
tags:
- text-to-speech
- audio
- fish-speech
- gguf
- tts
- voice-cloning
pipeline_tag: text-to-speech
base_model: fishaudio/s2-pro
---

# S2 Pro — GGUF

> **ALPHA — EXPERIMENTAL**
> The inference engine ([s2.cpp](https://github.com/rodrigomatta/s2.cpp)) is an early-stage, community-built project. Expect rough edges and breaking changes. Not production-ready.

GGUF-quantized weights of [Fish Audio S2 Pro](https://fish.audio), a high-quality multilingual text-to-speech model with voice cloning support, packaged for local inference with [s2.cpp](https://github.com/rodrigomatta/s2.cpp) — a pure C++/GGML engine with no Python dependency.

> **License:** Fish Audio Research License — free for research and non-commercial use. Commercial use requires a separate license from Fish Audio. See [LICENSE.md](LICENSE.md) and [fish.audio](https://fish.audio).

---

## Files

| File | Size |
|---|---|
| `s2-pro-f16.gguf` | 9.3 GB |
| `s2-pro-q8_0.gguf` | 5.3 GB |
| `s2-pro-q6_k.gguf` | 4.3 GB |
| `s2-pro-q5_k_m.gguf` | 3.8 GB |
| `s2-pro-q4_k_m.gguf` | 3.4 GB |
| `s2-pro-q3_k.gguf` | 2.9 GB |
| `s2-pro-q2_k.gguf` | 2.4 GB |
| `tokenizer.json` | 12 MB |

All GGUF files contain both the transformer weights and the audio codec in a single file.

---

## Requirements

- GPU with Vulkan support (AMD/NVIDIA/Intel) **or** CPU with enough RAM
- [s2.cpp](https://github.com/rodrigomatta/s2.cpp) built from source (C++17 + CMake)

### VRAM guide

| VRAM | Recommended |
|---|---|
| ≥ 8 GB | `q8_0` |
| 6–8 GB | `q6_k` |
| 4–6 GB | `q5_k_m` |
| 3–4 GB | `q4_k_m` |
| < 3 GB | `q3_k` / `q2_k` (quality degrades) |
| CPU only | `q4_k_m` or lower (slow) |

---

## Quick start

```bash
# Clone and build s2.cpp
git clone --recurse-submodules https://github.com/rodrigomatta/s2.cpp.git
cd s2.cpp
cmake -B build -DCMAKE_BUILD_TYPE=Release -DS2_VULKAN=ON
cmake --build build --parallel $(nproc)

# Download model files (example with huggingface-cli)
huggingface-cli download rodrigomt/s2-pro-gguf s2-pro-q6_k.gguf tokenizer.json --local-dir .

# Synthesize
./build/s2 \
  -m s2-pro-q6_k.gguf \
  -t tokenizer.json \
  -text "Hello, this is a test." \
  -v 0 \
  -o output.wav
```

### Voice cloning

```bash
./build/s2 \
  -m s2-pro-q6_k.gguf \
  -t tokenizer.json \
  -pa reference.wav \
  -pt "Transcript of the reference audio." \
  -text "Text to synthesize in that voice." \
  -v 0 \
  -o output.wav
```

Reference audio: 5–30 seconds, clean recording, WAV or MP3.

---

## Quantization

The GGUF files in this repository were re-quantized using a modified `llama-quantize` tool with improved quantization routines. 

---

## Model architecture

S2 Pro uses a **Dual-AR** architecture (~4.56B parameters total):

- **Slow-AR** — 36-layer Qwen3 transformer (4.13B params), GQA (32 heads / 8 KV heads), RoPE 1M base, persistent KV cache
- **Fast-AR** — 4-layer transformer (0.42B params) generating 10 acoustic codebook tokens per semantic step
- **Audio codec** — convolutional RVQ encoder/decoder (10 codebooks × 4096 entries)

---

## License

The model weights are licensed under the **Fish Audio Research License**.

- **Research and non-commercial use:** free under this license
- **Commercial use:** requires a separate written license from Fish Audio

Attribution: *"This model is licensed under the Fish Audio Research License, Copyright © 39 AI, INC. All Rights Reserved."*

Full terms: [LICENSE.md](LICENSE.md) · Commercial: [fish.audio](https://fish.audio) · [business@fish.audio](mailto:business@fish.audio)
