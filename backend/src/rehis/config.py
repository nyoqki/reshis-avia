from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="REHIS_")

    forecast_path: Path = REPO_ROOT / "data" / "seasonal_forecast.csv"
    routes_path: Path = REPO_ROOT / "data" / "routes.csv"
    db_path: Path = REPO_ROOT / "var" / "rehis.sqlite3"
    static_dir: Path | None = None
    cookie_secure: bool = True
    session_ttl_hours: int = 168
    allowed_hosts: Annotated[list[str], NoDecode] = ["localhost", "127.0.0.1"]
    allowed_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]
    trusted_proxies: Annotated[list[str], NoDecode] = ["127.0.0.1"]
    demo_username: str | None = None
    demo_password: SecretStr | None = None
    registration_open: bool = True
    max_users: int = Field(default=1000, ge=0)

    @field_validator("allowed_hosts", "allowed_origins", "trusted_proxies", mode="before")
    @classmethod
    def _split_comma_separated(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("static_dir", mode="before")
    @classmethod
    def _empty_static_dir_is_none(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
