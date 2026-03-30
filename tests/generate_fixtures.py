"""Generate synthetic green-screen test fixture images."""

import numpy as np
from PIL import Image
from pathlib import Path


def make_single_icon(path: Path):
    """400x400 green background with a centered gray diamond shape."""
    arr = np.zeros((400, 400, 4), dtype=np.uint8)
    arr[:, :] = [0, 255, 0, 255]  # green background

    # Draw a diamond/rhombus shape in gray
    yy, xx = np.mgrid[:400, :400]
    center_y, center_x = 200, 200
    diamond = np.abs(yy - center_y) + np.abs(xx - center_x)
    mask = diamond < 120
    arr[mask] = [140, 120, 100, 255]  # warm gray

    # Add an amber highlight in the center
    inner = diamond < 40
    arr[inner] = [229, 165, 71, 255]  # amber #E5A547

    img = Image.fromarray(arr, "RGBA")
    img.save(path)
    print(f"  Created: {path}")


def make_grid_3x1(path: Path):
    """1200x500 green background with 3 different colored shapes, 80px gaps, black label strip."""
    cell_w, cell_h = 300, 350
    gap = 80
    label_h = 70

    w = 3 * cell_w + 2 * gap  # 1060
    h = cell_h + label_h  # 420

    arr = np.zeros((h, w, 4), dtype=np.uint8)
    arr[:, :] = [0, 255, 0, 255]  # green background

    # Shape 1: Red circle
    yy, xx = np.mgrid[:h, :w]
    cx1 = cell_w // 2
    dist1 = np.sqrt((yy - 175) ** 2 + (xx - cx1) ** 2)
    arr[dist1 < 100] = [180, 60, 60, 255]

    # Shape 2: Blue square
    cx2 = cell_w + gap + cell_w // 2
    x2_start = cx2 - 80
    arr[95:255, x2_start:x2_start + 160] = [60, 80, 180, 255]

    # Shape 3: Brown triangle
    cx3 = 2 * (cell_w + gap) + cell_w // 2
    for y in range(100, 280):
        half_w = int((y - 100) * 0.6)
        left = max(0, cx3 - half_w)
        right = min(w, cx3 + half_w)
        arr[y, left:right] = [160, 120, 80, 255]

    # Black label strip at bottom
    arr[-label_h:, :] = [0, 0, 0, 255]

    img = Image.fromarray(arr, "RGBA")
    img.save(path)
    print(f"  Created: {path}")


if __name__ == "__main__":
    fixtures_dir = Path(__file__).parent / "fixtures"
    fixtures_dir.mkdir(exist_ok=True)

    print("Generating test fixtures...")
    make_single_icon(fixtures_dir / "single-icon.png")
    make_grid_3x1(fixtures_dir / "grid-3x1.png")
    print("Done.")
