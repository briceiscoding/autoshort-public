# library/

Brand resources shared by every short: `fonts/`, `sfx/`, `brand/` (subscribe overlay), `charte.md` (editing rules,
also given to the Claude plan proposal). The app reads them and never writes here. The values used by the renderer live
in `theme/theme.json`.

What ships with the repository is free to use:

- `fonts/`: Poppins, Montserrat, DM Serif Display, Bitcount (SIL Open Font License 1.1). Add your own fonts from the
  Styles tab (Google Fonts by name, or a .ttf / .otf / .woff file).
- `sfx/`: `bloop.wav`, `whoosh.wav`, `keyboard_typing_fast.wav`, synthesised for AutoShort (public domain, CC0). Drop
  your own sounds here and point `theme/theme.json` -> `sfx` at them.
- `brand/`: empty. Add `subscribe.mp4`, your own subscribe animation on a green background (keyed at export), to show
  a subscribe reminder when you say "abonne-toi"; without it no reminder is shown.
- `charte.md`: an example charter, to adapt to your brand.

Only add files you have the right to use.
