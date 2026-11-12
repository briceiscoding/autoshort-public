"""Media needed by the preview, generated once on copies in data/cache (never in assets/ or library/).

- Subscribe overlay: library brand mp4 keyed to VP9 with alpha (the browser plays it in the Player).
- Logos with process=luma_key: brightness becomes alpha.
Usage: python preview_prep.py <video_dir> <library_dir> <theme_json>
"""
import json
import sys
from pathlib import Path

from PIL import Image

from common import app_dir, guard_write, progress, read_json, run_ffmpeg


def key_overlay(source: Path, color: str, output: Path) -> None:
    run_ffmpeg(["-i", str(source), "-vf", f"colorkey={color}:0.22:0.08,format=yuva420p", "-c:v", "libvpx-vp9",
                "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-crf", "20", "-b:v", "0", "-an", str(output)])


def luma_key(source: Path, output: Path) -> None:
    image = Image.open(source).convert("RGBA")
    alpha = image.convert("L")
    image = Image.merge("RGBA", (*Image.new("RGB", image.size, (255, 255, 255)).split(), alpha))
    box = image.getchannel("A").point(lambda a: 255 if a > 16 else 0).getbbox()
    image.crop(box).save(output)


def main() -> None:
    video, library, theme_file = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    theme = json.loads(theme_file.read_text(encoding="utf-8"))
    app = app_dir(video)
    plan = read_json(app / "plan.json") or {}
    subscribe = plan.get("subscribe")
    target = app / "cache" / "subscribe.webm"
    overlay = library / theme["subscribe"]["file"]
    if subscribe and not overlay.exists():
        print(f"no subscribe overlay ({overlay.name} not in library/brand): the reminder is not shown")
    elif subscribe and not target.exists():
        progress(0.1, "keying subscribe overlay")
        guard_write(video, target)
        key_overlay(overlay, subscribe.get("keyColor", theme["subscribe"]["keyColor"]), target)
        print("subscribe overlay ->", target)
    assets = {a["id"]: a for a in plan.get("assets", [])}
    for logo in plan.get("logos", []):
        if logo.get("process") == "luma_key":
            out = app / "cache" / f"{logo['asset']}.luma_key.png"
            if not out.exists():
                guard_write(video, out)
                luma_key(video / assets[logo["asset"]]["file"], out)
                print("luma key ->", out)
    progress(1, "preview media ready")


if __name__ == "__main__":
    main()
