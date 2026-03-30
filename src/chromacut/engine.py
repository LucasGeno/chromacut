"""Chroma-key extraction engine with despill and edge refinement."""

import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion


def despill_extract(
    img: Image.Image,
    low_threshold: float = 30.0,
    high_threshold: float = 200.0,
) -> Image.Image:
    """Remove chroma-key background with spill correction and edge erosion.

    Uses the screen subtraction / green-excess approach from VFX compositing.
    """
    px = np.array(img.convert("RGBA"), dtype=np.float32)
    r, g, b = px[:, :, 0], px[:, :, 1], px[:, :, 2]
    max_rb = np.maximum(r, b)
    green_excess = g - max_rb

    # Alpha ramp: linear from low_threshold (opaque) to high_threshold (transparent)
    alpha = np.clip(
        255 - (green_excess - low_threshold) * (255 / (high_threshold - low_threshold)),
        0,
        255,
    )
    alpha[green_excess > high_threshold] = 0
    alpha[green_excess < low_threshold] = 255

    # Despill: clamp green to max(R, B) — strict VFX standard, no buffer
    despilled_g = np.minimum(g, max_rb)

    # 1px alpha erosion to kill outermost fringe ring
    solid_mask = alpha > 128
    if solid_mask.any():
        eroded = binary_erosion(solid_mask, iterations=1)
        fringe = solid_mask & ~eroded
        alpha[fringe] = 0

    out = np.stack([r, despilled_g, b, alpha], axis=-1).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def pad_and_resize(
    img: Image.Image,
    canvas_size: int = 512,
    padding_pct: float = 0.15,
    resample: str = "lanczos",
) -> Image.Image:
    """Tight-crop to visible content, center on padded canvas, resize."""
    arr = np.array(img)
    alpha = arr[:, :, 3]
    mask = alpha >= 128
    if not mask.any():
        return Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))

    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)
    rmin, rmax = np.where(rows)[0][[0, -1]]
    cmin, cmax = np.where(cols)[0][[0, -1]]
    img = img.crop((cmin, rmin, cmax + 1, rmax + 1))

    inner = int(canvas_size * (1 - padding_pct))
    w, h = img.size
    scale = min(inner / w, inner / h)
    new_w, new_h = int(w * scale), int(h * scale)

    resample_method = Image.NEAREST if resample == "nearest" else Image.LANCZOS
    img = img.resize((new_w, new_h), resample_method)

    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    canvas.paste(img, ((canvas_size - new_w) // 2, (canvas_size - new_h) // 2), img)
    return canvas
