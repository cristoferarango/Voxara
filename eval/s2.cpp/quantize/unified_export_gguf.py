"""
Convert Fish Speech S2 Pro checkpoints and codec weights to GGUF.

Author: https://github.com/rodrigomatta
"""
import argparse
import json
import logging
from pathlib import Path
from collections.abc import Callable, Iterator
import numpy as np

# Core dependencies
try:
    import torch
except ModuleNotFoundError:
    raise ModuleNotFoundError("This script requires 'torch' (pip install torch)")

try:
    import gguf
except ModuleNotFoundError:
    raise ModuleNotFoundError("This script requires 'gguf' (pip install gguf)")

# Optional
try:
    from safetensors import safe_open
    has_safetensors = True
except ModuleNotFoundError:
    has_safetensors = False

# =================================================================================
# GGUF Arch Definitions & Configurations
# =================================================================================

DUAL_AR_GGUF_ARCH = "fish-speech"
SUPPORTED_OUT_DTYPES = ("f16", "f32")

TEXT_MODEL_PREFIX = "text_model.model."
AUDIO_DECODER_PREFIX = "audio_decoder."

logger = logging.getLogger(__name__)


def require_path(path: Path, description: str, kind: str) -> Path:
    if not path.exists():
        raise FileNotFoundError(f"{description} not found: {path}")
    if kind == "dir" and not path.is_dir():
        raise FileNotFoundError(f"{description} must be a directory: {path}")
    if kind == "file" and not path.is_file():
        raise FileNotFoundError(f"{description} must be a file: {path}")
    return path


def load_json_file(path: Path, description: str) -> dict:
    try:
        with path.open() as handle:
            return json.load(handle)
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"{description} not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"{description} is not valid JSON: {path} ({exc})") from exc


def load_fish_speech_checkpoint_config(checkpoint_path: Path) -> dict:
    require_path(checkpoint_path, "Checkpoint path", "dir")
    config_path = checkpoint_path / "config.json"
    config = load_json_file(config_path, "Checkpoint config")
    model_type = config.get("model_type")
    if model_type != "fish_qwen3_omni":
        raise ValueError(
            f"Unsupported checkpoint model_type {model_type!r} in {config_path}; "
            "expected 'fish_qwen3_omni'."
        )
    return config

def remap_checkpoint_key(name: str) -> str:
    if name.startswith(TEXT_MODEL_PREFIX):
        return name[len(TEXT_MODEL_PREFIX) :]
    if name.startswith(AUDIO_DECODER_PREFIX):
        suffix = name[len(AUDIO_DECODER_PREFIX) :]
        if suffix.startswith("codebook_embeddings."):
            return suffix
        return "fast_" + suffix
    return name

def convert_tensor(tensor: torch.Tensor, out_dtype: str) -> np.ndarray:
    if out_dtype not in SUPPORTED_OUT_DTYPES:
        raise ValueError(f"Unsupported out_dtype {out_dtype!r}; expected one of {SUPPORTED_OUT_DTYPES}.")
    tensor = tensor.detach().cpu().contiguous()
    if tensor.is_floating_point():
        target_dtype = torch.float16 if out_dtype == "f16" else torch.float32
        tensor = tensor.to(dtype=target_dtype)
    else:
        # Cast unsupported types like bool or uint8 to int32 for GGUF compatibility
        if tensor.dtype in (torch.bool, torch.uint8, torch.int8):
            tensor = tensor.to(dtype=torch.int32)
    return tensor.numpy()

# =================================================================================
# Iterators for Safetensors and PyTorch State Dicts
# =================================================================================

