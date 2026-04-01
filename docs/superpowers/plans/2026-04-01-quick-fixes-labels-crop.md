# Quick Fixes: Label Alignment + Crop Relaxation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix preview label alignment and add neighbor-aware margin to detected cell bounds so they're less pixel-tight.

**Architecture:** One CSS line fix. One new Python function (`_add_cell_margins`) applied at both return sites in `detect_grid()`. TDD with 3 new tests + 1 updated test.

**Tech Stack:** Python (NumPy, Pillow), CSS. pytest for testing.

---

## File Map

| File | Path | Changes |
|------|------|---------|
| style.css | `src/chromacut/static/style.css` | `.preview-labels` gap fix |
| grid.py | `src/chromacut/grid.py` | `_add_cell_margins()`, `_overlaps_x()`, `_overlaps_y()`, applied in `detect_grid()` |
| test_grid.py | `tests/test_grid.py` | Update 1 existing test, add 3 new tests |

---

### Task 1: Label Alignment + Crop Margin Tests

**Files:**
- Modify: `src/chromacut/static/style.css:246`
- Modify: `tests/test_grid.py`

Fix the CSS label alignment and write failing tests for crop margin.

- [ ] **Step 1: Fix label alignment**

In `src/chromacut/static/style.css`, line 246, change:

```css
    gap: var(--gap-xl);
```

to:

```css
    gap: var(--gap-md);
```

- [ ] **Step 2: Update existing single-icon bbox test**

In `tests/test_grid.py`, replace `test_single_icon_bbox_includes_full_extent` (lines 70-80):

```python
def test_single_icon_bbox_includes_full_extent():
    """Single-icon bbox should include content plus margin."""
    arr = np.zeros((100, 100, 4), dtype=np.uint8)
    arr[:, :] = [0, 255, 0, 255]
    arr[20:80, 20:80] = [128, 128, 128, 255]  # 60x60 subject
    img = Image.fromarray(arr, "RGBA")
    cells = detect_grid(img, key_color=(0, 255, 0), content_height=100)
    assert len(cells) == 1
    cell = cells[0]
    # Content is 60x60. Margin = max(4, min(20, round(60*0.03))) = 4px per side.
    # So bounds should be ~68x68 centered on the content.
    assert cell.w >= 60, f"Width should be at least content width, got {cell.w}"
    assert cell.h >= 60, f"Height should be at least content height, got {cell.h}"
    assert cell.w <= 68, f"Width should not exceed content + 2*4px margin, got {cell.w}"
    assert cell.h <= 68, f"Height should not exceed content + 2*4px margin, got {cell.h}"
    assert cell.x <= 20, f"X should be at or before content start, got {cell.x}"
    assert cell.y <= 20, f"Y should be at or before content start, got {cell.y}"
```

- [ ] **Step 3: Add test for margin clamped at image edge**

In `tests/test_grid.py`, add after the updated test:

```python
def test_cell_margin_clamps_at_image_edge():
    """Margin should not push cell bounds outside the image."""
    arr = np.zeros((100, 100, 4), dtype=np.uint8)
    arr[:, :] = [0, 255, 0, 255]
    # Content block touching the top-left corner
    arr[0:50, 0:50] = [128, 128, 128, 255]
    img = Image.fromarray(arr, "RGBA")
    cells = detect_grid(img, key_color=(0, 255, 0), content_height=100)
    assert len(cells) == 1
    cell = cells[0]
    assert cell.x >= 0, f"X should not be negative, got {cell.x}"
    assert cell.y >= 0, f"Y should not be negative, got {cell.y}"
    assert cell.x + cell.w <= 100, f"Right edge exceeds image, got {cell.x + cell.w}"
    assert cell.y + cell.h <= 100, f"Bottom edge exceeds image, got {cell.y + cell.h}"
    # Should still have margin on the right/bottom sides
    assert cell.w > 50, f"Width should include margin on right side, got {cell.w}"
    assert cell.h > 50, f"Height should include margin on bottom side, got {cell.h}"
```

- [ ] **Step 4: Add test for no overlap after margin**

```python
def test_cell_margin_no_overlap():
    """Neighbor-aware margin clamping should prevent cell overlap."""
    # 2x1 grid: two 80px cells with only 10px gap between them
    arr = np.zeros((100, 200, 4), dtype=np.uint8)
    arr[:, :] = [0, 255, 0, 255]
    arr[10:90, 10:90] = [128, 128, 128, 255]    # Left cell: 80x80
    arr[10:90, 100:180] = [128, 128, 128, 255]   # Right cell: 80x80, 10px gap
    img = Image.fromarray(arr, "RGBA")
    cells = detect_grid(img, key_color=(0, 255, 0), content_height=100)
    assert len(cells) == 2, f"Expected 2 cells, got {len(cells)}"
    a, b = cells[0], cells[1]
    # Ensure no overlap
    if a.x > b.x:
        a, b = b, a
    assert a.x + a.w <= b.x, f"Cells overlap: a ends at {a.x + a.w}, b starts at {b.x}"
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_grid.py::test_single_icon_bbox_includes_full_extent tests/test_grid.py::test_cell_margin_clamps_at_image_edge tests/test_grid.py::test_cell_margin_no_overlap -v`

