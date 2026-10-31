"""Boiler Memory Engine: persistent, component-level inspection memory.

All outputs are derived from stored records. The engine never extrapolates
deterioration rates or failure dates; it reports observed changes between
comparable measurements and flags them for engineering review.
"""
from collections import defaultdict
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.entities import Component, Defect, Evidence, InspectionSession, Measurement

ACTIVE_DEFECT_STATUSES = ("ai_suspected", "engineer_verified", "requires_further_testing")
THICKNESS = "wall_thickness"


def comparability(a: Measurement, b: Measurement) -> tuple[bool, list[str]]:
    """Two measurements are comparable only if method, location, unit, parameter and quality allow it."""
    reasons: list[str] = []
    if a.component_id != b.component_id:
        reasons.append("different component")
    if a.parameter != b.parameter:
        reasons.append("different parameter")
    if a.unit != b.unit:
        reasons.append("different unit")
    if a.method != b.method:
        reasons.append("different measurement method")
    if a.location_key != b.location_key:
        reasons.append("different measurement location")
    if a.quality == "poor" or b.quality == "poor":
        reasons.append("poor measurement quality")
    return (not reasons), reasons


def measurement_dict(m: Measurement) -> dict[str, Any]:
    return {
        "id": m.id,
        "session_id": m.session_id,
        "parameter": m.parameter,
        "value": m.value,
        "unit": m.unit,
        "method": m.method,
        "location_key": m.location_key,
        "location_label": m.location_label,
        "quality": m.quality,
        "source": m.source,
        "is_demo": m.is_demo,
        "recorded_at": m.recorded_at.isoformat(),
    }


def defect_dict(d: Defect) -> dict[str, Any]:
    return {
        "id": d.id,
        "session_id": d.session_id,
        "category": d.category,
        "status": d.status,
        "severity": d.severity,
        "origin": d.origin,
        "ai_confidence": d.ai_confidence,
        "area_fraction": d.area_fraction,
        "description": d.description,
        "is_demo": d.is_demo,
    }


def load_component_history(db: Session, component: Component):
    """Return (sessions, session_order, measurements, defects) for one component, in time order."""
    session_ids = set(db.scalars(select(Measurement.session_id).where(Measurement.component_id == component.id)))
    session_ids |= set(db.scalars(select(Defect.session_id).where(Defect.component_id == component.id)))
    session_ids |= set(db.scalars(select(Evidence.session_id).where(Evidence.component_id == component.id)))
    sessions: list[InspectionSession] = []
    if session_ids:
        sessions = list(db.scalars(select(InspectionSession).where(InspectionSession.id.in_(session_ids))))
    sessions.sort(key=lambda s: (s.inspection_date, s.id))
    order = {s.id: i for i, s in enumerate(sessions)}

    measurements = list(db.scalars(select(Measurement).where(Measurement.component_id == component.id)))
    measurements.sort(key=lambda m: (order.get(m.session_id, 0), m.recorded_at, m.id))
    defects = list(db.scalars(select(Defect).where(Defect.component_id == component.id)))
    defects.sort(key=lambda d: (order.get(d.session_id, 0), d.id))
    return sessions, order, measurements, defects


def build_timeline(sessions, measurements, defects) -> list[dict[str, Any]]:
    timeline: list[dict[str, Any]] = []
    seen_categories: set[str] = set()
    for s in sessions:
        ms = [m for m in measurements if m.session_id == s.id]
        active = [d for d in defects if d.session_id == s.id and d.status in ACTIVE_DEFECT_STATUSES]
        new = [d for d in active if d.category not in seen_categories]
        timeline.append({
            "session_id": s.id,
            "session_code": s.code,
            "inspection_date": s.inspection_date.isoformat(),
            "session_status": s.status,
            "is_demo": s.is_demo,
            "is_first_record": not seen_categories and not timeline,
            "measurements": [measurement_dict(m) for m in ms],
            "defects": [defect_dict(d) for d in active],
            "new_abnormalities": [defect_dict(d) for d in new],
        })
        seen_categories |= {d.category for d in active}
    return timeline


def build_comparisons(measurements, nominal: float | None, settings: Settings) -> list[dict[str, Any]]:
    """Compare each thickness reading with the nearest earlier reading at the same location."""
    results: list[dict[str, Any]] = []
    thick = [m for m in measurements if m.parameter == THICKNESS]
    for idx, cur in enumerate(thick):
        earlier_same_location = [
            p for p in thick[:idx] if p.location_key == cur.location_key and p.session_id != cur.session_id
        ]
        if not earlier_same_location:
            continue
        chosen = None
        first_reasons: list[str] = []
        for prev in reversed(earlier_same_location):
            ok, reasons = comparability(prev, cur)
            if ok:
                chosen = prev
                break
            if not first_reasons:
                first_reasons = reasons

        base = {
            "current_id": cur.id,
            "current_value": cur.value,
            "current_session_id": cur.session_id,
            "location_key": cur.location_key,
            "location_label": cur.location_label,
        }
        if chosen is None:
            results.append({
                **base,
                "previous_id": earlier_same_location[-1].id,
                "previous_value": None,
                "previous_session_id": earlier_same_location[-1].session_id,
                "comparable": False,
                "reasons": first_reasons,
                "loss_mm": None,
                "loss_pct_of_nominal": None,
                "significant": False,
                "flagged": False,
                "message": "Not comparable with the previous reading: " + ", ".join(first_reasons),
            })
            continue

        loss = round(chosen.value - cur.value, 3)  # positive = wall loss
        significant = loss >= settings.change_flag_mm and loss > settings.measurement_uncertainty_mm
        flagged = significant and loss > 0
        pct = round(loss / nominal * 100, 2) if nominal else None
        if flagged:
            message = f"Wall loss of {loss:.2f} mm since the previous comparable reading exceeds the review threshold; flagged for engineering review."
        elif loss > 0:
            message = f"Wall loss of {loss:.2f} mm is below the review threshold or within measurement uncertainty."
        else:
            message = f"No wall loss against the previous comparable reading (change {-loss:+.2f} mm)."
        results.append({
            **base,
            "previous_id": chosen.id,
            "previous_value": chosen.value,
            "previous_session_id": chosen.session_id,
            "comparable": True,
            "reasons": [],
            "loss_mm": loss,
            "loss_pct_of_nominal": pct,
            "significant": significant,
            "flagged": flagged,
            "message": message,
        })
    return results


