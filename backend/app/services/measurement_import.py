"""Structured CSV measurement import with row-level validation.

Rows that fail validation are reported with their line number and reason; valid rows are still accepted
only when the whole file is well-formed (the caller decides how to treat partial failures).
"""
import csv
import io
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.schemas.schemas import PARAMETER_UNITS

REQUIRED_COLUMNS = ["component_code", "parameter", "value", "unit", "method", "location_key", "quality"]
OPTIONAL_COLUMNS = ["location_label", "instrument", "recorded_at", "session_code"]
ALLOWED_METHODS = {"ultrasonic_thickness", "visual_gauge", "thermal_survey", "eddy_current", "emat", "other"}
ALLOWED_QUALITY = {"good", "fair", "poor"}


@dataclass
class ImportResult:
    accepted: list[dict[str, Any]] = field(default_factory=list)
    errors: list[dict[str, Any]] = field(default_factory=list)
    row_count: int = 0


def parse_measurement_csv(text: str, component_ids_by_code: dict[str, int], max_rows: int,
                          default_recorded_at: datetime) -> ImportResult:
    result = ImportResult()
    try:
        reader = csv.DictReader(io.StringIO(text))
    except csv.Error as exc:
        result.errors.append({"line": 1, "reason": f"Unreadable CSV: {exc}"})
        return result

    header = [h.strip() for h in (reader.fieldnames or [])]
    missing = [c for c in REQUIRED_COLUMNS if c not in header]
    if missing:
        result.errors.append({"line": 1, "reason": f"Missing required column(s): {', '.join(missing)}"})
        return result

    for line_no, raw in enumerate(reader, start=2):
        result.row_count += 1
        if result.row_count > max_rows:
            result.errors.append({"line": line_no, "reason": f"More than {max_rows} rows; split the file"})
            break
        row = {(k or "").strip(): (v or "").strip() for k, v in raw.items()}
        problems = []

        code = row.get("component_code", "")
        component_id = component_ids_by_code.get(code)
        if component_id is None:
            problems.append(f"unknown component_code '{code}'")

        parameter = row.get("parameter", "")
        if parameter not in PARAMETER_UNITS:
            problems.append(f"parameter must be one of {', '.join(PARAMETER_UNITS)}")
        unit = row.get("unit", "")
        if parameter in PARAMETER_UNITS and unit != PARAMETER_UNITS[parameter]:
            problems.append(f"unit for {parameter} must be {PARAMETER_UNITS[parameter]}")

        value = None
        try:
            value = float(row.get("value", ""))
            if not (0 < value < 1000):
                problems.append("value must be between 0 and 1000")
        except ValueError:
            problems.append("value is not a number")

        method = row.get("method", "")
        if method not in ALLOWED_METHODS:
            problems.append(f"method must be one of {', '.join(sorted(ALLOWED_METHODS))}")
        quality = row.get("quality", "")
        if quality not in ALLOWED_QUALITY:
            problems.append("quality must be good, fair or poor")
        location_key = row.get("location_key", "")
        if not location_key or len(location_key) > 80:
            problems.append("location_key is required (max 80 characters)")

        recorded_at = default_recorded_at
        if row.get("recorded_at"):
            try:
                recorded_at = datetime.fromisoformat(row["recorded_at"])
            except ValueError:
                problems.append("recorded_at must be ISO 8601")

        if problems:
            result.errors.append({"line": line_no, "reason": "; ".join(problems)})
            continue

        result.accepted.append({
            "line": line_no,
            "component_id": component_id,
            "component_code": code,
            "parameter": parameter,
            "value": value,
            "unit": unit,
            "method": method,
            "location_key": location_key,
            "location_label": row.get("location_label") or None,
            "instrument": row.get("instrument") or None,
            "quality": quality,
            "recorded_at": recorded_at,
            "session_code": row.get("session_code") or None,
        })
    return result
