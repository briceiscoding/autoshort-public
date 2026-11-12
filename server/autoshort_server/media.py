"""Media typing and probing: every asset is typed once at import, never guessed at render time."""
import json
import re
import subprocess
import unicodedata
from pathlib import Path

from PIL import Image

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif"}
VIDEO_EXT = {".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi"}
AUDIO_EXT = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}
ALPHA_THRESHOLD = 16


def ffprobe(path: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate,duration",
         "-show_entries", "format=duration", "-of", "json", str(path)],
        check=True, capture_output=True, text=True, encoding="utf-8", errors="replace").stdout
    return json.loads(out)


def alpha_box(image: Image.Image) -> list[int] | None:
    """Visible area of a picture with transparency, None when it is fully opaque."""
    if "A" not in image.getbands():
        return None
    box = image.getchannel("A").point(lambda a: 255 if a > ALPHA_THRESHOLD else 0).getbbox()
    if not box or box == (0, 0, image.width, image.height):
        return None
    return list(box)


def probe_asset(path: Path, relative: str, asset_id: str) -> dict | None:
    """Catalog entry {id, file, kind, width, height, duration?, hasAlpha?, alphaBox?} or None if not media."""
    ext = path.suffix.lower()
    if ext in IMAGE_EXT:
        try:
            with Image.open(path) as image:
                image.load()
                rgba = image.convert("RGBA") if image.mode in ("RGBA", "LA", "P") else image
                entry = {"id": asset_id, "file": relative, "kind": "image", "width": image.width,
                         "height": image.height}
                if "A" in rgba.getbands() and rgba.getchannel("A").getextrema()[0] < 255:
                    entry["hasAlpha"] = True
                    box = alpha_box(rgba)
                    if box:
                        entry["alphaBox"] = box
                return entry
        except OSError:
            pass
    if ext in VIDEO_EXT or ext in AUDIO_EXT or ext in IMAGE_EXT:
        data = ffprobe(path)
        video = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), None)
        duration = float(data.get("format", {}).get("duration") or 0) or None
        if video and ext not in AUDIO_EXT and duration and duration > 0.1:
            entry = {"id": asset_id, "file": relative, "kind": "video", "width": int(video["width"]),
                     "height": int(video["height"])}
            if duration:
                entry["duration"] = round(duration, 3)
            return entry
        if any(s.get("codec_type") == "audio" for s in data.get("streams", [])):
            return {"id": asset_id, "file": relative, "kind": "audio", **({"duration": round(duration, 3)} if duration else {})}
    return None


def asset_id(name: str, taken: set[str]) -> str:
    """Stable id from a file name (mail.png -> mail), unique among `taken` (which it extends)."""
    stem = unicodedata.normalize("NFKD", Path(name).stem).encode("ascii", "ignore").decode()
    base = re.sub(r"[^a-z0-9]+", "_", stem.lower()).strip("_") or "asset"
    candidate, i = base, 1
    while candidate in taken:
        i += 1
        candidate = f"{base}_{i}"
    taken.add(candidate)
    return candidate
