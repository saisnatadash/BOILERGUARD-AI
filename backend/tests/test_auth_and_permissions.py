"""Authentication and role-based permission enforcement."""


def test_login_returns_token_and_user(client):
    response = client.post("/api/auth/login", json={"email": "engineer@boilerguard.demo", "password": "Engineer@12345"})
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["role"] == "inspection_engineer"
    assert body["access_token"]


def test_wrong_password_is_rejected(client):
    response = client.post("/api/auth/login", json={"email": "engineer@boilerguard.demo", "password": "wrong-pass"})
    assert response.status_code == 401


def test_protected_routes_require_token(client):
    assert client.get("/api/plants").status_code == 401
    assert client.get("/api/dashboard/summary").status_code == 401


def test_invalid_token_is_rejected(client):
    response = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert response.status_code == 401


def test_viewer_cannot_write_assets(client, viewer_headers):
    response = client.post("/api/plants", headers=viewer_headers,
                           json={"code": "VIEW-1", "name": "Should fail", "location": "Nowhere"})
    assert response.status_code == 403


def test_maintenance_manager_cannot_verify_defects(client, manager_headers):
    response = client.patch("/api/defects/1/verification", headers=manager_headers,
                            json={"action": "verify", "severity": "low"})
    assert response.status_code == 403


def test_only_admin_can_reset_demo_data(client, engineer_headers):
    assert client.post("/api/admin/reset-demo", headers=engineer_headers).status_code == 403


def test_audit_log_is_admin_only(client, viewer_headers, admin_headers):
    assert client.get("/api/admin/audit", headers=viewer_headers).status_code == 403
    assert client.get("/api/admin/audit", headers=admin_headers).status_code == 200


def test_me_endpoint_returns_current_user(client, viewer_headers):
    body = client.get("/api/auth/me", headers=viewer_headers).json()
    assert body["email"] == "viewer@boilerguard.demo"
