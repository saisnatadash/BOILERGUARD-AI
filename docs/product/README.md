# Product alignment: OSFIC PS-156

**Problem statement.** Annual boiler inspection in thermal power plants needs 24–48 hours of cooling and around 72
hours of scaffolding before manual inspection can begin. That prolongs outages and exposes workers to confined-space,
height and residual-heat hazards. How can boilers be inspected faster and more safely, with precise, comparable defect records?

## How the prototype responds

| Need in the problem statement | Response in BOILERGUARD AI |
|---|---|
| Less time lost before inspection can start | Planner groups work by method. Items suited to remote or robotic methods are separated from items that need shutdown or specialist access. The proposal is subject to engineering validation. The product does not assume that any inspection can run during operation. |
| Fewer people exposed to confined-space and height work | Remote and robotic candidates are identified per component. Access constraints are recorded so that scaffolding and confined-space entry are planned, not assumed. |
| Precise defect records | Each finding has a component, location, category, status, severity, confidence label and evidence fingerprint. |
| Comparable records across inspections | Boiler Memory Engine compares only readings that share method, location, unit and quality. Each record keeps its source. |
| Evidence that others can check | Reports cite record IDs, evidence hashes, the reviewer and the limitations. Exports carry a data label. |
| Human judgement stays in the loop | AI output is *suspected* until an engineer verifies or rejects it. Risk categories can be overridden with a recorded reason. |
| Statutory obligations are respected | Statutory items cannot be removed from a plan. Reports state that they are not certificates. |

## What the product does not claim

- It does not replace the statutory inspection or the certification by the competent authority or qualified person.
- It does not estimate remaining life, failure dates or deterioration rates.
- It does not detect internal defects from photographs.
- It does not connect to real robots, cameras or gauges in this prototype.

## Path from prototype to pilot

1. Replace demonstration thresholds with values for one pilot boiler, approved by the plant's qualified engineer.
2. Load the plant's historical inspection records through the CSV import, and check comparability on real data.
3. Train and evaluate a defect model on labelled images from the pilot, and report its metrics.
4. Integrate one instrument, using the device adapter interface, and capture its calibration data.
5. Run a parallel trial alongside the current inspection process, and measure the time from shutdown to report.
