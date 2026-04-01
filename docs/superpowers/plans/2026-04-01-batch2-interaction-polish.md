# Batch 2: Interaction Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add numeric cell inputs with aspect ratio lock, undo/redo, and keyboard shortcuts (including cell exclusion and help overlay) to chromacut's box adjustment system.

**Architecture:** Extends the existing 6-module ES module frontend. All new state goes in `state.js`, undo/redo uses a timeline-stack model with snapshot-based restore. No new JS modules — features are distributed across existing modules by responsibility. No backend changes.

**Tech Stack:** Vanilla JS (ES modules), HTML, CSS. No build step. No framework.

---

## File Map

| File | Path | Changes |
|------|------|---------|
| state.js | `src/chromacut/static/js/state.js` | New fields: `excludedCells`, `aspectLocked`, `undoStack`, `undoIndex`. New functions: `pushUndo()`, `undo()`, `redo()`. Updated: `snapshotCells`, `restoreCells`, `resetState`. |
| interaction.js | `src/chromacut/static/js/interaction.js` | Aspect ratio enforcement in `handleDragMove()`. All new keyboard shortcuts (undo/redo, Cmd+E, 1-9, [/], ?, Escape, Delete). Cell exclusion toggle. Push undo at drag commit and nudge debounce. |
| overlay.js | `src/chromacut/static/js/overlay.js` | Excluded cell rendering in `drawOverlay()`. |
| export.js | `src/chromacut/static/js/export.js` | Filter excluded cells in `getSettings()`, updated status message in `doExport()`. |
| app.js | `src/chromacut/static/js/app.js` | Selected Cell section show/hide + input population (`updateCellPanel()`). Numeric input change handlers. Help overlay toggle. Padding keyboard adjust. EXCLUDED badge. Exclusion in `buildCellThumbnails()` and `buildNameFields()`. `pushUndo` in `initCells` and reset boxes. |
| index.html | `src/chromacut/static/index.html` | Selected Cell section (inputs, lock toggle, reset button). Shortcut help overlay. EXCLUDED badge in result panel. |
| style.css | `src/chromacut/static/style.css` | `.cell-inputs-grid`, `.aspect-lock`, `.selected-cell-section`, excluded cell/thumb/name styles, shortcut overlay styles, excluded badge. |

---

### Task 1: State Infrastructure

**Files:**
- Modify: `src/chromacut/static/js/state.js`

Add all new state fields, update `snapshotCells`/`restoreCells`/`resetState` to handle `excludedCells`. Add `pushUndo`, `undo`, `redo`.

- [ ] **Step 1: Add new state fields**

In `state.js`, add these fields to the `state` object after `lastSourceCrop`:

```js
excludedCells: new Set(),   // cell indices excluded from export
aspectLocked: false,        // aspect ratio lock for resize
undoStack: [],              // timeline of snapshots
undoIndex: -1,              // current position in undoStack
```

- [ ] **Step 2: Update resetState**

Add the new fields to `resetState()`:

```js
state.excludedCells = new Set();
state.aspectLocked = false;
state.undoStack = [];
state.undoIndex = -1;
```

- [ ] **Step 3: Update snapshotCells to include excludedCells**

Replace the existing `snapshotCells` function:

```js
export function snapshotCells() {
    return {
        cells: state.editedCells.map(c => ({ ...c })),
        excludedCells: new Set(state.excludedCells),
    };
}
```

- [ ] **Step 4: Update restoreCells to restore excludedCells**

Replace the existing `restoreCells` function:

```js
export function restoreCells(snapshot) {
    state.editedCells = snapshot.cells.map(c => ({ ...c }));
    state.excludedCells = new Set(snapshot.excludedCells);
}
```

- [ ] **Step 5: Add pushUndo function**

Add after `restoreCells`:

```js
const UNDO_CAP = 50;

/**
 * Snapshot current state and append to undo timeline.
 * Called after each mutation completes.
 */
export function pushUndo() {
    // Truncate redo future
    if (state.undoIndex < state.undoStack.length - 1) {
        state.undoStack.length = state.undoIndex + 1;
    }
    state.undoStack.push(snapshotCells());
    state.undoIndex = state.undoStack.length - 1;
    // Cap
    if (state.undoStack.length > UNDO_CAP) {
        state.undoStack.shift();
        state.undoIndex--;
    }
}
```

- [ ] **Step 6: Add undo function**

```js
/**
 * Undo: step back one position in the timeline.
 * @returns {boolean} true if state changed
 */
export function undo() {
    if (state.undoIndex <= 0) return false;
    state.undoIndex--;
    restoreCells(state.undoStack[state.undoIndex]);
    return true;
}
```

- [ ] **Step 7: Add redo function**

```js
/**
 * Redo: step forward one position in the timeline.
 * @returns {boolean} true if state changed
 */
export function redo() {
    if (state.undoIndex >= state.undoStack.length - 1) return false;
    state.undoIndex++;
    restoreCells(state.undoStack[state.undoIndex]);
    return true;
}
```

- [ ] **Step 8: Verify the server starts**

Run: `.venv/bin/python -m chromacut`
Expected: Server starts on localhost:6100 without JS errors in browser console.

- [ ] **Step 9: Commit**

```bash
git add src/chromacut/static/js/state.js
git commit -m "feat(state): add undo/redo stack, excludedCells, aspectLocked state"
```

