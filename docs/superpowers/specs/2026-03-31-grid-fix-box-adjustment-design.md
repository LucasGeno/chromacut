# Grid Split Fix + Box Adjustment Phase 1

**Date:** 2026-03-31
**Scope:** Two independent features — improved grid detection for merged bands, and interactive cell editing (select, move, resize, nudge)

---

## 1. Grid Split Fix (merged band detection)

### Problem

`_find_content_bands()` requires a minimum gap of `max(20, int(dimension * 0.03))` pixels between content regions. When Gemini places icons close together (< 20px gap), adjacent icons merge into a single content band, producing fewer cells than expected.

### Change

Add a post-split pass after `_find_content_bands()` returns. For each band significantly wider than the median band width, scan for the narrowest key-color column within it and split there.

New function in `grid.py`:

```python
def _try_split_wide_bands(bands, key_pct, min_split_gap=5):
```

Logic:
1. Compute median band width from all detected bands
2. For each band wider than 1.8x the median: scan its interior columns (excluding 10% margins on each side to avoid edge noise)
3. Find the column with the highest key-color percentage within the band interior
4. If that column has >0.8 key-color density (80% key pixels), split the band at that column
5. Recurse on resulting bands (a band could contain 3+ merged icons)
6. Apply the same logic to row bands

### Integration

In `detect_grid()`, after calling `_find_content_bands()` for both columns and rows:

```python
col_groups = _find_content_bands(col_key_pct < 0.9, min_col_gap)
col_groups = _try_split_wide_bands(col_groups, col_key_pct)
row_groups = _find_content_bands(row_key_pct < 0.9, min_row_gap)
row_groups = _try_split_wide_bands(row_groups, row_key_pct)
```

### Edge cases

- Single wide icon (no key-color valley inside): the 0.8 density threshold prevents false splits. A solid content region has low key-color density throughout — no column will reach 80%.
- Two icons with very blended gap (gradient, not clean green): the 0.8 threshold requires a mostly-clean gap. Blended gaps below 0.8 won't trigger a split. This is intentional — ambiguous gaps should be left for manual box adjustment.
- Bands with only 2 cells: the median heuristic works with 2+ bands. With a single band, no split is attempted (no median to compare against).

### What doesn't change

- `_find_content_bands()` itself — post-split is applied to its output
- Single-icon detection path (no bands found) — untouched
- Existing test fixtures that already pass

### Files changed

- `src/chromacut/grid.py` — ~25 lines new function, 4 lines calling it

### Testing

Two new tests in `test_grid.py`:

1. **Narrow-gap grid**: synthetic 4x1 grid with 10px gaps between 100px cells. Verify 4 cells detected (currently merges into fewer).
2. **No false split**: synthetic single wide icon (200px content, no key-color valley). Verify 1 cell detected (not split).

---

## 2. Box Adjustment Phase 1

### State Model

Two new state variables in `app.js`:

- `editedCells` — mutable array, shallow copy of `analysisData.cells` created on each analyze response. All rendering, preview, and export reads from `editedCells` instead of `analysisData.cells`.
- `activeDrag` — `null` or `{ mode: 'move'|'resize', handle: string, startPointer: {x,y}, startRect: {x,y,w,h}, cellIndex: number }`. Tracks an in-progress drag operation.

`analysisData.cells` remains immutable as the auto-detect baseline for "Reset to auto-detect".

### Coordinate System

All cell bounds are in **source image space** (pixels in the original image). Mouse events on the overlay canvas are converted to image space using the existing scale factors (`overlayCanvas.width / sourceImage.width`).

### Overlay Canvas Interaction

The overlay canvas (`#overlay-canvas`) already renders cell boundaries and has `cursor: crosshair`. We extend it with pointer event handlers.

**Hit-testing:**

```
function hitTest(imgX, imgY) → { type: 'handle'|'cell'|'none', cellIndex, handle }
```

Checks handles first (12px hit zone in canvas space, mapped to image space), then cell interiors, then nothing. Handle names: `nw`, `n`, `ne`, `e`, `se`, `s`, `sw`, `w`.

**Click-to-select:** `pointerdown` on overlay → hit-test. If cell or handle hit, set `selectedCell` to that cell index. If nothing hit, set `selectedCell = -1` (deselect). Redraw overlay.

**Hover:** `pointermove` when not dragging → hit-test, update `_hoveredCell` and cursor. Cursor map:

| Hit | Cursor |
|-----|--------|
| `nw`, `se` | `nwse-resize` |
| `ne`, `sw` | `nesw-resize` |
| `n`, `s` | `ns-resize` |
| `e`, `w` | `ew-resize` |
| cell interior | `move` |
| nothing | `crosshair` |

**Move drag:** `pointerdown` inside selected cell (not on handle) → set `activeDrag = { mode: 'move', ... }`. `pointermove` updates `editedCells[i].x` and `.y`, clamped to image bounds. `pointerup` commits (clears `activeDrag`, triggers preview refresh).

