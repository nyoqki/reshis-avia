"""argon2id password hashing with library-default parameters."""

import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

_hasher = PasswordHasher()

# Verified against when the username is unknown, so that path costs as much as a real check.
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(32))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    # UnicodeEncodeError: a non-ASCII hash or a password holding a lone surrogate.
    except (VerificationError, InvalidHashError, UnicodeEncodeError):
        return False


def needs_rehash(password_hash: str) -> bool:
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


def burn_verification_time(password: str) -> None:
    verify_password(_DUMMY_HASH, password)
