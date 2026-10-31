"""Password hashing (PBKDF2 from the standard library), JWT tokens and role permissions."""
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import get_settings

PBKDF2_ITERATIONS = 200_000
JWT_ALGORITHM = "HS256"

# Role -> permissions. "*" grants everything. Every GET endpoint requires only a valid login.
ROLE_PERMISSIONS: dict[str, set[str]] = {
    "admin": {"*"},
    "inspection_engineer": {
        "asset:write", "inspection:write", "evidence:write", "analysis:run",
        "defect:verify", "measurement:write", "risk:review", "plan:write",
        "maintenance:write", "device:write", "report:generate",
    },
    "maintenance_manager": {"plan:write", "maintenance:write", "report:generate"},
    "viewer": set(),
}
ROLES = tuple(ROLE_PERMISSIONS.keys())


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _scheme, salt_hex, digest_hex = stored.split("$")
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), PBKDF2_ITERATIONS)
    return hmac.compare_digest(digest.hex(), digest_hex)


def create_access_token(user_id: int, role: str) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, get_settings().jwt_secret, algorithms=[JWT_ALGORITHM])


def has_permission(role: str, permission: str) -> bool:
    permissions = ROLE_PERMISSIONS.get(role, set())
    return "*" in permissions or permission in permissions
