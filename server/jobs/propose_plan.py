"""Plan proposal by Claude Code, headless: `claude -p --output-format json --json-schema ...`, prompt on stdin,
cwd = the video folder, read-only tools. Claude returns DATA (a proposal referencing word ids); this script merges
it into the current plan and writes data/plan.draft.json, validated against the plan contract, for review in the UI.

Usage: python propose_plan.py <video_dir> <theme_json> <schema_dir> <claude_command> [--feedback-file <json>]

With --feedback-file (a JSON {"feedback": "..."} written by the backend), Claude revises the CURRENT edit following
the author's feedback instead of proposing from scratch.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import jsonschema

from common import app_dir, progress, read_json, write_json
from autoshort_server.config import load_config

PROPOSAL_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["cuts", "highlights", "concepts", "logos", "cutIns", "diagrams", "corrections", "subscribeWord", "notes"],
    "properties": {
        "cuts": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["fromWord", "toWord", "reason"],
                                            "properties": {"fromWord": {"type": "string"}, "toWord": {"type": "string"},
                                                           "reason": {"enum": ["hesitation", "repetition", "false-start", "outside", "manual"]}}}},
        "restores": {"type": "array", "items": {"type": "string"}, "description": "word ids of cut words to keep after all"},
        "highlights": {"type": "array", "items": {"type": "string"}},
        "keywords": {"type": "array", "items": {"type": "string"}, "description": "word ids of the call-to-action keyword"},
        "blockStarts": {"type": "array", "items": {"type": "string"}},
        "corrections": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["word", "text"],
                                                   "properties": {"word": {"type": "string"}, "text": {"type": "string"}}}},
        "concepts": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["text", "fromWord", "toWord"],
                                                "properties": {"text": {"type": "string"}, "fromWord": {"type": "string"}, "toWord": {"type": "string"}}}},
        "logos": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["asset", "word", "duration"],
                                             "properties": {"asset": {"type": "string"}, "word": {"type": "string"}, "duration": {"type": "number"},
                                                            "size": {"type": "number"}}}},
        "cutIns": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["asset", "mode", "word", "duration"],
                                              "properties": {"asset": {"type": "string"}, "mode": {"enum": ["screen", "full", "bg"]},
                                                             "word": {"type": "string"}, "duration": {"type": "number"},
                                                             "shake": {"type": "number"}, "dim": {"type": "number"},
                                                             "enter": {"enum": ["pop", "top", "bottom", "left", "right"]}}}},
        "diagrams": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["template", "description", "fromWord", "toWord", "elements"],
            "properties": {
                "template": {"enum": ["tree", "hub", "balance", "forbidden", "flow", "comparison"]},
                "description": {"type": "string"}, "fromWord": {"type": "string"}, "toWord": {"type": "string"},
                "elements": {"type": "array", "maxItems": 6, "items": {
                    "type": "object", "additionalProperties": False, "required": ["label", "word"],
                    "properties": {"label": {"type": "string"}, "word": {"type": "string"}, "icon": {"type": "string"},
                                   "image": {"type": "string"}, "accent": {"type": "boolean"}, "strike": {"type": "boolean"},
                                   "check": {"type": "boolean"}}}}}}},
        "subscribeWord": {"type": ["string", "null"]},
        "unplacedAssets": {"type": "array", "items": {"type": "string"}},
        "notes": {"type": "string"},
    },
}

TEMPLATES = """Diagram templates (layout is automatic, you only give content, max 6 elements, labels max 3 words):
- tree: element 0 = root (use image "folder" style picture asset if available), next = children on a trunk; strike=true crosses one out in accent.
- hub: element 0 = a box (the system), next = what it looks at, one accent arrow + icon + label per row.
- balance: [scale, left plate, right plate, verdict (accent)] for a hesitation / judgement.
- forbidden: [subject (icon), alert sign, verdict label] with a big accent cross.
- flow: 2 to 5 steps top to bottom linked by arrows.
- comparison: [left header, right header, then items alternating left/right]; check=true green check, strike=true accent cross.
Icons: lucide names in kebab case (e.g. memory-stick, code-xml, crosshair, move, triangle-alert, user, database, cpu) or stick-figure."""


def plan_to_proposal(plan: dict) -> dict:
    """The current edit in the proposal format (word ids), so Claude can revise it rather than start over."""
    ordered = sorted(plan["words"], key=lambda w: w["start"])
    if not ordered:
        return {}

    def at(t: float) -> str:
        return min(ordered, key=lambda w: abs(w["start"] - t))["id"]

    def until(t: float) -> str:
        inside = [w for w in ordered if w["start"] < t]
        return (inside[-1] if inside else ordered[0])["id"]

    cuts = []
    for s in plan["spans"]:
        if s["keep"]:
            continue
        inside = [w for w in ordered if s["start"] - 0.03 <= w["start"] < s["end"]]
        if inside:
            cuts.append({"fromWord": inside[0]["id"], "toWord": inside[-1]["id"], "reason": s.get("reason") or "manual"})
    return {
        "cuts": cuts,
        "highlights": [w["id"] for w in ordered if w.get("highlight")],
        "keywords": [w["id"] for w in ordered if w.get("keyword")],
        "blockStarts": [w["id"] for w in ordered if w.get("blockStart")],
        "corrections": [{"word": w["id"], "text": w["text"]} for w in ordered if w.get("original")],
        "concepts": [{"text": c["text"], "fromWord": c.get("trigger") or at(c["start"]), "toWord": until(c["end"])}
                     for c in plan.get("concepts", [])],
        "logos": [{"asset": l["asset"], "word": l.get("trigger") or at(l["start"]), "duration": round(l["end"] - l["start"], 2),
                   **({"size": l["size"]} if l.get("size") else {})} for l in plan.get("logos", [])],
        "cutIns": [{"asset": c["asset"], "mode": c["mode"], "word": c.get("trigger") or at(c["start"]),
                    "duration": round(c["end"] - c["start"], 2), **{k: c[k] for k in ("shake", "dim", "enter") if c.get(k)}}
                   for c in plan.get("cutIns", [])],
        "diagrams": [{"template": d["template"], "description": d.get("description", ""), "fromWord": at(d["start"]),
                      "toWord": until(d["end"]),
                      "elements": [{"label": e["label"], "word": at(e["at"]),
                                    **{k: e[k] for k in ("icon", "image", "accent", "strike", "check") if e.get(k)}}
                                   for e in d.get("elements", [])]}
                     for d in plan.get("diagrams", [])],
        "subscribeWord": (plan.get("subscribe") or {}).get("trigger"),
    }


def feedback_section(plan: dict, feedback: str) -> str:
    current = json.dumps(plan_to_proposal(plan), ensure_ascii=False, separators=(",", ":"))
    return f"""
