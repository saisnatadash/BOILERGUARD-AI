# API reference (summary)

All endpoints are under `/api`. Except for `/api/auth/login` and `/api/health`, each requires
`Authorization: Bearer <token>`. Interactive documentation is served at `/docs` when the API is running.

## Authentication and administration

| Method | Path | Permission | Purpose |
|---|---|---|---|
| POST | `/auth/login` | none | Exchange email and password for a token |
| GET | `/auth/me` | login | Current user |
| GET | `/admin/me/permissions` | login | Role and permission list for the UI |
| GET | `/admin/users` | admin | List users |
| POST | `/admin/users` | admin | Create a user |
| PATCH | `/admin/users/{id}` | admin | Change role, status or name (cannot remove own admin access) |
| GET | `/admin/audit?q=&entity=&limit=` | admin | Search the audit trail |
| POST | `/admin/reset-demo` | admin | Reload the labelled demonstration dataset |

## Assets

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET / POST | `/plants` | asset:write for POST | Plants (search with `q`) |
| GET / POST | `/boilers` | asset:write for POST | Boilers (`plant_id`, `q`) |
| GET | `/boilers/{id}` | login | One boiler |
| GET | `/boilers/{id}/twin` | login | Digital twin data with risk category per component |
| GET / POST | `/components` | asset:write for POST | Component registry (`boiler_id`, `category`, `q`) |
| GET | `/components/{id}` | login | One component |

## Inspection workspace

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET / POST | `/inspections` | inspection:write for POST | Sessions (`boiler_id`, `status`, `q`) |
| GET / PATCH | `/inspections/{id}` | inspection:write for PATCH | Read; update status, conditions, observations. Closing is blocked while findings are AI-suspected. |
| GET / POST | `/inspections/{id}/evidence` | evidence:write for POST | Evidence register; multipart upload (JPEG/PNG, 10 MB limit) |
| GET | `/evidence/{id}/file` | login | Stored image |
| GET / POST | `/inspections/{id}/measurements` | measurement:write for POST | Measurements |
| POST | `/inspections/{id}/measurements/import` | measurement:write | CSV import; returns accepted count and per-line errors |
| GET / POST | `/inspections/{id}/defects` | inspection:write for POST | Findings in a session; POST records an engineer-observed finding |
| GET | `/defects` | login | Search findings (`boiler_id`, `component_id`, `status`, `q`) |
| PATCH | `/defects/{id}/verification` | defect:verify | `verify` (severity required), `reject` (note required), `require_testing` |

## Intelligence

| Method | Path | Permission | Purpose |
|---|---|---|---|
| POST | `/evidence/{id}/analysis` | analysis:run | Run the demonstration analyzer; creates AI-suspected findings |
| GET | `/evidence/{id}/analysis-runs` | login | Analysis history for an evidence item |
| GET | `/analysis-runs/{id}/annotated` | login | Annotated output image |
| GET | `/components/{id}/memory` | login | Boiler Memory: timeline, comparisons, thickness series, defect progression, flagged changes, limitations |
| GET | `/components/{id}/risk` | login | Explainable risk assessment with factors, evidence, limitations and follow-up |
| GET | `/risk?boiler_id=&category=` | login | Ranked risk list |
| POST | `/components/{id}/risk-reviews` | risk:review | Record an engineering review of the category, with reasoning |
| GET | `/dashboard/summary` | login | Command-centre aggregates |

## Robotics, planning and operations

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET / POST | `/devices` | device:write for POST | Device registry (simulated) |
| POST | `/devices/{id}/simulate-batch` | device:write | Generate a SIMULATED batch for an open inspection |
| GET | `/devices/batches` | login | Batch history with data-quality figures |
| GET / POST | `/plans` | plan:write for POST | Inspection plans |
| GET | `/plans/{id}` | login | Plan items and grouped proposed schedule |
| POST | `/plans/{id}/items` | plan:write | Add an item (statutory items require a reference) |
| PATCH | `/plan-items/{id}` | plan:write | Mark planned or completed |
| DELETE | `/plan-items/{id}` | plan:write | Remove an item (refused for statutory items) |
| GET / POST | `/maintenance-actions` | maintenance:write for POST | Maintenance actions |
| PATCH | `/maintenance-actions/{id}` | maintenance:write | Update status |
| POST | `/reports` | report:generate | Generate a PDF for an inspection session |
| GET | `/reports` | login | Report register |
| GET | `/reports/{id}/download` | login | Download a PDF |
| GET | `/export/measurements.csv` | login | Measurement export (`boiler_id`, `component_id`) |
| GET | `/export/defects.csv` | login | Finding export (`boiler_id`, `status`) |
| GET | `/export/boilers.csv` | login | Boiler register export |

## Errors

```json
{ "detail": "Role 'viewer' does not have permission 'report:generate'" }
```

Validation failures return `422` with `errors: [{field, message}]`.
