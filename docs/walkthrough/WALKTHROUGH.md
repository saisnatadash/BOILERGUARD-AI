# BOILERGUARD AI: page-by-page walkthrough and video script

Use this as the shot list and talk track for a screen-recorded demo of the working prototype. It follows the
sidebar from top to bottom, then runs the central workflow end to end. Target length: about 12 minutes.

> Say "demonstration" or "simulated" whenever you quote a number. The data are labelled sample data, and the
> analysis is a demonstration heuristic. Do not present any figure as a plant measurement or a validated prediction.

---

## 0. Before you record (5 minutes of setup)

1. Start the stack (Docker: `docker compose up --build`, or the two local commands in the README).
2. Open <http://localhost:3000>. Reset the demonstration data so the numbers below match:
   sign in as `admin@boilerguard.demo` / `Admin@12345`, open **Settings, Users & Audit**, and choose
   **Reset demonstration data…**, then **Confirm reset**.
3. Sign out. Keep these tabs ready: the app, and the API docs at <http://localhost:8000/docs> (optional, for the last shot).
4. Have a photo ready to upload if you want to show your own file. Otherwise use
   `sample-data/images/SIM-ECO-TUBE-024_INS-2026-0044.png`.
5. Use a 1440×900 window, a clean browser profile, and the sidebar expanded.

### Numbers you will see after a fresh reset

| Where | What appears |
|---|---|
| Command Centre tiles | 1 boiler, 10 components mapped, 3 inspection records, 5 evidence items, 13 defects detected, 12 pending verification, 4 high-priority flags, 3 devices |
| Priority watchlist | SH-PLATEN-03 **Critical Review** (4.45 mm latest, 4.50 mm demonstration minimum); ECO-TUBE-024 **High Priority** (5.30 mm latest); DRUM-01 and RH-COIL-02 **High Priority**; WW-PANEL-07 and FURN-ROOF-01 **Moderate Priority** |
| ECO-TUBE-024 history (location A) | 5.8 mm (2024) → 5.6 mm (2025) → 5.3 mm (2026); the 2026 step is flagged |
| WW-PANEL-07 | one poor-quality reading (5.1 mm) excluded from comparisons and listed as a limitation |
| Planner | 5 open items; DRUM-01 is a statutory item and cannot be removed |

---

## 1. Opening (30 seconds)

**On screen:** the login page.

**Show:** the BOILERGUARD AI logo in its white panel, the tagline, and the four demonstration accounts.

**Say:** "BOILERGUARD AI is an inspection-intelligence prototype for thermal power plant boilers. It keeps a
component-level memory of each boiler, compares new evidence with comparable earlier readings, and explains its
priorities. Everything you will see is labelled simulated sample data. It is decision support, not certification."

**Action:** click **Inspection Engineer** in the demonstration accounts list. The email and password fill in. Click **Sign in**.

---

## 2. Command Centre (1 minute)

**Sidebar:** *Command Centre*. **Page title:** "Industrial asset overview".

**Show:**

- The six tiles: Boilers, Components mapped, Inspection records, Defects detected, Pending verification (amber), High-priority flags (red).
- **Boiler condition distribution**: a bar chart by risk category, with the colour key matching the schematic.
- **Inspection completion**: open and submitted counts, and the planner and device status line.
- **Priority watchlist**: point at the SH-PLATEN-03 row. Click the component code to jump to its Boiler Memory view later.
- **System activity** and the **Inspection intelligence feed**: these fill with every action you take, so keep an eye on them.

**Say:** "Every figure is computed from the database. The categories come from explainable rules, not from a
single score. The feed is the audit trail, so anything you do in the next ten minutes appears here."

---

## 3. Digital Twin (1 minute)

**Sidebar:** *Digital Twin*. **Page title:** "Interactive boiler digital twin".

**Show:** the conceptual schematic and its caption, "CONCEPTUAL SAMPLE MODEL · NOT TO SCALE". Hover and click the
**Superheater** region (SH-PLATEN-03).

**Result on the right:** the component engineering panel shows Critical Review, index 100 (indicative), nominal 5.50 mm,
demonstration minimum 4.50 mm, latest minimum 4.45 mm, a thickness trend with a red minimum line, and the recommended next action.

**Action:** click **Risk factors**, then come back with the browser's back button and click **Boiler memory**
(or go to the next section directly).

**Say:** "This is a conceptual model, not a drawing of a real plant. Each region is a live view of the component
record. Selecting a region opens its engineering panel, and every number on it has a source behind it."

---

## 4. Plants & Component Registry (45 seconds)

**Sidebar:** *Plants & Component Registry*. **Tabs:** Component registry, Boilers, Plants.

**Show:** the component table with codes, categories, diagram regions, nominal and minimum thickness. Type
`eco` in the search box to filter to ECO-TUBE-024 and ECO-TUBE-025. Open the **Boilers** tab.

