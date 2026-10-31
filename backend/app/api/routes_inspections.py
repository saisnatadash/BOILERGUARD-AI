"""Inspection workspace: sessions, evidence uploads, measurements, CSV import and defect verification."""
from datetime import datetime, time, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import record_audit
from app.core.clock import utcnow
from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import get_current_user, require
from app.models.entities import Boiler, Component, Defect, Evidence, InspectionSession, Measurement, User
from app.repositories.base import apply_text_search, get_or_404
from app.schemas.schemas import (
    PARAMETER_UNITS, DefectCreate, DefectOut, EvidenceOut, MeasurementCreate, MeasurementOut,
    SessionCreate, SessionOut, SessionUpdate, VerificationIn,
)
from app.services.measurement_import import parse_measurement_csv
from app.services.storage import evidence_storage, validate_image_upload

router = APIRouter(tags=["inspections"])


def _naive_utc(value: datetime) -> datetime:
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _ensure_open(session: InspectionSession) -> None:
    if session.status == "closed":
        raise HTTPException(status_code=409, detail="This inspection is closed. Create a follow-up inspection to add records.")


def _safe_filename(name: str | None) -> str:
    base = (name or "upload").replace("\\", "/").split("/")[-1]
    cleaned = "".join(ch for ch in base if ch.isalnum() or ch in "._- ")[:200]
    return cleaned or "upload"


def _next_session_code(db: Session, year: int) -> str:
    next_id = (db.scalar(select(func.max(InspectionSession.id))) or 0) + 1
    return f"INS-{year}-{next_id:04d}"


