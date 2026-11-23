"""The YouTube 16:9 style, made by Claude from the author's references. There is one style, kept in theme/ (synced
between computers with the rest of the theme):

theme/theme.landscape.json      the 16:9 theme layer over theme.json: its own identity (colours, fonts, text styles,
                                frames) and layout. Written by Claude, then editable in the Styles tab.
theme/landscape/refs/           reference pictures (screenshots; frames taken from the clips dropped in)
theme/landscape/refs.json       {"note": what the author wants overall, "refs": {file: note}}
theme/landscape/components/     style components replacing elements of the 16:9 format (Captions.tsx, CutIn.tsx...)
theme/landscape/style.md        what Claude made and from which reference (French, shown in the app)
theme/landscape/fonts.json      Google Fonts families the style uses (downloaded into library/fonts by the job)
theme/landscape/sheet/          control sheet: one picture per element, rendered after every change
theme/landscape/history/<id>/   the previous versions (layer, components, style.md, fonts.json, sheet), to go back
"""
import json
import re
import shutil
import subprocess
import unicodedata
from datetime import datetime
from pathlib import Path

from .config import THEME_FILE

IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp")
CLIP_EXTENSIONS = (".mp4", ".mov", ".webm", ".mkv", ".m4v")
MAX_REF_BYTES = 300 * 1024 * 1024
CLIP_FRAMES = 6
HISTORY_KEEP = 30
VERSIONED = ("components", "style.md", "fonts.json", "sheet")


class StyleError(Exception):
    pass


def style_dir() -> Path:
    return THEME_FILE.parent / "landscape"


def layer_file() -> Path:
    return THEME_FILE.with_name("theme.landscape.json")


def refs_dir() -> Path:
    return style_dir() / "refs"


def components_dir() -> Path:
    return style_dir() / "components"


def _read_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def _write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def notes() -> dict:
    data = _read_json(style_dir() / "refs.json", {})
    return {"note": str(data.get("note") or ""), "refs": dict(data.get("refs") or {})}


def _list(folder: Path, extensions: tuple[str, ...]) -> list[str]:
    if not folder.is_dir():
        return []
    return sorted(f.name for f in folder.iterdir() if f.is_file() and f.suffix.lower() in extensions)


def history() -> list[dict]:
    folder = style_dir() / "history"
    if not folder.is_dir():
        return []
    out = []
    for d in sorted((p for p in folder.iterdir() if p.is_dir()), reverse=True):
        out.append({"id": d.name, "label": (d / "label.txt").read_text(encoding="utf-8").strip() if (d / "label.txt").exists() else ""})
    return out


def state() -> dict:
    n = notes()
    refs = _list(refs_dir(), IMAGE_EXTENSIONS)
    sheet = _read_json(style_dir() / "sheet" / "sheet.json", [])
    description = style_dir() / "style.md"
    return {
        "refs": [{"file": f, "note": n["refs"].get(f, "")} for f in refs],
        "note": n["note"],
        "components": [f for f in _list(components_dir(), (".tsx",))],
        "description": description.read_text(encoding="utf-8") if description.exists() else None,
        "fonts": _read_json(style_dir() / "fonts.json", []),
        "sheet": [s for s in sheet if (style_dir() / "sheet" / s.get("file", "")).exists()],
        "history": history(),
    }


def _safe_stem(name: str) -> str:
    stem = unicodedata.normalize("NFKD", Path(name).stem).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Za-z0-9_-]+", "_", stem).strip("_")[:60] or "ref"


def _free(folder: Path, stem: str, suffix: str) -> Path:
    path, i = folder / f"{stem}{suffix}", 2
    while path.exists():
        path, i = folder / f"{stem}_{i}{suffix}", i + 1
    return path


