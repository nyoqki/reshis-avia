"""Public auth endpoints: register, login, demo login, logout, me and options."""

import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response

from rehis.auth.deps import current_user
from rehis.auth.passwords import (
    burn_verification_time,
    hash_password,
    needs_rehash,
    verify_password,
)
from rehis.auth.schemas import AuthOptions, LoginRequest, RegisterRequest, UserOut
from rehis.auth.sessions import SESSION_COOKIE, end_session, hash_token, start_session
from rehis.config import Settings
from rehis.db import (
    User,
    UsernameTakenError,
    count_users,
    create_user,
    delete_session,
    get_db,
    get_user_by_username,
    update_user,
)
from rehis.errors import ApiError
from rehis.security.net import client_ip, parse_networks
from rehis.security.ratelimit import Limiters

BAD_LOGIN_DETAIL = "Неверное имя пользователя или пароль"
USERNAME_TAKEN_DETAIL = "Это имя уже занято"
REGISTRATION_CLOSED_DETAIL = "Регистрация закрыта"
DEMO_DISABLED_DETAIL = "Демо-доступ отключён"

router = APIRouter()

Db = Annotated[sqlite3.Connection, Depends(get_db)]


def _settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def _limiters(request: Request) -> Limiters:
    limiters: Limiters = request.app.state.limiters
    return limiters


def _ip(request: Request, settings: Settings) -> str:
    return client_ip(request, parse_networks(settings.trusted_proxies))


def _demo_configured(settings: Settings) -> bool:
    return bool(
        settings.demo_username
        and settings.demo_password is not None
        and settings.demo_password.get_secret_value()
    )


def _registration_open(conn: sqlite3.Connection, settings: Settings) -> bool:
    return settings.registration_open and count_users(conn) < settings.max_users


def _user_out(user: User) -> UserOut:
    return UserOut(username=user.username, is_demo=user.is_demo)


def _log_in(
    conn: sqlite3.Connection, request: Request, response: Response, user: User, settings: Settings
) -> UserOut:
    """Issue a fresh session, dropping the one the request came with, if any."""
    old_token = request.cookies.get(SESSION_COOKIE)
    if old_token:
        delete_session(conn, hash_token(old_token))
    start_session(conn, response, user, settings)
    return _user_out(user)


@router.post("/auth/register", status_code=201)
def register(body: RegisterRequest, request: Request, response: Response, conn: Db) -> UserOut:
    settings = _settings(request)
    _limiters(request).register_ip.hit(_ip(request, settings))
    if not _registration_open(conn, settings):
        raise ApiError(403, REGISTRATION_CLOSED_DETAIL)
    try:
        user = create_user(conn, body.username, hash_password(body.password))
    except UsernameTakenError:
        raise ApiError(409, USERNAME_TAKEN_DETAIL) from None
    return _log_in(conn, request, response, user, settings)


@router.post("/auth/login")
def login(body: LoginRequest, request: Request, response: Response, conn: Db) -> UserOut:
    settings = _settings(request)
    limiters = _limiters(request)
    limiters.login_ip.hit(_ip(request, settings))
    limiters.login_user.hit(body.username.lower())
    user = get_user_by_username(conn, body.username)
    if user is None:
        burn_verification_time(body.password)
        raise ApiError(401, BAD_LOGIN_DETAIL)
    if not verify_password(user.password_hash, body.password):
        raise ApiError(401, BAD_LOGIN_DETAIL)
    if needs_rehash(user.password_hash):
        update_user(conn, user.id, password_hash=hash_password(body.password))
    return _log_in(conn, request, response, user, settings)


@router.post("/auth/demo")
def demo_login(request: Request, response: Response, conn: Db) -> UserOut:
    settings = _settings(request)
    _limiters(request).demo_ip.hit(_ip(request, settings))
    if not _demo_configured(settings) or settings.demo_username is None:
        raise ApiError(404, DEMO_DISABLED_DETAIL)
    user = get_user_by_username(conn, settings.demo_username)
    if user is None or not user.is_demo:
        raise ApiError(404, DEMO_DISABLED_DETAIL)
    return _log_in(conn, request, response, user, settings)


@router.post("/auth/logout", status_code=204)
def logout(request: Request, conn: Db) -> Response:
    response = Response(status_code=204)
    end_session(conn, request, response, _settings(request))
    return response


@router.get("/me")
def me(user: Annotated[User, Depends(current_user)]) -> UserOut:
    return _user_out(user)


@router.get("/auth/options")
def options(request: Request, conn: Db) -> AuthOptions:
    settings = _settings(request)
    return AuthOptions(
        demo_enabled=_demo_configured(settings),
        registration_open=_registration_open(conn, settings),
    )
