"""Grid detection and cell boundary analysis for chroma-key images."""

from dataclasses import dataclass

import numpy as np
from PIL import Image


@dataclass
class Cell:
    index: int
    x: int
    y: int
    w: int
    h: int


def _overlaps_y(a: Cell, b: Cell) -> bool:
    """Check if two cells share any vertical range (horizontally adjacent)."""
    return a.y < b.y + b.h and b.y < a.y + a.h


def _overlaps_x(a: Cell, b: Cell) -> bool:
    """Check if two cells share any horizontal range (vertically adjacent)."""
    return a.x < b.x + b.w and b.x < a.x + a.w


def _add_cell_margins(cells: list[Cell], img_w: int, img_h: int) -> None:
    """Expand cell bounds with neighbor-aware margin clamping.

    Adds 3% of cell dimension per side (min 4px, max 20px), but caps
    expansion at half the gap to the nearest neighbor to prevent overlap.
    Mutates cells in place.
    """
    for c in cells:
        mx = max(4, min(20, round(c.w * 0.03)))
        my = max(4, min(20, round(c.h * 0.03)))

        for other in cells:
            if other is c:
                continue
            # Cap horizontal margin at half the gap to neighbor
            if _overlaps_y(c, other):
                if other.x > c.x + c.w:  # other is to the right
                    mx = min(mx, (other.x - (c.x + c.w)) // 2)
                elif c.x > other.x + other.w:  # other is to the left
                    mx = min(mx, (c.x - (other.x + other.w)) // 2)
            # Cap vertical margin at half the gap to neighbor
            if _overlaps_x(c, other):
                if other.y > c.y + c.h:  # other is below
                    my = min(my, (other.y - (c.y + c.h)) // 2)
                elif c.y > other.y + other.h:  # other is above
                    my = min(my, (c.y - (other.y + other.h)) // 2)

        mx = max(0, mx)
        my = max(0, my)
        c.x = max(0, c.x - mx)
        c.y = max(0, c.y - my)
        c.w = min(img_w - c.x, c.w + 2 * mx)
        c.h = min(img_h - c.y, c.h + 2 * my)


def detect_key_color(img: Image.Image, sample_size: int = 16) -> tuple[int, int, int]:
    """Detect the chroma-key color by sampling image corners."""
    arr = np.array(img.convert("RGB"))
    h, w = arr.shape[:2]
    # Sample all four corners, then use the mode (most common color cluster)
    # to avoid contamination from label strips at the bottom
    corners = [
        arr[:sample_size, :sample_size],
        arr[:sample_size, w - sample_size :],
        arr[h - sample_size :, :sample_size],
        arr[h - sample_size :, w - sample_size :],
    ]
    samples = np.concatenate([c.reshape(-1, 3) for c in corners])

    # Cluster by rounding to nearest 32 and picking the largest cluster
    quantized = (samples // 32).astype(int)
    keys = quantized[:, 0] * 10000 + quantized[:, 1] * 100 + quantized[:, 2]
    unique_keys, counts = np.unique(keys, return_counts=True)
    dominant_key = unique_keys[np.argmax(counts)]
    mask = keys == dominant_key
    median = np.median(samples[mask], axis=0).astype(int)

    # Check if it's a saturated color (not gray/white/black)
    max_c = int(median.max())
    min_c = int(median.min())
    if max_c - min_c < 50:
        return (0, 255, 0)  # default to green if ambiguous
    return (int(median[0]), int(median[1]), int(median[2]))


def _is_key_color(pixels: np.ndarray, key_color: tuple[int, int, int], tolerance: int = 80) -> np.ndarray:
    """Check which pixels match the key color within tolerance.

    Accepts (N, 3+) or (1, N, 3+) shaped arrays; always returns a 1-D bool array of length N.
    """
    if pixels.ndim == 3:
        pixels = pixels.reshape(-1, pixels.shape[-1])
    diff = np.abs(pixels[:, :3].astype(int) - np.array(key_color))
    return diff.sum(axis=-1) < tolerance * 3


def detect_content_height(img: Image.Image, key_color: tuple[int, int, int]) -> int:
    """Find where the label strip starts by scanning from bottom up."""
    arr = np.array(img.convert("RGB"))
    h, w = arr.shape[:2]
    for y in range(h - 1, 0, -1):
        key_count = _is_key_color(arr[y : y + 1], key_color).sum()
        if key_count / w > 0.3:
            return y + 1
    return h


def detect_grid(
    img: Image.Image,
    key_color: tuple[int, int, int],
    content_height: int,
) -> list[Cell]:
    """Detect grid cells by finding key-color gaps between content regions."""
    arr = np.array(img.convert("RGB"))[:content_height]
    h, w = arr.shape[:2]

    # Minimum gap sizes (percentage-based with min clamps)
    min_col_gap = max(20, int(w * 0.03))
    min_row_gap = max(20, int(h * 0.03))

    # Find key-color columns and rows
    key_mask = _is_key_color(arr.reshape(-1, arr.shape[-1]), key_color).reshape(h, w)

    col_key_pct = key_mask.mean(axis=0)
    row_key_pct = key_mask.mean(axis=1)

    # Find column gaps (vertical bands of key color)
    # Threshold 0.9: a column is "content" if >10% of pixels are non-key.
    # This handles icons that don't fill the full vertical space.
    col_groups = _find_content_bands(col_key_pct < 0.9, min_col_gap)
    col_groups = _try_split_wide_bands(col_groups, col_key_pct, w)
    row_groups = _find_content_bands(row_key_pct < 0.9, min_row_gap)
    row_groups = _try_split_wide_bands(row_groups, row_key_pct, h)

    # If no gaps found wide enough for grid, treat as single
    if len(col_groups) <= 1 and len(row_groups) <= 1:
        # Use density-based scan: a row/col is "content" if >= 2% of pixels
        # are non-key. This filters out shadow gradients and stray pixels.
        non_key = ~key_mask
        content_density = 0.05
        content_rows_mask = non_key.mean(axis=1) >= content_density
        content_cols_mask = non_key.mean(axis=0) >= content_density
        content_rows_idx = np.where(content_rows_mask)[0]
        content_cols_idx = np.where(content_cols_mask)[0]
        if len(content_rows_idx) > 0 and len(content_cols_idx) > 0:
            single = [Cell(0, int(content_cols_idx[0]), int(content_rows_idx[0]),
                          int(content_cols_idx[-1] - content_cols_idx[0] + 1),
                          int(content_rows_idx[-1] - content_rows_idx[0] + 1))]
            _add_cell_margins(single, w, h)
            return single
        return [Cell(0, 0, 0, w, h)]

    cells = []
    idx = 0
    for ri, (ry1, ry2) in enumerate(row_groups):
        for ci, (cx1, cx2) in enumerate(col_groups):
            # Tighten cell bounds using density-based scan within each region.
            # Requires >= 2% non-key pixels in a row/col to count as content.
            # This filters out shadow gradients cast into the green background.
            region = key_mask[ry1:ry2, cx1:cx2]
            non_key_region = ~region
            content_density = 0.05
            r_rows = non_key_region.mean(axis=1) >= content_density
            r_cols = non_key_region.mean(axis=0) >= content_density
            r_row_idx = np.where(r_rows)[0]
            r_col_idx = np.where(r_cols)[0]
            if len(r_row_idx) > 0 and len(r_col_idx) > 0:
                # Tight bounds within the cell region
                cy = ry1 + int(r_row_idx[0])
                cx = cx1 + int(r_col_idx[0])
                cw = int(r_col_idx[-1] - r_col_idx[0] + 1)
                ch = int(r_row_idx[-1] - r_row_idx[0] + 1)
                cells.append(Cell(idx, cx, cy, cw, ch))
            else:
                cells.append(Cell(idx, cx1, ry1, cx2 - cx1, ry2 - ry1))
            idx += 1

    # Filter out cells that are too small (likely label strips or noise)
    min_w = max(30, int(w * 0.05))
    min_h = max(30, int(h * 0.10))
    cells = [c for c in cells if c.w >= min_w and c.h >= min_h]
    # Re-index after filtering
    for i, c in enumerate(cells):
        c.index = i

    _add_cell_margins(cells, w, h)
    return cells


def _try_split_wide_bands(
    bands: list[tuple[int, int]],
    key_pct: np.ndarray,
    total_dim: int | None = None,
    _depth: int = 0,
) -> list[tuple[int, int]]:
    """Split wide content bands that likely contain merged icons.

    Looks for key-color valleys within oversized bands and splits there.
    """
    if _depth >= 3 or len(bands) == 0:
        return bands

    widths = [e - s for s, e in bands]
    targets = []

    if len(bands) == 1:
        dim = total_dim or len(key_pct)
        if widths[0] > dim * 0.4:
            targets = [0]
    else:
        median_w = sorted(widths)[len(widths) // 2]
        targets = [i for i, w in enumerate(widths) if w > median_w * 1.8]

    if not targets:
        return bands

    result = []
    for i, (s, e) in enumerate(bands):
        if i not in targets:
            result.append((s, e))
            continue

        band_w = e - s
        margin = max(1, int(band_w * 0.1))
        interior = key_pct[s + margin : e - margin]

        if len(interior) == 0:
            result.append((s, e))
            continue

        best_offset = int(np.argmax(interior))
        best_col = s + margin + best_offset
        best_density = float(interior[best_offset])

        if best_density < 0.8:
            result.append((s, e))
            continue

        if best_col - s < margin or e - best_col < margin:
            result.append((s, e))
            continue

        left = (s, best_col)
        right = (best_col + 1, e)
        if left[1] - left[0] < 20 or right[1] - right[0] < 20:
            result.append((s, e))
            continue

        result.extend(_try_split_wide_bands([left], key_pct, total_dim, _depth + 1))
        result.extend(_try_split_wide_bands([right], key_pct, total_dim, _depth + 1))

    result.sort(key=lambda x: x[0])
    return result


def _find_content_bands(is_content: np.ndarray, min_gap: int) -> list[tuple[int, int]]:
    """Find contiguous bands of content separated by gaps >= min_gap."""
    bands = []
    in_band = False
    start = 0
    gap_count = 0

    for i, val in enumerate(is_content):
        if val:
            if not in_band:
                start = i
                in_band = True
            gap_count = 0
        else:
            if in_band:
                gap_count += 1
                if gap_count >= min_gap:
                    bands.append((start, i - gap_count))
                    in_band = False
                    gap_count = 0

    if in_band:
        bands.append((start, len(is_content)))

    # Filter out degenerate bands (narrower than min_gap)
    bands = [(s, e) for s, e in bands if e - s >= min_gap]
    return bands if bands else [(0, len(is_content))]


def analyze_image(img: Image.Image) -> dict:
    """Full analysis: detect key color, content height, and grid cells."""
    key_color = detect_key_color(img)
    content_height = detect_content_height(img, key_color)
    cells = detect_grid(img, key_color, content_height)

    mode = "grid" if len(cells) > 1 else "single"
    return {
        "mode": mode,
        "key_color": list(key_color),
        "content_height": content_height,
        "cells": [{"index": c.index, "x": c.x, "y": c.y, "w": c.w, "h": c.h} for c in cells],
    }
