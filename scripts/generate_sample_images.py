#!/usr/bin/env python3
"""Regenerates the labelled SIMULATED sample images in sample-data/images/ from manifest.json.

Run from the repository root:  python scripts/generate_sample_images.py
The images are procedurally drawn demonstration patterns, not photographs of any real boiler.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.ai.sample_images import render_sample_surface  # noqa: E402


def main() -> None:
    images_dir = ROOT / "sample-data" / "images"
    manifest = json.loads((images_dir / "manifest.json").read_text())
    for item in manifest:
        png = render_sample_surface(
            label=f"{item['component_code']} {item['session_code']}",
            seed=item["seed"],
            rust_patches=item["rust_patches"],
            cracks=item["cracks"],
        )
        target = images_dir / item["filename"]
        target.write_bytes(png)
        print(f"wrote {target.relative_to(ROOT)} ({len(png) // 1024} KB)")


if __name__ == "__main__":
    main()
