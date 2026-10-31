"""Small data-access helpers shared by routers. Keeps 404 handling and text search consistent."""
from typing import TypeVar

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

T = TypeVar("T")


def get_or_404(db: Session, model: type[T], obj_id: int, label: str | None = None) -> T:
    obj = db.get(model, obj_id)
    if obj is None:
        raise HTTPException(status_code=404, detail=f"{label or model.__name__} {obj_id} not found")
    return obj


def apply_text_search(stmt, columns, query: str | None):
    """Case-insensitive substring match across the given columns."""
    if not query or not query.strip():
        return stmt
    term = f"%{query.strip().lower()}%"
    return stmt.where(or_(*[func.lower(column).like(term) for column in columns]))