---

### Task 2: Wire Undo at Existing Mutation Points

**Files:**
- Modify: `src/chromacut/static/js/state.js`
- Modify: `src/chromacut/static/js/interaction.js`
- Modify: `src/chromacut/static/js/app.js`

Wire `pushUndo()` at all existing mutation sites and add Cmd+Z / Cmd+Shift+Z keyboard handling.

- [ ] **Step 1: Push initial snapshot in initCells**

In `state.js`, add `pushUndo()` call at the end of `initCells`:

```js
export function initCells(analysisData) {
    state.editedCells = analysisData.cells.map(c => ({ ...c }));
    state.previewImages = [];
    if (analysisData.previews) {
        for (const dataUrl of analysisData.previews) {
            const img = new Image();
            img.src = dataUrl;
            state.previewImages.push(img);
        }
    }
    // Reset undo stack and push initial state
    state.undoStack = [];
    state.undoIndex = -1;
    pushUndo();
}
```

- [ ] **Step 2: Push undo after drag commit**

In `interaction.js`, import `pushUndo` from state.js. Update the import line:

```js
import { state } from './state.js';
```

becomes:

```js
import { state, pushUndo } from './state.js';
```

In the `commitDrag` function inside `setupInteraction`, add `pushUndo()` after the refresh calls:

```js
function commitDrag() {
    const cellIndex = state.activeDrag?.cellIndex;
    state.activeDrag = null;

    if (cellIndex != null && cellIndex >= 0) {
        refreshCellPreview(cellIndex, state.sourceFile);
        rebuildCellThumbnail(cellIndex, cellThumbnails);
        pushUndo();
    }
}
```

- [ ] **Step 3: Push undo after nudge debounce**

In the arrow key nudge handler inside `setupInteraction`, add `pushUndo()` inside the debounce timeout callback, after the preview refresh:

```js
clearTimeout(_nudgeDebounce);
_nudgeDebounce = setTimeout(() => {
    refreshCellPreview(nudgedIndex, state.sourceFile);
    rebuildCellThumbnail(nudgedIndex, cellThumbnails);
    pushUndo();
}, 300);
```

- [ ] **Step 4: Push undo after reset boxes**

In `app.js`, import `pushUndo` from state.js. Update the import:

```js
import { state, resetState, initCells } from './state.js';
```

becomes:

```js
import { state, resetState, initCells, pushUndo } from './state.js';
```

Note: `initCells` already calls `pushUndo()` internally (from Step 1), so the reset boxes handler does not need an extra push — it calls `initCells()` which resets the stack and pushes the initial state. No change needed to the reset handler.

- [ ] **Step 5: Add Cmd+Z / Cmd+Shift+Z handler**

In `interaction.js`, import `undo` and `redo`:

```js
import { state, pushUndo, undo, redo } from './state.js';
```

In the `keydown` handler inside `setupInteraction`, add this block **before** the existing input guard (so it can have its own guard):

```js
// Undo/redo (Cmd+Z / Cmd+Shift+Z)
if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ') {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    const changed = e.shiftKey ? redo() : undo();
    if (changed) {
        drawOverlay(overlayCanvas);
        updatePreview(resultCanvas, paddingSlider);
    }
    return;
}
```

This block must appear at the top of the `keydown` handler, before the Space and arrow handlers.

- [ ] **Step 6: Verify undo/redo works**

Run: `.venv/bin/python -m chromacut`
Manual test:
1. Load an image, wait for analysis
2. Drag a cell to move it
3. Cmd+Z — cell returns to previous position
4. Cmd+Shift+Z — cell moves back to dragged position
5. Nudge with arrows, Cmd+Z undoes the nudge sequence

- [ ] **Step 7: Commit**

```bash
git add src/chromacut/static/js/state.js src/chromacut/static/js/interaction.js src/chromacut/static/js/app.js
git commit -m "feat(undo): wire undo/redo at drag, nudge, and reset mutation points"
```

---

### Task 3: Selected Cell Section — HTML + CSS

**Files:**
- Modify: `src/chromacut/static/index.html`
- Modify: `src/chromacut/static/style.css`

Add the Selected Cell sidebar section with numeric inputs, aspect ratio lock toggle, and reset selected button.

- [ ] **Step 1: Add Selected Cell section to index.html**

In `index.html`, insert this new section **between** the "Reset boxes" section and the "Names" section. Find the closing `</div>` of the reset boxes section (after `<button id="btn-reset-boxes"...>`) and insert before the Names section:

```html
                    <div id="selected-cell-section" class="settings-section selected-cell-section hidden">
                        <h3 class="settings-title">Selected Cell <span id="selected-cell-num" class="selected-cell-num"></span></h3>
                        <div class="cell-inputs-grid">
                            <div class="cell-input-field">
                                <label>X</label>
                                <input type="number" id="cell-input-x" min="0" step="1">
                            </div>
                            <div class="cell-input-field">
                                <label>Y</label>
                                <input type="number" id="cell-input-y" min="0" step="1">
                            </div>
                            <div class="cell-input-field">
                                <label>W</label>
                                <input type="number" id="cell-input-w" min="20" step="1">
                            </div>
                            <div class="cell-input-field">
                                <label>H</label>
                                <input type="number" id="cell-input-h" min="20" step="1">
                            </div>
                        </div>
                        <button id="btn-aspect-lock" class="aspect-lock" title="Lock aspect ratio">
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                <path class="lock-linked" d="M4 5V4a3 3 0 0 1 6 0v1M3 6h8v6H3z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </button>
                        <button id="btn-reset-selected" class="btn-reset">Reset selected</button>
                    </div>
```

