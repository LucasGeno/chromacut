# Batch 1: Housekeeping & Developer Experience

**Date:** 2026-04-01
**Scope:** Five independent tasks to get the project properly set up for sustained development: CLAUDE.md, version bump, app.js decomposition, single-icon PNG download, and design system documentation.

---

## 1. CLAUDE.md

Create `/CLAUDE.md` at the repo root with:

- **Project overview:** chromacut — local web app for extracting clean PNGs from AI-generated chroma-key images. pip-installable, FastAPI backend, vanilla JS frontend (ES modules, no build step).
- **Dev setup:**
  ```bash
  python3 -m venv .venv
  .venv/bin/pip install -e ".[dev]"
  ```
- **Common commands:**
  - Run tests: `.venv/bin/python -m pytest -v`
  - Start dev server: `.venv/bin/python -m chromacut` (opens at localhost:6100)
  - CLI extract: `chromacut extract source.png --name icon`
- **Architecture:** FastAPI app (`app.py`) serves static frontend and API endpoints. Core pipeline in `engine.py` (despill, erosion, resize). Grid detection in `grid.py`. Frontend is vanilla JS ES modules under `static/js/` — no framework, no build step.
- **Key conventions:**
  - No OpenCV, no AI models, no Node.js
  - NEAREST resampling for pixel art, LANCZOS for illustrated
  - All cell coordinates in source image pixels
  - VFX-standard despill: `G = min(G, max(R, B))`
  - See `docs/design.md` for visual design system
- **Frontend module map:** (updated after decomposition — see section 3)
- **Git conventions:** Conventional commits, no AI attribution (no Co-authored-by), no --no-verify
- **Test fixtures:** 9 real Gemini images in `tests/fixtures/`, parametrized regression tests. Run with `.venv/bin/python -m pytest tests/test_grid.py -v`

### Files changed

- Create: `CLAUDE.md`

---

## 2. Version Bump to 0.2.0

Current version in `pyproject.toml` is `0.1.0`. The shipped feature set (box adjustment, preview parity, grid split, paste, erosion scaling) is well past v0.1.

### Changes

- `pyproject.toml`: `version = "0.1.0"` → `version = "0.2.0"`
- `src/chromacut/__init__.py`: update version string if present

### Files changed

- Modify: `pyproject.toml`
- Modify: `src/chromacut/__init__.py` (if it has a version)

---

## 3. app.js Decomposition into ES Modules

### Problem

`app.js` is 994 lines in a single IIFE handling state, overlay rendering, hit-testing, drag interaction, preview logic, export, guides, and event listeners. Future feature work (Batch 2: undo, shortcuts, precision controls) will each add 50-150 lines. The file needs to be split before it grows further.

### New file structure

```
src/chromacut/static/
├── js/
│   ├── app.js          # Entry point (~150 lines)
│   ├── state.js        # State + init/reset (~40 lines)
│   ├── overlay.js      # Overlay rendering + hit-test (~160 lines)
│   ├── interaction.js  # Pointer events + drag + nudge (~200 lines)
│   ├── preview.js      # Preview rendering + refresh (~180 lines)
│   └── export.js       # Settings + export (~60 lines)
├── style.css
└── index.html
```

### Shared state pattern

`state.js` exports a mutable state object and helper functions:

```javascript
export const state = {
    sourceFile: null,
    sourceImage: null,
    analysisData: null,
    selectedCell: 0,
    hoveredCell: -1,
    previewImages: [],
    editedCells: [],
    activeDrag: null,
    lastSourceCrop: null,
};

export function resetState() { /* clear all fields */ }
export function initCells(analysisData) { /* deep copy cells, decode previews */ }
```

All other modules import `{ state }` and read/write it directly. No event bus, no pub/sub.

### Module responsibilities

