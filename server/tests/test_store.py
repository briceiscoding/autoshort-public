"""Plan saving, history, and the write guard (never rush/, assets/, library/; never overwrite exports/), project creation and file intake."""
import json
from pathlib import Path

import pytest

from autoshort_server import store

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "sample" / "plan.json"


@pytest.fixture
def work(tmp_path, monkeypatch):
    video = tmp_path / "short-x"
    (video / "rush").mkdir(parents=True)
    (video / "assets").mkdir()

    class Cfg:
        projects_root = tmp_path
    monkeypatch.setattr(store, "load_config", lambda: Cfg)
    return video


def test_save_plan_and_history(work, monkeypatch):
    plan = json.loads(FIXTURE.read_text(encoding="utf-8"))
    store.save_plan("short-x", plan)
    assert (work / "data" / "plan.json").exists()
    store.save_plan("short-x", plan, snapshot=True)
    assert len(store.list_history("short-x")) == 1
    assert store.read_history("short-x", store.list_history("short-x")[0]["name"])["slug"] == "sample"


def test_invalid_plan_is_not_written(work):
    with pytest.raises(store.StoreError):
        store.save_plan("short-x", {"schemaVersion": 1})
    assert not (work / "data" / "plan.json").exists()


def test_write_guard(work):
    with pytest.raises(store.StoreError):
        store.assert_writable(work / "rush" / "x.mp4", "short-x")
    with pytest.raises(store.StoreError):
        store.assert_writable(work / "assets" / "x.png", "short-x")
    store.assert_writable(work / "data" / "plan.json", "short-x")


def test_unknown_video_and_traversal(work):
    with pytest.raises(store.StoreError):
        store.video_dir("../etc")
    with pytest.raises(store.StoreError):
        store.safe_child(work, "../../secret.txt")


def test_next_version(work):
    out = work / "exports"
    out.mkdir()
    (out / "short-x_v1.mp4").write_bytes(b"")
    (out / "short-x_v3.mp4").write_bytes(b"")
    assert store.next_version("short-x") == 4


def test_create_project_and_intake(tmp_path, monkeypatch):
    class Cfg:
        projects_root = tmp_path
    monkeypatch.setattr(store, "load_config", lambda: Cfg)
    assert store.create_project("Mon Short d'été !")["slug"] == "mon-short-d-ete"
    project = tmp_path / "mon-short-d-ete"
    assert all((project / d).is_dir() for d in store.PROJECT_DIRS)
    with pytest.raises(store.StoreError):
        store.create_project("mon short d ete")
    source = tmp_path / "Prise 1.MP4"
    source.write_bytes(b"video")
    assert store.copy_local_file("mon-short-d-ete", "rush", str(source))["file"] == "rush/Prise_1.mp4"
    with pytest.raises(store.StoreError):  # one rush per short
        store.copy_local_file("mon-short-d-ete", "rush", str(source))
    picture = tmp_path / "logo.png"
    picture.write_bytes(b"png")
    store.copy_local_file("mon-short-d-ete", "assets", str(picture))
    with pytest.raises(store.StoreError):  # never overwrites
        store.copy_local_file("mon-short-d-ete", "assets", str(picture))
    with pytest.raises(store.StoreError):
        store.incoming_path("mon-short-d-ete", "data", "x.json")
