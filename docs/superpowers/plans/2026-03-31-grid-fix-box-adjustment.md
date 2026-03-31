# Grid Split Fix + Box Adjustment Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix grid detection for closely-spaced icons and add interactive cell editing (select, move, resize, nudge) to the web UI.

**Architecture:** Two independent features. Grid split is a backend-only post-processing step added to `detect_grid()`. Box adjustment is a frontend interaction layer on the existing overlay canvas, with one new backend endpoint (`/api/preview`) for refreshing despilled previews after edits.

**Tech Stack:** Python 3.10+ (NumPy, Pillow, FastAPI), vanilla JS (Canvas API, Pointer Events)

**Spec:** `docs/superpowers/specs/2026-03-31-grid-fix-box-adjustment-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/chromacut/grid.py` | Modify | Add `_try_split_wide_bands()` post-split function |
| `src/chromacut/app.py` | Modify | Add `/api/preview` endpoint |
| `src/chromacut/static/app.js` | Modify | editedCells state, overlay interaction, drag, keyboard nudge, preview refresh, reset |
| `src/chromacut/static/index.html` | Modify | Reset boxes button |
| `tests/test_grid.py` | Modify | 5 new grid split tests |
| `tests/test_api.py` | Modify | 2 new preview endpoint tests |
| `src/chromacut/static/style.css` | Modify | Reset button class |

---

### Task 1: Grid split — `_try_split_wide_bands()`

**Files:**
- Modify: `src/chromacut/grid.py`
- Modify: `tests/test_grid.py`

- [ ] **Step 1: Write the narrow-gap grid test**

Add to `tests/test_grid.py`:

```python
def _make_narrow_gap_grid(cols, cell_w=100, cell_h=100, inner_gap=10, outer_gap=50, label_h=60):
    """Create a grid with narrow inner gaps and wide outer gaps.

    The narrow inner gaps are too small for _find_content_bands to detect,
    so the post-split pass must split the merged bands.
    """
    w = outer_gap + cols * cell_w + (cols - 1) * inner_gap + outer_gap
    h = cell_h + label_h
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    arr[:, :] = [0, 255, 0, 255]  # green background

    for c in range(cols):
        x0 = outer_gap + c * (cell_w + inner_gap) + 10
        arr[10:cell_h - 10, x0:x0 + cell_w - 20] = [128, 128, 128, 255]

    # Black label strip at bottom
    arr[-label_h:, :] = [0, 0, 0, 255]
    return Image.fromarray(arr, "RGBA")


def test_narrow_gap_grid_splits_merged_bands():
    """4x1 grid with 10px inner gaps should detect 4 cells after post-split."""
    img = _make_narrow_gap_grid(4, cell_w=100, inner_gap=10, outer_gap=50)
    result = analyze_image(img)
    assert result["mode"] == "grid"
    assert len(result["cells"]) == 4, f"Expected 4 cells, got {len(result['cells'])}"
```

- [ ] **Step 2: Write single-band full merge test**

Add to `tests/test_grid.py`:

```python
def test_single_band_full_merge_splits():
    """3x1 grid with 8px gaps and no wide outer gaps — all merge into one band.
    Single-band fallback should split into 3 cells."""
    # No outer padding — the entire width is one content band
    w = 3 * 100 + 2 * 8  # 316px total
    h = 100 + 60  # content + label
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    arr[:, :] = [0, 255, 0, 255]

    for c in range(3):
        x0 = c * (100 + 8) + 10
        arr[10:90, x0:x0 + 80] = [128, 128, 128, 255]

    arr[-60:, :] = [0, 0, 0, 255]
    img = Image.fromarray(arr, "RGBA")
    result = analyze_image(img)
    assert len(result["cells"]) == 3, f"Expected 3 cells, got {len(result['cells'])}"
```

- [ ] **Step 3: Write three-way recursive split test**

Add to `tests/test_grid.py`:

```python
def test_three_way_merge_recursive_split():
    """3x1 grid inside one band requiring two recursive splits."""
    # Same as single-band but with slightly wider gaps for cleaner valleys
    w = 3 * 120 + 2 * 12  # 384px total
    h = 120 + 60
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    arr[:, :] = [0, 255, 0, 255]

    for c in range(3):
        x0 = c * (120 + 12) + 15
        arr[15:105, x0:x0 + 90] = [128, 128, 128, 255]

    arr[-60:, :] = [0, 0, 0, 255]
    img = Image.fromarray(arr, "RGBA")
    result = analyze_image(img)
    assert len(result["cells"]) == 3, f"Expected 3 cells, got {len(result['cells'])}"
```