def thickness_series(measurements) -> list[dict[str, Any]]:
    by_location: dict[str, dict[str, Any]] = {}
    for m in measurements:
        if m.parameter != THICKNESS:
            continue
        series = by_location.setdefault(m.location_key, {
            "location_key": m.location_key,
            "location_label": m.location_label or m.location_key,
            "points": [],
        })
        series["points"].append({
            "measurement_id": m.id,
            "session_id": m.session_id,
            "value": m.value,
            "quality": m.quality,
            "is_demo": m.is_demo,
            "recorded_at": m.recorded_at.isoformat(),
        })
    return list(by_location.values())


def defect_progression(sessions, order, defects) -> list[dict[str, Any]]:
    latest_id = sessions[-1].id if sessions else None
    by_category: dict[str, list[Defect]] = defaultdict(list)
    for d in defects:
        by_category[d.category].append(d)
    result = []
    for category, items in by_category.items():
        active_sessions = {d.session_id for d in items if d.status in ACTIVE_DEFECT_STATUSES}
        if latest_id in active_sessions:
            state = "present_in_latest_inspection"
        elif active_sessions:
            state = "not_observed_in_latest_inspection"
        else:
            state = "rejected_only"
        result.append({
            "category": category,
            "state": state,
            "observations": [
                {
                    "defect_id": d.id,
                    "session_id": d.session_id,
                    "status": d.status,
                    "severity": d.severity,
                    "area_fraction": d.area_fraction,
                    "ai_confidence": d.ai_confidence,
                    "origin": d.origin,
                }
                for d in sorted(items, key=lambda x: order.get(x.session_id, 0))
            ],
        })
    return result


def latest_minimum_thickness(measurements) -> tuple[float | None, Measurement | None]:
    """Most conservative latest reading: the lowest latest usable value across all locations."""
    latest_by_location: dict[str, Measurement] = {}
    for m in measurements:
        if m.parameter == THICKNESS and m.quality != "poor":
            latest_by_location[m.location_key] = m  # measurements are in time order
    if not latest_by_location:
        return None, None
    worst = min(latest_by_location.values(), key=lambda m: m.value)
    return worst.value, worst


def component_memory(db: Session, component: Component, settings: Settings) -> dict[str, Any]:
    sessions, order, measurements, defects = load_component_history(db, component)
    timeline = build_timeline(sessions, measurements, defects)
    comparisons = build_comparisons(measurements, component.nominal_thickness_mm, settings)
    latest_id = sessions[-1].id if sessions else None
    flags = [c for c in comparisons if c["flagged"] and c["current_session_id"] == latest_id]
    latest_min, latest_m = latest_minimum_thickness(measurements)

    poor = sum(1 for m in measurements if m.quality == "poor")
    demo_records = sum(1 for m in measurements if m.is_demo) + sum(1 for d in defects if d.is_demo)
    pending = sum(1 for d in defects if d.status == "ai_suspected" and d.session_id == latest_id)
    limitations = []
    if len(sessions) < 2:
        limitations.append("Only one inspection on record: no change trend can be assessed yet.")
    if not any(c["comparable"] for c in comparisons):
        limitations.append("No comparable measurement pairs exist (same location, method, unit and acceptable quality).")
    if latest_min is None:
        limitations.append("No usable wall-thickness measurement is recorded for this component.")
    if poor:
        limitations.append(f"{poor} measurement(s) carry poor quality and are excluded from comparisons.")
    if pending:
        limitations.append(f"{pending} AI-suspected finding(s) in the latest inspection await engineer verification.")
    if demo_records:
        limitations.append(f"{demo_records} record(s) are simulated or demonstration data.")
    limitations.append("No deterioration rate or failure date is extrapolated by this prototype.")

    return {
        "component": {
            "id": component.id,
            "code": component.code,
            "name": component.name,
            "category": component.category,
            "nominal_thickness_mm": component.nominal_thickness_mm,
            "min_required_thickness_mm": component.min_required_thickness_mm,
        },
        "record_counts": {
            "inspections": len(sessions),
            "measurements": len(measurements),
            "defects": len(defects),
            "comparable_pairs": sum(1 for c in comparisons if c["comparable"]),
        },
        "latest_session_code": sessions[-1].code if sessions else None,
        "latest_min_thickness_mm": latest_min,
        "latest_measurement_id": latest_m.id if latest_m else None,
        "timeline": timeline,
        "comparisons": comparisons,
        "thickness_series": thickness_series(measurements),
        "defect_progression": defect_progression(sessions, order, defects),
        "flagged_changes": flags,
        "limitations": limitations,
    }
