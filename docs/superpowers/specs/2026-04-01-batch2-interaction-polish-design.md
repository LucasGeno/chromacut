# Batch 2: Interaction Polish

**Date:** 2026-04-01
**Scope:** Three features building on the box adjustment system — numeric inputs with aspect ratio lock, undo/redo, keyboard shortcuts with cell exclusion.

---

## 1. Box Adjustment Phase 2

### Selected Cell Section (sidebar)

New `.settings-section` between Detection and Names. Title: "SELECTED CELL" with a dim mono suffix showing the cell number (e.g., "#3"). The entire section is hidden when `selectedCell === -1` and shown when a cell is selected.

### Numeric Inputs (X / Y / W / H)

Four `input[type="number"]` fields in a 2x2 grid layout. Follows the existing `.grid-override` input pattern: 48px wide, centered text, `--font-mono` 11px, `--bg-input` background, `--border-subtle` border, `--border-focus` on focus. Each has an 11px dim label above it.

**Layout:**

```
  X  [____]    Y  [____]
  W  [____]    H  [____]
```

**Read behavior:** Populate from `editedCells[selectedCell]` on every selection change, drag move, and arrow nudge. Values are integers in source image pixels.

**Write behavior:** On `change` event (not `input`), parse as integer, clamp using the same logic as interaction.js:
- X: `max(0, min(value, imgWidth - cell.w))`
- Y: `max(0, min(value, imgHeight - cell.h))`
- W: `max(20, min(value, imgWidth - cell.x))`
- H: `max(20, min(value, imgHeight - cell.y))`

On valid change: push undo snapshot, update `editedCells[selectedCell]`, invalidate `previewImages[selectedCell]`, redraw overlay, rebuild thumbnail, fetch backend preview.

Reject non-numeric input (no-op, revert to current value).

### Aspect Ratio Lock

A toggle button positioned between the W and H input rows. Icon: a chain-link SVG (connected = locked, broken = unlocked). 20x20px, `--bg-raised` background, `--border` border, `--radius-sm`. Active state: `--accent` border, `--accent-text` icon color, `--accent-glow` background.

State: `aspectLocked: false` in `state.js`. Session-wide, not per-cell.

**Effect on resize drag:** When locked, the aspect ratio is captured from the cell at drag start (`startRect.w / startRect.h`). During drag, the dominant axis is determined by handle direction:
- Corner handles (nw, ne, se, sw): use the axis with the larger delta, compute the other to maintain ratio.
- Edge handles (n, s): adjust H freely, compute W from ratio. (e, w): adjust W freely, compute H from ratio.
- Clamp both dimensions to image bounds after ratio enforcement. If clamping breaks the ratio, clamp the other axis too.

**Effect on numeric inputs:** When locked, changing W auto-updates H to maintain the ratio at the time of the edit (and vice versa). The ratio is computed from the current W/H before the edit, not from a stored value.

**No effect on:** Move drag, arrow key nudge.

### Reset Selected

A `btn-reset`-styled button below the numeric inputs: "Reset selected". On click:
1. Push undo snapshot
2. Copy `analysisData.cells[selectedCell]` bounds back into `editedCells[selectedCell]`
3. Invalidate preview, redraw overlay, rebuild thumbnail, fetch backend preview
4. Update numeric input values

### Files Changed

- `index.html` — new Selected Cell section in sidebar (inputs, lock toggle, reset button)
- `style.css` — `.cell-inputs-grid` 2x2 layout, `.aspect-lock` toggle styles, `.selected-cell-title` with number suffix
- `interaction.js` — numeric input change handlers, aspect ratio enforcement in `handleDragMove()`
- `state.js` — add `aspectLocked: false` to state
- `app.js` — show/hide Selected Cell section on selection change, populate inputs

---

## 2. Undo/Redo Stack

### State

Two new fields in `state.js`:

```js
undoStack: []    // array of snapshots
undoIndex: -1    // current position (-1 = no history)
```

Each snapshot is an object:
```js
{ cells: [...], excludedCells: new Set([...]) }
```

`snapshotCells()` updated to return this shape. `restoreCells(snapshot)` updated to restore both fields.

### Model: Timeline Stack

`undoStack` is a timeline of committed states. `undoIndex` points to the current state. Entry 0 is the initial state (pushed in `initCells()`).