- [ ] **Step 2: Add EXCLUDED badge to result panel**

In `index.html`, inside the `.result-panel` div, after the `before-after-badge`, add:

```html
<div id="excluded-badge" class="excluded-badge hidden">EXCLUDED</div>
```

- [ ] **Step 3: Add shortcut help overlay**

In `index.html`, add before the closing `</body>` tag (before the `<script>` tag):

```html
    <!-- Shortcut help overlay -->
    <div id="shortcut-overlay" class="shortcut-overlay hidden">
        <div class="shortcut-card">
            <h3 class="shortcut-title">Keyboard Shortcuts</h3>
            <table class="shortcut-table">
                <tr><td><kbd>1</kbd>-<kbd>9</kbd></td><td>Select cell</td></tr>
                <tr><td><kbd>Arrow</kbd></td><td>Nudge 1px</td></tr>
                <tr><td><kbd>Shift</kbd>+<kbd>Arrow</kbd></td><td>Nudge 10px</td></tr>
                <tr><td><kbd>[</kbd> <kbd>]</kbd></td><td>Adjust padding</td></tr>
                <tr><td><kbd>Del</kbd></td><td>Exclude / include cell</td></tr>
                <tr><td><kbd>Esc</kbd></td><td>Deselect / close</td></tr>
                <tr><td><kbd>Space</kbd></td><td>Before / after</td></tr>
                <tr><td><kbd>Cmd</kbd>+<kbd>Z</kbd></td><td>Undo</td></tr>
                <tr><td><kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd></td><td>Redo</td></tr>
                <tr><td><kbd>Cmd</kbd>+<kbd>E</kbd></td><td>Export</td></tr>
                <tr><td><kbd>?</kbd></td><td>This help</td></tr>
            </table>
        </div>
    </div>
```

- [ ] **Step 4: Add CSS for Selected Cell section**

In `style.css`, add before the `/* ============ Guides Tab */` section:

```css
/* ---- Selected Cell section ---- */
.selected-cell-section {
    transition: opacity 0.15s;
}

.selected-cell-num {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-dim);
    font-weight: 400;
}

.cell-inputs-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--gap-xs) var(--gap-sm);
}

.cell-input-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.cell-input-field label {
    font-size: 10px;
    color: var(--text-muted);
    font-weight: 500;
    font-family: var(--font-mono);
}

.cell-input-field input {
    width: 100%;
    font-family: var(--font-mono);
    font-size: 11px;
    padding: 4px 6px;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text);
    text-align: center;
    -moz-appearance: textfield;
}

.cell-input-field input::-webkit-inner-spin-button,
.cell-input-field input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
}

.cell-input-field input:focus {
    outline: none;
    border-color: var(--border-focus);
}

/* Aspect ratio lock toggle */
.aspect-lock {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 24px;
    background: none;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s;
    margin: calc(-1 * var(--gap-xs)) 0;
}

.aspect-lock:hover {
    color: var(--text-dim);
    border-color: var(--border);
}

.aspect-lock.active {
    color: var(--accent-text);
    border-color: var(--accent);
    background: var(--accent-glow);
}
```

- [ ] **Step 5: Add CSS for excluded cell visuals**

Append to `style.css`:

```css
/* ---- Excluded cell visuals ---- */
.cell-thumb.excluded {
    opacity: 0.3;
    position: relative;
}

.cell-thumb.excluded::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
        45deg,
        transparent calc(50% - 0.5px),
        var(--text-muted) calc(50% - 0.5px),
        var(--text-muted) calc(50% + 0.5px),
        transparent calc(50% + 0.5px)
    );
    pointer-events: none;
}

.name-row.excluded {
    opacity: 0.3;
}

.name-row.excluded input {
    pointer-events: none;
}

.excluded-badge {
    position: absolute;
    top: 8px;
    left: 8px;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.08em;
    padding: 3px 8px;
    background: var(--bg-deep);
    border: 1px solid var(--danger);
    color: var(--danger);
    border-radius: 3px;
    pointer-events: none;
    z-index: 10;
}
```

- [ ] **Step 6: Add CSS for shortcut help overlay**

Append to `style.css`:

```css
/* ---- Shortcut help overlay ---- */
.shortcut-overlay {
    position: fixed;
    inset: 0;
    background: rgba(8, 8, 12, 0.85);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s;
    pointer-events: none;
}

.shortcut-overlay.visible {
    opacity: 1;
    pointer-events: auto;
}

.shortcut-overlay.hidden {
    display: none;
}

.shortcut-card {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--gap-lg);
    max-width: 400px;
    width: 90%;
}

.shortcut-title {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    padding-bottom: var(--gap-sm);
    border-bottom: 1px solid var(--border-subtle);
    margin-bottom: var(--gap-md);
}

.shortcut-table {
    width: 100%;
    border-collapse: collapse;
}

.shortcut-table td {
    padding: 4px 0;
    font-size: 12px;
    color: var(--text-dim);
}

.shortcut-table td:first-child {
    width: 140px;
    white-space: nowrap;
}

.shortcut-table kbd {
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 2px 6px;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    color: var(--text);
}
```

