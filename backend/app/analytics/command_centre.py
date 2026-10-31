"""Aggregates for the Command Centre. Every figure is computed from database records."""
from collections import Counter
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.entities import AuditLog, Boiler, Component, Defect, Device, Evidence, InspectionSession, Plant, PlanItem
from app.services.risk_engine import CATEGORY_ORDER, assess_all


def command_centre_summary(db: Session, settings: Settings) -> dict[str, Any]:
    assessments = assess_all(db, settings)
    category_counts = Counter(a["category"] for a in assessments)
    sessions_by_status = Counter(
        s for s in db.scalars(select(InspectionSession.status))
    )
    pending = db.scalar(select(func.count(Defect.id)).where(Defect.status.in_(["ai_suspected", "requires_further_testing"]))) or 0
    verified = db.scalar(select(func.count(Defect.id)).where(Defect.status == "engineer_verified")) or 0
    total_defects = db.scalar(select(func.count(Defect.id))) or 0

    feed = [
        {"at": a.at.isoformat(), "actor": a.user_email, "action": a.action, "entity": a.entity,
         "entity_id": a.entity_id, "detail": a.detail}
        for a in db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(15))
    ]
    watchlist = [
        {k: a[k] for k in ("component_id", "component_code", "component_name", "category", "priority_index", "latest_min_thickness_mm", "min_required_thickness_mm")}
        for a in assessments if a["category"] in ("Critical Review", "High Priority", "Moderate Priority")
    ][:8]

    return {
        "counts": {
            "plants": db.scalar(select(func.count(Plant.id))) or 0,
            "boilers": db.scalar(select(func.count(Boiler.id))) or 0,
            "components_mapped": db.scalar(select(func.count(Component.id))) or 0,
            "inspection_records": db.scalar(select(func.count(InspectionSession.id))) or 0,
            "evidence_items": db.scalar(select(func.count(Evidence.id))) or 0,
            "defects_detected": total_defects,
            "defects_pending_verification": pending,
            "defects_verified": verified,
            "high_priority_flags": category_counts.get("Critical Review", 0) + category_counts.get("High Priority", 0),
            "planned_items_open": db.scalar(select(func.count(PlanItem.id)).where(PlanItem.status == "planned")) or 0,
            "devices_registered": db.scalar(select(func.count(Device.id))) or 0,
        },
        "condition_distribution": [{"category": c, "count": category_counts.get(c, 0)} for c in CATEGORY_ORDER],
        "inspection_status": [{"status": k, "count": v} for k, v in sorted(sessions_by_status.items())],
        "watchlist": watchlist,
        "feed": feed,
        "disclaimer": "Priority categories come from explainable rules applied to demonstration and recorded data. They are not safety certifications.",
    }
