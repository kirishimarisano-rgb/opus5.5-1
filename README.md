# 熵 Entropy — 4-minute art PV

Current stage: **checkpoint 1 (proposal)** → see [DIRECTOR_NOTES.md](DIRECTOR_NOTES.md).

| Path | What |
|---|---|
| `beatmap.json` | Master clock (provisional 72 BPM until a score arrives) |
| `docs/MUSIC_SPEC.md` | Score requirements for the composer |
| `docs/checkpoint1/` | Final-shape candidates, arc chart |
| `src/engine/` | WebGL2 renderer (HDR, bloom, grade, AA) |
| `src/film/` | Tokens, structure, geometry, scenes |
| `tools/` | beatmap / stills / boards scripts |

```
node tools/beatmap.mjs       # beatmap.json + music/temp_click.wav
node tools/still.mjs A B C   # candidate stills
python3 tools/boards.py      # contact sheet + arc chart
```
Requires Node 22 with Playwright + Chromium, ffmpeg, Python 3 + Pillow.
Font: Noto Serif TC (subset, SIL OFL — `assets/fonts/OFL.txt`).