def iter_remapped_checkpoint_tensors(
    checkpoint_path: Path,
    include_tensor: Callable[[str], bool],
) -> Iterator[tuple[str, torch.Tensor]]:
    require_path(checkpoint_path, "Checkpoint path", "dir")

    index_path = checkpoint_path / "model.safetensors.index.json"
    single_path = checkpoint_path / "model.safetensors"
    pth_path = checkpoint_path / "model.pth"

    if index_path.exists() or single_path.exists():
        if not has_safetensors:
            raise ModuleNotFoundError("Safetensors package required to read .safetensors files.")

    if index_path.exists():
        index_data = load_json_file(index_path, "Safetensors index")
        if "weight_map" not in index_data or not isinstance(index_data["weight_map"], dict):
            raise ValueError(f"Safetensors index is missing a valid 'weight_map': {index_path}")
        weight_map = index_data["weight_map"]
        entries = []
        for raw_name, shard_name in weight_map.items():
            remapped_name = remap_checkpoint_key(raw_name)
            if not include_tensor(remapped_name):
                continue
            entries.append((remapped_name, raw_name, checkpoint_path / shard_name))
        entries.sort(key=lambda item: item[0])

        current_shard = None
        current_reader_cm = None
        current_reader = None
        try:
            for remapped_name, raw_name, shard_path in entries:
                if current_shard != shard_path:
                    if current_reader_cm is not None:
                        current_reader_cm.__exit__(None, None, None)
                    current_reader_cm = safe_open(str(shard_path), framework="pt", device="cpu")
                    current_reader = current_reader_cm.__enter__()
                    current_shard = shard_path
                yield remapped_name, current_reader.get_tensor(raw_name)
        finally:
            if current_reader_cm is not None:
                current_reader_cm.__exit__(None, None, None)
        return

    if single_path.exists():
        with safe_open(str(single_path), framework="pt", device="cpu") as reader:
            entries = []
            for raw_name in reader.keys():
                remapped_name = remap_checkpoint_key(raw_name)
                if include_tensor(remapped_name):
                    entries.append((remapped_name, raw_name))
            entries.sort(key=lambda item: item[0])
            for remapped_name, raw_name in entries:
                yield remapped_name, reader.get_tensor(raw_name)
        return

    if pth_path.exists():
        try:
            weights = torch.load(pth_path, map_location="cpu", mmap=True, weights_only=True)
        except Exception as exc:
            raise RuntimeError(f"Failed to load PyTorch model checkpoint: {pth_path}") from exc
        if "state_dict" in weights:
            weights = weights["state_dict"]
        if weights and next(iter(weights.keys())).startswith("model."):
            weights = {k.replace("model.", "", 1): v for k, v in weights.items()}

        entries = []
        for raw_name, tensor in weights.items():
            remapped_name = remap_checkpoint_key(raw_name)
            if include_tensor(remapped_name):
                entries.append((remapped_name, tensor))
        entries.sort(key=lambda item: item[0])
        for remapped_name, tensor in entries:
            yield remapped_name, tensor
        return

    raise FileNotFoundError(f"No model weights found in {checkpoint_path}")


# =================================================================================
# Dual-AR Export Logic
# =================================================================================

class DualARCheckpointConfig:
    def __init__(self, checkpoint_path: Path):
        self.checkpoint_path = checkpoint_path
        config = load_fish_speech_checkpoint_config(checkpoint_path)
        try:
            text_config = config["text_config"]
            audio_decoder_config = config["audio_decoder_config"]
        except KeyError as exc:
            raise KeyError(
                f"Checkpoint config is missing required key {exc.args[0]!r}: "
                f"{checkpoint_path / 'config.json'}"
            ) from exc

        self.model_type = "dual_ar"
        self.vocab_size = int(text_config["vocab_size"])
        self.n_layer = int(text_config["n_layer"])
        self.n_head = int(text_config["n_head"])
        self.n_local_heads = int(text_config.get("n_local_heads", text_config["n_head"]))
        self.head_dim = int(text_config["head_dim"])
        self.dim = int(text_config["dim"])
        self.intermediate_size = int(text_config["intermediate_size"])
        self.rope_base = float(text_config.get("rope_base", 10000.0))
        self.norm_eps = float(text_config.get("norm_eps", 1e-5))
        self.max_seq_len = int(text_config.get("max_seq_len", 2048))
        self.tie_word_embeddings = bool(text_config.get("tie_word_embeddings", True))
        self.attention_qk_norm = bool(text_config.get("attention_qk_norm", False))

        self.num_codebooks = int(audio_decoder_config["num_codebooks"])
        self.codebook_size = int(audio_decoder_config["vocab_size"])
        self.semantic_begin_id = int(config.get("semantic_start_token_id", 0))
        self.semantic_end_id = int(config.get("semantic_end_token_id", 0))
        self.audio_pad_token_id = int(config.get("audio_pad_token_id", 0))
        self.scale_codebook_embeddings = bool(config.get("scale_codebook_embeddings", True))
        self.norm_fastlayer_input = bool(config.get("norm_fastlayer_input", True))

        self.fast_n_layer = int(audio_decoder_config["n_layer"])
        self.fast_n_head = int(audio_decoder_config["n_head"])
        self.fast_n_local_heads = int(audio_decoder_config.get("n_local_heads", audio_decoder_config["n_head"]))
        self.fast_head_dim = int(audio_decoder_config["head_dim"])
        self.fast_dim = int(audio_decoder_config["dim"])
        self.fast_intermediate_size = int(audio_decoder_config["intermediate_size"])
        self.fast_rope_base = float(audio_decoder_config.get("rope_base", 10000.0))
        self.fast_norm_eps = float(audio_decoder_config.get("norm_eps", 1e-5))
        self.fast_max_seq_len = int(audio_decoder_config.get("max_seq_len", audio_decoder_config["num_codebooks"]))
        self.fast_tie_word_embeddings = bool(audio_decoder_config.get("tie_word_embeddings", False))
        self.fast_attention_qk_norm = bool(audio_decoder_config.get("attention_qk_norm", False))
        self.fast_attention_qkv_bias = bool(audio_decoder_config.get("attention_qkv_bias", False))
        self.fast_attention_o_bias = bool(audio_decoder_config.get("attention_o_bias", False))

