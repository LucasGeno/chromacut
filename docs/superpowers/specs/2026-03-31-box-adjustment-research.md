# Box Adjustment UX Research for Next Phase

Date: 2026-03-31
Repo: ~/dev/chromacut
Purpose: Evaluate how auto-detected boxes should be adjusted in-app (move, resize, nudge) and propose implementation avenues.

---

## 1) Current Planning State

There is currently no next-phase plan file in chromacut docs.

Existing references found in another repo:
- lucas-platform/docs/superpowers/plans/2026-03-30-chromacut.md
- lucas-platform/docs/superpowers/plans/2026-03-30-chromacut-v02.md

In those docs, "draggable cell resize handles" are explicitly deferred to v0.3.

---

## 2) Cross-Domain Interaction Patterns

### A) Annotation tools (Label Studio)
Observed patterns:
- Direct rectangle manipulation on canvas (draw, move, resize)
- Multi-select with modifier keys
- Region list/details panel for precise edits and visibility toggles
- Hide and lock per region to avoid accidental edits

Takeaway for chromacut:
- Keep direct manipulation primary, but pair it with a lightweight details panel for precision and control.

### B) Image editors (Photopea / Photoshop-style transform)
Observed patterns:
- 8 handles around a selected box (corners + edges)
- Drag inside to move
- Shift for constrained scaling / ratio lock
- Enter to confirm, Escape to cancel
- Numeric X/Y/W/H fields for exact values

Takeaway for chromacut:
- "Free transform" mental model is already familiar to target users and is the strongest baseline for box adjustment.

### C) Canvas editors (Konva transformer model)
Observed patterns:
- Selection overlay detached from content
- Click empty space to deselect
- Modifier-assisted multi-select
- Transformer handles as dedicated interaction layer

Takeaway for chromacut:
- Keep overlay interaction state separate from image analysis data. This simplifies undo, redraw, and hit-testing.

### D) Native desktop utility behavior (Preview)
Observed patterns:
- Blue handles for resize on selected object
- Drag to move, handles to resize
- Simple and explicit controls over advanced interactions

Takeaway for chromacut:
- Use obvious visual affordances first. Avoid hidden gestures for core actions.

---

## 3) Candidate Interaction Models

### Model 1: Canvas-first transform (direct manipulation only)
User flow:
1. Click a box to select
2. Drag inside box to move
3. Drag edge/corner handles to resize

Pros:
- Fast and intuitive
- Minimal UI clutter

Cons:
- Weak precision for pixel-perfect adjustments
- Harder accessibility and keyboard-only use

Complexity:
- Medium

### Model 2: Hybrid transform (canvas + right-panel controls)
User flow:
1. Select on canvas
2. Adjust with drag handles OR numeric controls (X/Y/W/H)
3. Nudge with arrow keys

Pros:
- Best balance of speed and precision
- Easier to document and debug
- Works for both mouse and keyboard users

Cons:
- Slightly more UI complexity

Complexity:
- Medium-high

### Model 3: Panel-first controls (minimal canvas interaction)
User flow:
1. Select box from list
2. Adjust via arrows/inputs in control panel

Pros:
- Predictable and easy to test
- Good for exact dimensions

Cons:
- Feels slow and non-visual
- Not aligned with "feels like a tool" goal

Complexity:
- Low-medium

---

## 4) Recommendation

Recommend Model 2 (Hybrid transform).

Reason:
- Matches established behavior in pro tools
- Preserves direct visual editing while enabling precision
- Integrates naturally with existing keyboard and undo roadmap

---

## 5) Proposed UX Spec for Next Phase

### Selection and handles
- Selected box shows 8 resize handles
- Cursor changes by handle direction (n, s, e, w, ne, nw, se, sw)
- Click empty canvas to deselect
- Hover state on box and handles

### Move and resize behavior
- Drag inside box: move
- Drag edge handle: resize one axis
- Drag corner handle: resize two axes
- Clamp bounds to image area
- Enforce min width and min height

### Keyboard behavior
- Arrow keys: nudge selected box by 1 px
- Shift + arrow: nudge by 10 px
- Alt + arrow: resize from selected edge by 1 px
- Escape: cancel active drag (revert to pre-drag)
- Enter: commit active numeric edit in panel

### Precision controls (right panel)
- Fields: X, Y, W, H for selected box
- Buttons: Reset selected box, Reset all to auto-detect
- Optional lock aspect ratio toggle

### Undo/redo integration
- Snapshot push on pointerup and panel change commit
- No snapshot spam during pointermove

---

## 6) Data and Rendering Architecture

### Suggested client state
- analysisCells: immutable auto-detected cells from analyze
- editedCells: mutable working copy for user adjustments
- selectedCellIndex
- activeDrag: { mode, handle, startPointer, startRect }

### Render flow
1. Draw source image
2. Draw editedCells overlay
3. Draw selected transformer + handles

### Export contract options
Option A (simple): send edited x/y/w/h in extract settings, server clamps and validates
Option B (safer): include analysis token/hash from analyze and validate server-side that edits map to that analysis

Start with Option A if speed is priority, but keep strict server validation and clear error responses.

---

## 7) Implementation Avenue Options

### Avenue A: Build in current Canvas code (no new dependency)
- Extend existing overlay canvas hit-testing and drag loops
- Reuse drawOverlay as transformer renderer

Pros: no dependencies, full control
Cons: more custom logic to maintain

### Avenue B: Introduce lightweight transform helper library
- Keep app architecture, outsource handle math and hit-testing

Pros: faster implementation
Cons: dependency weight, integration risk, less control over UX details

### Avenue C: Full shape engine (Konva/Fabric class)
- Rebuild overlay behavior around a shape system

Pros: feature-rich foundation
Cons: too heavy for current app scope; high refactor cost

Recommended avenue: A now, B only if complexity spikes.

---

## 8) Risks and Mitigations

Risk: accidental edits while inspecting boxes
- Mitigation: explicit selected state, handle hit zones, Escape cancel

Risk: undo stack explosion during drag
- Mitigation: commit snapshots only on pointerup

Risk: mismatch between preview and export
- Mitigation: use editedCells for both preview framing and extract payload

Risk: invalid/out-of-bounds rectangles
- Mitigation: clamp every change and enforce minimum dimensions

---

## 9) Suggested Scope Split (Planning-Ready)

Phase 1 (core):
- Select, move, edge/corner resize
- Clamp + min-size rules
- Basic keyboard nudge

Phase 2 (precision):
- Right panel X/Y/W/H controls
- Aspect lock toggle
- Reset selected/all

Phase 3 (polish):
- Hover affordance improvements
- Multi-select (optional)
- Snap lines (optional)

---

## 10) Hand-off Prompt Seed for Claude Codes

"Design a next-phase implementation plan for editable detection boxes in chromacut using a hybrid interaction model: direct canvas handles plus right-panel precision controls. Include state model, event model, undo integration, keyboard mapping, validation rules, and testing strategy. Keep dependencies unchanged unless implementation complexity clearly warrants a helper library."