- [ ] **Step 7: Verify HTML/CSS renders**

Run: `.venv/bin/python -m chromacut`
Manual test: Load an image. The Selected Cell section should be hidden. The shortcut overlay should be hidden. No visual regressions. Check browser console for no errors.

- [ ] **Step 8: Commit**

```bash
git add src/chromacut/static/index.html src/chromacut/static/style.css
git commit -m "feat(ui): add selected cell section, exclusion, and shortcut overlay HTML/CSS"
```

---

### Task 4: Numeric Input Read/Write + Selected Cell Panel

**Files:**
- Modify: `src/chromacut/static/js/app.js`
- Modify: `src/chromacut/static/js/interaction.js`

Wire the Selected Cell section: show/hide on selection change, populate inputs, handle input changes.

- [ ] **Step 1: Add DOM refs in app.js**

In `app.js`, add these DOM refs after the existing `const btnResetBoxes` line:

```js
const selectedCellSection = $('#selected-cell-section');
const selectedCellNum     = $('#selected-cell-num');
const cellInputX          = $('#cell-input-x');
const cellInputY          = $('#cell-input-y');
const cellInputW          = $('#cell-input-w');
const cellInputH          = $('#cell-input-h');
const btnAspectLock       = $('#btn-aspect-lock');
const btnResetSelected    = $('#btn-reset-selected');
const excludedBadge       = $('#excluded-badge');
const shortcutOverlay     = $('#shortcut-overlay');
```

- [ ] **Step 2: Add updateCellPanel function**

In `app.js`, add this function after the DOM refs:

