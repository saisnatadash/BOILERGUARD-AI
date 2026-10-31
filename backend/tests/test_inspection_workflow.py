"""End-to-end workflow through the real API:
select component -> inspect -> record evidence -> detect abnormality -> verify -> compare history
-> assess risk -> plan -> generate PDF report -> export CSV -> reset demo data.
"""
import io

from PIL import Image

from app.ai.sample_images import render_sample_surface


def _png(rust_patches: int, cracks: int, seed: int = 7) -> bytes:
    return render_sample_surface("TEST SAMPLE", seed=seed, rust_patches=rust_patches, cracks=cracks)


def test_end_to_end_inspection_workflow(client, engineer_headers, viewer_headers, manager_headers,
                                        admin_headers, component_ids, boiler_id):
    # FURN-ROOF-01 is used here so the workflow does not alter the ECO-TUBE-024 history other tests assert on.
    eco = component_ids["FURN-ROOF-01"]

    # 1. Create a new inspection record for the boiler.
    created = client.post("/api/inspections", headers=engineer_headers, json={
        "boiler_id": boiler_id, "inspection_date": "2026-10-30", "inspection_type": "follow_up",
        "method": "Visual and ultrasonic (SIMULATED), photographic",
        "conditions": {"cooling_hours": "50", "note": "test"}, "observations": "Workflow test inspection.",
    })
    assert created.status_code == 201, created.text
    session_id = created.json()["id"]
    assert created.json()["code"].startswith("INS-2026-")

    # 2. Upload evidence linked to a component; invalid files are refused.
    bad = client.post(f"/api/inspections/{session_id}/evidence", headers=engineer_headers,
                      files={"file": ("notes.txt", b"not an image", "text/plain")})
    assert bad.status_code == 422
    upload = client.post(f"/api/inspections/{session_id}/evidence", headers=engineer_headers,
                         files={"file": ("eco24.png", _png(rust_patches=4, cracks=1), "image/png")},
                         data={"component_id": str(eco), "caption": "Workflow test photograph"})
    assert upload.status_code == 201, upload.text
    evidence = upload.json()
    assert len(evidence["sha256"]) == 64 and evidence["is_demo"] is False
    served = client.get(f"/api/evidence/{evidence['id']}/file", headers=viewer_headers)
    assert served.status_code == 200 and served.content[:4] == b"\x89PNG"

    # 3. Run the demonstration defect analysis; findings are suspected until verified.
    run = client.post(f"/api/evidence/{evidence['id']}/analysis", headers=engineer_headers)
    assert run.status_code == 201, run.text
    assert run.json()["is_demonstration"] is True
    defects = client.get(f"/api/inspections/{session_id}/defects", headers=viewer_headers).json()
    assert len(defects) >= 1
    assert all(d["status"] == "ai_suspected" for d in defects)
    annotated = client.get(f"/api/analysis-runs/{run.json()['id']}/annotated", headers=viewer_headers)
    assert annotated.status_code == 200
    Image.open(io.BytesIO(annotated.content)).verify()

    # 4. Record a manual measurement; comparable with the 2025 seeded reading at the same location.
    measured = client.post(f"/api/inspections/{session_id}/measurements", headers=engineer_headers, json={
        "component_id": eco, "parameter": "wall_thickness", "value": 5.7, "method": "ultrasonic_thickness",
        "location_key": "FURN01-ROOF-A", "location_label": "Roof tube panel 01 section A",
        "instrument": "Test gauge", "quality": "good",
    })
    assert measured.status_code == 201, measured.text
    assert measured.json()["unit"] == "mm"

    # Measurement against a closed session is refused; mismatched component is refused.
    wrong = client.post(f"/api/inspections/{session_id}/measurements", headers=engineer_headers, json={
        "component_id": component_ids["SH-PLATEN-03"] + 999, "parameter": "wall_thickness", "value": 5.0,
        "method": "ultrasonic_thickness", "location_key": "X-1", "quality": "good",
    })
    assert wrong.status_code == 404

    # 5. Verification workflow: severity required to verify, note required to reject.
    first, *rest = client.get(f"/api/inspections/{session_id}/defects", headers=viewer_headers).json()
    no_sev = client.patch(f"/api/defects/{first['id']}/verification", headers=engineer_headers, json={"action": "verify"})
    assert no_sev.status_code == 422
    verified = client.patch(f"/api/defects/{first['id']}/verification", headers=engineer_headers,
                            json={"action": "verify", "severity": "moderate", "note": "Confirmed on review"})
    assert verified.status_code == 200 and verified.json()["status"] == "engineer_verified"
    no_note = client.patch(f"/api/defects/{first['id']}/verification", headers=engineer_headers,
                           json={"action": "reject"})
    assert no_note.status_code == 422
    for d in rest:
        resp = client.patch(f"/api/defects/{d['id']}/verification", headers=engineer_headers,
                            json={"action": "reject", "note": "Not confirmed in review"})
        assert resp.status_code == 200

    # 6. A session with unresolved suspected findings cannot close; once resolved it can.
    close_ok = client.patch(f"/api/inspections/{session_id}", headers=engineer_headers, json={"status": "closed"})
    assert close_ok.status_code == 200
    blocked = client.post(f"/api/inspections/{session_id}/measurements", headers=engineer_headers, json={
        "component_id": eco, "parameter": "wall_thickness", "value": 5.7, "method": "ultrasonic_thickness",
        "location_key": "FURN01-ROOF-A", "quality": "good",
    })
    assert blocked.status_code == 409

    # 7. Boiler Memory: the new reading is compared with the 2025 seeded reading (6.0 mm) at the same location.
    memory = client.get(f"/api/components/{eco}/memory", headers=viewer_headers).json()
    latest = [c for c in memory["comparisons"] if c["current_session_id"] == session_id]
    assert latest and latest[0]["comparable"] is True
    assert latest[0]["previous_value"] == 6.0
    assert latest[0]["loss_mm"] == 0.3
    assert latest[0]["flagged"] is True

    # 8. Explainable risk and digital twin reflect the record.
    risk = client.get(f"/api/components/{eco}/risk", headers=viewer_headers).json()
    assert risk["category"] in ("High Priority", "Critical Review")
    twin = client.get(f"/api/boilers/{boiler_id}/twin", headers=viewer_headers).json()
    assert twin["is_conceptual_model"] is True
    assert any(c["code"] == "ECO-TUBE-024" for c in twin["components"])

    # 9. Engineering review of the computed category is recorded with a note.
    reviewed = client.post(f"/api/components/{eco}/risk-reviews", headers=engineer_headers,
                           json={"confirmed_category": "High Priority", "note": "Reviewed flagged wall loss."})
    assert reviewed.status_code == 201 and reviewed.json()["confirmed_category"] == "High Priority"

    # 10. Planner: statutory items cannot be removed; other items can.
    plans = client.get(f"/api/plans?boiler_id={boiler_id}", headers=viewer_headers).json()
    plan = client.get(f"/api/plans/{plans[0]['id']}", headers=viewer_headers).json()
    statutory = [i for i in plan["items"] if i["statutory"]]
    assert statutory, "seeded plan should contain a statutory item"
    assert client.delete(f"/api/plan-items/{statutory[0]['id']}", headers=manager_headers).status_code == 409
    routine = [i for i in plan["items"] if not i["statutory"]][0]
    assert client.delete(f"/api/plan-items/{routine['id']}", headers=manager_headers).status_code == 204
    assert {s["method_class"] for s in plan["schedule"]} == {
        "remote_robotic_candidate", "shutdown_required", "specialist_required"}

    # 11. Generate a PDF engineering report and download it.
    report = client.post("/api/reports", headers=engineer_headers, json={"session_id": session_id})
    assert report.status_code == 201, report.text
    pdf = client.get(f"/api/reports/{report.json()['id']}/download", headers=viewer_headers)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")

    # 12. CSV export and search/filter.
    csv_text = client.get(f"/api/export/measurements.csv?boiler_id={boiler_id}", headers=viewer_headers).text
    assert csv_text.splitlines()[0].startswith("measurement_id,session_code")
    found = client.get("/api/components?q=eco-tube", headers=viewer_headers).json()
    assert {c["code"] for c in found} == {"ECO-TUBE-024", "ECO-TUBE-025"}
    open_only = client.get("/api/inspections?status=open", headers=viewer_headers).json()
    assert all(s["status"] == "open" for s in open_only)

    # 13. Viewers cannot generate reports; the audit trail records the actions.
    assert client.post("/api/reports", headers=viewer_headers, json={"session_id": session_id}).status_code == 403
    actions = [a["action"] for a in client.get("/api/admin/audit", headers=admin_headers).json()]
    assert "verify" in actions and "analysis.run" in actions and "report.generate" in actions


def test_csv_import_accepts_valid_rows_and_reports_bad_ones(client, engineer_headers, boiler_id):
    session = client.post("/api/inspections", headers=engineer_headers, json={
        "boiler_id": boiler_id, "inspection_date": "2026-10-29", "inspection_type": "online",
        "method": "CSV import test",
    }).json()
    csv_body = (
        "component_code,parameter,value,unit,method,location_key,quality,session_code\n"
        f"ECO-TUBE-025,wall_thickness,5.7,mm,ultrasonic_thickness,ECO25-SEC-A-1.2M,good,{session['code']}\n"
        "ECO-TUBE-025,wall_thickness,oops,mm,ultrasonic_thickness,ECO25-SEC-A-1.2M,good,\n"
        f"ECO-TUBE-025,wall_thickness,5.7,mm,ultrasonic_thickness,ECO25-SEC-A-1.2M,good,INS-1999-0001\n"
    )
    response = client.post(f"/api/inspections/{session['id']}/measurements/import", headers=engineer_headers,
                           files={"file": ("readings.csv", csv_body.encode(), "text/csv")})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["accepted"] == 1
    assert body["rejected"] == 2
    assert {e["line"] for e in body["errors"]} == {3, 4}


