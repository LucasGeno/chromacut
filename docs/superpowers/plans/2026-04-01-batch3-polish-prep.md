# Batch 3: Polish & Prep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add export-selected-cell shortcut, snap lines during move drag, and hover fill highlight to chromacut's interactive cell editor.

**Architecture:** Extends the existing 6-module ES module frontend. Snap detection is a pure function extracted for testability. New design tokens added to CSS. No backend changes. No new JS modules.

**Tech Stack:** Vanilla JS (ES modules), HTML, CSS. No build step. No framework.

---

## File Map

| File | Path | Changes |
|------|------|---------|
| state.js | `src/chromacut/static/js/state.js` | Add `activeSnapLines: []`, reset in `resetState()` |
| interaction.js | `src/chromacut/static/js/interaction.js` | Cmd+Shift+E handler, snap logic in `handleDragMove()` (move only), clear snap lines in `commitDrag()` |
| overlay.js | `src/chromacut/static/js/overlay.js` | Render snap lines, hover fill highlight |
| export.js | `src/chromacut/static/js/export.js` | Extend `doExport` with `selectedOnly` parameter |
| index.html | `src/chromacut/static/index.html` | Shortcut table row for Cmd+Shift+E |
| style.css | `src/chromacut/static/style.css` | New tokens: `--accent-snap`, `--overlay-hover`, `--overlay-hover-dim` |
| design.md | `docs/design.md` | Document new tokens |

---

### Task 1: Design Tokens

**Files:**
- Modify: `src/chromacut/static/style.css`
- Modify: `docs/design.md`

Add three new CSS custom properties and document them in the design system.

- [ ] **Step 1: Add tokens to style.css**

In `src/chromacut/static/style.css`, in the `:root` block, add these three lines after the existing `--overlay-dim` declaration (around line 35):

```css
    --accent-snap: #44e04466;
    --overlay-hover: #FF2D9B11;
    --overlay-hover-dim: #FF2D9B08;
```

- [ ] **Step 2: Document tokens in design.md**

In `docs/design.md`, in the "Accent — Chroma Green" table (after the `--accent-text` row), add:

```markdown
| `--accent-snap` | `#44e04466` | Snap guide lines during drag (translucent) |
```

In the "Overlay — Magenta" table (after the `--overlay-dim` row), add:

```markdown
| `--overlay-hover` | `#FF2D9B11` | Hover fill on non-selected cells (very translucent) |
| `--overlay-hover-dim` | `#FF2D9B08` | Hover fill on excluded cells |
```

- [ ] **Step 3: Commit**

```bash
git add src/chromacut/static/style.css docs/design.md
git commit -m "feat(ui): add design tokens for snap lines and hover fill"
```

---

### Task 2: Hover Fill Highlight

**Files:**
- Modify: `src/chromacut/static/js/overlay.js`

Add translucent fill on hovered (non-selected) cells.

- [ ] **Step 1: Add hover fill in drawOverlay**

In `src/chromacut/static/js/overlay.js`, inside the `editedCells.forEach` loop in `drawOverlay()`, add this block **after** the `ctx.setLineDash([])` / `ctx.setLineDash([6, 3])` styling block and **before** `ctx.strokeRect(x, y, w, h)` (currently at line 145). Insert between the closing brace of the style selection and `ctx.strokeRect`:

```js
        // Hover fill highlight
        if (i === hoveredCell && i !== selectedCell) {
            ctx.fillStyle = excluded ? '#FF2D9B08' : '#FF2D9B11';
            ctx.fillRect(x, y, w, h);
        }