REVISION REQUEST. The author already has an edit (below, in the answer format) and gives you feedback on it.
Return the COMPLETE revised edit in the same format: apply the feedback, and keep unchanged everything the feedback
does not ask to change (same cuts, events, words and timings). To un-cut words, list their ids in restores. In notes,
say in one or two sentences what you changed.

Author feedback (it takes priority over the general rules above, except the rule never to invent caption text):
{feedback}

Current edit:
{current}
"""


def build_prompt(video: Path, plan: dict, theme: dict, feedback: str = "") -> str:
    spans = sorted(plan["spans"], key=lambda s: s["start"])
    if auto_cuts(theme, plan):
        CUT_RULES = ("Cut hesitations, abandoned sentences and failed takes (keep the LAST complete take). When unsure about "
                     "a cut, keep the passage and say it in notes.")
    else:
        CUT_RULES = ("The video is ALREADY EDITED by its author: never cut anything (return an empty cuts list and no "
                     "restores); only place the visual events, highlights, caption blocks and corrections.")

    def is_kept(t: float) -> bool:
        return any(s["keep"] and s["start"] - 0.03 <= t < s["end"] for s in spans)

    lines = [f"{w['id']}\t{w['start']:.2f}\t{'' if is_kept(w['start']) else 'CUT '}{w['text']}"
             + (f"\t(conf {w['score']:.2f})" if w.get("score") is not None and w["score"] < 0.5 else "")
             for w in sorted(plan["words"], key=lambda w: w["start"])]
    assets = [f"{a['id']}\t{a['kind']}\t{a.get('width', '')}x{a.get('height', '')}\t{a['file']}" for a in plan["assets"]]
    charte = load_config().library_root / "charte.md"
    rules = charte.read_text(encoding="utf-8", errors="replace")[:9000] if charte.exists() else ""
    notes = (video / "assets" / "notes.md")
    return f"""You are proposing the edit plan of a French face cam short (9:16) as DATA, for a human to review in an editor.
Never invent caption text: corrections only fix misheard technical words. Refer to words by their id.

