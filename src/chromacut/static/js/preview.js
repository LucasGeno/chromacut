/* ============================================================
   preview.js — result canvas rendering, before/after,
   quick client-side green removal.
   ============================================================ */

import { state } from './state.js';

// ---- Quick client-side green removal ----

/**
 * Apply a fast chroma-key removal directly on a canvas context.
 * Uses state.analysisData.key_color if available, otherwise assumes green.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w - canvas width
 * @param {number} h - canvas height
 */
export function quickGreenRemove(ctx, w, h) {
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    let kr = 0, kg = 255, kb = 0;
    if (state.analysisData && state.analysisData.key_color) {
        [kr, kg, kb] = state.analysisData.key_color;
    }

    for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const dr = r - kr, dg = g - kg, db = b - kb;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);

        if (dist < 80) {
            d[i + 3] = 0;
        } else if (dist < 140) {
            const alpha = Math.round(((dist - 80) / 60) * 255);
            d[i + 3] = Math.min(d[i + 3], alpha);
            if (kg > 200) {
                d[i + 1] = Math.min(g, Math.max(r, b));
            }
        } else {
            if (kg > 200 && g > Math.max(r, b) + 20) {
                d[i + 1] = Math.max(r, b);
            }
        }
    }

    ctx.putImageData(imgData, 0, 0);
}

// ---- Before/after: show original source crop ----

/**
 * Render the raw (un-keyed) source crop into the result canvas.
 * Called while Space is held.
 * @param {HTMLCanvasElement} resultCanvas
 * @param {HTMLInputElement} paddingSlider
 */
export function showOriginalInPreview(resultCanvas, paddingSlider) {
    if (!state.lastSourceCrop || !state.sourceImage) return;
    const { x, y, w, h } = state.lastSourceCrop;

    const sizeBtn = document.querySelector('[data-setting="output_size"] button.active');
    const outputSize = parseInt(sizeBtn?.dataset.value || '512');
    const paddingPct = parseInt(paddingSlider.value) / 100;

    const panel = resultCanvas.parentElement;
    const displayScale = Math.min(
        (panel.clientWidth  - 8) / outputSize,
        (panel.clientHeight - 8) / outputSize,
        1,
    );
    const displaySize = Math.round(outputSize * displayScale);

    resultCanvas.width  = displaySize;
    resultCanvas.height = displaySize;
    const ctx = resultCanvas.getContext('2d');
    ctx.clearRect(0, 0, displaySize, displaySize);

    const innerSize = outputSize * (1 - paddingPct);
    const scale     = Math.min(innerSize / w, innerSize / h);
    const scaledW   = Math.round(w * scale);
    const scaledH   = Math.round(h * scale);

    const dScale   = displaySize / outputSize;
    const dScaledW = Math.round(scaledW * dScale);
    const dScaledH = Math.round(scaledH * dScale);
    const dx       = Math.round((displaySize - dScaledW) / 2);
    const dy       = Math.round((displaySize - dScaledH) / 2);

    ctx.drawImage(state.sourceImage, x, y, w, h, dx, dy, dScaledW, dScaledH);
}

// ---- Main preview render ----

/**
 * Render the current selected cell into the result canvas.
 * Uses backend preview image if available; falls back to client-side keying.
 * @param {HTMLCanvasElement} resultCanvas
 * @param {HTMLInputElement} paddingSlider
 */
export function updatePreview(resultCanvas, paddingSlider) {
    if (!state.sourceImage || !state.analysisData) return;

    const cellIdx = state.selectedCell >= 0 ? state.selectedCell : 0;
    const cell = state.editedCells[cellIdx] || state.editedCells[0];
    if (!cell) return;

    // Store for before/after
    state.lastSourceCrop = { x: cell.x, y: cell.y, w: cell.w, h: cell.h };

    const paddingPct = parseInt(paddingSlider.value) / 100;
    const sizeBtn    = document.querySelector('[data-setting="output_size"] button.active');
    const outputSize = parseInt(sizeBtn?.dataset.value || '512');
    const styleBtn   = document.querySelector('[data-setting="art_style"] button.active');
    const artStyle   = styleBtn?.dataset.value || 'pixel';

    const panel = resultCanvas.parentElement;
    const displayScale = Math.min(
        (panel.clientWidth  - 8) / outputSize,
        (panel.clientHeight - 8) / outputSize,
        1,
    );
    const displaySize = Math.round(outputSize * displayScale);

    resultCanvas.width  = displaySize;
    resultCanvas.height = displaySize;
    const ctx = resultCanvas.getContext('2d');
    ctx.clearRect(0, 0, displaySize, displaySize);
    ctx.imageSmoothingEnabled = (artStyle !== 'pixel');

    const previewImg = state.previewImages[state.selectedCell];
    if (previewImg && previewImg.complete && previewImg.naturalWidth > 0) {
        // Backend preview is already despilled and tight-cropped
        const pw = previewImg.naturalWidth;
        const ph = previewImg.naturalHeight;

        const innerSize = outputSize * (1 - paddingPct);
        const scale     = Math.min(innerSize / pw, innerSize / ph);
        const scaledW   = Math.round(pw * scale);
        const scaledH   = Math.round(ph * scale);

        const dScale   = displaySize / outputSize;
        const dScaledW = Math.round(scaledW * dScale);
        const dScaledH = Math.round(scaledH * dScale);
        const dx       = Math.round((displaySize - dScaledW) / 2);
        const dy       = Math.round((displaySize - dScaledH) / 2);

        ctx.drawImage(previewImg, 0, 0, pw, ph, dx, dy, dScaledW, dScaledH);
    } else {
        // Fallback: client-side green removal
        const offscreen = document.createElement('canvas');
        offscreen.width  = cell.w;
        offscreen.height = cell.h;
        const offCtx = offscreen.getContext('2d');
        offCtx.drawImage(state.sourceImage, cell.x, cell.y, cell.w, cell.h, 0, 0, cell.w, cell.h);
        quickGreenRemove(offCtx, cell.w, cell.h);

        const imgData = offCtx.getImageData(0, 0, cell.w, cell.h);
        const d = imgData.data;
        let minX = cell.w, minY = cell.h, maxX = 0, maxY = 0;
        for (let py = 0; py < cell.h; py++) {
            for (let px = 0; px < cell.w; px++) {
                if (d[(py * cell.w + px) * 4 + 3] > 10) {
                    if (px < minX) minX = px;
                    if (px > maxX) maxX = px;
                    if (py < minY) minY = py;
                    if (py > maxY) maxY = py;
                }
            }
        }
        if (maxX <= minX || maxY <= minY) return;

        const cropW = maxX - minX + 1;
        const cropH = maxY - minY + 1;
        const innerSize = outputSize * (1 - paddingPct);
        const scale     = Math.min(innerSize / cropW, innerSize / cropH);
        const scaledW   = Math.round(cropW * scale);
        const scaledH   = Math.round(cropH * scale);

        const dScale   = displaySize / outputSize;
        const dScaledW = Math.round(scaledW * dScale);
        const dScaledH = Math.round(scaledH * dScale);
        const dx       = Math.round((displaySize - dScaledW) / 2);
        const dy       = Math.round((displaySize - dScaledH) / 2);

        ctx.drawImage(offscreen, minX, minY, cropW, cropH, dx, dy, dScaledW, dScaledH);
    }
}