def add_reference(name: str, data: bytes) -> list[str]:
    """A screenshot goes to refs/ as is; a clip becomes CLIP_FRAMES pictures spread over it (the motion, frame by frame).
    Returns the reference pictures added."""
    suffix = Path(name).suffix.lower()
    if not data or len(data) > MAX_REF_BYTES:
        raise StyleError("empty or too large file")
    folder = refs_dir()
    folder.mkdir(parents=True, exist_ok=True)
    stem = _safe_stem(name)
    if suffix in IMAGE_EXTENSIONS:
        path = _free(folder, stem, ".jpg" if suffix == ".jpeg" else suffix)
        path.write_bytes(data)
        return [path.name]
    if suffix not in CLIP_EXTENSIONS:
        raise StyleError(f"give a picture ({', '.join(IMAGE_EXTENSIONS)}) or a short clip ({', '.join(CLIP_EXTENSIONS)})")
    tmp = folder / f".incoming{suffix}"
    tmp.write_bytes(data)
    try:
        duration = _duration(tmp)
        added = []
        for i in range(CLIP_FRAMES):
            t = duration * (i + 0.5) / CLIP_FRAMES
            path = _free(folder, f"{stem}_f{i + 1}", ".jpg")
            done = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{t:.3f}", "-i", str(tmp),
                                   "-frames:v", "1", "-vf", "scale='min(1920,iw)':-2", "-q:v", "3", str(path)],
                                  capture_output=True, text=True)
            if done.returncode == 0 and path.exists():
                added.append(path.name)
        if not added:
            raise StyleError("no picture could be taken from this clip")
        n = notes()
        for f in added:
            n["refs"].setdefault(f, f"frame {added.index(f) + 1}/{len(added)} of the clip {name} (the motion of the edit)")
        _write_json(style_dir() / "refs.json", n)
        return added
    finally:
        tmp.unlink(missing_ok=True)


def _duration(clip: Path) -> float:
    done = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(clip)],
                          capture_output=True, text=True)
    try:
        return max(0.1, float(done.stdout.strip()))
    except ValueError as err:
        raise StyleError("this clip cannot be read") from err


def _ref(name: str) -> Path:
    path = (refs_dir() / Path(name).name).resolve()
    if path.parent != refs_dir().resolve() or not path.is_file():
        raise StyleError(f"unknown reference {name!r}")
    return path


def delete_reference(name: str) -> None:
    _ref(name).unlink()
    n = notes()
    n["refs"].pop(Path(name).name, None)
    _write_json(style_dir() / "refs.json", n)


def set_notes(note: str | None = None, refs: dict | None = None) -> dict:
    n = notes()
    if note is not None:
        n["note"] = str(note)[:4000]
    for name, text in (refs or {}).items():
        _ref(name)
        n["refs"][Path(name).name] = str(text)[:1000]
    _write_json(style_dir() / "refs.json", n)
    return n


def style_file(path: str) -> Path:
    """A file of theme/landscape served to the app (references, control sheet), never outside it."""
    target = (style_dir() / path).resolve()
    root = style_dir().resolve()
    if root not in target.parents or not target.is_file():
        raise StyleError(f"unknown file {path!r}")
    return target


# ---------------- versions ----------------

def snapshot(label: str) -> str:
    """Keep the current style (layer, components, description, fonts, sheet) in history/. Returns the version id."""
    folder = style_dir() / "history"
    version = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = folder / version
    i = 2
    while target.exists():
        target = folder / f"{version}-{i}"
        i += 1
    target.mkdir(parents=True)
    if layer_file().exists():
        shutil.copy2(layer_file(), target / layer_file().name)
    for name in VERSIONED:
        source = style_dir() / name
        if source.is_dir():
            shutil.copytree(source, target / name)
        elif source.is_file():
            shutil.copy2(source, target / name)
    (target / "label.txt").write_text(label[:200], encoding="utf-8")
    for old in sorted((p for p in folder.iterdir() if p.is_dir()), reverse=True)[HISTORY_KEEP:]:
        shutil.rmtree(old, ignore_errors=True)
    return target.name


def restore(version: str, label: str = "") -> str:
    """Put a kept version back (the current one is kept first, so going back can be undone). Returns the new snapshot."""
    source = (style_dir() / "history" / version).resolve()
    if source.parent != (style_dir() / "history").resolve() or not source.is_dir():
        raise StyleError(f"unknown version {version!r}")
    kept = snapshot(label or f"before going back to {version}")
    if (source / layer_file().name).exists():
        shutil.copy2(source / layer_file().name, layer_file())
    for name in VERSIONED:
        current, old = style_dir() / name, source / name
        if current.is_dir():
            shutil.rmtree(current)
        elif current.is_file():
            current.unlink()
        if old.is_dir():
            shutil.copytree(old, current)
        elif old.is_file():
            shutil.copy2(old, current)
    return kept
