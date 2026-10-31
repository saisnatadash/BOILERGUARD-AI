"""Audit trail helper. Every state-changing action is recorded with user, role and entity."""
from sqlalchemy.orm import Session

from app.core.clock import utcnow
from app.models.entities import AuditLog, User


def record_audit(
    db: Session,
    user: User | None,
    action: str,
    entity: str,
    entity_id: int | str | None = None,
    detail: str = "",
) -> None:
    db.add(
        AuditLog(
            at=utcnow(),
            user_email=user.email if user else "system",
            user_role=user.role if user else "system",
            action=action,
            entity=entity,
            entity_id=str(entity_id) if entity_id is not None else None,
            detail=detail[:1000],
        )
    )
