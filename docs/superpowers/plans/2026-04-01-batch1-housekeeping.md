# Batch 1: Housekeeping & Developer Experience — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish clean project foundations — version bump, JS module decomposition, CLAUDE.md, single-PNG download — before Batch 2 feature work begins.
**Architecture:** The 994-line IIFE `app.js` is split into 6 ES modules sharing a mutable `state` object; the FastAPI extract endpoint gains a single-cell PNG fast path; project scaffolding (CLAUDE.md, version) is added around those code changes.
**Tech Stack:** Python 3.11, FastAPI, Pillow, vanilla JS ES modules (no build step), pytest + httpx.

---

## Execution order

```
{Task 1: version bump, Task 2: design.md} → Task 3: JS decomposition → {Task 4: CLAUDE.md, Task 5: single-PNG download}
```

Tasks 1 and 2 are independent; run either first or in parallel. Task 3 must finish before Tasks 4 and 5. Task 4 references the completed module map; Task 5 modifies `export.js` which Task 3 creates.

---

## Task 1: Version Bump to 0.2.0

- [ ] **Step 1: Update pyproject.toml**

  In `/Users/Lucas.reed/dev/chromacut/pyproject.toml`, change:

  ```toml
  version = "0.1.0"
  ```

  to:

  ```toml
  version = "0.2.0"
  ```

- [ ] **Step 2: Update \_\_init\_\_.py**

  In `/Users/Lucas.reed/dev/chromacut/src/chromacut/__init__.py`, change:

  ```python
  __version__ = "0.1.0"
  ```

  to:

  ```python
  __version__ = "0.2.0"
  ```

