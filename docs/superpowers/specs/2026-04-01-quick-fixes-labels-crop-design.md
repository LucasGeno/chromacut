# Quick Fixes: Label Alignment + Crop Relaxation

**Date:** 2026-04-01
**Scope:** Two small fixes from user feedback — preview label alignment and detection crop margin.

---

## 1. Label Alignment

Change `.preview-labels` gap from `var(--gap-xl)` (32px) to `var(--gap-md)` (12px) in `style.css` to match `.preview-panels` gap. One line.

## 2. Crop Relaxation

### Problem

`detect_grid()` in `grid.py` computes cell bounds using the absolute first/last row/column with >5% non-key pixels. No margin is added, producing pixel-tight bounds that frequently require manual adjustment.

### Fix: Neighbor-Aware Margin

After computing all cell bounds, expand each cell by a percentage-based margin — but cap the expansion so cells don't overlap their neighbors.

```python
def _add_cell_margins(cells, img_w, img_h):
    """Expand cell bounds with neighbor-aware margin clamping."""
    for c in cells:
        mx = max(4, min(20, round(c.w * 0.03)))
        my = max(4, min(20, round(c.h * 0.03)))

        # Cap margin at half the gap to nearest neighbor on each side
        for other in cells:
            if other is c:
                continue
            # Check horizontal adjacency
            if _overlaps_y(c, other):
                if other.x > c.x + c.w:  # other is to the right
                    mx = min(mx, (other.x - (c.x + c.w)) // 2)
                elif c.x > other.x + other.w:  # other is to the left
                    mx = min(mx, (c.x - (other.x + other.w)) // 2)
            # Check vertical adjacency
            if _overlaps_x(c, other):
                if other.y > c.y + c.h:  # other is below
                    my = min(my, (other.y - (c.y + c.h)) // 2)
                elif c.y > other.y + other.h:  # other is above
                    my = min(my, (c.y - (other.y + other.h)) // 2)

        mx = max(0, mx)
        my = max(0, my)
        c.x = max(0, c.x - mx)
        c.y = max(0, c.y - my)
        c.w = min(img_w - c.x, c.w + 2 * mx)
        c.h = min(img_h - c.y, c.h + 2 * my)
```

Where `_overlaps_y` checks if two cells share any vertical range (meaning they're horizontally adjacent), and `_overlaps_x` checks if they share any horizontal range (vertically adjacent).

- **Margin:** 3% of cell dimension per side
- **Min:** 4px (but reduced to 0 if neighbor is closer)
- **Max:** 20px per side
- **Neighbor cap:** half the gap between adjacent cells (prevents overlap)
- **Image bounds:** clamped so no cell extends outside the image

### Application Points

Applied at **both** return sites in `detect_grid()`:
1. **Single-cell path** (line 108-110): apply margin to the single cell before returning
2. **Multi-cell path** (before line 146): apply margin to all cells after filtering

### What stays unchanged

- `despill_crop()` in `engine.py` — tight-crops the despilled preview, not the editable bounds
- `content_density` threshold (0.05)

### Testing

1. **Update existing tests:**
   - `test_single_icon_bbox_includes_full_extent`: update assertions to expect margin-expanded bounds (wider than exact 60x60 content)
   - `test_gemini_grid_cells_dont_overlap`: must still pass — neighbor-aware clamping guarantees no overlap
   - All 9 parametrized fixture tests: cell counts unchanged, verify they pass

2. **New tests:**
   - Margin applied on single icon: synthetic image, verify bounds are wider than content by expected margin
   - Margin clamped at image edge: content block near image edge, verify bounds don't exceed image dimensions
   - No overlap after margin: synthetic 2x2 grid with narrow gaps, verify expanded bounds don't overlap

### Files Changed

- `src/chromacut/grid.py` — `_add_cell_margins()`, `_overlaps_x()`, `_overlaps_y()` (~25 lines), called in both paths of `detect_grid()`
- `src/chromacut/static/style.css` — `.preview-labels` gap value
- `tests/test_grid.py` — update 1 existing test assertion, add 3 new tests
