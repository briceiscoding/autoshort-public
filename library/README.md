# library/

Brand resources shared by every short: `fonts/`, `sfx/`, `brand/` (subscribe overlay), `charte.md` (editing rules,
also given to the Claude plan proposal). The app reads them and never writes here. The values used by the renderer live
in `theme/theme.json`.

AutoShort ships with a neutral style, on purpose: every text in Montserrat ExtraBold, white, no accent colour, no sound
and no subscribe animation. Make it yours to get every effect:

- `fonts/`: only Montserrat ExtraBold (SIL Open Font License 1.1, text in `fonts/Montserrat-OFL.txt`). Add your own
  fonts from the Styles tab (Google Fonts by name, or a .ttf / .otf / .woff file).
- `sfx/`: empty. Import your sounds from the Brand kit page (one per moment: picture, logo, zoom, concept, diagram…);
  a moment without a sound stays silent.
- `brand/`: empty. Add `subscribe.mp4`, your own subscribe animation on a green background (keyed at export), to show
  a subscribe reminder when you say "abonne-toi"; without it no reminder is shown.
- `charte.md`: the editing rules of the neutral style, to adapt to your brand (Claude reads it for every plan proposal).

Colours, outlines, backgrounds and the call-to-action word style are set in the Styles tab ("Save as default for all
videos") or in `theme/theme.json`. Only add files you have the right to use.
