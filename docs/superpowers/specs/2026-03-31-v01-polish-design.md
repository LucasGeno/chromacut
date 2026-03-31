# v0.1 Polish — Erosion Scaling, Preview Parity, Paste, Code Cleanup

**Date:** 2026-03-31
**Scope:** Ship-ready polish for chromacut v0.1 — two engine fixes, one UX addition, three code cleanups
**Supersedes:** `2026-03-31-erosion-scaling-preview-parity-design.md` (erosion + preview sections are carried forward here with refinements)

---

## 1. Resolution-Proportional Erosion

### Problem

`engine.py:37` hardcodes `binary_erosion(solid_mask, iterations=1)`. On small sprites (16px) this is proportionally aggressive; on large renders (1024px+) it's insufficient to remove color fringe.

### Change

In `despill_extract()`, replace static `iterations=1` with:

```python
min_dim = min(px.shape[0], px.shape[1])
iterations = max(1, min(min_dim // 200, 3))
eroded = binary_erosion(solid_mask, iterations=iterations)
```

Hard cap at 3 iterations until real fixture evidence supports stronger erosion. At 5 iterations (1024px uncapped), fine line-art and antialiased edges risk being eaten.

### Behavior

| Crop size | iterations | Effect |
|-----------|-----------|--------|
| 16x16 | 1 | Unchanged |
| 128x128 | 1 | Unchanged |
| 200x400 | 1 | Unchanged |
| 512x512 | 2 | Slightly more fringe removal |
| 1024x1024 | 3 | Capped — proportional but conservative |

### Files changed

- `src/chromacut/engine.py` — 3 lines in `despill_extract()`

### Testing