- [ ] **Step 4: Write no-false-split test**

Add to `tests/test_grid.py`:

```python
def test_wide_single_icon_not_falsely_split():
    """A single 200px-wide icon with no key-color valley should not be split."""
    w = 300
    h = 200 + 60
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    arr[:, :] = [0, 255, 0, 255]
    # One wide block of content — no internal green gap
    arr[20:180, 50:250] = [128, 128, 128, 255]
    arr[-60:, :] = [0, 0, 0, 255]
    img = Image.fromarray(arr, "RGBA")
    result = analyze_image(img)
    assert len(result["cells"]) == 1, f"Expected 1 cell, got {len(result['cells'])}"
```

- [ ] **Step 5: Write row-only narrow gap test**

Add to `tests/test_grid.py`:

```python
def test_row_narrow_gap_splits():
    """2x2 grid with narrow row gaps (10px) but normal column gaps (50px).
    Row split should handle the merge."""
    cell_w, cell_h = 100, 100
    col_gap, row_gap = 50, 10
    w = 2 * cell_w + col_gap
    h = 2 * cell_h + row_gap + 60  # + label
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    arr[:, :] = [0, 255, 0, 255]

    for r in range(2):
        for c in range(2):
            x0 = c * (cell_w + col_gap) + 10
            y0 = r * (cell_h + row_gap) + 10
            arr[y0:y0 + 80, x0:x0 + 80] = [128, 128, 128, 255]

    arr[-60:, :] = [0, 0, 0, 255]
    img = Image.fromarray(arr, "RGBA")
    result = analyze_image(img)
    assert len(result["cells"]) == 4, f"Expected 4 cells, got {len(result['cells'])}"
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd /Users/Lucas.reed/dev/chromacut && .venv/bin/python -m pytest tests/test_grid.py::test_narrow_gap_grid_splits_merged_bands tests/test_grid.py::test_single_band_full_merge_splits tests/test_grid.py::test_three_way_merge_recursive_split tests/test_grid.py::test_wide_single_icon_not_falsely_split tests/test_grid.py::test_row_narrow_gap_splits -v`

Expected: Some or all fail (narrow gaps merge into fewer cells than expected).

- [ ] **Step 7: Implement `_try_split_wide_bands()`**

Add to `src/chromacut/grid.py`, before the `analyze_image` function:

```python
def _try_split_wide_bands(
    bands: list[tuple[int, int]],
    key_pct: np.ndarray,
    total_dim: int | None = None,
    _depth: int = 0,
) -> list[tuple[int, int]]:
    """Split wide content bands that likely contain merged icons.

    Looks for key-color valleys within oversized bands and splits there.
    """
    if _depth >= 3 or len(bands) == 0:
        return bands

    # Determine which bands to try splitting
    widths = [e - s for s, e in bands]
    targets = []

    if len(bands) == 1:
        # Single-band: split if wider than 40% of total dimension
        dim = total_dim or len(key_pct)
        if widths[0] > dim * 0.4:
            targets = [0]
    else:
        # Multi-band: split bands wider than 1.8x the median
        median_w = sorted(widths)[len(widths) // 2]
        targets = [i for i, w in enumerate(widths) if w > median_w * 1.8]

    if not targets:
        return bands

    result = []
    for i, (s, e) in enumerate(bands):
        if i not in targets:
            result.append((s, e))
            continue

        band_w = e - s
        # Exclude 10% margins on each side to avoid edge noise
        margin = max(1, int(band_w * 0.1))
        interior = key_pct[s + margin : e - margin]

        if len(interior) == 0:
            result.append((s, e))
            continue

        # Find the column with highest key-color density
        best_offset = int(np.argmax(interior))
        best_col = s + margin + best_offset
        best_density = float(interior[best_offset])

        # Only split if valley is strong enough (>80% key-color)
        if best_density < 0.8:
            result.append((s, e))
            continue

        # Check boundary guard: split point must not be within 10% of band edge
        if best_col - s < margin or e - best_col < margin:
            result.append((s, e))
            continue

        # Check minimum child-band width (20px)
        left = (s, best_col)
        right = (best_col + 1, e)
        if left[1] - left[0] < 20 or right[1] - right[0] < 20:
            result.append((s, e))
            continue

        # Split and recurse on children
        result.extend(_try_split_wide_bands([left], key_pct, total_dim, _depth + 1))
        result.extend(_try_split_wide_bands([right], key_pct, total_dim, _depth + 1))

    result.sort(key=lambda x: x[0])
    return result
```

