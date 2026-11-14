import pytest
from fastapi import FastAPI

from rehis.errors import ApiError
from rehis.security.ratelimit import Limiters, RateLimiter, default_limiters


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_allows_limit_hits_then_raises_429_with_retry_after() -> None:
    clock = FakeClock()
    limiter = RateLimiter(3, 600, clock)

    for _ in range(3):
        limiter.hit("ip")

    with pytest.raises(ApiError) as excinfo:
        limiter.hit("ip")

    assert excinfo.value.status_code == 429
    assert excinfo.value.detail.startswith("Слишком много попыток. Попробуйте через")
    retry_after = int((excinfo.value.headers or {})["Retry-After"])
    assert 1 <= retry_after <= 600


def test_recovers_after_window() -> None:
    clock = FakeClock()
    limiter = RateLimiter(2, 60, clock)
    limiter.hit("ip")
    limiter.hit("ip")
    with pytest.raises(ApiError):
        limiter.hit("ip")

    clock.now += 61

    limiter.hit("ip")


def test_window_slides_rather_than_resets() -> None:
    clock = FakeClock()
    limiter = RateLimiter(2, 60, clock)
    limiter.hit("ip")
    clock.now += 40
    limiter.hit("ip")
    clock.now += 30  # first hit is 70s old, second is 30s old

    limiter.hit("ip")
    with pytest.raises(ApiError):
        limiter.hit("ip")


def test_keys_are_independent() -> None:
    limiter = RateLimiter(1, 60, FakeClock())
    limiter.hit("a")

    limiter.hit("b")
    with pytest.raises(ApiError):
        limiter.hit("a")


def test_default_limiters_use_documented_limits() -> None:
    limiters = default_limiters()

    assert isinstance(limiters, Limiters)
    for _ in range(10):
        limiters.login_ip.hit("x")
    with pytest.raises(ApiError):
        limiters.login_ip.hit("x")
    for _ in range(5):
        limiters.register_ip.hit("x")
    with pytest.raises(ApiError):
        limiters.register_ip.hit("x")


def test_app_exposes_limiters(app: FastAPI) -> None:
    assert isinstance(app.state.limiters, Limiters)
