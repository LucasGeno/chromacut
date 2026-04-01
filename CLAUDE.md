# CLAUDE.md — chromacut

## Project overview

chromacut — local web app for extracting clean PNGs from AI-generated chroma-key images. pip-installable, FastAPI backend, vanilla JS frontend (ES modules, no build step).

## Dev setup

```bash
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
```

## Common commands

- **Run tests:** `.venv/bin/python -m pytest -v`
- **Start dev server:** `.venv/bin/python -m chromacut` (opens at localhost:6100)
- **CLI extract:** `chromacut extract source.png --name icon`

## Architecture

FastAPI app (`app.py`) serves static frontend and API endpoints. Core pipeline in `engine.py` (despill, erosion, resize). Grid detection in `grid.py`. Frontend is vanilla JS ES modules under `static/js/` — no framework, no build step.

## Key conventions

- No OpenCV, no AI models, no Node.js
- NEAREST resampling for pixel art, LANCZOS for illustrated
- All cell coordinates in source image pixels
- VFX-standard despill: `G = min(G, max(R, B))`
- See `docs/design.md` for visual design system

## Frontend module map

| Module | Responsibility |
|--------|---------------|
| `static/js/app.js` | Entry point: DOM refs, event wiring, analyzeImage, guides, handleFile, showWorkspace, resetWorkspace, drawSource, updateDetectionUI, buildCellThumbnails, buildNameFields |
| `static/js/state.js` | Shared mutable state object, resetState, initCells, snapshotCells, restoreCells |
| `static/js/overlay.js` | drawOverlay, canvasToImage, imageToCanvas, hitTest, getHandlePositions, HANDLE_NAMES, CURSOR_MAP |
| `static/js/interaction.js` | setupInteraction (pointer events, drag move/resize, arrow-key nudge), refreshCellPreview, rebuildCellThumbnail |
| `static/js/preview.js` | updatePreview, showOriginalInPreview, quickGreenRemove |
| `static/js/export.js` | getSettings, doExport |

## Git conventions

- Conventional commits: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`
- No AI attribution — no Co-authored-by trailers
- No --no-verify
- No force push to main

## Test fixtures

9 real Gemini images in `tests/fixtures/`, parametrized regression tests.

```bash
.venv/bin/python -m pytest tests/test_grid.py -v
```
