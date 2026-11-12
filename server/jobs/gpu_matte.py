"""Speaker cutout for `bg` pictures (picture behind the head): Robust Video Matting (CUDA, Apple MPS on macOS), only on the rush
ranges that need it (each bg cut-in plus a 0.5 s margin). AI venv (ai/.venv).

Each range becomes data/cache/matte/<start_ms>_<end_ms>.webm: the rush pixels with the speaker's alpha (VP9 with alpha,
played by the browser in the preview and by Remotion at export), indexed in data/cache/matte/index.json as rush times.
Ranges already covered by an existing matte are not computed again. The rush is only read.

Usage: python gpu_matte.py <project_dir>
"""
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

import numpy as np
import torch

from accel import require_accelerator, torch_device
from common import app_dir, progress, read_json, result, write_json

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "ai" / "rvm"))
from model import MattingNetwork  # noqa: E402

WEIGHTS_URL = "https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_mobilenetv3.pth"
WEIGHTS = REPO / "ai" / "models" / "rvm_mobilenetv3.pth"
MARGIN_S = 0.5
MAX_HEIGHT = 1920  # never more than the output canvas needs
BATCH = 8


def needed_ranges(plan: dict, duration: float) -> list[tuple[float, float]]:
    """Rush ranges of the bg cut-ins (the plan is in rush time), with margins, merged."""
    ranges = sorted((max(0.0, c["start"] - MARGIN_S), min(duration, c["end"] + MARGIN_S))
                    for c in plan.get("cutIns", []) if c.get("mode") == "bg")
    merged: list[list[float]] = []
    for a, b in ranges:
        if merged and a <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])
    return [(round(a, 3), round(b, 3)) for a, b in merged]


def covered(index: list[dict], a: float, b: float) -> bool:
    return any(m["start"] <= a + 1e-3 and m["end"] >= b - 1e-3 for m in index)


def load_model() -> MattingNetwork:
    if not WEIGHTS.exists():
        WEIGHTS.parent.mkdir(parents=True, exist_ok=True)
        print(f"downloading the matting weights (once): {WEIGHTS_URL}", flush=True)
        partial = WEIGHTS.with_suffix(".part")
        urllib.request.urlretrieve(WEIGHTS_URL, partial)
        partial.replace(WEIGHTS)
    model = MattingNetwork("mobilenetv3").eval()
    model.load_state_dict(torch.load(WEIGHTS, map_location="cpu"))
    return model.to(torch_device())


def matte_range(model: MattingNetwork, rush: Path, probe: dict, a: float, b: float, out: Path,
                report=lambda f: None) -> None:
    fps = probe["fps"]
    scale = min(1.0, MAX_HEIGHT / probe["height"])
    w = int(round(probe["width"] * scale / 2)) * 2
    h = int(round(probe["height"] * scale / 2)) * 2
    frames = max(1, int(round((b - a) * fps)))
    decoder = subprocess.Popen(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", f"{a:.3f}", "-i", str(rush), "-frames:v", str(frames),
         "-vf", f"scale={w}:{h}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE)
    partial = out.with_name(out.stem + ".part.webm")
    encoder = subprocess.Popen(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{w}x{h}",
         "-r", f"{fps}", "-i", "-", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0",
         "-crf", "24", "-b:v", "0", "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1", "-an", str(partial)],
        stdin=subprocess.PIPE)
    ratio = min(512 / max(h, w), 1)
    device = next(model.parameters()).device
    rec = [None] * 4
    size = w * h * 3
    done = 0
    with torch.no_grad():
        while True:
            batch = []
            while len(batch) < BATCH:
                raw = decoder.stdout.read(size)
                if len(raw) < size:
                    break
                batch.append(np.frombuffer(raw, np.uint8).reshape(h, w, 3))
            if not batch:
                break
            rgb = np.stack(batch)
            src = torch.from_numpy(rgb).to(device).permute(0, 3, 1, 2).float().div(255).unsqueeze(0)  # [1, T, 3, H, W]
            _, pha, *rec = model(src, *rec, ratio)
            alpha = pha[0, :, 0].mul(255).round().byte().cpu().numpy()  # [T, H, W]
            encoder.stdin.write(np.concatenate([rgb, alpha[..., None]], axis=-1).tobytes())
            done += len(batch)
            report(done / frames)
    decoder.wait()
    encoder.stdin.close()
    if encoder.wait() != 0 or done == 0:
        partial.unlink(missing_ok=True)
        raise SystemExit(f"matting failed on {a:.2f}-{b:.2f} s")
    partial.replace(out)


def main() -> None:
    video = Path(sys.argv[1])
    app = app_dir(video)
    plan = read_json(app / "plan.json") or {}
    probe = read_json(app / "cache" / "probe.json")
    if not probe:
        raise SystemExit("import the rush first")
    folder = app / "cache" / "matte"
    folder.mkdir(parents=True, exist_ok=True)
    index = [m for m in (read_json(folder / "index.json") or []) if (folder / Path(m["file"]).name).exists()]
    todo = [(a, b) for a, b in needed_ranges(plan, probe["duration"]) if not covered(index, a, b)]
    if not todo:
        print("every bg picture already has its cutout")
        write_json(folder / "index.json", index)
        return
    require_accelerator("the matting")
    model = load_model()
    rush = video / probe["rush"]
    total = sum(b - a for a, b in todo)
    elapsed = 0.0
    for a, b in todo:
        out = folder / f"{int(a * 1000):07d}_{int(b * 1000):07d}.webm"
        print(f"matting {a:.2f}-{b:.2f} s -> {out.name}", flush=True)
        matte_range(model, rush, probe, a, b, out,
                    lambda f, a=a, b=b, base=elapsed: progress((base + f * (b - a)) / total, f"matting {a:.1f}-{b:.1f} s"))
        elapsed += b - a
        index = [m for m in index if not (a <= m["start"] and m["end"] <= b)]
        index.append({"file": f"data/cache/matte/{out.name}", "start": a, "end": b})
        write_json(folder / "index.json", sorted(index, key=lambda m: m["start"]))
    result("mattes", len(index))


if __name__ == "__main__":
    main()
