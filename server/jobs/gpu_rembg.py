"""Background removal (rembg, BiRefNet) of logos with process=rembg, on copies in data/cache. AI venv (ai/.venv): onnxruntime-gpu
on CUDA machines, onnxruntime (CPU) on macOS.

Usage: python gpu_rembg.py <video_dir>
"""
import json
import sys
from pathlib import Path

from PIL import Image
from rembg import new_session, remove

from common import app_dir


def main() -> None:
    video = Path(sys.argv[1])
    app = app_dir(video)
    plan = json.loads((app / "plan.json").read_text(encoding="utf-8"))
    assets = {a["id"]: a for a in plan["assets"]}
    todo = [l for l in plan["logos"] if l.get("process") == "rembg"
            and not (app / "cache" / f"{l['asset']}.rembg.png").exists()]
    if not todo:
        print("nothing to do")
        return
    session = new_session("birefnet-general")
    for logo in todo:
        source = video / assets[logo["asset"]]["file"]
        out = app / "cache" / f"{logo['asset']}.rembg.png"
        image = remove(Image.open(source).convert("RGBA"), session=session)
        box = image.getchannel("A").point(lambda a: 255 if a > 16 else 0).getbbox()
        (image.crop(box) if box else image).save(out)
        print("rembg ->", out)


if __name__ == "__main__":
    main()
