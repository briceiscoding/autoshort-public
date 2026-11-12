"""Brand library edits made from the app: fonts (uploaded files or Google Fonts) and the default theme.

Fonts land in library/fonts/ (never overwritten: a name that exists gets a numbered suffix). The theme patch is
deep-merged into theme/theme.json and validated against schema/theme.schema.json before it is written.
"""
import json
import os
import re
import urllib.parse
import urllib.request
from pathlib import Path

import jsonschema

from .config import SCHEMA_DIR, THEME_FILE, load_config

FONT_EXTENSIONS = (".ttf", ".otf", ".woff", ".woff2")
MAX_FONT_BYTES = 30 * 1024 * 1024
GOOGLE_CSS = "https://fonts.googleapis.com/css?family={family}:100,100i,200,200i,300,300i,400,400i,500,500i,600,600i,700,700i,800,800i,900,900i"
WEIGHT_NAMES = {100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium", 600: "SemiBold",
                700: "Bold", 800: "ExtraBold", 900: "Black"}


class LibraryError(Exception):
    pass


def fonts_dir() -> Path:
    folder = load_config().library_root / "fonts"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def list_fonts() -> list[str]:
    """Font files of the library, as paths relative to the library ("fonts/x.ttf")."""
    return sorted(f"fonts/{f.name}" for f in fonts_dir().iterdir()
                  if f.is_file() and f.suffix.lower() in FONT_EXTENSIONS and not f.name.startswith("._"))


def _safe_name(name: str) -> str:
    stem, ext = os.path.splitext(Path(name).name)
    if ext.lower() not in FONT_EXTENSIONS:
        raise LibraryError(f"not a font file ({', '.join(FONT_EXTENSIONS)}): {name}")
    stem = re.sub(r"[^A-Za-z0-9_-]+", "-", stem).strip("-") or "font"
    return stem + ext.lower()


def _free_path(name: str) -> Path:
    folder = fonts_dir()
    path = folder / name
    stem, ext = path.stem, path.suffix
    i = 2
    while path.exists():
        path = folder / f"{stem}-{i}{ext}"
        i += 1
    return path


def save_font(name: str, data: bytes) -> str:
    if not data or len(data) > MAX_FONT_BYTES:
        raise LibraryError("empty or too large font file")
    if data[:4] not in (b"\x00\x01\x00\x00", b"OTTO", b"true", b"wOFF", b"wOF2"):
        raise LibraryError("this file is not a TrueType / OpenType / WOFF font")
    path = _free_path(_safe_name(name))
    path.write_bytes(data)
    return f"fonts/{path.name}"


def _fetch(url: str) -> bytes:
    # A plain client gets TrueType files from the Google Fonts CSS API (browsers get woff2).
    request = urllib.request.Request(url, headers={"User-Agent": "AutoShort"})
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read()


def import_google_font(family: str) -> list[str]:
    """Download every weight and style of a Google Fonts family into library/fonts. Returns the new files."""
    family = " ".join(family.split())
    if not re.fullmatch(r"[A-Za-z0-9 ]{2,60}", family):
        raise LibraryError("give the family name as shown on fonts.google.com, e.g. Bebas Neue")
    try:
        css = _fetch(GOOGLE_CSS.format(family=urllib.parse.quote(family))).decode("utf-8")
    except Exception as err:
        raise LibraryError(f'"{family}" not found on Google Fonts ({err})') from err
    faces = re.findall(r"font-style:\s*(\w+);\s*font-weight:\s*(\d+);\s*src:\s*url\(([^)]+)\)", css)
    if not faces:
        raise LibraryError(f'"{family}" not found on Google Fonts')
    existing = set(list_fonts())
    added = []
    for style, weight, url in faces:
        name = family.replace(" ", "") + "-" + WEIGHT_NAMES.get(int(weight), weight) + ("Italic" if style == "italic" else "")
        name += Path(urllib.parse.urlparse(url).path).suffix or ".ttf"
        if f"fonts/{name}" in existing:
            continue
        (fonts_dir() / name).write_bytes(_fetch(url))
        added.append(f"fonts/{name}")
    return added


