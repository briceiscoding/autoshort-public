"""Job definitions: which steps each job runs, with which interpreter.

- App venv (server/.venv): probing, face track, plan building, audio prep, export finishing.
- AI venv (ai/.venv): WhisperX, faster-whisper, rembg, Robust Video Matting (CUDA on Windows, CPU / Apple MPS on macOS).
- Node (app/): EDL derivation and the Remotion render, sharing the TS code of the preview.
"""
import json
import shutil
import sys
from pathlib import Path

from .config import APP, APP_DIR_NAME, SCHEMA_DIR, SERVER, THEME_FILE, load_config
from .jobs import Step
from .store import read_json, video_dir

JOBS_DIR = SERVER / "jobs"
NODE = shutil.which("node") or "node"


def tsx(script: str, *args: str) -> list[str]:
    return [NODE, str(APP / "node_modules" / "tsx" / "dist" / "cli.mjs"), str(APP / "scripts" / script), *args]


def app_py(script: str, *args: str) -> list[str]:
    return [str(load_config().app_python if load_config().app_python.exists() else Path(sys.executable)),
            str(JOBS_DIR / script), *args]


def gpu_py(script: Path | str, *args: str) -> list[str]:
    python = load_config().ai_python
    if not python.exists():
        raise RuntimeError(f"the AI environment is not installed ({python}): run start.bat (Windows) or start.sh (macOS) once")
    return [str(python), str(script), *args]


def base_urls(slug: str) -> tuple[str, str]:
    port = load_config().backend_port
    return f"http://127.0.0.1:{port}/media/{slug}", f"http://127.0.0.1:{port}/library"


def find_rush(video: Path) -> Path:
    rushes = [f for f in (video / "rush").glob("*") if f.is_file() and not f.name.startswith("._")] if (video / "rush").is_dir() else []
    if not rushes:
        raise RuntimeError("no rush yet: add the video you filmed to the project first")
    if len(rushes) > 1:
        raise RuntimeError(f"several rushes, only one per short is supported for now: {[r.name for r in rushes]}")
    return rushes[0]


def import_steps(slug: str, params: dict) -> list[Step]:
    cfg = load_config()
    video = video_dir(slug)
    rush = find_rush(video)
    cache = video / APP_DIR_NAME / "cache"
    cache.mkdir(parents=True, exist_ok=True)
    prompt = params.get("prompt") or ""
    return [
        Step("Probe rush and type assets", app_py("import_probe.py", str(video), str(rush)), weight=0.5),
        Step("Transcribe (WhisperX large-v3 + Silero VAD)",
             gpu_py(JOBS_DIR / "gpu_transcribe.py", str(rush), str(cache / "transcript_raw.json"), str(cache / "vad.json"),
                    *(["--prompt", prompt] if prompt else [])), weight=6),
        Step("Voice bursts fallback (faster-whisper on energy bursts)",
             gpu_py(JOBS_DIR / "gpu_voice_bursts.py", str(rush), str(cache / "bursts.json")),
             skip_if=lambda job: not params.get("bursts") and not _has_gaps(cache), weight=3),
        Step("Face track", app_py("face_track.py", str(rush), str(cache / "face.json")), weight=1.5),
        Step("Build plan (cuts, captions, assets)", app_py("initial_plan.py", str(video), str(THEME_FILE), *cut_arg(params)),
             weight=0.5),
        Step("Prepare preview media", app_py("preview_prep.py", str(video), str(cfg.library_root), str(THEME_FILE)), weight=1),
    ]


def cut_arg(params: dict) -> list[str]:
    """The rush asked at import / reset: "raw" (cut silences, hesitations, repetitions) or "edited" (cut nothing)."""
    choice = params.get("cuts")
    return [choice] if choice in ("raw", "edited") else []


def reset_steps(slug: str, params: dict) -> list[Step]:
    """Rebuild the default edit (caption blocks, segments and zooms, named pictures, subscribe overlay) from the
    transcription already made: no GPU, a few seconds. It replaces the current plan and deletes its history and draft:
    manual edits, Claude's proposal and transcript corrections are gone. Exports stay."""
    cfg = load_config()
    video = video_dir(slug)
    rush = find_rush(video)
    cache = video / APP_DIR_NAME / "cache"
    if not (cache / "transcript_raw.json").exists():
        raise RuntimeError("nothing to reset: import the video first")
    return [
        Step("Probe rush and type assets", app_py("import_probe.py", str(video), str(rush)), weight=0.5),
        Step("Build the default plan (replaces the current one)", app_py("initial_plan.py", str(video), str(THEME_FILE), *cut_arg(params)),
             weight=0.5),
        Step("Prepare preview media", app_py("preview_prep.py", str(video), str(cfg.library_root), str(THEME_FILE)), weight=1),
    ]