```

- [ ] **Step 2: Verify visually**

Run: `.venv/bin/python -m chromacut`
Load an image with multiple cells. Hover over a non-selected cell — a subtle magenta fill should appear. Hover over an excluded cell — even subtler fill. Hovering over the selected cell should show no fill (only the existing solid border + handles).

- [ ] **Step 3: Commit**

```bash
git add src/chromacut/static/js/overlay.js
git commit -m "feat(ui): add translucent hover fill highlight on cells"
```

---

### Task 3: Export Selected Cell

**Files:**
- Modify: `src/chromacut/static/js/export.js`
- Modify: `src/chromacut/static/js/interaction.js`
- Modify: `src/chromacut/static/index.html`

Add Cmd+Shift+E to export only the selected cell.

- [ ] **Step 1: Extend doExport with selectedOnly parameter**

In `src/chromacut/static/js/export.js`, change the `doExport` function signature at line 50 from:

```js
export async function doExport(btnExport, exportStatus, paddingSlider, nameFields) {
```

to:

```js
export async function doExport(btnExport, exportStatus, paddingSlider, nameFields, selectedOnly = false) {
```

Then replace the settings construction line (line 56):

```js
    const settings = getSettings(paddingSlider, nameFields);
```

with:

```js
    let settings;
    if (selectedOnly && state.selectedCell >= 0) {
        const sizeBtn  = document.querySelector('[data-setting="output_size"] button.active');
        const styleBtn = document.querySelector('[data-setting="art_style"] button.active');
        const cell = state.editedCells[state.selectedCell];
        const nameInput = nameFields.querySelector(`input[data-index="${state.selectedCell}"]`);
        const name = nameInput?.value.trim() || `icon-${state.selectedCell + 1}`;
        settings = {
            cells: [{ index: state.selectedCell, name, x: cell.x, y: cell.y, w: cell.w, h: cell.h }],
            output_size: parseInt(sizeBtn?.dataset.value || '512'),
            padding:     parseInt(paddingSlider.value) / 100,
            art_style:   styleBtn?.dataset.value || 'pixel',
        };
    } else {
        settings = getSettings(paddingSlider, nameFields);
    }
```

Also update the success status message (around line 82). Replace:

```js
        const total = state.editedCells.length;
        const exported = settings.cells.length;
        exportStatus.textContent = exported < total
            ? `Exported ${exported} of ${total} icon(s)`
            : `Exported ${exported} icon(s)`;
```

with:

```js
        if (selectedOnly) {
            const name = settings.cells[0]?.name || 'icon';
            exportStatus.textContent = `Exported ${name}.png`;
        } else {
            const total = state.editedCells.length;
            const exported = settings.cells.length;
            exportStatus.textContent = exported < total
                ? `Exported ${exported} of ${total} icon(s)`
                : `Exported ${exported} icon(s)`;
        }
```

- [ ] **Step 2: Add Cmd+Shift+E handler and guard existing Cmd+E**

In `src/chromacut/static/js/interaction.js`, first import `doExport` at the top of the file. Add to the existing imports:

```js
import { doExport } from './export.js';
```

Then in the keydown handler, find the existing Cmd+E block (currently at line 364):

```js
        // Cmd+E: export
        if ((e.metaKey || e.ctrlKey) && e.code === 'KeyE') {
```

**Replace** it with these two blocks:

```js
        // Cmd+Shift+E: export selected cell only
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyE') {
            e.preventDefault();
            if (state.sourceImage && state.selectedCell >= 0) {
                const btnExport = document.querySelector('#btn-export');
                const exportStatus = document.querySelector('#export-status');
                const nameFields = document.querySelector('#name-fields');
                doExport(btnExport, exportStatus, paddingSlider, nameFields, true);
            }
            return;
        }

        // Cmd+E: export all (guard against shift to avoid intercepting Cmd+Shift+E)
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.code === 'KeyE') {
            e.preventDefault();
            if (state.sourceImage) {
                document.querySelector('#btn-export')?.click();
            }
            return;
        }
```

- [ ] **Step 3: Add shortcut table row in index.html**

In `src/chromacut/static/index.html`, in the shortcut overlay table, add this row after the `Cmd+E` / Export row:

```html
                <tr><td><kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd></td><td>Export selected cell</td></tr>
```

- [ ] **Step 4: Verify export selected works**

Run: `.venv/bin/python -m chromacut`
Manual test:
1. Load a multi-cell image
2. Select cell 2
3. Cmd+Shift+E — downloads a single PNG named after cell 2's name field
4. Status shows "Exported icon-2.png"
5. Cmd+E (without shift) — still exports all non-excluded cells as before
6. With no cell selected (Escape first), Cmd+Shift+E does nothing

- [ ] **Step 5: Commit**

```bash
git add src/chromacut/static/js/export.js src/chromacut/static/js/interaction.js src/chromacut/static/index.html
git commit -m "feat(ui): add Cmd+Shift+E to export only the selected cell"
```

---

### Task 4: Snap Lines — State + Detection

**Files:**
- Modify: `src/chromacut/static/js/state.js`
- Modify: `src/chromacut/static/js/interaction.js`

Add snap state, the pure snap-detection function, and wire it into move drag.

- [ ] **Step 1: Add activeSnapLines to state**

In `src/chromacut/static/js/state.js`, add this field to the `state` object after `undoIndex` (line 21):

```js
    activeSnapLines: [],        // transient: { axis: 'x'|'y', pos: number } during drag
```

In `resetState()`, add after `state.undoIndex = -1;` (line 38):

```js
    state.activeSnapLines = [];
```

- [ ] **Step 2: Add snap detection function in interaction.js**

In `src/chromacut/static/js/interaction.js`, add this pure function after the `clampResize` function (around line 32) and before `handleDragMove`:

```js
// ---- Snap detection ----

const SNAP_THRESHOLD = 5;

/**
 * Find the nearest snap target within threshold.
 * @param {number} candidate - the edge/center value to test
 * @param {number[]} targets - snap target values on the same axis
 * @returns {{ snapped: boolean, value: number }}
 */
function findSnap(candidate, targets) {
    let best = null;
    let bestDist = SNAP_THRESHOLD + 1;
    for (const t of targets) {
        const dist = Math.abs(candidate - t);
        if (dist <= SNAP_THRESHOLD && dist < bestDist) {
            best = t;
            bestDist = dist;
        }
    }
    return best !== null ? { snapped: true, value: best } : { snapped: false, value: candidate };
}

/**
 * Compute snap targets from all cells except the dragged one.
 * Returns { x: number[], y: number[] } arrays of snap positions.
 * @param {number} excludeIndex - index of the cell being dragged
 * @returns {{ x: number[], y: number[] }}
 */
function getSnapTargets(excludeIndex) {
    const xTargets = [];
    const yTargets = [];
    for (let i = 0; i < state.editedCells.length; i++) {
        if (i === excludeIndex) continue;
        const c = state.editedCells[i];
        xTargets.push(c.x, c.x + c.w / 2, c.x + c.w);
        yTargets.push(c.y, c.y + c.h / 2, c.y + c.h);
    }
    return { x: xTargets, y: yTargets };
}
```

- [ ] **Step 3: Wire snap into handleDragMove for move mode**

In `src/chromacut/static/js/interaction.js`, in `handleDragMove`, replace the `if (mode === 'move')` block (lines 44-49):

```js
    if (mode === 'move') {
        cell.x = Math.round(startRect.x + dx);
        cell.y = Math.round(startRect.y + dy);
        cell.w = startRect.w;
        cell.h = startRect.h;
        clampMove(cell);
    }
```

with:

```js
    if (mode === 'move') {
        cell.x = Math.round(startRect.x + dx);
        cell.y = Math.round(startRect.y + dy);
        cell.w = startRect.w;
        cell.h = startRect.h;

        // Snap detection (before clamping)
        state.activeSnapLines = [];
        const targets = getSnapTargets(cellIndex);
        if (targets.x.length > 0) {
            // Try snapping each X edge/center, pick the one that actually snapped
            const leftSnap   = findSnap(cell.x, targets.x);
            const centerSnap = findSnap(cell.x + cell.w / 2, targets.x);
            const rightSnap  = findSnap(cell.x + cell.w, targets.x);

            // Pick the closest snap among the three
            const xCandidates = [
                leftSnap.snapped   ? { dist: Math.abs(cell.x - leftSnap.value),                    apply: () => { cell.x = leftSnap.value; }, pos: leftSnap.value } : null,
                centerSnap.snapped ? { dist: Math.abs(cell.x + cell.w / 2 - centerSnap.value),     apply: () => { cell.x = centerSnap.value - cell.w / 2; }, pos: centerSnap.value } : null,
                rightSnap.snapped  ? { dist: Math.abs(cell.x + cell.w - rightSnap.value),           apply: () => { cell.x = rightSnap.value - cell.w; }, pos: rightSnap.value } : null,
            ].filter(Boolean);
            if (xCandidates.length > 0) {
                const best = xCandidates.reduce((a, b) => a.dist < b.dist ? a : b);
                best.apply();
                state.activeSnapLines.push({ axis: 'x', pos: best.pos });
            }

            const topSnap    = findSnap(cell.y, targets.y);
            const midSnap    = findSnap(cell.y + cell.h / 2, targets.y);
            const bottomSnap = findSnap(cell.y + cell.h, targets.y);

            const yCandidates = [
                topSnap.snapped    ? { dist: Math.abs(cell.y - topSnap.value),                    apply: () => { cell.y = topSnap.value; }, pos: topSnap.value } : null,
                midSnap.snapped    ? { dist: Math.abs(cell.y + cell.h / 2 - midSnap.value),       apply: () => { cell.y = midSnap.value - cell.h / 2; }, pos: midSnap.value } : null,
                bottomSnap.snapped ? { dist: Math.abs(cell.y + cell.h - bottomSnap.value),         apply: () => { cell.y = bottomSnap.value - cell.h; }, pos: bottomSnap.value } : null,
            ].filter(Boolean);
            if (yCandidates.length > 0) {
                const best = yCandidates.reduce((a, b) => a.dist < b.dist ? a : b);
                best.apply();
                state.activeSnapLines.push({ axis: 'y', pos: best.pos });
            }
        }

        clampMove(cell);
    }
```

- [ ] **Step 4: Clear snap lines on drag end**

In `src/chromacut/static/js/interaction.js`, in the `commitDrag` function (inside `setupInteraction`), add at the very top before `const cellIndex = ...`:

```js
        state.activeSnapLines = [];
```

Also clear snap lines when drag is NOT active at the top of `handleDragMove`, change:

```js
    if (!state.activeDrag) return;
```

to:

```js
    if (!state.activeDrag) { state.activeSnapLines = []; return; }
```

- [ ] **Step 5: Verify snap detection works**

Run: `.venv/bin/python -m chromacut`
Manual test:
1. Load image with 4+ cells
2. Drag cell 1 near cell 2's left edge — cell should snap when within 5px
3. Continue dragging past the snap zone — cell releases from snap
4. Snap lines won't be visible yet (rendering is Task 5)

- [ ] **Step 6: Commit**

```bash
git add src/chromacut/static/js/state.js src/chromacut/static/js/interaction.js
git commit -m "feat(ui): add snap detection for move drag with 5px threshold"
```

---

### Task 5: Snap Lines — Rendering

**Files:**
- Modify: `src/chromacut/static/js/overlay.js`

Render active snap lines in the overlay.

- [ ] **Step 1: Add snap line rendering at end of drawOverlay**

In `src/chromacut/static/js/overlay.js`, at the end of the `drawOverlay` function (after the handle rendering block's closing brace, before the function's closing brace), add:

```js

    // Draw active snap lines
    if (state.activeSnapLines.length > 0) {
        ctx.strokeStyle = '#44e04466';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        for (const line of state.activeSnapLines) {
            if (line.axis === 'x') {
                const cx = line.pos * scaleX;
                ctx.beginPath();
                ctx.moveTo(cx, 0);
                ctx.lineTo(cx, overlayCanvas.height);
                ctx.stroke();
            } else {
                const cy = line.pos * scaleY;
                ctx.beginPath();
                ctx.moveTo(0, cy);
                ctx.lineTo(overlayCanvas.width, cy);
                ctx.stroke();
            }
        }

        ctx.setLineDash([]);
    }
```

- [ ] **Step 2: Verify snap lines render**

Run: `.venv/bin/python -m chromacut`
Manual test:
1. Load image with multiple cells
2. Drag cell near another cell's edge — green dashed guide line appears
3. Release — guide line disappears
4. Drag near center alignment — guide line appears at center position
5. Lines only appear during move drag, not resize

- [ ] **Step 3: Commit**

```bash
git add src/chromacut/static/js/overlay.js
git commit -m "feat(ui): render snap guide lines during move drag"
```

---

### Task 6: Final Integration + Tests

**Files:**
- No new files

Run existing test suite and perform full manual integration check.

- [ ] **Step 1: Run existing tests**

Run: `.venv/bin/python -m pytest -v`
Expected: All 54 tests pass.

- [ ] **Step 2: Full manual integration check**

Run: `.venv/bin/python -m chromacut`
Checklist:
1. Load image — grid detection works, cells appear
2. Hover over non-selected cell — subtle magenta fill appears
3. Hover over excluded cell — even subtler fill
4. Hover over selected cell — no fill (handles only)
5. Drag cell near another cell's edge — green snap line appears, cell snaps at 5px
6. Snap to center alignment — vertical/horizontal green line at center
7. Release drag — snap lines disappear
8. Resize drag — no snap lines (intentionally deferred)
9. Cmd+Shift+E with cell selected — single PNG downloads
10. Cmd+Shift+E with no selection — nothing happens
11. Cmd+E — still exports all non-excluded cells
12. Help overlay (?) — shows Cmd+Shift+E row
13. All existing shortcuts still work (1-9, [/], Delete, Escape, Space, arrows)
14. Undo/redo still works across all operations

- [ ] **Step 3: Commit if any fixes were needed**

```bash
git add -u src/chromacut/static/
git commit -m "chore(ui): batch 3 final integration fixes"
```

Only create this commit if changes were made. Skip if integration check passed cleanly.
