"""Replaceable defect-analysis adapters.

``HeuristicDemoAnalyzer`` is a transparent colour-and-shape demonstration. It finds rust-coloured regions and
elongated dark streaks. It does NOT identify real corrosion or cracking, cannot see inside the boiler, cannot
measure wall thickness, and cannot certify safety. A real model (ONNX, PyTorch, a vendor API) can be added by
implementing ``DefectAnalyzer`` and registering it in ``ANALYZERS``.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage


@dataclass
class Finding:
    category: str
    description: str
    bbox: dict[str, float]          # normalised x, y, w, h in [0, 1]
    area_fraction: float            # share of analysed image area
    confidence: float               # heuristic score, not a calibrated probability
    suggested_severity: str         # low | moderate | severe


class DefectAnalyzer(ABC):
    name: str
    version: str

    @abstractmethod
    def analyze(self, image: Image.Image) -> tuple[list[Finding], Image.Image]:
        """Return findings and an annotated copy of the analysed image."""


class HeuristicDemoAnalyzer(DefectAnalyzer):
    name = "heuristic-colour-shape-demo"
    version = "0.2.0"
    max_side = 900
    min_region_fraction = 0.0015

    def analyze(self, image: Image.Image) -> tuple[list[Finding], Image.Image]:
        img = image.convert("RGB")
        img.thumbnail((self.max_side, self.max_side))
        width, height = img.size
        hsv = np.asarray(img.convert("HSV")).astype(np.float32)
        hue = hsv[..., 0] * 360 / 255
        sat = hsv[..., 1] / 255
        val = hsv[..., 2] / 255

        rust = (hue >= 8) & (hue <= 40) & (sat >= 0.38) & (val >= 0.25) & (val <= 0.9)
        dark = val < 0.22

        findings: list[Finding] = []
        findings += self._rust_regions(rust, width, height)
        findings += self._dark_streaks(dark, width, height)
        return findings, self._annotate(img, findings)

    def _components(self, mask: np.ndarray):
        labels, count = ndimage.label(mask)
        if count == 0:
            return []
        areas = np.bincount(labels.ravel())[1:]
        slices = ndimage.find_objects(labels)
        return [(int(areas[i]), slices[i]) for i in range(count) if slices[i] is not None]

    def _bbox(self, sl, width: int, height: int) -> dict[str, float]:
        ys, xs = sl
        return {
            "x": round(xs.start / width, 4),
            "y": round(ys.start / height, 4),
            "w": round((xs.stop - xs.start) / width, 4),
            "h": round((ys.stop - ys.start) / height, 4),
        }

    def _rust_regions(self, mask: np.ndarray, width: int, height: int) -> list[Finding]:
        total = width * height
        out = []
        for area, sl in self._components(mask):
            fraction = area / total
            if fraction < self.min_region_fraction:
                continue
            box_area = (sl[0].stop - sl[0].start) * (sl[1].stop - sl[1].start)
            fill = area / max(box_area, 1)
            if fill < 0.2:
                continue
            severity = "severe" if fraction >= 0.08 else "moderate" if fraction >= 0.02 else "low"
            out.append(Finding(
                category="surface_corrosion",
                description="Rust-coloured surface region (colour-based demonstration detection).",
                bbox=self._bbox(sl, width, height),
                area_fraction=round(fraction, 4),
                confidence=round(min(0.9, 0.45 + 0.5 * fill), 2),
                suggested_severity=severity,
            ))
        return out

    def _dark_streaks(self, mask: np.ndarray, width: int, height: int) -> list[Finding]:
        total = width * height
        out = []
        for area, sl in self._components(mask):
            fraction = area / total
            if fraction < 0.0003:
                continue
            h = sl[0].stop - sl[0].start
            w = sl[1].stop - sl[1].start
            elongation = max(h, w) / max(min(h, w), 1)
            if elongation < 4:
                continue
            out.append(Finding(
                category="cracking_indicator",
                description="Elongated dark streak that may indicate a crack-like feature (demonstration heuristic; requires examination).",
                bbox=self._bbox(sl, width, height),
                area_fraction=round(fraction, 4),
                confidence=round(min(0.85, 0.4 + 0.05 * elongation), 2),
                suggested_severity="moderate",
            ))
        return out

    def _annotate(self, img: Image.Image, findings: list[Finding]) -> Image.Image:
        canvas = img.copy()
        draw = ImageDraw.Draw(canvas)
        w, h = canvas.size
        try:
            font = ImageFont.load_default()
        except OSError:
            font = None
        colours = {"surface_corrosion": (255, 176, 0), "cracking_indicator": (0, 220, 235)}
        for idx, f in enumerate(findings, start=1):
            x0, y0 = f.bbox["x"] * w, f.bbox["y"] * h
            x1, y1 = x0 + f.bbox["w"] * w, y0 + f.bbox["h"] * h
            colour = colours.get(f.category, (255, 255, 255))
            draw.rectangle([x0, y0, x1, y1], outline=colour, width=2)
            draw.text((x0 + 3, max(0, y0 - 12)), f"D{idx} {f.confidence:.2f}", fill=colour, font=font)
        draw.rectangle([0, h - 16, w, h], fill=(20, 20, 22))
        draw.text((6, h - 13), "DEMONSTRATION OUTPUT - NOT A VALIDATED DEFECT ASSESSMENT", fill=(255, 176, 0), font=font)
        return canvas

    @staticmethod
    def as_dict(finding: Finding) -> dict[str, Any]:
        return asdict(finding)


ANALYZERS: dict[str, DefectAnalyzer] = {HeuristicDemoAnalyzer.name: HeuristicDemoAnalyzer()}
DEFAULT_ANALYZER = HeuristicDemoAnalyzer.name


def get_analyzer(name: str | None = None) -> DefectAnalyzer:
    return ANALYZERS[name or DEFAULT_ANALYZER]
