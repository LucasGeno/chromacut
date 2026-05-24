# Demo capture — how to (re)generate the chromacut demo loop

The `/chromacut` landing demo is a **recording of the real tool**, not a
hand-authored animation. That keeps it honest as the UI changes — refreshing it
is two commands.

## Prerequisites

- **chromacut running locally** from this worktree:
  ```bash
  uv venv .venv && uv pip install -e ".[dev]"
  .venv/bin/python -m chromacut --no-open      # serves http://localhost:6100
  ```
- **ffmpeg** with an AV1 encoder (`libsvtav1` preferred). Check:
  ```bash
  ffmpeg -encoders | grep av1
  ```
  The encode script falls back to `libaom-av1`, then `libx264`, and prints which
  it used.
- **Playwright + Chromium.** This repo is python-only (no `package.json`), so the
  capture script resolves Playwright from an external install. By default it
  looks in `~/.claude/skills/playwright-skill/node_modules`. Override with
  `PLAYWRIGHT_DIR=/path/to/node_modules` (a dir containing `playwright`), e.g. if
  you `npm i playwright && npx playwright install chromium` somewhere.

## Run

```bash
# 1. Record the real flow (upload -> analyze -> extract) to scripts/_capture/raw-demo.webm
#    and grab the output-state poster source.
node scripts/capture-demo.mjs

# 2. Encode AV1 MP4 (<500KB) + WebP poster into src/chromacut/static/.
bash scripts/encode-demo.sh
```

Outputs:
- `src/chromacut/static/chromacut-demo.mp4`  (committed)
- `src/chromacut/static/chromacut-demo-poster.webp`  (committed)
- `scripts/_capture/`  (intermediate raw video + poster source — gitignored)

## Knobs

| Env | Default | Purpose |
|-----|---------|---------|
| `TARGET_URL` | `http://localhost:6100` | running chromacut server |
| `FIXTURE` | `tests/fixtures/gemini-grid-3x1.png` | demo image (3-cell grid reads clearly) |
| `PLAYWRIGHT_DIR` | playwright-skill node_modules | where to resolve Playwright |

## Why this fixture

`gemini-grid-3x1.png` analyzes as a 3-cell grid: enough to show off grid
detection + multi-cell extract + the detected-cell strip, without the clutter of
the 12-cell fixtures. The recorded "output state" (clean desk PNG on the
checkerboard, named icon-1..3, Export → "Exported 3 icon(s)") is the poster.
