"""Which hardware the AI jobs run on (AI venv only: imports torch).

- Windows / Linux: an NVIDIA GPU through CUDA, required (a silent CPU fallback would make an import take ages).
- macOS: no CUDA. PyTorch models (matting) use the Apple GPU (MPS) when available; WhisperX / faster-whisper
  (CTranslate2) have no Apple GPU backend and run on the CPU in int8, slower but correct.
"""
import sys

import torch

MAC = sys.platform == "darwin"


def require_accelerator(task: str) -> None:
    """Stop with a clear message when a CUDA machine has lost its GPU (never on macOS, where the CPU is expected)."""
    if not MAC and not torch.cuda.is_available():
        raise SystemExit(f"CUDA is not available: refusing to run {task} on the CPU.")


def torch_device() -> str:
    """Device for plain PyTorch models."""
    if torch.cuda.is_available():
        return "cuda"
    if MAC and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def whisper_device() -> str:
    """Device for CTranslate2 (faster-whisper, WhisperX) and the WhisperX alignment model: CUDA or the CPU."""
    return "cuda" if torch.cuda.is_available() else "cpu"


def whisper_compute_types() -> list[tuple[str, int]]:
    """(compute_type, batch_size) to try in order, the next one after an out of memory error."""
    if whisper_device() == "cuda":
        return [("float16", 8), ("int8_float16", 4)]
    return [("int8", 4)]


def empty_cache() -> None:
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    elif MAC and torch.backends.mps.is_available():
        torch.mps.empty_cache()