**Say:** "This is the asset registry. Each component has a stable code and its design thresholds. The thresholds
here are demonstration values, and the product requires plant-approved values."

**Optional:** sign in as the viewer account for this shot to show the form replaced by "Your role can view the registry but cannot add components."

---

## 5. Inspection Workspace: the central workflow (4 minutes)

**Sidebar:** *Inspection Workspace*.

**Show:** the inspection history table with its search box and status filter.

**Action A, create a record:** in **New inspection**, choose a boiler (BLR-01), keep the date, and click
**Create inspection**. The workspace opens on a new record code, `INS-YYYY-NNNN`.

**Say:** "Every inspection is a traceable session. Nothing is recorded against a boiler without a session."

**Action B, Overview tab:** show the record fields and conditions. Type a line in **Engineering observations** and click
**Save observations**.

**Action C, Evidence tab:** in **Upload inspection photograph**, choose the sample image, pick **ECO-TUBE-025 · Economiser tube row 25**
in the component dropdown, and click **Upload evidence**. The card appears with a preview, an SHA-256 fingerprint, and
its dimensions.

**Say:** "The photograph is stored with a fingerprint and linked to a specific component. We are not calling it a live
camera feed. It is evidence that will be compared over time."

**Action D, Measurements tab:** in **Enter a measurement**, choose ECO-TUBE-025, enter `5.7` for wall thickness, location key
`ECO25-SEC-A-1.2M`, and click **Save measurement**. Scroll the table to show the new row. Mention that **Import structured CSV**
accepts a file and reports line-by-line errors.

**Say:** "This reading is compared only with earlier readings at the same location, by the same method and unit, with acceptable quality.
We will see the comparison in the memory engine."

**Action E, Findings tab:** the list shows AI-suspected findings with the heuristic confidence. Explain the
status legend in the blue banner. Type a reason in the review-note box and show the **Reject** button enabling.
Choose a severity, then click **Verify** on one finding.

**Say:** "A detected region is a suspicion until an engineer decides. Verify needs a severity. Reject needs a written reason.
Every decision is logged."

**Action F, report:** back on the Overview tab, click **Generate PDF report**. The PDF downloads.

**Say:** "This report cites record IDs, evidence fingerprints, findings and their status, the limitations, and a blank
sign-off block for the engineer. It is a demonstration report, not a certificate."

**Optional, close the record:** click **Close inspection**. It stays blocked while any finding is still AI-suspected.
Point that out and explain the rule.

---

## 6. AI Defect Intelligence (1 minute)

**Sidebar:** *AI Defect Intelligence*.

**Show:** the five-step strip (upload, link, analysis, suspected regions, engineer decision). Select the inspection you just
used, then select its evidence. Click **Run demonstration analysis** if no run exists yet.

**Show:** the original and annotated images side by side, with the analyzer name and version (`heuristic-colour-shape-demo 0.2.0`).
Then the suspected regions, each with its confidence and area.

**Read aloud:** the bottom panel, "What this analyzer can and cannot do." Say that the analyzer is replaceable and that a
validated model would need its own labelled dataset and evaluation.

**Say:** "The analyzer is a transparent demonstration. It finds rust-coloured regions and elongated dark streaks. It cannot see
inside a tube, measure wall thickness, or certify a crack. The architecture is ready for a real model, and the
validation plan in the docs describes what that would need."

---

## 7. Robotics & Sensors (1 minute)

**Sidebar:** *Robotics & Sensors*.

**Show:** the four tiles, the device registry (SIM-UT-01, SIM-CRAWL-01, SIM-THERM-01), and the status words.

**Action:** under **Simulated ingestion**, choose device **SIM-UT-01** and an open inspection, then click
**Generate simulated batch**. The batch table gains a row with an accepted count and a quality score, labelled SIMULATED.

**Say:** "There is no real robot or gauge connected here. The ultrasonic device is a simulator that writes labelled readings
through the same data path a real adapter would use. The crawler and thermal camera are registry entries and placeholders, and the
page says so."

---

## 8. Boiler Memory Engine: the centre of the product (2 minutes)

**Sidebar:** *Boiler Memory Engine*. Select **ECO-TUBE-024 · Economiser tube row 24** in the component dropdown (or arrive from the
watchlist link).

**Show, in this order:**

1. **Four tiles**: inspections on record (3), comparable pairs, latest minimum, flagged changes (1).
2. **Measurement history**: the location A line falls from 5.8 to 5.3 mm across three inspections; location B is flat. Mention the legend.
3. **Flagged for engineering review**: "Wall loss of 0.30 mm since the previous comparable reading exceeds the review threshold."
4. **Limitations and data quality**: read the last line aloud, "No deterioration rate or failure date is extrapolated by this prototype."
5. **Inspection timeline**: three cards, each with its readings and any new abnormality.
6. **Historical comparison** table: each pair with its loss and result, and "Not comparable" with reasons where they apply.
7. **Defect progression by category**.

