from fastapi import APIRouter

from app.api import routes_admin, routes_assets, routes_auth, routes_inspections, routes_intelligence, routes_operations

api_router = APIRouter()
for module in (routes_auth, routes_assets, routes_inspections, routes_intelligence, routes_operations, routes_admin):
    api_router.include_router(module.router)
