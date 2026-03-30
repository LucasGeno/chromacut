import numpy as np
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
