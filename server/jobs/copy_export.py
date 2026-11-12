"""Copy the export just made (latest exports/<slug>_vN.mp4 and its .srt) to the folder chosen at export time.
The copy in the project stays; nothing is ever overwritten: <name>.mp4, then <name>_v2.mp4, <name>_v3.mp4...

Usage: python copy_export.py <video_dir> <dest_dir> <name> <srt: 0|1>
"""
import re
import shutil
import sys
from pathlib import Path

from common import progress, result

INVALID = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def latest_export(video: Path) -> Path:
    found = [(int(m.group(1)), p) for p in (video / "exports").glob(f"{video.name}_v*.mp4")
             if (m := re.search(r"_v(\d+)$", p.stem))]
    if not found:
        raise SystemExit("no export to copy")
    return max(found)[1]


def clean_name(name: str, fallback: str) -> str:
    name = INVALID.sub("", name).strip().rstrip(".")
    name = re.sub(r"\.mp4$", "", name, flags=re.IGNORECASE)
    return name or fallback


def free_stem(dest: Path, stem: str) -> str:
    """The first of <stem>, <stem>_v2, <stem>_v3... with neither its .mp4 nor its .srt in dest."""
    n = 1
    while True:
        candidate = stem if n == 1 else f"{stem}_v{n}"
        if not (dest / f"{candidate}.mp4").exists() and not (dest / f"{candidate}.srt").exists():
            return candidate
        n += 1


def main() -> None:
    video, dest = Path(sys.argv[1]), Path(sys.argv[2])
    with_srt = sys.argv[4] == "1"
    if not dest.is_dir():
        raise SystemExit(f"export folder not found: {dest}")
    source = latest_export(video)
    stem = free_stem(dest, clean_name(sys.argv[3], source.stem))
    target = dest / f"{stem}.mp4"
    progress(0.1, f"copy to {target}")
    shutil.copyfile(source, target)
    srt = source.with_suffix(".srt")
    if with_srt and srt.exists():
        shutil.copyfile(srt, dest / f"{stem}.srt")
    print(f"copied {source.name} -> {target}")
    result("copiedTo", str(target))
    progress(1, "copied")


if __name__ == "__main__":
    main()
