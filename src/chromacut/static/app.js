/* ============================================================
   chromacut — app.js
   Drop zone, Canvas preview, API calls, settings, export.
   ============================================================ */

(() => {
    'use strict';

    // ---- State ----
    let sourceFile = null;
    let sourceImage = null;   // HTMLImageElement
    let analysisData = null;  // response from /api/analyze
    let selectedCell = 0;
    let _lastSourceCrop = null;  // for before/after toggle

    // ---- DOM refs ----
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const dropZone = $('#drop-zone');
    const fileInput = $('#file-input');
    const workspace = $('#workspace');
    const sourceCanvas = $('#source-canvas');
    const overlayCanvas = $('#overlay-canvas');
    const resultCanvas = $('#result-canvas');
    const cellStrip = $('#cell-strip');
    const cellThumbnails = $('#cell-thumbnails');
    const nameFields = $('#name-fields');
    const btnExport = $('#btn-export');
    const btnNew = $('#btn-new');
    const exportStatus = $('#export-status');
    const paddingSlider = $('#padding-slider');
    const paddingValue = $('#padding-value');
    const keyColorSwatch = $('#key-color-swatch');
    const keyColorHex = $('#key-color-hex');
    const detectMode = $('#detect-mode');

    // ---- Tab switching ----
    $$('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            $$('.tab').forEach(t => t.classList.remove('active'));
            $$('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            $(`#tab-${tab.dataset.tab}`).classList.add('active');

            // Auto-load first guide if guides tab opened
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

    // ---- Settings: button groups ----
    $$('.btn-group').forEach(group => {
        group.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                updatePreview();
            });
        });
    });

    // ---- Settings: padding slider ----
    paddingSlider.addEventListener('input', () => {
        paddingValue.textContent = paddingSlider.value + '%';
        updatePreview();
    });

    // ---- Export ----
    btnExport.addEventListener('click', doExport);

    // ---- File handling ----
    function handleFile(file) {
        sourceFile = file;
        const img = new Image();
        img.onload = () => {
            sourceImage = img;
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
        sourceFile = null;
        sourceImage = null;
        analysisData = null;
        selectedCell = 0;
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
        if (!sourceImage) return;
        const panel = sourceCanvas.parentElement;
        const maxW = panel.clientWidth;
        const maxH = panel.clientHeight;
        const scale = Math.min(maxW / sourceImage.width, maxH / sourceImage.height, 1);
        const w = Math.round(sourceImage.width * scale);
        const h = Math.round(sourceImage.height * scale);

        sourceCanvas.width = w;
        sourceCanvas.height = h;
        overlayCanvas.width = w;
        overlayCanvas.height = h;

        const ctx = sourceCanvas.getContext('2d');
        ctx.drawImage(sourceImage, 0, 0, w, h);
    }

    // ---- Analyze via API ----
    async function analyzeImage() {
        if (!sourceFile) return;

        const form = new FormData();
        form.append('file', sourceFile);

        try {
            const resp = await fetch('/api/analyze', { method: 'POST', body: form });
            analysisData = await resp.json();
            updateDetectionUI();
            drawOverlay();
            buildNameFields();
            updatePreview();
        } catch (err) {
            exportStatus.textContent = 'Analysis failed: ' + err.message;
        }
    }

    // ---- Update detection UI ----
    function updateDetectionUI() {
        if (!analysisData) return;

        const [r, g, b] = analysisData.key_color;
        const hex = '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
        keyColorSwatch.style.background = hex;
        keyColorHex.textContent = hex.toUpperCase();
        detectMode.textContent = analysisData.mode;

        // Show cell strip for grid mode
        if (analysisData.cells.length > 1) {
            cellStrip.classList.remove('hidden');
            buildCellThumbnails();
        } else {
            cellStrip.classList.add('hidden');
        }
    }

    // ---- Draw cell overlay on source ----
    function drawOverlay() {
        if (!analysisData || !sourceImage) return;
        const ctx = overlayCanvas.getContext('2d');
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

        const scaleX = overlayCanvas.width / sourceImage.width;
        const scaleY = overlayCanvas.height / sourceImage.height;

        const hovered = typeof _hoveredCell !== 'undefined' ? _hoveredCell : -1;

        analysisData.cells.forEach((cell, i) => {
            const x = cell.x * scaleX;
            const y = cell.y * scaleY;
            const w = cell.w * scaleX;
            const h = cell.h * scaleY;

            if (i === selectedCell) {
                ctx.strokeStyle = '#00DDFF';
                ctx.lineWidth = 2;
                ctx.setLineDash([]);
            } else if (i === hovered) {
                ctx.strokeStyle = '#00DDFFCC';
                ctx.lineWidth = 2;
                ctx.setLineDash([]);
            } else {
                ctx.strokeStyle = '#00DDFF88';
                ctx.lineWidth = 1;
                ctx.setLineDash([6, 3]);
            }
            ctx.strokeRect(x, y, w, h);

            ctx.setLineDash([]);
            ctx.fillStyle = i === selectedCell ? '#00DDFF' : (i === hovered ? '#00DDFFCC' : '#00DDFF88');
            ctx.font = '11px "DM Mono", monospace';
            ctx.fillText(i + 1, x + 4, y + 14);
        });
    }

    // ---- Build cell thumbnails ----
    function buildCellThumbnails() {
        cellThumbnails.innerHTML = '';
        if (!analysisData || !sourceImage) return;

        analysisData.cells.forEach((cell, i) => {
            const thumb = document.createElement('div');
            thumb.className = 'cell-thumb' + (i === selectedCell ? ' active' : '');

            const canvas = document.createElement('canvas');
            const size = 68;
            canvas.width = size;
            canvas.height = size;

            const ctx = canvas.getContext('2d');
            const scale = Math.min(size / cell.w, size / cell.h);
            const sw = cell.w * scale;
            const sh = cell.h * scale;
            ctx.drawImage(sourceImage, cell.x, cell.y, cell.w, cell.h,
                         (size - sw) / 2, (size - sh) / 2, sw, sh);

            // Quick green removal for thumbnail preview
            quickGreenRemove(ctx, size, size);

            thumb.appendChild(canvas);
            thumb.addEventListener('click', () => {
                selectedCell = i;
                $$('.cell-thumb').forEach(t => t.classList.remove('active'));
                thumb.classList.add('active');
                drawOverlay();
                updatePreview();
            });
            cellThumbnails.appendChild(thumb);
        });
    }

    // ---- Build name fields ----
    function buildNameFields() {
        nameFields.innerHTML = '';
        if (!analysisData) return;

        analysisData.cells.forEach((cell, i) => {
            const row = document.createElement('div');
            row.className = 'name-row';

            const idx = document.createElement('span');
            idx.className = 'name-index';
            idx.textContent = i + 1;

            const input = document.createElement('input');
            input.type = 'text';
            input.value = `icon-${i + 1}`;
            input.dataset.index = i;

            row.appendChild(idx);
            row.appendChild(input);
            nameFields.appendChild(row);
        });
    }

    // ---- Canvas preview (client-side pipeline simulation) ----
    function updatePreview() {
        if (!sourceImage || !analysisData) return;

        const cell = analysisData.cells[selectedCell] || analysisData.cells[0];
        if (!cell) return;

        // Step 1: Draw cell at full resolution into an offscreen canvas
        const offscreen = document.createElement('canvas');
        offscreen.width = cell.w;
        offscreen.height = cell.h;
        const offCtx = offscreen.getContext('2d');
        offCtx.drawImage(sourceImage, cell.x, cell.y, cell.w, cell.h, 0, 0, cell.w, cell.h);

        // Step 2: Quick green removal
        quickGreenRemove(offCtx, cell.w, cell.h);

        // Step 3: Find tight bounding box of visible pixels
        const imgData = offCtx.getImageData(0, 0, cell.w, cell.h);
        const d = imgData.data;
        let minX = cell.w, minY = cell.h, maxX = 0, maxY = 0;
        for (let y = 0; y < cell.h; y++) {
            for (let x = 0; x < cell.w; x++) {
                if (d[(y * cell.w + x) * 4 + 3] > 10) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }

        if (maxX <= minX || maxY <= minY) {
            _lastSourceCrop = null;
            return;
        }

        const cropW = maxX - minX + 1;
        const cropH = maxY - minY + 1;

        // Step 4: Get current settings
        const paddingPct = parseInt(paddingSlider.value) / 100;
        const sizeBtn = $('[data-setting="output_size"] button.active');
        const outputSize = parseInt(sizeBtn?.dataset.value || '512');

        // Step 5: Calculate padded canvas layout
        const innerSize = outputSize * (1 - paddingPct);
        const scale = Math.min(innerSize / cropW, innerSize / cropH);
        const scaledW = Math.round(cropW * scale);
        const scaledH = Math.round(cropH * scale);

        // Step 6: Render onto the result canvas
        const panel = resultCanvas.parentElement;
        const displayScale = Math.min(
            (panel.clientWidth - 8) / outputSize,
            (panel.clientHeight - 8) / outputSize,
            1
        );
        const displaySize = Math.round(outputSize * displayScale);

        resultCanvas.width = displaySize;
        resultCanvas.height = displaySize;
        const ctx = resultCanvas.getContext('2d');
        ctx.clearRect(0, 0, displaySize, displaySize);

        // Scale everything to display size
        const dScale = displaySize / outputSize;
        const dScaledW = Math.round(scaledW * dScale);
        const dScaledH = Math.round(scaledH * dScale);
        const dx = Math.round((displaySize - dScaledW) / 2);
        const dy = Math.round((displaySize - dScaledH) / 2);

        // Use nearest-neighbor for pixel art, smooth for illustrated
        const styleBtn = $('[data-setting="art_style"] button.active');
        const artStyle = styleBtn?.dataset.value || 'pixel';
        ctx.imageSmoothingEnabled = (artStyle !== 'pixel');

        // Draw the tight-cropped content centered with padding
        ctx.drawImage(offscreen, minX, minY, cropW, cropH, dx, dy, dScaledW, dScaledH);

        // Store the source crop for before/after toggle
        _lastSourceCrop = { x: cell.x + minX, y: cell.y + minY, w: cropW, h: cropH };
    }

    // ---- Quick green removal (Canvas API) ----
    function quickGreenRemove(ctx, w, h) {
        const imgData = ctx.getImageData(0, 0, w, h);
        const d = imgData.data;

        // Get key color from analysis or default green
        let kr = 0, kg = 255, kb = 0;
        if (analysisData && analysisData.key_color) {
            [kr, kg, kb] = analysisData.key_color;
        }

        for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i + 1], b = d[i + 2];

            // Distance from key color
            const dr = r - kr, dg = g - kg, db = b - kb;
            const dist = Math.sqrt(dr * dr + dg * dg + db * db);

            if (dist < 80) {
                // Close to key color — make transparent
                d[i + 3] = 0;
            } else if (dist < 140) {
                // Transition zone — partial transparency
                const alpha = Math.round(((dist - 80) / 60) * 255);
                d[i + 3] = Math.min(d[i + 3], alpha);
                // Quick despill
                if (kg > 200) {
                    d[i + 1] = Math.min(g, Math.max(r, b));
                }
            } else {
                // Quick despill for visible pixels
                if (kg > 200 && g > Math.max(r, b) + 20) {
                    d[i + 1] = Math.max(r, b);
                }
            }
        }

        ctx.putImageData(imgData, 0, 0);
    }

    // ---- Get current settings ----
    function getSettings() {
        const sizeBtn = $('[data-setting="output_size"] button.active');
        const styleBtn = $('[data-setting="art_style"] button.active');

        const cells = [];
        nameFields.querySelectorAll('input').forEach(input => {
            cells.push({
                index: parseInt(input.dataset.index),
                name: input.value.trim() || `icon-${parseInt(input.dataset.index) + 1}`,
            });
        });

        return {
            cells,
            output_size: parseInt(sizeBtn?.dataset.value || '512'),
            padding: parseInt(paddingSlider.value) / 100,
            art_style: styleBtn?.dataset.value || 'pixel',
        };
    }

    // ---- Export via API ----
    async function doExport() {
        if (!sourceFile) return;

        btnExport.classList.add('loading');
        exportStatus.textContent = 'Processing...';

        const form = new FormData();
        form.append('file', sourceFile);
        form.append('settings', JSON.stringify(getSettings()));

        try {
            const resp = await fetch('/api/extract', { method: 'POST', body: form });
            if (!resp.ok) throw new Error(`Server error: ${resp.status}`);

            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'chromacut-export.zip';
            a.click();
            URL.revokeObjectURL(url);

            const settings = getSettings();
            exportStatus.textContent = `Exported ${settings.cells.length} icon(s)`;
        } catch (err) {
            exportStatus.textContent = 'Export failed: ' + err.message;
        } finally {
            btnExport.classList.remove('loading');
        }
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
            btn.className = 'copy-btn';
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

    // ---- Handle window resize ----
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (sourceImage) {
                drawSource();
                drawOverlay();
                updatePreview();
            }
        }, 100);
    });

})();
