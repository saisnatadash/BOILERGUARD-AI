"""BOILERGUARD AI API entry point."""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.api.router import api_router
from app.core.config import get_settings
from app.core.database import Base, SessionLocal, engine
from app.models import entities  # noqa: F401  (register ORM models)
from app.services.sample_data import seed_if_empty

logger = logging.getLogger("boilerguard")
settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.database_url.startswith("sqlite"):
        Path("./data").mkdir(parents=True, exist_ok=True)
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    Path(settings.report_dir).mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_if_empty(db, settings)
    yield


app = FastAPI(
    title="BOILERGUARD AI API",
    version="1.0.0",
    description="Intelligent boiler inspection and predictive integrity platform. Demonstration prototype: "
                "simulated and sample data are labelled; outputs are decision support, not safety certification.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, exc: RequestValidationError):
    details = [
        {"field": ".".join(str(p) for p in err.get("loc", []) if p not in ("body", "query")), "message": err.get("msg")}
        for err in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": "Validation failed", "errors": details})


@app.exception_handler(IntegrityError)
async def integrity_error(_request: Request, exc: IntegrityError):
    logger.info("Integrity error: %s", exc.orig)
    return JSONResponse(status_code=409, content={"detail": "The change conflicts with existing records (duplicate or missing reference)"})


@app.exception_handler(SQLAlchemyError)
async def database_error(_request: Request, exc: SQLAlchemyError):
    logger.exception("Database error: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "A database error occurred. The change was not saved."})


@app.get("/api/health", tags=["system"])
def health():
    return {"status": "ok", "app": settings.app_name, "environment": settings.environment, "demo_data": True}


app.include_router(api_router, prefix="/api")
