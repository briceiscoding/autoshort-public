# projects/

One folder per short, created by the app ("New short"):

```
projects/<slug>/
├── rush/       the video you filmed (a copy; the app never modifies it)
├── assets/     pictures, videos, music, notes.md (copies; never modified)
├── diagrams/   optional hand-written diagrams (*.tsx, importing @kit/schema)
├── data/       everything the app generates: plan.json, history/, analysis.json, cache/, render/, control/
└── exports/    rendered shorts <slug>_vN.mp4 + .srt (never overwritten)
```

Not versioned in git (videos are large and personal).
