"""Runs the demonstration defect analyzer on an evidence image and stores suspected findings for engineer review."""
import io

from fastapi import HTTPException
from PIL import Image
from sqlalchemy.orm import Session

from app.ai.analyzer import DefectAnalyzer, get_analyzer
from app.models.entities import AnalysisRun, Defect, Evidence, User
from app.services.storage import evidence_storage


def run_analysis(db: Session, evidence: Evidence, user: User | None, analyzer: DefectAnalyzer | None = None) -> AnalysisRun:
    if evidence.component_id is None:
        raise HTTPException(status_code=422, detail="Link this evidence to a component before running analysis")
    analyzer = analyzer or get_analyzer()
    storage = evidence_storage()
    image = Image.open(io.BytesIO(storage.read(evidence.storage_key)))
    findings, annotated = analyzer.analyze(image)

    buffer = io.BytesIO()
    annotated.save(buffer, format="PNG")
    annotated_key, _ = storage.save(buffer.getvalue(), ".png")

    counts: dict[str, int] = {}
    for f in findings:
        counts[f.category] = counts.get(f.category, 0) + 1
    run = AnalysisRun(
        evidence_id=evidence.id,
        analyzer_name=analyzer.name,
        analyzer_version=analyzer.version,
        status="completed",
        summary={
            "finding_count": len(findings),
            "categories": counts,
            "disclaimer": "Demonstration output. Not a validated defect assessment and not a measurement of wall thickness.",
        },
        annotated_key=annotated_key,
        is_demonstration=True,
        created_by_id=user.id if user else None,
    )
    db.add(run)
    db.flush()
    for f in findings:
        db.add(Defect(
            session_id=evidence.session_id,
            component_id=evidence.component_id,
            evidence_id=evidence.id,
            analysis_run_id=run.id,
            category=f.category,
            description=f"{f.description} Suggested severity: {f.suggested_severity}.",
            bbox=f.bbox,
            area_fraction=f.area_fraction,
            ai_confidence=f.confidence,
            origin="ai_demo",
            status="ai_suspected",
            severity="unassessed",
            is_demo=evidence.is_demo,
        ))
    evidence.source = evidence.source if evidence.source else "uploaded_photograph"
    return run
