# Isometric / Illustrated Guide

Prompt templates for generating detailed isometric scenes and illustrated assets on green-screen backgrounds.

## Full Prompt Template

```
Generate {N} isometric {category} illustrations on a solid bright green
(#00FF00) chroma-key background. Detailed but clean style, consistent
30-degree isometric perspective, soft shadows within the objects only
(no cast shadows on background).

{Context line — what these are for and the visual tone.}

Arrange in a {cols}x{rows} grid with at least 100px of solid green gap.
No frames, no borders.

The {N} illustrations:
- **{Name}** ({detailed visual description, perspective notes, specific
  colors and materials})
- ...

Style: Polished illustration quality, consistent lighting from top-left.
Readable at {display size}px with enough detail to reward closer viewing.

NO green (#00FF00) in any artwork. Use sage #8B9B6B for any green
elements. Labels on a black strip below each row.
```

## Example: 3 Server Room Scenes

```
Generate 3 isometric server room illustrations on a solid bright green
(#00FF00) chroma-key background. Detailed but clean style, consistent
30-degree isometric perspective, soft shadows within the objects only.

These are decorative illustrations for a homelab monitoring dashboard.

Arrange in a 3x1 grid with at least 100px of solid green gap.
No frames, no borders.

The 3 illustrations:
- **Server Rack** (a 4U server rack seen from isometric angle, dark
  steel gray body, blinking amber status LEDs, mesh ventilation panel,
  copper-colored cables emerging from the back)
- **Network Switch** (a managed switch with 24 ports, charcoal body,
  blue status indicators, patch cables in warm brown and tan plugged
  into 6 ports)
- **NAS Unit** (a 4-bay NAS with drive sleds visible, brushed aluminum
  body, activity lights in amber, a small OLED status display showing
  "OK" in teal)

Style: Polished illustration quality, consistent lighting from top-left.
Readable at 128px with enough detail to reward closer viewing.

NO green (#00FF00) in any artwork. Labels on a black strip below:
SERVER-RACK, NETWORK-SWITCH, NAS-UNIT
```

## Isometric Style Tips

- **30-degree perspective** is the standard — specify it explicitly
- Request "consistent lighting from top-left" for visual coherence across a set
- **Shadows within objects only** — cast shadows on the green background create extraction artifacts
- Use **100px+ gaps** for isometric art (wider than pixel art) since scenes have more detail
- Describe **materials** (brushed aluminum, matte plastic, wood grain) not just colors
- Request "no cast shadows on background" to avoid green-background contamination

## Good Subjects for Isometric

- Desk setups and workstations
- Server racks and networking gear
- Buildings and architecture
- Vehicles and machinery
- Rooms and interior scenes
- Game-style terrain and environments

## Art Style Selection in chromacut

When extracting isometric illustrations, use **Illustrated** mode (LANCZOS resampling) — this preserves smooth edges and fine detail. **Pixel** mode would create jagged edges on the smooth curves typical of isometric art.
