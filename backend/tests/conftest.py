from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr

from rehis.config import Settings
from rehis.main import create_app


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        db_path=tmp_path / "rehis.sqlite3",
        cookie_secure=False,
        allowed_hosts=["testserver", "localhost"],
        allowed_origins=["http://testserver"],
        demo_username="demo",
        demo_password=SecretStr("demo-pass-123"),
    )


@pytest.fixture
def app(settings: Settings) -> FastAPI:
    return create_app(settings)


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
