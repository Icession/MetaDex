"""MetaDex API — FastAPI app entry point.

Currently a minimal shell proving the scaffold works. Analyzer/matchup
endpoints arrive in Phase 4; this file gives the seeded data core a home to
be served from.
"""

from fastapi import FastAPI

app = FastAPI(title="MetaDex API", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness probe. Returns ok if the app is up."""
    return {"status": "ok", "service": "metadex-api"}
