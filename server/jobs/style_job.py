"""YouTube 16:9 style from the author's references, by Claude Code (headless), checked before it is used.

1. The current style is kept in theme/landscape/history (going back is one click in the app).
2. Claude reads the references and writes the 16:9 theme layer, the style components, style.md and fonts.json,
   and nothing else: its file tools are limited to those paths in the strict "dontAsk" permission mode (the user's
   own default mode, e.g. "auto", must not apply), no shell, no web; and whatever it changed elsewhere in the
   repository anyway is put back after the run (guard below).
3. Checks: Google Fonts download, theme layer (schema, 1920 x 1080, font files), TypeScript, then the control sheet
   render (one still per element). An error goes back to Claude, MAX_FIXES times at most; if it still fails, the
   previous style is put back and the job fails.
Mode "sheet" only renders the control sheet of the current style (after a manual change or going back).

Usage: python style_job.py <create|revise|sheet> [--feedback-file <json>]
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "server"))

import jsonschema  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

from autoshort_server import formats, library, style  # noqa: E402
from autoshort_server.config import APP, SCHEMA_DIR, THEME_FILE, load_config  # noqa: E402
from common import progress, result, run_ffmpeg  # noqa: E402

MAX_FIXES = 2
SHEET_SLUG = ".style-sheet"  # hidden project folder (data/cache and data/render only, never versioned)
SHEET_S = 32
NODE = shutil.which("node") or "node"
EDITABLE = ["theme/theme.landscape.json", "theme/landscape/components/**", "theme/landscape/style.md",
            "theme/landscape/fonts.json"]
DEFAULTS_TO_READ = ["app/src/composition/kit/format.ts", "app/src/composition/formats/landscape.tsx",
                    "app/src/composition/Captions.tsx", "app/src/composition/ConceptText.tsx",
                    "app/src/composition/AssetLayer.tsx", "app/src/composition/GaugeLayer.tsx",
                    "app/src/composition/diagrams/templates.tsx", "app/src/composition/diagrams/primitives.tsx",
                    "app/src/model/theme.ts", "theme/theme.json", "theme/theme.landscape.json"]


def tsx(script: str, *args: str) -> list[str]:
    return [NODE, str(APP / "node_modules" / "tsx" / "dist" / "cli.mjs"), str(APP / "scripts" / script), *args]


# ---------------- Claude ----------------

def build_prompt(mode: str, feedback: str, errors: str) -> str:
    st = style.state()
    refs = "\n".join(f"- theme/landscape/refs/{r['file']}" + (f"  (author: {r['note']})" if r["note"] else "") for r in st["refs"])
    fonts = "\n".join(library.list_fonts())
    previous = st["description"] or "(none yet)"
    task = {
        "create": "Create the YouTube 16:9 style from the references below.",
        "revise": "Revise the current YouTube 16:9 style following the author's feedback below; keep what they did not ask to change.",
    }[mode]
    return f"""You design the visual style of a French YouTube channel's long format videos (16:9, 1920 x 1080), edited by
AutoShort, an app that edits a face cam video from its transcript: captions word by word, concept words, logos,
picture cards, diagrams, gauges and a subscribe reminder. {task}

The author's references (screenshots of edits they like; frames of a clip show its motion). Open EVERY picture with
the Read tool and study typography, colours, caption look and position, cards and frames, lower thirds, motion:
{refs or '(no reference yet: make a clean, modern YouTube style)'}

The author's overall wish: {st['note'] or '(none)'}
{f'''
The author's feedback on the current style (it takes priority):
{feedback}
''' if feedback else ''}
Current style description (theme/landscape/style.md):
{previous}

The 16:9 style has its OWN identity, not the one of the author's shorts. You may only write these files:
1. theme/theme.landscape.json: the 16:9 theme layer, deep merged over theme/theme.json (schema: schema/theme.schema.json).
   Set the identity: colors (accent, white, cream, diagramBg, success), fonts (caption, display: family + file),
   textStyles (caption, highlight, keyword, concept: font file, size, colours, stroke, shadow, background, x / y /
   maxWidth), frameStyles (screen, bg), highlight, captions rules, logos, screen, bg, diagrams, zoom, subscribe x / y /
   scale. Keep "format" at width 1920 and height 1080. Leave "sfx" and "subscribe.file" alone. Positions are canvas px.
