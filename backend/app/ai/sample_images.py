"""Generates clearly labelled synthetic sample images for the demonstration dataset.

These are procedurally drawn metal-surface patterns with rust-like patches and crack-like lines.
They are NOT photographs of any real boiler and every image carries a SIMULATED label.
"""
import io

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


def render_sample_surface(label: str, seed: int, rust_patches: int, cracks: int,
                          size: tuple[int, int] = (640, 480)) -> bytes:
    rng = np.random.default_rng(seed)
    w, h = size
    base = np.zeros((h, w, 3), dtype=np.float32)
    gradient = np.linspace(118, 132, w, dtype=np.float32)[None, :]
    base[..., 0] = gradient + rng.normal(0, 4, (h, w))
    base[..., 1] = gradient + 2 + rng.normal(0, 4, (h, w))
    base[..., 2] = gradient + 6 + rng.normal(0, 4, (h, w))
    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))

    draw = ImageDraw.Draw(img)
    for _ in range(rust_patches):
        cx, cy = rng.integers(60, w - 60), rng.integers(60, h - 60)
        rx, ry = rng.integers(18, 55), rng.integers(14, 40)
        jitter = int(rng.integers(-12, 12))
        draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(160 + jitter, 78, 35))
    img = img.filter(ImageFilter.GaussianBlur(1.2))

    draw = ImageDraw.Draw(img)
    for _ in range(cracks):
        x, y = int(rng.integers(80, w - 80)), int(rng.integers(80, h - 80))
        points = [(x, y)]
        for _step in range(9):
            x += int(rng.integers(-2, 3)) + 12
            y += int(rng.integers(-2, 3))
            points.append((x, y))
        draw.line(points, fill=(32, 32, 36), width=3)

    try:
        font = ImageFont.load_default()
    except OSError:
        font = None
    # Label is drawn without a dark backing bar so it is not mistaken for a dark streak.
    draw.text((6, 4), f"SIMULATED SAMPLE IMAGE - {label}", fill=(0, 220, 235), font=font)

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()