- [ ] **Step 8: Integrate into `detect_grid()`**

In `src/chromacut/grid.py`, in `detect_grid()`, after the two `_find_content_bands` calls (currently lines 92-93), add the post-split calls:

Replace:

```python
    col_groups = _find_content_bands(col_key_pct < 0.9, min_col_gap)
    row_groups = _find_content_bands(row_key_pct < 0.9, min_row_gap)
```

with:

```python
    col_groups = _find_content_bands(col_key_pct < 0.9, min_col_gap)
    col_groups = _try_split_wide_bands(col_groups, col_key_pct, w)
    row_groups = _find_content_bands(row_key_pct < 0.9, min_row_gap)
    row_groups = _try_split_wide_bands(row_groups, row_key_pct, h)
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd /Users/Lucas.reed/dev/chromacut && .venv/bin/python -m pytest tests/test_grid.py -v`
Expected: All tests pass including the 5 new ones.

- [ ] **Step 10: Run full test suite**

Run: `cd /Users/Lucas.reed/dev/chromacut && .venv/bin/python -m pytest -v`
Expected: All 40 existing + 5 new = 45 tests pass. (Grid tests may skip Gemini fixtures if not present — that's fine.)

- [ ] **Step 11: Commit**

```bash
cd /Users/Lucas.reed/dev/chromacut
git add src/chromacut/grid.py tests/test_grid.py
git commit -m "fix(grid): split merged bands with narrow gaps via post-split valley detection"
```

---

### Task 2: `/api/preview` endpoint

**Files:**
- Modify: `src/chromacut/app.py`
- Modify: `tests/test_api.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_api.py`:

```python
def test_preview_returns_base64_png():
    """POST /api/preview should return a base64-encoded RGBA PNG for given bounds."""
    buf = _make_test_image()
    settings = json.dumps({"x": 20, "y": 20, "w": 60, "h": 60})
    resp = client.post(
        "/api/preview",
        files={"file": ("test.png", buf, "image/png")},
        data={"settings": settings},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "preview" in data
    assert data["preview"].startswith("data:image/png;base64,")
    raw = base64.b64decode(data["preview"].split(",", 1)[1])
    preview_img = Image.open(io.BytesIO(raw))
    assert preview_img.mode == "RGBA"
    assert preview_img.width > 0 and preview_img.height > 0


def test_preview_rejects_invalid_bounds():
    """POST /api/preview should return 400 for invalid bounds."""
    buf = _make_test_image()
    settings = json.dumps({"x": "bad", "y": 0, "w": 50, "h": 50})
    resp = client.post(
        "/api/preview",
        files={"file": ("test.png", buf, "image/png")},
        data={"settings": settings},
    )
    assert resp.status_code == 400
```

Note: `base64` and `from PIL import Image` imports should already be present in `test_api.py` from the v0.1 polish plan. If they're missing, add `import base64` and `from PIL import Image` to the imports at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/Lucas.reed/dev/chromacut && .venv/bin/python -m pytest tests/test_api.py::test_preview_returns_base64_png tests/test_api.py::test_preview_rejects_invalid_bounds -v`
Expected: FAIL — endpoint doesn't exist.

- [ ] **Step 3: Implement the endpoint**

Add to `src/chromacut/app.py`, after the `/api/extract` endpoint:

```python
@app.post("/api/preview")
async def preview(file: UploadFile = File(...), settings: str = Form(...)):
    try:
        config = json.loads(settings)
    except (json.JSONDecodeError, TypeError):
        return JSONResponse({"error": "Invalid settings JSON"}, status_code=400)

    # Validate bounds
    try:
        cx = int(config["x"])
        cy = int(config["y"])
        cw = int(config["w"])
        ch = int(config["h"])
    except (KeyError, TypeError, ValueError):
        return JSONResponse({"error": "Missing or non-numeric bounds (x, y, w, h required)"}, status_code=400)

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        return JSONResponse({"error": "File too large (max 50 MB)"}, status_code=413)
    try:
        img = Image.open(io.BytesIO(contents)).convert("RGBA")
        img.load()
    except Exception:
        return JSONResponse({"error": "Invalid image file"}, status_code=400)

    # Clamp to image dimensions
    cx = max(0, min(cx, img.width - 1))
    cy = max(0, min(cy, img.height - 1))
    cw = min(cw, img.width - cx)
    ch = min(ch, img.height - cy)

    if cw < 20 or ch < 20:
        return JSONResponse({"error": "Crop area too small (min 20x20)"}, status_code=400)

    cell = {"x": cx, "y": cy, "w": cw, "h": ch}
    result = despill_crop(img, cell)
    buf = io.BytesIO()
    result.save(buf, "PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return JSONResponse({"preview": f"data:image/png;base64,{b64}"})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/Lucas.reed/dev/chromacut && .venv/bin/python -m pytest tests/test_api.py -v`
Expected: All API tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/Lucas.reed/dev/chromacut
git add src/chromacut/app.py tests/test_api.py
git commit -m "feat(api): add /api/preview endpoint for single-cell despill preview"
```

---

### Task 3: editedCells state + switch all consumers

**Files:**
- Modify: `src/chromacut/static/app.js`

This task introduces the `editedCells` state and switches all functions that read from `analysisData.cells` to read from `editedCells` instead. No interaction changes yet — just the data plumbing.

- [ ] **Step 1: Add editedCells state variable**

In `app.js`, after `let previewImages = [];` (line 15), add:

```javascript
    let editedCells = [];     // deep copy of analysisData.cells, mutable for user edits
    let activeDrag = null;    // { mode, handle, startPointer, startRect, cellIndex }
```

- [ ] **Step 2: Initialize editedCells on analyze**

In `analyzeImage()`, after the preview loading block (after line 239), add:

```javascript
            // Deep copy cells for editing (analysisData.cells stays immutable)
            editedCells = analysisData.cells.map(c => ({...c}));
```

- [ ] **Step 3: Clear editedCells on reset**

In `resetWorkspace()`, after `previewImages = [];` (line 188), add:

```javascript
        editedCells = [];
        activeDrag = null;
```

- [ ] **Step 4: Switch `drawOverlay()` to use editedCells**

In `drawOverlay()`, replace `analysisData.cells.forEach((cell, i) => {` with `editedCells.forEach((cell, i) => {`. Also update the guard at the top:

Replace:

```javascript
    function drawOverlay() {
        if (!analysisData || !sourceImage) return;
```

with:

```javascript
    function drawOverlay() {
        if (!editedCells.length || !sourceImage) return;
```

- [ ] **Step 5: Switch `updatePreview()` to use editedCells**

In `updatePreview()`, replace:

```javascript
        const cell = analysisData.cells[selectedCell] || analysisData.cells[0];
```

with:

```javascript
        const cell = editedCells[selectedCell] || editedCells[0];
```

- [ ] **Step 6: Switch `buildCellThumbnails()` to use editedCells**

Replace `analysisData.cells.forEach((cell, i) => {` with `editedCells.forEach((cell, i) => {`. Also update the guard:

Replace:

```javascript
        if (!analysisData || !sourceImage) return;
```

with:

```javascript
        if (!editedCells.length || !sourceImage) return;
```

- [ ] **Step 7: Switch `buildNameFields()` to use editedCells**

Replace `analysisData.cells.forEach((cell, i) => {` with `editedCells.forEach((cell, i) => {`. Update guard:

Replace:

```javascript
        if (!analysisData) return;
```

with:

```javascript
        if (!editedCells.length) return;
```

- [ ] **Step 8: Switch `getSettings()` to use editedCells**

Replace:

```javascript
            const cellData = analysisData?.cells[idx];
```

with:

```javascript
            const cellData = editedCells[idx];
```

- [ ] **Step 9: Switch `updateDetectionUI()` cells reference**

Replace:

```javascript
        if (analysisData.cells.length > 1) {
```

with:

```javascript
        if (editedCells.length > 1) {
```

- [ ] **Step 10: Run full test suite**

Run: `cd /Users/Lucas.reed/dev/chromacut && .venv/bin/python -m pytest -v`
Expected: All tests pass (Python tests unaffected by frontend changes).

- [ ] **Step 11: Commit**

```bash
cd /Users/Lucas.reed/dev/chromacut
git add src/chromacut/static/app.js
git commit -m "refactor(ui): introduce editedCells state, switch all consumers from analysisData.cells"
```

---

### Task 4: Overlay interaction — click-to-select, hover, handle rendering

**Files:**
- Modify: `src/chromacut/static/app.js`

- [ ] **Step 1: Add coordinate conversion helper**

Add after the `drawOverlay` function:

```javascript
    // ---- Coordinate conversion ----
    function canvasToImage(canvasX, canvasY) {
        return {
            x: canvasX * sourceImage.width / overlayCanvas.width,
            y: canvasY * sourceImage.height / overlayCanvas.height,
        };
    }

    function imageToCanvas(imgX, imgY) {
        return {
            x: imgX * overlayCanvas.width / sourceImage.width,
            y: imgY * overlayCanvas.height / sourceImage.height,
        };
    }
```

- [ ] **Step 2: Add hit-test function**

Add after the coordinate helpers:

```javascript
    // ---- Hit testing ----
    const HANDLE_HIT_PX = 12; // hit zone in canvas pixels
    const HANDLE_NAMES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

    function getHandlePositions(cell) {
        // Returns 8 handle positions in image space
        const { x, y, w, h } = cell;
        return {
            nw: { x: x, y: y },
            n:  { x: x + w / 2, y: y },
            ne: { x: x + w, y: y },
            e:  { x: x + w, y: y + h / 2 },
            se: { x: x + w, y: y + h },
            s:  { x: x + w / 2, y: y + h },
            sw: { x: x, y: y + h },
            w:  { x: x, y: y + h / 2 },
        };
    }

    function hitTest(canvasX, canvasY) {
        const img = canvasToImage(canvasX, canvasY);
        // Convert hit zone from canvas pixels to image pixels
        const hitZone = HANDLE_HIT_PX * sourceImage.width / overlayCanvas.width;

        // Check handles of selected cell first
        if (selectedCell >= 0 && selectedCell < editedCells.length) {
            const handles = getHandlePositions(editedCells[selectedCell]);
            for (const name of HANDLE_NAMES) {
                const hp = handles[name];
                if (Math.abs(img.x - hp.x) < hitZone && Math.abs(img.y - hp.y) < hitZone) {
                    return { type: 'handle', cellIndex: selectedCell, handle: name };
                }
            }
        }

        // Check cell interiors (reverse order so topmost wins)
        for (let i = editedCells.length - 1; i >= 0; i--) {
            const c = editedCells[i];
            if (img.x >= c.x && img.x <= c.x + c.w && img.y >= c.y && img.y <= c.y + c.h) {
                return { type: 'cell', cellIndex: i, handle: null };
            }
        }

        return { type: 'none', cellIndex: -1, handle: null };
    }

    const CURSOR_MAP = {
        nw: 'nwse-resize', se: 'nwse-resize',
        ne: 'nesw-resize', sw: 'nesw-resize',
        n: 'ns-resize', s: 'ns-resize',
        e: 'ew-resize', w: 'ew-resize',
    };
```

- [ ] **Step 3: Add pointer event handlers for click-to-select and hover**

Add after the hit-test code:

```javascript
    // ---- Overlay pointer events ----
    overlayCanvas.addEventListener('pointerdown', (e) => {
        if (!sourceImage || !editedCells.length) return;
        const rect = overlayCanvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const hit = hitTest(cx, cy);

        if (hit.type === 'none') {
            // Deselect
            if (selectedCell >= 0) {
                selectedCell = -1;
                drawOverlay();
            }
            return;
        }

        // Select the hit cell
        selectedCell = hit.cellIndex;
        drawOverlay();
        updatePreview();

        // Update thumbnail active state
        $$('.cell-thumb').forEach((t, i) => {
            t.classList.toggle('active', i === selectedCell);
        });

        if (hit.type === 'handle') {
            // Start resize drag
            const cell = editedCells[selectedCell];
            activeDrag = {
                mode: 'resize',
                handle: hit.handle,
                startPointer: canvasToImage(cx, cy),
                startRect: { x: cell.x, y: cell.y, w: cell.w, h: cell.h },
                cellIndex: selectedCell,
            };
            overlayCanvas.setPointerCapture(e.pointerId);
        } else if (hit.type === 'cell' && hit.cellIndex === selectedCell) {
            // Start move drag (only if already selected or just selected)
            const cell = editedCells[selectedCell];
            activeDrag = {
                mode: 'move',
                handle: null,
                startPointer: canvasToImage(cx, cy),
                startRect: { x: cell.x, y: cell.y, w: cell.w, h: cell.h },
                cellIndex: selectedCell,
            };
            overlayCanvas.setPointerCapture(e.pointerId);
        }
    });

    overlayCanvas.addEventListener('pointermove', (e) => {
        if (!sourceImage || !editedCells.length) return;
        const rect = overlayCanvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        if (activeDrag) {
            handleDragMove(cx, cy);
            return;
        }

        // Hover cursor
        const hit = hitTest(cx, cy);
        if (hit.type === 'handle') {
            overlayCanvas.style.cursor = CURSOR_MAP[hit.handle] || 'crosshair';
        } else if (hit.type === 'cell') {
            overlayCanvas.style.cursor = 'move';
        } else {
            overlayCanvas.style.cursor = 'crosshair';
        }

        // Update hover state
        const newHovered = hit.type !== 'none' ? hit.cellIndex : -1;
        if (newHovered !== _hoveredCell) {
            _hoveredCell = newHovered;
            drawOverlay();
        }
    });

    overlayCanvas.addEventListener('pointerup', (e) => {
        if (activeDrag) {
            commitDrag();
        }
    });

    overlayCanvas.addEventListener('pointercancel', () => {
        if (activeDrag) commitDrag();
    });

    overlayCanvas.addEventListener('lostpointercapture', () => {
        if (activeDrag) commitDrag();
    });
```

- [ ] **Step 4: Update `drawOverlay()` to render handles on selected cell**

In `drawOverlay()`, after the existing `forEach` loop that draws cell rectangles and labels, add handle rendering at the end of the function (before the closing `}`):

```javascript
        // Draw handles on selected cell
        if (selectedCell >= 0 && selectedCell < editedCells.length) {
            const handles = getHandlePositions(editedCells[selectedCell]);
            const handleSize = 6;
            ctx.fillStyle = '#FF2D9B';
            ctx.strokeStyle = '#0e0e15';
            ctx.lineWidth = 1;
            ctx.setLineDash([]);

            for (const name of HANDLE_NAMES) {
                const hp = handles[name];
                const cp = imageToCanvas(hp.x, hp.y);
                ctx.fillRect(cp.x - handleSize / 2, cp.y - handleSize / 2, handleSize, handleSize);
                ctx.strokeRect(cp.x - handleSize / 2, cp.y - handleSize / 2, handleSize, handleSize);
            }
        }
```

- [ ] **Step 5: Run full test suite**

Run: `cd /Users/Lucas.reed/dev/chromacut && .venv/bin/python -m pytest -v`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/Lucas.reed/dev/chromacut
git add src/chromacut/static/app.js
git commit -m "feat(ui): click-to-select cells, hover cursor, handle rendering on overlay"
```

---

### Task 5: Move and resize drag

**Files:**
- Modify: `src/chromacut/static/app.js`

- [ ] **Step 1: Add clamping helper**

Add after the CURSOR_MAP definition:

```javascript
    const MIN_CELL_DIM = 20;

    function clampMove(cell) {
        // For move: preserve dimensions, only clamp position
        cell.x = Math.max(0, Math.min(cell.x, sourceImage.width - cell.w));
        cell.y = Math.max(0, Math.min(cell.y, sourceImage.height - cell.h));
    }

    function clampResize(cell) {
        // For resize: clamp position and enforce minimum dimensions
        cell.x = Math.max(0, Math.min(cell.x, sourceImage.width - MIN_CELL_DIM));
        cell.y = Math.max(0, Math.min(cell.y, sourceImage.height - MIN_CELL_DIM));
        cell.w = Math.max(MIN_CELL_DIM, Math.min(cell.w, sourceImage.width - cell.x));
        cell.h = Math.max(MIN_CELL_DIM, Math.min(cell.h, sourceImage.height - cell.y));
    }
```

- [ ] **Step 2: Implement `handleDragMove()`**

Add after the clamp helper:

```javascript
    function handleDragMove(canvasX, canvasY) {
        if (!activeDrag) return;
        const img = canvasToImage(canvasX, canvasY);
        const { mode, handle, startPointer, startRect, cellIndex } = activeDrag;
        const cell = editedCells[cellIndex];
        const dx = img.x - startPointer.x;
        const dy = img.y - startPointer.y;

        if (mode === 'move') {
            cell.x = Math.round(startRect.x + dx);
            cell.y = Math.round(startRect.y + dy);
            cell.w = startRect.w;
            cell.h = startRect.h;
            clampMove(cell);
        } else if (mode === 'resize') {
            let newX = startRect.x;
            let newY = startRect.y;
            let newW = startRect.w;
            let newH = startRect.h;

            // Adjust edges based on handle
            if (handle.includes('w')) {
                newX = Math.round(startRect.x + dx);
                newW = Math.round(startRect.w - dx);
            }
            if (handle.includes('e')) {
                newW = Math.round(startRect.w + dx);
            }
            if (handle.includes('n')) {
                newY = Math.round(startRect.y + dy);
                newH = Math.round(startRect.h - dy);
            }
            if (handle.includes('s')) {
                newH = Math.round(startRect.h + dy);
            }

            // Enforce minimum size (prevent edge crossing)
            if (newW < MIN_CELL_DIM) {
                if (handle.includes('w')) newX = startRect.x + startRect.w - MIN_CELL_DIM;
                newW = MIN_CELL_DIM;
            }
            if (newH < MIN_CELL_DIM) {
                if (handle.includes('n')) newY = startRect.y + startRect.h - MIN_CELL_DIM;
                newH = MIN_CELL_DIM;
            }

            cell.x = newX;
            cell.y = newY;
            cell.w = newW;
            cell.h = newH;
            clampResize(cell);
        }

        // Invalidate backend preview for this cell (use fallback during drag)
        previewImages[cellIndex] = null;
        drawOverlay();
        updatePreview();
    }
```

- [ ] **Step 3: Implement `commitDrag()`**

Add after `handleDragMove`:

```javascript
    let _previewAbortController = null;

    function commitDrag() {
        const cellIndex = activeDrag?.cellIndex;
        activeDrag = null;

        if (cellIndex != null && cellIndex >= 0) {
            refreshCellPreview(cellIndex);
            rebuildCellThumbnail(cellIndex);
        }
    }

    async function refreshCellPreview(cellIndex) {
        if (!sourceFile || cellIndex < 0 || cellIndex >= editedCells.length) return;

        // Abort previous in-flight request
        if (_previewAbortController) _previewAbortController.abort();
        _previewAbortController = new AbortController();

        const cell = editedCells[cellIndex];
        const form = new FormData();
        form.append('file', sourceFile);
        form.append('settings', JSON.stringify({ x: cell.x, y: cell.y, w: cell.w, h: cell.h }));

        try {
            const resp = await fetch('/api/preview', {
                method: 'POST',
                body: form,
                signal: _previewAbortController.signal,
            });
            if (!resp.ok) return;
            const data = await resp.json();

            // Discard if user switched cells during flight
            if (selectedCell !== cellIndex) return;

            const img = new Image();
            img.onload = () => {
                previewImages[cellIndex] = img;
                updatePreview();
            };
            img.src = data.preview;
        } catch (err) {
            if (err.name !== 'AbortError') console.warn('Preview refresh failed:', err);
        }
    }

    function rebuildCellThumbnail(cellIndex) {
        const thumbs = cellThumbnails.querySelectorAll('.cell-thumb');
        if (cellIndex >= thumbs.length) return;
        const thumb = thumbs[cellIndex];
        const cell = editedCells[cellIndex];
        const canvas = thumb.querySelector('canvas');
        if (!canvas || !sourceImage) return;

        const size = 68;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.min(size / cell.w, size / cell.h);
        const sw = cell.w * scale;
        const sh = cell.h * scale;
        ctx.drawImage(sourceImage, cell.x, cell.y, cell.w, cell.h,
                     (size - sw) / 2, (size - sh) / 2, sw, sh);
        quickGreenRemove(ctx, size, size);
    }
```

- [ ] **Step 4: Run full test suite**

Run: `cd /Users/Lucas.reed/dev/chromacut && .venv/bin/python -m pytest -v`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/Lucas.reed/dev/chromacut
git add src/chromacut/static/app.js
git commit -m "feat(ui): move and resize drag with clamping, preview refresh on commit"
```

---

### Task 6: Keyboard nudge

**Files:**
- Modify: `src/chromacut/static/app.js`

- [ ] **Step 1: Add nudge handler to existing keydown listener**

In the existing `window.addEventListener('keydown', ...)` handler (currently lines 107-114), add arrow key handling. Replace the entire keydown handler:

```javascript
    let _nudgeDebounce = null;

    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // Before/after toggle (Space)
        if (e.code === 'Space' && !e.repeat && sourceImage && analysisData && _lastSourceCrop) {
            e.preventDefault();
            _showingOriginal = true;
            beforeAfterBadge.classList.remove('hidden');
            showOriginalInPreview();
            return;
        }

        // Arrow key nudge
        if (selectedCell >= 0 && selectedCell < editedCells.length && !activeDrag) {
            const step = e.shiftKey ? 10 : 1;
            const cell = editedCells[selectedCell];
            let nudged = false;

            if (e.code === 'ArrowLeft')  { cell.x -= step; nudged = true; }
            if (e.code === 'ArrowRight') { cell.x += step; nudged = true; }
            if (e.code === 'ArrowUp')    { cell.y -= step; nudged = true; }
            if (e.code === 'ArrowDown')  { cell.y += step; nudged = true; }

            if (nudged) {
                e.preventDefault();
                clampMove(cell);
                previewImages[selectedCell] = null;
                drawOverlay();
                updatePreview();

                // Debounce backend preview refresh — capture index to avoid stale closure
                const nudgedIndex = selectedCell;
                clearTimeout(_nudgeDebounce);
                _nudgeDebounce = setTimeout(() => {
                    refreshCellPreview(nudgedIndex);
                    rebuildCellThumbnail(nudgedIndex);
                }, 300);
            }
        }
    });
```

- [ ] **Step 2: Run full test suite**

Run: `cd /Users/Lucas.reed/dev/chromacut && .venv/bin/python -m pytest -v`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/Lucas.reed/dev/chromacut
git add src/chromacut/static/app.js
git commit -m "feat(ui): arrow key nudge with shift modifier and debounced preview refresh"
```

---

### Task 7: Reset button + HTML

**Files:**
- Modify: `src/chromacut/static/index.html`
- Modify: `src/chromacut/static/app.js`

- [ ] **Step 1: Add Reset boxes button to HTML**

In `src/chromacut/static/index.html`, after the Detection section closing `</div>` (after line 126, the one that closes the Detection settings-section), add:

```html
                    <div class="settings-section">
                        <button id="btn-reset-boxes" class="btn-reset">Reset boxes</button>
                    </div>
```

Also add to `src/chromacut/static/style.css`, after the `.export-status` rule:

```css
.btn-reset {
    width: 100%;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-dim);
    background: none;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 5px 10px;
    cursor: pointer;
    transition: all 0.15s;
}

.btn-reset:hover {
    color: var(--text);
    border-color: var(--text-muted);
}
```

- [ ] **Step 2: Add reset handler in app.js**

In `app.js`, add the DOM ref after the other refs (after `const loadingOverlay = ...`):

```javascript
    const btnResetBoxes = $('#btn-reset-boxes');
```

Then add the event listener after the `btnNew` listener:

```javascript
    // ---- Reset boxes ----
    if (btnResetBoxes) {
        btnResetBoxes.addEventListener('click', () => {
            if (!analysisData) return;

            // Deep copy baseline cells
            editedCells = analysisData.cells.map(c => ({...c}));
            selectedCell = 0;

            // Re-decode previews from analysis baseline
            previewImages = [];
            if (analysisData.previews) {
                for (const dataUrl of analysisData.previews) {
                    const img = new Image();
                    img.src = dataUrl;
                    previewImages.push(img);
                }
            }

            drawOverlay();
            buildCellThumbnails();
            buildNameFields();
            updatePreview();
        });
    }
```

- [ ] **Step 3: Run full test suite**

Run: `cd /Users/Lucas.reed/dev/chromacut && .venv/bin/python -m pytest -v`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/Lucas.reed/dev/chromacut
git add src/chromacut/static/app.js src/chromacut/static/index.html
git commit -m "feat(ui): add reset boxes button to restore auto-detected cell bounds"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run full test suite**

Run: `cd /Users/Lucas.reed/dev/chromacut && .venv/bin/python -m pytest -v`
Expected: All tests pass (40 existing + 5 grid + 2 preview = 47 tests).

- [ ] **Step 2: Start dev server and manually verify**

Run: `cd /Users/Lucas.reed/dev/chromacut && .venv/bin/python -m chromacut --no-open`

Manual checks:
1. Open `http://localhost:6100`
2. Drop/paste a grid image
3. Verify grid detection works (correct cell count)
4. Click a cell to select — handles appear
5. Click empty area — deselects (handles disappear, preview freezes)
6. Drag cell interior — moves, clamped to image bounds
7. Drag corner handle — resizes both axes
8. Drag edge handle — resizes one axis
9. Arrow keys nudge by 1px, Shift+Arrow by 10px
10. Preview updates after drag release / nudge debounce
11. Reset boxes button restores original detection
12. Export uses edited bounds (check zip contents match edited positions)

- [ ] **Step 3: Commit any final adjustments**

If manual testing reveals issues, fix and commit individually.
