/* ============================================================
   export.js — settings collection and /api/extract call.
   ============================================================ */

import { state } from './state.js';

/**
 * Collect current settings from the DOM and return the settings object
 * expected by /api/extract.
 * @param {HTMLInputElement} paddingSlider
 * @param {HTMLElement} nameFields
 * @returns {object}
 */
export function getSettings(paddingSlider, nameFields) {
    const sizeBtn  = document.querySelector('[data-setting="output_size"] button.active');
    const styleBtn = document.querySelector('[data-setting="art_style"] button.active');

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

    return {
        cells,
        output_size: parseInt(sizeBtn?.dataset.value || '512'),
        padding:     parseInt(paddingSlider.value) / 100,
        art_style:   styleBtn?.dataset.value || 'pixel',
    };
}

/**
 * POST to /api/extract, then trigger a download of the returned file.
 * Handles both single-cell PNG (image/png) and multi-cell ZIP
 * (application/zip). The single-PNG path is added in Task 5.
 * @param {HTMLButtonElement} btnExport
 * @param {HTMLElement} exportStatus
 * @param {HTMLInputElement} paddingSlider
 * @param {HTMLElement} nameFields
 */
export async function doExport(btnExport, exportStatus, paddingSlider, nameFields, selectedOnly = false) {
    if (!state.sourceFile) return;

    btnExport.classList.add('loading');
    exportStatus.textContent = 'Processing...';

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
    const form = new FormData();
    form.append('file', state.sourceFile);
    form.append('settings', JSON.stringify(settings));

    try {
        const resp = await fetch('/api/extract', { method: 'POST', body: form });
        if (!resp.ok) throw new Error(`Server error: ${resp.status}`);

        const contentType = resp.headers.get('content-type') || '';
        const blob = await resp.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;

        if (contentType.includes('image/png')) {
            // Single-cell direct PNG download (Task 5)
            const name = settings.cells[0]?.name || 'icon';
            a.download = `${name}.png`;
        } else {
            a.download = 'chromacut-export.zip';
        }

        a.click();
        URL.revokeObjectURL(url);

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
    } catch (err) {
        exportStatus.textContent = 'Export failed: ' + err.message;
    } finally {
        btnExport.classList.remove('loading');
    }
}
