"""WhisperX large-v3 (French, word level forced alignment) + Silero VAD speech regions. Runs in the AI venv (ai/.venv).

CUDA: float16 batch 8, fallback int8_float16 batch 4 on out of memory; never falls back to the CPU. macOS: CPU, int8
(see accel.py). The Silero model is loaded from the local torch hub cache when present.
Usage: python gpu_transcribe.py <rush> <transcript_raw.json> <vad.json> [--prompt "vocabulary"]
"""
import argparse
import json
import os
import subprocess
import tempfile
from pathlib import Path

import torch

os.environ["PATH"] = str(Path(torch.__file__).parent / "lib") + os.pathsep + os.environ["PATH"]

import whisperx  # noqa: E402

from accel import empty_cache, require_accelerator, whisper_compute_types, whisper_device  # noqa: E402

_hub_load = torch.hub.load
_SILERO_CACHE = Path(torch.hub.get_dir()) / "snakers4_silero-vad_master"


def _hub_load_cached(repo_or_dir, *args, **kwargs):
    if repo_or_dir == "snakers4/silero-vad" and _SILERO_CACHE.is_dir():
        kwargs.pop("trust_repo", None)
        kwargs.pop("force_reload", None)
        return _hub_load(str(_SILERO_CACHE), *args, source="local", **kwargs)
    return _hub_load(repo_or_dir, *args, **kwargs)


torch.hub.load = _hub_load_cached


def progress(fraction: float, message: str) -> None:
    print(f"PROGRESS {fraction:.3f} {message}", flush=True)


def extract_audio(rush: Path, wav: Path) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(rush), "-map", "0:a:0", "-ac", "1",
                    "-ar", "16000", str(wav)], check=True)


def transcribe(wav: Path, prompt: str | None, compute_type: str, batch_size: int) -> dict:
    asr_options = {"initial_prompt": prompt} if prompt else {}
    device = whisper_device()
    model = whisperx.load_model("large-v3", device=device, compute_type=compute_type, language="fr", vad_method="silero",
                                asr_options=asr_options)
    audio = whisperx.load_audio(str(wav))
    progress(0.15, f"transcribing ({compute_type}, batch {batch_size})")
    result = model.transcribe(audio, batch_size=batch_size, language="fr")
    del model
    empty_cache()
    progress(0.6, "forced alignment")
    align_model, metadata = whisperx.load_align_model(language_code="fr", device=device)
    return whisperx.align(result["segments"], align_model, metadata, audio, device=device, return_char_alignments=False)


def vad_regions(wav: Path) -> list[dict]:
    model, utils = torch.hub.load("snakers4/silero-vad", "silero_vad", trust_repo=True)
    get_speech_timestamps = utils[0]
    # torchaudio has no audio backend in this venv: load with whisperx (ffmpeg, 16 kHz mono float32).
    audio = torch.from_numpy(whisperx.load_audio(str(wav)))
    stamps = get_speech_timestamps(audio, model, sampling_rate=16000, return_seconds=True)
    return [{"start": round(float(s["start"]), 3), "end": round(float(s["end"]), 3)} for s in stamps]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("rush", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("vad_output", type=Path)
    parser.add_argument("--prompt", default=None)
    args = parser.parse_args()
    require_accelerator("the transcription")
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "audio.wav"
        progress(0.02, "extracting audio")
        extract_audio(args.rush, wav)
        attempts = whisper_compute_types()
        for index, (compute_type, batch_size) in enumerate(attempts):
            try:
                aligned = transcribe(wav, args.prompt, compute_type, batch_size)
                settings = {"device": whisper_device(), "compute_type": compute_type, "batch_size": batch_size}
                break
            except RuntimeError as err:
                if "out of memory" not in str(err).lower() or index == len(attempts) - 1:
                    raise
                print(f"out of memory, retrying with {attempts[index + 1][0]}: {err}", flush=True)
                empty_cache()
        progress(0.9, "Silero VAD")
        vad = vad_regions(wav)

    words = [{"word": w["word"], "start": w.get("start"), "end": w.get("end"), "score": w.get("score")}
             for s in aligned["segments"] for w in s.get("words", [])]
    segments = [{"start": s["start"], "end": s["end"], "text": s["text"].strip()} for s in aligned["segments"]]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"source": args.rush.name, "model": "large-v3", "language": "fr", "settings": settings,
                                       "segments": segments, "words": words}, ensure_ascii=False, indent=1), encoding="utf-8")
    args.vad_output.write_text(json.dumps(vad), encoding="utf-8")
    missing = sum(1 for w in words if w["start"] is None)
    print(f"{len(segments)} segments, {len(words)} words, {missing} without timestamps, {len(vad)} VAD regions")
    progress(1, "transcribed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
