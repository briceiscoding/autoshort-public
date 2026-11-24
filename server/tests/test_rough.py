"""Rough cut format: the rush with its silences cut, in its own framing, nothing added; exported by ffmpeg."""
import json
import subprocess
import sys
from pathlib import Path

import pytest

from autoshort_server import formats, library, pipelines, store
from autoshort_server.config import THEME_FILE
from autoshort_server.models import Plan
from initial_plan import ROUGH_DEFAULTS, build_spans, clamp_to_speech, rough_options
from rough_export import filter_graph, kept_segments

JOBS = Path(__file__).resolve().parents[1] / "jobs"


@pytest.fixture
def projects(tmp_path, monkeypatch):
    class Cfg:
        projects_root = tmp_path
        library_root = tmp_path / "library"
        backend_port = 8765
        app_python = Path(sys.executable)
        gpu_python = Path(sys.executable)
        ai_python = Path(sys.executable)
    for module in (store, pipelines):
        monkeypatch.setattr(module, "load_config", lambda: Cfg)
    return tmp_path


def word(i, text, start, end):
    return {"id": f"w{i}", "text": text, "start": start, "end": end}


def test_a_rough_cut_project_has_no_theme_of_its_own(projects, monkeypatch):
    assert store.create_project("Interview", "rough") == {"slug": "interview", "format": "rough"}
    assert {v["slug"]: v["format"] for v in store.list_videos()} == {"interview": "rough"}
    assert formats.theme_file(projects / "interview") == THEME_FILE
    assert formats.load_theme("rough") == formats.load_theme("short")
    with pytest.raises(library.LibraryError):
        library.patch_theme({"colors": {"accent": "#FF0000"}}, "rough")


def test_only_the_silences_are_cut():
    # "euh" and a repeated take stay; the 1 s silence, the start and the end are cut.
    words = [word(0, "Bonjour", 1.0, 1.4), word(1, "euh", 1.5, 1.7), word(2, "je", 1.8, 1.9), word(3, "je", 2.0, 2.1),
             word(4, "suis", 2.2, 2.5), word(5, "là.", 3.5, 3.9)]
    spans = build_spans(words, 6.0, set(), repetitions=False)
    kept = [(s["start"], s["end"]) for s in spans if s["keep"]]
    assert kept == [(0.92, 2.58), (3.42, 3.98)]
    assert [s["reason"] for s in spans if not s["keep"]] == ["outside", "silence", "outside"]
    assert not any(s["zoom"] for s in spans)


def make_rush(path: Path, seconds: float = 6) -> None:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", f"testsrc2=size=640x360:rate=25:d={seconds}",
                    "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-shortest", str(path)], check=True)


def run_job(script: str, *args: str) -> str:
    done = subprocess.run([sys.executable, str(JOBS / script), *args], capture_output=True, text=True, encoding="utf-8")
    assert done.returncode == 0, done.stderr[-2000:]
    return done.stdout


def probe(path: Path) -> dict:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate:format=duration",
                          "-of", "json", str(path)], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def test_import_plan_then_ffmpeg_export(projects):
    store.create_project("Rush", "rough")
    video = projects / "rush"
    (video / "rush").mkdir(exist_ok=True)
    make_rush(video / "rush" / "take.mp4")
    (video / "assets").mkdir(exist_ok=True)
    (video / "assets" / "logo__bonjour.png").write_bytes(b"not used")
    cache = video / "data" / "cache"
    cache.mkdir(parents=True, exist_ok=True)
    (cache / "probe.json").write_text(json.dumps({"rush": "rush/take.mp4", "width": 640, "height": 360, "fps": 25, "duration": 6.0}))
    words = [word(0, "Bonjour", 1.0, 1.4), word(1, "euh", 1.5, 1.7), word(2, "abonne-toi", 1.8, 2.5), word(3, "là.", 3.5, 3.9)]
    raw = [{"word": w["text"], "start": w["start"], "end": w["end"], "score": 0.9} for w in words]
    (cache / "transcript_raw.json").write_text(json.dumps({"words": raw}), encoding="utf-8")
    (cache / "assets.json").write_text(json.dumps([{"id": "logo_bonjour", "file": "assets/logo__bonjour.png", "kind": "image",
                                                     "width": 10, "height": 10}]))
    run_job("initial_plan.py", str(video), str(formats.theme_file(video)), "edited")
    plan = json.loads((video / "data" / "plan.json").read_text(encoding="utf-8"))
    Plan.model_validate(plan)
    assert plan["output"] == {"format": "rough"}
    assert plan["source"]["crop"] == {"x": 0, "y": 0, "width": 640, "height": 360}
    # Silences cut even when "edited" is asked; nothing placed, no subscribe on "abonne-toi".
    assert [(s["start"], s["end"]) for s in plan["spans"] if s["keep"]] == [(0.92, 2.58), (3.42, 3.98)]
    assert (plan["logos"], plan["cutIns"], plan["music"], plan["subscribe"], plan["unplacedAssets"]) == ([], [], None, None, [])

    steps = pipelines.export_steps("rush", {})
    assert [s.name for s in steps] == ["Cut the rush (ffmpeg)"]
    run_job("rough_export.py", str(video))
    out = video / "exports" / "rush_v1.mp4"
    info = probe(out)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    assert (v["width"], v["height"], v["r_frame_rate"]) == (640, 360, "25/1")
    assert abs(float(info["format"]["duration"]) - (1.66 + 0.56)) < 0.1
    assert not list((video / "exports").glob("*.srt"))
    analysis = json.loads((video / "data" / "analysis.json").read_text(encoding="utf-8"))
    assert analysis["exports"][-1]["file"] == "rush_v1.mp4"
    run_job("rough_export.py", str(video))
    assert (video / "exports" / "rush_v2.mp4").exists()  # never overwritten