```js
/** Show/hide the Selected Cell section and populate inputs. */
function updateCellPanel() {
    if (state.selectedCell < 0 || state.selectedCell >= state.editedCells.length) {
        selectedCellSection.classList.add('hidden');
        return;
    }
    selectedCellSection.classList.remove('hidden');
    selectedCellNum.textContent = `#${state.selectedCell + 1}`;

    const cell = state.editedCells[state.selectedCell];
    cellInputX.value = Math.round(cell.x);
    cellInputY.value = Math.round(cell.y);
    cellInputW.value = Math.round(cell.w);
    cellInputH.value = Math.round(cell.h);

    // EXCLUDED badge
    if (state.excludedCells.has(state.selectedCell)) {
        excludedBadge.classList.remove('hidden');
    } else {
        excludedBadge.classList.add('hidden');
    }
}
```

- [ ] **Step 3: Call updateCellPanel at existing selection change sites**

In `app.js`, add `updateCellPanel()` call in these locations:

After `analyzeImage` succeeds (after `updatePreview` call):
```js
updateCellPanel();
```

After reset boxes handler (after `updatePreview` call):
```js
updateCellPanel();
```

In thumbnail click handler — find `thumb.addEventListener('click', () => {` and add `updateCellPanel()` after the `updatePreview` call inside it.

- [ ] **Step 4: Pass updateCellPanel to interaction module**

Extend the `setupInteraction` call to include the new DOM refs and the `updateCellPanel` callback. Update the call in `app.js`:

```js
setupInteraction({
    overlayCanvas,
    resultCanvas,
    paddingSlider,
    cellThumbnails,
    beforeAfterBadge,
    updateCellPanel,
});
```

- [ ] **Step 5: Use updateCellPanel in interaction.js**

In `interaction.js`, update the `setupInteraction` function to destructure `updateCellPanel`:

```js
export function setupInteraction(dom) {
    _interactionDom = dom;
    const { overlayCanvas, resultCanvas, paddingSlider, cellThumbnails, beforeAfterBadge, updateCellPanel } = dom;
```

Call `updateCellPanel()` in the `pointerdown` handler after `updatePreview`:

```js
state.selectedCell = hit.cellIndex;
drawOverlay(overlayCanvas);
updatePreview(resultCanvas, paddingSlider);
updateCellPanel();
```

Also call it after click-to-deselect:

```js
if (state.selectedCell >= 0) {
    state.selectedCell = -1;
    drawOverlay(overlayCanvas);
    updateCellPanel();
}
```

Call `updateCellPanel()` inside `handleDragMove` after `drawOverlay` (so inputs update live during drag):

```js
drawOverlay(overlayCanvas);
updatePreview(_interactionDom.resultCanvas, _interactionDom.paddingSlider);
if (_interactionDom.updateCellPanel) _interactionDom.updateCellPanel();
```

Call `updateCellPanel()` inside the nudge handler after `updatePreview`:

```js
drawOverlay(overlayCanvas);
updatePreview(resultCanvas, paddingSlider);
if (updateCellPanel) updateCellPanel();
```

Call `updateCellPanel()` inside the undo/redo handler after `updatePreview`:

```js
if (changed) {
    drawOverlay(overlayCanvas);
    updatePreview(resultCanvas, paddingSlider);
    if (updateCellPanel) updateCellPanel();
}
```

- [ ] **Step 6: Add numeric input change handlers in app.js**

In `app.js`, add after the `updateCellPanel` function:

```js
/** Handle change on a cell numeric input. */
function handleCellInputChange() {
    if (state.selectedCell < 0) return;
    const cell = state.editedCells[state.selectedCell];
    const imgW = state.sourceImage.width;
    const imgH = state.sourceImage.height;

    let x = parseInt(cellInputX.value);
    let y = parseInt(cellInputY.value);
    let w = parseInt(cellInputW.value);
    let h = parseInt(cellInputH.value);

    if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) {
        // Revert to current values
        updateCellPanel();
        return;
    }

    // Aspect ratio lock: if W or H changed, adjust the other
    if (state.aspectLocked && (w !== Math.round(cell.w) || h !== Math.round(cell.h))) {
        const ratio = cell.w / cell.h;
        if (w !== Math.round(cell.w)) {
            h = Math.round(w / ratio);
        } else {
            w = Math.round(h * ratio);
        }
    }

    // Clamp
    w = Math.max(20, Math.min(w, imgW));
    h = Math.max(20, Math.min(h, imgH));
    x = Math.max(0, Math.min(x, imgW - w));
    y = Math.max(0, Math.min(y, imgH - h));

    cell.x = x;
    cell.y = y;
    cell.w = w;
    cell.h = h;

    state.previewImages[state.selectedCell] = null;
    pushUndo();
    drawOverlay(overlayCanvas);
    updatePreview(resultCanvas, paddingSlider);
    updateCellPanel();
    rebuildCellThumbnail(state.selectedCell, cellThumbnails);
    refreshCellPreview(state.selectedCell, state.sourceFile);
}

cellInputX.addEventListener('change', handleCellInputChange);
cellInputY.addEventListener('change', handleCellInputChange);
cellInputW.addEventListener('change', handleCellInputChange);
cellInputH.addEventListener('change', handleCellInputChange);
```

- [ ] **Step 7: Verify numeric inputs work**

Run: `.venv/bin/python -m chromacut`
Manual test:
1. Load an image, click a cell
2. Selected Cell section appears with correct X/Y/W/H values
3. Change X value, press Enter — cell moves on overlay, preview updates
4. Cmd+Z undoes the change
5. Click empty area — section hides
6. Drag a cell — inputs update live during drag

- [ ] **Step 8: Commit**

```bash
git add src/chromacut/static/js/app.js src/chromacut/static/js/interaction.js
git commit -m "feat(ui): wire selected cell panel with numeric inputs and undo integration"
```

---

### Task 5: Aspect Ratio Lock

**Files:**
- Modify: `src/chromacut/static/js/app.js`
- Modify: `src/chromacut/static/js/interaction.js`

Wire the aspect lock toggle button and enforce ratio during resize drag.

- [ ] **Step 1: Wire aspect lock toggle in app.js**

In `app.js`, add after the numeric input change handlers:

```js
// ---- Aspect ratio lock toggle ----
btnAspectLock.addEventListener('click', () => {
    state.aspectLocked = !state.aspectLocked;
    btnAspectLock.classList.toggle('active', state.aspectLocked);
});
```

- [ ] **Step 2: Enforce aspect ratio in handleDragMove**

In `interaction.js`, modify the `handleDragMove` function. Replace the `else if (mode === 'resize')` block:

```js
    } else if (mode === 'resize') {
        let newX = startRect.x;
        let newY = startRect.y;
        let newW = startRect.w;
        let newH = startRect.h;

        if (handle.includes('w')) { newX = Math.round(startRect.x + dx); newW = Math.round(startRect.w - dx); }
        if (handle.includes('e')) { newW = Math.round(startRect.w + dx); }
        if (handle.includes('n')) { newY = Math.round(startRect.y + dy); newH = Math.round(startRect.h - dy); }
        if (handle.includes('s')) { newH = Math.round(startRect.h + dy); }

        // Aspect ratio lock
        if (state.aspectLocked) {
            const ratio = startRect.w / startRect.h;
            const isCorner = (handle === 'nw' || handle === 'ne' || handle === 'se' || handle === 'sw');
            if (isCorner) {
                // Use axis with larger delta
                if (Math.abs(dx) >= Math.abs(dy)) {
                    newH = Math.round(newW / ratio);
                } else {
                    newW = Math.round(newH * ratio);
                }
            } else if (handle === 'n' || handle === 's') {
                newW = Math.round(newH * ratio);
            } else {
                newH = Math.round(newW / ratio);
            }
            // Recompute origin for handles that move top/left
            if (handle.includes('w')) { newX = startRect.x + startRect.w - newW; }
            if (handle.includes('n')) { newY = startRect.y + startRect.h - newH; }
        }

        if (newW < MIN_CELL_DIM) {
            if (handle.includes('w')) newX = startRect.x + startRect.w - MIN_CELL_DIM;
            newW = MIN_CELL_DIM;
            if (state.aspectLocked) newH = Math.round(newW / (startRect.w / startRect.h));
        }
        if (newH < MIN_CELL_DIM) {
            if (handle.includes('n')) newY = startRect.y + startRect.h - MIN_CELL_DIM;
            newH = MIN_CELL_DIM;
            if (state.aspectLocked) newW = Math.round(newH * (startRect.w / startRect.h));
        }

        cell.x = newX;
        cell.y = newY;
        cell.w = newW;
        cell.h = newH;
        clampResize(cell);
    }
```

- [ ] **Step 3: Verify aspect lock works**

Run: `.venv/bin/python -m chromacut`
Manual test:
1. Load image, select a cell
2. Click the lock button — it highlights green
3. Drag a corner handle — cell resizes proportionally
4. Drag an edge handle — maintains ratio
5. Click lock again to disable — free resize works as before
6. With lock on, change W in numeric input — H auto-adjusts

- [ ] **Step 4: Commit**

```bash
git add src/chromacut/static/js/app.js src/chromacut/static/js/interaction.js
git commit -m "feat(ui): add aspect ratio lock for resize drag and numeric inputs"
```

---

### Task 6: Reset Selected Button

**Files:**
- Modify: `src/chromacut/static/js/app.js`

Wire the "Reset selected" button.

- [ ] **Step 1: Add reset selected handler**

In `app.js`, add after the aspect lock toggle handler:

```js
// ---- Reset selected cell ----
btnResetSelected.addEventListener('click', () => {
    if (state.selectedCell < 0 || !state.analysisData) return;
    const orig = state.analysisData.cells[state.selectedCell];
    if (!orig) return;

    const cell = state.editedCells[state.selectedCell];
    cell.x = orig.x;
    cell.y = orig.y;
    cell.w = orig.w;
    cell.h = orig.h;

    state.previewImages[state.selectedCell] = null;
    pushUndo();
    drawOverlay(overlayCanvas);
    updatePreview(resultCanvas, paddingSlider);
    updateCellPanel();
    rebuildCellThumbnail(state.selectedCell, cellThumbnails);
    refreshCellPreview(state.selectedCell, state.sourceFile);
});
```

- [ ] **Step 2: Verify reset selected works**

Run: `.venv/bin/python -m chromacut`
Manual test:
1. Load image, select cell, drag it somewhere
2. Click "Reset selected" — cell snaps back to auto-detected position
3. Cmd+Z — cell goes back to the dragged position
4. Inputs update to original values

- [ ] **Step 3: Commit**

```bash
git add src/chromacut/static/js/app.js
git commit -m "feat(ui): add reset selected cell button with undo support"
```

---

### Task 7: Cell Exclusion — Core Logic + Overlay

**Files:**
- Modify: `src/chromacut/static/js/interaction.js`
- Modify: `src/chromacut/static/js/overlay.js`

Add Delete/Backspace toggle for cell exclusion and update overlay rendering.

- [ ] **Step 1: Add exclusion toggle in interaction.js keydown handler**

In the keydown handler inside `setupInteraction`, add this block after the undo/redo handler and before the Space handler:

```js
// Delete/Backspace: toggle cell exclusion
if ((e.code === 'Delete' || e.code === 'Backspace') && state.selectedCell >= 0) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    if (state.excludedCells.has(state.selectedCell)) {
        state.excludedCells.delete(state.selectedCell);
    } else {
        state.excludedCells.add(state.selectedCell);
    }
    pushUndo();
    drawOverlay(overlayCanvas);
    updatePreview(resultCanvas, paddingSlider);
    if (updateCellPanel) updateCellPanel();
    return;
}
```

- [ ] **Step 2: Update drawOverlay for excluded cells**

In `overlay.js`, import `state` is already done. Modify the `editedCells.forEach` loop inside `drawOverlay` to handle excluded cells:

Replace the entire loop body:

```js
    editedCells.forEach((cell, i) => {
        const x = cell.x * scaleX;
        const y = cell.y * scaleY;
        const w = cell.w * scaleX;
        const h = cell.h * scaleY;
        const excluded = state.excludedCells.has(i);

        if (i === selectedCell) {
            ctx.strokeStyle = excluded ? '#FF2D9B66' : '#FF2D9B';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
        } else if (i === hoveredCell) {
            ctx.strokeStyle = excluded ? '#FF2D9B44' : '#FF2D9BCC';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
        } else {
            ctx.strokeStyle = excluded ? '#FF2D9B33' : '#FF2D9B88';
            ctx.lineWidth = 1;
            ctx.setLineDash([6, 3]);
        }
        ctx.strokeRect(x, y, w, h);

        ctx.setLineDash([]);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.font = '11px "DM Mono", monospace';
        const label = excluded ? `${i + 1}x` : `${i + 1}`;
        ctx.fillText(label, x + 4, y + 14);
    });
