"""PDF engineering report for one inspection session. Every item is traceable to stored record IDs."""
import hashlib
from io import BytesIO
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.clock import utcnow
from app.core.config import Settings
from app.models.entities import (
    Boiler, Component, Defect, Evidence, InspectionSession, MaintenanceAction, Measurement, Plant, User,
)
from app.services.memory_engine import component_memory
from app.services.risk_engine import assess_component

INK = colors.HexColor("#1d2330")
STEEL = colors.HexColor("#5b6472")
AMBER = colors.HexColor("#b86e00")
GRID = colors.HexColor("#c9ced8")


def _p(text: Any, style: ParagraphStyle) -> Paragraph:
    return Paragraph(escape(str(text if text is not None else "—")), style)


def _table(rows: list[list[Any]], widths: list[float], styles: dict) -> Table:
    data = [[_p(c, styles["cell_head"] if i == 0 else styles["cell"]) for c in row] for i, row in enumerate(rows)]
    table = Table(data, colWidths=widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, GRID),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e9edf3")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table


def build_session_report(db, session: InspectionSession, user: User | None, settings: Settings) -> tuple[bytes, str]:
    boiler = db.get(Boiler, session.boiler_id)
    plant = db.get(Plant, boiler.plant_id)
    measurements = db.query(Measurement).filter(Measurement.session_id == session.id).order_by(Measurement.id).all()
    defects = db.query(Defect).filter(Defect.session_id == session.id).order_by(Defect.id).all()
    evidence = db.query(Evidence).filter(Evidence.session_id == session.id).order_by(Evidence.id).all()
    component_ids = sorted({m.component_id for m in measurements} | {d.component_id for d in defects}
                           | {e.component_id for e in evidence if e.component_id})
    components = {c.id: c for c in db.query(Component).filter(Component.id.in_(component_ids)).all()} if component_ids else {}

    styles_base = getSampleStyleSheet()
    styles = {
        "title": ParagraphStyle("t", parent=styles_base["Title"], fontSize=17, textColor=INK, spaceAfter=4),
        "h2": ParagraphStyle("h2", parent=styles_base["Heading2"], fontSize=12, textColor=INK, spaceBefore=10, spaceAfter=4),
        "body": ParagraphStyle("b", parent=styles_base["BodyText"], fontSize=9, leading=12, textColor=INK),
        "banner": ParagraphStyle("bn", parent=styles_base["BodyText"], fontSize=8.5, leading=11, textColor=AMBER),
        "cell": ParagraphStyle("c", parent=styles_base["BodyText"], fontSize=7.8, leading=9.5, textColor=INK),
        "cell_head": ParagraphStyle("ch", parent=styles_base["BodyText"], fontSize=7.8, leading=9.5, textColor=INK, fontName="Helvetica-Bold"),
    }
    width = A4[0] - 30 * mm
    story: list = []
    story.append(Paragraph("BOILERGUARD AI &mdash; Inspection Intelligence Report", styles["title"]))
    story.append(Paragraph(
        "DEMONSTRATION REPORT. Values marked SIMULATED or DEMO are synthetic sample data. Analysis outputs are "
        "demonstration heuristics. This document is not a statutory inspection certificate and does not replace "
        "review by a qualified engineer under the applicable regulations.", styles["banner"]))
    story.append(Spacer(1, 6))

    story.append(Paragraph("1. Asset and inspection", styles["h2"]))
    story.append(_table([
        ["Field", "Value"],
        ["Plant", f"{plant.code} — {plant.name} ({plant.location})"],
        ["Boiler", f"{boiler.code} — {boiler.name}; {boiler.boiler_type}; {boiler.rated_capacity_tph} t/h; {boiler.design_pressure_bar} bar"],
        ["Inspection record", f"{session.code} (ID {session.id})"],
        ["Inspection date / type", f"{session.inspection_date.isoformat()} / {session.inspection_type}"],
        ["Method", session.method],
        ["Record status", session.status],
        ["Conditions", "; ".join(f"{k}: {v}" for k, v in (session.conditions or {}).items()) or "Not recorded"],
        ["Observations", session.observations or "Not recorded"],
    ], [width * 0.28, width * 0.72], styles))

    story.append(Paragraph("2. Components examined and boiler memory", styles["h2"]))
    rows = [["Component", "Category", "Latest min. thickness", "Min. required", "Risk category", "Index*", "Flagged changes"]]
    memory_blocks = []
    for cid in component_ids:
        comp = components.get(cid)
        if comp is None:
            continue
        risk = assess_component(db, comp, settings)
        mem = component_memory(db, comp, settings)
        memory_blocks.append((comp, risk, mem))
        rows.append([
            f"{comp.code} — {comp.name}", comp.category,
            f"{risk['latest_min_thickness_mm']:.2f} mm" if risk["latest_min_thickness_mm"] is not None else "—",
            f"{comp.min_required_thickness_mm:.2f} mm" if comp.min_required_thickness_mm else "—",
            risk["category"], risk["priority_index"], len(mem["flagged_changes"]),
        ])
    story.append(_table(rows, [width * 0.25, width * 0.13, width * 0.12, width * 0.1, width * 0.18, width * 0.06, width * 0.16], styles))
    story.append(Paragraph("*Index is an indicative ordering aid derived from transparent rules. It is not a probability of failure.", styles["body"]))

    story.append(Paragraph("3. Measurement records (this inspection)", styles["h2"]))
    if measurements:
        rows = [["ID", "Component", "Parameter", "Value", "Method", "Location", "Quality", "Source"]]
        for m in measurements:
            flag = " [SIMULATED]" if m.is_demo else ""
            rows.append([m.id, components[m.component_id].code if m.component_id in components else m.component_id,
                         m.parameter, f"{m.value:.2f} {m.unit}", m.method, (m.location_label or m.location_key) + flag,
                         m.quality, m.source])
        story.append(_table(rows, [width * 0.06, width * 0.14, width * 0.13, width * 0.1, width * 0.15, width * 0.22, width * 0.08, width * 0.12], styles))
    else:
        story.append(Paragraph("No measurements recorded for this inspection.", styles["body"]))

    story.append(Paragraph("4. Evidence and AI-suspected findings", styles["h2"]))
    if evidence:
        rows = [["Evidence ID", "File", "SHA-256 (first 16)", "Component", "Caption", "Source"]]
        for e in evidence:
            rows.append([e.id, e.filename, e.sha256[:16], components[e.component_id].code if e.component_id in components else "unlinked",
                         e.caption, e.source + (" [SIMULATED]" if e.is_demo else "")])
        story.append(_table(rows, [width * 0.1, width * 0.2, width * 0.17, width * 0.13, width * 0.2, width * 0.2], styles))
    if defects:
        story.append(Spacer(1, 6))
        rows = [["Defect ID", "Component", "Category", "Status", "Severity", "AI confidence", "Area", "Verification note"]]
        for d in defects:
            rows.append([d.id, components[d.component_id].code if d.component_id in components else d.component_id,
                         d.category, d.status, d.severity,
                         f"{d.ai_confidence:.2f} (heuristic)" if d.ai_confidence is not None else "—",
                         f"{d.area_fraction * 100:.2f}%" if d.area_fraction is not None else "—",
                         d.verification_note])
        story.append(_table(rows, [width * 0.07, width * 0.15, width * 0.16, width * 0.14, width * 0.1, width * 0.12, width * 0.07, width * 0.19], styles))
    else:
        story.append(Paragraph("No defect records for this inspection.", styles["body"]))

    story.append(Paragraph("5. Historical comparison and flagged changes", styles["h2"]))
    any_comparison = False
    for comp, risk, mem in memory_blocks:
        for c in mem["comparisons"]:
            if c["current_session_id"] != session.id:
                continue
            any_comparison = True
            story.append(Paragraph(
                f"<b>{escape(comp.code)}</b> at {escape(c['location_label'] or c['location_key'])}: "
                f"{escape(c['message'])}", styles["body"]))
            story.append(Spacer(1, 3))
    if not any_comparison:
        story.append(Paragraph("No comparable historical readings were available for this inspection.", styles["body"]))

    story.append(Paragraph("6. Explainable risk prioritisation", styles["h2"]))
    for comp, risk, _mem in memory_blocks:
        story.append(Paragraph(f"<b>{escape(comp.code)} — {escape(risk['category'])}</b> (index {risk['priority_index']})", styles["body"]))
        for f in risk["factors"]:
            story.append(Paragraph(f"&bull; {escape(f['factor'])} ({f['points']} pts): {escape(f['detail'])}", styles["body"]))
        story.append(Paragraph(f"Recommended follow-up: {escape(risk['recommended_follow_up'])}", styles["body"]))
        story.append(Spacer(1, 4))

    story.append(Paragraph("7. Maintenance actions for examined components", styles["h2"]))
    actions = db.query(MaintenanceAction).filter(MaintenanceAction.component_id.in_(component_ids)).all() if component_ids else []
    if actions:
        rows = [["Action ID", "Component", "Type", "Status", "Assigned to", "Due", "Description"]]
        for a in actions:
            rows.append([a.id, components[a.component_id].code, a.action_type, a.status, a.assigned_to,
                         a.due_date.isoformat() if a.due_date else "—", a.description])
        story.append(_table(rows, [width * 0.09, width * 0.13, width * 0.16, width * 0.1, width * 0.14, width * 0.1, width * 0.28], styles))
    else:
        story.append(Paragraph("No maintenance actions recorded for examined components.", styles["body"]))

    story.append(Paragraph("8. Data limitations", styles["h2"]))
    limits: list[str] = []
    for _comp, _risk, mem in memory_blocks:
        for lim in mem["limitations"]:
            if lim not in limits:
                limits.append(lim)
    for lim in limits:
        story.append(Paragraph(f"&bull; {escape(lim)}", styles["body"]))

    story.append(Paragraph("9. Reviewer and provenance", styles["h2"]))
    generated_at = utcnow().strftime("%Y-%m-%d %H:%M UTC")
    story.append(_table([
        ["Generated at", generated_at],
        ["Generated by", f"{user.full_name} ({user.role}, {user.email})" if user else "system"],
        ["Engineer review and sign-off", "______________________________ (name, qualification, date)"],
        ["Source records", f"Inspection {session.id}; measurements {len(measurements)}; evidence {len(evidence)}; defects {len(defects)}"],
    ], [width * 0.3, width * 0.7], styles))

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
                            topMargin=14 * mm, bottomMargin=14 * mm,
                            title=f"BOILERGUARD AI report {session.code}", author="BOILERGUARD AI (demonstration)")

    def footer(canvas, _doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(STEEL)
        canvas.drawString(15 * mm, 8 * mm, f"BOILERGUARD AI demonstration report · {session.code} · simulated data labelled")
        canvas.drawRightString(A4[0] - 15 * mm, 8 * mm, f"Page {canvas.getPageNumber()}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    pdf = buffer.getvalue()
    return pdf, hashlib.sha256(pdf).hexdigest()
