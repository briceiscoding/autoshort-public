"""Output formats: a vertical short (9:16, 1080x1920) or a YouTube long format video (16:9, 1920x1080).

They are two ways of editing, not one layout moved around: each format has its own theme (sizes, text placement,
cards, safe zone, caption rules...) and its own composition layers in the app (app/src/composition/formats).

- The format is chosen when the project is created and kept in projects/<slug>/data/project.json, then copied into
  the plan (plan.output.format) at import. A project without one is a short: projects made before stay identical.
- theme/theme.json is the theme of the shorts. theme/theme.landscape.json only holds what the 16:9 format changes
  (deep merged over theme.json), so the brand (colours, fonts, sounds) is shared unless the 16:9 file overrides it.
"""
import json
from pathlib import Path

from .config import APP_DIR_NAME, THEME_FILE

SHORT = "short"
LANDSCAPE = "landscape"
FORMATS = (SHORT, LANDSCAPE)
THEME_FILES = {SHORT: THEME_FILE, LANDSCAPE: THEME_FILE.with_name("theme.landscape.json")}
PROJECT_FILE = "project.json"


class FormatError(Exception):
    pass


def check_format(value: object) -> str:
    """The format asked for, "short" when none is given."""
    if value in (None, ""):
        return SHORT
    if value not in FORMATS:
        raise FormatError(f"unknown format {value!r}: choose one of {', '.join(FORMATS)}")
    return str(value)


def deep_merge(base: dict, patch: dict) -> dict:
    out = dict(base)
    for key, value in patch.items():
        out[key] = deep_merge(out[key], value) if isinstance(value, dict) and isinstance(out.get(key), dict) else value
    return out


def _read(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def project_format(video: Path) -> str:
    """Format of a project folder: data/project.json, else the plan's output.format, else a short."""
    data = video / APP_DIR_NAME
    value = _read(data / PROJECT_FILE).get("format") or ((_read(data / "plan.json").get("output") or {}).get("format"))
    return value if value in FORMATS else SHORT


def write_project_format(video: Path, value: str) -> None:
    data = video / APP_DIR_NAME
    data.mkdir(parents=True, exist_ok=True)
    project = {**_read(data / PROJECT_FILE), "format": check_format(value)}
    (data / PROJECT_FILE).write_text(json.dumps(project, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def format_patch(value: str) -> dict:
    """What a format changes over theme.json (empty for the shorts)."""
    return {} if value == SHORT else _read(THEME_FILES[value])


def load_theme(value: str = SHORT) -> dict:
    """The default theme of a format (before the per-video overrides of the plan)."""
    base = _read(THEME_FILE)
    return deep_merge(base, format_patch(value)) if value != SHORT else base


def theme_file(video: Path) -> Path:
    """Theme file to hand to the jobs of a project: theme/theme.json for a short (unchanged), else the format's theme
    resolved into the project's cache (rebuilt at every job, the cache is never versioned)."""
    value = project_format(video)
    if value == SHORT:
        return THEME_FILE
    target = video / APP_DIR_NAME / "cache" / f"theme.{value}.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(load_theme(value), ensure_ascii=False, indent=1), encoding="utf-8")
    return target
