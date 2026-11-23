"""YouTube 16:9 style made from references: reference intake, versions and going back, the checks run on what Claude
writes (theme layer, fonts, TypeScript) and the job's prompt."""
import json
import shutil
import subprocess

import pytest

import style_job
from autoshort_server import formats, pipelines, style
from autoshort_server.config import THEME_FILE


@pytest.fixture
def theme_dir(tmp_path, monkeypatch):
    folder = tmp_path / "theme"
    folder.mkdir()
    for name in ("theme.json", "theme.landscape.json"):
        shutil.copyfile(THEME_FILE.with_name(name), folder / name)
    for module in (style, style_job, formats):
        monkeypatch.setattr(module, "THEME_FILE", folder / "theme.json")
    monkeypatch.setattr(formats, "THEME_FILES", {"short": folder / "theme.json", "landscape": folder / "theme.landscape.json"})
    return folder


def png(color=(200, 30, 30)) -> bytes:
    from io import BytesIO
    from PIL import Image
    out = BytesIO()
    Image.new("RGB", (320, 180), color).save(out, "PNG")
    return out.getvalue()


def test_references_notes_and_removal(theme_dir):
    assert style.add_reference("Mon écran préféré!.png", png()) == ["Mon_ecran_prefere.png"]
    assert style.add_reference("Mon écran préféré!.png", png()) == ["Mon_ecran_prefere_2.png"]
    style.set_notes("sobre et moderne", {"Mon_ecran_prefere.png": "les sous-titres jaunes"})
    state = style.state()
    assert state["note"] == "sobre et moderne"
    assert {r["file"]: r["note"] for r in state["refs"]} == {"Mon_ecran_prefere.png": "les sous-titres jaunes", "Mon_ecran_prefere_2.png": ""}
    style.delete_reference("Mon_ecran_prefere.png")
    assert [r["file"] for r in style.state()["refs"]] == ["Mon_ecran_prefere_2.png"]
    with pytest.raises(style.StyleError):
        style.add_reference("script.exe", b"MZ")
    with pytest.raises(style.StyleError):
        style.delete_reference("../theme.json")
    with pytest.raises(style.StyleError):
        style.style_file("../theme.json")
    assert style.style_file("refs/Mon_ecran_prefere_2.png").is_file()


def test_a_clip_becomes_frames(theme_dir, tmp_path):
    clip = tmp_path / "montage.mp4"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=10",
                    "-t", "3", "-pix_fmt", "yuv420p", str(clip)], check=True)
    added = style.add_reference("Montage.mp4", clip.read_bytes())
    assert added == [f"Montage_f{i}.jpg" for i in range(1, style.CLIP_FRAMES + 1)]
    assert "Montage.mp4" in style.notes()["refs"]["Montage_f1.jpg"]
    assert not list((theme_dir / "landscape" / "refs").glob(".incoming*"))


def test_versions_and_going_back(theme_dir):
    components = theme_dir / "landscape" / "components"
    components.mkdir(parents=True)
    (components / "Captions.tsx").write_text("// v1", encoding="utf-8")
    layer = json.loads((theme_dir / "theme.landscape.json").read_text(encoding="utf-8"))
    first = style.snapshot("before the style creation")
    # Claude's new style: another accent, a new component, one removed.
    layer["colors"] = {"accent": "#FFD400"}
    (theme_dir / "theme.landscape.json").write_text(json.dumps(layer), encoding="utf-8")
    (components / "Captions.tsx").unlink()
    (components / "CutIn.tsx").write_text("// v2", encoding="utf-8")
    kept = style.restore(first)
    assert sorted(p.name for p in components.iterdir()) == ["Captions.tsx"]
    assert "colors" not in json.loads((theme_dir / "theme.landscape.json").read_text(encoding="utf-8"))
    # Going back is kept too: it can be undone.
    style.restore(kept)
    assert sorted(p.name for p in components.iterdir()) == ["CutIn.tsx"]
    assert json.loads((theme_dir / "theme.landscape.json").read_text(encoding="utf-8"))["colors"]["accent"] == "#FFD400"
    labels = [h["label"] for h in style.history()]
    assert "before the style creation" in labels and len(labels) == 3
    with pytest.raises(style.StyleError):
        style.restore("../..")


def test_layer_checks(theme_dir, monkeypatch):
    class Cfg:
        library_root = THEME_FILE.parents[1] / "library"
    monkeypatch.setattr(style_job, "load_config", lambda: Cfg)
    layer_path = theme_dir / "theme.landscape.json"
    layer = json.loads(layer_path.read_text(encoding="utf-8"))
    assert style_job.check_layer() == []
    # The canvas stays 1920 x 1080 whatever Claude writes.
    layer["format"]["width"] = 1080
    layer_path.write_text(json.dumps(layer), encoding="utf-8")
    assert style_job.check_layer() == []
    assert json.loads(layer_path.read_text(encoding="utf-8"))["format"]["width"] == 1920
    layer["colors"] = {"accent": "yellow"}
    layer_path.write_text(json.dumps(layer), encoding="utf-8")
    assert any("colors/accent" in e for e in style_job.check_layer())
    layer.pop("colors")
    layer["textStyles"]["caption"]["font"] = "fonts/NotInstalled-Bold.ttf"
    layer_path.write_text(json.dumps(layer), encoding="utf-8")
    assert style_job.check_layer() == [
        "theme/theme.landscape.json: font file fonts/NotInstalled-Bold.ttf is not in the library (fonts.json or an existing font)"]
    layer_path.write_text("{oops", encoding="utf-8")
    assert "not valid JSON" in style_job.check_layer()[0]