One new test in `test_engine.py`: create a 600x600 synthetic image (green background, centered white square). Verify iterations resolves to 3 (600 // 200) and alpha mask has more fringe removed than a 100x100 equivalent. Assert on erosion depth difference, not pixel-exact values.

Existing tests unchanged — small fixtures stay at iterations=1.

---

## 2. Hybrid Backend Preview

### Problem

The client-side `quickGreenRemove()` uses Euclidean distance thresholding while the backend uses `green_excess = G - max(R, B)` with strict VFX despill. The preview doesn't match the export.

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

**Preview size cap:** Before base64 encoding, each preview is downscaled so its largest dimension does not exceed 384px (preserving aspect ratio, using NEAREST for pixel art, LANCZOS for illustrated). This bounds the response size for dense grids — a 4x2 grid produces ~8 previews at max 384x384, roughly ~800KB-1MB base64 total.

### Before/after framing contract

Both the "before" (raw source) and "after" (despilled preview) views use the **full cell bounds** as their framing box. The before view draws the raw source pixels within the cell region. The after view draws the despilled content within the same cell region. Padding is applied identically in both modes. This prevents perceived "jumping" when toggling Space.

### Frontend changes

**`app.js`:**

- On analyze response: decode each base64 preview into an `HTMLImageElement`, store in a `previewImages` array
- `updatePreview()` draws the pre-despilled image directly onto the result canvas with padding/size/style applied — no `quickGreenRemove()` call
- `quickGreenRemove()` retained only for cell strip thumbnails (small, approximate is acceptable)
- `_lastSourceCrop` tracks the full cell bounds (x, y, w, h from analysisData), used as the framing box for both before and after views
- Before/after toggle (Space key): both views use identical framing (full cell bounds). Release shows despilled preview within cell frame. Hold shows raw source within same cell frame. Padding applied identically in both modes

### Latency

`despill_extract()` on a ~400x400 crop: ~5-15ms. For a 4x2 grid: ~40-120ms added to the analyze call. Grid detection already dominates; this is incremental.

### What doesn't change

- `/api/extract` — export path untouched (except the separate optimization in section 7)
- Cell strip thumbnails — keep using `quickGreenRemove()`
- No new endpoints, no new dependencies
- Backwards-compatible: clients ignoring `previews` still work

### Testing

One new test in `test_api.py`: call `/api/analyze`, verify response contains `previews` key, `previews` is a list of base64 strings with length matching `cells`, and decoded preview is a valid RGBA PNG.

Update existing analyze test to include `previews` in expected response keys.

One new test in `test_engine.py`: verify `despill_crop()` returns a tight-cropped RGBA image with no fully transparent border rows/columns.

---

## 3. Clipboard Paste

### Change

Add a `paste` event listener on `window` in `app.js`:

```javascript
window.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) handleFile(file);
            return;
        }
    }
});
```

Works in both drop zone and workspace states. Pasting while an image is loaded replaces it (same behavior as dropping a new file).

### UI text updates

In `index.html`:
- `.drop-text`: change from `"Drop a chroma-key image here"` to `"Drop or paste a chroma-key image here"`
- `.drop-hint`: unchanged (`"PNG or JPG with solid-color background"`)

### Files changed

- `src/chromacut/static/app.js` — paste listener (~10 lines)
- `src/chromacut/static/index.html` — drop zone text update (2 lines)

### Testing

Manual verification only — clipboard API not available in test client.

---

## 4. Deduplicate `_sanitize_name()`

### Problem

Identical `_sanitize_name()` function exists in both `cli.py:10-15` and `app.py:25-31`.

### Change

Create `src/chromacut/utils.py` with the shared function. Import from both `cli.py` and `app.py`. Remove the local definitions.

### Files changed

- `src/chromacut/utils.py` — new file, ~10 lines
- `src/chromacut/cli.py` — replace local function with import
- `src/chromacut/app.py` — replace local function with import

### Testing

Existing path traversal tests in `test_api.py` cover the API path. Add one unit test for `sanitize_name()` in a new `test_utils.py` covering the behavior matrix: `../`, `\`, leading/trailing dots, empty string, and clean passthrough.

---

## 5. Fix `_hoveredCell` Reference

### Problem

`app.js:256` reads `typeof _hoveredCell` but the variable is never declared. The overlay drawing code has hover styling logic but no mouse listeners to drive it. Currently harmless (typeof on undeclared returns `'undefined'`) but sloppy.

### Change

Declare `let _hoveredCell = -1` in the state section at the top of app.js (alongside `selectedCell`). Leave the drawing code as-is — it's correct scaffolding for click-to-select later.

### Files changed

- `src/chromacut/static/app.js` — 1 line

---

## 6. Vectorize Grid Key Mask

### Problem

`grid.py:85-87` builds the key_mask row-by-row:

```python
for y in range(h):
    key_mask[y] = _is_key_color(arr[y : y + 1], key_color).flatten()
```

This is slow on large images (1024x1024+).

### Change

Replace with a single vectorized call:

```python
key_mask = _is_key_color(arr.reshape(-1, arr.shape[-1]), key_color).reshape(h, w)
```

`_is_key_color` already handles reshaping via its `if pixels.ndim == 3` branch. The full array is passed at once and reshaped back to 2D.

### Files changed

- `src/chromacut/grid.py` — replace 3 lines with 1

### Testing

Existing grid detection tests cover correctness. No new tests needed — this is a pure performance optimization with identical output.

---

## 7. Remove Double Analysis on Export

### Problem

`app.py:86` calls `analyze_image(img)` on every export request, repeating grid detection that already ran during `/api/analyze`. The client has the cell bounds from the analyze response.

### Change

**Frontend (`app.js`):** In `getSettings()`, include `x`, `y`, `w`, `h` from `analysisData.cells` for each cell alongside `index` and `name`.

**Backend (`app.py`):** Remove the `analyze_image(img)` call from the extract endpoint. Read `x`, `y`, `w`, `h` directly from each cell in the settings JSON. Add bounds validation: clamp cell coordinates to image dimensions.

### Files changed

- `src/chromacut/app.py` — remove analyze call, read bounds from settings, add clamp
- `src/chromacut/static/app.js` — add bounds to `getSettings()` output

### Testing

Update existing `test_extract_returns_zip` to include cell bounds in the settings JSON. Add one new test: verify extraction works with explicit bounds (no analysis needed server-side).

---

## Files Changed Summary

| Change | Files | Scope |
|--------|-------|-------|
| Erosion scaling | `engine.py` | 3 lines modified |
| Despill crop helper | `engine.py` | ~15 lines new function |
| Analyze previews | `app.py` | ~15 lines in analyze endpoint |
| Frontend preview swap | `app.js` | Rework `updatePreview()`, store preview images |
| Clipboard paste | `app.js`, `index.html` | ~12 lines listener + text update |
| Deduplicate sanitize | new `utils.py`, `cli.py`, `app.py` | Extract + 2 import swaps |
| Fix hoveredCell | `app.js` | 1 line |
| Vectorize key_mask | `grid.py` | Replace 3 lines with 1 |
| Remove double analysis | `app.py`, `app.js` | ~15 lines backend + ~5 lines frontend |
| Tests | `test_engine.py`, `test_api.py`, `test_utils.py` | ~5 new tests + minor updates |

**Total: ~7 files modified, 2 new files (`utils.py`, `test_utils.py`), ~5 new tests.**
