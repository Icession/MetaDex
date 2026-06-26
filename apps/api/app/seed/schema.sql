-- MetaDex data core schema (SQLite).
--
-- Stores PokeAPI data already mapped to the engine's canonical names:
-- types are capitalized ("Electric") and stats use the engine's six keys
-- (hp/atk/def/spa/spd/spe). The DB is engine-ready — no remapping on read.
--
-- All tables use IF NOT EXISTS and natural primary keys so the seeder can
-- be re-run idempotently (writes are UPSERTs keyed on these PKs).

-- One row per Pokemon. Types live as two columns because the engine consumes
-- at most two; this maps 1:1 to its input with no joins on the hot read path.
CREATE TABLE IF NOT EXISTS pokemon (
    id        INTEGER PRIMARY KEY,          -- PokeAPI / national dex id
    name      TEXT    NOT NULL,
    type1     TEXT    NOT NULL,             -- canonical engine type, e.g. "Electric"
    type2     TEXT,                         -- second type, or NULL for monotypes
    base_hp   INTEGER NOT NULL,
    base_atk  INTEGER NOT NULL,
    base_def  INTEGER NOT NULL,
    base_spa  INTEGER NOT NULL,
    base_spd  INTEGER NOT NULL,             -- special DEFENSE (not speed!)
    base_spe  INTEGER NOT NULL,             -- SPEED
    height    INTEGER,
    weight    INTEGER,
    updated_at TEXT    NOT NULL             -- ISO timestamp of last seed
);

-- Deduped ability list. Abilities are genuinely many-to-many (e.g. "static"
-- is shared across many Pokemon), so they are normalized.
CREATE TABLE IF NOT EXISTS ability (
    id   INTEGER PRIMARY KEY,               -- PokeAPI ability id
    name TEXT    NOT NULL UNIQUE
);

-- Join table: a Pokemon has 1-3 abilities, one of which may be hidden.
CREATE TABLE IF NOT EXISTS pokemon_ability (
    pokemon_id INTEGER NOT NULL REFERENCES pokemon(id),
    ability_id INTEGER NOT NULL REFERENCES ability(id),
    slot       INTEGER NOT NULL,
    is_hidden  INTEGER NOT NULL DEFAULT 0,  -- 0/1 boolean
    PRIMARY KEY (pokemon_id, ability_id)
);
