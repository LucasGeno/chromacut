# Color Palette

Reference palette for AI-generated chroma-key assets. These colors are safe for extraction and produce cohesive results across icon sets.

## Warm Browns

Use for wood, leather, earth, organic materials.

| Color | Hex | Preview |
|-------|-----|---------|
| Tan | `#D2B48C` | |
| Brown | `#8B6914` | |
| Rust | `#B7410E` | |
| Bronze | `#CD7F32` | |
| Copper | `#B87333` | |
| Sienna | `#A0522D` | |

## Cool Grays

Use for metal, servers, tech, mechanical subjects.

| Color | Hex | Preview |
|-------|-----|---------|
| Charcoal | `#333333` | |
| Steel | `#71797E` | |
| Slate | `#708090` | |
| Gunmetal | `#2C3539` | |
| Silver | `#AAA9AD` | |

## Accent Colors

Highlights, status indicators, glow effects.

| Color | Hex | Preview |
|-------|-----|---------|
| Amber | `#E5A547` | |
| Gold | `#FFD700` | |
| Teal | `#2E8B8B` | |
| Coral | `#CD5C5C` | |

## Safe Greens

For leaves, plants, and nature subjects. These will NOT be keyed out.

| Color | Hex | Preview |
|-------|-----|---------|
| Sage | `#8B9B6B` | |
| Olive | `#6B7B4B` | |
| Forest | `#4A6741` | |
| Moss | `#8A9A5B` | |

## Soft Tones

Accents, clothing, decorative elements.

| Color | Hex | Preview |
|-------|-----|---------|
| Cream | `#FFFDD0` | |
| Dusty Blue | `#6B8DAD` | |
| Dusty Purple | `#8B7DA8` | |
| Warm White | `#FAF0E6` | |

## Danger / Status

Error states, warnings, broken/inactive indicators.

| Color | Hex | Preview |
|-------|-----|---------|
| Muted Red | `#C45B5B` | |
| Warm Gray | `#9E9E8E` | |
| Smoke | `#B0A89E` | |

## Using Colors in Prompts

Always specify colors by name AND hex in your prompts:

```
- **Server** (charcoal #333333 body with amber #E5A547 status LEDs
  and steel #71797E rack rails)
```

This prevents the AI generator from interpreting color names differently than intended.

## Dangerous Colors

Never use these in your artwork — they'll be treated as the chroma key:

- `#00FF00` (pure green — the default key color)
- Any bright, saturated green (`#00CC00`, `#33FF33`, etc.)
- Lime, chartreuse, or neon green variants

If you need green, always use the safe greens listed above (sage, olive, forest, moss).