Output duration target: {theme['format']['targetDurationS']} s maximum. Rules: one event at a time among assets, diagrams,
logos and concepts; concepts (1 to 3 words, display font) at most one every {theme['concepts']['minSpacingS']} s, 2 to 5 per video;
highlights at most 1 per caption block and never in two consecutive blocks (numbers, tool names, meaning or contrast words);
caption blocks (blockStarts, only if you re-split): {theme['captions']['minWords']} to {theme['captions']['maxWords']} words and {theme['captions']['maxLineChars']} characters at most, shown on {theme['captions'].get('maxLines', 2)} line(s);
diagrams 0 to 2 per short, {theme['diagrams']['minS']} to {theme['diagrams']['maxS']} s, only when a mechanism, flow, comparison or
architecture is clearer drawn; every element appears on its trigger word.
{CUT_RULES}
Images: landscape pictures go in "screen" mode; "full" only for 9:16 pictures (use shake 6 and dim 0.3 for a hook picture).
A picture may set enter: "pop" (bounce in place) or "top" / "bottom" / "left" / "right" (slides in from that edge); leave it
out for the default entrance, and use it sparingly (a punchline, a reveal).
keywords: when the author asks viewers to comment a word (« commente MONTAGE »), give that word's id (it gets its own
style; correct its text if it was misheard). Usually none or one.
Subscribe overlay only on a call to action sentence ("abonne-toi", "suivez-moi"...): give its first word id, else null.
Every asset should find a moment; list the ones you could not place in unplacedAssets.

{TEMPLATES}

Visual identity (charte.md):
{rules}

Notes from the author (assets/notes.md, they take priority):
{notes.read_text(encoding='utf-8', errors='replace') if notes.exists() else '(none)'}

Asset catalog (id, kind, size, file):
{chr(10).join(assets) or '(none)'}

