from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from chromacut.grid import detect_key_color, detect_content_height, detect_grid, analyze_image


def _make_grid(cols, rows, cell_w=100, cell_h=100, gap=40, label_h=60):
    """Create a synthetic green-screen grid image with label strip."""
    w = cols * cell_w + (cols - 1) * gap
    h = rows * cell_h + (rows - 1) * gap + label_h
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    arr[:, :] = [0, 255, 0, 255]  # green background

    # Draw gray squares in each cell
    for r in range(rows):
        for c in range(cols):
            x0 = c * (cell_w + gap) + 10
            y0 = r * (cell_h + gap) + 10
            arr[y0:y0 + 80, x0:x0 + 80] = [128, 128, 128, 255]

    # Black label strip at bottom
    arr[-label_h:, :] = [0, 0, 0, 255]

    return Image.fromarray(arr, "RGBA")


def test_detect_key_color_green():
    img = _make_grid(2, 1)
    color = detect_key_color(img)
    assert color[1] > 200, f"Should detect green, got {color}"
    assert color[0] < 50 and color[2] < 50


def test_detect_content_height_strips_labels():
    img = _make_grid(2, 1, label_h=60)
    height = detect_content_height(img, key_color=(0, 255, 0))
    # Content height should be image height minus the label bar
    assert height < img.height
    assert height >= img.height - 80  # within tolerance


def test_detect_grid_finds_cells():
    img = _make_grid(3, 1, cell_w=100, gap=50)
    cells = detect_grid(img, key_color=(0, 255, 0), content_height=100)
    assert len(cells) == 3, f"Expected 3 cells, got {len(cells)}"


def test_detect_grid_single_icon():
    """Single icon (no gaps) should return one cell."""
    arr = np.zeros((100, 100, 4), dtype=np.uint8)
    arr[:, :] = [0, 255, 0, 255]
    arr[20:80, 20:80] = [128, 128, 128, 255]
    img = Image.fromarray(arr, "RGBA")
    cells = detect_grid(img, key_color=(0, 255, 0), content_height=100)
    assert len(cells) == 1


def test_analyze_image_full_pipeline():
    img = _make_grid(3, 1)
    result = analyze_image(img)
    assert result["mode"] in ("grid", "single")
    assert "cells" in result
    assert "key_color" in result
    assert "content_height" in result


def test_single_icon_bbox_includes_full_extent():
    """Regression: single-icon bbox should not lose 1px from width/height."""
    arr = np.zeros((100, 100, 4), dtype=np.uint8)
    arr[:, :] = [0, 255, 0, 255]
    arr[20:80, 20:80] = [128, 128, 128, 255]  # 60x60 subject
    img = Image.fromarray(arr, "RGBA")
    cells = detect_grid(img, key_color=(0, 255, 0), content_height=100)
    assert len(cells) == 1
    cell = cells[0]
    assert cell.w == 60, f"Expected width 60, got {cell.w}"
    assert cell.h == 60, f"Expected height 60, got {cell.h}"


def test_gemini_single_detection():
    """Real Gemini single-icon image should detect exactly 1 cell."""
    fixture = Path(__file__).parent / "fixtures" / "gemini-single.png"
    if not fixture.exists():
        pytest.skip("Gemini single fixture not provided yet")
    img = Image.open(fixture)
    result = analyze_image(img)
    assert result["mode"] == "single", f"Expected single mode, got {result['mode']}"
    assert len(result["cells"]) == 1
    cell = result["cells"][0]
    assert cell["w"] < img.width * 0.95, "Cell width too close to full image"
    assert cell["h"] < img.height * 0.95, "Cell height too close to full image"
    assert cell["w"] > 50 and cell["h"] > 50, "Cell too small"


def test_gemini_grid_3x1_detection():
    """Real Gemini 3x1 grid should detect exactly 3 cells."""
    fixture = Path(__file__).parent / "fixtures" / "gemini-grid-3x1.png"
    if not fixture.exists():
        pytest.skip("Gemini 3x1 fixture not provided yet")
    img = Image.open(fixture)
    result = analyze_image(img)
    assert result["mode"] == "grid"
    assert len(result["cells"]) == 3, f"Expected 3 cells, got {len(result['cells'])}"
    for c in result["cells"]:
        assert c["w"] > 50 and c["h"] > 50, f"Cell {c['index']} too small: {c['w']}x{c['h']}"


def test_gemini_grid_4x2_detection():
    """Real Gemini 4x2 grid should detect exactly 8 cells."""
    fixture = Path(__file__).parent / "fixtures" / "gemini-grid-4x2.png"
    if not fixture.exists():
        pytest.skip("Gemini 4x2 fixture not provided yet")
    img = Image.open(fixture)
    result = analyze_image(img)
    assert result["mode"] == "grid"
    assert len(result["cells"]) == 8, f"Expected 8 cells, got {len(result['cells'])}"
    for c in result["cells"]:
        assert c["w"] > 50 and c["h"] > 50, f"Cell {c['index']} too small: {c['w']}x{c['h']}"


def test_gemini_grid_3x1b_detection():
    """Second 3x1 grid variant (server/cloud/bicycle) with smaller icons."""
    fixture = Path(__file__).parent / "fixtures" / "gemini-grid-3x1-b.png"
    if not fixture.exists():
        pytest.skip("Gemini 3x1-b fixture not provided yet")
    img = Image.open(fixture)
    result = analyze_image(img)
    assert result["mode"] == "grid"
    assert len(result["cells"]) == 3, f"Expected 3 cells, got {len(result['cells'])}"
    for c in result["cells"]:
        assert c["w"] > 50 and c["h"] > 50, f"Cell {c['index']} too small: {c['w']}x{c['h']}"


def test_gemini_grid_cells_dont_overlap():
    """Grid cells should not overlap."""
    fixture = Path(__file__).parent / "fixtures" / "gemini-grid-3x1.png"
    if not fixture.exists():
        pytest.skip("Gemini fixture not provided yet")
    img = Image.open(fixture)
    result = analyze_image(img)
    for i, a in enumerate(result["cells"]):
        for j, b in enumerate(result["cells"]):
            if i >= j:
                continue
            overlap_x = max(0, min(a["x"] + a["w"], b["x"] + b["w"]) - max(a["x"], b["x"]))
            overlap_y = max(0, min(a["y"] + a["h"], b["y"] + b["h"]) - max(a["y"], b["y"]))
            assert overlap_x * overlap_y == 0, f"Cells {i} and {j} overlap"
