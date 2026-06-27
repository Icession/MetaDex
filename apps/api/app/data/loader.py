"""Read layer over the seeded data core.

Turns SQLite rows into engine-ready Pokemon records:

    {"id": 25, "name": "pikachu", "types": ["Electric"],
     "base": {"hp": 35, "atk": 55, "def": 40, "spa": 50, "spd": 50, "spe": 90}}

The DB already stores canonical values (capitalized types like "Electric", the
engine's six stat keys hp/atk/def/spa/spd/spe), so this layer just *reshapes*
rows into the nested shape the TypeScript engine consumes. No math, no remapping
of names — that all happened at seed time.
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
    stored lowercase "pikachu".
    """
    row = conn.execute(
        "SELECT * FROM pokemon WHERE name = ? COLLATE NOCASE",
        (name.strip(),),
    ).fetchone()
    return _row_to_record(row) if row else None


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
