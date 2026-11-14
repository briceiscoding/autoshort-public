# AutoShort architecture

Self-contained local app: everything lives in this folder (projects, brand library, GPU environment); nothing
outside it is read at runtime. One launcher (`start.bat`, or the desktop icon) starts a FastAPI backend and the
Vite front end, then opens the app in its own window (Chrome, else Edge, in `--app` mode: no tabs, no address bar).

## Folder layout

```
autoshort/
├── start.bat / stop.bat        launcher (installs what is missing, starts both servers hidden, logs in logs/)
├── launcher/                   desktop shortcut target (.vbs) and icon
├── config.json                 projectsRoot, libraryRoot, aiPython (relative to this folder), ports
├── projects/                   one folder per short (not in git), see below
├── library/                    brand resources shared by all shorts: fonts/, sfx/, music/, brand/, charte.md (not in git)
├── ai/                         GPU environment: requirements.lock.txt -> ai/.venv (CUDA 12.6), rvm/ (matting model
│                               code), models/ (weights downloaded once)
├── theme/theme.json            visual identity (charte values), applied by default; plan.themeOverrides per short
├── theme/vocabulary.json       technical vocabulary corrections applied at import
├── schema/                     JSON Schema contract, GENERATED from zod (npm run gen:schema)
├── fixtures/sample/            test data only: a small neutral plan
├── app/                        React + TypeScript (Vite) and everything Remotion
│   ├── src/model/              zod schemas: plan.ts (source of truth), theme.ts, analysis.ts
│   ├── src/edl/                buildEdl.ts, time.ts (rush <-> output time)
│   ├── src/lint/lint.ts        linter: pure functions on the plan
│   ├── src/composition/        Remotion composition shared by preview AND export
│   │   ├── Main.tsx            layers in charte order, speaker cutout over bg pictures, audio modes, overlays
│   │   ├── Captions.tsx, ConceptText.tsx, AssetLayer.tsx, GaugeLayer.tsx
│   │   ├── geometry.ts         rectangles of on-screen elements (shared with the linter)
│   │   ├── diagrams/           Sketch (rough.js), primitives, icons (sketch set + Lucide), templates
│   │   ├── kit/                @kit/* imports for hand-written diagrams (escape hatch)
│   │   └── custom/             registry of hand-written diagrams
│   ├── src/ui/                 editor: Preview (Player), Timeline, Inspector, Panels, FileDrop, ops.ts (pure edits)
│   ├── scripts/                edl-cli.ts, render.ts (Remotion bundler/renderer), gen-schema.ts, ui-smoke.ts
│   └── tests/                  vitest: EDL, one-line captions, edit ops on the sample plan
└── server/                     FastAPI backend
    ├── autoshort_server/       main.py (routes), store.py (projects, file intake, history, write guard), jobs.py,
    │                           pipelines.py (job definitions), models.py (pydantic mirror), media.py (typing)
    ├── jobs/                   job step scripts (subprocesses); gpu_*.py run in ai/.venv
    └── tests/                  pytest
```

Per project (`projects/<slug>/`, created by "New short"):

```
rush/                         the filmed video, copied in by the app (dropped or picked), never modified
assets/                       pictures, videos, music, notes.md, copied in, never modified
diagrams/                     optional hand-written diagrams (*.tsx)
exports/                      <slug>_vN.mp4 + .srt, new versions only, never overwritten
data/
├── plan.json                 THE editable source of truth (rush time)
├── plan.draft.json           Claude proposal waiting for review (an import or a reset replaces plan.json, its draft and history)
├── analysis.json             face track, VAD / burst regions, transcription settings, export loudness
├── history/plan_*.json       snapshots (autosave keeps one per minute at most, 300 kept)
├── cache/                    transcript_raw, vad, bursts, face, probe, assets catalog, keyed subscribe.webm, logo copies,
│                             matte/ (speaker cutouts for bg pictures, VP9 with alpha, index.json in rush time)
├── render/                   edl.json, voice.wav, music.wav, audio.json, render.mp4 (intermediate)
└── control/vN/               control frames with the safe zone drawn
```

## Data model

One contract, two languages: zod (`app/src/model/plan.ts`) generates `schema/plan.schema.json`; the backend
validates every save against that JSON Schema AND the pydantic mirror (`server/autoshort_server/models.py`).
`schemaVersion: 1`. A `variants` field can be added later without breaking anything (not built).

**Plan (rush time)** — everything a human edits:

| Field | Content |
|---|---|
| `source` | rush path, size, fps, duration, crop window |
| `assets` | catalog typed at import: `{id, file, kind: image/video/audio, width, height, duration, alphaBox}` |
| `words` | every transcribed word, kept or cut: `{id, text, start, end, score, original, blockStart, highlight}` |
| `spans` | partition of the rush: `{start, end, keep, zoom, zoomSfx, reason}`; a cut is `keep: false` (toggle it) |
| `concepts`, `logos`, `cutIns`, `gauges` | timed events `{id, start, end, ...options}` (size, x/y, shake, dim, mode, trim...) |
| `diagrams` | `{template, start, end, elements: [{label, icon, image, accent, strike, check, at, draw}]}`; `template: custom` + `component` = escape hatch |
| `sfx` | manual SFX only; automatic ones are derived from the theme rules |
| `music`, `subscribe` | music bed asset + level, subscribe overlay start + placement |
| `sfxRules`, `themeOverrides` | per video overrides |

