/* ============================================================
   state.js — shared application state
   All modules import { state } and mutate it directly.
   Only editedCells needs undo support (Batch 2 hook via
   snapshotCells / restoreCells).
   ============================================================ */

export const state = {
    sourceFile: null,       // File object from drop/paste/input
    sourceImage: null,      // HTMLImageElement
    analysisData: null,     // response from /api/analyze
    selectedCell: 0,        // index of selected cell (-1 = none)
    hoveredCell: -1,        // index of hovered cell
    previewImages: [],      // HTMLImageElements from backend despill
    editedCells: [],        // deep copy of analysisData.cells, mutable
    activeDrag: null,       // { mode, handle, startPointer, startRect, cellIndex }
    lastSourceCrop: null,   // { x, y, w, h } for before/after toggle
    excludedCells: new Set(),   // cell indices excluded from export
    aspectLocked: false,        // aspect ratio lock for resize
    undoStack: [],              // timeline of snapshots
    undoIndex: -1,              // current position in undoStack
};

/** Reset all state to initial values (called on new image load). */
export function resetState() {
    state.sourceFile = null;
    state.sourceImage = null;
    state.analysisData = null;
    state.selectedCell = 0;
    state.hoveredCell = -1;
    state.previewImages = [];
    state.editedCells = [];
    state.activeDrag = null;
    state.lastSourceCrop = null;
    state.excludedCells = new Set();
    state.aspectLocked = false;
    state.undoStack = [];
    state.undoIndex = -1;
}

/**
 * Initialise editedCells and previewImages from fresh analysisData.
 * Called after /api/analyze returns and after Reset boxes.
 * @param {object} analysisData - the raw API response
 */
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
}

/**
 * Return a snapshot of editedCells and excludedCells for undo.
 * @returns {{ cells: Array, excludedCells: Set }}
 */
export function snapshotCells() {
    return {
        cells: state.editedCells.map(c => ({ ...c })),
        excludedCells: new Set(state.excludedCells),
    };
}

/**
 * Replace editedCells and excludedCells from a snapshot.
 * @param {{ cells: Array, excludedCells: Set }} snapshot
 */
export function restoreCells(snapshot) {
    state.editedCells = snapshot.cells.map(c => ({ ...c }));
    state.excludedCells = new Set(snapshot.excludedCells);
}

const UNDO_CAP = 50;

/**
 * Push the current cell state onto the undo stack.
 * Truncates any redo history beyond the current index.
 */
export function pushUndo() {
    if (state.undoIndex < state.undoStack.length - 1) {
        state.undoStack.length = state.undoIndex + 1;
    }
    state.undoStack.push(snapshotCells());
    state.undoIndex = state.undoStack.length - 1;
    if (state.undoStack.length > UNDO_CAP) {
        state.undoStack.shift();
        state.undoIndex--;
    }
}

/**
 * Step backward in the undo stack.
 * @returns {boolean} true if undo was applied, false if at the beginning
 */
export function undo() {
    if (state.undoIndex <= 0) return false;
    state.undoIndex--;
    restoreCells(state.undoStack[state.undoIndex]);
    return true;
}

/**
 * Step forward in the undo stack.
 * @returns {boolean} true if redo was applied, false if at the end
 */
export function redo() {
    if (state.undoIndex >= state.undoStack.length - 1) return false;
    state.undoIndex++;
    restoreCells(state.undoStack[state.undoIndex]);
    return true;
}