def speech_gaps(regions: list[dict], words: list[tuple[float, float]], minimum: float = 1.5) -> list[tuple[float, float]]:
    """Stretches inside speech regions without any transcribed word (same rule as the UI linter)."""
    words = sorted(words)
    gaps = []
    for region in regions:
        cursor = region["start"]
        for s, e in words:
            if e <= region["start"] or s >= region["end"]:
                continue
            if s - cursor > minimum:
                gaps.append((cursor, s))
            cursor = max(cursor, e)
        if region["end"] - cursor > minimum:
            gaps.append((cursor, region["end"]))
    return gaps


def _has_gaps(cache: Path) -> bool:
    """True when VAD found speech that the transcription did not cover (Whisper skipped speech)."""
    vad = read_json(cache / "vad.json") or []
    raw = read_json(cache / "transcript_raw.json") or {}
    words = [(w["start"], w["end"]) for w in raw.get("words", []) if w.get("start") is not None]
    return bool(speech_gaps(vad, words))


def preview_steps(slug: str, params: dict) -> list[Step]:
    cfg = load_config()
    video = video_dir(slug)
    steps = [Step("Prepare preview media", app_py("preview_prep.py", str(video), str(cfg.library_root), str(THEME_FILE)))]
    plan = read_json(video / APP_DIR_NAME / "plan.json") or {}
    if any(l.get("process") == "rembg" for l in plan.get("logos", [])):
        steps.append(Step("Background removal (rembg)", gpu_py(JOBS_DIR / "gpu_rembg.py", str(video))))
    if any(c.get("mode") == "bg" for c in plan.get("cutIns", [])):
        steps.append(Step("Speaker cutout for bg pictures (Robust Video Matting)", gpu_py(JOBS_DIR / "gpu_matte.py", str(video)),
                          weight=4))
    return steps


def propose_steps(slug: str, params: dict) -> list[Step]:
    video = video_dir(slug)
    return [Step("Plan proposal (Claude headless)",
                 app_py("propose_plan.py", str(video), str(THEME_FILE), str(SCHEMA_DIR), load_config().claude_command))]


def export_steps(slug: str, params: dict) -> list[Step]:
    cfg = load_config()
    video = video_dir(slug)
    render = video / APP_DIR_NAME / "render"
    render.mkdir(parents=True, exist_ok=True)
    video_base, library_base = base_urls(slug)
    edl = render / "edl.json"
    copy = copy_step(video, params)
    return [
        Step("Derive EDL (TS, same code as the preview)",
             tsx("edl-cli.ts", str(video / APP_DIR_NAME / "plan.json"), str(THEME_FILE), str(edl)), weight=0.2),
        *preview_steps(slug, params),
        Step("Audio prep (voice loudnorm 2 pass, music ducking, SFX gains)",
             app_py("prepare_audio.py", str(video), str(edl), str(cfg.library_root), str(THEME_FILE)), weight=1.5),
        Step("Render (Remotion)",
             tsx("render.ts", "--video", str(video), "--edl", str(edl), "--theme", str(THEME_FILE),
                 "--video-base", video_base, "--library-base", library_base, "--out", str(render / "render.mp4"),
                 *(["--frames", params["frames"]] if params.get("frames") else [])),
             cwd=APP, weight=8),
        Step("Limiter, loudness, versioned output, SRT, control frames",
             app_py("finalize_export.py", str(video), str(edl), str(THEME_FILE)), weight=1),
        *copy,
    ]


def copy_step(video: Path, params: dict) -> list[Step]:
    """Optional copy of the export to a folder chosen in the app (params dest, name, srt); none for the project's
    own exports folder. Checked before the render so a wrong folder fails at once."""
    dest = str(params.get("dest") or "").strip()
    if not dest:
        return []
    folder = Path(dest).expanduser()
    if not folder.is_absolute() or not folder.is_dir():
        raise RuntimeError(f"export folder not found: {dest}")
    if folder.resolve() == (video / "exports").resolve():
        return []
    name = str(params.get("name") or "").strip() or video.name
    return [Step(f"Copy to {folder}", app_py("copy_export.py", str(video), str(folder), name, "1" if params.get("srt", True) else "0"),
                 weight=0.3)]


JOB_TYPES = {
    "import": import_steps,
    "reset": reset_steps,
    "preview": preview_steps,
    "propose": propose_steps,
    "export": export_steps,
}


def describe() -> str:
    return json.dumps(sorted(JOB_TYPES))
