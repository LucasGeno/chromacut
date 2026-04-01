# chromacut Design System

Visual identity and component reference for chromacut's web UI. This documents what exists — not a redesign. Follow these patterns when adding new UI elements to maintain consistency.

---

## Identity

**Aesthetic:** VFX compositing tool. Dark, precise, industrial. Purpose-built utility feel — not a Gradio demo, not a SaaS dashboard.

**Fonts:** Outfit (body) + DM Mono (technical values). Both from Google Fonts, loaded in `index.html`.

**Key principle:** Every UI element should feel like it belongs in a professional compositing tool. Monospace readouts, restrained color, dense information display.

---

## Color System

All colors are defined as CSS custom properties in `:root` in `style.css`.

### Surfaces

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-deep` | `#08080c` | Page background, deepest layer |
| `--bg-base` | `#0e0e15` | Header, sidebar, secondary panels |
| `--bg-raised` | `#16161f` | Preview panels, card backgrounds |
| `--bg-panel` | `#1a1a25` | Checkerboard base color |
| `--bg-input` | `#12121a` | Input fields, code blocks |
| `--bg-hover` | `#1f1f2c` | Hover states on interactive elements |

### Text

| Token | Hex | Usage |
|-------|-----|-------|
| `--text-bright` | `#f0f0f4` | Headings, high-emphasis content |
| `--text` | `#d4d4dc` | Default body text |
| `--text-dim` | `#8888a0` | Labels, secondary information |
| `--text-muted` | `#5a5a72` | Placeholders, disabled states, section headers |

### Accent — Chroma Green

The accent color references the tool's purpose (chroma-key extraction). Desaturated for UI use.

| Token | Hex | Usage |
|-------|-----|-------|
| `--accent` | `#44e044` | Active borders, hover highlights, export button |
| `--accent-dim` | `#2a8a2a` | Export button background |
| `--accent-glow` | `#44e04422` | Active tab/link backgrounds (translucent) |
| `--accent-text` | `#66ff66` | Active tab text, active button text, code highlights |
| `--accent-snap` | `#44e04466` | Snap guide lines during drag (translucent) |

### Overlay — Magenta

Chosen for maximum contrast against green-screen source images. Used only on the canvas overlay, never in general UI.

| Token | Hex | Usage |
|-------|-----|-------|
| `--overlay` | `#FF2D9B` | Selected cell border, handles, overlay text |
| `--overlay-dim` | `#FF2D9B88` | Unselected cell borders |
| `--overlay-hover` | `#FF2D9B11` | Hover fill on non-selected cells (very translucent) |
| `--overlay-hover-dim` | `#FF2D9B08` | Hover fill on excluded cells |

### Status

| Token | Hex | Usage |
|-------|-----|-------|
| `--danger` | `#e04444` | Error states (unused currently) |
| `--warn` | `#e0a844` | Before/after badge border |

### Borders

| Token | Hex | Usage |
|-------|-----|-------|
| `--border` | `#2a2a38` | Standard borders, scrollbar thumb |
| `--border-subtle` | `#1e1e2a` | Light separators, input borders |
| `--border-focus` | `#44e04488` | Focus ring on inputs (translucent green) |

---

## Typography

| Role | Font | Size | Weight | Example |
|------|------|------|--------|---------|
| Body text | Outfit | 13px | 400 | Descriptions, paragraphs |
| Headings | Outfit | 15-24px | 500-700 | Section titles, logo |
| Labels | Outfit | 11px | 500 | Setting labels, strip labels |
| Section headers | Outfit | 10px | 600 | Sidebar section titles (uppercase, tracked) |
| Controls | DM Mono | 11px | 400 | Button groups, value readouts |
| Technical values | DM Mono | 11px | 400 | Hex values, mode display, padding % |
| Code blocks | DM Mono | 12px | 400 | Guide code snippets |
| Tab labels | Outfit | 12px | 500 | Tab bar (uppercase, tracked) |

**Letter spacing:** Section headers 0.1em, tab labels 0.06em, logo -0.02em.

---

