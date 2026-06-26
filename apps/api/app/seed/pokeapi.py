"""PokeAPI HTTP client with a disk cache and polite rate limiting.

Every fetched resource is written to .cache as raw JSON keyed by id. On a
cache hit we read from disk and make no network call (and incur no delay), so
re-runs are instant and work offline. On a miss we fetch, persist, then sleep
the configured delay before returning — keeping us gentle on PokeAPI per its
fair-use terms.
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

import httpx

log = logging.getLogger("metadex.seed")

BASE_URL = "https://pokeapi.co/api/v2"
# apps/api/.cache
DEFAULT_CACHE_DIR = Path(__file__).resolve().parents[2] / ".cache"


class PokeApiClient:
    def __init__(
        self,
        cache_dir: Path = DEFAULT_CACHE_DIR,
        delay: float = 0.1,
        refresh: bool = False,
        timeout: float = 30.0,
    ) -> None:
        self.cache_dir = cache_dir
        self.delay = delay
        self.refresh = refresh
        self._client = httpx.Client(
            base_url=BASE_URL,
            timeout=timeout,
            headers={"User-Agent": "MetaDex/0.1 (educational portfolio project)"},
        )
        # Per-run tallies so the seeder can report cache efficiency.
        self.fetched = 0
        self.cache_hits = 0

    def __enter__(self) -> "PokeApiClient":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def _cache_path(self, resource: str, ident: int | str) -> Path:
        return self.cache_dir / resource / f"{ident}.json"

    def get(self, resource: str, ident: int | str) -> dict[str, Any]:
        """Return a PokeAPI resource (e.g. resource="pokemon", ident=25).

        Reads disk cache first unless refresh is set. Network misses are
        cached and followed by the politeness delay.
        """
        path = self._cache_path(resource, ident)

        if not self.refresh and path.exists():
            self.cache_hits += 1
            return json.loads(path.read_text(encoding="utf-8"))

        resp = self._client.get(f"/{resource}/{ident}")
        resp.raise_for_status()
        data: dict[str, Any] = resp.json()

        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data), encoding="utf-8")
        self.fetched += 1

        # Only sleep on a real network call — cache hits stay instant.
        time.sleep(self.delay)
        return data
