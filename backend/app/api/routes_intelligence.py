"""Defect analysis, Boiler Memory Engine, explainable risk, digital twin and Command Centre endpoints."""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analytics.command_centre import command_centre_summary
from app.core.audit import record_audit
from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import get_current_user, require
from app.models.entities import AnalysisRun, Boiler, Component, Evidence, RiskReview, User
from app.repositories.base import get_or_404
from app.schemas.schemas import AnalysisRunOut, RiskReviewIn
from app.services.analysis import run_analysis
from app.services.memory_engine import component_memory
from app.services.risk_engine import CATEGORY_ORDER, assess_all, assess_component
from app.services.storage import evidence_storage

router = APIRouter(tags=["intelligence"])


# ---------- defect analysis ----------
@router.post("/evidence/{evidence_id}/analysis", response_model=AnalysisRunOut, status_code=201)
def analyse_evidence(evidence_id: int, db: Session = Depends(get_db), user: User = Depends(require("analysis:run"))):
    evidence = get_or_404(db, Evidence, evidence_id, "Evidence")
    run = run_analysis(db, evidence, user)
    record_audit(db, user, "analysis.run", "evidence", evidence.id,
                 f"{run.analyzer_name} {run.analyzer_version}: {run.summary.get('finding_count', 0)} suspected finding(s)")
    db.commit()
    db.refresh(run)
    return run


@router.get("/evidence/{evidence_id}/analysis-runs", response_model=list[AnalysisRunOut])
def list_analysis_runs(evidence_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    get_or_404(db, Evidence, evidence_id, "Evidence")
    return db.scalars(select(AnalysisRun).where(AnalysisRun.evidence_id == evidence_id).order_by(AnalysisRun.id.desc())).all()


@router.get("/analysis-runs/{run_id}/annotated")
def annotated_image(run_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    run = get_or_404(db, AnalysisRun, run_id, "Analysis run")
    if not run.annotated_key:
        raise HTTPException(status_code=404, detail="No annotated image for this run")
    return Response(content=evidence_storage().read(run.annotated_key), media_type="image/png",
                    headers={"Cache-Control": "private, max-age=300"})


# ---------- boiler memory ----------
@router.get("/components/{component_id}/memory")
def component_memory_view(component_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    component = get_or_404(db, Component, component_id, "Component")
    return component_memory(db, component, get_settings())


# ---------- explainable risk ----------
@router.get("/components/{component_id}/risk")
def component_risk(component_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    component = get_or_404(db, Component, component_id, "Component")
    return assess_component(db, component, get_settings())


@router.get("/risk")
def risk_list(boiler_id: int | None = None, category: str | None = None, db: Session = Depends(get_db),
              _: User = Depends(get_current_user)):
    results = assess_all(db, get_settings(), boiler_id)
    if category:
        if category not in CATEGORY_ORDER:
            raise HTTPException(status_code=422, detail="Unknown risk category")
        results = [r for r in results if r["category"] == category]
    return results


@router.post("/components/{component_id}/risk-reviews", status_code=201)
def review_risk(component_id: int, body: RiskReviewIn, db: Session = Depends(get_db),
                user: User = Depends(require("risk:review"))):
    component = get_or_404(db, Component, component_id, "Component")
    computed = assess_component(db, component, get_settings())["category"]
    review = RiskReview(component_id=component.id, computed_category=computed,
                        confirmed_category=body.confirmed_category, note=body.note, reviewed_by_id=user.id)
    db.add(review)
    db.flush()
    record_audit(db, user, "risk.review", "component", component.id,
                 f"computed={computed} confirmed={body.confirmed_category}")
    db.commit()
    return {"id": review.id, "computed_category": computed, "confirmed_category": body.confirmed_category,
            "note": body.note, "reviewed_by": user.full_name}


# ---------- digital twin ----------
@router.get("/boilers/{boiler_id}/twin")
def boiler_twin(boiler_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    boiler = get_or_404(db, Boiler, boiler_id, "Boiler")
    settings = get_settings()
    components = db.scalars(select(Component).where(Component.boiler_id == boiler.id).order_by(Component.code)).all()
    items: list[dict[str, Any]] = []
    for c in components:
        risk = assess_component(db, c, settings)
        memory = component_memory(db, c, settings)
        items.append({
            "id": c.id,
            "code": c.code,
            "name": c.name,
            "category": c.category,
            "diagram_key": c.diagram_key,
            "nominal_thickness_mm": c.nominal_thickness_mm,
            "min_required_thickness_mm": c.min_required_thickness_mm,
            "risk_category": risk["category"],
            "priority_index": risk["priority_index"],
            "latest_min_thickness_mm": risk["latest_min_thickness_mm"],
            "inspections": memory["record_counts"]["inspections"],
            "open_findings": sum(1 for d in memory["timeline"][-1]["defects"]) if memory["timeline"] else 0,
            "flagged_changes": len(memory["flagged_changes"]),
        })
    return {
        "boiler": {"id": boiler.id, "code": boiler.code, "name": boiler.name, "boiler_type": boiler.boiler_type,
                   "rated_capacity_tph": boiler.rated_capacity_tph, "design_pressure_bar": boiler.design_pressure_bar},
        "is_conceptual_model": True,
        "components": items,
    }


# ---------- command centre ----------
@router.get("/dashboard/summary")
def dashboard(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return command_centre_summary(db, get_settings())