2. theme/landscape/components/<Slot>.tsx: optional components replacing a default element, `export default`, one per
   file, slots and props in app/src/composition/kit/format.ts (StyleProps): Captions, Concept, Logo, CutIn, Gauge,
   Subscribe, Diagram_<template> (flow, comparison, tree, hub, balance, forbidden). Write one only when the references
   show something the theme values cannot do (a caption animation, a lower third look, a card entrance, a frame).
   Imports: only 'react', 'remotion' and '@kit/format' (read it: theme, media, geometry and the default components to
   wrap). Animations from useCurrentFrame() only (the export renders frames in any order), no network, no timers,
   no randomness without a fixed seed. Text uses the fonts of the theme (fontFamilyOf(file) of a textStyles font or
   theme.fonts families): other fonts are not loaded. Each component must render every case of its props (all cut-in
   modes "screen", "bg" and "full"; captions with highlighted and keyword words; up to 6 diagram elements).
3. theme/landscape/fonts.json: Google Fonts families the style uses, e.g. ["Inter", "Bebas Neue"]. They are downloaded
   into library/fonts as fonts/<FamilyWithoutSpaces>-<Weight>.ttf (Weight: Thin ExtraLight Light Regular Medium
   SemiBold Bold ExtraBold Black, + "Italic"), e.g. fonts/BebasNeue-Regular.ttf. Fonts already in the library:
{fonts}
4. theme/landscape/style.md: in French, for the author: the style in a few lines, what each reference inspired, what
   each component does, what you could not reproduce.

Read the default implementations first: {', '.join(DEFAULTS_TO_READ)}.
After you finish, AutoShort downloads the fonts, validates the theme, typechecks the components and renders a control
sheet; any error comes back to you.
{f'''
FIX THESE ERRORS from the previous attempt (the files you wrote are still there, correct them):
{errors}
''' if errors else ''}"""


# ---------------- guard: nothing outside the style's files ----------------

SKIP_DIRS = {".git", "node_modules", ".venv", "__pycache__", ".pytest_cache", "dist", "render-bundle", "logs", "projects",
             "models"}
SKIP_FILES = {"app/src/composition/custom/registry.generated.ts", "app/src/composition/formats/style.generated.ts"}
KEEP_BYTES = 5 * 1024 * 1024


def allowed(rel: str) -> bool:
    return (rel == "theme/theme.landscape.json" or rel.startswith("theme/landscape/components/")
            or rel in ("theme/landscape/style.md", "theme/landscape/fonts.json") or rel in SKIP_FILES)


def fingerprint(root: Path = REPO) -> dict[str, tuple[int, int, bytes | None]]:
    """Every file of the repository (big generated folders aside) Claude may not change: size, mtime and content."""
    out = {}
    for folder, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            path = Path(folder) / name
            rel = path.relative_to(root).as_posix()
            if allowed(rel):
                continue
            try:
                st = path.stat()
                out[rel] = (st.st_size, st.st_mtime_ns, path.read_bytes() if st.st_size <= KEEP_BYTES else None)
            except OSError:
                continue
    return out


def put_back(before: dict[str, tuple[int, int, bytes | None]], root: Path = REPO) -> list[str]:
    """Undo what changed outside the style's files since `before`. Returns what was found (and put back)."""
    after = fingerprint(root)
    found = []
    for rel, (size, mtime, data) in before.items():
        now = after.get(rel)
        if now and now[:2] == (size, mtime):
            continue
        if data is None:
            found.append(f"{rel} changed and could not be put back (big file)")
            continue
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        found.append(f"{rel} {'deleted' if now is None else 'changed'}, put back")
    for rel in sorted(after.keys() - before.keys()):
        (root / rel).unlink(missing_ok=True)
        found.append(f"{rel} created, removed")
    return found


def run_claude(command: str, prompt: str) -> list[str]:
    """Runs Claude; returns the changes it made outside its files (already undone)."""
    exe = shutil.which(command)
    if not exe:
        raise SystemExit("Claude Code is not installed on this computer: npm install -g @anthropic-ai/claude-code, then see "
                         "Settings in AutoShort.")
    tools = ["Read", "Glob", "Grep", *(f"{tool}({path})" for path in EDITABLE for tool in ("Edit", "Write"))]
    args = [exe, "-p", "--output-format", "json", "--permission-mode", "dontAsk", "--allowedTools", *tools,
            "--disallowedTools", "Bash", "WebFetch", "WebSearch", "NotebookEdit"]
    started = time.time()
    before = fingerprint()
    try:
        done = subprocess.run(args, input=prompt, cwd=REPO, capture_output=True, text=True, encoding="utf-8", errors="replace")
    finally:
        outside = put_back(before)
    for line in outside:
        print(f"GUARD: {line}")
    if done.returncode != 0:
        raise SystemExit(f"claude exited {done.returncode}: {(done.stderr or done.stdout)[-1500:]}")
    try:
        envelope = json.loads(done.stdout)
    except ValueError:
        envelope = {}
    if envelope.get("is_error"):
        raise SystemExit(f"claude error: {str(envelope.get('result'))[:1500]}")
    cost = envelope.get("total_cost_usd")
    print(f"claude answered in {time.time() - started:.0f} s ({envelope.get('num_turns')} turns{f', ${cost:.3f}' if cost else ''})")
    return outside


