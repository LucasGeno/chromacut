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

// ---- Theme-aware overlay colors ----
// Canvas can't read CSS vars, so resolve them from computed styles each draw.
// The selection box uses --select (cool editor color); snap lines use --success
// (the chroma/green domain cue). Falls back to the dark-theme values.
function overlayColors() {
    const cs = getComputedStyle(document.documentElement);
    const sel = (cs.getPropertyValue('--select') || '#6aa9ff').trim();
    const snap = (cs.getPropertyValue('--success') || '#34d399').trim();
    const handleBorder = (cs.getPropertyValue('--bg-secondary') || '#0e0e15').trim();
    // color-mix lets us derive the alpha variants from the themed base color.
    const a = (pct) => `color-mix(in srgb, ${sel} ${pct}%, transparent)`;
    return {
        sel,
        selStrong: sel,
        selHover: a(80),
        selDim: a(53),
        selExcl: a(40),
        selExclHover: a(27),
        selExclDim: a(20),
        fillHover: a(7),
        fillExcl: a(3),
        handleFill: sel,
        handleBorder,
        snap: `color-mix(in srgb, ${snap} 40%, transparent)`,
    };
}

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
    const C = overlayColors();

    editedCells.forEach((cell, i) => {
        const x = cell.x * scaleX;
        const y = cell.y * scaleY;
        const w = cell.w * scaleX;
        const h = cell.h * scaleY;
        const excluded = state.excludedCells.has(i);

        if (i === selectedCell) {
            ctx.strokeStyle = excluded ? C.selDim : C.selStrong;
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
        } else if (i === hoveredCell) {
            ctx.strokeStyle = excluded ? C.selExclHover : C.selHover;
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
        } else {
            ctx.strokeStyle = excluded ? C.selExclDim : C.selDim;
            ctx.lineWidth = 1;
            ctx.setLineDash([6, 3]);
        }

        // Hover fill highlight
        if (i === hoveredCell && i !== selectedCell) {
            ctx.fillStyle = excluded ? C.fillExcl : C.fillHover;
            ctx.fillRect(x, y, w, h);
        }

        ctx.strokeRect(x, y, w, h);

        ctx.setLineDash([]);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.font = '11px "JetBrains Mono", monospace';
        const label = excluded ? `${i + 1}x` : `${i + 1}`;
        ctx.fillText(label, x + 4, y + 14);
    });

    // Draw handles on selected cell
    if (selectedCell >= 0 && selectedCell < editedCells.length) {
        const handles = getHandlePositions(editedCells[selectedCell]);
        const handleSize = 6;
        ctx.fillStyle = C.handleFill;
        ctx.strokeStyle = C.handleBorder;
        ctx.lineWidth = 1;
        ctx.setLineDash([]);

        for (const name of HANDLE_NAMES) {
            const hp = handles[name];
            const cp = imageToCanvas(hp.x, hp.y, overlayCanvas);
            ctx.fillRect(cp.x - handleSize / 2, cp.y - handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(cp.x - handleSize / 2, cp.y - handleSize / 2, handleSize, handleSize);
        }
    }

    // Draw active snap lines
    if (state.activeSnapLines.length > 0) {
        ctx.strokeStyle = C.snap;
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
}
