/* ============================================================
   app.js — entry point (ES module)
   DOM refs, event wiring, analyzeImage, guides, handleFile,
   showWorkspace, resetWorkspace, drawSource, updateDetectionUI,
   buildCellThumbnails, buildNameFields.
   ============================================================ */

import { state, resetState, initCells, pushUndo } from './state.js';
import { drawOverlay } from './overlay.js';
import { setupInteraction, refreshCellPreview, rebuildCellThumbnail } from './interaction.js';
import { updatePreview, quickGreenRemove } from './preview.js';
import { doExport } from './export.js';

// ---- DOM refs ----
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dropZone       = $('#drop-zone');
const fileInput      = $('#file-input');
const workspace      = $('#workspace');
const sourceCanvas   = $('#source-canvas');
const overlayCanvas  = $('#overlay-canvas');
const resultCanvas   = $('#result-canvas');
const cellStrip      = $('#cell-strip');
const cellThumbnails = $('#cell-thumbnails');
const nameFields     = $('#name-fields');
const btnExport      = $('#btn-export');
const btnNew         = $('#btn-new');
const exportStatus   = $('#export-status');
const paddingSlider  = $('#padding-slider');
const paddingValue   = $('#padding-value');
const keyColorSwatch = $('#key-color-swatch');
const keyColorHex    = $('#key-color-hex');
const detectMode     = $('#detect-mode');
const beforeAfterBadge = $('#before-after-badge');
const loadingOverlay = $('#loading-overlay');
const btnResetBoxes  = $('#btn-reset-boxes');

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

    // Clamp: position first (loose), then dimensions, then position tight
    x = Math.max(0, Math.min(x, imgW - 20));
    y = Math.max(0, Math.min(y, imgH - 20));
    w = Math.max(20, Math.min(w, imgW - x));
    h = Math.max(20, Math.min(h, imgH - y));

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

// ---- Aspect ratio lock toggle ----
btnAspectLock.addEventListener('click', () => {
    state.aspectLocked = !state.aspectLocked;
    btnAspectLock.classList.toggle('active', state.aspectLocked);
});

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

// ---- Wire interaction module ----
setupInteraction({
    overlayCanvas,
    resultCanvas,
    paddingSlider,
    cellThumbnails,
    beforeAfterBadge,
    updateCellPanel,
    rebuildUI: () => { buildCellThumbnails(); buildNameFields(); },
});

// ---- Tab switching ----
$$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        $$('.tab').forEach(t => t.classList.remove('active'));
        $$('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        $(`#tab-${tab.dataset.tab}`).classList.add('active');

        if (tab.dataset.tab === 'guides') {
            const firstLink = $('.guide-link.active');
            if (firstLink && !$('#guide-content').dataset.loaded) {
                loadGuide(firstLink.dataset.guide);
                $('#guide-content').dataset.loaded = '1';
            }
        }
    });
});

// ---- Drop zone ----
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleFile(file);
});

fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

// ---- New image button ----
btnNew.addEventListener('click', resetWorkspace);

// ---- Reset boxes ----
if (btnResetBoxes) {
    btnResetBoxes.addEventListener('click', () => {
        if (!state.analysisData) return;
        initCells(state.analysisData);
        state.selectedCell = 0;
        drawOverlay(overlayCanvas);
        buildCellThumbnails();
        buildNameFields();
        updatePreview(resultCanvas, paddingSlider);
        updateCellPanel();
    });
}

// ---- Settings: button groups ----
$$('.btn-group').forEach(group => {
    group.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updatePreview(resultCanvas, paddingSlider);
        });
    });
});

// ---- Settings: padding slider ----
paddingSlider.addEventListener('input', () => {
    paddingValue.textContent = paddingSlider.value + '%';
    updatePreview(resultCanvas, paddingSlider);
});

// ---- Export button ----
btnExport.addEventListener('click', () => {
    doExport(btnExport, exportStatus, paddingSlider, nameFields);
});

// ---- Window resize ----
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (state.sourceImage) {
            drawSource();
            drawOverlay(overlayCanvas);
            updatePreview(resultCanvas, paddingSlider);
        }
    }, 100);
});

// ---- Clipboard paste ----
window.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) handleFile(file);
            return;
        }
    }
});

// ---- File handling ----
function handleFile(file) {
    state.sourceFile = file;
    const img = new Image();
    img.onload = () => {
        state.sourceImage = img;
        showWorkspace();
        drawSource();
        analyzeImage();
    };
    img.src = URL.createObjectURL(file);
}

function showWorkspace() {
    dropZone.classList.add('hidden');
    workspace.classList.remove('hidden');
}

function resetWorkspace() {
    resetState();
    workspace.classList.add('hidden');
    dropZone.classList.remove('hidden');
    cellStrip.classList.add('hidden');
    cellThumbnails.innerHTML = '';
    nameFields.innerHTML = '';
    exportStatus.textContent = '';
    fileInput.value = '';
}

