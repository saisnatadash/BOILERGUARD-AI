# Architecture

## Shape of the system

```
 Browser (Next.js)                       FastAPI (Python)                          Storage
 ───────────────────                     ─────────────────────────────             ───────────────────
 Command Centre ─┐                       api/      routers by domain              PostgreSQL / SQLite
 Digital Twin   ─┤  JSON + bearer JWT    core/     config, db, security, RBAC,    (relational records,
 Workspace      ─┼──────────────────────▶ audit                                    audit log)
 AI Defects     ─┤                       services/ memory engine, risk engine,    Local file store
 Memory Engine  ─┤                                 planner, analysis, CSV import   (evidence, annotated
 Risk           ─┤                       ai/       analyzer adapter, sample images  images, PDF reports)
 Robotics       ─┤                       integrations/ device adapters
 Planner        ─┤                       reporting/ PDF, CSV
 Reports        ─┤                       analytics/ command-centre aggregates
 Settings       ─┘                       models/ schemas/ repositories/
```

The frontend never computes risk or change logic. It renders what the API returns, so the rules live in one place
and can be tested without a browser.

## Memory pipeline

The Boiler Memory Engine follows the chain from the problem statement:

```
Inspection evidence ─▶ Component identification ─▶ Measurement normalisation ─▶ Historical record association
        ─▶ Change detection ─▶ Explainable risk assessment ─▶ Engineering review ─▶ Maintenance planning
```

| Stage | Implementation |
|---|---|
| Evidence | `POST /inspections/{id}/evidence` validates JPEG/PNG content (not just the extension), stores it under a generated key, and records its SHA-256. |
| Component identification | Evidence and measurements are linked to a component of the same boiler. Cross-boiler links are rejected. |
| Measurement normalisation | Units are fixed per parameter (`wall_thickness` in mm). CSV rows are validated line by line. |
| Historical association | `services/memory_engine.py` loads each component's sessions in date order. |
| Change detection | Each reading is compared with the nearest earlier comparable reading at the same location. Results include loss in mm and as a percentage of nominal. |
| Explainable risk | `services/risk_engine.py` applies ordered rules. Each factor lists the records behind it. |
| Engineering review | Engineers verify, reject or flag findings. They can also record a reviewed risk category with reasoning. Every decision is audited. |
| Maintenance planning | Planner items, maintenance actions, and statutory protection (`services/planner.py`). |

## Key design decisions

1. **Records, not predictions.** The system stores observations and derives comparisons from them. It does not
   output failure dates or deterioration rates.
2. **Suspected versus verified.** AI output is stored as `ai_suspected`. Only an engineer action changes its status.
3. **Replaceable adapters.** `DefectAnalyzer` (analysis) and `DeviceAdapter` (sensors) are small interfaces. A real
   model or instrument replaces the demonstration class without changing the API or the UI.
4. **Labelled simulation.** `is_demo` is stored on every record, carried into exports, and displayed. Simulated values
   are never presented as plant telemetry.
5. **Permissions on the server.** The UI hides controls for convenience. Each mutating endpoint checks the role itself.
6. **Audit everything that changes state.** Each write records the acting user, role, action, entity and detail.
7. **Single source of truth for thresholds.** Demonstration engineering parameters live in `Settings` (environment-driven).

## Request lifecycle (example: defect verification)

1. The browser sends `PATCH /api/defects/{id}/verification` with a bearer token and `{action, severity, note}`.
2. `get_current_user` decodes the JWT and loads an active user.
3. `require("defect:verify")` checks the role's permission set.
4. Pydantic validates the body. A rejection requires a non-empty note.
5. The defect status and severity are updated, and `record_audit` writes the entry.
6. The response returns the updated record. The UI reloads the list and shows a status message.

## Failure handling

- Validation errors return HTTP 422 with field-level messages.
- Missing or inactive users return 401. Missing permissions return 403.
- Integrity violations return 409. Database failures return 500 with a generic message, and details go to the server log.
- The frontend shows every API error in an alert. Each panel has a loading state and an empty state.
