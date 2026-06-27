"""Read layer over the seeded data core.

Turns SQLite rows into engine-ready Pokemon records:

    {"id": 25, "name": "pikachu", "types": ["Electric"],
     "base": {"hp": 35, "atk": 55, "def": 40, "spa": 50, "spd": 50, "spe": 90}}

The DB already stores canonical values (capitalized types like "Electric", the
engine's six stat keys hp/atk/def/spa/spd/spe), so this layer just *reshapes*
rows into the nested shape the TypeScript engine consumes. No math, no remapping
of names — that all happened at seed time.

Caching: the seeded dataset is IMMUTABLE for the life of the process (only a
reseed + restart changes it), so resolved records are memoized in a module-level
dict keyed by lowercased name. Repeated lookups (a re-analyzed team, an
overlapping team) are served from memory with zero DB round-trips. We cache only
*hits* — never misses — so a name seeded in a later run is still found without a
stale negative lingering until restart. This memo is process-local and per name,
which sidesteps sqlite3's cross-thread connection rules (FastAPI runs sync
handlers across a threadpool): each request still opens its own connection only
for the names not already in the memo.
"""

from __future__ import annotations

import sqlite3
from typing import TypedDict


class PokemonRecord(TypedDict):
    """The engine-ready shape returned for one Pokemon."""

    id: int
    name: str
    types: list[str]        # 1 or 2 entries, e.g. ["Grass", "Poison"]
    base: dict[str, int]    # keys: hp, atk, def, spa, spd, spe


# Module-level memo: lowercased name -> resolved record. Hits only (see above).
_CACHE: dict[str, PokemonRecord] = {}


def _cache_key(name: str) -> str:
    """Normalize a name to its cache key (matches the DB's NOCASE + trim)."""
    return name.strip().lower()


def clear_cache() -> None:
    """Drop the in-memory record cache.

    Call after a reseed within a long-lived process, or from tests that want a
    cold lookup. A normal server restart clears it for free.
    """
    _CACHE.clear()


def _row_to_record(row: sqlite3.Row) -> PokemonRecord:
    """Reshape one flat DB row into the nested engine record.

    Two type columns collapse into a list (dropping NULL type2 for monotypes);
    the six base_* columns collapse into a `base` dict keyed by the engine's
    stat names.
    """
    types = [row["type1"]]
    if row["type2"] is not None:
        types.append(row["type2"])

    return {
        "id": row["id"],
        "name": row["name"],
        "types": types,
        "base": {
            "hp": row["base_hp"],
            "atk": row["base_atk"],
            "def": row["base_def"],
            "spa": row["base_spa"],
            "spd": row["base_spd"],
            "spe": row["base_spe"],
        },
    }


def get_pokemon(conn: sqlite3.Connection, name: str) -> PokemonRecord | None:
    """Look up one Pokemon by name, or None if it isn't seeded.

    Matching is case-insensitive (COLLATE NOCASE) and trims surrounding
    whitespace, so a user typing "Pikachu" or " pikachu " resolves to the
    stored lowercase "pikachu". Resolved records are memoized; misses fall
    through to the DB every time (we never cache a negative result).
    """
    key = _cache_key(name)
    cached = _CACHE.get(key)
    if cached is not None:
        return cached

    row = conn.execute(
        "SELECT * FROM pokemon WHERE name = ? COLLATE NOCASE",
        (name.strip(),),
    ).fetchone()
    if row is None:
        return None

    record = _row_to_record(row)
    _CACHE[key] = record
    return record


def get_many(
    conn: sqlite3.Connection, names: list[str]
) -> tuple[list[PokemonRecord], list[str]]:
    """Look up many names in one call.

    Returns (found, missing): the records that resolved, plus the original
    names that didn't match anything. Splitting them out means one unknown name
    never fails the whole request — the caller can report exactly which names
    were not found.
    """
    found: list[PokemonRecord] = []
    missing: list[str] = []
    for name in names:
        record = get_pokemon(conn, name)
        if record is None:
            missing.append(name)
        else:
            found.append(record)
    return found, missing