**Say:** "This is the memory. Each new reading is attached to its component and compared only with readings it can fairly be
compared with. The engine reports the observed change and says what it does not know. It will not invent a rate or a failure date."

**Optional:** switch to **WW-PANEL-07**. Point at the poor-quality reading, which is excluded from the comparisons and listed as a limitation.

---

## 9. Risk Intelligence (1 minute)

**Sidebar:** *Risk Intelligence*. Use the category chips, for example **High Priority**.

**Action:** click the **ECO-TUBE-024** row to expand it.

**Show:** each contributing factor with its points, its detail, and its evidence chips (for example "measurement #…" and
"defect #…"). Then the recommended follow-up and the data limitations.

**Action (engineer account):** under **Engineering review**, leave the confirmed category as computed, type a short reason, and click
**Record review**. The row now shows "Engineer: High Priority".

**Say:** "Every category is explained by rules, and every rule points at records. The index only orders the review queue.
It is not a probability of failure. An engineer can confirm or override the category, and the reason is kept."

---

## 10. Inspection Planner & Maintenance (1 minute)

**Sidebar:** *Planner & Maintenance*. Sign in as the **Maintenance Manager** account for this scene if you want to show role limits.

**Show:** the three columns in **Proposed schedule by method**: remote or robotic candidates, requires shutdown, and specialist
examination. Point at the statutory tag on DRUM-01 and its reference line.

**Action:** in **Plan items**, try **Remove** on the statutory row. It is disabled, with the tooltip "Statutory items cannot be removed."
Click **Mark done** on a routine item. Add a maintenance action in the lower section if time allows.

**Say:** "The planner groups work by the method each item needs, so the shutdown work and the specialist work are visible.
Statutory items stay in the plan. The schedule is a proposal and depends on engineering validation and the plant's access windows."

---

## 11. Engineering Reports (45 seconds)

**Sidebar:** *Engineering Reports*.

**Show:** the report generator, the CSV export buttons, and the report register.

**Action:** pick the inspection you created earlier, click **Generate and download PDF**, and open the file.

**In the PDF, point at:** the demonstration banner, the asset table, the components examined with their categories,
the findings table with status, the risk factors with their evidence, the data limitations, and the provenance block.

**Say:** "Every line in this report can be traced to a record. It carries the limitations with it, and the sign-off block is
left for a qualified engineer."

---

## 12. Settings, Users & Audit (45 seconds)

**Sidebar:** *Settings, Users & Audit*. Sign in as the **Administrator** account for this scene.

**Show:** the signed-in account and its permissions, the users and roles table (change a role in the dropdown only if you want to demonstrate it),
and the **Audit trail**. Type `verify` in the audit filter to find the decisions you made earlier, with user, role, time and detail.

**Say:** "Roles are enforced on the server, not just hidden in the interface. Every change is recorded with who made it."

**Optional:** sign in as the **Viewer** account and show that inspection, measurement and report actions are unavailable, with a clear message.

---

## 13. Closing (30 seconds)

**On screen:** the Command Centre again. Point at the updated feed and the activity panel.

**Say:** "What you saw is a working end-to-end prototype: a boiler memory, explainable risk, human verification, planning and
traceable reports. What it does not yet show is validation on real plant data, real robots, or a trained defect model. Those
are the next steps, and the validation plan in the repository lists what each one needs."

---

## Appendix A: quick sequence for a 60-second teaser

1. Login page, logo, click **Inspection Engineer** and **Sign in**.
2. Command Centre, pause on the watchlist.
3. Digital Twin, click the superheater region.
4. Boiler Memory, ECO-TUBE-024 trend and the flagged change.
5. Risk Intelligence, expand ECO-TUBE-024 and point at its evidence chips.
6. Generate a PDF from an inspection and show the first page.

## Appendix B: accounts used in the video

| Scene | Account |
|---|---|
| Most scenes | Inspection Engineer (`engineer@boilerguard.demo`) |
| Planner role limits (optional) | Maintenance Manager (`manager@boilerguard.demo`) |
| Settings and audit | Administrator (`admin@boilerguard.demo`) |
| Read-only demonstration (optional) | Viewer (`viewer@boilerguard.demo`) |

## Appendix C: things that can go wrong on camera

- **Numbers differ from the table above.** You ran actions earlier in the session. Reset the demonstration data before you record.
- **The Command Centre shows a spinner.** Wait a second and refresh. The first request after start-up can take a moment.
- **The sample image does not appear.** Check that you selected a JPEG or PNG and not another file type.
- **The PDF did not download.** Some browsers ask for permission. Allow the download and click the button again.
- **A button looks disabled.** Your role does not have that permission. Switch accounts instead of forcing the action.
