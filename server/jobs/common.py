"""Helpers shared by job scripts (run as subprocesses by the backend)."""
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

APP_DIR_NAME = "data"


def progress(fraction: float, message: str = "") -> None:
    print(f"PROGRESS {fraction:.3f} {message}", flush=True)


def result(key: str, value) -> None:
    print(f"RESULT {key}={value}", flush=True)


def run_ffmpeg(args: list[str]) -> str:
    done = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-y", *args], capture_output=True, text=True,
                          encoding="utf-8", errors="replace")
    if done.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {done.stderr[-1500:]}")
    return done.stderr


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, path)


def app_dir(video: Path) -> Path:
    path = video / APP_DIR_NAME
    (path / "cache").mkdir(parents=True, exist_ok=True)
    return path


def guard_write(video: Path, target: Path) -> None:
    """Refuse writing outside <project>/data and new files of <project>/exports."""
    resolved = target.resolve()
    allowed = [(video / APP_DIR_NAME).resolve(), (video / "exports").resolve()]
    if not any(a == resolved or a in resolved.parents for a in allowed):
        raise SystemExit(f"refusing to write {resolved}")
    if (video / "exports").resolve() in resolved.parents and resolved.exists():
        raise SystemExit(f"refusing to overwrite {resolved}")
