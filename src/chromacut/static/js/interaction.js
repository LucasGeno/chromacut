/* ============================================================
   interaction.js — pointer events, drag (move + resize),
   arrow-key nudge, commitDrag, refreshCellPreview,
   rebuildCellThumbnail.

   Entry point: setupInteraction(dom) — called once by app.js.
   dom = { overlayCanvas, resultCanvas, paddingSlider,
           cellThumbnails, beforeAfterBadge }
   ============================================================ */

import { state, pushUndo, undo, redo } from './state.js';
import { canvasToImage, hitTest, CURSOR_MAP, HANDLE_NAMES } from './overlay.js';
import { updatePreview } from './preview.js';
import { drawOverlay } from './overlay.js';

// ---- Constants ----

const MIN_CELL_DIM = 20;

// ---- Clamp helpers ----

function clampMove(cell) {
    cell.x = Math.max(0, Math.min(cell.x, state.sourceImage.width  - cell.w));
    cell.y = Math.max(0, Math.min(cell.y, state.sourceImage.height - cell.h));
}

function clampResize(cell) {
    cell.x = Math.max(0, Math.min(cell.x, state.sourceImage.width  - MIN_CELL_DIM));
    cell.y = Math.max(0, Math.min(cell.y, state.sourceImage.height - MIN_CELL_DIM));
    cell.w = Math.max(MIN_CELL_DIM, Math.min(cell.w, state.sourceImage.width  - cell.x));
    cell.h = Math.max(MIN_CELL_DIM, Math.min(cell.h, state.sourceImage.height - cell.y));
}

// ---- Drag move/resize ----

function handleDragMove(canvasX, canvasY, overlayCanvas) {
    if (!state.activeDrag) return;
    const img = canvasToImage(canvasX, canvasY, overlayCanvas);
    const { mode, handle, startPointer, startRect, cellIndex } = state.activeDrag;
    const cell = state.editedCells[cellIndex];
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

        if (handle.includes('w')) { newX = Math.round(startRect.x + dx); newW = Math.round(startRect.w - dx); }
        if (handle.includes('e')) { newW = Math.round(startRect.w + dx); }
        if (handle.includes('n')) { newY = Math.round(startRect.y + dy); newH = Math.round(startRect.h - dy); }
        if (handle.includes('s')) { newH = Math.round(startRect.h + dy); }

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

    state.previewImages[cellIndex] = null;
    drawOverlay(overlayCanvas);
    updatePreview(_interactionDom.resultCanvas, _interactionDom.paddingSlider);
    if (_interactionDom.updateCellPanel) _interactionDom.updateCellPanel();
}

// ---- Preview refresh after drag/nudge ----

let _previewAbortController = null;

/**
 * Fetch a fresh backend preview for one cell and store it in state.previewImages.
 * @param {number} cellIndex
 * @param {File} sourceFile
 */
export async function refreshCellPreview(cellIndex, sourceFile) {
    if (!sourceFile || cellIndex < 0 || cellIndex >= state.editedCells.length) return;

    if (_previewAbortController) _previewAbortController.abort();
    _previewAbortController = new AbortController();

    const cell = state.editedCells[cellIndex];
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

        if (state.selectedCell !== cellIndex) return;

        const img = new Image();
        img.onload = () => {
            state.previewImages[cellIndex] = img;
            // Caller must supply dom refs — use module-level dom set by setupInteraction
            updatePreview(_interactionDom.resultCanvas, _interactionDom.paddingSlider);
        };
        img.src = data.preview;
    } catch (err) {
        if (err.name !== 'AbortError') console.warn('Preview refresh failed:', err);
    }
}

/**
 * Redraw a single cell thumbnail canvas from the current sourceImage crop.
 * @param {number} cellIndex
 * @param {HTMLElement} cellThumbnails - container element
 */
export function rebuildCellThumbnail(cellIndex, cellThumbnails) {
    const thumbs = cellThumbnails.querySelectorAll('.cell-thumb');
    if (cellIndex >= thumbs.length) return;
    const thumb = thumbs[cellIndex];
    const cell = state.editedCells[cellIndex];
    const canvas = thumb.querySelector('canvas');
    if (!canvas || !state.sourceImage) return;

    const size = 68;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const scale = Math.min(size / cell.w, size / cell.h);
    const sw = cell.w * scale;
    const sh = cell.h * scale;
    ctx.drawImage(
        state.sourceImage,
        cell.x, cell.y, cell.w, cell.h,
        (size - sw) / 2, (size - sh) / 2, sw, sh,
    );
    // Import quickGreenRemove from preview.js to avoid duplication
    import('./preview.js').then(m => m.quickGreenRemove(ctx, size, size));
}

// ---- Module-level dom store (set by setupInteraction) ----
// Holds refs needed by async callbacks (refreshCellPreview, handleDragMove).

let _interactionDom = null;

/**
 * Wire all pointer and keyboard interaction for the overlay canvas.
 * Call once after DOM is ready.
 *
 * @param {{
 *   overlayCanvas: HTMLCanvasElement,
 *   resultCanvas: HTMLCanvasElement,
 *   paddingSlider: HTMLInputElement,
 *   cellThumbnails: HTMLElement,
 *   beforeAfterBadge: HTMLElement,
 *   updateCellPanel: Function,
 * }} dom
 */