// ---- Draw source image on canvas ----
function drawSource() {
    if (!state.sourceImage) return;
    const panel = sourceCanvas.parentElement;
    const maxW  = panel.clientWidth;
    const maxH  = panel.clientHeight;
    const scale = Math.min(maxW / state.sourceImage.width, maxH / state.sourceImage.height, 1);
    const w     = Math.round(state.sourceImage.width  * scale);
    const h     = Math.round(state.sourceImage.height * scale);

    sourceCanvas.width  = w;
    sourceCanvas.height = h;
    overlayCanvas.width  = w;
    overlayCanvas.height = h;

    const ctx = sourceCanvas.getContext('2d');
    ctx.drawImage(state.sourceImage, 0, 0, w, h);
}

// ---- Analyze via API ----
async function analyzeImage() {
    if (!state.sourceFile) return;

    loadingOverlay.classList.remove('hidden');
    exportStatus.textContent = '';

    const form = new FormData();
    form.append('file', state.sourceFile);

    try {
        const resp = await fetch('/api/analyze', { method: 'POST', body: form });
        state.analysisData = await resp.json();

        initCells(state.analysisData);

        updateDetectionUI();
        drawOverlay(overlayCanvas);
        buildNameFields();
        updatePreview(resultCanvas, paddingSlider);
        updateCellPanel();
    } catch (err) {
        exportStatus.textContent = 'Analysis failed: ' + err.message;
    } finally {
        loadingOverlay.classList.add('hidden');
    }
}

// ---- Update detection UI labels ----
function updateDetectionUI() {
    if (!state.analysisData) return;

    const [r, g, b] = state.analysisData.key_color;
    const hex = '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
    keyColorSwatch.style.background = hex;
    keyColorHex.textContent = hex.toUpperCase();
    detectMode.textContent  = state.analysisData.mode;

    if (state.editedCells.length > 1) {
        cellStrip.classList.remove('hidden');
        buildCellThumbnails();
    } else {
        cellStrip.classList.add('hidden');
    }
}

// ---- Build cell thumbnails ----
function buildCellThumbnails() {
    cellThumbnails.innerHTML = '';
    if (!state.editedCells.length || !state.sourceImage) return;

    state.editedCells.forEach((cell, i) => {
        const thumb = document.createElement('div');
        thumb.className = 'cell-thumb'
            + (i === state.selectedCell ? ' active' : '')
            + (state.excludedCells.has(i) ? ' excluded' : '');

        const canvas = document.createElement('canvas');
        const size   = 68;
        canvas.width  = size;
        canvas.height = size;

        const ctx   = canvas.getContext('2d');
        const scale = Math.min(size / cell.w, size / cell.h);
        const sw    = cell.w * scale;
        const sh    = cell.h * scale;
        ctx.drawImage(
            state.sourceImage,
            cell.x, cell.y, cell.w, cell.h,
            (size - sw) / 2, (size - sh) / 2, sw, sh,
        );
        quickGreenRemove(ctx, size, size);

        thumb.appendChild(canvas);
        thumb.addEventListener('click', () => {
            state.selectedCell = i;
            $$('.cell-thumb').forEach(t => t.classList.remove('active'));
            thumb.classList.add('active');
            drawOverlay(overlayCanvas);
            updatePreview(resultCanvas, paddingSlider);
            updateCellPanel();
        });
        cellThumbnails.appendChild(thumb);
    });
}

// ---- Build name fields ----
function buildNameFields() {
    nameFields.innerHTML = '';
    if (!state.editedCells.length) return;

    state.editedCells.forEach((cell, i) => {
        const row = document.createElement('div');
        const excluded = state.excludedCells.has(i);
        row.className = 'name-row' + (excluded ? ' excluded' : '');

        const idx = document.createElement('span');
        idx.className   = 'name-index';
        idx.textContent = i + 1;

        const input = document.createElement('input');
        input.type  = 'text';
        input.value = `icon-${i + 1}`;
        input.dataset.index = i;
        if (excluded) {
            input.tabIndex = -1;
        }

        row.appendChild(idx);
        row.appendChild(input);
        nameFields.appendChild(row);
    });
}

// ---- Guides ----
$$('.guide-link').forEach(link => {
    link.addEventListener('click', () => {
        $$('.guide-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        loadGuide(link.dataset.guide);
    });
});

async function loadGuide(topic) {
    const content = $('#guide-content');
    content.innerHTML = '<div class="guide-placeholder">Loading...</div>';

    try {
        const resp = await fetch(`/api/guides/${topic}`);
        const data = await resp.json();
        if (data.html) {
            content.innerHTML = data.html;
            addCopyButtons();
        } else {
            content.innerHTML = '<div class="guide-placeholder">Guide not found.</div>';
        }
    } catch {
        content.innerHTML = '<div class="guide-placeholder">Failed to load guide.</div>';
    }
}

function addCopyButtons() {
    $$('.guide-content pre').forEach(pre => {
        const btn = document.createElement('button');
        btn.className   = 'copy-btn';
        btn.textContent = 'copy';
        btn.addEventListener('click', async () => {
            const code = pre.querySelector('code')?.textContent || pre.textContent;
            await navigator.clipboard.writeText(code);
            btn.textContent = 'copied';
            btn.classList.add('copied');
            setTimeout(() => {
                btn.textContent = 'copy';
                btn.classList.remove('copied');
            }, 1500);
        });
        pre.appendChild(btn);
    });
}