```

- [ ] **Step 3: Verify exclusion toggle and overlay**

Run: `.venv/bin/python -m chromacut`
Manual test:
1. Load image with multiple cells, select cell 2
2. Press Delete — cell 2 border dims, label shows "2x"
3. Press Delete again — cell 2 returns to normal
4. Cmd+Z — exclusion is undone
5. Handles still appear on selected excluded cell

- [ ] **Step 4: Commit**

```bash
git add src/chromacut/static/js/interaction.js src/chromacut/static/js/overlay.js
git commit -m "feat(ui): add cell exclusion toggle with overlay rendering"
```

---

### Task 8: Cell Exclusion — Thumbnails, Names, Export

**Files:**
- Modify: `src/chromacut/static/js/app.js`
- Modify: `src/chromacut/static/js/export.js`

Update thumbnails, name fields, and export to respect excluded state.

- [ ] **Step 1: Update buildCellThumbnails for exclusion**

In `app.js`, in the `buildCellThumbnails` function, add the excluded class after creating the thumb element. Change:

```js
thumb.className = 'cell-thumb' + (i === state.selectedCell ? ' active' : '');
```

to:

```js
thumb.className = 'cell-thumb'
    + (i === state.selectedCell ? ' active' : '')
    + (state.excludedCells.has(i) ? ' excluded' : '');