Transcript (word id, rush time, text; CUT = currently cut):
{chr(10).join(lines)}
{feedback_section(plan, feedback) if feedback else ""}"""


def word_map(plan: dict) -> dict:
    return {w["id"]: w for w in plan["words"]}


def cut_range(spans: list[dict], start: float, end: float, reason: str) -> list[dict]:
    out = []
    for s in sorted(spans, key=lambda s: s["start"]):
        if s["end"] <= start or s["start"] >= end:
            out.append(s)
            continue
        if s["start"] < start:
            out.append({**s, "end": round(start, 3)})
        out.append({"start": round(max(s["start"], start), 3), "end": round(min(s["end"], end), 3), "keep": False, "zoom": False,
                    "reason": reason})
        if s["end"] > end:
            out.append({**s, "start": round(end, 3)})
    return out


def auto_cuts(theme: dict, plan: dict | None = None) -> bool:
    """Raw rush (cuts allowed): the choice made at import for this video, else the theme default."""
    saved = (((plan or {}).get("themeOverrides") or {}).get("editing") or {}).get("autoCuts")
    return bool(saved) if saved is not None else bool(theme.get("editing", {}).get("autoCuts", False))


CUT_IN_HAND_SET = ("x", "y", "width", "zoom", "rotate", "frame", "trim", "sfx")


def apply_proposal(plan: dict, p: dict, allow_cuts: bool = True) -> dict:
    """Apply Claude's answer to a copy of the plan. Without allow_cuts (already edited rush) cuts are ignored."""
    if not allow_cuts:
        p = {**p, "cuts": [], "restores": []}
    words = word_map(plan)
    ordered = sorted(plan["words"], key=lambda w: w["start"])
    index = {w["id"]: i for i, w in enumerate(ordered)}
    get = lambda wid: words.get(wid)  # noqa: E731
    spans = plan["spans"]
    for wid in p.get("restores", []):
        w = get(wid)
        if w:
            spans = [({**s, "keep": True, "reason": None} if not s["keep"] and s["start"] < w["end"] and s["end"] > w["start"] else s) for s in spans]
    for c in p["cuts"]:
        a, b = get(c["fromWord"]), get(c["toWord"])
        if not a or not b:
            continue
        i, j = sorted((index[a["id"]], index[b["id"]]))
        # Already cut (a revision gives back the current cuts): keep the existing spans exactly as they are.
        if all(not any(s["keep"] and s["start"] - 0.03 <= w["start"] < s["end"] for s in spans) for w in ordered[i:j + 1]):
            continue
        prev = ordered[i - 1] if i > 0 else None
        nxt = ordered[j + 1] if j + 1 < len(ordered) else None
        start = max(prev["end"], ordered[i]["start"] - 0.08) if prev else max(0, ordered[i]["start"] - 0.08)
        end = max(ordered[j]["end"], nxt["start"] - 0.02) if nxt else ordered[j]["end"] + 0.08
        spans = cut_range(spans, start, end, c["reason"])
    for i, s in enumerate(sorted(spans, key=lambda s: s["start"])):
        s["id"] = f"s{i}"
        if s.get("reason") is None:
            s.pop("reason", None)
    plan["spans"] = sorted(spans, key=lambda s: s["start"])

    for c in p["corrections"]:
        w = get(c["word"])
        if w and c["text"].strip() and c["text"] != w["text"]:
            w.setdefault("original", w["text"])
            w["text"] = c["text"].strip()
    for w in plan["words"]:
        w.pop("highlight", None)
        if w["id"] in set(p["highlights"]):
            w["highlight"] = True
    if "keywords" in p:
        for w in plan["words"]:
            w.pop("keyword", None)
            if w["id"] in set(p["keywords"]):
                w["keyword"] = True
    if p.get("blockStarts"):
        starts = set(p["blockStarts"])
        for w in plan["words"]:
            w.pop("blockStart", None)
            if w["id"] in starts:
                w["blockStart"] = True

    assets = {a["id"] for a in plan["assets"]}
    old_cut_ins, old_logos = list(plan.get("cutIns", [])), list(plan.get("logos", []))
    plan["concepts"] = [{"id": f"c{i}", "text": c["text"], "start": get(c["fromWord"])["start"], "end": get(c["toWord"])["end"],
                         "trigger": c["fromWord"]}
                        for i, c in enumerate(p["concepts"]) if get(c["fromWord"]) and get(c["toWord"])]
    plan["logos"] = [{"id": f"l{i}", "asset": l["asset"], "start": get(l["word"])["start"],
                      "end": round(get(l["word"])["start"] + max(0.5, l["duration"]), 3), "trigger": l["word"],
                      **({"size": l["size"]} if l.get("size") else {})}
                     for i, l in enumerate(p["logos"]) if l["asset"] in assets and get(l["word"])]
    plan["cutIns"] = [{"id": f"a{i}", "asset": c["asset"], "mode": c["mode"], "start": get(c["word"])["start"],
                       "end": round(get(c["word"])["start"] + max(0.4, c["duration"]), 3), "trigger": c["word"],
                       **({"shake": c["shake"]} if c.get("shake") else {}), **({"dim": c["dim"]} if c.get("dim") else {}),
                       **({"enter": c["enter"]} if c.get("enter") else {})}
                      for i, c in enumerate(p["cutIns"]) if c["asset"] in assets and get(c["word"])]
    # What the author set by hand on a picture that stays (moved, zoomed, framed, trimmed): Claude does not see it.
    for new in plan["cutIns"]:
        old = next((o for o in old_cut_ins if o["asset"] == new["asset"] and o["mode"] == new["mode"]), None)
        if old:
            new.update({k: old[k] for k in CUT_IN_HAND_SET if k in old and k not in new})
    for new in plan["logos"]:
        old = next((o for o in old_logos if o["asset"] == new["asset"]), None)
        if old:
            new.update({k: old[k] for k in ("x", "y", "size", "rotate", "process", "sfx", "enter", "shake") if k in old and k not in new})
    diagrams = []
    for i, d in enumerate(p["diagrams"]):
        a, b = get(d["fromWord"]), get(d["toWord"])
        if not a or not b:
            continue
        did = f"d{i}"
        elements = [{"id": f"{did}_{j}", "label": e["label"], "at": get(e["word"])["start"], "draw": 0.4, "trigger": get(e["word"])["text"],
                     **{k: e[k] for k in ("icon", "accent", "strike", "check") if e.get(k)},
                     **({"image": e["image"]} if e.get("image") in assets else {})}
                    for j, e in enumerate(d["elements"]) if get(e["word"])]
        diagrams.append({"id": did, "template": d["template"], "description": d["description"], "start": a["start"],
                         "end": b["end"], "elements": elements})
    plan["diagrams"] = diagrams
    sub = get(p["subscribeWord"]) if p.get("subscribeWord") else None
    if sub:
        base = plan.get("subscribe") or {"scale": 0.33, "x": 332, "y": -72, "keyColor": "0x00983B"}  # keeps rotate / enter / shake
        plan["subscribe"] = {**base, "start": sub["start"], "trigger": sub["id"]}
    elif p.get("subscribeWord") is None:
        plan["subscribe"] = None
    plan["unplacedAssets"] = p.get("unplacedAssets", plan.get("unplacedAssets", []))
    plan["notes"] = ("Claude proposal: " + p.get("notes", ""))[:4000]
    return plan


