# Technical design: rules, thresholds and limits

This document states the rules the software applies. Every numeric threshold below is a **demonstration value**
configured in `backend/app/core/config.py` and can be overridden by environment variables. Plant use requires values
approved by a qualified engineer and the applicable design and statutory basis.

## 1. Comparability (Boiler Memory Engine)

Two measurements are comparable only when all of these hold:

| Rule | Reason it matters |
|---|---|
| Same component | Readings from different parts of the boiler are not a trend. |
| Same parameter | Wall thickness is not compared with scale thickness or temperature. |
| Same unit | Prevents mm-to-inch errors. |
| Same method | Different instruments and techniques have different bias. |
| Same location key | Tracks one physical location across inspections. |
| Neither reading has *poor* quality | Poor coupling or surface preparation makes the value unreliable. |

When a pair is not comparable, the engine reports the reasons and does not compute a change.

## 2. Change detection

For each comparable pair, with *previous* and *current* readings:

- `loss_mm = previous − current` (positive means wall loss)
- `loss_pct_of_nominal = loss_mm ÷ nominal × 100`
- `significant` when `loss_mm ≥ change_flag_mm (0.2)` **and** `loss_mm > measurement_uncertainty_mm (0.1)`
- `flagged` when `significant` and `loss_mm > 0`. Only flags in the latest inspection feed the risk rules.

Demonstration check: ECO-TUBE-024 at location ECO24-SEC-A-1.2M reads 5.8 → 5.6 → 5.3 mm. The steps are 0.2 mm
(flagged) and 0.3 mm (flagged). The 2026 step is the latest and therefore drives the risk category.

The engine never outputs a deterioration rate, a remaining-life figure or a failure date.

## 3. Risk categories and rules

Categories are ordered from most to least urgent. The most urgent category triggered by any rule is assigned.

| Category | Triggers (any one) |
|---|---|
| **Critical Review** | Latest usable minimum thickness ≤ demonstration minimum required; or an engineer-verified *severe* finding |
| **High Priority** | Latest minimum within 10% above the minimum required (`critical_margin_ratio = 1.10`); engineer-verified *moderate* finding; flagged wall loss in the latest inspection; findings marked *requires further testing* |
| **Moderate Priority** | Unverified AI-suspected findings; engineer-verified *low* finding; a new abnormality category in the latest inspection; latest inspection older than 365 days |
| **Routine Monitoring** | No trigger above, and data exist |
| **Insufficient Evidence** | No measurements, findings or evidence recorded for the component |

Each contributing factor carries a point value. The **priority index** is the sum, capped at 100. It only orders
review work. It is not calibrated, it is not a probability of failure, and it must not be presented as one.

Each factor lists its evidence (measurement, finding or session IDs). Each assessment lists data limitations. An
engineer can record a reviewed category with a note. If the confirmed category differs from the computed one, the UI says so.

## 4. Defect analysis

- The default analyzer is `heuristic-colour-shape-demo`, version `0.2.0`.
- Rust-coloured regions: hue 8–40°, saturation ≥ 0.38, brightness 0.25–0.9, filled bounding box ≥ 20%. Area ≥ 0.15%
  of the analysed image. Suggested severity: area ≥ 8% → severe; ≥ 2% → moderate; otherwise low.
- Elongated dark streaks: brightness < 0.22, aspect ratio ≥ 4, area ≥ 0.03%. Reported as possible crack-like features requiring examination.
- Confidence is a heuristic score in [0, 1]. It is not calibrated.
- Each run stores its analyzer name, version, summary and an annotated copy. Findings are created with status `ai_suspected`.

## 5. Status lifecycle

| Object | States | Transitions |
|---|---|---|
| Finding | `ai_suspected` → `engineer_verified` / `rejected` / `requires_further_testing` | Verify needs a severity. Reject needs a note. Any state can move to another by an engineer. |
| Inspection | `open` → `submitted` → `closed` | Closing is refused while any finding is `ai_suspected`. Closed records accept no new evidence, measurements or findings. |
| Plan item | `planned` ↔ `completed` | Statutory items cannot be deleted. |
| Maintenance action | `open` → `in_progress` → `done` | |

## 6. CSV import

Required columns: `component_code, parameter, value, unit, method, location_key, quality`.
Optional: `location_label, instrument, recorded_at, session_code`.

- `parameter` ∈ {`wall_thickness` (mm), `scale_thickness` (mm), `surface_temperature` (C)}.
- `method` ∈ {`ultrasonic_thickness`, `visual_gauge`, `thermal_survey`, `eddy_current`, `emat`, `other`}.
- `quality` ∈ {`good`, `fair`, `poor`}. `value` must be > 0 and < 1000.
- Maximum 5,000 rows and 2 MB. Valid rows are accepted and invalid rows are reported with line numbers.
- A `session_code` that does not match the open inspection is rejected.

## 7. Uploads and files

- Accepted: JPEG and PNG only. Content is verified with Pillow, not trusted from the extension or declared type.
- Maximum 10 MB (`MAX_UPLOAD_MB`).
- Stored under UUID keys. User filenames are sanitised and never used as paths. Path traversal is rejected.
- Each file's SHA-256 is recorded with the evidence.

## 8. Security model

- Passwords: PBKDF2-SHA256, 200,000 iterations, 16-byte random salt.
- Tokens: HS256 JWT with expiry (`JWT_EXPIRE_MINUTES`). The secret must come from the environment in any real deployment.
- Roles: admin, inspection_engineer, maintenance_manager, viewer. Permissions are defined in `core/security.py`.
- Every state-changing action writes to `audit_logs`.
- Errors do not expose stack traces. Database errors are logged server-side.

## 9. Reports

The PDF contains: asset and inspection details; components examined with latest minimum, required minimum and index;
measurements for the inspection; evidence fingerprints and findings with their status; historical comparisons with
flagged changes; risk factors and follow-up; maintenance actions; data limitations; and a provenance block with a
blank engineer sign-off. The file's SHA-256 is recorded in the report register.
