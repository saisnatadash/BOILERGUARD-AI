# Sample data (SIMULATED)

Everything in this folder is **synthetic demonstration data**. It describes a conceptual plant, boiler and components.
It does not describe any real facility, and no value is a plant measurement. Every record loaded from here is stored
with `is_demo = true`, and the UI and exports label it as simulated.

| Folder | Contents |
|---|---|
| `boilers/` | `plants.json`: one conceptual plant and one conceptual boiler (BLR-01) |
| `components/` | `components.csv`: ten components with nominal and demonstration minimum thicknesses |
| `inspections/` | `sessions.json`: three annual inspection cycles (2024, 2025, 2026); `plan.json`: a planning draft |
| `measurements/` | `measurements.csv`: wall-thickness readings by session and location, including one poor-quality reading |
| `images/` | `manifest.json` and five generated images labelled SIMULATED. Regenerate with `scripts/generate_sample_images.py` |
| `devices/` | `devices.json`: a simulated ultrasonic gauge, a robotic crawler registry entry and a thermal-camera placeholder |

## What the dataset is designed to show

- **ECO-TUBE-024 (economiser):** 5.8 → 5.6 → 5.3 mm at the same location. Two flagged wall-loss steps, of which the latest drives the risk category.
- **SH-PLATEN-03 (superheater):** latest 4.45 mm, below the demonstration minimum of 4.5 mm. Critical Review.
- **WW-PANEL-07 (water wall):** one poor-quality reading that is excluded from comparisons and listed as a limitation.
- **DRUM-01 (steam drum):** a flagged 0.2 mm change and a statutory plan item that cannot be deleted.
- **HDR-MS-01 (main steam header):** a single reading, so no trend is possible. The memory engine says so.
- **Analysis outputs:** generated from the images above by the demonstration analyzer. Findings start as AI-suspected, and one 2024 finding is marked verified to show the workflow.

Reset the dataset at any time from *Settings → Reset demonstration data*, or with `scripts/reset_demo.sh`.