- [ ] **Step 3: Run tests to confirm nothing broke**

  ```bash
  cd /Users/Lucas.reed/dev/chromacut && .venv/bin/python -m pytest -v
  ```

  All tests must pass.

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/Lucas.reed/dev/chromacut && git add pyproject.toml src/chromacut/__init__.py && git commit -m "chore: bump version to 0.2.0"
  ```

---

## Task 2: Verify design.md exists (no-op)

- [ ] **Step 1: Check file exists**

  ```bash
  ls /Users/Lucas.reed/dev/chromacut/docs/design.md
  ```

  If the file exists, this task is complete — mark done and move on. The design doc was already written and committed in the prior session. No changes needed.

  If the file is missing, flag as a blocker — do not proceed without it.

---

## Task 3: app.js Decomposition into ES Modules

This is the largest task. The 994-line IIFE is split into 6 ES modules. The split is a pure refactor — no logic changes, no new features.

### Overview of modules to create

| File | Lines (approx) | Responsibility |
|------|----------------|----------------|
| `static/js/state.js` | ~45 | State object, resetState, initCells, snapshotCells, restoreCells |
| `static/js/overlay.js` | ~160 | drawOverlay, coordinate conversion, hit-testing, handle positions, constants |
| `static/js/interaction.js` | ~200 | setupInteraction — pointer events, drag move/resize, clamp helpers, nudge debounce, commitDrag, refreshCellPreview, rebuildCellThumbnail |
| `static/js/preview.js` | ~130 | updatePreview, showOriginalInPreview, quickGreenRemove |
| `static/js/export.js` | ~55 | getSettings, doExport |
| `static/js/app.js` | ~160 | Entry point: DOM refs, event wiring, analyzeImage, guides, handleFile, showWorkspace, resetWorkspace, drawSource, updateDetectionUI, buildCellThumbnails, buildNameFields |

### Key pattern: shared mutable state

All modules import `{ state }` from `./state.js` and read/write properties directly on the object. No event bus, no setters. DOM element references stay in `app.js` and are passed as function arguments where needed.

---

- [ ] **Step 1: Create `src/chromacut/static/js/` directory**

  ```bash
  mkdir -p /Users/Lucas.reed/dev/chromacut/src/chromacut/static/js
  ```

---

- [ ] **Step 2: Create `static/js/state.js`**

  Create `/Users/Lucas.reed/dev/chromacut/src/chromacut/static/js/state.js` with:

  ```javascript
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
  ```

---

- [ ] **Step 3: Create `static/js/overlay.js`**

  Create `/Users/Lucas.reed/dev/chromacut/src/chromacut/static/js/overlay.js` with:

  ```javascript
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
  ```

---

- [ ] **Step 4: Create `static/js/interaction.js`**

  Create `/Users/Lucas.reed/dev/chromacut/src/chromacut/static/js/interaction.js` with:

  ```javascript
  /* ============================================================
     interaction.js — pointer events, drag (move + resize),
     arrow-key nudge, commitDrag, refreshCellPreview,
     rebuildCellThumbnail.

     Entry point: setupInteraction(dom) — called once by app.js.
     dom = { overlayCanvas, sourceImage (ref getter), sourceFile (ref getter),
             cellThumbnails, updatePreview, drawOverlay }
     ============================================================ */

  import { state } from './state.js';
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
      updatePreview(dom.resultCanvas, dom.paddingSlider);
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
   * }} dom
   */
  export function setupInteraction(dom) {
      _interactionDom = dom;
      const { overlayCanvas, resultCanvas, paddingSlider, cellThumbnails, beforeAfterBadge } = dom;

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
              }
              return;
          }

          state.selectedCell = hit.cellIndex;
          drawOverlay(overlayCanvas);
          updatePreview(resultCanvas, paddingSlider);

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
          }
      }

      overlayCanvas.addEventListener('pointerup',          () => { if (state.activeDrag) commitDrag(); });
      overlayCanvas.addEventListener('pointercancel',      () => { if (state.activeDrag) commitDrag(); });
      overlayCanvas.addEventListener('lostpointercapture', () => { if (state.activeDrag) commitDrag(); });

      // ---- Keyboard: Space (before/after) + arrows (nudge) ----
      window.addEventListener('keydown', (e) => {
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

                  const nudgedIndex = state.selectedCell;
                  clearTimeout(_nudgeDebounce);
                  _nudgeDebounce = setTimeout(() => {
                      refreshCellPreview(nudgedIndex, state.sourceFile);
                      rebuildCellThumbnail(nudgedIndex, cellThumbnails);
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
  ```

---

- [ ] **Step 5: Create `static/js/preview.js`**

  Create `/Users/Lucas.reed/dev/chromacut/src/chromacut/static/js/preview.js` with:

  ```javascript
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
  ```

---

- [ ] **Step 6: Create `static/js/export.js`**

  Create `/Users/Lucas.reed/dev/chromacut/src/chromacut/static/js/export.js` with:

  ```javascript
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
  export async function doExport(btnExport, exportStatus, paddingSlider, nameFields) {
      if (!state.sourceFile) return;

      btnExport.classList.add('loading');
      exportStatus.textContent = 'Processing...';

      const settings = getSettings(paddingSlider, nameFields);
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

          exportStatus.textContent = `Exported ${settings.cells.length} icon(s)`;
      } catch (err) {
          exportStatus.textContent = 'Export failed: ' + err.message;
      } finally {
          btnExport.classList.remove('loading');
      }
  }
  ```

  Note: The `content-type` branch for `image/png` is written here already so Task 5 needs only to add the backend change. No additional frontend edits needed in Task 5.

---

- [ ] **Step 7: Create `static/js/app.js` (entry point)**

  Create `/Users/Lucas.reed/dev/chromacut/src/chromacut/static/js/app.js` with:

  ```javascript
  /* ============================================================
     app.js — entry point (ES module)
     DOM refs, event wiring, analyzeImage, guides, handleFile,
     showWorkspace, resetWorkspace, drawSource, updateDetectionUI,
     buildCellThumbnails, buildNameFields.
     ============================================================ */

  import { state, resetState, initCells } from './state.js';
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

  // ---- Wire interaction module ----
  setupInteraction({
      overlayCanvas,
      resultCanvas,
      paddingSlider,
      cellThumbnails,
      beforeAfterBadge,
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
          thumb.className = 'cell-thumb' + (i === state.selectedCell ? ' active' : '');

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
          row.className = 'name-row';

          const idx = document.createElement('span');
          idx.className   = 'name-index';
          idx.textContent = i + 1;

          const input = document.createElement('input');
          input.type  = 'text';
          input.value = `icon-${i + 1}`;
          input.dataset.index = i;

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
  ```

---

- [ ] **Step 8: Update index.html script tag**

  In `/Users/Lucas.reed/dev/chromacut/src/chromacut/static/index.html`, change:

  ```html
  <script src="/static/app.js"></script>
  ```

  to:

  ```html
  <script type="module" src="/static/js/app.js"></script>
  ```

---

- [ ] **Step 9: Delete the old app.js**

  ```bash
  rm /Users/Lucas.reed/dev/chromacut/src/chromacut/static/app.js
  ```

---

- [ ] **Step 10: Run Python tests**

  ```bash
  cd /Users/Lucas.reed/dev/chromacut && .venv/bin/python -m pytest -v
  ```

  All tests must pass. The Python test suite does not test JS, so it should be unaffected by the decomposition.

---

- [ ] **Step 11: Start dev server and run 14-point browser verification checklist**

  ```bash
  cd /Users/Lucas.reed/dev/chromacut && .venv/bin/python -m chromacut
  ```

  Open `http://localhost:6100` in a browser with DevTools open. Verify each point:

  1. App loads with no console errors (check DevTools Console tab)
  2. All ES module imports resolve — no 404s in Network tab (look for `state.js`, `overlay.js`, `interaction.js`, `preview.js`, `export.js`)
  3. Drop zone accepts image drop → grid detection runs → pink overlay boxes appear on source canvas
  4. Clipboard paste (Cmd+V) loads image and triggers analysis
  5. Cell selection works: click a box to select (bright pink), click empty area to deselect
  6. Box adjustment works: drag selected box to move, drag handles to resize
  7. Arrow key nudge works: press arrow key with cell selected (1px), Shift+arrow (10px)
  8. Preview panel renders with backend despill (backend preview, not just quick green removal)
  9. Before/after toggle: hold Space → preview shows original; release → preview returns to keyed
  10. Export produces zip for multi-cell, or PNG for single-cell (single-PNG path requires Task 5 backend — for now confirm zip works)
  11. Settings changes update preview: change size (256/512/1024), adjust padding slider, toggle pixel/illustrated
  12. Reset boxes button restores auto-detected bounds and refreshes all previews
  13. Guides tab loads markdown content with syntax-highlighted code blocks and copy buttons
  14. Window resize redraws source canvas, overlay, and preview correctly

  Mark each item as verified. If any fail, debug before committing.

---

- [ ] **Step 12: Commit**

  ```bash
  cd /Users/Lucas.reed/dev/chromacut && git add src/chromacut/static/js/ src/chromacut/static/index.html && git rm src/chromacut/static/app.js && git commit -m "refactor(frontend): decompose app.js into ES modules"
  ```

---

## Task 4: Create CLAUDE.md

This task runs after Task 3 because CLAUDE.md includes the frontend module map.

- [ ] **Step 1: Create `/Users/Lucas.reed/dev/chromacut/CLAUDE.md`**

  ```markdown
  # CLAUDE.md — chromacut

  ## Project overview

  chromacut — local web app for extracting clean PNGs from AI-generated chroma-key images. pip-installable, FastAPI backend, vanilla JS frontend (ES modules, no build step).

  ## Dev setup

  ```bash
  python3 -m venv .venv
  .venv/bin/pip install -e ".[dev]"
  ```

  ## Common commands

  - **Run tests:** `.venv/bin/python -m pytest -v`
  - **Start dev server:** `.venv/bin/python -m chromacut` (opens at localhost:6100)
  - **CLI extract:** `chromacut extract source.png --name icon`

  ## Architecture

  FastAPI app (`app.py`) serves static frontend and API endpoints. Core pipeline in `engine.py` (despill, erosion, resize). Grid detection in `grid.py`. Frontend is vanilla JS ES modules under `static/js/` — no framework, no build step.

  ## Key conventions

  - No OpenCV, no AI models, no Node.js
  - NEAREST resampling for pixel art, LANCZOS for illustrated
  - All cell coordinates in source image pixels
  - VFX-standard despill: `G = min(G, max(R, B))`
  - See `docs/design.md` for visual design system

  ## Frontend module map

  | Module | Responsibility |
  |--------|---------------|
  | `static/js/app.js` | Entry point: DOM refs, event wiring, analyzeImage, guides, handleFile, showWorkspace, resetWorkspace, drawSource, updateDetectionUI, buildCellThumbnails, buildNameFields |
  | `static/js/state.js` | Shared mutable state object, resetState, initCells, snapshotCells, restoreCells |
  | `static/js/overlay.js` | drawOverlay, canvasToImage, imageToCanvas, hitTest, getHandlePositions, HANDLE_NAMES, CURSOR_MAP |
  | `static/js/interaction.js` | setupInteraction (pointer events, drag move/resize, arrow-key nudge), refreshCellPreview, rebuildCellThumbnail |
  | `static/js/preview.js` | updatePreview, showOriginalInPreview, quickGreenRemove |
  | `static/js/export.js` | getSettings, doExport |

  ## Git conventions

  - Conventional commits: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`
  - No AI attribution — no Co-authored-by trailers
  - No --no-verify
  - No force push to main

  ## Test fixtures

  9 real Gemini images in `tests/fixtures/`, parametrized regression tests.

  ```bash
  .venv/bin/python -m pytest tests/test_grid.py -v
  ```
  ```

- [ ] **Step 2: Commit**

  ```bash
  cd /Users/Lucas.reed/dev/chromacut && git add CLAUDE.md && git commit -m "docs: add CLAUDE.md with project overview and frontend module map"
  ```

---

## Task 5: Single-Icon Direct PNG Download

This task runs after Task 3 (modifies `export.js` which was created there — but note: `export.js` was already written in Task 3 Step 6 with the `content-type` branch ready, so the frontend requires no change here). Only the backend needs updating.

- [ ] **Step 1: Update `/api/extract` in `src/chromacut/app.py`**

  The current extract endpoint builds a zip regardless of cell count. Replace the final zip-return block with a conditional: single cell returns PNG directly, multiple cells return zip.

  Find this section in `app.py` (lines 90–120):

  ```python
      # Process each requested cell using client-provided bounds
      buf = io.BytesIO()
      with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
          for cell_req in cells:
              name = sanitize_name(cell_req.get("name", f"icon-{cell_req.get('index', 0)}"))

              # Use explicit bounds from client
              cx = cell_req.get("x", 0)
              cy = cell_req.get("y", 0)
              cw = cell_req.get("w", img.width)
              ch = cell_req.get("h", img.height)

              # Clamp to image dimensions
              cx = max(0, min(cx, img.width - 1))
              cy = max(0, min(cy, img.height - 1))
              cw = min(cw, img.width - cx)
              ch = min(ch, img.height - cy)

              cropped = img.crop((cx, cy, cx + cw, cy + ch))
              processed = despill_extract(cropped)
              final = pad_and_resize(processed, output_size, padding, resample)

              png_buf = io.BytesIO()
              final.save(png_buf, "PNG")
              zf.writestr(f"{name}.png", png_buf.getvalue())

      buf.seek(0)
      return Response(
          content=buf.getvalue(),
          media_type="application/zip",
          headers={"Content-Disposition": "attachment; filename=chromacut-export.zip"},
      )
  ```

  Replace with:

  ```python
      # Process each requested cell using client-provided bounds
      processed_cells = []
      for cell_req in cells:
          name = sanitize_name(cell_req.get("name", f"icon-{cell_req.get('index', 0)}"))

          cx = cell_req.get("x", 0)
          cy = cell_req.get("y", 0)
          cw = cell_req.get("w", img.width)
          ch = cell_req.get("h", img.height)

          cx = max(0, min(cx, img.width - 1))
          cy = max(0, min(cy, img.height - 1))
          cw = min(cw, img.width - cx)
          ch = min(ch, img.height - cy)

          cropped = img.crop((cx, cy, cx + cw, cy + ch))
          processed = despill_extract(cropped)
          final = pad_and_resize(processed, output_size, padding, resample)

          png_buf = io.BytesIO()
          final.save(png_buf, "PNG")
          processed_cells.append((name, png_buf))

      if len(processed_cells) == 1:
          name, png_buf = processed_cells[0]
          return Response(
              content=png_buf.getvalue(),
              media_type="image/png",
              headers={"Content-Disposition": f"attachment; filename={name}.png"},
          )

      buf = io.BytesIO()
      with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
          for name, png_buf in processed_cells:
              zf.writestr(f"{name}.png", png_buf.getvalue())
      buf.seek(0)
      return Response(
          content=buf.getvalue(),
          media_type="application/zip",
          headers={"Content-Disposition": "attachment; filename=chromacut-export.zip"},
      )
  ```

---

- [ ] **Step 2: Update tests — rename existing test and add new single-cell test**

  In `/Users/Lucas.reed/dev/chromacut/tests/test_api.py`:

  **Rename** `test_extract_returns_zip` to `test_extract_multi_cell_returns_zip` and update it to use two cells:

  ```python
  def test_extract_multi_cell_returns_zip():
      buf = _make_test_image()
      settings = json.dumps({
          "cells": [
              {"index": 0, "name": "icon-1", "x": 0,  "y": 0, "w": 50, "h": 100},
              {"index": 1, "name": "icon-2", "x": 50, "y": 0, "w": 50, "h": 100},
          ],
          "output_size": 256,
          "padding": 0.15,
          "art_style": "pixel",
      })
      resp = client.post(
          "/api/extract",
          files={"file": ("test.png", buf, "image/png")},
          data={"settings": settings},
      )
      assert resp.status_code == 200
      assert "application/zip" in resp.headers["content-type"]

      z = zipfile.ZipFile(io.BytesIO(resp.content))
      names = z.namelist()
      assert "icon-1.png" in names
      assert "icon-2.png" in names

      with z.open("icon-1.png") as f:
          img = Image.open(f)
          assert img.size == (256, 256)
          assert img.mode == "RGBA"
  ```

  **Add** `test_extract_single_cell_returns_png` after the renamed test:

  ```python
  def test_extract_single_cell_returns_png():
      buf = _make_test_image()
      settings = json.dumps({
          "cells": [{"index": 0, "name": "solo-icon", "x": 0, "y": 0, "w": 100, "h": 100}],
          "output_size": 256,
          "padding": 0.15,
          "art_style": "pixel",
      })
      resp = client.post(
          "/api/extract",
          files={"file": ("test.png", buf, "image/png")},
          data={"settings": settings},
      )
      assert resp.status_code == 200
      assert "image/png" in resp.headers["content-type"]
      assert "solo-icon.png" in resp.headers.get("content-disposition", "")

      # Verify the response body is a valid PNG
      img = Image.open(io.BytesIO(resp.content))
      assert img.size == (256, 256)
      assert img.mode == "RGBA"
  ```

---

- [ ] **Step 3: Run tests (TDD — red then green)**

  First run to confirm the new test fails before the backend change (if you haven't done Step 1 yet):

  ```bash
  cd /Users/Lucas.reed/dev/chromacut && .venv/bin/python -m pytest tests/test_api.py::test_extract_single_cell_returns_png -v
  ```

  Expected: FAIL (returns zip, not png).

  After Step 1 (backend change):

  ```bash
  cd /Users/Lucas.reed/dev/chromacut && .venv/bin/python -m pytest -v
  ```

  All tests must pass, including the renamed multi-cell test and the new single-cell test.

---

- [ ] **Step 4: Verify in browser**

  With the dev server running (`cd /Users/Lucas.reed/dev/chromacut && .venv/bin/python -m chromacut`):

  1. Load a single-icon image (not a grid)
  2. Click Export
  3. Confirm the browser downloads a `.png` file, not a `.zip`
  4. Confirm the downloaded PNG opens correctly and has a transparent background

---

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/Lucas.reed/dev/chromacut && git add src/chromacut/app.py tests/test_api.py && git commit -m "feat(export): return PNG directly for single-cell extract"
  ```

---

## Final verification

After all tasks are complete:

- [ ] Run full test suite one last time: `cd /Users/Lucas.reed/dev/chromacut && .venv/bin/python -m pytest -v`
- [ ] Confirm git log shows 4 commits (version bump, refactor frontend, docs CLAUDE.md, feat export)
- [ ] Confirm `src/chromacut/static/app.js` no longer exists
- [ ] Confirm `src/chromacut/static/js/` contains 6 files: `app.js`, `state.js`, `overlay.js`, `interaction.js`, `preview.js`, `export.js`
- [ ] Confirm `CLAUDE.md` exists at repo root
- [ ] Confirm `pyproject.toml` and `__init__.py` both read `0.2.0`