def _is_dual_ar_tensor(name: str) -> bool:
    return (
        name == "embeddings.weight"
        or name == "codebook_embeddings.weight"
        or name == "norm.weight"
        or name == "output.weight"
        or name.startswith("layers.")
        or name.startswith("fast_")
    )

def inject_dual_ar_metadata(writer: gguf.GGUFWriter, config: DualARCheckpointConfig, file_type):
    writer.add_name("Fish Speech S2 Pro")
    writer.add_basename("fish-speech-s2-pro")
    writer.add_description("Full dual autoregressive semantic transformer exported from Fish Speech S2 Pro")
    writer.add_file_type(file_type)

    # Keep the mixed prefixes for compatibility with the existing C++ loader:
    # `fish-speech.*` is the GGUF arch-scoped namespace the model loader expects,
    # while `fish_speech.*` stores project-specific extension metadata consumed by
    # s2.cpp. Renaming either set would break already-exported models/readers.
    #
    # Standard LLM keys - Note: writer.add_context_length(arch) uses {arch}.context_length
    writer.add_uint32("fish-speech.context_length", config.max_seq_len)
    writer.add_uint32("fish-speech.embedding_length", config.dim)
    writer.add_uint32("fish-speech.feed_forward_length", config.intermediate_size)
    writer.add_uint32("fish-speech.block_count", config.n_layer)
    writer.add_uint32("fish-speech.attention.head_count", config.n_head)
    writer.add_uint32("fish-speech.attention.head_count_kv", config.n_local_heads)
    writer.add_float32("fish-speech.rope.freq_base", config.rope_base)
    writer.add_float32("fish-speech.attention.layer_norm_rms_epsilon", config.norm_eps)
    writer.add_uint32("fish-speech.vocab_size", config.vocab_size)

    writer.add_string("fish_speech.model_type", config.model_type)
    writer.add_uint32("fish_speech.codebook_size", config.codebook_size)
    writer.add_uint32("fish_speech.num_codebooks", config.num_codebooks)
    writer.add_uint32("fish_speech.semantic_begin_id", config.semantic_begin_id)
    writer.add_uint32("fish_speech.semantic_end_id", config.semantic_end_id)
    writer.add_uint32("fish_speech.audio_pad_token_id", config.audio_pad_token_id)
    writer.add_bool("fish_speech.scale_codebook_embeddings", config.scale_codebook_embeddings)
    writer.add_bool("fish_speech.norm_fastlayer_input", config.norm_fastlayer_input)
    writer.add_bool("fish_speech.tie_word_embeddings", config.tie_word_embeddings)
    writer.add_bool("fish_speech.attention_qk_norm", config.attention_qk_norm)

    writer.add_uint32("fish_speech.fast_context_length", config.fast_max_seq_len)
    writer.add_uint32("fish_speech.fast_embedding_length", config.fast_dim)
    writer.add_uint32("fish_speech.fast_feed_forward_length", config.fast_intermediate_size)
    writer.add_uint32("fish_speech.fast_block_count", config.fast_n_layer)
    writer.add_uint32("fish_speech.fast_head_count", config.fast_n_head)
    writer.add_uint32("fish_speech.fast_head_count_kv", config.fast_n_local_heads)
    writer.add_uint32("fish_speech.fast_head_dim", config.fast_head_dim)
    writer.add_float32("fish_speech.fast_rope_freq_base", config.fast_rope_base)
    writer.add_float32("fish_speech.fast_layer_norm_rms_eps", config.fast_norm_eps)
    writer.add_bool("fish_speech.fast_tie_word_embeddings", config.fast_tie_word_embeddings)
    writer.add_bool("fish_speech.fast_attention_qk_norm", config.fast_attention_qk_norm)
    writer.add_bool("fish_speech.fast_attention_qkv_bias", config.fast_attention_qkv_bias)
    writer.add_bool("fish_speech.fast_attention_o_bias", config.fast_attention_o_bias)
    writer.add_bool("fish_speech.fast_project_in", config.fast_dim != config.dim)


