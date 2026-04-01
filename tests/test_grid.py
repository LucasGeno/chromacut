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
    """Single-icon bbox should include content plus margin."""
    arr = np.zeros((100, 100, 4), dtype=np.uint8)
    arr[:, :] = [0, 255, 0, 255]
    arr[20:80, 20:80] = [128, 128, 128, 255]  # 60x60 subject
    img = Image.fromarray(arr, "RGBA")
    cells = detect_grid(img, key_color=(0, 255, 0), content_height=100)
    assert len(cells) == 1
    cell = cells[0]
    # Content is 60x60. Margin = max(4, min(20, round(60*0.03))) = 4px per side.
    # So bounds should be ~68x68 centered on the content.
    assert cell.w >= 60, f"Width should be at least content width, got {cell.w}"
    assert cell.h >= 60, f"Height should be at least content height, got {cell.h}"
    assert cell.w <= 68, f"Width should not exceed content + 2*4px margin, got {cell.w}"
    assert cell.h <= 68, f"Height should not exceed content + 2*4px margin, got {cell.h}"
    assert cell.x <= 20, f"X should be at or before content start, got {cell.x}"
    assert cell.y <= 20, f"Y should be at or before content start, got {cell.y}"


def test_cell_margin_clamps_at_image_edge():
    """Margin should not push cell bounds outside the image."""
    arr = np.zeros((100, 100, 4), dtype=np.uint8)
    arr[:, :] = [0, 255, 0, 255]
    # Content block touching the top-left corner
    arr[0:50, 0:50] = [128, 128, 128, 255]
    img = Image.fromarray(arr, "RGBA")
    cells = detect_grid(img, key_color=(0, 255, 0), content_height=100)
    assert len(cells) == 1
    cell = cells[0]
    assert cell.x >= 0, f"X should not be negative, got {cell.x}"
    assert cell.y >= 0, f"Y should not be negative, got {cell.y}"
    assert cell.x + cell.w <= 100, f"Right edge exceeds image, got {cell.x + cell.w}"
    assert cell.y + cell.h <= 100, f"Bottom edge exceeds image, got {cell.y + cell.h}"
    # Should still have margin on the right/bottom sides
    assert cell.w > 50, f"Width should include margin on right side, got {cell.w}"
    assert cell.h > 50, f"Height should include margin on bottom side, got {cell.h}"


def test_cell_margin_no_overlap():
    """Neighbor-aware margin clamping should prevent cell overlap."""
    # 2x1 grid: two 80px cells with only 10px gap between them
    arr = np.zeros((100, 200, 4), dtype=np.uint8)
    arr[:, :] = [0, 255, 0, 255]
    arr[10:90, 10:90] = [128, 128, 128, 255]    # Left cell: 80x80
    arr[10:90, 100:180] = [128, 128, 128, 255]   # Right cell: 80x80, 10px gap
    img = Image.fromarray(arr, "RGBA")
    cells = detect_grid(img, key_color=(0, 255, 0), content_height=100)
    assert len(cells) == 2, f"Expected 2 cells, got {len(cells)}"
    a, b = cells[0], cells[1]
    # Ensure no overlap
    if a.x > b.x:
        a, b = b, a
    assert a.x + a.w <= b.x, f"Cells overlap: a ends at {a.x + a.w}, b starts at {b.x}"


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


@pytest.mark.parametrize("fixture,expected_mode,expected_cells", [
    ("grid-3x1-isometric.png", "grid", 3),
    ("single-microscope.png", "single", 1),
    ("grid-3x1-isometric-large.png", "grid", 3),
    ("grid-4x3-animals.png", "grid", 12),
    ("grid-4x2-services.png", "grid", 8),
    ("single-desk.png", "single", 1),
])
def test_real_image_detection(fixture, expected_mode, expected_cells):
    """Regression tests against real Gemini-generated images."""
    path = Path(__file__).parent / "fixtures" / fixture
    if not path.exists():
        pytest.skip(f"Fixture {fixture} not provided")
    img = Image.open(path)
    result = analyze_image(img)
    assert result["mode"] == expected_mode, f"Expected mode={expected_mode}, got {result['mode']}"
    assert len(result["cells"]) == expected_cells, (
        f"Expected {expected_cells} cells, got {len(result['cells'])}"
    )
    # All cells should be reasonably sized
    for c in result["cells"]:
        assert c["w"] > 50 and c["h"] > 50, f"Cell {c['index']} too small: {c['w']}x{c['h']}"
    # No cells should overlap
    cells = result["cells"]
    for i, a in enumerate(cells):
        for j, b in enumerate(cells):
            if i >= j:
                continue
            ox = max(0, min(a["x"] + a["w"], b["x"] + b["w"]) - max(a["x"], b["x"]))
            oy = max(0, min(a["y"] + a["h"], b["y"] + b["h"]) - max(a["y"], b["y"]))
            assert ox * oy == 0, f"Cells {i} and {j} overlap"


