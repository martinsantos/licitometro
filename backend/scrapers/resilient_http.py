"""
Resilient HTTP client with anti-ban features:
- User-Agent rotation
- Exponential backoff with jitter
- Per-domain rate limiting
- Circuit breaker pattern
- Retry-After header support
"""

import asyncio
import logging
import random
import time
from typing import Optional, Dict
from urllib.parse import urlparse
import aiohttp

logger = logging.getLogger("resilient_http")

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
]


class DomainState:
    """Track state per domain for rate limiting and circuit breaker."""

    def __init__(self):
        self.failure_count = 0
        self.last_request_time = 0.0
        self.cooldown_until = 0.0
        self.min_interval = 1.0  # minimum seconds between requests

    @property
    def is_in_cooldown(self) -> bool:
        return time.time() < self.cooldown_until

    def record_failure(self):
        self.failure_count += 1
        if self.failure_count >= 5:
            self.cooldown_until = time.time() + 300  # 5 min cooldown
            logger.warning(f"Circuit breaker tripped: 5 failures, cooldown 5 min")

    def record_success(self):
        self.failure_count = 0

    async def wait_rate_limit(self):
        elapsed = time.time() - self.last_request_time
        if elapsed < self.min_interval:
            wait = self.min_interval - elapsed
            await asyncio.sleep(wait)
        self.last_request_time = time.time()


class ResilientHttpClient:
    """HTTP client with anti-ban protections."""

    def __init__(
        self,
        max_retries: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 120.0,
        headers: Optional[Dict] = None,
        cookies: Optional[Dict] = None,
    ):
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.extra_headers = headers or {}
        self.extra_cookies = cookies or {}
        self._domain_states: Dict[str, DomainState] = {}
        self._session: Optional[aiohttp.ClientSession] = None

    def _get_domain(self, url: str) -> str:
        return urlparse(url).netloc

    def _get_domain_state(self, url: str) -> DomainState:
        domain = self._get_domain(url)
        if domain not in self._domain_states:
            self._domain_states[domain] = DomainState()
        return self._domain_states[domain]

    def _random_ua(self) -> str:
        return random.choice(USER_AGENTS)

    def _backoff_delay(self, attempt: int) -> float:
        base = self.base_delay * (2 ** attempt)
        jitter_factor = random.uniform(0.5, 1.5)
        return min(base * jitter_factor, self.max_delay)

    async def _ensure_session(self):
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=60, connect=15, sock_read=30)
            connector = aiohttp.TCPConnector(ssl=False)
            self._session = aiohttp.ClientSession(
                cookies=self.extra_cookies,
                timeout=timeout,
                connector=connector,
            )

    async def fetch(self, url: str, method: str = "GET", **kwargs) -> Optional[str]:
        """Fetch a URL with retries, backoff, and anti-ban protections."""
        await self._ensure_session()
        domain_state = self._get_domain_state(url)

        if domain_state.is_in_cooldown:
            remaining = domain_state.cooldown_until - time.time()
            logger.warning(f"Domain {self._get_domain(url)} in cooldown for {remaining:.0f}s")
            return None

        for attempt in range(self.max_retries + 1):
            try:
                await domain_state.wait_rate_limit()

                headers = {
                    "User-Agent": self._random_ua(),
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
                    "Accept-Encoding": "gzip, deflate",
                    **self.extra_headers,
                }

                async with self._session.request(
                    method, url, headers=headers, **kwargs
                ) as response:
                    if response.status == 200:
                        domain_state.record_success()
                        # Always read raw bytes first, then decode manually.
                        # response.text() is unreliable when servers lie about charset.
                        raw = await response.read()
                        encoding = response.charset or "utf-8"
                        try:
                            return raw.decode(encoding)
                        except (UnicodeDecodeError, LookupError):
                            return raw.decode("latin-1", errors="replace")

                    if response.status in (429, 503):
                        retry_after = response.headers.get("Retry-After")
                        if retry_after:
                            delay = float(retry_after)
                        else:
                            delay = self._backoff_delay(attempt)
                        logger.warning(
                            f"Rate limited ({response.status}) on {url}, "
                            f"retrying in {delay:.1f}s (attempt {attempt + 1})"
                        )
                        domain_state.record_failure()
                        await asyncio.sleep(delay)
                        continue

                    if response.status >= 500:
                        domain_state.record_failure()
                        delay = self._backoff_delay(attempt)
                        logger.warning(
                            f"Server error {response.status} on {url}, "
                            f"retrying in {delay:.1f}s"
                        )
                        await asyncio.sleep(delay)
                        continue

                    # 4xx (not 429) - don't retry
                    logger.error(f"HTTP {response.status} fetching {url}")
                    return None

            except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                domain_state.record_failure()
                if attempt < self.max_retries:
                    delay = self._backoff_delay(attempt)
                    logger.warning(
                        f"Connection error on {url}: {e}, "
                        f"retrying in {delay:.1f}s"
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(f"Failed to fetch {url} after {self.max_retries + 1} attempts: {e}")
                    return None

        return None

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()
