import math
import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field

from rehis.errors import ApiError


class RateLimiter:
    """In-memory sliding-window limiter: at most `limit` accepted hits per key per window."""

    def __init__(
        self,
        limit: int,
        window_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if limit < 1:
            raise ValueError("limit must be at least 1")
        if window_seconds <= 0:
            raise ValueError("window_seconds must be positive")
        self.limit = limit
        self.window_seconds = window_seconds
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()
        self._last_prune = clock()

    def hit(self, key: str) -> None:
        with self._lock:
            now = self._clock()
            cutoff = now - self.window_seconds
            if now - self._last_prune >= self.window_seconds:
                self._prune(cutoff)
                self._last_prune = now
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= cutoff:
                hits.popleft()
            if len(hits) >= self.limit:
                retry_after = max(1, math.ceil(hits[0] + self.window_seconds - now))
                minutes = max(1, math.ceil(retry_after / 60))
                raise ApiError(
                    429,
                    f"Слишком много попыток. Попробуйте через {minutes} мин.",
                    headers={"Retry-After": str(retry_after)},
                )
            hits.append(now)

    def _prune(self, cutoff: float) -> None:
        stale = [key for key, hits in self._hits.items() if not hits or hits[-1] <= cutoff]
        for key in stale:
            del self._hits[key]


@dataclass
class Limiters:
    login_ip: RateLimiter = field(default_factory=lambda: RateLimiter(10, 600))
    login_user: RateLimiter = field(default_factory=lambda: RateLimiter(10, 600))
    register_ip: RateLimiter = field(default_factory=lambda: RateLimiter(5, 3600))
    demo_ip: RateLimiter = field(default_factory=lambda: RateLimiter(30, 600))
    forecast_user: RateLimiter = field(default_factory=lambda: RateLimiter(60, 60))


def default_limiters() -> Limiters:
    return Limiters()
