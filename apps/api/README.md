# MetaDex API

FastAPI backend: PokeAPI seeding, the local data core (source of truth for the
engine), and — later — AI orchestration.

## Setup

Uses [uv](https://docs.astral.sh/uv/). From `apps/api/`:

```bash
uv sync
```

## Seed the data core

Pulls base stats, types, and abilities from PokeAPI into a local SQLite DB
(`data/metadex.db`). Idempotent (re-run safe), disk-cached (`.cache/`),
rate-limited, and logged.

```bash
# Gen 1 (default, fast first run)
uv run python -m app.seed.seed

# More Pokemon
uv run python -m app.seed.seed --limit 1025

# Re-download instead of using the cache
uv run python -m app.seed.seed --refresh
```

Flags: `--limit`, `--offset`, `--delay`, `--db-path`, `--cache-dir`, `--refresh`.

Re-running with a warm cache makes no network calls — it reads `.cache/` and
re-UPSERTs, so it's safe and instant.

## Schema

Three tables, storing values already mapped to the engine's canonical names
(capitalized types, `hp/atk/def/spa/spd/spe` stats):

- `pokemon` — one row per Pokemon; types as `type1`/`type2`, six `base_*` stats.
- `ability` — deduped ability list.
- `pokemon_ability` — many-to-many join with `slot` and `is_hidden`.

See `app/seed/schema.sql`.

## Run the API

```bash
uv run uvicorn app.main:app --reload
# GET http://127.0.0.1:8000/health
```

> `data/*.db` and `.cache/` are gitignored build artifacts — regenerable by
> re-running the seeder.
