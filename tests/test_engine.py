from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from chromacut.engine import despill_extract, pad_and_resize


def test_despill_removes_pure_green(green_square):
    result = despill_extract(green_square)
    arr = np.array(result)
    # Pure green areas should be fully transparent
    center_alpha = arr[10, 10, 3]  # green area
    assert center_alpha == 0, f"Green pixel should be transparent, got alpha={center_alpha}"


def test_despill_preserves_subject(green_square):
    result = despill_extract(green_square)
    arr = np.array(result)
    # Red square center should be fully opaque
    center_alpha = arr[50, 50, 3]
    assert center_alpha == 255, f"Subject pixel should be opaque, got alpha={center_alpha}"


def test_despill_removes_green_from_edges(green_circle):
    result = despill_extract(green_circle)
    arr = np.array(result)
    # No pixel should have G significantly higher than max(R, B)
    r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
    visible = a > 10
    if visible.any():
        max_rb = np.maximum(r[visible], b[visible])
        green_excess = g[visible].astype(int) - max_rb.astype(int)
        assert green_excess.max() <= 1, f"Green spill remains: max excess={green_excess.max()}"


def test_despill_no_fringe(green_square):
    """After despill, border pixels adjacent to transparent should not be green-tinted."""
    from scipy.ndimage import binary_dilation
    result = despill_extract(green_square)
    arr = np.array(result)
    r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
    transparent = a < 10
    visible = a > 10
    border = binary_dilation(transparent, iterations=1) & visible
    if border.any():
        green_fringe = border & (g > r * 1.2) & (g > b * 1.2) & (g > 80)
        assert green_fringe.sum() == 0, f"Green fringe pixels: {green_fringe.sum()}"


def test_pad_and_resize_output_size():
    img = Image.new("RGBA", (200, 100), (128, 128, 128, 255))
    result = pad_and_resize(img, canvas_size=512, padding_pct=0.15)
    assert result.size == (512, 512)


def test_pad_and_resize_centers_content():
    img = Image.new("RGBA", (50, 50), (0, 0, 0, 0))
    # Draw a 10x10 block in the corner
    arr = np.array(img)
    arr[0:10, 0:10] = [255, 0, 0, 255]
    img = Image.fromarray(arr, "RGBA")
    result = pad_and_resize(img, canvas_size=100, padding_pct=0.1)
    result_arr = np.array(result)
    # Content should be centered — check that center region has non-zero alpha
    center = result_arr[40:60, 40:60, 3]
    assert center.max() > 0, "Content should be centered on canvas"


def test_pad_and_resize_nearest_for_pixel_art():
    """NEAREST resampling should not create new intermediate colors."""
    arr = np.zeros((10, 10, 4), dtype=np.uint8)
    arr[3:7, 3:7] = [255, 0, 0, 255]
    img = Image.fromarray(arr, "RGBA")
    result = pad_and_resize(img, canvas_size=100, padding_pct=0.1, resample="nearest")
    result_arr = np.array(result)
    visible = result_arr[:, :, 3] > 0
    reds = result_arr[visible, 0]
    # With NEAREST, all visible pixels should be exactly 255 (the original red)
    assert (reds == 255).all(), "NEAREST should preserve exact pixel values"


def test_full_pipeline_single_fixture():
    """End-to-end: load fixture -> analyze -> extract -> verify clean output."""
    from chromacut.grid import analyze_image
    from scipy.ndimage import binary_dilation

    fixture = Path(__file__).parent / "fixtures" / "single-icon.png"
    if not fixture.exists():
        pytest.skip("Fixture not generated")

    img = Image.open(fixture).convert("RGBA")
    analysis = analyze_image(img)
    assert analysis["mode"] == "single"

    cell = analysis["cells"][0]
    cropped = img.crop((cell["x"], cell["y"], cell["x"] + cell["w"], cell["y"] + cell["h"]))
    processed = despill_extract(cropped)
    result = pad_and_resize(processed, 512, 0.15)

    arr = np.array(result)
    # Zero green fringe
    a = arr[:, :, 3]
    transparent = a < 10
    visible = a > 10
    border = binary_dilation(transparent, iterations=1) & visible
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    green_fringe = border & (g > r * 1.2) & (g > b * 1.2) & (g > 80)
    assert green_fringe.sum() == 0, f"Green fringe pixels found: {green_fringe.sum()}"


