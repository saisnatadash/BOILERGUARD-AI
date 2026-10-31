"""Device adapters. The simulated adapter produces DEMO readings; real hardware adapters implement the same interface.

Simulated readings are always flagged ``is_demo`` and are labelled as simulated throughout the UI and reports.
"""
from abc import ABC, abstractmethod
from typing import Any

import numpy as np

from app.models.entities import Component


class DeviceAdapter(ABC):
    device_type: str

    @abstractmethod
    def read_batch(self, components: list[Component], seed: int) -> list[dict[str, Any]]:
        """Return measurement dictionaries ready for persistence."""


class SimulatedUltrasonicAdapter(DeviceAdapter):
    """Simulated ultrasonic thickness gauge. Values are synthetic and deterministic for a given seed."""

    device_type = "ultrasonic_gauge"
    method = "ultrasonic_thickness"

    def read_batch(self, components: list[Component], seed: int) -> list[dict[str, Any]]:
        rng = np.random.default_rng(seed)
        rows: list[dict[str, Any]] = []
        for component in components:
            if component.nominal_thickness_mm is None:
                continue
            for grid in range(1, 3):
                value = component.nominal_thickness_mm * (1 - float(rng.uniform(0.0, 0.02)))
                quality = "good" if rng.random() > 0.15 else "fair"
                rows.append({
                    "component_id": component.id,
                    "component_code": component.code,
                    "parameter": "wall_thickness",
                    "value": round(value, 2),
                    "unit": "mm",
                    "method": self.method,
                    "location_key": f"{component.code}-SIM-GRID-{grid}",
                    "location_label": f"Simulated grid point {grid}",
                    "instrument": "SIMULATED ultrasonic gauge",
                    "quality": quality,
                })
        return rows
