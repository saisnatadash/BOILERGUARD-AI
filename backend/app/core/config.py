"""Environment-based configuration. Secrets come from environment variables only."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "BOILERGUARD AI"
    environment: str = "development"
    database_url: str = "sqlite:///./data/boilerguard.db"
    # Override JWT_SECRET in every real deployment. The default is for local demos only.
    jwt_secret: str = "demo-only-change-me-to-a-long-random-secret-value-0123456789"
    jwt_expire_minutes: int = 480
    upload_dir: str = "./data/uploads"
    report_dir: str = "./data/reports"
    max_upload_mb: int = 10
    max_csv_rows: int = 5000
    cors_origins: str = "http://localhost:3000"
    seed_demo_on_start: bool = True

    # Demonstration engineering parameters. They are placeholders that must be
    # replaced with plant-specific values approved by a qualified engineer.
    change_flag_mm: float = 0.2
    measurement_uncertainty_mm: float = 0.1
    critical_margin_ratio: float = 1.10
    stale_inspection_days: int = 365

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