def test_erosion_scales_with_resolution():
    """Larger images should get more erosion iterations, capped at 3."""
    # Small image: 100x100 -> iterations=1
    small_arr = np.zeros((100, 100, 4), dtype=np.uint8)
    small_arr[:, :] = [0, 255, 0, 255]
    small_arr[20:80, 20:80] = [200, 50, 50, 255]
    small_img = Image.fromarray(small_arr, "RGBA")
    small_result = despill_extract(small_img)
    small_alpha = np.array(small_result)[:, :, 3]
    small_visible = (small_alpha > 0).sum()

    # Large image: 600x600 -> iterations=3 (600//200=3, capped at 3)
    large_arr = np.zeros((600, 600, 4), dtype=np.uint8)
    large_arr[:, :] = [0, 255, 0, 255]
    large_arr[120:480, 120:480] = [200, 50, 50, 255]
    large_img = Image.fromarray(large_arr, "RGBA")
    large_result = despill_extract(large_img)
    large_alpha = np.array(large_result)[:, :, 3]
    large_visible = (large_alpha > 0).sum()

    # The large image has a 360x360 subject (6x the 60x60 small subject).
    # With static 1-iteration erosion, the large image loses only 2px each side -> ratio ~38.1.
    # With proportional erosion (3 iterations on large vs 1 on small), 6px are stripped
    # from each side of the large subject, reducing the ratio measurably below 38.0.
    static_erosion_ratio = 38.0  # baseline: both images at iterations=1
    visible_ratio = large_visible / small_visible
    assert visible_ratio < static_erosion_ratio, (
        f"Erosion should remove proportionally more from large image. "
        f"Static-erosion baseline ratio: {static_erosion_ratio}, visible ratio: {visible_ratio:.1f}"
    )


def test_despill_crop_tight_crops():
    """despill_crop should return a tight-cropped RGBA image with no empty border."""
    # 200x200 green image with 60x60 red square at (70, 70)
    arr = np.zeros((200, 200, 4), dtype=np.uint8)
    arr[:, :] = [0, 255, 0, 255]
    arr[70:130, 70:130] = [200, 50, 50, 255]
    img = Image.fromarray(arr, "RGBA")

    from chromacut.engine import despill_crop
    cell = {"x": 0, "y": 0, "w": 200, "h": 200}
    result = despill_crop(img, cell)

    result_arr = np.array(result)
    # No fully transparent border rows
    assert result_arr[0, :, 3].max() > 0, "Top row should have content"
    assert result_arr[-1, :, 3].max() > 0, "Bottom row should have content"
    assert result_arr[:, 0, 3].max() > 0, "Left column should have content"
    assert result_arr[:, -1, 3].max() > 0, "Right column should have content"
    assert result.mode == "RGBA"


def test_full_pipeline_grid_fixture():
    """End-to-end: load grid fixture -> analyze -> extract all cells."""
    from chromacut.grid import analyze_image

    fixture = Path(__file__).parent / "fixtures" / "grid-3x1.png"
    if not fixture.exists():
        pytest.skip("Fixture not generated")

    img = Image.open(fixture).convert("RGBA")
    analysis = analyze_image(img)
    assert analysis["mode"] == "grid"
    assert len(analysis["cells"]) == 3, f"Expected 3 cells, got {len(analysis['cells'])}"

    for cell in analysis["cells"]:
        cropped = img.crop((cell["x"], cell["y"], cell["x"] + cell["w"], cell["y"] + cell["h"]))
        processed = despill_extract(cropped)
        result = pad_and_resize(processed, 256, 0.15, "nearest")
        assert result.size == (256, 256)
        # Verify non-empty — should have visible content
        arr = np.array(result)
        assert (arr[:, :, 3] > 0).sum() > 100, "Extracted cell should have visible content"
