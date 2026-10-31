"""CSV exports with the same filters the UI offers. Output is plain text so it opens in any spreadsheet tool."""
import csv
import io
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Boiler, Component, Defect, InspectionSession, Measurement


def _to_csv(headers: list[str], rows: Iterable[list]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(headers)
    writer.writerows(rows)
    return buffer.getvalue()


def measurements_csv(db: Session, boiler_id: int | None = None, component_id: int | None = None) -> str:
    stmt = (
        select(Measurement, Component, InspectionSession)
        .join(Component, Measurement.component_id == Component.id)
        .join(InspectionSession, Measurement.session_id == InspectionSession.id)
        .order_by(InspectionSession.inspection_date, Measurement.id)
    )
    if boiler_id is not None:
        stmt = stmt.where(Component.boiler_id == boiler_id)
    if component_id is not None:
        stmt = stmt.where(Measurement.component_id == component_id)
    rows = [
        [m.id, s.code, s.inspection_date.isoformat(), c.code, m.parameter, m.value, m.unit, m.method,
         m.location_key, m.location_label or "", m.instrument or "", m.quality, m.source,
         "SIMULATED" if m.is_demo else "recorded"]
        for m, c, s in db.execute(stmt).all()
    ]
    return _to_csv(["measurement_id", "session_code", "inspection_date", "component_code", "parameter", "value",
                    "unit", "method", "location_key", "location_label", "instrument", "quality", "source", "data_label"], rows)


def defects_csv(db: Session, boiler_id: int | None = None, status: str | None = None) -> str:
    stmt = (
        select(Defect, Component, InspectionSession)
        .join(Component, Defect.component_id == Component.id)
        .join(InspectionSession, Defect.session_id == InspectionSession.id)
        .order_by(InspectionSession.inspection_date, Defect.id)
    )
    if boiler_id is not None:
        stmt = stmt.where(Component.boiler_id == boiler_id)
    if status:
        stmt = stmt.where(Defect.status == status)
    rows = [
        [d.id, s.code, c.code, d.category, d.status, d.severity, d.origin,
         "" if d.ai_confidence is None else d.ai_confidence,
         "" if d.area_fraction is None else d.area_fraction,
         d.description, d.verification_note or "", "SIMULATED" if d.is_demo else "recorded"]
        for d, c, s in db.execute(stmt).all()
    ]
    return _to_csv(["defect_id", "session_code", "component_code", "category", "status", "severity", "origin",
                    "ai_confidence_heuristic", "area_fraction", "description", "verification_note", "data_label"], rows)


def boilers_csv(db: Session) -> str:
    rows = [[b.code, b.name, b.boiler_type, b.rated_capacity_tph, b.design_pressure_bar, b.commissioned_year or ""]
            for b in db.scalars(select(Boiler).order_by(Boiler.code))]
    return _to_csv(["boiler_code", "name", "boiler_type", "rated_capacity_tph", "design_pressure_bar", "commissioned_year"], rows)