AUTH_HINT = ("Claude Code is not connected: open Settings in AutoShort (home page) to paste a token, or run `claude` "
             "once in a terminal to log in. Claude Code needs a Claude Pro or Max subscription, or an Anthropic Console API key.")


def explain(text: str) -> str:
    low = text.lower()
    if any(k in low for k in ("invalid api key", "not logged in", "please run /login", "authentication", "oauth", "401", "credit balance")):
        return text.strip()[:600] + " " + AUTH_HINT
    return text


def run_claude(command: str, prompt: str, cwd: Path) -> dict:
    exe = shutil.which(command)
    if not exe:
        raise SystemExit("Claude Code is not installed on this computer: npm install -g @anthropic-ai/claude-code, then see "
                         "Settings in AutoShort.")
    base = [exe, "-p", "--output-format", "json", "--allowedTools", "Read", "Glob", "Grep",
            "--disallowedTools", "Bash", "Edit", "Write", "WebFetch", "WebSearch"]
    attempts = [base + ["--json-schema", json.dumps(PROPOSAL_SCHEMA)], base]
    last = ""
    for args in attempts:
        done = subprocess.run(args, input=prompt if args is attempts[0] else prompt + "\n\nAnswer with ONLY the JSON object matching this schema:\n"
                              + json.dumps(PROPOSAL_SCHEMA), cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        last = (done.stderr or done.stdout)[-2000:]
        if done.returncode != 0:
            print(f"claude exited {done.returncode}: {explain(last)}")
            continue
        envelope = json.loads(done.stdout)
        if envelope.get("is_error"):
            last = str(envelope.get("result"))
            print("claude error:", explain(last))
            continue
        data = envelope.get("structured_output")
        if data is None:
            text = envelope.get("result", "")
            start, end = text.find("{"), text.rfind("}")
            data = json.loads(text[start:end + 1]) if start >= 0 else None
        if data is not None:
            cost = envelope.get("total_cost_usd")
            print(f"claude answered ({envelope.get('num_turns')} turns{f', ${cost:.3f}' if cost else ''})")
            return data
    raise SystemExit(f"Claude did not return a proposal: {explain(last)}")


def main() -> None:
    video, theme_file, schema_dir, command = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4]
    feedback = ""
    if "--feedback-file" in sys.argv:
        feedback = (read_json(Path(sys.argv[sys.argv.index("--feedback-file") + 1])) or {}).get("feedback") or ""
    theme = json.loads(theme_file.read_text(encoding="utf-8"))
    app = app_dir(video)
    plan = read_json(app / "plan.json") or read_json(app / "plan.draft.json")
    if not plan:
        raise SystemExit("import the rush first: the proposal starts from the transcription")
    progress(0.05, "asking Claude to revise the edit (headless)" if feedback else "asking Claude (headless)")
    proposal = run_claude(command, build_prompt(video, plan, theme, feedback), video)
    jsonschema.validate(proposal, PROPOSAL_SCHEMA)
    write_json(app / "cache" / "proposal.json", proposal)
    progress(0.8, "merging the proposal")
    draft = apply_proposal(json.loads(json.dumps(plan)), proposal, auto_cuts(theme, plan))
    contract = json.loads((schema_dir / "plan.schema.json").read_text(encoding="utf-8"))
    errors = list(jsonschema.Draft202012Validator(contract).iter_errors(draft))
    if errors:
        raise SystemExit("the merged draft does not validate: " + "; ".join(e.message for e in errors[:5]))
    write_json(app / "plan.draft.json", draft)
    print(f"draft: {len(draft['concepts'])} concepts, {len(draft['logos'])} logos, {len(draft['cutIns'])} cut-ins, "
          f"{len(draft['diagrams'])} diagrams, {sum(1 for w in draft['words'] if w.get('highlight'))} highlights")
    if proposal.get("notes"):
        print("notes:", proposal["notes"])
    progress(1, "draft ready for review")


if __name__ == "__main__":
    main()
