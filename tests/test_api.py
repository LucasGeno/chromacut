import base64
import io
import json
import zipfile
from pathlib import Path

import pytest
import numpy as np
from PIL import Image
from fastapi.testclient import TestClient

from chromacut.app import app


client = TestClient(app)
STATIC_DIR = Path(__file__).parents[1] / "src" / "chromacut" / "static"


def _make_test_image():
    """Create a simple green-screen PNG in memory."""
    arr = np.zeros((100, 100, 4), dtype=np.uint8)
    arr[:, :] = [0, 255, 0, 255]
    arr[30:70, 30:70] = [200, 50, 50, 255]
    img = Image.fromarray(arr, "RGBA")
    buf = io.BytesIO()
    img.save(buf, "PNG")
    buf.seek(0)
    return buf


def test_index_returns_html():
    resp = client.get("/")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]


def test_index_opens_on_the_extractor_with_a_bundled_example():
    html = client.get("/").text

    assert 'id="landing"' not in html
    assert 'id="tab-extract"' in html
    assert 'id="btn-choose"' in html
    assert 'id="btn-example"' in html

    example = client.get("/static/example-grid.png")
    assert example.status_code == 200
    assert example.headers["content-type"] == "image/png"


def test_guide_picker_uses_keyboard_native_tab_controls():
    html = client.get("/").text

    assert '<nav class="guides-sidebar" role="tablist"' in html
    assert '<button class="guide-link active"' in html
    assert 'role="tab"' in html
    assert 'aria-selected="true"' in html
    assert '<a class="guide-link' not in html


def test_frontend_local_auth_fallback_is_loopback_only():
    auth_js = (STATIC_DIR / "js" / "auth.js").read_text()

    assert 'new Set(["localhost", "127.0.0.1", "::1"])' in auth_js
    assert auth_js.count("LOCAL_HOSTS.has(window.location.hostname)") == 2


def test_analyze_single_icon():
    buf = _make_test_image()
    resp = client.post("/api/analyze", files={"file": ("test.png", buf, "image/png")})
    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] in ("single", "grid")
    assert "cells" in data
    assert "key_color" in data
    assert len(data["cells"]) >= 1
    assert "previews" in data


def test_analyze_returns_previews():
    """Analyze response should include base64-encoded despilled previews."""
    buf = _make_test_image()
    resp = client.post("/api/analyze", files={"file": ("test.png", buf, "image/png")})
    assert resp.status_code == 200
    data = resp.json()

    assert "previews" in data, "Response should contain previews key"
    assert isinstance(data["previews"], list)
    assert len(data["previews"]) == len(data["cells"])

    # Decode first preview and verify it's a valid RGBA PNG
    preview_b64 = data["previews"][0]
    assert preview_b64.startswith("data:image/png;base64,")
    raw = base64.b64decode(preview_b64.split(",", 1)[1])
    preview_img = Image.open(io.BytesIO(raw))
    assert preview_img.mode == "RGBA"
    assert preview_img.width > 0 and preview_img.height > 0


def test_extract_multi_cell_returns_zip():
    buf = _make_test_image()
    settings = json.dumps({
        "cells": [
            {"index": 0, "name": "icon-1", "x": 0,  "y": 0, "w": 50, "h": 100},
            {"index": 1, "name": "icon-2", "x": 50, "y": 0, "w": 50, "h": 100},
        ],
        "output_size": 256,
        "padding": 0.15,
        "art_style": "pixel",
    })
    resp = client.post(
        "/api/extract",
        files={"file": ("test.png", buf, "image/png")},
        data={"settings": settings},
    )
    assert resp.status_code == 200
    assert "application/zip" in resp.headers["content-type"]

    z = zipfile.ZipFile(io.BytesIO(resp.content))
    names = z.namelist()
    assert "icon-1.png" in names
    assert "icon-2.png" in names

    with z.open("icon-1.png") as f:
        img = Image.open(f)
        assert img.size == (256, 256)
        assert img.mode == "RGBA"


