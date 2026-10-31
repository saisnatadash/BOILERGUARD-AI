"""Runs last (file name sorts last) because a reset renumbers every demonstration record."""


def test_admin_reset_restores_demonstration_dataset(client, admin_headers, viewer_headers):
    response = client.post("/api/admin/reset-demo", headers=admin_headers)
    assert response.status_code == 200, response.text
    assert response.json()["loaded"]["components"] == 10
    assert len(client.get("/api/plants", headers=viewer_headers).json()) == 1
    eco = client.get("/api/components?q=ECO-TUBE-024", headers=viewer_headers).json()[0]["id"]
    memory = client.get(f"/api/components/{eco}/memory", headers=viewer_headers).json()
    assert memory["record_counts"]["inspections"] == 3
    assert [p["value"] for s in memory["thickness_series"] if s["location_key"] == "ECO24-SEC-A-1.2M"
            for p in s["points"]] == [5.8, 5.6, 5.3]
