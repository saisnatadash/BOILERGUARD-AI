"""Robotics & sensors (simulated), inspection planner, maintenance actions, reports and exports."""
from datetime import datetime, time

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import record_audit
from app.core.clock import utcnow
from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import get_current_user, require
from app.integrations.devices import SimulatedUltrasonicAdapter
from app.models.entities import (
    Boiler, Component, Defect, Device, InspectionPlan, InspectionSession, MaintenanceAction, Measurement,
    PlanItem, Report, SensorBatch, User,
)
from app.reporting import csv_export
from app.repositories.base import get_or_404
from app.schemas.schemas import (
    BatchOut, DeviceCreate, DeviceOut, MaintenanceCreate, MaintenanceOut, MaintenanceUpdate, PlanCreate,
    PlanItemCreate, PlanItemOut, PlanItemUpdate, PlanOut, ReportCreate, ReportOut, SimulateBatchIn,
)
from app.services.planner import build_schedule
from app.services.storage import report_storage
from app.reporting.pdf_report import build_session_report

router = APIRouter(tags=["operations"])


def _open_session(session: InspectionSession) -> None:
    if session.status == "closed":
        raise HTTPException(status_code=409, detail="This inspection is closed")


# ---------- robotics & sensors ----------
@router.get("/devices", response_model=list[DeviceOut])
def list_devices(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.scalars(select(Device).order_by(Device.code)).all()


@router.post("/devices", response_model=DeviceOut, status_code=201)
def register_device(body: DeviceCreate, db: Session = Depends(get_db), user: User = Depends(require("device:write"))):
    if db.scalar(select(Device.id).where(Device.code == body.code)):
        raise HTTPException(status_code=409, detail="A device with this code already exists")
    status = "simulated_standby" if body.device_type != "ultrasonic_gauge" else "simulated_online"
    device = Device(code=body.code, name=body.name, device_type=body.device_type, status=status,
                    is_simulated=True, last_communication_at=None, description=body.description)
    db.add(device)
    db.flush()
    record_audit(db, user, "create", "device", device.id, device.code)
    db.commit()
    db.refresh(device)
    return device


@router.post("/devices/{device_id}/simulate-batch", response_model=BatchOut, status_code=201)
def simulate_batch(device_id: int, body: SimulateBatchIn, db: Session = Depends(get_db),
                   user: User = Depends(require("device:write"))):
    device = get_or_404(db, Device, device_id, "Device")
    session = get_or_404(db, InspectionSession, body.session_id, "Inspection")
    _open_session(session)
    adapter = {"ultrasonic_gauge": SimulatedUltrasonicAdapter}.get(device.device_type)
    if adapter is None:
        raise HTTPException(status_code=422, detail="Simulation is available for ultrasonic gauges in this prototype")
    stmt = select(Component).where(Component.boiler_id == session.boiler_id).order_by(Component.code)
    components = list(db.scalars(stmt))
    if body.component_ids:
        allowed = {c.id for c in components}
        if not set(body.component_ids) <= allowed:
            raise HTTPException(status_code=422, detail="Some components do not belong to this boiler")
        components = [c for c in components if c.id in body.component_ids]
    if not components:
        raise HTTPException(status_code=422, detail="No components with a nominal thickness to simulate")

    rows = adapter().read_batch(components, seed=session.id * 1000 + device.id)
    batch = SensorBatch(device_id=device.id, session_id=session.id,
                        filename=f"SIMULATED-{device.code}-{session.code}.json", row_count=len(rows),
                        accepted_count=len(rows), rejected_count=0, quality_score=round(
                            sum(1 for r in rows if r["quality"] == "good") / max(len(rows), 1), 2),
                        errors=[], is_demo=True)
    db.add(batch)
    db.flush()
    recorded = datetime.combine(session.inspection_date, time(12, 0))
    for r in rows:
        db.add(Measurement(
            session_id=session.id, component_id=r["component_id"], parameter=r["parameter"], value=r["value"],
            unit=r["unit"], method=r["method"], location_key=r["location_key"], location_label=r["location_label"],
            instrument=r["instrument"], quality=r["quality"], source="simulated_device", batch_id=batch.id,
            is_demo=True, recorded_at=recorded, recorded_by_id=user.id,
        ))
    device.last_communication_at = utcnow()
    record_audit(db, user, "simulate", "sensor_batch", batch.id, f"{device.code} -> {session.code}: {len(rows)} SIMULATED readings")
    db.commit()
    db.refresh(batch)
    return batch


@router.get("/devices/batches", response_model=list[BatchOut])
def list_batches(device_id: int | None = None, session_id: int | None = None, db: Session = Depends(get_db),
                 _: User = Depends(get_current_user)):
    stmt = select(SensorBatch).order_by(SensorBatch.id.desc())
    if device_id is not None:
        stmt = stmt.where(SensorBatch.device_id == device_id)
    if session_id is not None:
        stmt = stmt.where(SensorBatch.session_id == session_id)
    return db.scalars(stmt).all()


# ---------- inspection planner ----------
@router.get("/plans", response_model=list[PlanOut])
def list_plans(boiler_id: int | None = None, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    stmt = select(InspectionPlan).order_by(InspectionPlan.id.desc())
    if boiler_id is not None:
        stmt = stmt.where(InspectionPlan.boiler_id == boiler_id)
    return db.scalars(stmt).all()


@router.post("/plans", response_model=PlanOut, status_code=201)
def create_plan(body: PlanCreate, db: Session = Depends(get_db), user: User = Depends(require("plan:write"))):
    get_or_404(db, Boiler, body.boiler_id, "Boiler")
    plan = InspectionPlan(boiler_id=body.boiler_id, name=body.name, planned_start=body.planned_start,
                          status="draft", created_by_id=user.id)
    db.add(plan)
    db.flush()
    record_audit(db, user, "create", "plan", plan.id, plan.name)
    db.commit()
    db.refresh(plan)
    return plan


@router.get("/plans/{plan_id}")
def get_plan(plan_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    plan = get_or_404(db, InspectionPlan, plan_id, "Plan")
    items = db.scalars(select(PlanItem).where(PlanItem.plan_id == plan.id).order_by(PlanItem.id)).all()
    codes = {c.id: c.code for c in db.scalars(select(Component).where(Component.boiler_id == plan.boiler_id))}
    return {
        "plan": PlanOut.model_validate(plan).model_dump(),
        "items": [PlanItemOut.model_validate(i).model_dump() | {"component_code": codes.get(i.component_id)} for i in items],
        "schedule": build_schedule(items, codes),
        "note": "Proposed grouping only. Dates, access windows and shutdown timing are confirmed with the plant and qualified personnel.",
    }


@router.post("/plans/{plan_id}/items", response_model=PlanItemOut, status_code=201)
def add_plan_item(plan_id: int, body: PlanItemCreate, db: Session = Depends(get_db),
                  user: User = Depends(require("plan:write"))):
    plan = get_or_404(db, InspectionPlan, plan_id, "Plan")
    component = get_or_404(db, Component, body.component_id, "Component")
    if component.boiler_id != plan.boiler_id:
        raise HTTPException(status_code=422, detail="Component does not belong to this plan's boiler")
    item = PlanItem(plan_id=plan.id, **body.model_dump())
    db.add(item)
    db.flush()
    record_audit(db, user, "create", "plan_item", item.id, f"{component.code} {body.priority} statutory={body.statutory}")
    db.commit()
    db.refresh(item)
    return item


@router.patch("/plan-items/{item_id}", response_model=PlanItemOut)
def update_plan_item(item_id: int, body: PlanItemUpdate, db: Session = Depends(get_db),
                     user: User = Depends(require("plan:write"))):
    item = get_or_404(db, PlanItem, item_id, "Plan item")
    item.status = body.status
    record_audit(db, user, "update", "plan_item", item.id, f"status={body.status}")
    db.commit()
    db.refresh(item)
    return item


@router.delete("/plan-items/{item_id}", status_code=204)
def delete_plan_item(item_id: int, db: Session = Depends(get_db), user: User = Depends(require("plan:write"))):
    item = get_or_404(db, PlanItem, item_id, "Plan item")
    if item.statutory:
        raise HTTPException(status_code=409, detail="Statutory inspection items cannot be removed from a plan")
    record_audit(db, user, "delete", "plan_item", item.id)
    db.delete(item)
    db.commit()
    return Response(status_code=204)


# ---------- maintenance actions ----------
@router.get("/maintenance-actions", response_model=list[MaintenanceOut])
def list_maintenance(component_id: int | None = None, status: str | None = None, db: Session = Depends(get_db),
                     _: User = Depends(get_current_user)):
    stmt = select(MaintenanceAction).order_by(MaintenanceAction.id.desc())
    if component_id is not None:
        stmt = stmt.where(MaintenanceAction.component_id == component_id)
    if status:
        stmt = stmt.where(MaintenanceAction.status == status)
    return db.scalars(stmt).all()


@router.post("/maintenance-actions", response_model=MaintenanceOut, status_code=201)
def create_maintenance(body: MaintenanceCreate, db: Session = Depends(get_db),
                       user: User = Depends(require("maintenance:write"))):
    get_or_404(db, Component, body.component_id, "Component")
    if body.defect_id is not None:
        defect = get_or_404(db, Defect, body.defect_id, "Defect")
        if defect.component_id != body.component_id:
            raise HTTPException(status_code=422, detail="Defect belongs to a different component")
    action = MaintenanceAction(**body.model_dump(), status="open", created_by_id=user.id)
    db.add(action)
    db.flush()
    record_audit(db, user, "create", "maintenance_action", action.id, body.action_type)
    db.commit()
    db.refresh(action)
    return action


@router.patch("/maintenance-actions/{action_id}", response_model=MaintenanceOut)
def update_maintenance(action_id: int, body: MaintenanceUpdate, db: Session = Depends(get_db),
                       user: User = Depends(require("maintenance:write"))):
    action = get_or_404(db, MaintenanceAction, action_id, "Maintenance action")
    action.status = body.status
    record_audit(db, user, "update", "maintenance_action", action.id, f"status={body.status}")
    db.commit()
    db.refresh(action)
    return action


# ---------- reports & exports ----------
@router.post("/reports", response_model=ReportOut, status_code=201)
def generate_report(body: ReportCreate, db: Session = Depends(get_db), user: User = Depends(require("report:generate"))):
    session = get_or_404(db, InspectionSession, body.session_id, "Inspection")
    pdf, checksum = build_session_report(db, session, user, get_settings())
    key, _ = report_storage().save(pdf, ".pdf")
    report = Report(session_id=session.id, title=f"Inspection report {session.code}", kind="pdf",
                    storage_key=key, checksum=checksum, size_bytes=len(pdf), generated_by_id=user.id)
    db.add(report)
    db.flush()
    record_audit(db, user, "report.generate", "report", report.id, f"{session.code} sha256={checksum[:12]}")
    db.commit()
    db.refresh(report)
    return report


@router.get("/reports", response_model=list[ReportOut])
def list_reports(session_id: int | None = None, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    stmt = select(Report).order_by(Report.id.desc())
    if session_id is not None:
        stmt = stmt.where(Report.session_id == session_id)
    return db.scalars(stmt).all()


@router.get("/reports/{report_id}/download")
def download_report(report_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    report = get_or_404(db, Report, report_id, "Report")
    data = report_storage().read(report.storage_key)
    return Response(content=data, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{report.title.replace(" ", "_")}.pdf"'})


@router.get("/export/measurements.csv")
def export_measurements(boiler_id: int | None = None, component_id: int | None = None,
                        db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return Response(content=csv_export.measurements_csv(db, boiler_id, component_id), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="measurements.csv"'})


@router.get("/export/defects.csv")
def export_defects(boiler_id: int | None = None, status: str | None = None, db: Session = Depends(get_db),
                   _: User = Depends(get_current_user)):
    return Response(content=csv_export.defects_csv(db, boiler_id, status), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="defects.csv"'})


@router.get("/export/boilers.csv")
def export_boilers(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return Response(content=csv_export.boilers_csv(db), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="boilers.csv"'})