@router.get("/inspections", response_model=list[SessionOut])
def list_sessions(
    boiler_id: int | None = None,
    status: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(InspectionSession).order_by(InspectionSession.inspection_date.desc(), InspectionSession.id.desc())
    if boiler_id is not None:
        stmt = stmt.where(InspectionSession.boiler_id == boiler_id)
    if status:
        stmt = stmt.where(InspectionSession.status == status)
    return db.scalars(apply_text_search(stmt, [InspectionSession.code, InspectionSession.observations], q)).all()


@router.post("/inspections", response_model=SessionOut, status_code=201)
def create_session(body: SessionCreate, db: Session = Depends(get_db), user: User = Depends(require("inspection:write"))):
    get_or_404(db, Boiler, body.boiler_id, "Boiler")
    session = InspectionSession(
        code=_next_session_code(db, body.inspection_date.year),
        boiler_id=body.boiler_id,
        inspection_date=body.inspection_date,
        inspection_type=body.inspection_type,
        method=body.method,
        status="open",
        conditions=body.conditions,
        observations=body.observations,
        is_demo=False,
        created_by_id=user.id,
    )
    db.add(session)
    db.flush()
    record_audit(db, user, "create", "inspection", session.id, session.code)
    db.commit()
    db.refresh(session)
    return session


@router.get("/inspections/{session_id}", response_model=SessionOut)
def get_session(session_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return get_or_404(db, InspectionSession, session_id, "Inspection")


@router.patch("/inspections/{session_id}", response_model=SessionOut)
def update_session(session_id: int, body: SessionUpdate, db: Session = Depends(get_db),
                   user: User = Depends(require("inspection:write"))):
    session = get_or_404(db, InspectionSession, session_id, "Inspection")
    if body.status == "closed":
        unresolved = db.scalar(select(func.count(Defect.id)).where(
            Defect.session_id == session.id, Defect.status == "ai_suspected")) or 0
        if unresolved:
            raise HTTPException(status_code=409, detail=f"{unresolved} AI-suspected finding(s) must be verified or rejected before closing")
    if body.status is not None:
        session.status = body.status
    if body.conditions is not None:
        if len(body.conditions) > 20:
            raise HTTPException(status_code=422, detail="At most 20 condition fields are allowed")
        session.conditions = body.conditions
    if body.observations is not None:
        session.observations = body.observations
    session.updated_at = utcnow()
    record_audit(db, user, "update", "inspection", session.id, f"status={session.status}")
    db.commit()
    db.refresh(session)
    return session


# ---------- evidence ----------
@router.get("/inspections/{session_id}/evidence", response_model=list[EvidenceOut])
def list_evidence(session_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    get_or_404(db, InspectionSession, session_id, "Inspection")
    return db.scalars(select(Evidence).where(Evidence.session_id == session_id).order_by(Evidence.id)).all()


@router.post("/inspections/{session_id}/evidence", response_model=EvidenceOut, status_code=201)
def upload_evidence(
    session_id: int,
    file: UploadFile = File(...),
    component_id: int | None = Form(default=None),
    caption: str | None = Form(default=None, max_length=255),
    db: Session = Depends(get_db),
    user: User = Depends(require("evidence:write")),
):
    session = get_or_404(db, InspectionSession, session_id, "Inspection")
    _ensure_open(session)
    if component_id is not None:
        component = get_or_404(db, Component, component_id, "Component")
        if component.boiler_id != session.boiler_id:
            raise HTTPException(status_code=422, detail="Component does not belong to this inspection's boiler")
    limit = get_settings().max_upload_mb * 1024 * 1024
    data = file.file.read(limit + 1)
    width, height, content_type, suffix = validate_image_upload(data, file.content_type)
    key, sha = evidence_storage().save(data, suffix)
    evidence = Evidence(
        session_id=session.id, component_id=component_id, filename=_safe_filename(file.filename),
        storage_key=key, content_type=content_type, size_bytes=len(data), sha256=sha,
        width=width, height=height, caption=caption, source="uploaded_photograph", is_demo=False,
        uploaded_by_id=user.id,
    )
    db.add(evidence)
    db.flush()
    record_audit(db, user, "upload", "evidence", evidence.id, f"{session.code} {evidence.filename} sha256={sha[:12]}")
    db.commit()
    db.refresh(evidence)
    return evidence


@router.get("/evidence/{evidence_id}/file")
def get_evidence_file(evidence_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    evidence = get_or_404(db, Evidence, evidence_id, "Evidence")
    return Response(content=evidence_storage().read(evidence.storage_key), media_type=evidence.content_type,
                    headers={"Cache-Control": "private, max-age=300"})


# ---------- measurements ----------
@router.get("/inspections/{session_id}/measurements", response_model=list[MeasurementOut])
def list_measurements(session_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    get_or_404(db, InspectionSession, session_id, "Inspection")
    return db.scalars(select(Measurement).where(Measurement.session_id == session_id).order_by(Measurement.id)).all()


@router.post("/inspections/{session_id}/measurements", response_model=MeasurementOut, status_code=201)
def add_measurement(session_id: int, body: MeasurementCreate, db: Session = Depends(get_db),
                    user: User = Depends(require("measurement:write"))):
    session = get_or_404(db, InspectionSession, session_id, "Inspection")
    _ensure_open(session)
    component = get_or_404(db, Component, body.component_id, "Component")
    if component.boiler_id != session.boiler_id:
        raise HTTPException(status_code=422, detail="Component does not belong to this inspection's boiler")
    recorded = _naive_utc(body.recorded_at) if body.recorded_at else datetime.combine(session.inspection_date, time(12, 0))
    measurement = Measurement(
        session_id=session.id, component_id=component.id, parameter=body.parameter, value=body.value,
        unit=PARAMETER_UNITS[body.parameter], method=body.method, location_key=body.location_key,
        location_label=body.location_label, instrument=body.instrument, quality=body.quality,
        source="manual", is_demo=False, recorded_at=recorded, recorded_by_id=user.id,
    )
    db.add(measurement)
    db.flush()
    record_audit(db, user, "create", "measurement", measurement.id,
                 f"{component.code} {body.value} {PARAMETER_UNITS[body.parameter]} at {body.location_key}")
    db.commit()
    db.refresh(measurement)
    return measurement


@router.post("/inspections/{session_id}/measurements/import")
def import_measurements(session_id: int, file: UploadFile = File(...), db: Session = Depends(get_db),
                        user: User = Depends(require("measurement:write"))):
    session = get_or_404(db, InspectionSession, session_id, "Inspection")
    _ensure_open(session)
    settings = get_settings()
    data = file.file.read(2 * 1024 * 1024 + 1)
    if len(data) > 2 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="CSV exceeds 2 MB; split the file")
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=422, detail="CSV must be UTF-8 encoded")
    components = db.scalars(select(Component).where(Component.boiler_id == session.boiler_id)).all()
    by_code = {c.code: c.id for c in components}
    default_time = datetime.combine(session.inspection_date, time(12, 0))
    result = parse_measurement_csv(text, by_code, settings.max_csv_rows, default_time)

    accepted = 0
    for row in result.accepted:
        if row["session_code"] and row["session_code"] != session.code:
            result.errors.append({"line": row["line"], "reason": f"session_code {row['session_code']} does not match {session.code}"})
            continue
        db.add(Measurement(
            session_id=session.id, component_id=row["component_id"], parameter=row["parameter"],
            value=row["value"], unit=row["unit"], method=row["method"], location_key=row["location_key"],
            location_label=row["location_label"], instrument=row["instrument"], quality=row["quality"],
            source="csv_import", is_demo=False, recorded_at=_naive_utc(row["recorded_at"]), recorded_by_id=user.id,
        ))
        accepted += 1
    record_audit(db, user, "import", "measurement", session.id,
                 f"{file.filename}: {accepted} accepted, {len(result.errors)} rejected")
    db.commit()
    errors = sorted(result.errors, key=lambda e: e["line"])
    return {"row_count": result.row_count, "accepted": accepted, "rejected": len(errors), "errors": errors[:100]}


# ---------- defects ----------
@router.get("/inspections/{session_id}/defects", response_model=list[DefectOut])
def list_session_defects(session_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    get_or_404(db, InspectionSession, session_id, "Inspection")
    return db.scalars(select(Defect).where(Defect.session_id == session_id).order_by(Defect.id)).all()


@router.post("/inspections/{session_id}/defects", response_model=DefectOut, status_code=201)
def record_defect(session_id: int, body: DefectCreate, db: Session = Depends(get_db),
                  user: User = Depends(require("inspection:write"))):
    session = get_or_404(db, InspectionSession, session_id, "Inspection")
    _ensure_open(session)
    component = get_or_404(db, Component, body.component_id, "Component")
    if component.boiler_id != session.boiler_id:
        raise HTTPException(status_code=422, detail="Component does not belong to this inspection's boiler")
    if body.evidence_id is not None:
        evidence = get_or_404(db, Evidence, body.evidence_id, "Evidence")
        if evidence.session_id != session.id:
            raise HTTPException(status_code=422, detail="Evidence belongs to a different inspection")
    defect = Defect(
        session_id=session.id, component_id=component.id, evidence_id=body.evidence_id, category=body.category,
        description=body.description, origin="engineer_entered", status="engineer_verified", severity=body.severity,
        verified_by_id=user.id, verified_at=utcnow(), verification_note="Recorded and verified by the inspecting engineer.",
        is_demo=False,
    )
    db.add(defect)
    db.flush()
    record_audit(db, user, "create", "defect", defect.id, f"{component.code} {body.category} ({body.severity})")
    db.commit()
    db.refresh(defect)
    return defect


@router.get("/defects", response_model=list[DefectOut])
def list_defects(
    boiler_id: int | None = None,
    component_id: int | None = None,
    status: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(Defect).join(Component, Defect.component_id == Component.id).order_by(Defect.id.desc())
    if boiler_id is not None:
        stmt = stmt.where(Component.boiler_id == boiler_id)
    if component_id is not None:
        stmt = stmt.where(Defect.component_id == component_id)
    if status:
        stmt = stmt.where(Defect.status == status)
    return db.scalars(apply_text_search(stmt, [Defect.category, Defect.description, Component.code], q)).all()


@router.patch("/defects/{defect_id}/verification", response_model=DefectOut)
def verify_defect(defect_id: int, body: VerificationIn, db: Session = Depends(get_db),
                  user: User = Depends(require("defect:verify"))):
    defect = get_or_404(db, Defect, defect_id, "Defect")
    if body.action == "verify":
        severity = body.severity or (defect.severity if defect.severity != "unassessed" else None)
        if severity is None:
            raise HTTPException(status_code=422, detail="Assign a severity (low, moderate or severe) when verifying a finding")
        defect.status = "engineer_verified"
        defect.severity = severity
    elif body.action == "reject":
        defect.status = "rejected"
    else:
        defect.status = "requires_further_testing"
        if body.severity:
            defect.severity = body.severity
    defect.verified_by_id = user.id
    defect.verified_at = utcnow()
    defect.verification_note = body.note or defect.verification_note
    record_audit(db, user, body.action, "defect", defect.id, f"status={defect.status} severity={defect.severity}")
    db.commit()
    db.refresh(defect)
    return defect
