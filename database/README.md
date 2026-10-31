# Database

PostgreSQL is the target database. SQLite is used for quick local runs. The schema is defined in
`backend/app/models/entities.py`.

## Entities and relationships

```
Organisation 1─* Plant 1─* Boiler 1─* Component
                                 │          │
Boiler 1─* InspectionSession ────┘          │
        │                                    │
        ├─* Evidence ──(component?)──────────┤
        │      └─* AnalysisRun               │
        ├─* Measurement ───────────────────── (component)
        ├─* Defect ────────────────────────── (component, evidence?, analysis_run?)
        └─* SensorBatch ─ Device

Component 1─* RiskReview · MaintenanceAction (─ Defect?)
Boiler 1─* InspectionPlan 1─* PlanItem (─ Component)
Session 1─* Report · AuditLog (by user email and role)
User ─ referenced by created_by / verified_by / uploaded_by fields
```

Every finding is traceable to an asset (boiler), a component, an inspection session and an evidence source where one exists.

## Migrations

Migrations are not generated yet. The application calls `Base.metadata.create_all` on start, which is safe for a new
database but cannot alter an existing one. The next step is Alembic:

```bash
cd backend
alembic init migrations          # not yet committed
alembic revision --autogenerate -m "initial schema"
alembic upgrade head
```

Once Alembic is in place, start-up should run migrations instead of `create_all`. This directory will then hold the versions.

## Demonstration data

`sample-data/` holds the source files for the labelled dataset. They are loaded by `backend/app/services/sample_data.py`,
either on first start (when the database is empty) or through the administrator reset. `database/seed/` is reserved
for SQL seed scripts if the team prefers them to the Python loader.
