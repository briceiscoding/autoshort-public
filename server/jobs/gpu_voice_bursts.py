"""Voice bursts fallback: split the rush into voiced bursts from its energy envelope, then run Whisper on each
pause-delimited group with word timestamps, in isolation (catches speech that WhisperX + VAD skipped). AI venv.

Usage: python gpu_voice_bursts.py <rush_path> <output_json> [--threshold -36] [--group-gap 0.35]
"""
import argparse
import json
import os
import subprocess
from pathlib import Path

# Must run before ctranslate2 loads: torch ships the CUDA DLLs it needs on Windows.
import torch

os.environ["PATH"] = str(Path(torch.__file__).parent / "lib") + os.pathsep + os.environ["PATH"]

import numpy as np  # noqa: E402
from faster_whisper import WhisperModel  # noqa: E402

from accel import require_accelerator, whisper_compute_types, whisper_device  # noqa: E402

SAMPLE_RATE = 16000
FRAME = 0.02
MIN_GAP = 0.10
MIN_BURST = 0.08


def voiced_bursts(audio: np.ndarray, threshold_db: float) -> list[tuple[float, float]]:
    hop = int(FRAME * SAMPLE_RATE)
    frames = len(audio) // hop
    rms = np.array([np.sqrt(np.mean(audio[i * hop:(i + 1) * hop] ** 2)) + 1e-9 for i in range(frames)])
    voiced = 20 * np.log10(rms) > threshold_db
    bursts: list[list[float]] = []
    for i, is_voiced in enumerate(voiced):
        if not is_voiced:
            continue
        t = i * FRAME
        if bursts and t - bursts[-1][1] <= MIN_GAP:
            bursts[-1][1] = t + FRAME
        else:
            bursts.append([t, t + FRAME])
    return [(a, b) for a, b in bursts if b - a >= MIN_BURST]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("rush", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--threshold", type=float, default=-36.0)
    parser.add_argument("--group-gap", type=float, default=0.35)
    args = parser.parse_args()

    raw = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(args.rush), "-map", "0:a:0",
         "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "s16le", "-"],
        check=True, capture_output=True,
    ).stdout
    audio = np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0
    bursts = voiced_bursts(audio, args.threshold)

    groups: list[list[float]] = []
    for start, end in bursts:
        if groups and start - groups[-1][1] <= args.group_gap:
            groups[-1][1] = end
        else:
            groups.append([start, end])

    require_accelerator("Whisper")
    model = WhisperModel("large-v3", device=whisper_device(), compute_type=whisper_compute_types()[0][0])
    results = []
    for start, end in groups:
        a = max(0.0, start - 0.15)
        b = end + 0.15
        chunk = audio[int(a * SAMPLE_RATE):int(b * SAMPLE_RATE)]
        segments, _ = model.transcribe(chunk, language="fr", beam_size=5, vad_filter=False,
                                       condition_on_previous_text=False, word_timestamps=True)
        words = [
            {"word": w.word.strip(), "start": round(a + w.start, 2), "end": round(a + w.end, 2)}
            for s in segments for w in (s.words or [])
        ]
        inner = [(round(x, 2), round(y, 2)) for x, y in bursts if x >= start and y <= end]
        results.append({"start": round(start, 2), "end": round(end, 2), "bursts": inner, "words": words})
        text = " ".join(f"{w['word']}[{w['start']:.2f}]" for w in words)
        print(f"{start:7.2f}-{end:7.2f} | {text}", flush=True)

    args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