Caption blocks are flags on words (`blockStart`), highlights too: correcting, highlighting or re-blocking never
touches times. Cut words stay in the plan, so a cut can be restored.

**EDL (output time)** — derived, never edited: `buildEdl(plan, theme)` in TypeScript, recomputed in the browser
on every edit (sub-millisecond). The export job runs the same TS code through `tsx`.

**Theme** — `theme/theme.json` (+ `schema/theme.schema.json`): format, colours, fonts, safe zone, caption,
highlight, concept, logo, screen card, diagram, zoom, audio targets, SFX rules, subscribe defaults, calm rule,
hesitation and call to action lists.

**Analysis** — produced by jobs, read only in the UI: face boxes (source px, every 0.5 s), VAD and burst
regions, transcription settings, loudness of every export.

## Front end / backend

- Front end (Vite dev server, port 5173) proxies `/api`, `/media`, `/library` to the backend (port 8765).
- `/media/<slug>/<path>` and `/library/<path>` serve files with HTTP Range (Player seeking, Remotion renderer).
- Projects: `POST /api/videos {name}` creates `projects/<slug>/`; `PUT .../files/<rush|assets>/<name>` streams a
  dropped file in (never overwrites; one rush per short); `POST .../files/<kind>/copy {path}` copies a local file;
  an added asset comes back typed so the editor appends it to the plan catalog; `POST .../open-folder`.
- Plans: `GET /api/videos/<slug>` (plan, draft, analysis, theme, files), `PUT .../plan` (validated, atomic write,
  history snapshot), `GET .../history`, `POST .../draft/accept`, `DELETE .../draft`.
- Jobs: `POST /api/videos/<slug>/jobs/<type>` → `{id}`; the UI polls `GET /api/jobs?slug=` every second
  (status, progress, step, logs). One job at a time per video. Steps report `PROGRESS <0..1> <message>` lines.
- The editor keeps the plan in memory with an undo/redo stack (300 steps); drags are one undo step; autosave
  700 ms after the last edit.

## Jobs

| Job | Steps | Interpreter |
|---|---|---|
| `import` | probe rush + type assets → WhisperX large-v3 + Silero VAD (float16/8, OOM → int8_float16/4, never CPU) → burst fallback (only when VAD speech has no words, or on demand) → face track (OpenCV) → first plan → preview media | app venv / ai venv (GPU) |
| `propose` | Claude Code headless proposes a plan as data → merged → validated → `plan.draft.json` | app venv + `claude` |
| `preview` | keyed subscribe overlay (VP9 alpha), luma-key logos, rembg logos (GPU), speaker cutout for `bg` pictures (Robust Video Matting, GPU, only the bg ranges + 0.5 s) — on copies in `data/cache` | app / ai venv |
| `export` | EDL (TS) → preview media → exact audio (2-pass loudnorm voice, music levelled + sidechain ducking, SFX gains) → Remotion render (H.264 CRF 18 veryfast, yuv420p BT.709, PNG frames, AAC 192k) → limiter → loudness/true peak measure → `exports/<slug>_vN.mp4` + `.srt` → control frames | node + app venv |

## How Claude is invoked

`server/jobs/propose_plan.py` runs, with `cwd` = the project folder and the prompt on stdin:

```
claude -p --output-format json --json-schema <proposal schema>
       --allowedTools Read Glob Grep --disallowedTools Bash Edit Write WebFetch WebSearch
```

No `--bare` (it would ignore the subscription login). The prompt carries `library/charte.md`, `notes.md`, the asset
catalog, the template catalogue and the transcript with word ids. Claude answers a *proposal* that references
word ids (cuts as word ranges, highlights, concepts, logos, cut-ins, diagrams by template, corrections,
subscribe word). The script merges it into the current plan, validates it against the contract and writes a
draft; the UI shows a banner to accept or discard it (the previous plan stays in History). If the CLI rejects
`--json-schema`, the script retries asking for raw JSON and validates it the same way. Claude never writes code
in this flow; a custom `.tsx` diagram stays a manual escape hatch.

## Preview vs export

The Player and the export render use the same `Main` composition and the same EDL. Differences:
- Preview audio is approximate: rush audio per segment, raw SFX at a flat gain, music at a low fixed volume.
- Export audio is exact: prepared voice and music tracks, measured SFX gains, then a final limiter.
- Media come from the backend over HTTP in both cases (no copy of the rush; Remotion downloads during render).

## bg pictures (behind the head)

A `bg` cut-in draws its picture card over the rush, then the speaker cutout on top: for each kept segment the
picture spans, the matte covering that rush range is played framed exactly like the rush (crop and zoom), so the
speaker passes in front of the picture. Mattes are rush pixels + alpha from Robust Video Matting (mobilenetv3,
downsample to 512 px, recurrent states across frames), encoded VP9 with alpha: the Player plays them natively and
Remotion extracts them with `transparent`. Until the matte exists the picture shows in front (the Inspector says
so and offers to compute it); the export computes missing mattes before rendering.