def test_extract_single_cell_returns_png():
    buf = _make_test_image()
    settings = json.dumps({
        "cells": [{"index": 0, "name": "solo-icon", "x": 0, "y": 0, "w": 100, "h": 100}],
        "output_size": 256,
        "padding": 0.15,
        "art_style": "pixel",
    })
    resp = client.post(
        "/api/extract",
        files={"file": ("test.png", buf, "image/png")},
        data={"settings": settings},
    )
    assert resp.status_code == 200
    assert "image/png" in resp.headers["content-type"]
    assert "solo-icon.png" in resp.headers.get("content-disposition", "")

    img = Image.open(io.BytesIO(resp.content))
    assert img.size == (256, 256)
    assert img.mode == "RGBA"


def test_extract_with_explicit_bounds():
    """Extract should work with explicit cell bounds without server-side analysis."""
    buf = _make_test_image()
    settings = json.dumps({
        "cells": [{"index": 0, "name": "bounded-icon", "x": 20, "y": 20, "w": 60, "h": 60}],
        "output_size": 256,
        "padding": 0.15,
        "art_style": "pixel",
    })
    resp = client.post(
        "/api/extract",
        files={"file": ("test.png", buf, "image/png")},
        data={"settings": settings},
    )
    assert resp.status_code == 200
    assert "image/png" in resp.headers["content-type"]
    img = Image.open(io.BytesIO(resp.content))
    assert img.size == (256, 256)


def test_guides_endpoint():
    resp = client.get("/api/guides/general-tips")
    assert resp.status_code == 200
    data = resp.json()
    assert "html" in data


@pytest.mark.parametrize("bad_topic", [
    "..%2f..%2fetc%2fpasswd",  # encoded traversal
    "General-Tips",            # uppercase (allowlist is lowercase)
    "tips.md",                 # dot/extension
    "a" * 65,                  # over length cap
])
def test_guides_rejects_non_allowlisted_topic(bad_topic):
    """The topic param is allowlisted ([a-z0-9-]{1,64}) before touching the
    filesystem, so traversal / unexpected slugs 404 rather than reading arbitrary
    paths or bloating the cache."""
    resp = client.get(f"/api/guides/{bad_topic}")
    assert resp.status_code == 404


def test_extract_sanitizes_traversal_names():
    """Path traversal in icon names must be stripped from the Content-Disposition header."""
    buf = _make_test_image()
    settings = json.dumps({
        "cells": [{"index": 0, "name": "../../../etc/owned", "x": 0, "y": 0, "w": 100, "h": 100}],
        "output_size": 64,
        "padding": 0.1,
        "art_style": "pixel",
    })
    resp = client.post(
        "/api/extract",
        files={"file": ("test.png", buf, "image/png")},
        data={"settings": settings},
    )
    assert resp.status_code == 200
    assert "image/png" in resp.headers["content-type"]
    disposition = resp.headers.get("content-disposition", "")
    assert ".." not in disposition, f"Content-Disposition contains traversal: {disposition}"
    assert "/" not in disposition.split("filename=", 1)[-1], f"Filename contains path separator: {disposition}"


def test_analyze_invalid_image_returns_400():
    buf = io.BytesIO(b"not an image at all")
    resp = client.post("/api/analyze", files={"file": ("bad.png", buf, "image/png")})
    assert resp.status_code == 400


def test_extract_invalid_settings_returns_400():
    buf = _make_test_image()
    resp = client.post(
        "/api/extract",
        files={"file": ("test.png", buf, "image/png")},
        data={"settings": "not json{{{"},
    )
    assert resp.status_code == 400


def test_preview_returns_base64_png():
    """POST /api/preview should return a base64-encoded RGBA PNG for given bounds."""
    buf = _make_test_image()
    settings = json.dumps({"x": 20, "y": 20, "w": 60, "h": 60})
    resp = client.post(
        "/api/preview",
        files={"file": ("test.png", buf, "image/png")},
        data={"settings": settings},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "preview" in data
    assert data["preview"].startswith("data:image/png;base64,")
    raw = base64.b64decode(data["preview"].split(",", 1)[1])
    preview_img = Image.open(io.BytesIO(raw))
    assert preview_img.mode == "RGBA"
    assert preview_img.width > 0 and preview_img.height > 0


def test_preview_rejects_invalid_bounds():
    """POST /api/preview should return 400 for invalid bounds."""
    buf = _make_test_image()
    settings = json.dumps({"x": "bad", "y": 0, "w": 50, "h": 50})
    resp = client.post(
        "/api/preview",
        files={"file": ("test.png", buf, "image/png")},
        data={"settings": settings},
    )
    assert resp.status_code == 400