# =================================================================================
# Codec (DAC) Export Logic & WeightNorm Unrolling
# =================================================================================

class CodecCheckpointConfig:
    def __init__(self):
        # These values are intentionally hardcoded for the S2-Pro universal codec
        # that s2.cpp currently supports. Keep them in sync with the runtime codec
        # loader unless/until codec-side config loading becomes data-driven.
        self.sample_rate = 44100
        self.hop_length = 512
        self.frame_length = 512
        self.encoder_dim = 64
        self.decoder_dim = 1536
        self.latent_dim = 1024
        self.encoder_rates = (2, 4, 8, 8)
        self.decoder_rates = (8, 8, 4, 2)
        self.encoder_transformer_layers = (0, 0, 0, 4)
        self.decoder_transformer_layers = (4, 0, 0, 0)
        self.quantizer_input_dim = 1024
        self.quantizer_codebook_dim = 8
        self.quantizer_residual_codebooks = 9
        self.quantizer_residual_codebook_size = 1024
        self.quantizer_semantic_codebook_size = 4096
        self.quantizer_downsample_factor = (2, 2)

        self.transformer_block_size = 8192
        self.transformer_n_local_heads = -1
        self.transformer_head_dim = 64
        self.transformer_rope_base = 10000.0
        self.transformer_norm_eps = 1e-5

        self.rvq_transformer_window_size = 128
        self.rvq_transformer_block_size = 2048
        self.rvq_transformer_n_layer = 8
        self.rvq_transformer_n_head = 16
        self.rvq_transformer_n_local_heads = -1
        self.rvq_transformer_head_dim = 64
        self.rvq_transformer_dim = 1024
        self.rvq_transformer_intermediate_size = 3072
        self.rvq_transformer_rope_base = 10000.0
        self.rvq_transformer_norm_eps = 1e-5

def inject_codec_metadata(writer: gguf.GGUFWriter, config: CodecCheckpointConfig):
    # These extension keys are read directly by src/s2_codec.cpp.
    writer.add_uint32("fish_speech.codec.sample_rate", config.sample_rate)
    writer.add_uint32("fish_speech.codec.hop_length", config.hop_length)
    writer.add_uint32("fish_speech.codec.frame_length", config.frame_length)
    writer.add_uint32("fish_speech.codec.encoder_dim", config.encoder_dim)
    writer.add_uint32("fish_speech.codec.decoder_dim", config.decoder_dim)
    writer.add_uint32("fish_speech.codec.latent_dim", config.latent_dim)
    writer.add_array("fish_speech.codec.encoder_rates", config.encoder_rates)
    writer.add_array("fish_speech.codec.decoder_rates", config.decoder_rates)
    writer.add_array("fish_speech.codec.encoder_transformer_layers", config.encoder_transformer_layers)
    writer.add_array("fish_speech.codec.decoder_transformer_layers", config.decoder_transformer_layers)
    writer.add_string("fish_speech.codec.quantizer_type", "downsample_residual_vector_quantize")
    writer.add_uint32("fish_speech.codec.quantizer_input_dim", config.quantizer_input_dim)
    writer.add_uint32("fish_speech.codec.quantizer_codebook_dim", config.quantizer_codebook_dim)
    writer.add_uint32("fish_speech.codec.quantizer_residual_codebooks", config.quantizer_residual_codebooks)
    writer.add_uint32("fish_speech.codec.quantizer_residual_codebook_size", config.quantizer_residual_codebook_size)
    writer.add_uint32("fish_speech.codec.quantizer_semantic_codebook_size", config.quantizer_semantic_codebook_size)
    writer.add_array("fish_speech.codec.quantizer_downsample_factor", config.quantizer_downsample_factor)

    writer.add_uint32("fish_speech.codec.transformer.block_size", config.transformer_block_size)
    writer.add_int32("fish_speech.codec.transformer.n_local_heads", config.transformer_n_local_heads)
    writer.add_uint32("fish_speech.codec.transformer.head_dim", config.transformer_head_dim)
    writer.add_float32("fish_speech.codec.transformer.rope_freq_base", config.transformer_rope_base)
    writer.add_float32("fish_speech.codec.transformer.layer_norm_rms_eps", config.transformer_norm_eps)

    writer.add_uint32("fish_speech.codec.rvq_transformer.window_size", config.rvq_transformer_window_size)
    writer.add_uint32("fish_speech.codec.rvq_transformer.block_size", config.rvq_transformer_block_size)
    writer.add_uint32("fish_speech.codec.rvq_transformer.n_layer", config.rvq_transformer_n_layer)
    writer.add_uint32("fish_speech.codec.rvq_transformer.n_head", config.rvq_transformer_n_head)
    writer.add_int32("fish_speech.codec.rvq_transformer.n_local_heads", config.rvq_transformer_n_local_heads)
    writer.add_uint32("fish_speech.codec.rvq_transformer.head_dim", config.rvq_transformer_head_dim)
    writer.add_uint32("fish_speech.codec.rvq_transformer.dim", config.rvq_transformer_dim)
    writer.add_uint32("fish_speech.codec.rvq_transformer.feed_forward_length", config.rvq_transformer_intermediate_size)
    writer.add_float32("fish_speech.codec.rvq_transformer.rope_freq_base", config.rvq_transformer_rope_base)
    writer.add_float32("fish_speech.codec.rvq_transformer.layer_norm_rms_eps", config.rvq_transformer_norm_eps)

