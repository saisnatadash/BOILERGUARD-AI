"""CSV measurement import validation (unit level)."""
from datetime import datetime

from app.services.measurement_import import parse_measurement_csv

HEADER = "component_code,parameter,value,unit,method,location_key,quality,location_label,instrument,recorded_at\n"
MAPPING = {"ECO-TUBE-024": 1}
DEFAULT_TIME = datetime(2026, 10, 12, 12, 0)


def test_valid_rows_are_accepted():
    text = HEADER + "ECO-TUBE-024,wall_thickness,5.4,mm,ultrasonic_thickness,LOC-1,good,,,\n"
    result = parse_measurement_csv(text, MAPPING, 100, DEFAULT_TIME)
    assert len(result.accepted) == 1 and result.errors == []
    assert result.accepted[0]["value"] == 5.4
    assert result.accepted[0]["recorded_at"] == DEFAULT_TIME


def test_each_invalid_row_is_reported_with_line_number():
    text = HEADER + (
        "UNKNOWN-1,wall_thickness,5.4,mm,ultrasonic_thickness,LOC-1,good,,,\n"
        "ECO-TUBE-024,wall_thickness,abc,mm,ultrasonic_thickness,LOC-1,good,,,\n"
        "ECO-TUBE-024,wall_thickness,5.4,in,ultrasonic_thickness,LOC-1,good,,,\n"
        "ECO-TUBE-024,wall_thickness,5.4,mm,laser,LOC-1,excellent,,,\n"
        "ECO-TUBE-024,wall_thickness,5.4,mm,ultrasonic_thickness,LOC-1,good,,,not-a-date\n"
    )
    result = parse_measurement_csv(text, MAPPING, 100, DEFAULT_TIME)
    assert result.accepted == []
    assert [e["line"] for e in result.errors] == [2, 3, 4, 5, 6]
    reasons = " | ".join(e["reason"] for e in result.errors)
    assert "unknown component_code" in reasons
    assert "value is not a number" in reasons
    assert "unit for wall_thickness must be mm" in reasons
    assert "method must be one of" in reasons
    assert "recorded_at must be ISO 8601" in reasons


def test_missing_required_columns_fail_fast():
    result = parse_measurement_csv("component_code,value\nECO-TUBE-024,5.4\n", MAPPING, 100, DEFAULT_TIME)
    assert result.accepted == []
    assert "Missing required column" in result.errors[0]["reason"]


def test_row_limit_is_enforced():
    rows = "".join("ECO-TUBE-024,wall_thickness,5.4,mm,ultrasonic_thickness,LOC-1,good,,,\n" for _ in range(5))
    result = parse_measurement_csv(HEADER + rows, MAPPING, 3, DEFAULT_TIME)
    assert any("More than 3 rows" in e["reason"] for e in result.errors)
