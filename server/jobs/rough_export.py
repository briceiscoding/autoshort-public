"""Export of a rough cut: the rush cut at the kept segments of the plan, nothing else.

No Remotion render, no caption, no zoom, no audio processing: ffmpeg trims every kept segment of the rush and joins
them, in the rush's own size and frame rate. A 10 ms audio fade at each join avoids clicks. Versioned output, never
overwritten: exports/<slug>_vN.mp4 (no .srt: a rough cut has no captions).

Usage: python rough_export.py <video_dir>
"""
import sys
from datetime import datetime
from pathlib import Path

from common import app_dir, guard_write, progress, read_json, result, run_ffmpeg, write_json
from finalize_export import loudness, next_version

FADE_S = 0.01
MIN_SEGMENT_S = 0.05  # shorter kept bits are dropped (an empty trim would break the join)


def kept_segments(plan: dict) -> list[tuple[float, float]]:
    """Kept spans of the plan in rush time, in order, neighbours joined (a join without a cut between them would
    only add a fade)."""
    duration = plan["source"]["duration"]
    out: list[list[float]] = []
    for span in sorted(plan["spans"], key=lambda s: s["start"]):
        if not span.get("keep", True):
            continue
        start, end = max(0.0, span["start"]), min(duration, span["end"])
        if out and start - out[-1][1] < 0.001:
            out[-1][1] = max(out[-1][1], end)
        elif end - start >= MIN_SEGMENT_S:
            out.append([start, end])
    return [(round(a, 3), round(b, 3)) for a, b in out if b - a >= MIN_SEGMENT_S]


def filter_graph(segments: list[tuple[float, float]]) -> str:
    """trim / atrim every segment from the rush, short audio fades at each join, then concat."""
    parts, labels = [], []
    for i, (a, b) in enumerate(segments):
        d = b - a
        parts.append(f"[0:v:0]trim=start={a:.3f}:end={b:.3f},setpts=PTS-STARTPTS[v{i}]")
        parts.append(f"[0:a:0]atrim=start={a:.3f}:end={b:.3f},asetpts=PTS-STARTPTS,"
                     f"afade=t=in:d={FADE_S},afade=t=out:st={max(0.0, d - FADE_S):.3f}:d={FADE_S}[a{i}]")
        labels.append(f"[v{i}][a{i}]")
    parts.append(f"{''.join(labels)}concat=n={len(segments)}:v=1:a=1[v][a]")
    return ";\n".join(parts)


def main() -> None:
    video = Path(sys.argv[1])
    app = app_dir(video)
    plan = read_json(app / "plan.json")
    if not plan:
        raise SystemExit("no plan yet: import the video first")
    segments = kept_segments(plan)
    if not segments:
        raise SystemExit("nothing is kept: restore at least one segment")
    rush = video / plan["source"]["rush"]
    out = video / "exports"
    out.mkdir(exist_ok=True)
    final = out / f"{video.name}_v{next_version(out, video.name)}.mp4"
    guard_write(video, final)
    graph = app / "render" / "rough_cut.ffgraph"
    graph.parent.mkdir(parents=True, exist_ok=True)
    graph.write_text(filter_graph(segments), encoding="utf-8")
    total = sum(b - a for a, b in segments)
    progress(0.05, f"{len(segments)} segments, {total:.1f} s out of {plan['source']['duration']:.1f} s")
    run_ffmpeg(["-i", str(rush), "-filter_complex_script", str(graph), "-map", "[v]", "-map", "[a]",
                "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p",
                "-fps_mode", "cfr", "-r", str(plan["source"]["fps"]),
                "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(final)])
    progress(0.9, "loudness")
    integrated, peak = loudness(final)
    analysis = read_json(app / "analysis.json") or {"schemaVersion": 1}
    analysis.setdefault("exports", []).append({"file": final.name, "at": datetime.now().isoformat(timespec="seconds"),
                                               "integratedLufs": integrated, "truePeakDb": peak})
    write_json(app / "analysis.json", analysis)
    print(f"{final} ({final.stat().st_size / 1_000_000:.1f} MB): {len(segments)} segments, {total:.1f} s")
    result("output", final.name)
    progress(1, "export done")


if __name__ == "__main__":
    main()
