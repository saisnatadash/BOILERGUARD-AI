# Validation plan and current evidence

BOILERGUARD AI makes claims about traceability, comparability and explainability. Validation has two parts: what the
prototype demonstrates now, and what must be shown before any plant use.

## 1. Verified in this prototype

These are checked by the automated test suite (`backend/tests`, 29 tests) and the browser test (`tests/e2e/workflow.mjs`).

| Claim | How it is checked |
|---|---|
| Only comparable readings are compared | Unit tests on method, unit, location and quality mismatches; poor-quality exclusion through the API |
| Observed wall loss is flagged at the thresholds | Unit tests at 0.5 mm (flagged), 0.1 mm (not flagged, within uncertainty) and non-comparable pairs |
| Demonstration history reproduces the problem-statement values | Seeded ECO-TUBE-024 history 5.8 → 5.6 → 5.3 mm returns the expected series and flagged change |
| Risk categories follow the rules | Critical (SH-PLATEN-03 at 4.45 mm), High (flagged change), Insufficient Evidence (new empty component) |
| Every factor cites evidence | Test asserts that every risk factor has at least one evidence reference |
| Statutory items cannot be removed | API test refuses deletion with HTTP 409 |
| Closing is blocked while findings are unresolved | Workflow test expects 409, then 200 after resolution |
| Roles are enforced on the server | Permission tests for viewer, maintenance manager and engineer; admin-only endpoints |
| Uploads are validated by content | Text file uploaded with an image extension is rejected |
| CSV import reports row-level errors | Unit and API tests with unknown components, bad units, bad values and mismatched sessions |
| Reports download and contain the record | PDF download test checks the `%PDF` signature; the content is checked by manual review |
| The workflow works in a browser | Browser run: create inspection, upload, analyse, verify, download PDF; zero console errors |

## 2. Not yet validated (required before plant use)

| Area | Required evidence | Who |
|---|---|---|
| Thresholds and categories | Engineering review against the applicable design basis and statutory requirements for each plant and boiler | Qualified engineer, owner's team |
| Comparability rules | Confirmation that the method and location keys match how the plant records measurements | Inspection lead |
| Defect detection accuracy | Labelled image set from real inspections; precision and recall per category; agreement with expert classification | Data science with inspection experts |
| Component localisation | Mapping accuracy between photographs and component IDs | Inspection team |
| Measurement traceability | Instrument calibration records linked to each reading | Plant quality |
| Agreement with expert judgement | Blind comparison of system categories with expert categories on historical cases | Independent reviewer |
| Workflow savings | Measured time from shutdown to report, compared with the current process | Plant maintenance |
| Robotic and thermal integration | Field trial with the chosen hardware, with its own safety case | Robotics team, plant safety |

## 3. Metrics the project will report

- Defect-detection precision and recall on labelled test data, by category.
- Component-localisation accuracy (share of evidence linked to the correct component).
- Share of measurement pairs that are comparable, and the reasons for those that are not.
- Share of flagged changes confirmed by engineers on review.
- Agreement between system categories and expert categories (Cohen's kappa).
- Report generation time, and the time from inspection data entry to a review-ready report.
- Estimated inspection-workflow saving, reported as a range with assumptions stated.

## 4. Known limitations to carry into any validation

- The bundled analyzer is a colour-and-shape demonstration. Its results must not be quoted as accuracy figures.
- Sample data are synthetic. Results on them show that the software works, not that the rules are correct for any plant.
- Confidence values are heuristic scores and are not calibrated probabilities.
- The priority index orders review work. It is not a failure probability and it is not validated as one.
