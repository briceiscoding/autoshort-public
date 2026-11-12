"""Finish an export: final limiter, loudness measurement, versioned output (never overwritten), SRT, control frames.

Usage: python finalize_export.py <video_dir> <edl_json> <theme_json>
"""
import json
import re
import sys
from datetime import datetime
from pathlib import Path

from common import app_dir, guard_write, progress, read_json, result, run_ffmpeg, write_json


def next_version(out: Path, slug: str) -> int:
    versions = [int(m.group(1)) for p in out.glob(f"{slug}_v*.mp4") if (m := re.search(r"_v(\d+)$", p.stem))]
    return max(versions, default=0) + 1


def loudness(path: Path) -> tuple[float, float]:
    log = run_ffmpeg(["-i", str(path), "-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-"])
    summary = log[log.rfind("Summary:"):]
    integrated = float(re.search(r"I:\s+(-?[\d.]+) LUFS", summary).group(1))
    peak = float(re.search(r"Peak:\s+(-?[\d.]+|-inf) dBFS", summary).group(1).replace("-inf", "-120"))
    return integrated, peak


def timestamp(seconds: float) -> str:
    millis = round(seconds * 1000)
    hours, millis = divmod(millis, 3_600_000)
    minutes, millis = divmod(millis, 60_000)
    secs, millis = divmod(millis, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{millis:03}"


def write_srt(edl: dict, target: Path) -> None:
    entries = [f"{i}\n{timestamp(b['start'])} --> {timestamp(b['end'])}\n{b['text']}\n" for i, b in enumerate(edl["captions"], 1)]
    target.write_text("\n".join(entries), encoding="utf-8")


def control_times(edl: dict) -> list[tuple[str, float]]:
    times = [("hook", 0.5)]
    times += [(f"diagram_{d['id']}", (d["start"] + d["end"]) / 2) for d in edl["diagrams"]]
    times += [(f"bg_{a['id']}", (a["start"] + a["end"]) / 2) for a in edl["assets"] if a["mode"] == "bg"]
    times += [(f"logo_{l['id']}", min(l["end"] - 0.05, l["start"] + 0.5)) for l in edl["logos"]]
    times.append(("end", max(0.0, edl["durationAfter"] - 0.3)))
    return times


def main() -> None:
    video, edl_file, theme_file = (Path(a) for a in sys.argv[1:4])
    edl = json.loads(edl_file.read_text(encoding="utf-8"))
    theme = json.loads(theme_file.read_text(encoding="utf-8"))
    app = app_dir(video)
    slug = video.name
    out = video / "exports"
    out.mkdir(exist_ok=True)
    version = next_version(out, slug)
    final = out / f"{slug}_v{version}.mp4"
    srt = out / f"{slug}_v{version}.srt"
    guard_write(video, final)
    guard_write(video, srt)

    progress(0.1, "limiter")
    # Brick-wall limiter with margin for inter-sample peaks; the video stream is copied untouched.
    limit = 10 ** ((theme["audio"]["truePeak"] - 0.5) / 20)
    run_ffmpeg(["-i", str(app / "render" / "render.mp4"), "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy",
                "-af", f"alimiter=limit={limit:.4f}:attack=5:release=50:level=disabled", "-c:a", "aac",
                "-b:a", theme["format"]["audioBitrate"], "-ar", str(theme["format"]["audioRate"]),
                "-movflags", "+faststart", str(final)])

    progress(0.5, "loudness")
    integrated, peak = loudness(final)
    voice_lufs, _ = loudness(app / "render" / "voice.wav")
    print(f"output: {integrated:.1f} LUFS, true peak {peak:.1f} dBTP, voice {voice_lufs:.1f} LUFS")

    write_srt(edl, srt)

    progress(0.7, "control frames")
    control = app / "control" / f"v{version}"
    control.mkdir(parents=True, exist_ok=True)
    z = theme["safeZone"]
    box = f"drawbox=x={z['x0']}:y={z['y0']}:w={z['x1'] - z['x0']}:h={z['y1'] - z['y0']}:color=yellow@0.9:t=6"
    for name, t in control_times(edl):
        run_ffmpeg(["-ss", f"{t:.3f}", "-i", str(final), "-frames:v", "1", "-vf", box, str(control / f"{name}.png")])

    analysis = read_json(app / "analysis.json") or {"schemaVersion": 1}
    analysis.setdefault("exports", []).append({"file": final.name, "at": datetime.now().isoformat(timespec="seconds"),
                                               "integratedLufs": integrated, "truePeakDb": peak, "voiceLufs": voice_lufs})
    write_json(app / "analysis.json", analysis)
    size = final.stat().st_size / 1_000_000
    print(f"{final} ({size:.1f} MB), {srt.name}, control frames in {control}")
    result("output", final.name)
    result("lufs", f"{integrated:.1f}")
    result("truePeak", f"{peak:.1f}")
    progress(1, "export done")


if __name__ == "__main__":
    main()
