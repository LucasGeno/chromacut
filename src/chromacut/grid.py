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
    key_mask = np.zeros((h, w), dtype=bool)
    for y in range(h):
        key_mask[y] = _is_key_color(arr[y : y + 1], key_color).flatten()

    col_key_pct = key_mask.mean(axis=0)
    row_key_pct = key_mask.mean(axis=1)

    # Find column gaps (vertical bands of key color)
    # Threshold 0.9: a column is "content" if >10% of pixels are non-key.
    # This handles icons that don't fill the full vertical space.
    col_groups = _find_content_bands(col_key_pct < 0.9, min_col_gap)
    row_groups = _find_content_bands(row_key_pct < 0.9, min_row_gap)

    # If no gaps found wide enough for grid, treat as single
    if len(col_groups) <= 1 and len(row_groups) <= 1:
        # Use pixel-level scan for precise single-icon bounds
        non_key = ~key_mask
        content_rows_mask = np.any(non_key, axis=1)
        content_cols_mask = np.any(non_key, axis=0)
        content_rows_idx = np.where(content_rows_mask)[0]
        content_cols_idx = np.where(content_cols_mask)[0]
        if len(content_rows_idx) > 0 and len(content_cols_idx) > 0:
            return [Cell(0, int(content_cols_idx[0]), int(content_rows_idx[0]),
                        int(content_cols_idx[-1] - content_cols_idx[0] + 1),
                        int(content_rows_idx[-1] - content_rows_idx[0] + 1))]
        return [Cell(0, 0, 0, w, h)]

    cells = []
    idx = 0
    for ri, (ry1, ry2) in enumerate(row_groups):
        for ci, (cx1, cx2) in enumerate(col_groups):
            # Expand cell bounds to capture all non-key pixels within this region.
            # The band detection (0.9 threshold) finds the grid structure,
            # but actual content may extend into sparser areas.
            region = key_mask[ry1:ry2, cx1:cx2]
            non_key_region = ~region
            r_rows = np.any(non_key_region, axis=1)
            r_cols = np.any(non_key_region, axis=0)
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

    return cells


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