# ---------------- checks ----------------

def import_fonts() -> list[str]:
    errors = []
    families = json.loads((style.style_dir() / "fonts.json").read_text(encoding="utf-8")) if (style.style_dir() / "fonts.json").exists() else []
    for family in families if isinstance(families, list) else []:
        try:
            added = library.import_google_font(str(family))
            print(f"font {family}: {len(added)} new file(s)")
        except library.LibraryError as err:
            errors.append(f"theme/landscape/fonts.json: {err}")
    return errors


def check_layer() -> list[str]:
    """Schema of the merged theme, the 1920 x 1080 canvas (put back if changed), font files in the library."""
    path = style.layer_file()
    try:
        layer = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as err:
        return [f"theme/theme.landscape.json is not valid JSON: {err}"]
    fmt = layer.setdefault("format", {})
    if fmt.get("width") != 1920 or fmt.get("height") != 1080:
        fmt.update(width=1920, height=1080)
        path.write_text(json.dumps(layer, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    theme = formats.deep_merge(json.loads(THEME_FILE.read_text(encoding="utf-8")), layer)
    schema = json.loads((SCHEMA_DIR / "theme.schema.json").read_text(encoding="utf-8"))
    errors = [f"theme/theme.landscape.json {'/'.join(str(p) for p in e.absolute_path)}: {e.message}"
              for e in jsonschema.Draft202012Validator(schema).iter_errors(theme)]
    if errors:
        return errors[:15]
    library_root = load_config().library_root
    files = {s["font"] for s in theme["textStyles"].values()} | {theme["fonts"]["caption"]["file"], theme["fonts"]["display"]["file"]}
    return [f"theme/theme.landscape.json: font file {f} is not in the library (fonts.json or an existing font)"
            for f in sorted(files) if not (library_root / f).is_file()]


def typecheck(work: Path) -> list[str]:
    components = sorted(style.components_dir().glob("*.tsx")) if style.components_dir().is_dir() else []
    if not components:
        return []
    names = {c.stem for c in components}
    bad = [n for n in names if n not in ("Captions", "Concept", "Logo", "CutIn", "Gauge", "Subscribe") and not n.startswith("Diagram_")]
    if bad:
        return [f"theme/landscape/components: unknown slot(s) {', '.join(sorted(bad))}"]
    kit = (APP / "src" / "composition" / "kit").as_posix()
    modules = (APP / "node_modules").as_posix()
    config = {
        "extends": (APP / "tsconfig.json").as_posix(),
        # The components and what they import (the composition code); bare imports resolve from app/node_modules.
        "compilerOptions": {"noEmit": True, "types": [], "typeRoots": [f"{modules}/@types"],
                            "paths": {"@kit/*": [f"{kit}/*"], "*": [f"{modules}/@types/*", f"{modules}/*"]}},
        "include": [c.as_posix() for c in components],
    }
    (work / "tsconfig.style.json").write_text(json.dumps(config, indent=1), encoding="utf-8")
    done = subprocess.run([NODE, str(APP / "node_modules" / "typescript" / "bin" / "tsc"), "-p", str(work / "tsconfig.style.json")],
                          cwd=APP, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if done.returncode == 0:
        return []
    lines = [l for l in done.stdout.splitlines() if l.strip()]
    # Errors in the app itself are not Claude's: only the components' are sent back.
    mine = [l for l in lines if "theme/landscape/components" in l.replace("\\", "/")]
    return (mine or lines)[:25]


# ---------------- control sheet ----------------

def sheet_assets(cache: Path) -> list[dict]:
    """Sample pictures of the sheet: a screenshot, a full frame picture, a photo, a logo, a gauge bar."""
    def save(name: str, image: Image.Image) -> dict:
        path = cache / f"{name}.png"
        if not path.exists():
            image.save(path)
        entry = {"id": name, "file": f"data/cache/{name}.png", "kind": "image", "width": image.width, "height": image.height}
        if image.mode == "RGBA":
            box = image.getchannel("A").getbbox()
            entry.update(hasAlpha=True, alphaBox=list(box))
        return entry

    screen = Image.new("RGB", (1600, 900), "#F3F4F6")
    d = ImageDraw.Draw(screen)
    d.rectangle([0, 0, 1600, 70], fill="#1F2937")
    for i, c in enumerate(("#EF4444", "#F59E0B", "#10B981")):
        d.ellipse([24 + i * 36, 24, 46 + i * 36, 46], fill=c)
    d.rectangle([40, 110, 420, 860], fill="#E5E7EB")
    for i in range(6):
        d.rectangle([470, 120 + i * 120, 1560, 200 + i * 120], fill="#FFFFFF", outline="#D1D5DB", width=3)
        d.rectangle([500, 145 + i * 120, 800 + (i * 97) % 500, 170 + i * 120], fill="#9CA3AF")
    full = Image.linear_gradient("L").resize((1920, 1080)).convert("RGB")
    full = Image.merge("RGB", (full.getchannel(0), full.getchannel(0).point(lambda v: 255 - v), Image.new("L", (1920, 1080), 160)))
    photo = Image.new("RGB", (1200, 800), "#334155")
    pd = ImageDraw.Draw(photo)
    pd.ellipse([350, 120, 850, 620], fill="#F59E0B")
    pd.rectangle([0, 600, 1200, 800], fill="#0F766E")
    logo = Image.new("RGBA", (600, 600), (0, 0, 0, 0))
    ld = ImageDraw.Draw(logo)
    ld.rounded_rectangle([60, 60, 540, 540], radius=120, fill=(255, 255, 255, 255))
    ld.polygon([(230, 180), (230, 420), (430, 300)], fill=(239, 68, 68, 255))
    gauge = Image.new("RGB", (1000, 160))
    for x in range(1000):
        ImageDraw.Draw(gauge).line([x, 0, x, 160], fill=(int(239 - x * 0.2), int(68 + x * 0.13), 68))
    return [save("sheet_screen", screen), save("sheet_full", full), save("sheet_photo", photo), save("sheet_logo", logo),
            save("sheet_gauge", gauge)]


def sheet_rush(cache: Path) -> dict:
    """A 16:9 face cam to draw on: the start of the latest 16:9 project's rush, else a plain gradient."""
    target = cache / "rush.mp4"
    if not target.exists():
        root = load_config().projects_root
        rushes = []
        for project in root.iterdir() if root.is_dir() else []:
            if project.name.startswith(".") or formats.project_format(project) != "landscape" or not (project / "rush").is_dir():
                continue
            rushes += [f for f in (project / "rush").iterdir() if f.is_file() and not f.name.startswith("._")]
        if rushes:
            source = max(rushes, key=lambda f: f.stat().st_mtime)
            run_ffmpeg(["-stream_loop", "-1", "-i", str(source), "-t", str(SHEET_S), "-an", "-vf",
                        "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30", "-c:v", "libx264",
                        "-crf", "23", "-preset", "veryfast", "-pix_fmt", "yuv420p", str(target)])
        else:
            run_ffmpeg(["-f", "lavfi", "-i", f"gradients=s=1920x1080:d={SHEET_S}:r=30:speed=0.004:c0=0x2b3240:c1=0x5b6478",
                        "-c:v", "libx264", "-crf", "23", "-preset", "veryfast", "-pix_fmt", "yuv420p", str(target)])
    return {"file": "data/cache/rush.mp4", "width": 1920, "height": 1080, "fps": 30, "duration": SHEET_S}


def render_sheet(theme_path: Path) -> list[str]:
    cfg = load_config()
    root = cfg.projects_root / SHEET_SLUG
    cache = root / "data" / "cache"
    cache.mkdir(parents=True, exist_ok=True)
    (root / "data" / "render").mkdir(parents=True, exist_ok=True)
    (root / "data" / "render" / "audio.json").write_text(json.dumps({"voice": None, "music": None, "sfxGains": {}}), encoding="utf-8")
    theme = json.loads(theme_path.read_text(encoding="utf-8"))
    overlay = cfg.library_root / theme["subscribe"]["file"]
    subscribe = overlay.exists()
    if subscribe and not (cache / "subscribe.webm").exists():
        from preview_prep import key_overlay
        key_overlay(overlay, theme["subscribe"]["keyColor"], cache / "subscribe.webm")
    spec = {"rush": sheet_rush(cache), "assets": sheet_assets(cache), "subscribe": subscribe}
    (cache / "sheet.json").write_text(json.dumps(spec), encoding="utf-8")
    done = subprocess.run(tsx("style-sheet.ts", str(root), str(theme_path), str(cache / "sheet.json")), cwd=APP,
                          capture_output=True, text=True, encoding="utf-8", errors="replace")
    line = next((l for l in done.stdout.splitlines() if l.startswith("SHEET ")), None)
    if done.returncode != 0 or not line:
        return [f"control sheet plan: {(done.stderr or done.stdout)[-1500:]}"]
    moments = json.loads(line[6:])
    stills = cache / "stills"
    shutil.rmtree(stills, ignore_errors=True)
    stills.mkdir()
    base = f"http://127.0.0.1:{cfg.backend_port}"
    done = subprocess.run(tsx("render.ts", "--video", str(root), "--edl", str(root / "data" / "render" / "edl.json"),
                              "--theme", str(theme_path), "--video-base", f"{base}/media/{SHEET_SLUG}",
                              "--library-base", f"{base}/library", "--out", str(cache / "unused.mp4"),
                              "--stills", ",".join(str(m["frame"]) for m in moments), "--still-dir", str(stills)),
                          cwd=APP, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if done.returncode != 0:
        tail = [l for l in (done.stderr + done.stdout).splitlines() if l.strip() and not l.startswith("PROGRESS")]
        return ["control sheet render failed (a component threw while drawing):", *tail[-30:]]
    sheet = style.style_dir() / "sheet"
    shutil.rmtree(sheet, ignore_errors=True)
    sheet.mkdir(parents=True)
    entries = []
    for m in moments:
        png = stills / f"still_{m['frame']:05d}.png"
        if png.exists():
            Image.open(png).convert("RGB").resize((960, 540), Image.LANCZOS).save(sheet / f"{m['name']}.jpg", quality=85)
            entries.append({"name": m["name"], "file": f"{m['name']}.jpg"})
    (sheet / "sheet.json").write_text(json.dumps(entries, indent=1), encoding="utf-8")
    print(f"control sheet: {len(entries)} pictures -> {sheet}")
    return []


def check_all(work: Path) -> list[str]:
    errors = import_fonts()
    errors += check_layer()
    if errors:
        return errors
    progress(0.75, "typecheck")
    errors = typecheck(work)
    if errors:
        return ["TypeScript errors:", *errors]
    progress(0.85, "control sheet")
    theme_path = work / "theme.landscape.resolved.json"
    theme_path.write_text(json.dumps(formats.load_theme("landscape"), ensure_ascii=False), encoding="utf-8")
    return render_sheet(theme_path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("create", "revise", "sheet"))
    parser.add_argument("--feedback-file", type=Path)
    args = parser.parse_args()
    feedback = ""
    if args.feedback_file and args.feedback_file.exists():
        feedback = str(json.loads(args.feedback_file.read_text(encoding="utf-8")).get("feedback") or "")
    work = load_config().projects_root / SHEET_SLUG / "data" / "cache"
    work.mkdir(parents=True, exist_ok=True)

    if args.mode == "sheet":
        progress(0.1, "control sheet")
        errors = check_all(work)
        if errors:
            raise SystemExit("\n".join(errors))
        progress(1, "control sheet ready")
        return

    if args.mode == "create" and not style.state()["refs"]:
        raise SystemExit("add reference pictures first (screenshots of edits you like)")
    label = f"before {'the style creation' if args.mode == 'create' else 'the revision'}" + (f": {feedback[:120]}" if feedback else "")
    kept = style.snapshot(label)
    print(f"previous style kept as version {kept}")
    errors: list[str] = []
    for attempt in range(MAX_FIXES + 1):
        progress(0.05 + attempt * 0.2, "Claude writes the style" if not attempt else f"Claude fixes errors ({attempt}/{MAX_FIXES})")
        outside = run_claude(load_config().claude_command, build_prompt(args.mode, feedback, "\n".join(errors)))
        errors = check_all(work)
        # Changes outside its files are already undone: they only matter when the style fails without them.
        if outside and errors:
            errors = [f"You changed files you may not change; they were put back: {', '.join(outside)}. If AutoShort itself "
                      "fails, say so in theme/landscape/style.md instead.", *errors]
        if not errors:
            result("version", kept)
            progress(1, "style ready")
            return
        print("checks failed:\n" + "\n".join(errors))
    style.restore(kept, "failed attempt (put back automatically)")
    raise SystemExit("the style still had errors after the fixes: the previous style is back. Errors:\n" + "\n".join(errors[:20]))


if __name__ == "__main__":
    main()
