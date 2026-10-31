from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import record_audit
from app.core.database import get_db
from app.core.deps import get_current_user, require
from app.models.entities import Boiler, Component, Plant, User
from app.repositories.base import apply_text_search, get_or_404
from app.schemas.schemas import (
    BoilerCreate, BoilerOut, ComponentCreate, ComponentOut, PlantCreate, PlantOut,
)

router = APIRouter(tags=["assets"])


@router.get("/plants", response_model=list[PlantOut])
def list_plants(q: str | None = None, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.scalars(apply_text_search(select(Plant).order_by(Plant.code), [Plant.code, Plant.name, Plant.location], q)).all()


@router.post("/plants", response_model=PlantOut, status_code=201)
def create_plant(body: PlantCreate, db: Session = Depends(get_db), user: User = Depends(require("asset:write"))):
    plant = Plant(**body.model_dump())
    db.add(plant)
    db.flush()
    record_audit(db, user, "create", "plant", plant.id, plant.code)
    db.commit()
    db.refresh(plant)
    return plant


@router.get("/boilers", response_model=list[BoilerOut])
def list_boilers(
    q: str | None = None,
    plant_id: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(Boiler).order_by(Boiler.code)
    if plant_id is not None:
        stmt = stmt.where(Boiler.plant_id == plant_id)
    return db.scalars(apply_text_search(stmt, [Boiler.code, Boiler.name, Boiler.boiler_type], q)).all()


@router.post("/boilers", response_model=BoilerOut, status_code=201)
def create_boiler(body: BoilerCreate, db: Session = Depends(get_db), user: User = Depends(require("asset:write"))):
    get_or_404(db, Plant, body.plant_id, "Plant")
    boiler = Boiler(**body.model_dump())
    db.add(boiler)
    db.flush()
    record_audit(db, user, "create", "boiler", boiler.id, boiler.code)
    db.commit()
    db.refresh(boiler)
    return boiler


@router.get("/boilers/{boiler_id}", response_model=BoilerOut)
def get_boiler(boiler_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return get_or_404(db, Boiler, boiler_id, "Boiler")


@router.get("/components", response_model=list[ComponentOut])
def list_components(
    boiler_id: int | None = None,
    category: str | None = None,
    q: str | None = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(Component).order_by(Component.code)
    if boiler_id is not None:
        stmt = stmt.where(Component.boiler_id == boiler_id)
    if category:
        stmt = stmt.where(Component.category == category)
    return db.scalars(apply_text_search(stmt, [Component.code, Component.name, Component.category], q)).all()


@router.post("/components", response_model=ComponentOut, status_code=201)
def create_component(body: ComponentCreate, db: Session = Depends(get_db), user: User = Depends(require("asset:write"))):
    get_or_404(db, Boiler, body.boiler_id, "Boiler")
    component = Component(**body.model_dump())
    db.add(component)
    db.flush()
    record_audit(db, user, "create", "component", component.id, component.code)
    db.commit()
    db.refresh(component)
    return component


@router.get("/components/{component_id}", response_model=ComponentOut)
def get_component(component_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return get_or_404(db, Component, component_id, "Component")
