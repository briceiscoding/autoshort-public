"""Export copy to a chosen folder (never overwrites, name cleaned, folder checked first) and the reset job."""
import pytest

from autoshort_server import pipelines
from copy_export import clean_name, free_stem


def test_clean_name():
    assert clean_name('Mon short: "v1"?.mp4', "fallback") == "Mon short v1"
    assert clean_name(" ... ", "fallback") == "fallback"


def test_free_stem_never_overwrites(tmp_path):
    assert free_stem(tmp_path, "short") == "short"
    (tmp_path / "short.mp4").write_bytes(b"")
    (tmp_path / "short_v2.srt").write_text("")
    assert free_stem(tmp_path, "short") == "short_v3"


def test_copy_step(tmp_path):
    video = tmp_path / "my-short"
    (video / "exports").mkdir(parents=True)
    assert pipelines.copy_step(video, {}) == []
    assert pipelines.copy_step(video, {"dest": str(video / "exports")}) == []
    with pytest.raises(RuntimeError):
        pipelines.copy_step(video, {"dest": str(tmp_path / "missing")})
    dest = tmp_path / "out"
    dest.mkdir()
    [step] = pipelines.copy_step(video, {"dest": str(dest), "name": "Final", "srt": False})
    assert step.command[-3:] == [str(dest), "Final", "0"]


def test_reset_needs_an_import(tmp_path, monkeypatch):
    video = tmp_path / "my-short"
    (video / "rush").mkdir(parents=True)
    (video / "rush" / "take.mp4").write_bytes(b"")
    monkeypatch.setattr(pipelines, "video_dir", lambda slug: video)
    with pytest.raises(RuntimeError, match="import the video first"):
        pipelines.reset_steps("my-short", {})
    (video / "data" / "cache").mkdir(parents=True)
    (video / "data" / "cache" / "transcript_raw.json").write_text("{}")
    assert [s.name for s in pipelines.reset_steps("my-short", {})][1] == "Build the default plan (replaces the current one)"
