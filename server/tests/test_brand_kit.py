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


def test_delete_sfx_refused_while_used(kit, monkeypatch):
    trashed = []
    monkeypatch.setattr("autoshort_server.store.send_to_trash", lambda path, hint="": (trashed.append(path.name), path.unlink()))
    library.save_sfx("pop.wav", b"RIFF....", "logo")
    library.save_sfx("free.wav", b"RIFF....")
    library.save_sfx("placed.wav", b"RIFF....")
    plan = kit / "projects" / "a-short" / "data" / "plan.json"
    plan.parent.mkdir(parents=True)
    plan.write_text(json.dumps({"sfx": [{"id": "s1", "file": "placed.wav", "at": 1}]}), encoding="utf-8")
    with pytest.raises(library.LibraryError, match="A logo appears"):
        library.delete_sfx("pop.wav")
    with pytest.raises(library.LibraryError, match="video a-short"):
        library.delete_sfx("placed.wav")
    for bad in ("../theme.json", "nothing.wav", "notes.txt"):
        with pytest.raises(library.LibraryError):
            library.delete_sfx(bad)
    library.delete_sfx("free.wav")
    assert trashed == ["free.wav"]
    uses = library.brand_kit()["sfxUses"]
    assert uses["pop.wav"] == ["A logo appears (shorts)"] and uses["placed.wav"] == ["video a-short"]
    assert "free.wav" not in library.brand_kit()["sfxFiles"]