```

- [ ] **Step 2: Update buildNameFields for exclusion**

In `app.js`, in the `buildNameFields` function, add excluded styling. After creating the row:

```js
row.className = 'name-row';
```

change to:

```js
const excluded = state.excludedCells.has(i);
row.className = 'name-row' + (excluded ? ' excluded' : '');
```

And after creating the input, add:

```js
if (excluded) {
    input.tabIndex = -1;
}
```

- [ ] **Step 3: Rebuild thumbnails and names on exclusion toggle**

In `interaction.js`, in the Delete/Backspace handler (from Task 7 Step 1), the overlay and panel are already updated. We need to also rebuild thumbnails and name fields. But `buildCellThumbnails` and `buildNameFields` are in `app.js` and not exported.

Instead of exporting them, add a callback. Extend the DOM bag passed to `setupInteraction` in `app.js`:

```js
setupInteraction({
    overlayCanvas,
    resultCanvas,
    paddingSlider,
    cellThumbnails,
    beforeAfterBadge,
    updateCellPanel,
    rebuildUI: () => { buildCellThumbnails(); buildNameFields(); },
});
```

In `interaction.js`, destructure `rebuildUI` in `setupInteraction`:

```js
const { overlayCanvas, resultCanvas, paddingSlider, cellThumbnails, beforeAfterBadge, updateCellPanel, rebuildUI } = dom;
```

Update the Delete/Backspace handler to call `rebuildUI`:

```js
pushUndo();
drawOverlay(overlayCanvas);
updatePreview(resultCanvas, paddingSlider);
if (updateCellPanel) updateCellPanel();
if (rebuildUI) rebuildUI();
return;
```

- [ ] **Step 4: Update undo/redo handler to rebuild UI**

In `interaction.js`, in the Cmd+Z handler, add `rebuildUI` call after undo/redo:

```js
if (changed) {
    drawOverlay(overlayCanvas);
    updatePreview(resultCanvas, paddingSlider);
    if (updateCellPanel) updateCellPanel();
    if (rebuildUI) rebuildUI();
}
```

- [ ] **Step 5: Filter excluded cells in getSettings**

In `export.js`, modify `getSettings`. Replace the `nameFields.querySelectorAll` loop:

```js
const cells = [];
nameFields.querySelectorAll('input').forEach(input => {
    const idx      = parseInt(input.dataset.index);
    if (state.excludedCells.has(idx)) return;
    const cellData = state.editedCells[idx];
    cells.push({
        index: idx,
        name:  input.value.trim() || `icon-${idx + 1}`,
        x:     cellData?.x || 0,
        y:     cellData?.y || 0,
        w:     cellData?.w || 0,
        h:     cellData?.h || 0,
    });
});
```

- [ ] **Step 6: Update export status message**

In `export.js`, in `doExport`, update the success message. Replace:

```js
exportStatus.textContent = `Exported ${settings.cells.length} icon(s)`;
```

with:

```js
const total = state.editedCells.length;
const exported = settings.cells.length;
exportStatus.textContent = exported < total
    ? `Exported ${exported} of ${total} icon(s)`
    : `Exported ${exported} icon(s)`;
