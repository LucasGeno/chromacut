# chromacut

Extract clean, transparent PNGs from AI-generated chroma-key images. A local web app that sits between heavy design tools and one-off scripts.

**What it does:** Drop or paste a green-screen image (single icon or grid), preview the extraction with VFX-quality despill, adjust cell bounds interactively, and export clean PNGs. No AI models, no cloud — just fast color-based keying with professional-quality edge refinement.

**Try it without installing:** a hosted instance runs at **[lucasreed.me/chromacut](https://lucasreed.me/chromacut)**. The landing page and tool UI are public; running an extraction requires signing in (it's gated to keep anonymous compute abuse out). For unlimited, fully-local use with no sign-in, install it yourself below.

## Install

Requires Python 3.10+. No additional setup needed. Install from source:

```bash
pip install git+https://github.com/LucasGeno/chromacut.git
```

Then launch the web UI:

```bash
chromacut                    # opens browser at localhost:6100
```

## Usage

### Web UI

```bash
chromacut                    # opens browser at localhost:6100
chromacut --port 8080        # custom port
chromacut --host 0.0.0.0     # bind all interfaces
chromacut --no-open          # don't auto-open browser
```

The web UI has two tabs:

- **Extract** — Drop or paste an image (Cmd+V), preview extraction with instant feedback, adjust output size / padding / art style, name each icon, and export as a zip of PNGs.
- **Guides** — Prompt templates and tips for generating good source images with Gemini, ChatGPT, and other AI generators.

### Interactive Cell Editing

After dropping an image, chromacut auto-detects grid cells. You can adjust them:

- **Click** a cell to select it (magenta handles appear)
- **Drag** inside to move, drag handles to resize
- **Arrow keys** nudge by 1px (Shift+Arrow = 10px)
- **Reset boxes** button restores auto-detected bounds
- **Space** hold for before/after preview toggle

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
2. **Detect grid cells** with post-split for narrow gaps between icons
3. **Strip label bars** from the bottom
4. **Compute green excess** — `green_excess = G - max(R, B)`
5. **Alpha ramp** — linear transparency based on excess thresholds
6. **Despill** — clamp green channel to `min(G, max(R, B))`
7. **Resolution-proportional erosion** — binary erosion scaled to image size (capped at 3 iterations)
8. **Tight crop, center, resize** — with style-aware resampling (NEAREST for pixel art, LANCZOS for illustrations)

Preview parity: the web UI preview uses the same backend despill pipeline as the export, so what you see is what you get.

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

### Test Suite

53 tests across 4 files covering engine (despill, erosion, resize), grid detection (synthetic + 9 real Gemini fixtures), API endpoints (analyze, extract, preview, validation), and shared utilities.

## License

[MIT](LICENSE) © Lucas Reed. Free to use, modify, and distribute.
