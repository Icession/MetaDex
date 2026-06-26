"""Seed the MetaDex data core from PokeAPI.

Pulls each Pokemon's base stats, types, and abilities and UPSERTs them into a
local SQLite DB that serves as the engine's source of truth. Idempotent,
disk-cached, rate-limited, and logged.

Run:
    uv run python -m app.seed.seed --limit 151
"""

from __future__ import annotations

import argparse
import logging
import sqlite3
import time
from pathlib import Path
from typing import Any

from .db import DEFAULT_DB_PATH, connect, init_schema
from .pokeapi import DEFAULT_CACHE_DIR, PokeApiClient

log = logging.getLogger("metadex.seed")

# PokeAPI stat name -> engine canonical key. This mapping is the single most
# error-prone part of the seeder: "special-defense" is spd and "speed" is spe.
# Getting these two backwards fails silently (rows fill, math goes wrong), so
# they are spelled out explicitly here and verified after seeding.
STAT_MAP: dict[str, str] = {
    "hp": "hp",
    "attack": "atk",
    "defense": "def",
    "special-attack": "spa",
    "special-defense": "spd",
    "speed": "spe",
}


def _capitalize_type(name: str) -> str:
    """PokeAPI types are lowercase single words ('fire'); the engine wants
    'Fire'. .capitalize() is correct for all 18 type names."""
    return name.capitalize()


def extract(detail: dict[str, Any]) -> dict[str, Any]:
    """Map a /pokemon/{id} payload to an engine-ready record."""
    # Types: sort by PokeAPI 'slot' rather than trusting array order.
    types = sorted(detail["types"], key=lambda t: t["slot"])
    type1 = _capitalize_type(types[0]["type"]["name"])
    type2 = _capitalize_type(types[1]["type"]["name"]) if len(types) > 1 else None

    # Stats: build via explicit STAT_MAP; never positional.
    stats: dict[str, int] = {}
    for entry in detail["stats"]:
        key = STAT_MAP[entry["stat"]["name"]]
        stats[key] = entry["base_stat"]

    # Abilities: capture id, name, slot, and hidden flag.
    abilities = []
    for a in detail["abilities"]:
        ref = a["ability"]
        ability_id = int(ref["url"].rstrip("/").split("/")[-1])
        abilities.append(
            {
                "id": ability_id,
                "name": ref["name"],
                "slot": a["slot"],
                "is_hidden": 1 if a["is_hidden"] else 0,
            }
        )

    return {
        "id": detail["id"],
        "name": detail["name"],
        "type1": type1,
        "type2": type2,
        "stats": stats,
        "height": detail.get("height"),
        "weight": detail.get("weight"),
        "abilities": abilities,
    }


def upsert(conn: sqlite3.Connection, rec: dict[str, Any], now: str) -> None:
    """Idempotently write one Pokemon and its abilities."""
    s = rec["stats"]
    conn.execute(
        """
        INSERT INTO pokemon
            (id, name, type1, type2, base_hp, base_atk, base_def,
             base_spa, base_spd, base_spe, height, weight, updated_at)
        VALUES
            (:id, :name, :type1, :type2, :hp, :atk, :def,
             :spa, :spd, :spe, :height, :weight, :updated_at)
        ON CONFLICT(id) DO UPDATE SET
            name=excluded.name, type1=excluded.type1, type2=excluded.type2,
            base_hp=excluded.base_hp, base_atk=excluded.base_atk,
            base_def=excluded.base_def, base_spa=excluded.base_spa,
            base_spd=excluded.base_spd, base_spe=excluded.base_spe,
            height=excluded.height, weight=excluded.weight,
            updated_at=excluded.updated_at
        """,
        {
            "id": rec["id"],
            "name": rec["name"],
            "type1": rec["type1"],
            "type2": rec["type2"],
            "hp": s["hp"], "atk": s["atk"], "def": s["def"],
            "spa": s["spa"], "spd": s["spd"], "spe": s["spe"],
            "height": rec["height"], "weight": rec["weight"],
            "updated_at": now,
        },
    )

    for ab in rec["abilities"]:
        # Ability before join row keeps the FK satisfied regardless of pragma.
        conn.execute(
            "INSERT INTO ability (id, name) VALUES (?, ?) "
            "ON CONFLICT(id) DO UPDATE SET name=excluded.name",
            (ab["id"], ab["name"]),
        )
        conn.execute(
            """
            INSERT INTO pokemon_ability (pokemon_id, ability_id, slot, is_hidden)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(pokemon_id, ability_id) DO UPDATE SET
                slot=excluded.slot, is_hidden=excluded.is_hidden
            """,
            (rec["id"], ab["id"], ab["slot"], ab["is_hidden"]),
        )


def seed(
    limit: int,
    offset: int,
    delay: float,
    db_path: Path,
    cache_dir: Path,
    refresh: bool,
) -> None:
    start = time.perf_counter()
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    ids = range(1 + offset, 1 + offset + limit)
    total = len(ids)

    conn = connect(db_path)
    init_schema(conn)

    with PokeApiClient(cache_dir=cache_dir, delay=delay, refresh=refresh) as client:
        for i, dex_id in enumerate(ids, start=1):
            hits_before = client.cache_hits
            try:
                detail = client.get("pokemon", dex_id)
                rec = extract(detail)
                upsert(conn, rec, now)
                conn.commit()
            except Exception as exc:  # keep going; one bad id shouldn't abort
                log.warning("[%4d/%d] id=%d FAILED: %s", i, total, dex_id, exc)
                continue

            source = "cached" if client.cache_hits > hits_before else "fetched"
            t2 = f"/{rec['type2']}" if rec["type2"] else ""
            log.info(
                "[%4d/%d] #%-4d %-12s %s%s — %d abilities (%s)",
                i, total, rec["id"], rec["name"],
                rec["type1"], t2, len(rec["abilities"]), source,
            )

    conn.close()
    elapsed = time.perf_counter() - start
    log.info(
        "Done: %d processed, %d cache hits, %d fetched, %.1fs elapsed → %s",
        total, client.cache_hits, client.fetched, elapsed, db_path,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the MetaDex data core from PokeAPI.")
    parser.add_argument("--limit", type=int, default=151,
                        help="How many Pokemon to seed (default 151 = Gen 1).")
    parser.add_argument("--offset", type=int, default=0,
                        help="Dex id offset to start from (default 0 → starts at #1).")
    parser.add_argument("--delay", type=float, default=0.1,
                        help="Seconds to sleep after each network call (default 0.1).")
    parser.add_argument("--db-path", type=Path, default=DEFAULT_DB_PATH,
                        help="SQLite DB path.")
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE_DIR,
                        help="Directory for cached raw JSON.")
    parser.add_argument("--refresh", action="store_true",
                        help="Ignore the disk cache and re-fetch everything.")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )
    # httpx logs every request at INFO; keep our progress lines readable.
    logging.getLogger("httpx").setLevel(logging.WARNING)

    seed(
        limit=args.limit,
        offset=args.offset,
        delay=args.delay,
        db_path=args.db_path,
        cache_dir=args.cache_dir,
        refresh=args.refresh,
    )


if __name__ == "__main__":
    main()
