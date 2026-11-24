"""Import step: build a first plan (rush time) from the transcription, VAD and the asset catalog.

- Words: WhisperX words, elisions / hyphen pieces / detached "?" merged, vocabulary corrections (original kept).
  Speech that Whisper skipped is filled from the burst fallback when it ran.
- Cuts, only for a raw rush (choice made at import, kept per video in plan.themeOverrides.editing.autoCuts, else
  theme editing.autoCuts): silences > 0.4 s (0.08 s margin around words), hesitations,
  immediate repetitions (the last take is kept), everything before the first and after the last word.
  Otherwise (the rush is already edited, the default) nothing is cut: the whole rush is kept, split into one segment per
  sentence, every ZOOM_EVERY-th sentence zoomed (punch-in / back to 100 % alternation of the charte).
- Rough cut format: the silences are cut, plus the hesitations and / or repeated takes when asked (options chosen at
  launch, kept in plan.themeOverrides.editing.roughCut: margin kept around speech, shortest silence cut); the rush
  keeps its own framing and nothing is added (no zoom, no picture, no music, no subscribe overlay).
- Captions: blocks of theme captions.minWords to maxWords words (same rules as the UI auto blocking).
- The per-video theme overrides of the current plan (styles) are kept.
- Assets named <mode>__<trigger>[__<option>] are placed on their trigger word; others are listed as unplaced.
- Subscribe overlay on the first call to action sentence; an audio asset becomes the music bed.
Writes data/plan.json and REPLACES the current plan (import, re-import or reset start from scratch): the pending draft
and the history of the previous plan are deleted. Exports are kept.
Usage: python initial_plan.py <video_dir> <theme_json> [raw|edited] [--rough <options json>]
  (no choice: the one of the current plan; rough cut options: those given, else the current plan's, else the defaults)
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

from common import project_format, app_dir, progress, read_json, write_json
from merge_analysis import merge

SILENCE_S = 0.4
MARGIN_S = 0.08
# Rough cut options and their limits (the app shows the same ones).
ROUGH_DEFAULTS = {"hesitations": False, "repetitions": False, "margin": MARGIN_S, "silence": SILENCE_S}
MARGIN_RANGE = (0.0, 0.5)
SILENCE_RANGE = (0.2, 3.0)
ZOOM_EVERY = 3
MIN_SENTENCE_S = 1.2
MODES = {"bg", "screen", "logo", "full"}
DEFAULT_S = {"logo": 2.0, "screen": 3.0, "full": 2.0, "bg": 3.0}
MAX_S = {"logo": 2.5, "screen": 4.0, "full": 3.0, "bg": 4.0}
ARTICLES = {"le", "la", "les", "un", "une", "des", "de", "du", "l'", "au", "aux", "à", "en", "et", "ou", "mais", "que", "qui",
            "sur", "dans", "pour", "par", "avec", "ce", "cette", "ces", "mon", "ma", "mes", "ton", "ta", "tes", "son", "sa",
            "ses", "je", "tu", "il", "on", "nous", "vous", "ils"}


def norm(token: str) -> str:
    t = unicodedata.normalize("NFKD", token.replace("’", "'")).encode("ascii", "ignore").decode()
    return re.sub(r"[^\w']", "", t).lower()


def merge_pieces(raw: list[dict]) -> list[dict]:
    out: list[dict] = []
    for w in raw:
        token = (w.get("word") or "").strip()
        if not token or w.get("start") is None:
            if token and out:
                out[-1]["text"] += token if token in ",.!?;:" else ""
            continue
        if out and (token in ("?", "!", ":", ";") or token.startswith("'") or token.startswith("-")):
            out[-1]["text"] += (" " + token) if token in ("?", "!", ":", ";") else token
            out[-1]["end"] = max(out[-1]["end"], w["end"])
            continue
        out.append({"text": token, "start": round(w["start"], 3), "end": round(w["end"], 3),
                    **({"score": round(w["score"], 3)} if w.get("score") is not None else {})})
    return out


def apply_vocabulary(words: list[dict], vocab: dict) -> None:
    for w in words:
        m = re.match(r"^(.*?)([.,!?;: ]*)$", w["text"])
        core, punct = m.group(1), m.group(2)
        if core in vocab:
            w["original"] = w["text"]
            w["text"] = vocab[core] + punct


def fill_from_bursts(words: list[dict], bursts: list | None, vad: list[dict]) -> list[dict]:
    """Add burst-pass words inside the speech stretches that WhisperX left without words."""
    from autoshort_server.pipelines import speech_gaps
    if not bursts:
        return words
    gaps = speech_gaps(vad, [(w["start"], w["end"]) for w in words]) if vad else []
    extra = [{"word": w["word"], "start": w["start"], "end": w["end"]} for g in bursts for w in g.get("words", [])
             if any(a - 0.1 <= w["start"] < b + 0.1 for a, b in gaps)]
    if extra:
        print(f"{len(extra)} words recovered from the burst pass in {len(gaps)} gaps")
    return sorted(words + merge_pieces(extra), key=lambda w: w["start"])


def find_repetitions(words: list[dict]) -> list[tuple[int, int]]:
    """Index ranges of a phrase (1 to 4 words) immediately said again: the first take is cut."""
    cuts = []
    i = 0
    n = len(words)
    while i < n:
        found = False
        for size in (4, 3, 2, 1):
            if i + 2 * size > n:
                continue
            a = [norm(w["text"]) for w in words[i:i + size]]
            b = [norm(w["text"]) for w in words[i + size:i + 2 * size]]
            if a == b and all(a) and (size > 1 or len(a[0]) > 2):
                cuts.append((i, i + size - 1))
                i += size
                found = True
                break
        if not found:
            i += 1
    return cuts


def build_spans(words: list[dict], duration: float, hesitations: set[str], repetitions: bool = True,
                margin: float = MARGIN_S, silence: float = SILENCE_S) -> list[dict]:
    """Kept intervals around the kept words (margin seconds on each side); pauses longer than `silence` between
    them, removed words, and the start / end without speech are cut."""
    removed: list[tuple[float, float, str]] = []
    keep_words = []
    rep = {j for a, b in find_repetitions(words) for j in range(a, b + 1)} if repetitions else set()
    for i, w in enumerate(words):
        if norm(w["text"]) in hesitations:
            removed.append((w["start"], w["end"], "hesitation"))
        elif i in rep:
            removed.append((w["start"], w["end"], "repetition"))
        else:
            keep_words.append(w)
    # Kept intervals: each kept word with its margin, merged when the silence between them is short.
    intervals: list[list[float]] = []
    for w in keep_words:
        start, end = max(0.0, w["start"] - margin), min(duration, w["end"] + margin)
        if intervals and start - intervals[-1][1] <= silence - 2 * margin:
            intervals[-1][1] = max(intervals[-1][1], end)
        else:
            if intervals and start < intervals[-1][1]:
                start = intervals[-1][1]
            intervals.append([start, end])
    # Removed words (hesitations, first takes) are carved out even when the pause around them is short.
    for s, e, _ in removed:
        prev_end = max((w["end"] for w in keep_words if w["end"] <= s + 0.01), default=0.0)
        next_start = min((w["start"] for w in keep_words if w["start"] >= e - 0.01), default=duration)
        a, b = max(prev_end, s - 0.03), min(next_start, e + 0.03)
        carved = []
        for lo, hi in intervals:
            if hi <= a or lo >= b:
                carved.append([lo, hi])
                continue
            if lo < a:
                carved.append([lo, a])
            if hi > b:
                carved.append([b, hi])
        intervals = carved

    spans = []
    cursor = 0.0

    def reason_for(a: float, b: float) -> str:
        for s, e, r in removed:
            if s < b and e > a:
                return r
        return "outside" if a <= 0.001 or b >= duration - 0.001 else "silence"

    for a, b in intervals:
        if a > cursor + 0.001:
            spans.append({"start": round(cursor, 3), "end": round(a, 3), "keep": False, "reason": reason_for(cursor, a)})
        spans.append({"start": round(a, 3), "end": round(b, 3), "keep": True})
        cursor = b
    if duration > cursor + 0.001:
        spans.append({"start": round(cursor, 3), "end": round(duration, 3), "keep": False, "reason": "outside"})
    for i, s in enumerate(spans):
        s["id"] = f"s{i}"
        s["zoom"] = False
    return spans


def clamp_to_speech(words: list[dict], vad: list[dict]) -> int:
    """Whisper sometimes stretches a word over the pause that follows (or precedes) it, which hides that silence. A word
    reaching more than SILENCE_S outside the speech region (VAD) it starts in is clamped to that region. Returns how
    many words were changed."""
    regions = sorted((r["start"], r["end"]) for r in vad)
    changed = 0
    for w in words:
        region = next(((a, b) for a, b in regions if a - SILENCE_S <= w["start"] <= b), None)
        if region is None:
            continue
        a, b = region
        if w["end"] > b + SILENCE_S:
            w["end"] = round(max(w["start"] + 0.05, b), 3)
            changed += 1
        if w["start"] < a - 0.05 and w["end"] > a:
            w["start"] = round(min(a, w["end"] - 0.05), 3)
            changed += 1
    return changed


def sentence_spans(words: list[dict], duration: float) -> list[dict]:
    """No cut: the whole rush, one kept segment per sentence (short ones joined to the next), every ZOOM_EVERY-th
    one zoomed. Boundaries sit in the middle of the pause after a sentence's last word."""
    bounds = [0.0]
    for w, nxt in zip(words, words[1:]):
        if re.search(r"[.!?…]$", w["text"]) and nxt["start"] - bounds[-1] >= MIN_SENTENCE_S:
            bounds.append(round((w["end"] + nxt["start"]) / 2, 3))
    if duration - bounds[-1] < MIN_SENTENCE_S and len(bounds) > 1:
        bounds.pop()
    bounds.append(round(duration, 3))
    return [{"id": f"s{i}", "start": a, "end": b, "keep": True, "zoom": i % ZOOM_EVERY == ZOOM_EVERY - 1}
            for i, (a, b) in enumerate(zip(bounds, bounds[1:]))]