def test_typecheck_sends_back_the_components_errors(theme_dir, tmp_path):
    components = theme_dir / "landscape" / "components"
    components.mkdir(parents=True)
    assert style_job.typecheck(tmp_path) == []  # nothing to check
    (components / "Captions.tsx").write_text(
        "import React from 'react';\nimport {useCurrentFrame} from 'remotion';\n"
        "import {DefaultCaptions, type StyleProps} from '@kit/format';\n"
        "const Captions: React.FC<StyleProps['Captions']> = (props) => {\n"
        "\tconst frame = useCurrentFrame();\n"
        "\treturn <div style={{opacity: frame > 0 ? 1 : 0}}><DefaultCaptions {...props} /></div>;\n};\n"
        "export default Captions;\n", encoding="utf-8")
    assert style_job.typecheck(tmp_path) == []
    (components / "CutIn.tsx").write_text("const CutIn = (p: {asset: number}) => p.asset.toUpperCase();\nexport default CutIn;\n",
                                          encoding="utf-8")
    errors = style_job.typecheck(tmp_path)
    assert errors and all("CutIn.tsx" in e for e in errors)
    (components / "Sidebar.tsx").write_text("export default () => null;\n", encoding="utf-8")
    assert style_job.typecheck(tmp_path) == ["theme/landscape/components: unknown slot(s) Sidebar"]


def test_prompt_lists_references_notes_feedback_and_errors(theme_dir):
    style.add_reference("captions.png", png())
    style.set_notes("très lisible", {"captions.png": "le fond jaune des mots"})
    prompt = style_job.build_prompt("revise", "sous-titres plus bas", "TypeScript errors:\nCutIn.tsx(1,1)")
    assert "theme/landscape/refs/captions.png  (author: le fond jaune des mots)" in prompt
    assert "très lisible" in prompt and "sous-titres plus bas" in prompt and "CutIn.tsx(1,1)" in prompt
    assert "Keep \"format\" at width 1920 and height 1080" in prompt


def test_style_jobs_are_checked(monkeypatch, tmp_path):
    class Cfg:
        projects_root = tmp_path
        claude_command = "claude"
        app_python = tmp_path / "python"
    monkeypatch.setattr(pipelines, "load_config", lambda: Cfg)
    with pytest.raises(RuntimeError):
        pipelines.style_steps("revise", {})
    with pytest.raises(RuntimeError):
        pipelines.style_steps("delete-everything", {})
    steps = pipelines.style_steps("revise", {"feedback": "plus de jaune"})
    assert steps[0].command[-3:-1] == ["revise", "--feedback-file"]
    request = json.loads((tmp_path / ".style-sheet" / "data" / "cache" / "style_request.json").read_text(encoding="utf-8"))
    assert request["feedback"] == "plus de jaune"
    assert pipelines.style_steps("sheet", {})[0].env is None


def test_guard_puts_back_what_claude_changed_elsewhere(tmp_path):
    (tmp_path / "app" / "scripts").mkdir(parents=True)
    (tmp_path / "theme" / "landscape" / "components").mkdir(parents=True)
    (tmp_path / "app" / "node_modules").mkdir()
    script = tmp_path / "app" / "scripts" / "render.ts"
    script.write_text("original", encoding="utf-8")
    gone = tmp_path / "app" / "keep.ts"
    gone.write_text("keep me", encoding="utf-8")
    before = style_job.fingerprint(tmp_path)
    # What Claude may write, and what it may not.
    (tmp_path / "theme" / "theme.landscape.json").write_text("{}", encoding="utf-8")
    (tmp_path / "theme" / "landscape" / "components" / "Captions.tsx").write_text("x", encoding="utf-8")
    script.write_text("changed by claude", encoding="utf-8")
    gone.unlink()
    (tmp_path / "app" / "new.ts").write_text("new", encoding="utf-8")
    (tmp_path / "app" / "node_modules" / "cache.js").write_text("ignored", encoding="utf-8")
    found = style_job.put_back(before, tmp_path)
    assert sorted(found) == ["app/keep.ts deleted, put back", "app/new.ts created, removed", "app/scripts/render.ts changed, put back"]
    assert script.read_text(encoding="utf-8") == "original" and gone.read_text(encoding="utf-8") == "keep me"
    assert not (tmp_path / "app" / "new.ts").exists()
    assert (tmp_path / "theme" / "landscape" / "components" / "Captions.tsx").exists()
    assert (tmp_path / "theme" / "theme.landscape.json").exists()
