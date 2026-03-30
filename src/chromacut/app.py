"""FastAPI application with extraction and guide endpoints."""

import io
import json
import zipfile
from pathlib import Path

import markdown
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from PIL import Image

from chromacut.engine import despill_extract, pad_and_resize
from chromacut.grid import analyze_image

STATIC_DIR = Path(__file__).parent / "static"
GUIDES_DIR = Path(__file__).parent / "guides"

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
    img = Image.open(io.BytesIO(contents))
    result = analyze_image(img)
    return JSONResponse(result)


@app.post("/api/extract")
async def extract(file: UploadFile = File(...), settings: str = Form(...)):
    config = json.loads(settings)
    contents = await file.read()
    img = Image.open(io.BytesIO(contents)).convert("RGBA")

    output_size = config.get("output_size", 512)
    padding = config.get("padding", 0.15)
    art_style = config.get("art_style", "lanczos")
    resample = "nearest" if art_style == "pixel" else "lanczos"
    cells = config.get("cells", [{"index": 0, "name": "icon"}])

    # Analyze to get cell boundaries
    analysis = analyze_image(img)
    analyzed_cells = {c["index"]: c for c in analysis["cells"]}

    # Process each requested cell
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for cell_req in cells:
            idx = cell_req["index"]
            name = cell_req.get("name", f"icon-{idx}")
            cell_info = analyzed_cells.get(idx)

            if cell_info:
                cropped = img.crop((
                    cell_info["x"],
                    cell_info["y"],
                    cell_info["x"] + cell_info["w"],
                    cell_info["y"] + cell_info["h"],
                ))
            else:
                cropped = img

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


@app.get("/api/guides/{topic}")
async def get_guide(topic: str):
    if topic in _guide_cache:
        return JSONResponse({"html": _guide_cache[topic]})

    md_file = GUIDES_DIR / f"{topic}.md"
    if not md_file.exists():
        return JSONResponse({"error": "Guide not found"}, status_code=404)

    html = markdown.markdown(md_file.read_text(), extensions=["fenced_code", "tables"])
    _guide_cache[topic] = html
    return JSONResponse({"html": html})