def auto_blocks(words: list[dict], max_words: int, max_chars: int) -> None:
    count = chars = 0
    prev = None
    for i, w in enumerate(words):
        gap = w["start"] - prev["end"] if prev else 0
        punct = bool(prev and re.search(r"[.,!?;:]$", prev["text"]))
        prev_article = bool(prev and prev["text"].lower() in ARTICLES)
        full = count >= max_words or chars + len(w["text"]) + 1 > max_chars
        start = i == 0 or ((full or gap > 0.35 or (punct and count >= 2)) and not prev_article)
        if not start and full and prev_article and count >= 2:
            # Never end a block on an article: the article opens the next block instead.
            prev["blockStart"] = True
            count, chars = 1, len(prev["text"]) + 1
        elif start:
            count = chars = 0
            w["blockStart"] = True
        count += 1
        chars += len(w["text"]) + 1
        prev = w


def kept(spans: list[dict], t: float) -> bool:
    return any(s["keep"] and s["start"] - 0.03 <= t < s["end"] for s in spans)


def full_frame_fits(asset: dict, canvas_aspect: float) -> bool:
    """A picture can fill the frame only when its shape is close to the canvas: a short keeps the legacy rule (nothing
    wider than 3:4), a 16:9 video also refuses pictures much taller than the frame."""
    if not asset.get("width") or not asset.get("height"):
        return True
    ratio = (asset["width"] / asset["height"]) / canvas_aspect
    if canvas_aspect < 1:
        return asset["width"] / asset["height"] <= 0.75
    return 0.75 <= ratio <= 4 / 3