export function setupInteraction(dom) {
    _interactionDom = dom;
    const { overlayCanvas, resultCanvas, paddingSlider, cellThumbnails, beforeAfterBadge, updateCellPanel } = dom;

    // ---- Nudge debounce ----
    let _nudgeDebounce = null;

    // ---- Before/after toggle state ----
    let _showingOriginal = false;

    // ---- Pointer: down ----
    overlayCanvas.addEventListener('pointerdown', (e) => {
        if (!state.sourceImage || !state.editedCells.length) return;
        const rect = overlayCanvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const hit = hitTest(cx, cy, overlayCanvas);

        if (hit.type === 'none') {
            if (state.selectedCell >= 0) {
                state.selectedCell = -1;
                drawOverlay(overlayCanvas);
                updateCellPanel();
            }
            return;
        }

        state.selectedCell = hit.cellIndex;
        drawOverlay(overlayCanvas);
        updatePreview(resultCanvas, paddingSlider);
        updateCellPanel();

        document.querySelectorAll('.cell-thumb').forEach((t, i) => {
            t.classList.toggle('active', i === state.selectedCell);
        });

        if (hit.type === 'handle') {
            const cell = state.editedCells[state.selectedCell];
            state.activeDrag = {
                mode: 'resize',
                handle: hit.handle,
                startPointer: canvasToImage(cx, cy, overlayCanvas),
                startRect: { x: cell.x, y: cell.y, w: cell.w, h: cell.h },
                cellIndex: state.selectedCell,
            };
            overlayCanvas.setPointerCapture(e.pointerId);
        } else if (hit.type === 'cell' && hit.cellIndex === state.selectedCell) {
            const cell = state.editedCells[state.selectedCell];
            state.activeDrag = {
                mode: 'move',
                handle: null,
                startPointer: canvasToImage(cx, cy, overlayCanvas),
                startRect: { x: cell.x, y: cell.y, w: cell.w, h: cell.h },
                cellIndex: state.selectedCell,
            };
            overlayCanvas.setPointerCapture(e.pointerId);
        }
    });

    // ---- Pointer: move ----
    overlayCanvas.addEventListener('pointermove', (e) => {
        if (!state.sourceImage || !state.editedCells.length) return;
        const rect = overlayCanvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        if (state.activeDrag) {
            handleDragMove(cx, cy, overlayCanvas);
            return;
        }

        const hit = hitTest(cx, cy, overlayCanvas);
        if (hit.type === 'handle') {
            overlayCanvas.style.cursor = CURSOR_MAP[hit.handle] || 'crosshair';
        } else if (hit.type === 'cell') {
            overlayCanvas.style.cursor = 'move';
        } else {
            overlayCanvas.style.cursor = 'crosshair';
        }

        const newHovered = hit.type !== 'none' ? hit.cellIndex : -1;
        if (newHovered !== state.hoveredCell) {
            state.hoveredCell = newHovered;
            drawOverlay(overlayCanvas);
        }
    });

    // ---- Pointer: up / cancel / lost capture ----
    function commitDrag() {
        const cellIndex = state.activeDrag?.cellIndex;
        state.activeDrag = null;

        if (cellIndex != null && cellIndex >= 0) {
            refreshCellPreview(cellIndex, state.sourceFile);
            rebuildCellThumbnail(cellIndex, cellThumbnails);
            pushUndo();
        }
    }

    overlayCanvas.addEventListener('pointerup',          () => { if (state.activeDrag) commitDrag(); });
    overlayCanvas.addEventListener('pointercancel',      () => { if (state.activeDrag) commitDrag(); });
    overlayCanvas.addEventListener('lostpointercapture', () => { if (state.activeDrag) commitDrag(); });

    // ---- Keyboard: Space (before/after) + arrows (nudge) ----
    window.addEventListener('keydown', (e) => {
        // Undo/redo (Cmd+Z / Cmd+Shift+Z)
        if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ') {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            e.preventDefault();
            const changed = e.shiftKey ? redo() : undo();
            if (changed) {
                drawOverlay(overlayCanvas);
                updatePreview(resultCanvas, paddingSlider);
                if (updateCellPanel) updateCellPanel();
            }
            return;
        }

        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // Before/after toggle (Space)
        if (e.code === 'Space' && !e.repeat && state.sourceImage && state.analysisData && state.lastSourceCrop) {
            e.preventDefault();
            _showingOriginal = true;
            beforeAfterBadge.classList.remove('hidden');
            // Import lazily to avoid circular; preview.js exports showOriginalInPreview
            import('./preview.js').then(m => m.showOriginalInPreview(resultCanvas, paddingSlider));
            return;
        }

        // Arrow key nudge
        if (state.selectedCell >= 0 && state.selectedCell < state.editedCells.length && !state.activeDrag) {
            const step = e.shiftKey ? 10 : 1;
            const cell = state.editedCells[state.selectedCell];
            let nudged = false;

            if (e.code === 'ArrowLeft')  { cell.x -= step; nudged = true; }
            if (e.code === 'ArrowRight') { cell.x += step; nudged = true; }
            if (e.code === 'ArrowUp')    { cell.y -= step; nudged = true; }
            if (e.code === 'ArrowDown')  { cell.y += step; nudged = true; }

            if (nudged) {
                e.preventDefault();
                clampMove(cell);
                state.previewImages[state.selectedCell] = null;
                drawOverlay(overlayCanvas);
                updatePreview(resultCanvas, paddingSlider);
                if (updateCellPanel) updateCellPanel();

                const nudgedIndex = state.selectedCell;
                clearTimeout(_nudgeDebounce);
                _nudgeDebounce = setTimeout(() => {
                    refreshCellPreview(nudgedIndex, state.sourceFile);
                    rebuildCellThumbnail(nudgedIndex, cellThumbnails);
                    pushUndo();
                }, 300);
            }
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space' && _showingOriginal) {
            e.preventDefault();
            _showingOriginal = false;
            beforeAfterBadge.classList.add('hidden');
            updatePreview(resultCanvas, paddingSlider);
        }
    });
}
