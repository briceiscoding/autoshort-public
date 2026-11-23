"""Output formats: a short (9:16, the default, unchanged) or a YouTube video (16:9), chosen at project creation.
Each has its own theme (theme.json / theme.json + theme.landscape.json), crop window and picture rules."""
import copy
import json
import shutil
from pathlib import Path

import jsonschema
import pytest

from autoshort_server import formats, library, store
from autoshort_server.config import SCHEMA_DIR, THEME_FILE
from autoshort_server.models import Plan
from initial_plan import crop_window, face_centre_y, full_frame_fits, place_assets

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "sample" / "plan.json"
PLAN = json.loads(FIXTURE.read_text(encoding="utf-8"))
THEME_SCHEMA = json.loads((SCHEMA_DIR / "theme.schema.json").read_text(encoding="utf-8"))


@pytest.fixture
def projects(tmp_path, monkeypatch):
    class Cfg:
        projects_root = tmp_path
    monkeypatch.setattr(store, "load_config", lambda: Cfg)
    return tmp_path


def test_create_project_keeps_its_format(projects):
    assert store.create_project("Mon tuto YouTube", "landscape") == {"slug": "mon-tuto-youtube", "format": "landscape"}
    assert store.create_project("Mon short") == {"slug": "mon-short", "format": "short"}
    project = json.loads((projects / "mon-tuto-youtube" / "data" / "project.json").read_text(encoding="utf-8"))
    assert project == {"format": "landscape"}
    listed = {v["slug"]: v["format"] for v in store.list_videos()}
    assert listed == {"mon-tuto-youtube": "landscape", "mon-short": "short"}
    with pytest.raises(store.StoreError):
        store.create_project("Carre", "square")
    assert not (projects / "carre").exists()


def test_video_state_sends_the_theme_of_its_format(projects):
    store.create_project("Tuto", "landscape")
    store.create_project("Short")
    landscape, short = store.video_state("tuto"), store.video_state("short")
    assert landscape["format"] == "landscape" and landscape["theme"]["format"]["width"] == 1920
    assert short["format"] == "short" and short["theme"] == json.loads(THEME_FILE.read_text(encoding="utf-8"))


def test_project_without_format_is_a_short_and_plan_is_the_fallback(tmp_path):
    video = tmp_path / "old"
    (video / "data").mkdir(parents=True)
    assert formats.project_format(video) == "short"
    (video / "data" / "plan.json").write_text(json.dumps({"output": {"format": "landscape"}}), encoding="utf-8")
    assert formats.project_format(video) == "landscape"


def test_landscape_theme_is_valid_and_shares_the_brand():
    short, landscape = formats.load_theme("short"), formats.load_theme("landscape")
    for theme in (short, landscape):
        assert list(jsonschema.Draft202012Validator(THEME_SCHEMA).iter_errors(theme)) == []
    assert (landscape["format"]["width"], landscape["format"]["height"]) == (1920, 1080)
    assert (short["format"]["width"], short["format"]["height"]) == (1080, 1920)
    assert landscape["colors"] == short["colors"] and landscape["sfx"] == short["sfx"]
    # Everything placed on the canvas stays inside the 16:9 frame.
    z = landscape["safeZone"]
    assert 0 <= z["x0"] < z["x1"] <= 1920 and 0 <= z["y0"] < z["y1"] <= 1080
    for style in landscape["textStyles"].values():
        assert z["x0"] <= style["x"] - style["maxWidth"] / 2 and style["x"] + style["maxWidth"] / 2 <= z["x1"]
        assert z["y0"] <= style["y"] <= z["y1"]


def test_theme_file_for_jobs(tmp_path):
    short, wide = tmp_path / "short", tmp_path / "wide"
    formats.write_project_format(short, "short")
    formats.write_project_format(wide, "landscape")
    assert formats.theme_file(short) == THEME_FILE
    resolved = formats.theme_file(wide)
    assert resolved.parent == wide / "data" / "cache"
    assert json.loads(resolved.read_text(encoding="utf-8")) == formats.load_theme("landscape")


