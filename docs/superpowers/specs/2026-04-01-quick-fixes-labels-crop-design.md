# Quick Fixes: Label Alignment + Crop Relaxation

**Date:** 2026-04-01
**Scope:** Two small fixes from user feedback — preview label alignment and detection crop margin.

---

## 1. Label Alignment

### Problem

The "Source" and "Preview" labels in `.preview-labels` use `gap: var(--gap-xl)` (32px), while the panels below in `.preview-panels` use `gap: var(--gap-md)` (12px). This mismatch causes the labels to drift relative to their panels, especially at different viewport widths.

### Fix

Change `.preview-labels` gap to `var(--gap-md)` so it matches `.preview-panels`. Both rows use the same flex layout (`flex: 1` children), so matching the gap aligns them.

### Files Changed

- `src/chromacut/static/style.css` — one line: `.preview-labels` gap value

---

## 2. Crop Relaxation

### Problem

`detect_grid()` in `grid.py` computes cell bounds using the absolute first/last row/column with >5% non-key pixels (`content_density = 0.05`). No margin is added, producing pixel-tight bounds that frequently require manual adjustment.

### Fix

After computing `cx, cy, cw, ch` from the density scan, expand each side by a percentage-based margin with min/max clamping:

```python
def _add_cell_margin(cx, cy, cw, ch, img_w, img_h):
    mx = max(4, min(20, round(cw * 0.03)))
    my = max(4, min(20, round(ch * 0.03)))
    cx = max(0, cx - mx)
    cy = max(0, cy - my)
    cw = min(img_w - cx, cw + 2 * mx)
    ch = min(img_h - cy, ch + 2 * my)
    return cx, cy, cw, ch
```

- **Margin:** 3% of cell dimension per side
- **Min:** 4px (prevents invisible margin on small cells)
- **Max:** 20px (prevents excessive margin on large cells)
- **Clamped** to image bounds (no out-of-bounds coordinates)

Applied once in `detect_grid()`, after the content-density scan produces cell coordinates, before returning the cells list. Each cell gets `_add_cell_margin()` applied.

### What stays unchanged

- `despill_crop()` in `engine.py` — its tight-crop operates on the despilled image for preview rendering, not on the editable detection bounds. Leaving it tight is correct (preview should show the extracted content, not extra background).
- `content_density` threshold (0.05) — the margin addresses the symptom (tight bounds) without changing the detection sensitivity.

### Testing

Existing grid detection tests verify cell counts from fixture images. The margin change doesn't affect cell count — only the bounds of each cell become slightly wider.

Add one test: create a synthetic image with a known content block at specific coordinates. Verify detected bounds include the expected margin (wider than the exact content bounds by the margin amount).

### Files Changed

- `src/chromacut/grid.py` — new `_add_cell_margin()` function (~8 lines), called in `detect_grid()`
- `tests/test_grid.py` — one new test for margin verification

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `style.css` | `.preview-labels` gap: `var(--gap-xl)` → `var(--gap-md)` |
| `grid.py` | `_add_cell_margin()` function, applied after density scan |
| `test_grid.py` | One new test for cell margin |

**Estimated: ~3 files modified, ~25 lines net new. 1 new test.**
