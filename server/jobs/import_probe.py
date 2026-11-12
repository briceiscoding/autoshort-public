"""Import step 1: probe the rush and type every asset (image / video / audio). Read only on rush/ and assets/.

Writes data/cache/probe.json and data/cache/assets.json.
Usage: python import_probe.py <video_dir> <rush>
"""
import sys
from pathlib import Path

from common import app_dir, progress, write_json
from autoshort_server.media import asset_id, ffprobe, probe_asset


def main() -> None:
    video, rush = Path(sys.argv[1]), Path(sys.argv[2])
    app = app_dir(video)
    data = ffprobe(rush)
    stream = next(s for s in data["streams"] if s.get("codec_type") == "video")
    num, den = (int(v) for v in stream["r_frame_rate"].split("/"))
    has_audio = any(s.get("codec_type") == "audio" for s in data["streams"])
    probe = {"rush": f"rush/{rush.name}", "width": int(stream["width"]), "height": int(stream["height"]),
             "fps": round(num / den, 3), "duration": round(float(data["format"]["duration"]), 3), "hasAudio": has_audio}
    print(f"rush {rush.name}: {probe['width']}x{probe['height']} {probe['fps']} fps {probe['duration']} s audio={has_audio}")
    if not has_audio:
        raise SystemExit("the rush has no audio stream")
    write_json(app / "cache" / "probe.json", probe)

    catalog, taken = [], set()
    folder = video / "assets"
    files = sorted(f for f in folder.iterdir() if f.is_file() and not f.name.startswith("._")) if folder.is_dir() else []
    for i, f in enumerate(files):
        progress(i / max(1, len(files)), f"typing {f.name}")
        if f.suffix.lower() in (".md", ".txt"):
            continue
        entry = probe_asset(f, f"assets/{f.name}", asset_id(f.name, taken))
        if entry is None:
            print(f"skipped (not media): {f.name}")
            continue
        catalog.append(entry)
        print(f"{entry['kind']:5} {f.name} {entry.get('width', '')}x{entry.get('height', '')}")
    write_json(app / "cache" / "assets.json", catalog)
    progress(1, f"{len(catalog)} assets typed")


if __name__ == "__main__":
    main()