def test_save_style_as_default_only_touches_its_format(tmp_path, monkeypatch):
    for name in ("theme.json", "theme.landscape.json"):
        shutil.copyfile(THEME_FILE.with_name(name), tmp_path / name)
    monkeypatch.setattr(library, "THEME_FILE", tmp_path / "theme.json")
    before = (tmp_path / "theme.json").read_text(encoding="utf-8")
    theme = library.patch_theme({"textStyles": {"caption": {"y": 900}}}, "landscape")
    assert theme["textStyles"]["caption"]["y"] == 900 and theme["format"]["width"] == 1920
    assert (tmp_path / "theme.json").read_text(encoding="utf-8") == before
    layer = json.loads((tmp_path / "theme.landscape.json").read_text(encoding="utf-8"))
    assert layer["textStyles"]["caption"]["y"] == 900 and "colors" not in layer
    library.patch_theme({"textStyles": {"caption": {"y": 1250}}})
    assert json.loads((tmp_path / "theme.json").read_text(encoding="utf-8"))["textStyles"]["caption"]["y"] == 1250
    assert json.loads((tmp_path / "theme.landscape.json").read_text(encoding="utf-8"))["textStyles"]["caption"]["y"] == 900
    with pytest.raises(library.LibraryError):
        library.patch_theme({"format": {"width": "wide"}}, "landscape")


def test_short_crop_is_unchanged():
    # Legacy rule: a 9:16 window centred in the full height of the rush.
    assert crop_window(1920, 1080, 1080, 1920) == {"x": 656, "y": 0, "width": 608, "height": 1080}
    assert crop_window(3840, 2160, 1080, 1920, face_y=500) == {"x": 1312, "y": 0, "width": 1215, "height": 2160}
    assert crop_window(1080, 1920, 1080, 1920) == {"x": 0, "y": 0, "width": 1080, "height": 1920}


def test_landscape_crop():
    assert crop_window(1920, 1080, 1920, 1080) == {"x": 0, "y": 0, "width": 1920, "height": 1080}
    assert crop_window(3840, 2160, 1920, 1080) == {"x": 0, "y": 0, "width": 3840, "height": 2160}
    # 4:3 rush: full height would leave bars, so the full width is kept.
    assert crop_window(1440, 1080, 1920, 1080) == {"x": 0, "y": 135, "width": 1440, "height": 810}
    # A rush filmed vertically: full width, the face at 40 % of the window, never outside the rush.
    assert crop_window(1080, 1920, 1920, 1080, face_y=700) == {"x": 0, "y": 457, "width": 1080, "height": 608}
    assert crop_window(1080, 1920, 1920, 1080, face_y=50) == {"x": 0, "y": 0, "width": 1080, "height": 608}
    assert crop_window(1080, 1920, 1920, 1080) == {"x": 0, "y": 656, "width": 1080, "height": 608}
    assert face_centre_y({"samples": [{"box": [0, 600, 10, 200]}, {"box": None}, {"box": [0, 700, 10, 200]}]}) == 800


def test_full_frame_pictures_follow_the_canvas_shape():
    vertical, wide, square = {"width": 1080, "height": 1920}, {"width": 1920, "height": 1080}, {"width": 1000, "height": 1000}
    assert full_frame_fits(vertical, 9 / 16) and not full_frame_fits(wide, 9 / 16) and not full_frame_fits(square, 9 / 16)
    assert full_frame_fits(wide, 16 / 9) and not full_frame_fits(vertical, 16 / 9) and not full_frame_fits(square, 16 / 9)
    words = [{"id": "w0", "text": "regarde", "start": 1.0, "end": 1.4}, {"id": "w1", "text": "ça.", "start": 1.4, "end": 1.8}]
    spans = [{"id": "s0", "start": 0, "end": 5, "keep": True}]
    catalog = [{"id": "p", "file": "assets/full__regarde.png", "kind": "image", **wide}]
    assert place_assets(catalog, words, spans)[1][0]["mode"] == "screen"
    assert place_assets(catalog, words, spans, 16 / 9)[1][0]["mode"] == "full"


def test_plan_output_format_on_both_contract_sides():
    plan = copy.deepcopy(PLAN)
    plan["output"] = {"format": "landscape"}
    assert store.validate_plan(plan) == []
    assert Plan.model_validate(plan).output.format == "landscape"
    plan["output"] = {"format": "square"}
    assert store.validate_plan(plan)
