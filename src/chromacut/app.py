"""FastAPI application with extraction and guide endpoints."""

import base64
import io
import json
import re
import warnings
import zipfile
from pathlib import Path

import markdown
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from PIL import Image

from chromacut.engine import despill_crop, despill_extract, pad_and_resize
from chromacut.grid import analyze_image
from chromacut.utils import sanitize_name

STATIC_DIR = Path(__file__).parent / "static"
GUIDES_DIR = Path(__file__).parent / "guides"
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB

# Decompression-bomb guard: cap the total pixel count Pillow will decode and
# promote its soft warning to a hard error. A small file can still expand to a
# huge raster on load(); without this, the byte-size cap above wouldn't stop it.
# ~64 MP (≈8000×8000) is far above any real chroma-key icon sheet. The resulting
# DecompressionBombError/Warning is caught by each endpoint's try/except → 400.
Image.MAX_IMAGE_PIXELS = 64_000_000
warnings.simplefilter("error", Image.DecompressionBombWarning)

app = FastAPI(title="chromacut")

# Serve static files (CSS, JS)
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Guide cache
_guide_cache: dict[str, str] = {}


@app.get("/", response_class=HTMLResponse)
async def index():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return HTMLResponse(index_file.read_text())
    return HTMLResponse("<h1>chromacut</h1><p>Static files not found.</p>")


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)):
    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        return JSONResponse({"error": "File too large (max 50 MB)"}, status_code=413)
    try:
        img = Image.open(io.BytesIO(contents))
        img.load()
    except Exception:
        return JSONResponse({"error": "Invalid image file"}, status_code=400)
    result = analyze_image(img)

    # Generate despilled preview crops for each cell
    img_rgba = img.convert("RGBA")
    previews = []
    for cell in result["cells"]:
        preview = despill_crop(img_rgba, cell)
        buf_preview = io.BytesIO()
        preview.save(buf_preview, "PNG")
        b64 = base64.b64encode(buf_preview.getvalue()).decode("ascii")
        previews.append(f"data:image/png;base64,{b64}")
    result["previews"] = previews

    return JSONResponse(result)


@app.post("/api/extract")
async def extract(file: UploadFile = File(...), settings: str = Form(...)):
    try:
        config = json.loads(settings)
    except (json.JSONDecodeError, TypeError):
        return JSONResponse({"error": "Invalid settings JSON"}, status_code=400)

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        return JSONResponse({"error": "File too large (max 50 MB)"}, status_code=413)
    try:
        img = Image.open(io.BytesIO(contents)).convert("RGBA")
        img.load()
    except Exception:
        return JSONResponse({"error": "Invalid image file"}, status_code=400)

    output_size = config.get("output_size", 512)
    padding = config.get("padding", 0.15)
    art_style = config.get("art_style", "lanczos")
    resample = "nearest" if art_style == "pixel" else "lanczos"
    cells = config.get("cells", [{"index": 0, "name": "icon"}])

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
            headers={"Content-Disposition": f'attachment; filename="{name}.png"'},
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


@app.post("/api/preview")
async def preview(file: UploadFile = File(...), settings: str = Form(...)):
    try:
        config = json.loads(settings)
    except (json.JSONDecodeError, TypeError):
        return JSONResponse({"error": "Invalid settings JSON"}, status_code=400)

    try:
        cx = int(config["x"])
        cy = int(config["y"])
        cw = int(config["w"])
        ch = int(config["h"])
    except (KeyError, TypeError, ValueError):
        return JSONResponse({"error": "Missing or non-numeric bounds (x, y, w, h required)"}, status_code=400)

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        return JSONResponse({"error": "File too large (max 50 MB)"}, status_code=413)
    try:
        img = Image.open(io.BytesIO(contents)).convert("RGBA")
        img.load()
    except Exception:
        return JSONResponse({"error": "Invalid image file"}, status_code=400)

    cx = max(0, min(cx, img.width - 1))
    cy = max(0, min(cy, img.height - 1))
    cw = min(cw, img.width - cx)
    ch = min(ch, img.height - cy)

    if cw < 20 or ch < 20:
        return JSONResponse({"error": "Crop area too small (min 20x20)"}, status_code=400)

    cell = {"x": cx, "y": cy, "w": cw, "h": ch}
    result = despill_crop(img, cell)
    buf = io.BytesIO()
    result.save(buf, "PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return JSONResponse({"preview": f"data:image/png;base64,{b64}"})


@app.get("/api/guides/{topic}")
async def get_guide(topic: str):
    # Allowlist the topic: guide slugs are lowercase-alphanumeric + hyphen. This
    # blocks path traversal (encoded dot-segments, separators) and bounds the
    # cache keyspace before the topic touches the filesystem.
    if not re.fullmatch(r"[a-z0-9-]{1,64}", topic):
        return JSONResponse({"error": "Guide not found"}, status_code=404)
    if topic in _guide_cache:
        return JSONResponse({"html": _guide_cache[topic]})

    md_file = GUIDES_DIR / f"{topic}.md"
    if not md_file.exists():
        return JSONResponse({"error": "Guide not found"}, status_code=404)

    html = markdown.markdown(md_file.read_text(), extensions=["fenced_code", "tables"])
    _guide_cache[topic] = html
    return JSONResponse({"html": html})
