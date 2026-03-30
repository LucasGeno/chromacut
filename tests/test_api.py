import io
import json
import zipfile

import numpy as np
from PIL import Image
from fastapi.testclient import TestClient

from chromacut.app import app


client = TestClient(app)


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


def test_analyze_single_icon():
    buf = _make_test_image()
    resp = client.post("/api/analyze", files={"file": ("test.png", buf, "image/png")})
    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] in ("single", "grid")
    assert "cells" in data
    assert "key_color" in data
    assert len(data["cells"]) >= 1


def test_extract_returns_zip():
    buf = _make_test_image()
    settings = json.dumps({
        "cells": [{"index": 0, "name": "test-icon"}],
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
    assert "test-icon.png" in names

    # Verify the extracted PNG is valid and correct size
    with z.open("test-icon.png") as f:
        img = Image.open(f)
        assert img.size == (256, 256)
        assert img.mode == "RGBA"


def test_guides_endpoint():
    resp = client.get("/api/guides/general-tips")
    assert resp.status_code == 200
    data = resp.json()
    assert "html" in data


def test_extract_sanitizes_traversal_names():
    """Path traversal in icon names must be stripped from zip entries."""
    buf = _make_test_image()
    settings = json.dumps({
        "cells": [{"index": 0, "name": "../../../etc/owned"}],
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
    z = zipfile.ZipFile(io.BytesIO(resp.content))
    for name in z.namelist():
        assert ".." not in name, f"Zip entry contains traversal: {name}"
        assert "/" not in name, f"Zip entry contains path separator: {name}"


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