def apply_weight_norm(v: torch.Tensor, g: torch.Tensor, dim: int = 0) -> torch.Tensor:
    if v.ndim == 0:
        raise ValueError("Weight normalization expects a tensor with at least one dimension.")

    if dim < 0:
        dim += v.ndim
    if dim < 0 or dim >= v.ndim:
        raise ValueError(f"Weight norm dimension {dim} is out of range for tensor shape {tuple(v.shape)}.")

    reduce_dims = tuple(axis for axis in range(v.ndim) if axis != dim)
    if reduce_dims:
        denom = torch.linalg.vector_norm(v, ord=2, dim=reduce_dims, keepdim=True)
    else:
        denom = torch.abs(v)

    target_shape = [1] * v.ndim
    target_shape[dim] = v.shape[dim]
    if tuple(g.shape) != tuple(target_shape):
        if g.numel() != v.shape[dim]:
            raise ValueError(
                f"Cannot broadcast weight norm scale with shape {tuple(g.shape)} "
                f"onto tensor shape {tuple(v.shape)} along dim={dim}."
            )
        g = g.reshape(target_shape)

    eps = torch.finfo(v.dtype).eps if v.is_floating_point() else 1e-12
    return v * (g / denom.clamp_min(eps))


def iter_codec_tensors(codec_checkpoint_path: Path) -> Iterator[tuple[str, torch.Tensor]]:
    """Loads a codec checkpoint and statically materializes WeightNorm tensors."""
    require_path(codec_checkpoint_path, "Codec checkpoint", "file")
    try:
        state_dict = torch.load(codec_checkpoint_path, map_location="cpu", weights_only=True)
    except Exception as exc:
        raise RuntimeError(f"Failed to load codec checkpoint: {codec_checkpoint_path}") from exc
    if "state_dict" in state_dict:
        state_dict = state_dict["state_dict"]

    # Strip generators if present
    processed = {}
    for k, v in state_dict.items():
        if "generator." in k:
            processed[k.replace("generator.", "")] = v
        elif not any(k.startswith(p) for p in ("encoder.", "decoder.", "quantizer.")):
            pass
        elif "causal_mask" in k or "inited" in k or "cluster_size" in k or "embed_avg" in k:
            pass
        else:
            processed[k] = v

    # Unroll parametrizations dynamically to save from instantiation logic
    # Find base namespaces
    base_namespaces = set()
    for k in processed.keys():
        if k.endswith(".weight_g"):
            base_namespaces.add(k[:-9])
        elif k.endswith(".parametrizations.weight.original0"):
            base_namespaces.add(k[:-34])

    for base in base_namespaces:
        # Compute WeightNorm explicitly to avoid depending on torch._weight_norm.
        wg_key, wv_key = f"{base}.weight_g", f"{base}.weight_v"
        pg_key, pv_key = f"{base}.parametrizations.weight.original0", f"{base}.parametrizations.weight.original1"

        g = processed.get(wg_key) if processed.get(wg_key) is not None else processed.get(pg_key)
        v = processed.get(wv_key) if processed.get(wv_key) is not None else processed.get(pv_key)

        if g is not None and v is not None:
            final_weight = apply_weight_norm(v, g, dim=0)
            processed[f"{base}.weight"] = final_weight

            # Delete old hooks
            for key in (wg_key, wv_key, pg_key, pv_key):
                if key in processed:
                    del processed[key]

    for name, tensor in sorted(processed.items()):
        yield name, tensor

