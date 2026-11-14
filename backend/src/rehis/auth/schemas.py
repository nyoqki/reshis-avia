"""Request and response bodies of the auth API."""

from typing import Annotated

from pydantic import BaseModel, Field


class Credentials(BaseModel, extra="forbid"):
    username: str
    password: str


class RegisterRequest(Credentials):
    username: Annotated[str, Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_.-]{3,32}$")]
    password: Annotated[str, Field(min_length=8, max_length=128)]


class LoginRequest(Credentials):
    # No pattern: a malformed name gets the same 401 as an unknown one.
    username: Annotated[str, Field(min_length=1, max_length=64)]
    password: Annotated[str, Field(min_length=1, max_length=128)]


class UserOut(BaseModel):
    username: str
    is_demo: bool


class AuthOptions(BaseModel):
    demo_enabled: bool
    registration_open: bool