def test_import_skips_the_face_track_and_preview_media(projects):
    store.create_project("Rush", "rough")
    video = projects / "rush"
    (video / "rush").mkdir(exist_ok=True)
    (video / "rush" / "take.mp4").write_bytes(b"")
    steps = {s.name: s for s in pipelines.import_steps("rush", {})}
    assert steps["Face track"].skip_if(None) and steps["Prepare preview media"].skip_if(None)
    store.create_project("Short", "short")
    (projects / "short" / "rush").mkdir(exist_ok=True)
    (projects / "short" / "rush" / "take.mp4").write_bytes(b"")
    steps = {s.name: s for s in pipelines.import_steps("short", {})}
    assert not steps["Face track"].skip_if(None) and not steps["Prepare preview media"].skip_if(None)


def test_kept_segments_and_filter_graph():
    plan = {"source": {"duration": 10.0}, "spans": [
        {"start": 0, "end": 1, "keep": False}, {"start": 1, "end": 2, "keep": True}, {"start": 2, "end": 3.5, "keep": True},
        {"start": 3.5, "end": 3.52, "keep": False}, {"start": 3.52, "end": 3.55, "keep": True},
        {"start": 3.55, "end": 5, "keep": False}, {"start": 5, "end": 11, "keep": True}]}
    # Neighbours joined, a 30 ms bit dropped, the end clamped to the rush.
    assert kept_segments(plan) == [(1, 3.5), (5, 10)]
    graph = filter_graph([(1, 3.5), (5, 10)])
    assert "trim=start=1.000:end=3.500" in graph and "afade=t=out:st=4.990:d=0.01" in graph
    assert graph.endswith("concat=n=2:v=1:a=1[v][a]")


def test_a_word_stretched_over_a_pause_is_clamped_to_the_speech():
    # Whisper put "scripts" over the 2 s pause: the speech (VAD) ends at 10 s and starts again at 12 s.
    words = [word(0, "tes", 9.69, 9.77), word(1, "scripts", 9.85, 12.33), word(2, "te", 12.35, 12.53)]
    vad = [{"start": 0, "end": 10.0}, {"start": 12.0, "end": 22.0}]
    assert clamp_to_speech(words, vad) == 1
    assert words[1]["end"] == 10.0 and words[2]["start"] == 12.35
    spans = build_spans(words, 22.0, set(), repetitions=False)
    assert [(s["start"], s["end"]) for s in spans if not s["keep"] and s["reason"] == "silence"] == [(10.08, 12.27)]
    # A word slightly past the end of its region stays as it is.
    assert clamp_to_speech([word(0, "fin", 9.8, 10.2)], vad) == 0


def test_rough_options_limits_and_memory():
    assert rough_options(None) == ROUGH_DEFAULTS
    # Out of the limits: clamped; a silence cut is at least two margins + 0.1 s.
    assert rough_options(None, {"margin": 2, "silence": 0.01}) == {**ROUGH_DEFAULTS, "margin": 0.5, "silence": 1.1}
    assert rough_options(None, {"margin": -1, "silence": 99, "evil": 1})["margin"] == 0.0
    assert rough_options(None, {"silence": 99})["silence"] == 3.0
    saved = {"themeOverrides": {"editing": {"autoCuts": True, "roughCut": {"repetitions": True, "margin": 0.2, "silence": 0.8,
                                                                            "hesitations": False}}}}
    # The current plan's options come back, the given ones win.
    assert rough_options(saved) == {"hesitations": False, "repetitions": True, "margin": 0.2, "silence": 0.8}
    assert rough_options(saved, {"hesitations": True})["hesitations"] is True
    assert pipelines.cut_arg({"rough": {"repetitions": True, "margin": 0.1, "other": "x"}}) == ["--rough", '{"repetitions": true, "margin": 0.1}']
    assert pipelines.cut_arg({"cuts": "raw"}) == ["raw"]


def test_options_cut_hesitations_repetitions_with_the_margin_asked():
    # "alors alors": a repeated take (one-word takes of 1 or 2 letters are never counted).
    words = [word(0, "Bonjour", 1.0, 1.4), word(1, "euh", 1.5, 1.7), word(2, "alors", 1.8, 1.9), word(3, "alors", 2.0, 2.1),
             word(4, "suis", 2.2, 2.5), word(5, "là.", 3.5, 3.9)]
    spans = build_spans(words, 6.0, {"euh"}, repetitions=True, margin=0.02, silence=0.3)
    cut = lambda t: any(not s["keep"] and s["start"] <= t < s["end"] for s in spans)
    # "euh" and the first "alors" go (one cut), the second "alors" stays; 0.02 s kept around the words.
    assert cut(1.6) and cut(1.85) and not cut(2.05)
    assert [(s["start"], s["end"]) for s in spans if not s["keep"]][:2] == [(0.0, 0.98), (1.42, 1.98)]
    # A bigger silence threshold keeps the 1 s pause.
    spans = build_spans(words, 6.0, set(), repetitions=False, margin=0.08, silence=1.2)
    assert [s["reason"] for s in spans if not s["keep"]] == ["outside", "outside"]
