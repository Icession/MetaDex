# MetaDex — Project Memory

> MetaDex = **M**ost **E**ffective **T**actic **A**vailable. The name of both the
> app and its in-app AI assistant/mascot (original electric-themed character).

MetaDex is an all-round Pokemon battle-analysis assistant. It reads your lineup
and the opponent's and gives mathematically-exact matchup / EV / move / item
advice, then narrates it in a lively in-character voice. Multi-game,
multi-platform, companion-first.

Full plan and phase tracker: @ROADMAP.md

---

## Guiding rules (NON-NEGOTIABLE — YOU MUST follow)

1. **The LLM never does math.** All type/stat/damage/speed numbers come from
   `packages/engine` (pure functions). The LLM only narrates engine output.
   This is what keeps MetaDex fast AND hallucination-free.
2. **One engine, many games.** Game-specific rules live ONLY in
   `packages/game-profiles`. Engine/advisor code asks the profile what mechanics
   exist — it never hardcodes a game (no `if (game === "champions")`).
3. **Companion-first.** Screenshot -> analyze works on every platform and ships
   first. Floating overlay is a desktop/Android-only enhancement; iOS can't do it.
4. **Original IP only.** Never use Nintendo/Game Freak names as the brand, and
   never bundle official sprites. Data comes from PokeAPI under its fair-use terms.
   Non-commercial / educational / portfolio.

---

## Architecture

Polyglot monorepo. TS side = pnpm workspaces; `apps/api` is a separate Python app.

```
metadex/
├── apps/
│   ├── web/            # React + Vite + TS + Tailwind — companion app + Pokedex
│   └── api/            # FastAPI — PokeAPI seeding, DB, AI orchestration
├── packages/
│   ├── engine/         # TS deterministic core (DONE, 12 tests passing)
│   ├── game-profiles/  # TS GameProfile schema + per-game configs (DONE)
│   └── data/           # seeded PokeAPI dataset + loader (TODO)
├── CLAUDE.md
└── ROADMAP.md
```

- **engine** — type chart, `effectiveness()`, `calcStats()`, speed tiers. Pure,
  no network, no AI. Single source of truth for all math.
- **game-profiles** — each game declares which mechanics exist (e.g. Champions:
  `hasHeldItems:false`, `statSystem:"free_points"`; Scarlet/Violet flips both).
  Advisors consult the profile before giving advice.
- **AI layer** (later) — Gemini + Claude behind one provider-agnostic interface +
  router. Gemini Flash = vision/extraction + cheap volume; Claude = persona voice.
  Fed the engine's exact numbers as structured context.

---

## Stack

- Frontend: React + Vite + TypeScript + Tailwind
- Backend: FastAPI (Python, uv or poetry)
- DB: PostgreSQL (Neon), seeded from PokeAPI, cached locally for speed/offline
- AI: Gemini API + Claude API (provider-agnostic interface)
- Capture v1: Tesseract behind a `CaptureProvider` interface (swappable to LLM-vision)
- Deploy: Vercel (web) + Render (api) + Neon (db)

---

## Conventions

- TypeScript strict mode. Never use `any` — prefer `unknown` + a type guard.
- Engine and game-profiles stay PURE: no I/O, no network, no AI calls.
- Tests use Vitest, colocated as `*.test.ts`. Run before committing.
- Package scope is `@metadex/*`.
- Keep advice logic out of the engine; advice asks the profile + reads engine output.
- Commit messages: `feat:`, `fix:`, `chore:`, `test:`.

## Commands

- Install everything: `pnpm install`
- All TS tests: `pnpm -r test`
- Engine tests: `pnpm --filter @metadex/engine test`
- Analyzer tests: `pnpm --filter @metadex/analyzer test`
- Run the API (from `apps/api`): `uv run uvicorn app.main:app --port 8000`
- Matchup demo (API must be running):
  `pnpm --filter @metadex/analyzer demo -- --game champions --me "Pikachu,Onix" --vs "Staryu,Charizard"`
- Web smoke proof (API must be running): `pnpm --filter @metadex/web dev` → open the
  printed `http://localhost:5173`

---

## How the analysis is served (Phase 4 decision)

