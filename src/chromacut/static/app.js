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
    let _hoveredCell = -1;
    let previewImages = [];  // HTMLImageElements from backend despill
    let editedCells = [];     // deep copy of analysisData.cells, mutable for user edits
    let activeDrag = null;    // { mode, handle, startPointer, startRect, cellIndex }
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
    const beforeAfterBadge = $('#before-after-badge');
    const loadingOverlay = $('#loading-overlay');

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

    // ---- Before/after toggle (hold Space) ----
    let _showingOriginal = false;

    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !e.repeat && sourceImage && analysisData && _lastSourceCrop) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            e.preventDefault();
            _showingOriginal = true;
            beforeAfterBadge.classList.remove('hidden');
            showOriginalInPreview();
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space' && _showingOriginal) {
            e.preventDefault();
            _showingOriginal = false;
            beforeAfterBadge.classList.add('hidden');
            updatePreview();
        }
    });

    function showOriginalInPreview() {
        if (!_lastSourceCrop || !sourceImage) return;
        const { x, y, w, h } = _lastSourceCrop;

        const sizeBtn = $('[data-setting="output_size"] button.active');
        const outputSize = parseInt(sizeBtn?.dataset.value || '512');
        const paddingPct = parseInt(paddingSlider.value) / 100;

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

        // Use same framing as updatePreview — cell bounds with padding
        const innerSize = outputSize * (1 - paddingPct);
        const scale = Math.min(innerSize / w, innerSize / h);
        const scaledW = Math.round(w * scale);
        const scaledH = Math.round(h * scale);

        const dScale = displaySize / outputSize;
        const dScaledW = Math.round(scaledW * dScale);
        const dScaledH = Math.round(scaledH * dScale);
        const dx = Math.round((displaySize - dScaledW) / 2);
        const dy = Math.round((displaySize - dScaledH) / 2);

        ctx.drawImage(sourceImage, x, y, w, h, dx, dy, dScaledW, dScaledH);
    }

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
        previewImages = [];
        editedCells = [];
        activeDrag = null;
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

        loadingOverlay.classList.remove('hidden');
        exportStatus.textContent = '';

        const form = new FormData();
        form.append('file', sourceFile);

        try {
            const resp = await fetch('/api/analyze', { method: 'POST', body: form });
            analysisData = await resp.json();

            // Deep copy cells for editing (analysisData.cells stays immutable)
            editedCells = analysisData.cells.map(c => ({...c}));

            // Decode backend-rendered previews
            previewImages = [];
            if (analysisData.previews) {
                for (const dataUrl of analysisData.previews) {
                    const img = new Image();
                    img.src = dataUrl;
                    previewImages.push(img);
                }
            }

            updateDetectionUI();
            drawOverlay();
            buildNameFields();
            updatePreview();
        } catch (err) {
            exportStatus.textContent = 'Analysis failed: ' + err.message;
        } finally {
            loadingOverlay.classList.add('hidden');
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
        if (editedCells.length > 1) {
            cellStrip.classList.remove('hidden');
            buildCellThumbnails();
        } else {
            cellStrip.classList.add('hidden');
        }
    }

    // ---- Draw cell overlay on source ----
    function drawOverlay() {
        if (!editedCells.length || !sourceImage) return;
        const ctx = overlayCanvas.getContext('2d');
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

        const scaleX = overlayCanvas.width / sourceImage.width;
        const scaleY = overlayCanvas.height / sourceImage.height;

        const hovered = _hoveredCell;

        editedCells.forEach((cell, i) => {
            const x = cell.x * scaleX;
            const y = cell.y * scaleY;
            const w = cell.w * scaleX;
            const h = cell.h * scaleY;

            if (i === selectedCell) {
                ctx.strokeStyle = '#FF2D9B';
                ctx.lineWidth = 2;
                ctx.setLineDash([]);
            } else if (i === hovered) {
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
            ctx.fillStyle = i === selectedCell ? '#FF2D9B' : (i === hovered ? '#FF2D9BCC' : '#FF2D9B88');
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
                const cp = imageToCanvas(hp.x, hp.y);
                ctx.fillRect(cp.x - handleSize / 2, cp.y - handleSize / 2, handleSize, handleSize);
                ctx.strokeRect(cp.x - handleSize / 2, cp.y - handleSize / 2, handleSize, handleSize);
            }
        }
    }

    // ---- Coordinate conversion ----
    function canvasToImage(canvasX, canvasY) {
        return {
            x: canvasX * sourceImage.width / overlayCanvas.width,
            y: canvasY * sourceImage.height / overlayCanvas.height,
        };
    }

    function imageToCanvas(imgX, imgY) {
        return {
            x: imgX * overlayCanvas.width / sourceImage.width,
            y: imgY * overlayCanvas.height / sourceImage.height,
        };
    }

    // ---- Hit testing ----
    const HANDLE_HIT_PX = 12;
    const HANDLE_NAMES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

    function getHandlePositions(cell) {
        const { x, y, w, h } = cell;
        return {
            nw: { x: x, y: y },
            n:  { x: x + w / 2, y: y },
            ne: { x: x + w, y: y },
            e:  { x: x + w, y: y + h / 2 },
            se: { x: x + w, y: y + h },
            s:  { x: x + w / 2, y: y + h },
            sw: { x: x, y: y + h },
            w:  { x: x, y: y + h / 2 },
        };
    }

    function hitTest(canvasX, canvasY) {
        const img = canvasToImage(canvasX, canvasY);
        const hitZone = HANDLE_HIT_PX * sourceImage.width / overlayCanvas.width;

        // Check handles of selected cell first
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

    const CURSOR_MAP = {
        nw: 'nwse-resize', se: 'nwse-resize',
        ne: 'nesw-resize', sw: 'nesw-resize',
        n: 'ns-resize', s: 'ns-resize',
        e: 'ew-resize', w: 'ew-resize',
    };

    // ---- Overlay pointer events ----
    overlayCanvas.addEventListener('pointerdown', (e) => {
        if (!sourceImage || !editedCells.length) return;
        const rect = overlayCanvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const hit = hitTest(cx, cy);

        if (hit.type === 'none') {
            if (selectedCell >= 0) {
                selectedCell = -1;
                drawOverlay();
            }
            return;
        }

        selectedCell = hit.cellIndex;
        drawOverlay();
        updatePreview();

        $$('.cell-thumb').forEach((t, i) => {
            t.classList.toggle('active', i === selectedCell);
        });

        if (hit.type === 'handle') {
            const cell = editedCells[selectedCell];
            activeDrag = {
                mode: 'resize',
                handle: hit.handle,
                startPointer: canvasToImage(cx, cy),
                startRect: { x: cell.x, y: cell.y, w: cell.w, h: cell.h },
                cellIndex: selectedCell,
            };
            overlayCanvas.setPointerCapture(e.pointerId);
        } else if (hit.type === 'cell' && hit.cellIndex === selectedCell) {
            const cell = editedCells[selectedCell];
            activeDrag = {
                mode: 'move',
                handle: null,
                startPointer: canvasToImage(cx, cy),
                startRect: { x: cell.x, y: cell.y, w: cell.w, h: cell.h },
                cellIndex: selectedCell,
            };
            overlayCanvas.setPointerCapture(e.pointerId);
        }
    });

    overlayCanvas.addEventListener('pointermove', (e) => {
        if (!sourceImage || !editedCells.length) return;
        const rect = overlayCanvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        if (activeDrag) {
            handleDragMove(cx, cy);
            return;
        }

        const hit = hitTest(cx, cy);
        if (hit.type === 'handle') {
            overlayCanvas.style.cursor = CURSOR_MAP[hit.handle] || 'crosshair';
        } else if (hit.type === 'cell') {
            overlayCanvas.style.cursor = 'move';
        } else {
            overlayCanvas.style.cursor = 'crosshair';
        }

        const newHovered = hit.type !== 'none' ? hit.cellIndex : -1;
        if (newHovered !== _hoveredCell) {
            _hoveredCell = newHovered;
            drawOverlay();
        }
    });

    overlayCanvas.addEventListener('pointerup', (e) => {
        if (activeDrag) commitDrag();
    });

    overlayCanvas.addEventListener('pointercancel', () => {
        if (activeDrag) commitDrag();
    });

    overlayCanvas.addEventListener('lostpointercapture', () => {
        if (activeDrag) commitDrag();
    });

    // ---- Drag helpers ----
    const MIN_CELL_DIM = 20;

    function clampMove(cell) {
        cell.x = Math.max(0, Math.min(cell.x, sourceImage.width - cell.w));
        cell.y = Math.max(0, Math.min(cell.y, sourceImage.height - cell.h));
    }

    function clampResize(cell) {
        cell.x = Math.max(0, Math.min(cell.x, sourceImage.width - MIN_CELL_DIM));
        cell.y = Math.max(0, Math.min(cell.y, sourceImage.height - MIN_CELL_DIM));
        cell.w = Math.max(MIN_CELL_DIM, Math.min(cell.w, sourceImage.width - cell.x));
        cell.h = Math.max(MIN_CELL_DIM, Math.min(cell.h, sourceImage.height - cell.y));
    }

    function handleDragMove(canvasX, canvasY) {
        if (!activeDrag) return;
        const img = canvasToImage(canvasX, canvasY);
        const { mode, handle, startPointer, startRect, cellIndex } = activeDrag;
        const cell = editedCells[cellIndex];
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

        previewImages[cellIndex] = null;
        drawOverlay();
        updatePreview();
    }

    let _previewAbortController = null;

    function commitDrag() {
        const cellIndex = activeDrag?.cellIndex;
        activeDrag = null;

        if (cellIndex != null && cellIndex >= 0) {
            refreshCellPreview(cellIndex);
            rebuildCellThumbnail(cellIndex);
        }
    }

    async function refreshCellPreview(cellIndex) {
        if (!sourceFile || cellIndex < 0 || cellIndex >= editedCells.length) return;

        if (_previewAbortController) _previewAbortController.abort();
        _previewAbortController = new AbortController();

        const cell = editedCells[cellIndex];
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

            if (selectedCell !== cellIndex) return;

            const img = new Image();
            img.onload = () => {
                previewImages[cellIndex] = img;
                updatePreview();
            };
            img.src = data.preview;
        } catch (err) {
            if (err.name !== 'AbortError') console.warn('Preview refresh failed:', err);
        }
    }

    function rebuildCellThumbnail(cellIndex) {
        const thumbs = cellThumbnails.querySelectorAll('.cell-thumb');
        if (cellIndex >= thumbs.length) return;
        const thumb = thumbs[cellIndex];
        const cell = editedCells[cellIndex];
        const canvas = thumb.querySelector('canvas');
        if (!canvas || !sourceImage) return;

        const size = 68;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.min(size / cell.w, size / cell.h);
        const sw = cell.w * scale;
        const sh = cell.h * scale;
        ctx.drawImage(sourceImage, cell.x, cell.y, cell.w, cell.h,
                     (size - sw) / 2, (size - sh) / 2, sw, sh);
        quickGreenRemove(ctx, size, size);
    }

    // ---- Build cell thumbnails ----
    function buildCellThumbnails() {
        cellThumbnails.innerHTML = '';
        if (!editedCells.length || !sourceImage) return;

        editedCells.forEach((cell, i) => {
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
        if (!editedCells.length) return;

        editedCells.forEach((cell, i) => {
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

    // ---- Canvas preview ----
    function updatePreview() {
        if (!sourceImage || !analysisData) return;

        const cellIdx = selectedCell >= 0 ? selectedCell : 0;
        const cell = editedCells[cellIdx] || editedCells[0];
        if (!cell) return;

        // Store full cell bounds for before/after framing
        _lastSourceCrop = { x: cell.x, y: cell.y, w: cell.w, h: cell.h };

        // Get current settings
        const paddingPct = parseInt(paddingSlider.value) / 100;
        const sizeBtn = $('[data-setting="output_size"] button.active');
        const outputSize = parseInt(sizeBtn?.dataset.value || '512');
        const styleBtn = $('[data-setting="art_style"] button.active');
        const artStyle = styleBtn?.dataset.value || 'pixel';

        // Calculate display size
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
        ctx.imageSmoothingEnabled = (artStyle !== 'pixel');

        // Use backend preview if available, fallback to client-side
        const previewImg = previewImages[selectedCell];
        if (previewImg && previewImg.complete && previewImg.naturalWidth > 0) {
            // Backend preview is already despilled and tight-cropped
            const pw = previewImg.naturalWidth;
            const ph = previewImg.naturalHeight;

            const innerSize = outputSize * (1 - paddingPct);
            const scale = Math.min(innerSize / pw, innerSize / ph);
            const scaledW = Math.round(pw * scale);
            const scaledH = Math.round(ph * scale);

            const dScale = displaySize / outputSize;
            const dScaledW = Math.round(scaledW * dScale);
            const dScaledH = Math.round(scaledH * dScale);
            const dx = Math.round((displaySize - dScaledW) / 2);
            const dy = Math.round((displaySize - dScaledH) / 2);

            ctx.drawImage(previewImg, 0, 0, pw, ph, dx, dy, dScaledW, dScaledH);
        } else {
            // Fallback: client-side green removal (for thumbnails or if previews not loaded)
            const offscreen = document.createElement('canvas');
            offscreen.width = cell.w;
            offscreen.height = cell.h;
            const offCtx = offscreen.getContext('2d');
            offCtx.drawImage(sourceImage, cell.x, cell.y, cell.w, cell.h, 0, 0, cell.w, cell.h);
            quickGreenRemove(offCtx, cell.w, cell.h);

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
            if (maxX <= minX || maxY <= minY) return;

            const cropW = maxX - minX + 1;
            const cropH = maxY - minY + 1;
            const innerSize = outputSize * (1 - paddingPct);
            const scale = Math.min(innerSize / cropW, innerSize / cropH);
            const scaledW = Math.round(cropW * scale);
            const scaledH = Math.round(cropH * scale);

            const dScale = displaySize / outputSize;
            const dScaledW = Math.round(scaledW * dScale);
            const dScaledH = Math.round(scaledH * dScale);
            const dx = Math.round((displaySize - dScaledW) / 2);
            const dy = Math.round((displaySize - dScaledH) / 2);

            ctx.drawImage(offscreen, minX, minY, cropW, cropH, dx, dy, dScaledW, dScaledH);
        }
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
            const idx = parseInt(input.dataset.index);
            const cellData = editedCells[idx];
            cells.push({
                index: idx,
                name: input.value.trim() || `icon-${idx + 1}`,
                x: cellData?.x || 0,
                y: cellData?.y || 0,
                w: cellData?.w || 0,
                h: cellData?.h || 0,
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

})();
