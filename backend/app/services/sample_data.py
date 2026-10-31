"""Demonstration dataset: loads sample-data/ files, generates labelled sample images, and runs the analysis.

Every record created here has is_demo=True so the UI and reports can label it as simulated.
"""
import csv
import json
import os
from datetime import date, datetime
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.ai.sample_images import render_sample_surface
from app.core.audit import record_audit
from app.core.clock import utcnow
from app.core.config import Settings
from app.core.security import hash_password
from app.models.entities import (
    AnalysisRun, Boiler, Component, Defect, Device, Evidence, InspectionPlan, InspectionSession,
    MaintenanceAction, Measurement, Organisation, Plant, PlanItem, Report, RiskReview, SensorBatch, User,
)
from app.services.analysis import run_analysis
from app.services.storage import evidence_storage

DEFAULT_USERS = [
    ("admin@boilerguard.demo", "Demo Administrator", "admin", "Admin@12345"),
    ("engineer@boilerguard.demo", "Demo Inspection Engineer", "inspection_engineer", "Engineer@12345"),
    ("manager@boilerguard.demo", "Demo Maintenance Manager", "maintenance_manager", "Manager@12345"),
    ("viewer@boilerguard.demo", "Demo Viewer", "viewer", "Viewer@12345"),
]


def sample_data_dir() -> Path:
    env = os.environ.get("SAMPLE_DATA_DIR")
    if env:
        return Path(env)
    return Path(__file__).resolve().parents[3] / "sample-data"


def ensure_default_users(db: Session) -> None:
    for email, name, role, password in DEFAULT_USERS:
        if db.scalar(select(User).where(User.email == email)) is None:
            db.add(User(email=email, full_name=name, role=role, password_hash=hash_password(password)))
    db.commit()


def wipe_domain_data(db: Session) -> None:
    """Remove demonstration and inspection data. Users and the audit trail are kept."""
    for evidence in db.scalars(select(Evidence)):
        try:
            evidence_storage().delete(evidence.storage_key)
        except Exception:  # noqa: BLE001 - a missing file must not block a reset
            pass
    for model in (Report, SensorBatch, Measurement, Defect, AnalysisRun, Evidence, InspectionSession,
                  PlanItem, InspectionPlan, MaintenanceAction, RiskReview, Device, Component, Boiler, Plant,
                  Organisation):
        db.execute(delete(model))
    db.commit()


