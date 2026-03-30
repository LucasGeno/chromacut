import numpy as np
from PIL import Image
import pytest


@pytest.fixture
def green_square():
    """A 100x100 green image with a 40x40 red square centered in it."""
    arr = np.zeros((100, 100, 4), dtype=np.uint8)
    arr[:, :] = [0, 255, 0, 255]  # pure green background
    arr[30:70, 30:70] = [200, 50, 50, 255]  # red square
    return Image.fromarray(arr, "RGBA")


@pytest.fixture
def green_circle():
    """A 100x100 green image with an anti-aliased gray circle."""
    arr = np.zeros((100, 100, 4), dtype=np.uint8)
    arr[:, :] = [0, 255, 0, 255]
    yy, xx = np.mgrid[:100, :100]
    dist = np.sqrt((yy - 50) ** 2 + (xx - 50) ** 2)
    # Anti-aliased edge: blend from gray to green over 2px
    mask = np.clip(22 - dist, 0, 1)
    for c in range(3):
        arr[:, :, c] = (mask * 128 + (1 - mask) * arr[:, :, c]).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")