```
initCells -> push [S0]                    undoIndex = 0
drag       -> push [S0, S1]              undoIndex = 1
nudge      -> push [S0, S1, S2]          undoIndex = 2
undo       -> restore S1                  undoIndex = 1
undo       -> restore S0                  undoIndex = 0
redo       -> restore S1                  undoIndex = 1
new edit   -> truncate after 1, push S3   [S0, S1, S3] undoIndex = 2
```

### Push Function

```js
function pushUndo()
```

Located in `state.js`. Captures current state via `snapshotCells()` and appends to `undoStack`.

Logic:
1. If `undoIndex < undoStack.length - 1`, truncate everything after `undoIndex` (discard redo future).
2. Push new snapshot.
3. Set `undoIndex = undoStack.length - 1`.
4. If stack exceeds 50 entries, `shift()` the oldest and decrement `undoIndex`.

### Push Points

`pushUndo()` is called **after** each mutation completes. It snapshots the new current state:

| Trigger | When pushed |
|---------|-------------|
| Initial analysis / reset boxes | In `initCells()` after populating editedCells |
| Drag commit | In `commitDrag()` after cell is updated |
| Nudge debounce | When 300ms debounce fires (after nudge sequence) |
| Numeric input change | After value applied to editedCells |
| Reset selected | After single cell restored |
| Cell exclusion toggle | After toggling |

### Undo / Redo Functions

```js
function undo() -> boolean   // returns true if state changed
function redo() -> boolean
```

- `undo()`: if `undoIndex > 0`, decrement `undoIndex`, restore snapshot at new index via `restoreCells()`, return true. Else return false.
- `redo()`: if `undoIndex < undoStack.length - 1`, increment `undoIndex`, restore snapshot at new index, return true. Else return false.

Both in `state.js`. On successful undo/redo, caller must: redraw overlay, rebuild thumbnails, refresh preview, update numeric inputs.

### Keyboard Binding

- `Cmd+Z` (Mac) / `Ctrl+Z` (other): call `undo()`, refresh UI
- `Cmd+Shift+Z` / `Ctrl+Shift+Z`: call `redo()`, refresh UI
- Guarded: skip when focus in INPUT/TEXTAREA

Handled in `interaction.js` keydown listener.

### Stack Reset

Only on new image load (`resetState()` sets `undoStack: [], undoIndex: -1`). `initCells()` then pushes the first snapshot (entry 0).

### Files Changed

- `state.js` — `undoStack`, `undoIndex`, `pushUndo()`, `undo()`, `redo()`, updated `snapshotCells` / `restoreCells` to include `excludedCells`, reset in `resetState()`
- `interaction.js` — Cmd+Z / Cmd+Shift+Z handler, push calls at drag commit, nudge debounce, numeric input change
- `app.js` — push call in initCells (initial state), reset boxes handler

---

## 3. Keyboard Shortcuts

### Shortcut Map

| Key | Action | Guard |
|-----|--------|-------|
| `Cmd+Z` | Undo | Not in input |
| `Cmd+Shift+Z` | Redo | Not in input |
| `Cmd+E` | Export (trigger btn-export click) | Image loaded, not in input |
| `1`-`9` | Select cell N (if exists) | Image loaded, not in input |
| `[` | Decrease padding by 1% | Image loaded, not in input |
| `]` | Increase padding by 1% | Image loaded, not in input |
| `?` | Toggle shortcut help overlay | Always |
| `Escape` | Close help overlay if open; else deselect cell | Always |
| `Delete` / `Backspace` | Toggle cell exclusion | Cell selected, not in input |

### Cell Exclusion

**State:** `excludedCells: new Set()` in `state.js`. Reset in `resetState()`.

**Toggle logic:** On Delete/Backspace with `selectedCell >= 0`:
1. If `excludedCells.has(selectedCell)`, delete it; else add it
2. Call `pushUndo()` to snapshot the new state
3. Redraw overlay, update thumbnail, update name field, update export status

**Overlay rendering for excluded cells:**
- Border: `#FF2D9B33` dashed 1px (more transparent than default `#FF2D9B88`)
- Number label: same reduced opacity with a small "x" suffix (e.g., "3x")
- If selected while excluded: still shows handles (so you can re-include it), but border color is `#FF2D9B66` instead of full `#FF2D9B`