def seed_demo(db: Session, settings: Settings, actor: User | None = None) -> dict:
    base = sample_data_dir()
    org = Organisation(name="Demo Power Utility (SIMULATED)")
    db.add(org)
    db.flush()

    plants = json.loads((base / "boilers" / "plants.json").read_text())
    plant_by_code: dict[str, Plant] = {}
    for p in plants["plants"]:
        plant = Plant(organisation_id=org.id, code=p["code"], name=p["name"], location=p["location"],
                      description=p["description"], is_demo=True)
        db.add(plant)
        db.flush()
        plant_by_code[p["code"]] = plant
    boiler_by_code: dict[str, Boiler] = {}
    for b in plants["boilers"]:
        boiler = Boiler(plant_id=plant_by_code[b["plant_code"]].id, code=b["code"], name=b["name"],
                        boiler_type=b["boiler_type"], rated_capacity_tph=b["rated_capacity_tph"],
                        design_pressure_bar=b["design_pressure_bar"], commissioned_year=b["commissioned_year"],
                        description=b["description"], is_demo=True)
        db.add(boiler)
        db.flush()
        boiler_by_code[b["code"]] = boiler

    component_by_code: dict[str, Component] = {}
    with (base / "components" / "components.csv").open(newline="") as fh:
        for row in csv.DictReader(fh):
            boiler = boiler_by_code[row["boiler_code"]]
            component = Component(
                boiler_id=boiler.id, code=row["code"], name=row["name"], category=row["category"],
                diagram_key=row["diagram_key"],
                nominal_thickness_mm=float(row["nominal_thickness_mm"]) if row["nominal_thickness_mm"] else None,
                min_required_thickness_mm=float(row["min_required_thickness_mm"]) if row["min_required_thickness_mm"] else None,
                material=row["material"] or None, description=row["description"] or None,
            )
            db.add(component)
            db.flush()
            component_by_code[row["code"]] = component

    sessions = json.loads((base / "inspections" / "sessions.json").read_text())
    session_by_code: dict[str, InspectionSession] = {}
    for s in sessions:
        session = InspectionSession(
            code=s["code"], boiler_id=boiler_by_code[s["boiler_code"]].id,
            inspection_date=date.fromisoformat(s["inspection_date"]), inspection_type=s["inspection_type"],
            method=s["method"], status=s["status"], conditions=s["conditions"], observations=s["observations"],
            is_demo=True, created_by_id=actor.id if actor else None,
        )
        db.add(session)
        db.flush()
        session_by_code[s["code"]] = session

    with (base / "measurements" / "measurements.csv").open(newline="") as fh:
        for row in csv.DictReader(fh):
            db.add(Measurement(
                session_id=session_by_code[row["session_code"]].id,
                component_id=component_by_code[row["component_code"]].id,
                parameter=row["parameter"], value=float(row["value"]), unit=row["unit"], method=row["method"],
                location_key=row["location_key"], location_label=row["location_label"] or None,
                instrument=row["instrument"] or None, quality=row["quality"], source="demo_seed",
                is_demo=True, recorded_at=datetime.fromisoformat(row["recorded_at"]),
            ))
    db.flush()

    manifest = json.loads((base / "images" / "manifest.json").read_text())
    evidence_rows: list[Evidence] = []
    storage = evidence_storage()
    for item in manifest:
        png = render_sample_surface(
            label=f"{item['component_code']} {item['session_code']}",
            seed=item["seed"], rust_patches=item["rust_patches"], cracks=item["cracks"],
        )
        key, sha = storage.save(png, ".png")
        ev = Evidence(
            session_id=session_by_code[item["session_code"]].id,
            component_id=component_by_code[item["component_code"]].id,
            filename=item["filename"], storage_key=key, content_type="image/png", size_bytes=len(png),
            sha256=sha, width=640, height=480, caption=item["caption"], source="simulated_sample_image",
            is_demo=True, uploaded_by_id=actor.id if actor else None,
        )
        db.add(ev)
        db.flush()
        evidence_rows.append(ev)

    analysed = 0
    for ev in evidence_rows:
        run_analysis(db, ev, actor)
        analysed += 1
    db.flush()

    # Demonstration of the engineer verification workflow on one earlier finding.
    engineer = db.scalar(select(User).where(User.role == "inspection_engineer").limit(1))
    earlier = session_by_code["INS-2024-0007"].id
    first = db.scalar(select(Defect).where(Defect.session_id == earlier, Defect.status == "ai_suspected").limit(1))
    if first is not None and engineer is not None:
        first.status = "engineer_verified"
        first.severity = "moderate"
        first.verified_by_id = engineer.id
        first.verified_at = utcnow()
        first.verification_note = "Seeded demonstration verification. Recorded for workflow illustration only."

    for d in json.loads((base / "devices" / "devices.json").read_text()):
        db.add(Device(code=d["code"], name=d["name"], device_type=d["device_type"], status=d["status"],
                      is_simulated=True, last_communication_at=utcnow(), description=d["description"]))

    plan_def = json.loads((base / "inspections" / "plan.json").read_text())
    plan = InspectionPlan(boiler_id=boiler_by_code[plan_def["boiler_code"]].id, name=plan_def["name"],
                          planned_start=date.fromisoformat(plan_def["planned_start"]), status="draft",
                          created_by_id=actor.id if actor else None)
    db.add(plan)
    db.flush()
    for item in plan_def["items"]:
        db.add(PlanItem(
            plan_id=plan.id, component_id=component_by_code[item["component_code"]].id,
            priority=item["priority"], method_class=item["method_class"], required_method=item["required_method"],
            access_constraints=item.get("access_constraints"), statutory=item.get("statutory", False),
            statutory_reference=item.get("statutory_reference"), responsible_person=item.get("responsible_person"),
        ))

    db.add(MaintenanceAction(
        component_id=component_by_code["SH-PLATEN-03"].id, action_type="engineering_review",
        description="Engineer to review the simulated low thickness reading and arrange an independent measurement.",
        status="open", assigned_to="Demo Inspection Engineer", due_date=date(2026, 12, 15),
        created_by_id=actor.id if actor else None,
    ))
    record_audit(db, actor, "demo.seeded", "dataset", None,
                 f"Loaded {len(component_by_code)} components, {len(session_by_code)} sessions, {analysed} analysis runs")
    db.commit()
    return {"components": len(component_by_code), "sessions": len(session_by_code),
            "evidence": len(evidence_rows), "analysis_runs": analysed}


def reset_demo(db: Session, settings: Settings, actor: User | None) -> dict:
    wipe_domain_data(db)
    return seed_demo(db, settings, actor)


def seed_if_empty(db: Session, settings: Settings) -> None:
    ensure_default_users(db)
    if db.scalar(select(Plant.id).limit(1)) is None and settings.seed_demo_on_start:
        seed_demo(db, settings, None)