```

- [ ] **Step 7: Verify exclusion end-to-end**

Run: `.venv/bin/python -m chromacut`
Manual test:
1. Load image with 4 cells
2. Select cell 3, press Delete — thumbnail dims with diagonal line, name field dims
3. Click Export — downloads 3 icons, status says "Exported 3 of 4 icon(s)"
4. Cmd+Z — cell 3 is included again, thumbnail and name restore
5. Select excluded cell — EXCLUDED badge appears in preview panel

- [ ] **Step 8: Commit**

```bash
git add src/chromacut/static/js/app.js src/chromacut/static/js/interaction.js src/chromacut/static/js/export.js
git commit -m "feat(ui): add cell exclusion visuals for thumbnails, names, and export"
```

---

### Task 9: Keyboard Shortcuts — Cmd+E, 1-9, [/], Escape

**Files:**
- Modify: `src/chromacut/static/js/interaction.js`

Add remaining keyboard shortcuts (except ? help overlay which is Task 10).

- [ ] **Step 1: Add Cmd+E export shortcut**

In the keydown handler inside `setupInteraction`, add after the undo/redo block:

```js
// Cmd+E: export
if ((e.metaKey || e.ctrlKey) && e.code === 'KeyE') {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    if (state.sourceImage) {
        document.querySelector('#btn-export')?.click();
    }
    return;
}
```

- [ ] **Step 2: Add Escape handler**

Add after the Cmd+E block:

```js
// Escape: close help overlay or deselect
if (e.code === 'Escape') {
    const overlay = document.querySelector('#shortcut-overlay');
    if (overlay && !overlay.classList.contains('hidden')) {
        overlay.classList.add('hidden');
        overlay.classList.remove('visible');
        return;
    }
    if (state.selectedCell >= 0) {
        state.selectedCell = -1;
        drawOverlay(overlayCanvas);
        updatePreview(resultCanvas, paddingSlider);
        if (updateCellPanel) updateCellPanel();
    }
    return;
}
```

- [ ] **Step 3: Add 1-9 cell select**

Add after the Escape block, inside the existing input guard section (after `if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;`):

```js
// 1-9: select cell by number
if (e.code >= 'Digit1' && e.code <= 'Digit9' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const idx = parseInt(e.code.charAt(5)) - 1;
    if (state.sourceImage && idx < state.editedCells.length) {
        state.selectedCell = idx;
        drawOverlay(overlayCanvas);
        updatePreview(resultCanvas, paddingSlider);
        if (updateCellPanel) updateCellPanel();
        document.querySelectorAll('.cell-thumb').forEach((t, i) => {
            t.classList.toggle('active', i === state.selectedCell);
        });
    }
    return;
}
```

- [ ] **Step 4: Add [/] padding adjust**

Add after the 1-9 block:

```js
// [ / ]: adjust padding
if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
    if (!state.sourceImage) return;
    const slider = paddingSlider;
    const delta = e.code === 'BracketLeft' ? -1 : 1;
    const newVal = Math.max(
        parseInt(slider.min),
        Math.min(parseInt(slider.max), parseInt(slider.value) + delta)
    );
    slider.value = newVal;
    // Update display — find the value label sibling
    const valueLabel = slider.parentElement.querySelector('.mono-value');
    if (valueLabel) valueLabel.textContent = newVal + '%';
    updatePreview(resultCanvas, paddingSlider);
    return;
}
```

- [ ] **Step 5: Verify all shortcuts**

Run: `.venv/bin/python -m chromacut`
Manual test:
1. Load image with multiple cells
2. Press `2` — cell 2 selects
3. Press `[` — padding decreases, preview updates
4. Press `]` — padding increases
5. Cmd+E — export triggers
6. Press Escape — cell deselects, panel hides
7. All shortcuts are ignored when typing in a name field

- [ ] **Step 6: Commit**

```bash
git add src/chromacut/static/js/interaction.js
git commit -m "feat(ui): add keyboard shortcuts for export, cell select, padding, escape"
```

---

### Task 10: Help Overlay

**Files:**
- Modify: `src/chromacut/static/js/interaction.js`

Wire the `?` toggle and backdrop click-to-close for the shortcut help overlay.

- [ ] **Step 1: Add ? toggle and backdrop close**

In the keydown handler inside `setupInteraction`, add at the very top (before any input guard, since `?` works always):

```js
// ?: toggle shortcut help overlay
if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) {
    const overlay = document.querySelector('#shortcut-overlay');
    if (!overlay) return;
    if (overlay.classList.contains('hidden')) {
        overlay.classList.remove('hidden');
        // Trigger reflow for transition
        overlay.offsetHeight;
        overlay.classList.add('visible');
    } else {
        overlay.classList.remove('visible');
        overlay.classList.add('hidden');
    }
    return;
}
```

- [ ] **Step 2: Add backdrop click-to-close**

In `setupInteraction`, add after the keyboard handlers (at the end of the function):

```js
// Shortcut overlay: click backdrop to close
const shortcutOverlay = document.querySelector('#shortcut-overlay');
if (shortcutOverlay) {
    shortcutOverlay.addEventListener('click', (e) => {
        if (e.target === shortcutOverlay) {
            shortcutOverlay.classList.remove('visible');
            shortcutOverlay.classList.add('hidden');
        }
    });
}
```

- [ ] **Step 3: Verify help overlay**

Run: `.venv/bin/python -m chromacut`
Manual test:
1. Press `?` — overlay fades in with shortcut table
2. Press `?` again — overlay closes
3. Press `?`, then `Escape` — overlay closes
4. Press `?`, click backdrop — overlay closes
5. Click inside the card — overlay stays open
6. `?` works even when focus is in an input field

- [ ] **Step 4: Commit**

```bash
git add src/chromacut/static/js/interaction.js
git commit -m "feat(ui): add keyboard shortcut help overlay with ? toggle"
```

---

### Task 11: Final Integration + Existing Tests

**Files:**
- Modify: `src/chromacut/static/js/app.js` (minor)

Run the existing test suite to ensure no regressions, do a final manual integration check.

- [ ] **Step 1: Run existing tests**

Run: `.venv/bin/python -m pytest -v`
Expected: All 54 tests pass (backend only — no frontend test changes in this batch).

- [ ] **Step 2: Full manual integration check**

Run: `.venv/bin/python -m chromacut`
Checklist:
1. Load image — grid detection works, cells appear
2. Click cell — Selected Cell panel appears with correct X/Y/W/H
3. Change X in input — cell moves, preview updates
4. Enable aspect lock — resize drag maintains ratio
5. Reset selected — cell snaps back to auto-detect
6. Drag cell, Cmd+Z — undoes drag, panel and overlay update
7. Cmd+Shift+Z — redo works
8. Multiple edits, undo multiple times, then edit — redo future is discarded
9. Press Delete on cell — excluded visuals on overlay, thumbnail, name field
10. Export with excluded cell — correct count, excluded cell not in download
11. Press `1`-`9` — selects cell, press `[`/`]` — adjusts padding
12. Press `?` — help overlay, Escape closes it
13. Cmd+E — triggers export
14. Escape (no overlay) — deselects cell
15. All shortcuts ignored in name input fields
16. Reset boxes — undoable, resets exclusions too
17. Paste new image — full reset (undo stack clears)

- [ ] **Step 3: Commit if any final adjustments were needed**

```bash
git add -u src/chromacut/static/
git commit -m "chore(ui): batch 2 final integration fixes"
```

Only create this commit if changes were made. Skip if integration check passed cleanly.