# =================================================================================
# Main Unified Logic
# =================================================================================

def export_all_in_one(
    checkpoint_path: Path,
    codec_checkpoint_path: Path,
    output_path: Path,
    out_dtype: str = "f16"
):
    print(f"Starting Universal GGUF Export for S2-Pro:")
    print(f" > AR Checkpoint: {checkpoint_path}")
    print(f" > Codec Path: {codec_checkpoint_path}")
    print(f" > Output GGUF: {output_path}\n")

    ar_config = DualARCheckpointConfig(checkpoint_path)
    codec_config = CodecCheckpointConfig()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    file_type = gguf.LlamaFileType.MOSTLY_F16 if out_dtype == "f16" else gguf.LlamaFileType.ALL_F32
    writer = None
    try:
        # We open a single GGUFWriter to receive both models directly into disk (saving IO and temp files)
        writer = gguf.GGUFWriter(str(output_path), DUAL_AR_GGUF_ARCH, use_temp_file=True)

        # 1. Inject AR Metadata
        inject_dual_ar_metadata(writer, ar_config, file_type)
        # 2. Inject Codec Metadata
        inject_codec_metadata(writer, codec_config)

        tensor_count = 0
        total_params = 0

        print(">> Feeding AR Tensors ...")
        for name, tensor in iter_remapped_checkpoint_tensors(checkpoint_path, _is_dual_ar_tensor):
            np_tensor = convert_tensor(tensor, out_dtype)
            writer.add_tensor(name, np_tensor)
            tensor_count += 1
            total_params += tensor.numel()

        print(">> Feeding Codec Tensors (with static weight normalization unrolling) ...")
        for name, tensor in iter_codec_tensors(codec_checkpoint_path):
            gguf_name = f"c.{name}"
            np_tensor = convert_tensor(tensor, out_dtype)
            writer.add_tensor(gguf_name, np_tensor)
            tensor_count += 1
            total_params += tensor.numel()

        print(f"\n>> Writing GGUF file ({tensor_count} total tensors, ~{total_params/1e9:.2f}B parameters)...")
        writer.write_header_to_file()
        writer.write_kv_data_to_file()
        writer.write_tensors_to_file()
        writer.close()
        writer = None
    except Exception as exc:
        raise RuntimeError(f"GGUF export failed for output {output_path}: {exc}") from exc
    finally:
        if writer is not None:
            writer.close()

    print(f"\nExport complete: {output_path.absolute()}")

def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Standalone Tool: Unified GGUF Exporter for Fish Speech S2 Pro")
    parser.add_argument(
        "--checkpoint-path",
        type=Path,
        required=True,
        help="Path to the checkpoint directory containing config.json and model.safetensors* or model.pth",
    )
    parser.add_argument("--codec-checkpoint-path", type=Path, required=True, help="Path to codec.pth")
    parser.add_argument("--output", type=Path, required=True, help="Path to save the generated GGUF file")
    parser.add_argument(
        "--out-dtype",
        choices=SUPPORTED_OUT_DTYPES,
        default="f16",
        help="Output tensor dtype for floating-point tensors",
    )
    return parser


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    parser = build_argument_parser()
    args = parser.parse_args()

    try:
        export_all_in_one(
            checkpoint_path=args.checkpoint_path,
            codec_checkpoint_path=args.codec_checkpoint_path,
            output_path=args.output,
            out_dtype=args.out_dtype,
        )
    except (FileNotFoundError, ValueError, KeyError, ModuleNotFoundError, RuntimeError) as exc:
        logger.error("%s", exc)
        return 1
    except Exception:
        logger.exception("Unexpected failure during GGUF export")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
