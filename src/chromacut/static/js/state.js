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
 * Return a deep copy of editedCells for undo snapshots (Batch 2).
 * @returns {Array}
 */
export function snapshotCells() {
    return state.editedCells.map(c => ({ ...c }));
}

/**
 * Replace editedCells from a snapshot (Batch 2 redo/undo).
 * @param {Array} snapshot
 */
export function restoreCells(snapshot) {
    state.editedCells = snapshot.map(c => ({ ...c }));
}
