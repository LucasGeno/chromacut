# General Tips

Best practices for generating AI images that extract cleanly with chromacut.

## Why #00FF00?

Solid bright green (`#00FF00`) provides the maximum color distance from most subject colors. It's the same approach used in professional VFX (After Effects, Nuke) — a color so far from typical subject tones that the algorithm can cleanly separate foreground from background.

Other solid colors can work too — chromacut auto-detects the key color from the image corners. But green gives the most reliable results because:

- Maximum distance from skin tones, earth tones, and warm palettes
- AI generators handle it well as a background instruction
- Familiar concept ("green screen") so generators understand the intent

## Grid Layout

When generating multiple icons in one image:

- Leave at least **80px of solid key color** between icons — more is better
- Chromacut detects gaps automatically, but wider gaps improve reliability
- Keep icons roughly the same size within a row for clean cell detection
- **Labels go on a black strip below the content**, never overlapping the icons

Example grid spec in a prompt:
```
Arrange in a 3x2 grid with at least 80px of solid green gap.
No frames, no borders.
```

## Label Strips

Chromacut detects and strips label bars automatically. For this to work:

- Place labels on a **solid black strip** at the very bottom of the image
- Don't put labels between rows — only at the bottom
- Keep label text short and descriptive

## What to Avoid

### Green in artwork
Never use `#00FF00` or any bright saturated green in the artwork itself — it will be treated as background and become transparent. If you need green elements (leaves, plants), use muted alternatives:

- Sage: `#8B9B6B`
- Olive: `#6B7B4B`
- Forest: `#4A6741`

### Anti-aliasing on pixel art
Anti-aliased pixel art edges blend with the green background, creating a fringe of semi-transparent green pixels. Always request "NO anti-aliasing" and "crisp pixel edges" for pixel art prompts.

### Gradients touching the key color
If artwork has gradients that fade toward the key color, the extraction boundary becomes ambiguous. Keep solid boundaries between subject and background.

### Cast shadows on the background
Shadows on the green background create dark green zones that may not key out cleanly. Request "no cast shadows on background" — internal shadows within the subject are fine.

### Transparent or semi-transparent elements
Glass, smoke, or other transparent elements over the green background will retain green contamination. Keep subjects opaque.

## AI Generator Notes

### Gemini
- Best overall results for chroma-key workflows
- Handles grid layouts reliably
- Tends to add subtle anti-aliasing — always include "NO anti-aliasing" for pixel art
- May add decorative borders — explicitly say "no frames, no borders"
- Good at following specific color instructions

### ChatGPT (DALL-E)
- Pixel art quality is less consistent — be very explicit about style
- Grid spacing can be uneven — may need manual grid override in chromacut
- Sometimes adds gradients despite "flat colors" instructions
- Label placement is less reliable
- Better at illustrated/realistic styles than pixel art

## Extraction Settings

| Subject type | Art style | Padding | Notes |
|-------------|-----------|---------|-------|
| Pixel art icons | Pixel | 10-15% | NEAREST resampling preserves crisp edges |
| Flat icons | Pixel | 10-15% | Also benefits from NEAREST at small sizes |
| Isometric illustrations | Illustrated | 15-20% | LANCZOS preserves smooth curves |
| Detailed art | Illustrated | 15-20% | More padding for breathing room |

## Troubleshooting

**Green fringe on edges**: The despill + erosion pipeline should handle this. If fringe persists, the source image may have heavy anti-aliasing. Try re-generating with "NO anti-aliasing" or use the Pixel art style.

**Wrong grid detection**: Use the grid override fields (cols x rows) in the settings panel to manually specify the layout.

**Key color not detected**: If the background isn't pure green or the corners contain non-background content, chromacut may misdetect the key color. The auto-detection samples the four corners of the image.

**Labels not stripped**: Labels must be on a black strip at the very bottom. If they're elsewhere in the image, they'll be treated as content.
