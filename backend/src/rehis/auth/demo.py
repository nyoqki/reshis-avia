"""Idempotent seeding of the shared demo account from REHIS_DEMO_* settings."""

import logging
import sqlite3

from rehis.auth.passwords import hash_password, verify_password
from rehis.config import Settings
from rehis.db import UsernameTakenError, create_user, get_user_by_username, update_user

logger = logging.getLogger(__name__)


def seed_demo_user(conn: sqlite3.Connection, settings: Settings) -> None:
    if not settings.demo_username or settings.demo_password is None:
        return
    username = settings.demo_username
    password = settings.demo_password.get_secret_value()
    if not password:
        return
    user = get_user_by_username(conn, username)
    if user is None:
        try:
            create_user(conn, username, hash_password(password), is_demo=True)
            logger.info("Created demo user %r", username)
            return
        except UsernameTakenError:
            # Another worker inserted it between the lookup and the insert.
            user = get_user_by_username(conn, username)
            if user is None:
                raise
    password_ok = verify_password(user.password_hash, password)
    if password_ok and user.is_demo:
        return
    new_hash = None if password_ok else hash_password(password)
    update_user(conn, user.id, password_hash=new_hash, is_demo=True)
    logger.info("Updated demo user %r", username)
