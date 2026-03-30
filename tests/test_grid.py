import numpy as np
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
