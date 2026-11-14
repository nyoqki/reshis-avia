"""FastAPI dependencies for authenticated routes."""

import sqlite3
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Request

from rehis.auth.sessions import SESSION_COOKIE, hash_token
from rehis.db import User, get_db, get_session_user
from rehis.errors import ApiError

UNAUTHORIZED_DETAIL = "Войдите, чтобы продолжить"


def current_user(request: Request, conn: Annotated[sqlite3.Connection, Depends(get_db)]) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise ApiError(401, UNAUTHORIZED_DETAIL)
    user = get_session_user(conn, hash_token(token), now=datetime.now(UTC))
    if user is None:
        raise ApiError(401, UNAUTHORIZED_DETAIL)
    return user
