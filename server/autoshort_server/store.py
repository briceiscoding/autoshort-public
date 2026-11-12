"""Projects on disk: projects/<slug>/ with rush/ and assets/ (your files, copied in by the app and never modified),
diagrams/ (optional hand-written diagrams), data/ (everything the app generates) and exports/ (rendered videos,
never overwritten).
"""
import json
import os
import re
import shutil
import subprocess
import sys
import time
import unicodedata
from datetime import datetime
from functools import lru_cache
from pathlib import Path

import jsonschema

from .config import APP_DIR_NAME, DIAGRAMS_DIR_NAME, EXPORTS_DIR_NAME, SCHEMA_DIR, THEME_FILE, load_config
from .media import asset_id, probe_asset
from .models import Plan

HISTORY_EVERY_S = 60.0
HISTORY_KEEP = 300
LABELS_FILE = "labels.json"  # history/labels.json: snapshot file name -> what it was (e.g. before a Claude draft)
READ_ONLY_DIRS = ("rush", "assets")
PROJECT_DIRS = ("rush", "assets", DIAGRAMS_DIR_NAME, APP_DIR_NAME, EXPORTS_DIR_NAME)
VIDEO_EXTENSIONS = (".mp4", ".mov", ".mkv", ".m4v", ".webm")


class StoreError(Exception):
    pass


@lru_cache
def plan_validator() -> jsonschema.Draft202012Validator:
    schema = json.loads((SCHEMA_DIR / "plan.schema.json").read_text(encoding="utf-8"))
    return jsonschema.Draft202012Validator(schema)


def validate_plan(data: dict) -> list[str]:
    """Errors from the JSON Schema contract and the pydantic mirror (empty when valid)."""
    errors = [f"{'/'.join(str(p) for p in e.absolute_path)}: {e.message}" for e in plan_validator().iter_errors(data)]
    if not errors:
        try:
            Plan.model_validate(data)
        except Exception as err:  # pydantic.ValidationError
            errors.append(str(err))
    return errors[:20]


def video_dir(slug: str) -> Path:
    root = load_config().projects_root.resolve()
    path = (root / slug).resolve()
    if path.parent != root or not path.is_dir():
        raise StoreError(f"unknown project {slug!r}")
    return path


def app_dir(slug: str) -> Path:
    path = video_dir(slug) / APP_DIR_NAME
    path.mkdir(exist_ok=True)
    return path


def safe_child(base: Path, relative: str) -> Path:
    path = (base / relative).resolve()
    if base.resolve() not in path.parents and path != base.resolve():
        raise StoreError("path outside its folder")
    return path


def assert_writable(path: Path, slug: str) -> None:
    """Refuse any write outside data/ and exports/ of the project (new files only in exports/)."""
    video = video_dir(slug)
    resolved = path.resolve()
    allowed = [video / APP_DIR_NAME, video / EXPORTS_DIR_NAME]
    if not any(a.resolve() in resolved.parents or a.resolve() == resolved for a in allowed):
        raise StoreError(f"refusing to write {resolved}")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def write_json_atomic(path: Path, data) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, path)