**Thumbnail rendering for excluded cells:**
- `opacity: 0.3` on the `.cell-thumb` element
- CSS diagonal strikethrough via `::after` pseudo-element (1px `--text-muted` line, 45deg, covering the thumb)

**Name field rendering:**
- `opacity: 0.3` on the `.name-row`
- Input gets `pointer-events: none` and `tabindex: -1`

**Export filtering:**
- `getSettings()` in `export.js` skips cells where `state.excludedCells.has(idx)`
- Export status message reflects excluded count: "Exported 3 of 4 icon(s)" when 1 excluded

**Preview panel:**
- Selecting an excluded cell still shows its preview
- An "EXCLUDED" badge appears (same style as before-after badge but with `--danger` color border/text), positioned top-left of result panel

### Padding Adjust ([ / ])

Decrement/increment `paddingSlider.value` by 1, clamped to slider min (0) / max (30). Update `paddingValue.textContent`. Call `updatePreview()`. Mirrors the slider's `input` event behavior.

### Help Overlay

**HTML structure:**
```html
<div id="shortcut-overlay" class="shortcut-overlay hidden">
  <div class="shortcut-card">
    <h3 class="shortcut-title">Keyboard Shortcuts</h3>
    <table class="shortcut-table">
      <tr><td class="shortcut-key">...</td><td>...</td></tr>
      ...
    </table>
  </div>
</div>
```

**Styling:**
- Backdrop: fixed overlay, `rgba(8, 8, 12, 0.85)`, `z-index: 100`, click to close
- Card: `--bg-raised` background, `--border` border, `--radius-md`, max-width 400px, centered
- Title: `.settings-title` style (10px uppercase tracked muted)
- Table: two columns. Left column (key): `--font-mono` 11px, `--bg-input` background, `--border-subtle` border, `--radius-sm`, inline padding 4px 8px (pill-style key badges). Right column (description): `--text-dim` 12px body font.
- Fade in with 0.15s opacity transition

**Toggle:** `?` key toggles visibility. `Escape` closes it (priority over deselect — if overlay is open, Escape closes overlay; if closed, Escape deselects).

### Input Guard

All shortcuts except `?` and `Escape` check `e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA'` before acting. This extends the existing guard pattern in the keydown handler.

### Files Changed

- `state.js` — `excludedCells: new Set()`, updated snapshot/restore to include it, reset in `resetState()`
- `interaction.js` — all new keybindings in the keydown handler, cell exclusion toggle logic
- `overlay.js` — excluded cell rendering (dimmed border, "x" suffix on label)
- `export.js` — filter excluded cells in `getSettings()`, update status message
- `app.js` — excluded state in `buildCellThumbnails()` and `buildNameFields()`, help overlay toggle, padding keyboard adjust, EXCLUDED badge show/hide
- `index.html` — shortcut help overlay HTML, EXCLUDED badge element in result panel
- `style.css` — `.shortcut-overlay`, `.shortcut-card`, `.shortcut-table`, `.shortcut-key` styles; `.cell-thumb.excluded` and `.name-row.excluded` styles; `.excluded-badge` style

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `state.js` | `aspectLocked`, `excludedCells`, `undoStack`, `undoIndex`, `pushUndo()`, `undo()`, `redo()`, updated `snapshotCells`/`restoreCells`/`resetState` |
| `interaction.js` | Numeric input handlers, aspect ratio in drag, all keyboard shortcuts (undo/redo, Cmd+E, 1-9, [/], ?, Escape, Delete), exclusion toggle |
| `overlay.js` | Excluded cell rendering |
| `export.js` | Filter excluded cells, updated status message |
| `app.js` | Selected Cell section show/hide + input population, help overlay toggle, padding keyboard adjust, EXCLUDED badge, exclusion in thumbnails/name fields, pushUndo in initCells/reset |
| `preview.js` | No changes |
| `index.html` | Selected Cell section (inputs, lock, reset), shortcut help overlay, EXCLUDED badge |
| `style.css` | Cell inputs grid, aspect lock toggle, excluded cell/thumb/name styles, shortcut overlay/card/table/key styles, excluded badge |

**Estimated: ~8 files modified, ~350 lines net new.**

## What's NOT in this batch

- Multi-select (Phase 3)
- Snap lines / alignment guides (Phase 3)
- Drag to reorder cells
- Export only selected cell (Cmd+E exports all non-excluded)
