import asyncio
import os
import random
import time
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any

import httpx


class SourceError(Exception):
    def __init__(self, provider: str, status: int = 503, retry_after: float = 0):
        self.provider = provider
        self.status = status
        self.retry_after = retry_after
        super().__init__(provider)


def retry_delay(value: str | None, attempt: int = 0) -> float:
    if value:
        try:
            return max(0, float(value))
        except ValueError:
            try:
                return max(0, (parsedate_to_datetime(value) - datetime.now(UTC)).total_seconds())
            except (ValueError, TypeError):
                pass
    return 2**attempt + random.uniform(0, 0.5)


class Transport:
    def __init__(self, client: httpx.AsyncClient):
        self.client = client
        self.mediawiki_slots = asyncio.Semaphore(3)
        self.xtools_slot = asyncio.Semaphore(1)
        self.public_cache: dict[str, tuple[float, dict]] = {}

    async def get(self, url: str, params: dict[str, Any] | None, provider: str) -> dict:
        # One external call per task. Retrying and waiting occur in the browser,
        # keeping functions short even when Retry-After spans several minutes.
        public = bool(
            params
            and (params.get("action") == "sitematrix" or params.get("siprop") == "namespaces")
        )
        cache_key = url + str(params)
        cached = self.public_cache.get(cache_key) if public else None
        if cached and time.monotonic() - cached[0] < 3600:
            return cached[1]
        gate = self.xtools_slot if provider == "xtools" else self.mediawiki_slots
        async with gate:
            try:
                response = await self.client.get(url, params=params)
            except (httpx.TimeoutException, httpx.NetworkError):
                raise SourceError(provider, 504) from None
        if response.status_code != 200:
            raise SourceError(
                provider, response.status_code, retry_delay(response.headers.get("Retry-After"))
            )
        try:
            data = response.json()
        except ValueError:
            raise SourceError(provider, 502) from None
        if not isinstance(data, dict):
            raise SourceError(provider, 502)
        if "error" in data:
            error = data["error"]
            if not isinstance(error, dict):
                raise SourceError(provider, 502)
            code = error.get("code", "")
            raise SourceError(
                provider,
                503 if code in {"maxlag", "ratelimited", "readonly"} else 502,
                max(5, retry_delay(response.headers.get("Retry-After"))),
            )
        if public:
            self.public_cache[cache_key] = (time.monotonic(), data)
        return data


def make_client() -> httpx.AsyncClient:
    agent = os.getenv(
        "RETENTION_USER_AGENT", "WikimediaRetention/1.0 (https://github.com/p5ykomat/observatoire-contributions)"
    )
    return httpx.AsyncClient(
        headers={"User-Agent": agent, "Accept": "application/json"},
        timeout=httpx.Timeout(18, connect=8),
        follow_redirects=False,
    )
