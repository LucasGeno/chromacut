# Batch 3: Polish & Prep

**Date:** 2026-04-01
**Scope:** Three features — export selected cell, snap lines during drag, hover fill highlight.

---

## 1. Export Selected Cell (Cmd+Shift+E)

### Shortcut

`Cmd+Shift+E` (Mac) / `Ctrl+Shift+E` (other). Fires only when `selectedCell >= 0` and `sourceImage` is loaded. Guarded by the global input guard (no-op when focus is in INPUT/TEXTAREA).

### Behavior

Builds a settings object containing only the selected cell, then POSTs to `/api/extract`. The backend already returns a single PNG (not ZIP) for single-cell requests.

Settings construction:
- Read the selected cell's name from the corresponding name field input (fall back to `icon-{selectedCell + 1}`)
- Read current output size, padding, and art style from the DOM (same as `getSettings()`)
- Build a single-cell settings object: `{ cells: [{ index, name, x, y, w, h }], output_size, padding, art_style }`

### UI Feedback

- Export button gets `.loading` class (pulse animation) during the request
- Status shows "Exported {name}.png" on success, "Export failed: {error}" on failure
- If no cell is selected, the shortcut is silently ignored

### Implementation

New exported function in `export.js`:

```js
export async function doExportSelected(btnExport, exportStatus, paddingSlider, nameFields)
```

Extend `doExport` with a boolean `selectedOnly` parameter (default `false`). When `true`, build settings with only the selected cell instead of calling `getSettings()`. This avoids duplicating the fetch/download logic.

### Keyboard Handler

In `interaction.js` keydown handler, add after the existing Cmd+E block:

```js
if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyE') { ... }
```

This must appear **before** the plain Cmd+E handler (so the more specific combo is matched first).

### Help Overlay

Add a row to the shortcut table in `index.html`:
```html
<tr><td><kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd></td><td>Export selected cell</td></tr>
```

### Files Changed

- `export.js` — extend `doExport` with `selectedOnly` parameter
- `interaction.js` — Cmd+Shift+E handler in keydown
- `index.html` — shortcut table row

---

## 2. Snap Lines

### Snap Targets

For each cell other than the one being dragged, compute 6 snap values in source image pixels:
- **X axis:** left edge (`x`), horizontal center (`x + w/2`), right edge (`x + w`)
- **Y axis:** top edge (`y`), vertical center (`y + h/2`), bottom edge (`y + h`)

### Snap Detection

During `handleDragMove()`, after computing the new cell position but before clamping:

**Move drag:**
1. Compute the dragged cell's 6 candidate values (left, center-x, right, top, center-y, bottom)
2. For each candidate, scan all snap targets on the same axis
3. If the closest match is within 5px (image space), override the cell's coordinate to align exactly
4. X and Y axes snap independently — a cell can snap on X without snapping on Y
5. For move: snapping left edge adjusts `cell.x`; snapping center adjusts `cell.x` to `target - cell.w/2`; snapping right adjusts `cell.x` to `target - cell.w`
6. Record active snap lines for rendering

**Resize drag:**
1. Only the edge(s) being dragged are snap candidates
2. For a resize handle that moves the east edge: snap `cell.x + cell.w` to nearby targets, adjust `cell.w`
3. For a handle that moves the west edge: snap `cell.x` to nearby targets, adjust both `cell.x` and `cell.w`
4. Same pattern for north/south on Y axis
5. Corner handles snap both axes

### Snap Threshold

5px in source image space. Not configurable. At typical image sizes (1024-2048px) this is ~0.25-0.5%, enough to feel magnetic without being frustrating.

### Transient State

```js
state.activeSnapLines: []  // array of { axis: 'x'|'y', pos: number } in image space
```

- Set during `handleDragMove()` — populated with lines that were actively snapped to
- Cleared in `commitDrag()` (pointer up) and at the start of each `handleDragMove()` call
- Reset in `resetState()`
- **Not included in undo snapshots** — purely transient visual state

### Rendering

In `drawOverlay()`, after rendering all cells and handles, draw active snap lines:

- **Style:** 1px dashed `[4, 4]`, color `#44e04466` (translucent accent green)
- **X-axis lines:** vertical line from `(pos, 0)` to `(pos, imageHeight)`, converted to canvas space
- **Y-axis lines:** horizontal line from `(0, pos)` to `(imageWidth, pos)`, converted to canvas space
- Only rendered when `state.activeSnapLines.length > 0`

Green was chosen for snap lines because:
- Magenta is used for cell borders (would blend)
- Green matches the chroma-key accent color in the design system
- Translucent to avoid obscuring content

### Edge Cases

- **Single cell:** No snap targets exist. Snap logic short-circuits (no computation).
- **Excluded cells:** Still act as snap targets. Their positions are valid alignment references even if they won't be exported.
- **Aspect ratio lock + snap:** Snap applies after ratio enforcement. If snapping one axis would break the ratio, the snap on that axis is skipped.
- **Self-snap:** The dragged cell is excluded from its own snap target list.

### Files Changed

- `state.js` — add `activeSnapLines: []`, reset in `resetState()`
- `interaction.js` — snap logic in `handleDragMove()`, clear in `commitDrag()`
- `overlay.js` — render snap lines at end of `drawOverlay()`

---

## 3. Hover Fill Highlight

### Behavior

When a cell is hovered (not selected), draw a translucent magenta fill rectangle before drawing the border. This makes the entire cell area light up on hover, not just the border edge.

### Fill Colors

| State | Fill |
|-------|------|
| Hovered (not selected, not excluded) | `#FF2D9B11` |
| Hovered + excluded | `#FF2D9B08` |
| Selected | No fill (handles + solid border are sufficient, fill would obscure content during editing) |
| Default (not hovered, not selected) | No fill |

### Implementation

In `drawOverlay()`, inside the `editedCells.forEach` loop, after computing `x, y, w, h` and determining the cell's visual state, but before `ctx.strokeRect`:

```js
if (i === hoveredCell && i !== selectedCell) {
    ctx.fillStyle = excluded ? '#FF2D9B08' : '#FF2D9B11';
    ctx.fillRect(x, y, w, h);
}
```

### Files Changed

- `overlay.js` — ~5 lines in `drawOverlay()`

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `state.js` | `activeSnapLines: []`, reset in `resetState()` |
| `interaction.js` | Cmd+Shift+E handler, snap logic in `handleDragMove()`, clear snap lines in `commitDrag()` |
| `overlay.js` | Render snap lines, hover fill highlight |
| `export.js` | Extend `doExport` with `selectedOnly` parameter |
| `index.html` | Shortcut table row for Cmd+Shift+E |

**Estimated: ~5 files modified, ~115 lines net new. No backend changes.**

## What's NOT in this batch

- Multi-select (deferred — complexity outweighs value for typical 4-12 cell workflows)
- Drag to reorder cells (deferred — cell order is cosmetic; users set custom names)
- Snap threshold configuration (YAGNI — 5px works for all tested image sizes)
- Snap during nudge (nudge is 1px precision work where you know the target)
- Dimension tooltip on hover (info already in Selected Cell panel)
