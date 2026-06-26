"""SQLite connection + schema initialization for the MetaDex data core."""

from __future__ import annotations

import sqlite3
from pathlib import Path

# apps/api/data/metadex.db
DEFAULT_DB_PATH = Path(__file__).resolve().parents[2] / "data" / "metadex.db"
SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"


def connect(db_path: Path = DEFAULT_DB_PATH) -> sqlite3.Connection:
    """Open a connection with foreign keys enforced.

    SQLite does not enforce foreign keys unless this pragma is set per
    connection, so we set it here for every caller.
    """
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    """Create tables if they don't exist. Safe to run repeatedly."""
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    conn.commit()
