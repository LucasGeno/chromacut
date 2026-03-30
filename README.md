# chromacut

Extract clean, transparent PNGs from AI-generated chroma-key images. A local web app that sits between heavy design tools and one-off scripts.

**What it does:** Drop a green-screen image (single icon or grid), preview the extraction, adjust settings, export clean PNGs. No AI models, no cloud — just fast color-based keying with professional-quality despill and edge refinement.

## Install

```bash
pip install chromacut
```

Requires Python 3.10+. No additional setup needed.

## Usage

### Web UI

```bash
chromacut                    # opens browser at localhost:6100
chromacut --port 8080        # custom port
chromacut --no-open          # don't auto-open browser
```

The web UI has two tabs:

- **Extract** — Drop an image, preview the extraction with instant Canvas-based feedback, adjust output size / padding / art style, name each icon, and export as individual PNGs or a zip.
- **Guides** — Prompt templates and tips for generating good source images with Gemini, ChatGPT, and other AI generators.

### CLI (headless)

For scripting and automation:

```bash
# Single image
chromacut extract source.png --name output-name --output-dir ./out/

# Grid of icons (commas separate columns, semicolons separate rows)
chromacut extract grid.png "icon1,icon2,icon3" --output-dir ./out/

# Pixel art style (NEAREST resampling, preserves crisp edges)
chromacut extract source.png --name icon --style pixel --padding 0.10

# Custom output size
chromacut extract source.png --name icon --size 256
```

## How It Works

Chromacut uses a VFX-standard screen subtraction pipeline:

1. **Auto-detect key color** from image corners
2. **Detect grid cells** (or treat as single icon)
3. **Strip label bars** from the bottom
4. **Compute green excess** — `green_excess = G - max(R, B)`
5. **Alpha ramp** — linear transparency based on excess thresholds
6. **Despill** — clamp green channel to `min(G, max(R, B))`
7. **Alpha erosion** — 1px binary erosion kills outermost fringe
8. **Tight crop, center, resize** — with style-aware resampling (NEAREST for pixel art, LANCZOS for illustrations)

No AI models, no OpenCV. Just NumPy + Pillow + scipy.

## Generating Source Images

Chromacut works best with images generated on solid `#00FF00` backgrounds. The built-in Guides tab has prompt templates for:

- **Pixel art** — SNES-era icons with muted palettes
- **Flat icons** — Clean geometric shapes with bold outlines
- **Isometric** — Detailed illustrated scenes
- **Color palette** — Safe colors that won't interfere with extraction

Key rules for good source images:
- Use solid `#00FF00` green background
- Leave 80px+ gaps between grid icons
- Never use bright green in the artwork (use sage `#8B9B6B` or olive `#6B7B4B`)
- Put labels on a black strip below the content
- For pixel art, request "NO anti-aliasing" in your prompt

## Development

```bash
git clone https://github.com/LucasGeno/chromacut.git
cd chromacut
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/python -m pytest -v
```

## License

MIT