**Resize drag:** `pointerdown` on handle → set `activeDrag = { mode: 'resize', handle, ... }`. `pointermove` updates the appropriate edges of `editedCells[i]` based on handle direction. Clamped to image bounds. Minimum size enforced (20x20px). `pointerup` commits.

### Handle Rendering

Selected cell shows 8 handles: 4 corners + 4 edge midpoints. Each handle is a 6x6px filled magenta square with a 1px dark border, drawn on the overlay canvas. Handles are rendered in canvas space (not image space) so they're always the same visual size regardless of zoom.

Non-selected cells render as they do today (dashed magenta border, number label).

### Keyboard Nudge

Extends the existing `keydown` listener. When `selectedCell >= 0` and focus isn't in an `INPUT`/`TEXTAREA`:

- Arrow keys: nudge `editedCells[selectedCell]` position by 1px
- Shift+Arrow: nudge by 10px
- Clamped to image bounds

Triggers overlay redraw on each keystroke. Backend preview refresh is debounced (300ms after last keystroke) to avoid spamming `/api/preview` during rapid nudging.

### Preview Update on Edit

**During drag:** `updatePreview()` falls back to client-side `quickGreenRemove()` since the backend preview for the edited cell is stale. The existing fallback path in `updatePreview()` already handles this — the preview image for the edited cell is invalidated (set to `null` in `previewImages`).

**On commit (pointerup / nudge keystroke):** Call `POST /api/preview` for the edited cell. On response, update `previewImages[cellIndex]` with the new decoded image. Call `updatePreview()` to render with the fresh backend preview.

### New Endpoint: POST /api/preview

```
POST /api/preview
Body: file (image) + settings JSON string: { "x": int, "y": int, "w": int, "h": int }
Response: { "preview": "data:image/png;base64,..." }
```

Uses existing `despill_crop()` from engine.py. Validates bounds, clamps to image dimensions. Returns a single base64-encoded preview PNG.

### Files changed (backend)

- `src/chromacut/app.py` — new `/api/preview` endpoint (~15 lines)

### Export Integration

`getSettings()` reads from `editedCells` instead of `analysisData.cells`. No other backend changes — the extract endpoint already uses client-provided bounds.

### Cell Thumbnails

`buildCellThumbnails()` uses `editedCells` for bounds. On edit commit, the affected thumbnail is regenerated (redraw from source image with new bounds + `quickGreenRemove`).

### Reset

A "Reset boxes" button in the Detection section of the settings panel. On click:

1. Deep copy `analysisData.cells` back into `editedCells`
2. Restore `previewImages` from `analysisData.previews` (re-decode)
3. Redraw overlay, thumbnails, and preview

### Clamping and Validation Rules

- Minimum cell dimension: 20x20px in source image space
- Position clamped so cell stays fully inside image bounds (0 <= x, y; x+w <= img.width, y+h <= img.height)
- Resize: edges can't cross each other (no inverted rectangles). If a drag would make w < 20 or h < 20, clamp to minimum.

### What's NOT in this phase

- Panel X/Y/W/H numeric inputs (Phase 2)
- Aspect ratio lock toggle (Phase 2)
- Undo/redo stack (Phase 2 — Reset is the escape hatch for now)
- Multi-select (Phase 3)
- Snap lines (Phase 3)

### Files changed (frontend)

- `src/chromacut/static/app.js` — editedCells state, overlay interaction (hit-test, drag handlers, handle rendering), keyboard nudge, preview refresh on edit, reset handler, getSettings/buildCellThumbnails/buildNameFields switched to editedCells. Estimated ~200 lines net new.
- `src/chromacut/static/index.html` — "Reset boxes" button in Detection section
- `src/chromacut/static/style.css` — no changes needed (cursor is set via JS on overlay canvas, handles are drawn on canvas not CSS)

### Testing

**Backend:** One test for `/api/preview` — valid bounds return a decodable base64 RGBA PNG.

**Frontend:** Manual verification:
1. Click cell to select, click empty to deselect
2. Drag cell to move — preview updates after release
3. Drag handles to resize — clamped to image bounds
4. Arrow keys nudge by 1px, Shift+Arrow by 10px
5. Reset button restores auto-detected bounds
6. Export uses edited bounds

---

## Files Changed Summary

| Change | Files | Scope |
|--------|-------|-------|
| Grid split fix | `grid.py` | ~25 lines new function + 4 lines integration |
| Grid split tests | `test_grid.py` | 2 new tests |
| Preview endpoint | `app.py` | ~15 lines new endpoint |
| Preview endpoint test | `test_api.py` | 1 new test |
| Box adjustment frontend | `app.js` | ~200 lines net new (interaction, state, rendering) |
| Reset button | `index.html` | 1 button element |

**Total: ~4 files modified, ~245 lines net new, 3 new tests.**
