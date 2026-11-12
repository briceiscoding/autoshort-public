"""Brand kit imported from the app: sound effects per moment and the subscribe overlay, written to the library and the theme."""
import json
import shutil

import pytest

from autoshort_server import library
from autoshort_server.config import THEME_FILE


@pytest.fixture
def kit(tmp_path, monkeypatch):
    theme = tmp_path / "theme.json"
    shutil.copyfile(THEME_FILE, theme)
    monkeypatch.setattr(library, "THEME_FILE", theme)

    class Cfg:
        library_root = tmp_path / "library"
        projects_root = tmp_path / "projects"
    monkeypatch.setattr(library, "load_config", lambda: Cfg)
    return tmp_path


def test_missing_files_are_reported(kit):
    status = library.brand_kit()
    assert status["subscribe"]["exists"] is False
    assert status["sfx"] and not any(s["exists"] for s in status["sfx"])


def test_sfx_for_a_moment_and_never_overwritten(kit):
    assert library.save_sfx("My Pop!.wav", b"RIFF....", "logo") == "My-Pop.wav"
    assert library.save_sfx("My Pop!.wav", b"RIFF....") == "My-Pop-2.wav"
    assert json.loads((kit / "theme.json").read_text(encoding="utf-8"))["sfx"]["logo"] == "My-Pop.wav"
    assert next(s for s in library.brand_kit()["sfx"] if s["rule"] == "logo")["exists"]
    with pytest.raises(library.LibraryError):
        library.save_sfx("x.exe", b"MZ")
    with pytest.raises(library.LibraryError):
        library.save_sfx("x.wav", b"RIFF", "unknown-moment")


def test_subscribe_overlay_replaces_keyed_copies(kit):
    cached = kit / "projects" / "a-short" / "data" / "cache" / "subscribe.webm"
    cached.parent.mkdir(parents=True)
    cached.write_bytes(b"old")
    assert library.save_subscribe_overlay("abonne.mp4", b"\x00\x00\x00\x18ftyp") == "brand/abonne.mp4"
    assert not cached.exists()
    assert library.brand_kit()["subscribe"] == {"file": "brand/abonne.mp4", "exists": True}
