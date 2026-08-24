# S2 Pro GGUF export

This directory contains the exporter used to convert original Fish Speech S2 Pro
checkpoints into a GGUF file that `s2.cpp` can load.

## Contents

- `unified_export_gguf.py`: exports the S2 Pro transformer and matching codec
  checkpoint into one GGUF file.

The old standalone `llama-quantize` test files were intentionally removed from
this directory. They were not wired into this repository's build and depended on
external llama.cpp tools that are not shipped here.

## Dependencies

Install the Python packages required by the exporter:

```bash
python3 -m pip install numpy torch gguf safetensors
```

## Expected input

`--checkpoint-path` must point to a Fish Speech S2 Pro checkpoint directory with
`config.json` and one supported model weight layout:

```text
s2-pro/
  config.json
  model.safetensors.index.json
  model-00001-of-00002.safetensors
  model-00002-of-00002.safetensors
  codec.pth
  tokenizer.json
```

Single-file `model.safetensors` and `model.pth` checkpoints are also supported.

`--codec-checkpoint-path` must point to the matching `codec.pth` file.

## Export F16 GGUF

From the repository root:

```bash
python3 quantize/unified_export_gguf.py \
  --checkpoint-path s2-pro \
  --codec-checkpoint-path s2-pro/codec.pth \
  --output s2-pro/s2-pro-f16.gguf \
  --out-dtype f16
```

Valid `--out-dtype` values:

- `f16`: recommended base export for normal use
- `f32`: full precision export, larger on disk

The exporter currently supports checkpoints whose `config.json` has:

```json
{
  "model_type": "fish_qwen3_omni"
}
```

## Validate with s2.cpp

Build the Vulkan target and run a short synthesis:

```bash
cmake --build build-vulkan --parallel "$(nproc)"

./build-vulkan/s2 \
  --model s2-pro/s2-pro-f16.gguf \
  --tokenizer s2-pro/tokenizer.json \
  --text "Hello from Vulkan." \
  --output /tmp/s2-vulkan-test.wav \
  --vulkan 0 \
  --gpu-layers -1 \
  --max-tokens 24 \
  --codec-cpu
```

To test the codec on Vulkan too:

```bash
./build-vulkan/s2 \
  --model s2-pro/s2-pro-f16.gguf \
  --tokenizer s2-pro/tokenizer.json \
  --text "Vulkan codec test." \
  --output /tmp/s2-vulkan-codec-test.wav \
  --vulkan 0 \
  --gpu-layers -1 \
  --max-tokens 12 \
  --codec-follow-backend
```

## Quantized variants

This directory no longer vendors a standalone `llama-quantize` copy. If lower
precision variants are needed, use an external ggml/llama.cpp quantization tool
against the exported base GGUF.

Keep codec tensors (`c.*`) in floating point unless the runtime has been
explicitly validated with quantized codec weights.

## Notes

- The codec metadata is hardcoded for the S2 Pro universal codec currently
  supported by this repository.
- The mixed GGUF metadata prefixes (`fish-speech.*` and `fish_speech.*`) are
  intentional and kept for compatibility with the current loader.
- The generated GGUF contains both the autoregressive model and codec tensors.