def list_videos() -> list[dict]:
    root = load_config().projects_root
    out = []
    if not root.is_dir():
        return out
    for d in sorted(root.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if not d.is_dir() or d.name.startswith((".", "._")):
            continue
        rush = list_files(d / "rush")
        outputs = sorted(f.name for f in (d / EXPORTS_DIR_NAME).glob("*.mp4")) if (d / EXPORTS_DIR_NAME).is_dir() else []
        out.append({
            "slug": d.name,
            "hasPlan": (d / APP_DIR_NAME / "plan.json").exists(),
            "hasDraft": (d / APP_DIR_NAME / "plan.draft.json").exists(),
            "rush": rush,
            "outputs": outputs,
            "modified": datetime.fromtimestamp(d.stat().st_mtime).isoformat(timespec="seconds"),
        })
    return out


def delete_project(slug: str) -> None:
    """Send projects/<slug> to the recycle bin (Windows) or the Trash (macOS), so a mistake can be undone."""
    folder = video_dir(slug)
    if os.name == "nt":
        # UTF-8 output so a Windows error message reads correctly; one line, without the PowerShell call site.
        script = ("[Console]::OutputEncoding = [Text.Encoding]::UTF8; Add-Type -AssemblyName Microsoft.VisualBasic; "
                  "try { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($env:AUTOSHORT_TRASH, "
                  "'OnlyErrorDialogs', 'SendToRecycleBin') } catch { [Console]::Out.WriteLine("
                  "$_.Exception.InnerException.Message); exit 1 }")
        command = ["powershell", "-NoProfile", "-NonInteractive", "-Command", script]
        env = {**os.environ, "AUTOSHORT_TRASH": str(folder)}
    elif sys.platform == "darwin":
        script = 'on run argv\n tell application "Finder" to delete (POSIX file (item 1 of argv) as alias)\nend run'
        command, env = ["osascript", "-e", script, str(folder)], None
    else:
        raise StoreError("no recycle bin on this system: delete the folder by hand")
    # A file still being read (the video streamed to a preview that just closed) blocks the move for a moment.
    for attempt in range(4):
        if attempt:
            time.sleep(1.5)
        done = subprocess.run(command, env=env, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if done.returncode == 0 and not folder.exists():
            return
    detail = (done.stdout or done.stderr).strip().splitlines()
    raise StoreError(f"could not move {folder.name} to the recycle bin, a file is probably still in use (close the "
                     f"editor of this short or the video player, then try again). {detail[0][:200] if detail else ''}")


def list_files(folder: Path) -> list[str]:
    if not folder.is_dir():
        return []
    return sorted(f.name for f in folder.iterdir() if f.is_file() and not f.name.startswith("._"))


def load_theme() -> dict:
    return json.loads(THEME_FILE.read_text(encoding="utf-8"))


def video_state(slug: str) -> dict:
    video = video_dir(slug)
    app = video / APP_DIR_NAME
    cache = app / "cache"
    return {
        "slug": slug,
        "plan": read_json(app / "plan.json"),
        "draft": read_json(app / "plan.draft.json"),
        "analysis": read_json(app / "analysis.json"),
        "theme": load_theme(),
        "files": {"assets": list_files(video / "assets"), "rush": list_files(video / "rush"),
                  "exports": list_files(video / EXPORTS_DIR_NAME),
                  "diagrams": [f for f in list_files(video / DIAGRAMS_DIR_NAME) if f.endswith(".tsx")]},
        "folder": str(video),
        "prepared": {
            "subscribe": f"{APP_DIR_NAME}/cache/subscribe.webm" if (cache / "subscribe.webm").exists() else None,
            # Speaker cutouts (rush time ranges) for bg pictures.
            "mattes": [m for m in (read_json(cache / "matte" / "index.json") or []) if (video / m["file"]).exists()],
        },
        "notes": (video / "assets" / "notes.md").read_text(encoding="utf-8", errors="replace")
        if (video / "assets" / "notes.md").exists() else None,
        "draftRequest": read_json(cache / "draft_request.json") if (app / "plan.draft.json").exists() else None,
    }


def save_plan(slug: str, data: dict, snapshot: bool = False, label: str = "", auto_snapshot: bool = True) -> dict:
    """Write plan.json. The previous plan goes to History when snapshot is asked, or at most once a minute
    (auto_snapshot); label names that snapshot in the History list."""
    errors = validate_plan(data)
    if errors:
        raise StoreError("invalid plan: " + "; ".join(errors))
    app = app_dir(slug)
    target = app / "plan.json"
    assert_writable(target, slug)
    history = app / "history"
    history.mkdir(exist_ok=True)
    snapshots = sorted(history.glob("plan_*.json"))
    last = snapshots[-1].stat().st_mtime if snapshots else 0
    if target.exists() and (snapshot or (auto_snapshot and time.time() - last > HISTORY_EVERY_S)):
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")[:-3]
        name = f"plan_{stamp}.json"
        (history / name).write_bytes(target.read_bytes())
        labels = read_json(history / LABELS_FILE) or {}
        if label:
            labels[name] = label[:200]
        for old in snapshots[:-HISTORY_KEEP]:
            labels.pop(old.name, None)
            old.unlink()
        if label or len(snapshots) > HISTORY_KEEP:
            write_json_atomic(history / LABELS_FILE, labels)
    write_json_atomic(target, data)
    return {"ok": True, "savedAt": datetime.now().isoformat(timespec="seconds")}


def list_history(slug: str) -> list[dict]:
    history = app_dir(slug) / "history"
    if not history.is_dir():
        return []
    labels = read_json(history / LABELS_FILE) or {}
    return [{"name": f.name, "size": f.stat().st_size, "label": labels.get(f.name),
             "at": datetime.fromtimestamp(f.stat().st_mtime).isoformat(timespec="seconds")}
            for f in sorted(history.glob("plan_*.json"), reverse=True)]


def read_history(slug: str, name: str) -> dict:
    path = safe_child(app_dir(slug) / "history", name)
    data = read_json(path)
    if data is None:
        raise StoreError("unknown snapshot")
    return data


def accept_draft(slug: str, keep: bool = True) -> dict:
    """Replace the plan with the draft. keep: the current plan is first saved in History, named after the
    feedback that produced the draft; without it the current plan is replaced without a snapshot."""
    app = app_dir(slug)
    draft = read_json(app / "plan.draft.json")
    if draft is None:
        raise StoreError("no draft")
    feedback = (read_json(app / "cache" / "draft_request.json") or {}).get("feedback")
    label = f"Before Claude: {feedback}" if feedback else "Before the Claude proposal"
    result = save_plan(slug, draft, snapshot=keep, label=label if keep else "", auto_snapshot=keep)
    (app / "plan.draft.json").unlink()
    return result


def discard_draft(slug: str) -> None:
    path = app_dir(slug) / "plan.draft.json"
    if path.exists():
        path.unlink()


def next_version(slug: str) -> int:
    out = video_dir(slug) / EXPORTS_DIR_NAME
    versions = [int(p.stem.rsplit("_v", 1)[1]) for p in out.glob(f"{slug}_v*.mp4") if p.stem.rsplit("_v", 1)[1].isdigit()] \
        if out.is_dir() else []
    return max(versions, default=0) + 1


def slugify(name: str) -> str:
    text = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")[:60]


def create_project(name: str) -> dict:
    slug = slugify(name)
    if not slug:
        raise StoreError("give the project a name (letters or digits)")
    root = load_config().projects_root
    root.mkdir(parents=True, exist_ok=True)
    path = root / slug
    if path.exists():
        raise StoreError(f"a project named {slug!r} already exists")
    for sub in PROJECT_DIRS:
        (path / sub).mkdir(parents=True)
    return {"slug": slug}


def safe_file_name(name: str) -> str:
    base = Path(name).name
    stem, suffix = Path(base).stem, Path(base).suffix.lower()
    clean = re.sub(r"[^\w.\-]+", "_", unicodedata.normalize("NFC", stem)).strip("._") or "file"
    return clean[:120] + suffix


def incoming_path(slug: str, kind: str, name: str) -> Path:
    """Where an added file goes: rush/ (one video, replacing nothing) or assets/ (never overwrites)."""
    if kind not in ("rush", "assets"):
        raise StoreError("files go to rush or assets")
    folder = video_dir(slug) / kind
    folder.mkdir(exist_ok=True)
    clean = safe_file_name(name)
    if kind == "rush":
        if Path(clean).suffix not in VIDEO_EXTENSIONS:
            raise StoreError(f"the rush must be a video ({', '.join(VIDEO_EXTENSIONS)})")
        if list_files(folder):
            raise StoreError("this project already has its rush (one rush per short)")
    target = folder / clean
    if target.exists():
        raise StoreError(f"{kind}/{clean} already exists")
    return target


async def receive_file(slug: str, kind: str, name: str, chunks) -> dict:
    """Stream an uploaded file to disk (rushes are several GB: never held in memory)."""
    target = incoming_path(slug, kind, name)
    partial = target.with_name(target.name + ".part")
    try:
        with partial.open("wb") as handle:
            async for chunk in chunks:
                handle.write(chunk)
        os.replace(partial, target)
    finally:
        if partial.exists():
            partial.unlink()
    return _added(slug, kind, target)


def copy_local_file(slug: str, kind: str, source: str) -> dict:
    """Copy a file from this computer (path typed or dropped) into the project."""
    src = Path(source.strip().strip('"'))
    if not src.is_file():
        raise StoreError(f"file not found: {src}")
    target = incoming_path(slug, kind, src.name)
    partial = target.with_name(target.name + ".part")
    shutil.copyfile(src, partial)
    os.replace(partial, target)
    return _added(slug, kind, target)


def _added(slug: str, kind: str, target: Path) -> dict:
    """What the UI needs after a file arrives: for an asset, its catalog entry (typed like at import)."""
    out = {"file": f"{kind}/{target.name}", "size": target.stat().st_size, "asset": None}
    if kind == "assets" and target.suffix.lower() not in (".md", ".txt"):
        plan = read_json(app_dir(slug) / "plan.json") or {}
        taken = {a["id"] for a in plan.get("assets", [])}
        out["asset"] = probe_asset(target, out["file"], asset_id(target.name, taken))
    return out
