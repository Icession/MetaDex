"""MetaDex API — FastAPI app entry point.

Serves the seeded data core. The single analysis-facing route here is the
*data bridge*: `POST /pokemon/batch` hands engine-ready Pokemon records to the
TypeScript analyzer (which owns all the math). This file does no analysis — it
only reads rows and reshapes them via app.data.loader.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .data.loader import get_many
from .seed.db import connect

app = FastAPI(title="MetaDex API", version="0.1.0")

# Browsers block a Vite-served page from calling this API cross-origin unless we
# opt in here. The CLI (Node) isn't subject to CORS, so this is purely what
# makes the web companion's data fetch work. Dev origins only; tighten for prod.
ALLOWED_ORIGINS = [
    "http://localhost:5173",   # Vite dev server (default)
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness probe. Returns ok if the app is up."""
    return {"status": "ok", "service": "metadex-api"}


class BatchRequest(BaseModel):
    """A list of Pokemon names to look up (case-insensitive)."""

    names: list[str]


class PokemonOut(BaseModel):
    """One engine-ready Pokemon record (mirrors loader.PokemonRecord)."""

    id: int
    name: str
    types: list[str]            # ["Electric"] or ["Grass", "Poison"]
    base: dict[str, int]        # hp, atk, def, spa, spd, spe


class BatchResponse(BaseModel):
    """Resolved records plus the names that matched nothing."""

    found: list[PokemonOut]
    missing: list[str]


@app.post("/pokemon/batch")
def pokemon_batch(req: BatchRequest) -> BatchResponse:
    """Resolve many names to engine-ready records in one round-trip.

    Unknown names come back in `missing` rather than failing the request, so
    the analyzer can tell the user exactly which names it couldn't find.
    """
    conn = connect()
    try:
        found, missing = get_many(conn, req.names)
    finally:
        conn.close()
    return BatchResponse(found=found, missing=missing)
