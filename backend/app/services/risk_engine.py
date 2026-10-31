"""Explainable Risk Engine.

Categories are assigned by ordered, human-readable rules. Every contributing factor
lists its evidence. The numeric priority index only orders items for review; it is
NOT a probability of failure and it is NOT calibrated against field data.
"""
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.entities import Component, Evidence, RiskReview
from app.services.memory_engine import component_memory, load_component_history, build_timeline

CATEGORY_ORDER = [
    "Critical Review",
    "High Priority",
    "Moderate Priority",
    "Routine Monitoring",
    "Insufficient Evidence",
]

RECOMMENDED_FOLLOW_UP = {
    "Critical Review": "Escalate to a qualified engineer for immediate review. Confirm the reading with an independent measurement and assess against the applicable design and statutory requirements before any operating decision.",
    "High Priority": "Schedule a follow-up measurement at the flagged location(s) at the next access window. Engineer to review any verified defect and confirm the trend.",
    "Moderate Priority": "Verify AI-suspected findings at the next inspection. Capture targeted photographs and measurements at the same locations.",
    "Routine Monitoring": "Continue routine monitoring at the next scheduled inspection using the same method and locations.",
    "Insufficient Evidence": "Record wall-thickness measurements and evidence for this component before a category can be assigned.",
}


def _factor(category: str, title: str, detail: str, points: int, evidence: list[dict]) -> dict[str, Any]:
    return {"category": category, "factor": title, "detail": detail, "points": points, "evidence": evidence}


