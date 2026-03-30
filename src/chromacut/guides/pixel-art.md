# Pixel Art Guide

Prompt templates and tips for generating SNES-era pixel art icons on green-screen backgrounds for clean chroma-key extraction.

## Full Prompt Template

```
Generate {N} pixel art {category} icons on a solid bright green (#00FF00)
chroma-key background. SNES-era muted palette, 3-4 warm/earthy colors per
icon, crisp pixel edges, NO anti-aliasing.

{Context line — what these are for and the visual tone.}

Arrange in a {cols}x{rows} grid with at least 80px of solid green gap.
No frames, no borders.

The {N} icons:
- Row 1: **{Name}** ({visual description, 1-2 sentences, include specific
  colors: charcoal + amber, warm brown + tan, etc.})
- Row 2: ...

Style: Chunky, bold, immediately readable at {display size}px.

NO green (#00FF00) in any artwork. Labels on a black strip below each row.
Row 1: LABEL1, LABEL2, ...
```

## Example: 3 Dashboard Icons

```
Generate 3 pixel art dashboard icons on a solid bright green (#00FF00)
chroma-key background. SNES-era muted palette, 3-4 warm/earthy colors per
icon, crisp pixel edges, NO anti-aliasing.

These are sidebar navigation icons for a developer dashboard. Clean,
recognizable silhouettes with warm tones.

Arrange in a 3x1 grid with at least 80px of solid green gap.
No frames, no borders.

The 3 icons:
- **Console** (a retro command terminal, charcoal body with amber screen
  glow and steel trim)
- **Database** (stacked cylinders, bronze metallic with warm brown shadows
  and a subtle amber status light)
- **Settings** (interlocking gears, steel gray with copper accents and
  tan highlights on teeth)

Style: Chunky, bold, immediately readable at 48px.

NO green (#00FF00) in any artwork. Labels on a black strip below:
CONSOLE, DATABASE, SETTINGS
```

## Key Rules

| Rule | Why |
|------|-----|
| Solid `#00FF00` background | Clean chroma-key extraction |
| "NO anti-aliasing" | Prevents green fringe on pixel edges |
| 80px+ gap between icons | Reliable grid cell detection |
| 3-4 colors per icon | SNES-era constraint, keeps style cohesive |
| Labels on black strip BELOW | Label strip detection removes them automatically |
| "NO green in artwork" | Prevents holes after green removal |
| Specify display size | Tells the generator how chunky to make details |

## Safe Green Alternatives

If your artwork needs green elements (leaves, plants, nature), use muted greens that won't be keyed out:

- **Sage**: `#8B9B6B` — soft, natural green
- **Olive**: `#6B7B4B` — dark, earthy green

Never use `#00FF00` or any bright saturated green in the artwork itself.

## Pixel Art Style Tips

- Request "crisp pixel edges" to avoid anti-aliased blending with the green background
- Stick to 3-4 colors per icon for authentic SNES-era feel
- Warm/earthy palettes (browns, tans, ambers) work best for most subjects
- Cool grays (charcoal, steel, slate) work well for tech/mechanical subjects
- Include specific color names in your prompt — don't leave color choices to the generator
- "Chunky and bold" ensures details are visible at small display sizes

## Generator Notes

### Gemini
- Handles pixel art prompts well
- Tends to add subtle anti-aliasing — always include "NO anti-aliasing"
- Grid layout is usually reliable with explicit gap size
- May add decorative borders — explicitly say "no frames, no borders"

### ChatGPT (DALL-E)
- Pixel art quality varies — be very explicit about style
- May struggle with consistent grid spacing
- Often adds gradients — specify "flat colors, no gradients"
- Label placement is less reliable — may need manual cropping
