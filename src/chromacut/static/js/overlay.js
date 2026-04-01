/* ============================================================
   overlay.js — overlay canvas rendering, coordinate helpers,
   hit-testing, handle geometry.
   ============================================================ */

import { state } from './state.js';

// ---- Constants ----

export const HANDLE_NAMES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export const CURSOR_MAP = {
    nw: 'nwse-resize', se: 'nwse-resize',
    ne: 'nesw-resize', sw: 'nesw-resize',
    n:  'ns-resize',   s:  'ns-resize',
    e:  'ew-resize',   w:  'ew-resize',
};

const HANDLE_HIT_PX = 12;

// ---- Coordinate conversion ----

/**
 * Convert a point in overlay canvas pixels to source image pixels.
 * @param {number} canvasX
 * @param {number} canvasY
 * @param {HTMLCanvasElement} overlayCanvas
 * @returns {{ x: number, y: number }}
 */
export function canvasToImage(canvasX, canvasY, overlayCanvas) {
    return {
        x: canvasX * state.sourceImage.width  / overlayCanvas.width,
        y: canvasY * state.sourceImage.height / overlayCanvas.height,
    };
}

/**
 * Convert a point in source image pixels to overlay canvas pixels.
 * @param {number} imgX
 * @param {number} imgY
 * @param {HTMLCanvasElement} overlayCanvas
 * @returns {{ x: number, y: number }}
 */
export function imageToCanvas(imgX, imgY, overlayCanvas) {
    return {
        x: imgX * overlayCanvas.width  / state.sourceImage.width,
        y: imgY * overlayCanvas.height / state.sourceImage.height,
    };
}

// ---- Handle geometry ----

/**
 * Return the 8 handle positions (in source image pixels) for a cell.
 * @param {{ x: number, y: number, w: number, h: number }} cell
 * @returns {object}
 */
export function getHandlePositions(cell) {
    const { x, y, w, h } = cell;
    return {
        nw: { x: x,         y: y         },
        n:  { x: x + w / 2, y: y         },
        ne: { x: x + w,     y: y         },
        e:  { x: x + w,     y: y + h / 2 },
        se: { x: x + w,     y: y + h     },
        s:  { x: x + w / 2, y: y + h     },
        sw: { x: x,         y: y + h     },
        w:  { x: x,         y: y + h / 2 },
    };
}

// ---- Hit testing ----

/**
 * Test what is under the pointer at (canvasX, canvasY).
 * Returns { type: 'handle'|'cell'|'none', cellIndex, handle }.
 * @param {number} canvasX
 * @param {number} canvasY
 * @param {HTMLCanvasElement} overlayCanvas
 * @returns {{ type: string, cellIndex: number, handle: string|null }}
 */
export function hitTest(canvasX, canvasY, overlayCanvas) {
    const img = canvasToImage(canvasX, canvasY, overlayCanvas);
    const hitZone = HANDLE_HIT_PX * state.sourceImage.width / overlayCanvas.width;

    // Check handles of selected cell first
    const { selectedCell, editedCells } = state;
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

// ---- Overlay rendering ----

/**
 * Redraw the overlay canvas: all cell boxes, labels, handles.
 * @param {HTMLCanvasElement} overlayCanvas
 */
export function drawOverlay(overlayCanvas) {
    if (!state.editedCells.length || !state.sourceImage) return;
    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    const scaleX = overlayCanvas.width  / state.sourceImage.width;
    const scaleY = overlayCanvas.height / state.sourceImage.height;

    const { selectedCell, hoveredCell, editedCells } = state;

    editedCells.forEach((cell, i) => {
        const x = cell.x * scaleX;
        const y = cell.y * scaleY;
        const w = cell.w * scaleX;
        const h = cell.h * scaleY;

        if (i === selectedCell) {
            ctx.strokeStyle = '#FF2D9B';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
        } else if (i === hoveredCell) {
            ctx.strokeStyle = '#FF2D9BCC';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
        } else {
            ctx.strokeStyle = '#FF2D9B88';
            ctx.lineWidth = 1;
            ctx.setLineDash([6, 3]);
        }
        ctx.strokeRect(x, y, w, h);

        ctx.setLineDash([]);
        ctx.fillStyle = i === selectedCell ? '#FF2D9B' : (i === hoveredCell ? '#FF2D9BCC' : '#FF2D9B88');
        ctx.font = '11px "DM Mono", monospace';
        ctx.fillText(i + 1, x + 4, y + 14);
    });

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
            const cp = imageToCanvas(hp.x, hp.y, overlayCanvas);
            ctx.fillRect(cp.x - handleSize / 2, cp.y - handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(cp.x - handleSize / 2, cp.y - handleSize / 2, handleSize, handleSize);
        }
    }
}