def _merge(base, patch):
    if isinstance(base, dict) and isinstance(patch, dict):
        out = dict(base)
        for key, value in patch.items():
            out[key] = _merge(base.get(key), value) if isinstance(value, dict) and isinstance(base.get(key), dict) else value
        return out
    return patch


def patch_theme(patch: dict) -> dict:
    """Deep-merge a partial theme into theme/theme.json (the default of every video), validated before writing."""
    theme = _merge(json.loads(THEME_FILE.read_text(encoding="utf-8")), patch)
    schema = json.loads((SCHEMA_DIR / "theme.schema.json").read_text(encoding="utf-8"))
    errors = [f"{'/'.join(str(p) for p in e.absolute_path)}: {e.message}"
              for e in jsonschema.Draft202012Validator(schema).iter_errors(theme)]
    if errors:
        raise LibraryError("invalid theme: " + "; ".join(errors[:10]))
    tmp = THEME_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(theme, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, THEME_FILE)
    return theme


# ---------------- brand kit: sound effects and the subscribe overlay, imported from the app ----------------

SFX_EXTENSIONS = (".wav", ".mp3", ".ogg", ".m4a", ".flac")
OVERLAY_EXTENSIONS = (".mp4", ".mov", ".webm", ".mkv")
MAX_MEDIA_BYTES = 200 * 1024 * 1024
# Moments that play a sound (theme.json -> sfx), in the order shown in the app.
SFX_RULES = ("cutIn", "logo", "zoom", "conceptTyping", "diagramOpen", "diagramElement", "gauge", "gaugeLanding")


def _library_dir(sub: str) -> Path:
    folder = load_config().library_root / sub
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _save_media(sub: str, name: str, data: bytes, extensions: tuple[str, ...]) -> Path:
    stem, ext = os.path.splitext(Path(name).name)
    if ext.lower() not in extensions:
        raise LibraryError(f"expected a {' / '.join(extensions)} file: {name}")
    if not data or len(data) > MAX_MEDIA_BYTES:
        raise LibraryError("empty or too large file")
    stem = re.sub(r"[^A-Za-z0-9_-]+", "-", stem).strip("-") or "file"
    folder = _library_dir(sub)
    path, i = folder / f"{stem}{ext.lower()}", 2
    while path.exists():
        path, i = folder / f"{stem}-{i}{ext.lower()}", i + 1
    path.write_bytes(data)
    return path


def brand_kit() -> dict:
    """What the app needs from the library and whether it is there: subscribe overlay, sound effect per moment."""
    root = load_config().library_root
    theme = json.loads(THEME_FILE.read_text(encoding="utf-8"))
    sfx = theme.get("sfx", {})
    files = sorted(f.name for f in _library_dir("sfx").iterdir() if f.suffix.lower() in SFX_EXTENSIONS)
    return {
        "subscribe": {"file": theme["subscribe"]["file"], "exists": (root / theme["subscribe"]["file"]).is_file()},
        "sfx": [{"rule": r, "file": sfx.get(r), "exists": bool(sfx.get(r)) and (root / "sfx" / sfx[r]).is_file()}
                for r in SFX_RULES if r in sfx],
        "sfxFiles": files,
    }


def save_sfx(name: str, data: bytes, rule: str | None = None) -> str:
    """Add a sound to library/sfx; with a rule, it becomes the sound of that moment for every video."""
    if rule and rule not in SFX_RULES:
        raise LibraryError(f"unknown moment {rule}")
    path = _save_media("sfx", name, data, SFX_EXTENSIONS)
    if rule:
        patch_theme({"sfx": {rule: path.name}})
    return path.name


def save_subscribe_overlay(name: str, data: bytes) -> str:
    """The subscribe reminder animation (green background, keyed at export) for every video."""
    path = _save_media("brand", name, data, OVERLAY_EXTENSIONS)
    file = f"brand/{path.name}"
    patch_theme({"subscribe": {"file": file}})
    # Keyed copies of the previous overlay are stale: each short keys the new one again when needed.
    for cached in load_config().projects_root.glob("*/data/cache/subscribe.webm"):
        cached.unlink(missing_ok=True)
    return file