def _make_narrow_gap_grid(cols, cell_w=100, cell_h=100, inner_gap=5, margin=15, label_h=60):
    """Create a grid with narrow inner gaps that _find_content_bands can't detect.

    Uses gaps narrow enough (5px default) that they fall below the min_gap threshold,
    causing adjacent cells to merge into one band.
    """
    w = margin + cols * cell_w + (cols - 1) * inner_gap + margin
    h = cell_h + label_h
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    arr[:, :] = [0, 255, 0, 255]

    for c in range(cols):
        x0 = margin + c * (cell_w + inner_gap)
        arr[10:cell_h - 10, x0:x0 + cell_w] = [128, 128, 128, 255]

    arr[-label_h:, :] = [0, 0, 0, 255]
    return Image.fromarray(arr, "RGBA")


def test_narrow_gap_grid_splits_merged_bands():
    """4x1 grid with 5px inner gaps should detect 4 cells after post-split.
    The gaps are too narrow for _find_content_bands (min_gap=20), so the
    post-split pass must find the key-color valleys and split the merged band."""
    img = _make_narrow_gap_grid(4, cell_w=100, inner_gap=5)
    result = analyze_image(img)
    assert len(result["cells"]) == 4, f"Expected 4 cells, got {len(result['cells'])}"


def test_single_band_full_merge_splits():
    """3x1 grid with 5px gaps — all merge into one band.
    Single-band fallback (>40% width) should split into 3 cells."""
    img = _make_narrow_gap_grid(3, cell_w=100, inner_gap=5, margin=10)
    result = analyze_image(img)
    assert len(result["cells"]) == 3, f"Expected 3 cells, got {len(result['cells'])}"


def test_three_way_merge_recursive_split():
    """3x1 grid inside one band requiring two recursive splits."""
    img = _make_narrow_gap_grid(3, cell_w=120, inner_gap=6, margin=10)
    result = analyze_image(img)
    assert len(result["cells"]) == 3, f"Expected 3 cells, got {len(result['cells'])}"


def test_wide_single_icon_not_falsely_split():
    """A single 200px-wide icon should not be split."""
    w = 300
    h = 200 + 60
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    arr[:, :] = [0, 255, 0, 255]
    arr[20:180, 50:250] = [128, 128, 128, 255]
    arr[-60:, :] = [0, 0, 0, 255]
    img = Image.fromarray(arr, "RGBA")
    result = analyze_image(img)
    assert len(result["cells"]) == 1, f"Expected 1 cell, got {len(result['cells'])}"


def test_row_narrow_gap_splits():
    """2x2 grid with narrow row gaps (5px) but normal column gaps (50px).
    Row post-split should handle the merge."""
    cell_w, cell_h = 100, 100
    col_gap, row_gap = 50, 5
    w = 2 * cell_w + col_gap
    h = 2 * cell_h + row_gap + 60
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    arr[:, :] = [0, 255, 0, 255]

    for r in range(2):
        for c in range(2):
            x0 = c * (cell_w + col_gap) + 10
            y0 = r * (cell_h + row_gap) + 10
            arr[y0:y0 + 80, x0:x0 + 80] = [128, 128, 128, 255]

    arr[-60:, :] = [0, 0, 0, 255]
    img = Image.fromarray(arr, "RGBA")
    result = analyze_image(img)
    assert len(result["cells"]) == 4, f"Expected 4 cells, got {len(result['cells'])}"