def place_assets(catalog: list[dict], words: list[dict], spans: list[dict],
                 canvas_aspect: float = 9 / 16) -> tuple[list, list, list, dict | None]:
    logos, cut_ins, unplaced = [], [], []
    music = None
    spoken = [w for w in words if kept(spans, w["start"])]
    for asset in catalog:
        name = Path(asset["file"]).stem
        if asset["kind"] == "audio":
            if music is None:
                music = {"asset": asset["id"], "underVoiceDb": 22}
            continue
        parts = name.split("__")
        mode = parts[0].lower() if len(parts) >= 2 else None
        if mode not in MODES:
            unplaced.append(f"{asset['file']} (no mode prefix: name it <mode>__<trigger>)")
            continue
        trigger = [norm(t) for t in parts[1].split("-") if t]
        option = parts[2] if len(parts) > 2 else ""
        occurrence = int(option[:-1]) if re.fullmatch(r"\d+e", option) else 1
        duration = float(option[:-1]) if re.fullmatch(r"\d+(\.\d+)?s", option) else None
        hits = []
        for i in range(len(spoken) - len(trigger) + 1):
            if all(norm(spoken[i + k]["text"]).startswith(t[: max(3, len(t) - 2)]) for k, t in enumerate(trigger)):
                hits.append(i)
        if len(hits) < occurrence:
            unplaced.append(f"{asset['file']} (trigger \"{' '.join(trigger)}\" not found)")
            continue
        i = hits[occurrence - 1]
        start = spoken[i]["start"]
        end_idx = next((j for j in range(i, len(spoken)) if re.search(r"[.!?]$", spoken[j]["text"])), len(spoken) - 1)
        natural = spoken[end_idx]["end"] - start
        length = duration or min(MAX_S[mode], max(DEFAULT_S[mode] if natural < 0.8 else natural, 1.2))
        item = {"asset": asset["id"], "start": round(start, 3), "end": round(start + length, 3), "trigger": spoken[i]["id"]}
        if mode == "logo":
            logos.append({"id": f"l{len(logos)}", **item})
        else:
            if mode == "full" and not full_frame_fits(asset, canvas_aspect):
                mode = "screen"  # a picture of another shape than the frame is never shown full frame
            cut_ins.append({"id": f"a{len(cut_ins)}", **item, "mode": mode})
    return logos, cut_ins, unplaced, music


