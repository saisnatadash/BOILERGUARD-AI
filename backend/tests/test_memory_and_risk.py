"""Boiler Memory Engine comparability/change logic and the explainable risk rules."""
from datetime import datetime
from types import SimpleNamespace

from app.core.config import Settings
from app.services.memory_engine import build_comparisons, comparability


def _m(**kw):
    base = dict(id=1, component_id=1, session_id=1, parameter="wall_thickness", value=5.0, unit="mm",
                method="ultrasonic_thickness", location_key="LOC-A", location_label=None, quality="good",
                recorded_at=datetime(2026, 1, 1))
    base.update(kw)
    return SimpleNamespace(**base)


def test_same_method_unit_location_and_quality_are_comparable():
    ok, reasons = comparability(_m(), _m(id=2, session_id=2, value=4.8))
    assert ok and reasons == []


def test_different_method_is_not_comparable():
    ok, reasons = comparability(_m(), _m(id=2, session_id=2, method="visual_gauge"))
    assert not ok
    assert "different measurement method" in reasons


def test_different_location_or_unit_is_not_comparable():
    ok, reasons = comparability(_m(), _m(id=2, session_id=2, location_key="LOC-B", unit="in"))
    assert not ok
    assert "different measurement location" in reasons and "different unit" in reasons


def test_poor_quality_is_never_comparable():
    ok, reasons = comparability(_m(), _m(id=2, session_id=2, quality="poor"))
    assert not ok and "poor measurement quality" in reasons


def test_wall_loss_above_threshold_is_flagged():
    settings = Settings()
    prev = _m(id=1, session_id=1, value=5.8)
    cur = _m(id=2, session_id=2, value=5.3)
    [result] = build_comparisons([prev, cur], nominal=6.0, settings=settings)
    assert result["comparable"] is True
    assert result["loss_mm"] == 0.5
    assert result["flagged"] is True
    assert result["loss_pct_of_nominal"] == 8.33


def test_change_within_measurement_uncertainty_is_not_flagged():
    settings = Settings()
    prev = _m(id=1, session_id=1, value=5.9)
    cur = _m(id=2, session_id=2, value=5.8)
    [result] = build_comparisons([prev, cur], nominal=6.0, settings=settings)
    assert result["loss_mm"] == 0.1
    assert result["flagged"] is False


def test_non_comparable_pair_reports_reasons_and_is_not_flagged():
    settings = Settings()
    prev = _m(id=1, session_id=1, value=5.8, method="visual_gauge")
    cur = _m(id=2, session_id=2, value=5.0)
    [result] = build_comparisons([prev, cur], nominal=6.0, settings=settings)
    assert result["comparable"] is False
    assert result["flagged"] is False
    assert "different measurement method" in result["reasons"]


def test_history_api_returns_observed_change_for_economiser_tube(client, viewer_headers, component_ids):
    memory = client.get(f"/api/components/{component_ids['ECO-TUBE-024']}/memory", headers=viewer_headers).json()
    series = {s["location_key"]: s for s in memory["thickness_series"]}
    values = [p["value"] for p in series["ECO24-SEC-A-1.2M"]["points"]]
    assert values == [5.8, 5.6, 5.3]
    losses = [c["loss_mm"] for c in memory["comparisons"] if c["location_key"] == "ECO24-SEC-A-1.2M"]
    assert losses == [0.2, 0.3]
    assert len(memory["flagged_changes"]) == 1
    assert memory["flagged_changes"][0]["loss_mm"] == 0.3
    assert any("No deterioration rate" in line for line in memory["limitations"])


def test_poor_quality_reading_is_excluded_from_comparisons(client, viewer_headers, component_ids):
    memory = client.get(f"/api/components/{component_ids['WW-PANEL-07']}/memory", headers=viewer_headers).json()
    poor_locations = [c for c in memory["comparisons"] if c["location_key"] == "WW07-HW-3.5M"]
    assert poor_locations == []
    assert any("poor quality" in line for line in memory["limitations"])


def test_risk_rules_classify_critical_low_thickness(client, viewer_headers, component_ids):
    risk = client.get(f"/api/components/{component_ids['SH-PLATEN-03']}/risk", headers=viewer_headers).json()
    assert risk["category"] == "Critical Review"
    assert risk["latest_min_thickness_mm"] == 4.45
    assert any(f["factor"].startswith("Wall thickness at or below") for f in risk["factors"])
    assert all(f["evidence"] for f in risk["factors"]), "every factor must cite its evidence"
    assert "not a probability" in risk["disclaimer"].lower()


def test_risk_rules_flag_economiser_tube_for_review(client, viewer_headers, component_ids):
    risk = client.get(f"/api/components/{component_ids['ECO-TUBE-024']}/risk", headers=viewer_headers).json()
    assert risk["category"] == "High Priority"
    assert any("wall loss" in f["factor"].lower() for f in risk["factors"])


def test_component_without_data_is_insufficient_evidence(client, engineer_headers, boiler_id, viewer_headers):
    created = client.post("/api/components", headers=engineer_headers, json={
        "boiler_id": boiler_id, "code": "TEST-EMPTY-01", "name": "Empty test component",
        "category": "Headers", "diagram_key": "hdr-ms", "nominal_thickness_mm": 10,
        "min_required_thickness_mm": 8,
    })
    assert created.status_code == 201
    risk = client.get(f"/api/components/{created.json()['id']}/risk", headers=viewer_headers).json()
    assert risk["category"] == "Insufficient Evidence"
    assert risk["priority_index"] == 0


def test_component_validation_rejects_inconsistent_thresholds(client, engineer_headers, boiler_id):
    response = client.post("/api/components", headers=engineer_headers, json={
        "boiler_id": boiler_id, "code": "TEST-BAD-01", "name": "Bad thresholds", "category": "Headers",
        "diagram_key": "hdr-ms", "nominal_thickness_mm": 10, "min_required_thickness_mm": 12,
    })
    assert response.status_code == 422
