"""Administration: users and roles, audit trail, and the demonstration-data reset."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import record_audit
from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import get_current_user, require
from app.core.security import hash_password
from app.models.entities import AuditLog, User
from app.repositories.base import apply_text_search, get_or_404
from app.schemas.schemas import AuditOut, UserCreate, UserOut, UserUpdate
from app.services.sample_data import reset_demo

router = APIRouter(prefix="/admin", tags=["administration"])


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(require("*"))):
    return db.scalars(select(User).order_by(User.email)).all()


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db), actor: User = Depends(require("*"))):
    email = body.email.lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(status_code=409, detail="A user with this email already exists")
    user = User(email=email, full_name=body.full_name, role=body.role, password_hash=hash_password(body.password))
    db.add(user)
    db.flush()
    record_audit(db, actor, "create", "user", user.id, f"{email} as {body.role}")
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, db: Session = Depends(get_db), actor: User = Depends(require("*"))):
    user = get_or_404(db, User, user_id, "User")
    if user.id == actor.id and (body.is_active is False or (body.role and body.role != "admin")):
        raise HTTPException(status_code=409, detail="You cannot remove your own administrator access")
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.full_name is not None:
        user.full_name = body.full_name
    record_audit(db, actor, "update", "user", user.id, f"role={user.role} active={user.is_active}")
    db.commit()
    db.refresh(user)
    return user


@router.get("/audit", response_model=list[AuditOut])
def audit_log(
    q: str | None = None,
    entity: str | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
    _: User = Depends(require("*")),
):
    stmt = select(AuditLog).order_by(AuditLog.id.desc()).limit(limit)
    if entity:
        stmt = stmt.where(AuditLog.entity == entity)
    return db.scalars(apply_text_search(stmt, [AuditLog.action, AuditLog.detail, AuditLog.user_email], q)).all()


@router.post("/reset-demo")
def reset_demo_data(db: Session = Depends(get_db), actor: User = Depends(require("*"))):
    """Erase inspection, asset and analysis data, then reload the labelled demonstration dataset."""
    summary = reset_demo(db, get_settings(), actor)
    return {"status": "reset", "loaded": summary}


@router.get("/me/permissions")
def my_permissions(user: User = Depends(get_current_user)):
    from app.core.security import ROLE_PERMISSIONS

    return {"role": user.role, "permissions": sorted(ROLE_PERMISSIONS.get(user.role, set()))}