def find_cta(words: list[dict], spans: list[dict], phrases: list[str]) -> dict | None:
    spoken = [w for w in words if kept(spans, w["start"])]
    joined = [norm(w["text"]) for w in spoken]
    for phrase in phrases:
        target = [norm(t) for t in re.split(r"[\s]+", phrase.replace("-", " - ")) if norm(t)]
        for i in range(len(joined)):
            window = "".join(joined[i:i + len(target) + 2])
            if window.startswith("".join(target)):
                return spoken[i]
    return None


def face_centre_y(face: dict | None) -> float | None:
    """Median height of the face centre over the rush (source pixels), None without a face track."""
    ys = sorted(s["box"][1] + s["box"][3] / 2 for s in (face or {}).get("samples", []) if s.get("box"))
    return ys[len(ys) // 2] if ys else None


def crop_window(w: int, h: int, canvas_w: int, canvas_h: int, face_y: float | None = None) -> dict:
    """Window of the rush shown on the canvas, with the canvas proportions.
    A rush wider than the canvas (or any rush of a short, legacy rule) keeps its full height, centred horizontally.
    A rush taller than a 16:9 canvas (4:3, filmed vertically) keeps its full width, the face at 40 % of the window
    height (centred without a face track)."""
    aspect = canvas_w / canvas_h
    if canvas_h > canvas_w or w / h >= aspect:
        crop_w = min(w, round(h * aspect))
        return {"x": round((w - crop_w) / 2), "y": 0, "width": crop_w, "height": h}
    crop_h = round(w / aspect)
    y = round(face_y - crop_h * 0.4) if face_y is not None else round((h - crop_h) / 2)
    y = min(max(y, 0), h - crop_h)
    return {"x": 0, "y": y, "width": w, "height": crop_h}


def rough_options(previous: dict | None, given: dict | None = None) -> dict:
    """Rough cut options: the given ones, else the current plan's, else the defaults, within their limits. The shortest
    silence cut is at least the two margins + 0.1 s (a cut must remove something)."""
    saved = (((previous or {}).get("themeOverrides") or {}).get("editing") or {}).get("roughCut") or {}
    out = {**ROUGH_DEFAULTS, **{k: v for k, v in saved.items() if k in ROUGH_DEFAULTS},
           **{k: v for k, v in (given or {}).items() if k in ROUGH_DEFAULTS}}
    clamp = lambda value, lo, hi: round(min(max(float(value), lo), hi), 3)
    out["hesitations"], out["repetitions"] = bool(out["hesitations"]), bool(out["repetitions"])
    out["margin"] = clamp(out["margin"], *MARGIN_RANGE)
    out["silence"] = clamp(max(float(out["silence"]), 2 * out["margin"] + 0.1), *SILENCE_RANGE)
    return out


def cut_choice(previous: dict | None, theme: dict, choice: str = "") -> bool:
    """Raw rush to cut (True) or already edited (False): the choice given, else the current plan's, else the theme's."""
    if choice in ("raw", "edited"):
        return choice == "raw"
    saved = ((previous or {}).get("themeOverrides") or {}).get("editing", {}).get("autoCuts")
    return bool(saved) if saved is not None else bool(theme.get("editing", {}).get("autoCuts", False))


def main() -> None:
    video, theme_file = Path(sys.argv[1]), Path(sys.argv[2])
    extra = sys.argv[3:]
    given = None
    if "--rough" in extra:
        i = extra.index("--rough")
        given = json.loads(extra[i + 1])
        extra = extra[:i] + extra[i + 2:]
    theme = json.loads(theme_file.read_text(encoding="utf-8"))
    previous = read_json(app_dir(video) / "plan.json")
    auto_cuts = cut_choice(previous, theme, extra[0] if extra else "")
    # Next to the theme, else the repo's (a 16:9 theme is resolved into the project's cache).
    vocab_file = theme_file.parent / "vocabulary.json"
    if not vocab_file.exists():
        vocab_file = Path(__file__).resolve().parents[2] / "theme" / "vocabulary.json"
    vocab = {k: v for k, v in (read_json(vocab_file) or {}).items() if not k.startswith("_")}
    app = app_dir(video)
    cache = app / "cache"
    probe = read_json(cache / "probe.json")
    raw = read_json(cache / "transcript_raw.json")
    if not probe or not raw:
        raise SystemExit("run the probe and transcription steps first")
    vad = read_json(cache / "vad.json") or []
    words = merge_pieces(raw["words"])
    words = fill_from_bursts(words, read_json(cache / "bursts.json"), vad)
    apply_vocabulary(words, vocab)
    for i, w in enumerate(words):
        w["id"] = f"w{i}"
    video_format = project_format(video)
    rough = video_format == "rough"
    if rough:
        options = rough_options(previous, given)
        progress(0.3, f"rough cut: {options}")
        clamped = clamp_to_speech(words, vad)
        if clamped:
            print(f"{clamped} word time(s) stretched over a pause, clamped to the speech (VAD)")
        spans = build_spans(words, probe["duration"], set(theme["hesitations"]) if options["hesitations"] else set(),
                            repetitions=options["repetitions"], margin=options["margin"], silence=options["silence"])
    elif auto_cuts:
        progress(0.3, "cuts (raw rush)")
        spans = build_spans(words, probe["duration"], set(theme["hesitations"]))
    else:
        progress(0.3, "segments (no cut: the rush is already edited)")
        spans = sentence_spans(words, probe["duration"])
    spoken = [w for w in words if kept(spans, w["start"])]
    auto_blocks(spoken, theme["captions"]["maxWords"], theme["captions"]["maxLineChars"])
    progress(0.6, "assets")
    catalog = [] if rough else read_json(cache / "assets.json") or []
    w, h = probe["width"], probe["height"]
    if rough:
        # The rush as it is: its own framing, nothing placed on it.
        logos, cut_ins, unplaced, music, cta = [], [], [], None, None
        crop = {"x": 0, "y": 0, "width": w, "height": h}
    else:
        canvas_w, canvas_h = theme["format"]["width"], theme["format"]["height"]
        logos, cut_ins, unplaced, music = place_assets(catalog, words, spans, canvas_w / canvas_h)
        cta = find_cta(words, spans, theme["callToAction"])
        # Crop: a window of the canvas proportions (9:16 short or 16:9 YouTube video).
        crop = crop_window(w, h, canvas_w, canvas_h, face_centre_y(read_json(cache / "face.json")))
    sub = theme["subscribe"]
    plan = {
        "schemaVersion": 1,
        "slug": video.name,
        "source": {"rush": probe["rush"], "width": w, "height": h, "fps": probe["fps"], "duration": probe["duration"],
                   "crop": crop},
        **({"output": {"format": video_format}} if video_format != "short" else {}),
        "assets": catalog,
        "words": words,
        "spans": spans,
        "concepts": [],
        "logos": logos,
        "cutIns": cut_ins,
        "gauges": [],
        "diagrams": [],
        "sfx": [],
        "music": music,
        "subscribe": {"start": cta["start"], "trigger": cta["id"], "scale": sub["scale"], "x": sub["x"], "y": sub["y"],
                      "keyColor": sub["keyColor"]} if cta else None,
        "hideCaptionsDuringConcepts": True,
        "themeOverrides": {**((previous or {}).get("themeOverrides") or {}), "editing": {"autoCuts": auto_cuts or rough, **({"roughCut": options} if rough else {})}},
        "unplacedAssets": unplaced,
    }
    notes = video / "assets" / "notes.md"
    if notes.exists():
        plan["notes"] = notes.read_text(encoding="utf-8", errors="replace")[:4000]
    target = app / "plan.json"
    write_json(target, plan)
    (app / "plan.draft.json").unlink(missing_ok=True)
    for snapshot in (app / "history").glob("plan_*.json"):
        snapshot.unlink()
    merge(video)
    cut_s = sum(s["end"] - s["start"] for s in spans if not s["keep"])
    print(f"{len(words)} words, {sum(1 for s in spans if s['keep'])} kept spans, {cut_s:.1f} s cut, "
          f"{probe['duration'] - cut_s:.1f} s out, {len(logos)} logos, {len(cut_ins)} cut-ins, {len(unplaced)} unplaced -> {target.name}")
    progress(1, "plan ready")


if __name__ == "__main__":
    main()
