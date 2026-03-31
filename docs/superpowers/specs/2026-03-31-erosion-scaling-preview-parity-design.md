# Erosion Scaling + Preview Parity

**Date:** 2026-03-31
**Scope:** Two surgical fixes to the chromacut extraction engine and preview pipeline
**Phase:** v0.2 refinements (follows Group A, before Group B)

---

## Context

Code review of the v0.1/v0.2-A codebase identified two genuine issues:

1. **Static 1px alpha erosion** — `binary_erosion(solid_mask, iterations=1)` is resolution-ignorant. On very small sprites (16px) it's proportionally aggressive; on large renders (1024px+) it's insufficient to remove color fringe.
2. **Preview desync** — The client-side `quickGreenRemove()` uses Euclidean distance thresholding while the backend uses `green_excess = G - max(R, B)` with strict VFX despill. Users see an approximate preview but get a different (better) result on export.

---

## Fix 1: Resolution-Proportional Erosion

### Change

In `engine.py` `despill_extract()`, replace the static `iterations=1` with a calculation based on the input image's smaller dimension:

```python
min_dim = min(px.shape[0], px.shape[1])
iterations = max(1, min_dim // 200)
eroded = binary_erosion(solid_mask, iterations=iterations)
```

### Behavior

| Crop size | iterations | Effect |
|-----------|-----------|--------|
| 16x16 | 1 | Unchanged |
| 128x128 | 1 | Unchanged |
| 200x400 | 1 | Unchanged |
| 512x512 | 2 | Slightly more fringe removal |
| 1024x1024 | 5 | Proportional to resolution |

### Files changed

- `src/chromacut/engine.py` — 3 lines in `despill_extract()`

### What doesn't change

- No new parameters exposed to the API or CLI
- No frontend changes
- Existing tests pass unchanged (fixtures use small synthetic images, stay at iterations=1)

---

## Fix 2: Hybrid Backend Preview

### Problem

The frontend runs its own green-removal approximation (`quickGreenRemove()`) for the result preview. This uses different math than the backend's `despill_extract()`, so the preview doesn't match the export. Padding/size/style adjustments are pure geometry and don't need backend involvement — only the despill step produces different results.

### Architecture

Return backend-rendered despilled crops in the `/api/analyze` response. The frontend uses these clean images for preview rendering instead of running its own despill approximation. Padding, sizing, and centering remain client-side for instant interactivity.

### Backend changes

**`engine.py`** — new helper:

```python
def despill_crop(img: Image.Image, cell: dict) -> Image.Image:
    """Crop a cell from the source, despill, and tight-crop to visible content."""
```

Crops the cell region from the source image, runs `despill_extract()`, tight-crops to the bounding box of visible pixels (alpha >= 128), returns the RGBA result.

**`app.py`** — `/api/analyze` response gains a `previews` field:

```json
{
  "mode": "grid",
  "key_color": [0, 255, 0],
  "content_height": 800,
  "cells": [...],
  "previews": ["data:image/png;base64,...", "data:image/png;base64,..."]
}
```

Each preview is a base64-encoded PNG of the despilled, tight-cropped cell content. One per cell, indexed to match the `cells` array.

### Frontend changes

**`app.js`** — `updatePreview()` rework:

- On analyze response: decode each base64 preview into an `HTMLImageElement`, store alongside cell data
- `updatePreview()` draws the pre-despilled image directly onto the result canvas with padding/size/style applied — no `quickGreenRemove()` call
- `quickGreenRemove()` removed from the result preview path; retained only for cell strip thumbnails (small, approximate is acceptable)
- Before/after toggle (Space key): default view uses backend preview; holding Space temporarily shows the raw source crop (unchanged behavior, cleaner data source)

### Latency

`despill_extract()` on a ~400x400 crop: ~5-15ms (vectorized NumPy). For a 4x2 grid: ~40-120ms added to the analyze call. Grid detection is the heavier operation; this is incremental.

### What doesn't change

- `/api/extract` — export path untouched
- Cell strip thumbnails — keep using `quickGreenRemove()`
- No new endpoints
- No new dependencies
- Backwards-compatible: clients ignoring `previews` still work

---

## Testing

### Erosion scaling (test_engine.py)

One new test: create a large synthetic image (600x600 green background with centered white square). Verify that:
- The erosion iterations resolve to 3 (600 // 200)
- The alpha mask has more fringe removed than a 100x100 equivalent
- Assert on erosion depth difference, not pixel-exact values

### Preview parity (test_api.py)

One new test: call `/api/analyze`, verify:
- Response contains `previews` key
- `previews` is a list of base64 strings, length matches `cells` length
- Decoded preview is a valid RGBA PNG with transparent background (no green excess in transparent regions)

Update existing analyze tests to include `previews` in expected response keys.

### Unchanged

- `test_grid.py` — grid detection is untouched
- Existing engine tests — small fixtures stay at iterations=1

**Total: ~3 new tests, minor schema assertion updates.**

---

## Files changed summary

| Change | Files | Scope |
|--------|-------|-------|
| Erosion scaling | `src/chromacut/engine.py` | 3 lines |
| Despill crop helper | `src/chromacut/engine.py` | ~15 lines new function |
| Analyze previews | `src/chromacut/app.py` | ~10 lines in analyze endpoint |
| Frontend preview swap | `src/chromacut/static/app.js` | Rework `updatePreview()`, store preview images |
| Tests | `tests/test_engine.py`, `tests/test_api.py` | ~3 new tests + schema updates |
