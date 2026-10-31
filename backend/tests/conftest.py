"""Test configuration: an isolated SQLite database and upload directories per test run."""
import os
import pathlib
import tempfile

_TMP = tempfile.mkdtemp(prefix="boilerguard-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP}/test.db"
os.environ["UPLOAD_DIR"] = f"{_TMP}/uploads"
os.environ["REPORT_DIR"] = f"{_TMP}/reports"
os.environ["JWT_SECRET"] = "test-secret-not-for-production-0123456789abcdef"
os.environ["SEED_DEMO_ON_START"] = "true"
os.environ["SAMPLE_DATA_DIR"] = str(pathlib.Path(__file__).resolve().parents[2] / "sample-data")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

DEMO_PASSWORDS = {
    "admin@boilerguard.demo": "Admin@12345",
    "engineer@boilerguard.demo": "Engineer@12345",
    "manager@boilerguard.demo": "Manager@12345",
    "viewer@boilerguard.demo": "Viewer@12345",
}


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


def _headers(client: TestClient, email: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": DEMO_PASSWORDS[email]})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture(scope="session")
def admin_headers(client):
    return _headers(client, "admin@boilerguard.demo")


@pytest.fixture(scope="session")
def engineer_headers(client):
    return _headers(client, "engineer@boilerguard.demo")


@pytest.fixture(scope="session")
def manager_headers(client):
    return _headers(client, "manager@boilerguard.demo")


@pytest.fixture(scope="session")
def viewer_headers(client):
    return _headers(client, "viewer@boilerguard.demo")


@pytest.fixture(scope="session")
def component_ids(client, viewer_headers):
    rows = client.get("/api/components", headers=viewer_headers).json()
    return {row["code"]: row["id"] for row in rows}


@pytest.fixture(scope="session")
def boiler_id(client, viewer_headers):
    return client.get("/api/boilers", headers=viewer_headers).json()[0]["id"]