Expected: `test_single_icon_bbox_includes_full_extent` may pass or fail depending on exact assertions. `test_cell_margin_clamps_at_image_edge` should fail (margin not yet applied — `cell.w` will be exactly 50, not >50). `test_cell_margin_no_overlap` may fail if the grid is detected as single cell (no gap detection) or pass without margin.

- [ ] **Step 6: Commit tests + CSS fix**

```bash
git add src/chromacut/static/style.css tests/test_grid.py
git commit -m "test(grid): add margin tests and fix preview label alignment"
```

---

### Task 2: Implement Neighbor-Aware Margin

**Files:**
- Modify: `src/chromacut/grid.py`

Add the margin helper functions and apply them in `detect_grid()`.

- [ ] **Step 1: Add helper functions**

In `src/chromacut/grid.py`, add these functions before `detect_grid()` (after the `Cell` dataclass, around line 16):

```python
def _overlaps_y(a: Cell, b: Cell) -> bool:
    """Check if two cells share any vertical range (horizontally adjacent)."""
    return a.y < b.y + b.h and b.y < a.y + a.h


def _overlaps_x(a: Cell, b: Cell) -> bool:
    """Check if two cells share any horizontal range (vertically adjacent)."""
    return a.x < b.x + b.w and b.x < a.x + a.w


def _add_cell_margins(cells: list[Cell], img_w: int, img_h: int) -> None:
    """Expand cell bounds with neighbor-aware margin clamping.

    Adds 3% of cell dimension per side (min 4px, max 20px), but caps
    expansion at half the gap to the nearest neighbor to prevent overlap.
    Mutates cells in place.
    """
    for c in cells:
        mx = max(4, min(20, round(c.w * 0.03)))
        my = max(4, min(20, round(c.h * 0.03)))

        for other in cells:
            if other is c:
                continue
            # Cap horizontal margin at half the gap to neighbor
            if _overlaps_y(c, other):
                if other.x > c.x + c.w:  # other is to the right
                    mx = min(mx, (other.x - (c.x + c.w)) // 2)
                elif c.x > other.x + other.w:  # other is to the left
                    mx = min(mx, (c.x - (other.x + other.w)) // 2)
            # Cap vertical margin at half the gap to neighbor
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

- [ ] **Step 2: Apply margin in single-cell path**

In `detect_grid()`, find the single-cell return path (lines 107-110):

```python
        if len(content_rows_idx) > 0 and len(content_cols_idx) > 0:
            return [Cell(0, int(content_cols_idx[0]), int(content_rows_idx[0]),
                        int(content_cols_idx[-1] - content_cols_idx[0] + 1),
                        int(content_rows_idx[-1] - content_rows_idx[0] + 1))]
```

Replace with:

```python
        if len(content_rows_idx) > 0 and len(content_cols_idx) > 0:
            single = [Cell(0, int(content_cols_idx[0]), int(content_rows_idx[0]),
                          int(content_cols_idx[-1] - content_cols_idx[0] + 1),
                          int(content_rows_idx[-1] - content_rows_idx[0] + 1))]
            _add_cell_margins(single, w, h)
            return single
```

- [ ] **Step 3: Apply margin in multi-cell path**

In `detect_grid()`, find the multi-cell return (line 146):

```python
    return cells
```

Add the margin call before the return:

```python
    _add_cell_margins(cells, w, h)
    return cells
```

- [ ] **Step 4: Run all tests**

Run: `.venv/bin/python -m pytest tests/test_grid.py -v`

Expected: All tests pass, including:
- `test_single_icon_bbox_includes_full_extent` (updated assertions)
- `test_cell_margin_clamps_at_image_edge` (new)
- `test_cell_margin_no_overlap` (new)
- `test_gemini_grid_cells_dont_overlap` (existing — should still pass with neighbor-aware clamping)
- All 6 parametrized `test_real_image_detection` fixtures (cell counts unchanged)

- [ ] **Step 5: Run full test suite**

Run: `.venv/bin/python -m pytest -v`

Expected: All 57+ tests pass (54 existing + 2 new + possibly 1 updated).

- [ ] **Step 6: Commit**

```bash
git add src/chromacut/grid.py
git commit -m "feat(grid): add neighbor-aware margin to detected cell bounds"
```