## Spacing Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--gap-xs` | 4px | Tight gaps (name rows, value spacing) |
| `--gap-sm` | 8px | Component internal spacing |
| `--gap-md` | 12px | Section padding, panel gaps |
| `--gap-lg` | 20px | Section spacing, major gaps |
| `--gap-xl` | 32px | Page-level spacing, header gap |

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 4px | Buttons, inputs, tabs, thumbnails |
| `--radius-md` | 6px | Panels, preview areas, code blocks |
| `--radius-lg` | 10px | Drop zone border |

---

## Component Patterns

### Button Group (`.btn-group`)

Segmented toggle for discrete options (size, style). Contained within a dark input-colored tray with subtle border. Active button gets hover background + accent text.

### Slider Row (`.slider-row`)

Range input alongside a mono value readout (e.g., "15%"). Slider track is border-colored, thumb is text-colored (accent on hover).

### Settings Section (`.settings-section` + `.settings-title`)

Sidebar grouping. Title is 10px uppercase tracked muted text with a subtle bottom border. Section stacks rows vertically with md gaps.

### Icon Button (`.btn-icon`)

28x28px square with raised background and border. Dim text, brightens on hover. Used for close/new actions.

### Primary Action (`.btn-export`)

Full-width button with accent-dim background, accent border, bright text. Inverts on hover (accent background, deep text). Pulses when loading.

### Secondary Action (`.btn-reset`)

Full-width mono-font text button with subtle border. No background. Text brightens on hover. Used for non-destructive resets.

### Cell Thumbnail (`.cell-thumb`)

72x72px square with checkerboard background. 2px border — border-colored default, muted on hover, accent with glow on active. Contains a canvas element.

---

## Canvas Conventions

### Checkerboard

Transparency visualization using CSS gradients. 16px squares for preview panel, 8px squares for thumbnails. Colors: `#1a1a25` (panel) on `#121220` (base).

### Overlay Rendering

| Element | Selected | Hovered | Default |
|---------|----------|---------|---------|
| Cell border | `#FF2D9B` solid 2px | `#FF2D9BCC` solid 2px | `#FF2D9B88` dashed 1px (6,3) |
| Cell number | `#FF2D9B` | `#FF2D9BCC` | `#FF2D9B88` |
| Handles | 6x6px filled `#FF2D9B` with 1px `#0e0e15` stroke | — | — |

Handles are rendered in **canvas space** (constant visual size regardless of image zoom). Cell boundaries are rendered in **image space** (scale with the source image).

### Coordinate System

All cell bounds are in source image pixels. Canvas ↔ image conversion uses the scale factors `overlayCanvas.width / sourceImage.width`.

---

## Interaction Patterns

### Loading State

Semi-transparent overlay (`rgba(8, 8, 12, 0.75)`) with centered spinner and mono "Analyzing..." text. Spinner uses overlay color for the active border segment.

### Before/After Toggle

Hold Space to show original source crop. Badge appears top-left of result panel: mono text, warning-colored border, 10px font. Both views use identical framing (full cell bounds with padding).

### Transitions

- UI elements: 0.12-0.15s ease
- Canvas rendering: no transitions (instant redraw)
- Workspace entrance: 0.2s fadeIn with 4px translateY

### Cursors

| Context | Cursor |
|---------|--------|
| Overlay default | `crosshair` |
| Over cell | `move` |
| Over handle | Direction-specific resize (`nwse-resize`, `nesw-resize`, `ns-resize`, `ew-resize`) |
| Drop zone | `pointer` |

---

## Layout

### Header (48px fixed)

Logo (mono icon + mono text) → tab bar → spacer. Base background with bottom border.

### Workspace

Flex row: preview area (flex: 1) + settings sidebar (240px fixed). Preview area stacks: header → panels (flex row: source + result) → cell strip (optional).

### Guides

Flex row: sidebar (180px) + article content (max-width 720px, scrollable).

---

## What This Doc Is Not

Not a redesign spec. Not a component library. A reference so future work doesn't invent new colors, spacing, or patterns that drift from the established system. When adding new UI elements, find the closest existing pattern and follow it.
