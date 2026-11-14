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
    if not user.is_demo:
        # A regular account already holds this name: converting it would expose its history to
        # every demo visitor and lock its owner out.
        logger.error(
            "Demo user %r not seeded: a regular account with this name exists", user.username
        )
        return
    if verify_password(user.password_hash, password):
        return
    update_user(conn, user.id, password_hash=hash_password(password))
    logger.info("Updated demo user %r", username)
