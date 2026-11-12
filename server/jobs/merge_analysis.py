"""Merge cached analysis pieces (face track, VAD, bursts, transcription settings) into data/analysis.json.

Usage: python merge_analysis.py <video_dir>
"""
import sys
from pathlib import Path

from common import app_dir, read_json, write_json


def merge(video: Path) -> dict:
    app = app_dir(video)
    cache = app / "cache"
    analysis = read_json(app / "analysis.json") or {"schemaVersion": 1}
    face = read_json(cache / "face.json")
    if face:
        analysis["face"] = face
    vad = read_json(cache / "vad.json")
    if vad is not None:
        analysis["vad"] = vad
    bursts = read_json(cache / "bursts.json") or read_json(video / "tmp" / "bursts.json")
    if bursts:
        analysis["bursts"] = [{"start": b, "end": e} for g in bursts for b, e in g.get("bursts", [])]
    raw = read_json(cache / "transcript_raw.json")
    if raw:
        settings = raw.get("settings", {})
        analysis["transcription"] = {"model": raw.get("model", "large-v3"), "computeType": settings.get("compute_type"),
                                     "batchSize": settings.get("batch_size")}
    write_json(app / "analysis.json", analysis)
    return analysis


if __name__ == "__main__":
    print("analysis keys:", sorted(merge(Path(sys.argv[1]))))