| Module | Owns | Imports from |
|--------|------|-------------|
| `state.js` | State object, resetState, initCells | nothing |
| `overlay.js` | drawOverlay, hitTest, canvasToImage, imageToCanvas, getHandlePositions, HANDLE_NAMES, CURSOR_MAP | state |
| `interaction.js` | setupInteraction (wires pointer events, drag, nudge). Exports setup function called by app.js | state, overlay, preview |
| `preview.js` | updatePreview, showOriginalInPreview, refreshCellPreview, rebuildCellThumbnail, quickGreenRemove | state |
| `export.js` | getSettings, doExport | state |
| `app.js` | DOM refs, event wiring (tabs, settings, resize, paste, reset, before/after), analyzeImage, guides loading. Calls setup functions from other modules | all |

### DOM refs

DOM element references (`$`, `$$`, specific element refs) stay in `app.js` and are passed to module functions as arguments where needed — not stored in global state. This keeps modules testable and decoupled from the DOM structure.

### HTML change

```html
<!-- old -->
<script src="/static/app.js"></script>

<!-- new -->
<script type="module" src="/static/js/app.js"></script>
```

### Static file serving

The existing `app.mount("/static", StaticFiles(...))` serves the entire `static/` directory. `static/js/` is automatically available. No backend changes.

### Old app.js

Delete `src/chromacut/static/app.js` after the new modules are in place and verified.

### Migration approach

Pure refactor — no behavior changes. Every function moves to its module with identical logic. The Python test suite is unaffected. Manual verification confirms UI works identically.

### Files changed

- Create: `src/chromacut/static/js/state.js`
- Create: `src/chromacut/static/js/overlay.js`
- Create: `src/chromacut/static/js/interaction.js`
- Create: `src/chromacut/static/js/preview.js`
- Create: `src/chromacut/static/js/export.js`
- Create: `src/chromacut/static/js/app.js`
- Delete: `src/chromacut/static/app.js`
- Modify: `src/chromacut/static/index.html` (script tag)

---

## 4. Single-Icon Direct PNG Download

### Problem

Currently, even a single icon exports as a zip file containing one PNG. For single-cell images, a direct PNG download is more natural.

### Backend change

In `/api/extract`, after processing cells: if `len(cells) == 1`, return the PNG directly with `media_type="image/png"` instead of wrapping in a zip.

```python
if len(cells) == 1:
    return Response(
        content=png_buf.getvalue(),
        media_type="image/png",
        headers={"Content-Disposition": f"attachment; filename={name}.png"},
    )
```

The multi-cell zip path is unchanged.

### Frontend change

In `doExport()`, check response content-type:
- `image/png` → download blob as `.png`
- `application/zip` → download blob as `.zip` (current behavior)

### CLI

No changes — CLI `extract` already writes individual files.

### Files changed

- Modify: `src/chromacut/app.py` (~5 lines in extract endpoint)
- Modify: `src/chromacut/static/js/export.js` (~5 lines in doExport — this file exists after decomposition in section 3)

### Testing

Update `test_extract_returns_zip` to verify multi-cell still returns zip. Add one test: single-cell extract returns `image/png` content-type with valid PNG data.

---

## 5. Design System Documentation

Create `docs/design.md` documenting the existing visual system: color tokens, typography scale, spacing tokens, component patterns, canvas conventions, interaction patterns, and layout structure.

This is a reference document, not a redesign. Already written and approved in the design presentation.

### Files changed

- Create: `docs/design.md` (already written)

---

## Files Changed Summary

| Change | Files | Scope |
|--------|-------|-------|
| CLAUDE.md | `CLAUDE.md` | New file |
| Version bump | `pyproject.toml`, `__init__.py` | 2 lines |
| JS decomposition | 6 new JS modules, delete old app.js, modify index.html | ~994 lines moved, 0 net new logic |
| Single PNG download | `app.py`, `export.js` | ~10 lines |
| Design doc | `docs/design.md` | New file (already written) |
| Tests | `test_api.py` | 1 new test |

**Total: 8 new files, 3 modified, 1 deleted, ~10 lines net new logic.**