def assess_component(db: Session, component: Component, settings: Settings, today: date | None = None) -> dict[str, Any]:
    today = today or date.today()
    memory = component_memory(db, component, settings)
    sessions, _order, measurements, defects = load_component_history(db, component)
    evidence_count = db.scalar(select(Evidence.id).where(Evidence.component_id == component.id).limit(1))
    timeline = build_timeline(sessions, measurements, defects)
    latest_entry = timeline[-1] if timeline else None
    latest_session_id = sessions[-1].id if sessions else None

    no_data = not measurements and not defects and evidence_count is None
    factors: list[dict[str, Any]] = []
    categories: list[str] = []
    points = 0

    if no_data:
        return {
            "component_id": component.id,
            "component_code": component.code,
            "component_name": component.name,
            "category": "Insufficient Evidence",
            "priority_index": 0,
            "factors": [],
            "limitations": ["No measurements, defects or evidence are recorded for this component."],
            "recommended_follow_up": RECOMMENDED_FOLLOW_UP["Insufficient Evidence"],
            "latest_min_thickness_mm": None,
            "min_required_thickness_mm": component.min_required_thickness_mm,
            "engineering_status": _review_status(db, component, "Insufficient Evidence"),
            "disclaimer": "Indicative priority index for ordering review work only. Not a probability of failure.",
        }

    latest_min = memory["latest_min_thickness_mm"]
    required = component.min_required_thickness_mm
    latest_m_id = memory["latest_measurement_id"]
    if latest_min is not None and required is not None:
        ref = [{"type": "measurement", "id": latest_m_id, "label": f"Latest minimum {latest_min:.2f} mm"}]
        if latest_min <= required:
            categories.append("Critical Review")
            points += 50
            factors.append(_factor(
                "Critical Review", "Wall thickness at or below demonstration minimum",
                f"Latest recorded wall thickness {latest_min:.2f} mm is at or below the demonstration minimum of {required:.2f} mm.",
                50, ref))
        elif latest_min <= required * settings.critical_margin_ratio:
            categories.append("High Priority")
            points += 25
            factors.append(_factor(
                "High Priority", "Wall thickness close to minimum",
                f"Latest recorded wall thickness {latest_min:.2f} mm is within {int((settings.critical_margin_ratio - 1) * 100)}% of the demonstration minimum {required:.2f} mm.",
                25, ref))

    severity_points = {"severe": ("Critical Review", 40), "moderate": ("High Priority", 20), "low": ("Moderate Priority", 6)}
    for d in defects:
        if d.status != "engineer_verified":
            continue
        ref = [{"type": "defect", "id": d.id, "label": f"{d.category} ({d.severity})"}]
        if d.severity in severity_points:
            cat, pts = severity_points[d.severity]
            categories.append(cat)
            points += pts
            factors.append(_factor(cat, f"Engineer-verified {d.severity} {d.category.replace('_', ' ')}",
                                   d.description, pts, ref))
        else:
            categories.append("Moderate Priority")
            points += 8
            factors.append(_factor("Moderate Priority", "Verified defect without severity",
                                   "An engineer verified this finding but has not assigned a severity.", 8, ref))

    testing = [d for d in defects if d.status == "requires_further_testing"]
    if testing:
        pts = min(30, 15 * len(testing))
        categories.append("High Priority")
        points += pts
        factors.append(_factor("High Priority", f"{len(testing)} finding(s) require further testing",
                               "Engineer marked these findings for additional examination before classification.",
                               pts, [{"type": "defect", "id": d.id, "label": d.category} for d in testing]))

    suspected = [d for d in defects if d.status == "ai_suspected"]
    if suspected:
        pts = min(24, 6 * len(suspected))
        categories.append("Moderate Priority")
        points += pts
        factors.append(_factor("Moderate Priority", f"{len(suspected)} AI-suspected finding(s) unverified",
                               "Demonstration analysis flagged these areas. They are not confirmed defects until an engineer verifies them.",
                               pts, [{"type": "defect", "id": d.id, "label": d.category} for d in suspected]))

    if memory["flagged_changes"]:
        ch = memory["flagged_changes"]
        pts = 25
        categories.append("High Priority")
        points += pts
        factors.append(_factor(
            "High Priority", "Measured wall loss flagged for review",
            "; ".join(c["message"] for c in ch), pts,
            [{"type": "measurement", "id": c["current_id"], "label": f"{c['location_label'] or c['location_key']}: -{c['loss_mm']:.2f} mm"} for c in ch]))

    if latest_entry and latest_entry["new_abnormalities"]:
        new = latest_entry["new_abnormalities"]
        categories.append("Moderate Priority")
        points += 10
        factors.append(_factor(
            "Moderate Priority", "New abnormality category in latest inspection",
            f"{len(new)} abnormality category(ies) were not recorded for this component in earlier inspections.",
            10, [{"type": "defect", "id": d["id"], "label": d["category"]} for d in new]))

    if sessions and (today - sessions[-1].inspection_date).days > settings.stale_inspection_days:
        categories.append("Moderate Priority")
        points += 5
        factors.append(_factor(
            "Moderate Priority", "Latest inspection record is older than the configured interval",
            f"The latest inspection was on {sessions[-1].inspection_date.isoformat()}; the configured interval is {settings.stale_inspection_days} days.",
            5, [{"type": "session", "id": latest_session_id, "label": sessions[-1].code}]))

    if categories:
        category = min(categories, key=CATEGORY_ORDER.index)
    else:
        category = "Routine Monitoring"

    limitations = list(memory["limitations"])
    if required is None:
        limitations.append("No minimum required thickness is configured for this component; threshold rules were not applied.")
    if component.nominal_thickness_mm is None:
        limitations.append("No nominal thickness is configured for this component; percentage loss cannot be computed.")

    return {
        "component_id": component.id,
        "component_code": component.code,
        "component_name": component.name,
        "category": category,
        "priority_index": min(100, points),
        "factors": factors,
        "limitations": limitations,
        "recommended_follow_up": RECOMMENDED_FOLLOW_UP[category],
        "latest_min_thickness_mm": latest_min,
        "min_required_thickness_mm": required,
        "engineering_status": _review_status(db, component, category),
        "disclaimer": "Indicative priority index for ordering review work only. Not a probability of failure.",
    }


def _review_status(db: Session, component: Component, computed: str) -> dict[str, Any]:
    review = db.scalar(
        select(RiskReview).where(RiskReview.component_id == component.id).order_by(RiskReview.id.desc()).limit(1)
    )
    if review is None:
        return {"reviewed": False, "confirmed_category": None, "note": None, "differs_from_computed": False}
    return {
        "reviewed": True,
        "confirmed_category": review.confirmed_category,
        "note": review.note,
        "reviewed_at": review.created_at.isoformat(),
        "differs_from_computed": review.confirmed_category != computed,
    }


def assess_all(db: Session, settings: Settings, boiler_id: int | None = None) -> list[dict[str, Any]]:
    stmt = select(Component).order_by(Component.code)
    if boiler_id is not None:
        stmt = stmt.where(Component.boiler_id == boiler_id)
    results = [assess_component(db, c, settings) for c in db.scalars(stmt)]
    results.sort(key=lambda r: (CATEGORY_ORDER.index(r["category"]), -r["priority_index"], r["component_code"]))
    return results