The analyzer is TypeScript; the API is Python. Rather than port the analyzer to
Python (which would create a SECOND source of truth for the same numbers —
breaking guiding rules #1 and #2), **analysis runs client-side as a TS library**
and **Python stays data-only**:

- `@metadex/analyzer` (pure) computes the matchup. `@metadex/analyzer/client`
  (impure subpath, the ONE place network lives) fetches a team from the data
  bridge and runs the pure core. Both the CLI and the web app call this same
  `runMatchup` — no duplicated fetch/analyze logic.
- The Python API serves data only (`/pokemon/batch`). It does NO analysis.
- **Narration seam (Phase 5):** the AI layer is Python, but it never needs to do
  math — the browser runs the analyzer, then POSTs the *already-computed*
  structured result to a future Python `/narrate`. The LLM only voices exact
  numbers. This is how "Python = data-only" coexists with "AI orchestration is
  Python" without ever breaking rule #1.
- This consciously REVISES the roadmap's old "FastAPI serves matchup endpoints"
  line: there is no matchup endpoint. A Node `/analyze` HTTP service is possible
  later if a non-JS client ever needs analysis, but nothing does today (YAGNI).

Known seams (deliberate): `PokemonOut` (Pydantic) and `PokemonData` (TS) are
hand-synced; the pure analyzer core stays browser-safe (no `process`/`fs` in its
import chain) so Vite bundles it as-is.

## Current state (Phase 4 — Analyzer serving + web seam)

- DONE: `@metadex/analyzer/client` — shared impure `runMatchup` orchestrator;
  `cli.ts` is now a thin caller of it (no behavior change to the demo).
- DONE: data-layer caching — `apps/api/app/data/loader.py` memoizes resolved
  records in a module-level dict keyed by lowercased name (hits only, no TTL, no
  shared connection — sidesteps sqlite3's cross-thread rule). Repeat lookups
  skip the DB. `clear_cache()` resets it after a reseed.
- DONE: CORS — `CORSMiddleware` in `main.py` for the Vite dev origins so the
  browser's data fetch isn't blocked.
- DONE: `apps/web` scaffolded (Vite + React + TS + Tailwind v4). One smoke page
  runs `runMatchup` against the live API with hardcoded teams and renders the
  advice — proving browser → API → engine end-to-end. Vite aliases the raw-TS
  `@metadex/*` sources so it transpiles them. The real matchup UI is Phase 7.
- NEXT: Phase 5 (AI layer / mascot narration over the engine's exact numbers via
  the `/narrate` seam) + seed movesets/full dex.

## Earlier state (Phase 3 — First matchup analyzer)

- DONE: `packages/engine` built + 12 tests green (effectiveness, stats, speed).
- DONE: `packages/game-profiles` schema + Champions & Scarlet/Violet profiles.
- DONE: `apps/api` scaffolded (FastAPI, uv-managed; `/health` endpoint).
- DONE: PokeAPI seeder (ETL) in `apps/api/app/seed` — pulls base stats/types/
  abilities into SQLite (`data/metadex.db`, gitignored). Idempotent (UPSERTs),
  disk-cached (`.cache/`, no re-download), rate-limited, and logged. Stores
  engine-ready values (capitalized types, `hp/atk/def/spa/spd/spe`). Gen 1 (151)
  seeded + verified against known stats. Run: `uv run python -m app.seed.seed`
  (`--limit` to scale up, `--refresh` to bypass cache).
- DONE: data bridge — `apps/api/app/data/loader.py` reshapes DB rows into
  engine-ready records; `POST /pokemon/batch` serves a whole team in one
  round-trip (case-insensitive names; unknowns returned in `missing`).
- DONE: `packages/analyzer` — pure `analyzeMatchup({profileId, myTeam,
  enemyTeam, lookup})`. Uses the engine for type/speed math and consults the
  game profile (gates speed/item/gimmick advice) to return best lead + worst to
  avoid, each with a plain-English reason. Data arrives via an injected `lookup`
  so the core stays pure. 4 tests green. NOTE: no movesets seeded yet, so
  offense is approximated from each Pokemon's STAB *typing* (reasons say so).
- DONE: `packages/analyzer/src/cli.ts` — drives the analyzer for a real Gen 1
  demo (now via the shared `@metadex/analyzer/client`; see Phase 4 above).

---

## Mascot voice (MetaDex)

- Lively, concise, a little mischievous. Opens with a spark ("Bzzt!") sparingly.
- NEVER invents numbers — every stat/multiplier it states comes from the engine.
- Explains the WHY for a beginner (user's Pokemon knowledge is ~2-3/10).
- Example: "Bzzt! Their Landorus is Ground/Flying — your Electric does NOTHING to
  it. Hit it with Water instead (2x). And Levitate means its Earthquake whiffs."
