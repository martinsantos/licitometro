"""Small async retry/circuit-breaker helpers for non-scraper services."""

from __future__ import annotations

import asyncio
import logging
import random
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict

logger = logging.getLogger("service_resilience")


@dataclass
class ServiceCircuit:
    name: str
    failure_threshold: int = 5
    recovery_timeout: float = 60.0
    success_threshold: int = 2
    state: str = "closed"
    failure_count: int = 0
    success_count: int = 0
    last_failure: float = 0.0

    @property
    def is_open(self) -> bool:
        if self.state != "open":
            return False
        if time.monotonic() - self.last_failure >= self.recovery_timeout:
            self.state = "half_open"
            self.success_count = 0
            return False
        return True

    def record_success(self) -> None:
        if self.state == "half_open":
            self.success_count += 1
            if self.success_count >= self.success_threshold:
                self.state = "closed"
                self.failure_count = 0
                self.success_count = 0
        else:
            self.failure_count = 0

    def record_failure(self) -> None:
        self.failure_count += 1
        self.last_failure = time.monotonic()
        if self.state == "half_open" or self.failure_count >= self.failure_threshold:
            self.state = "open"


_circuits: Dict[str, ServiceCircuit] = {}


def get_service_circuit(name: str) -> ServiceCircuit:
    if name not in _circuits:
        _circuits[name] = ServiceCircuit(name=name)
    return _circuits[name]


async def run_with_retry(
    service_name: str,
    operation: Callable[[], Awaitable[Any]],
    *,
    max_retries: int = 2,
    base_delay: float = 0.5,
    max_delay: float = 8.0,
) -> Any:
    """Run an async operation with exponential backoff and circuit breaker."""

    circuit = get_service_circuit(service_name)
    if circuit.is_open:
        raise RuntimeError(f"circuit_open:{service_name}")

    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            result = await operation()
            circuit.record_success()
            return result
        except Exception as exc:
            last_exc = exc
            if attempt >= max_retries:
                circuit.record_failure()
                break
            delay = min(base_delay * (2 ** attempt), max_delay)
            delay = random.uniform(0, delay)
            logger.warning(
                "%s attempt %s/%s failed: %s; retrying in %.1fs",
                service_name,
                attempt + 1,
                max_retries + 1,
                type(exc).__name__,
                delay,
            )
            await asyncio.sleep(delay)

    if last_exc:
        raise last_exc
    raise RuntimeError(f"{service_name} failed")
