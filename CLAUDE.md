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
- Engine tests: `pnpm --filter @metadex/engine test`

---

## Current state (Phase 2 — Data core)

- DONE: `packages/engine` built + 12 tests green (effectiveness, stats, speed).
- DONE: `packages/game-profiles` schema + Champions & Scarlet/Violet profiles.
- TODO at scaffold time: create empty `apps/web` (Vite+React+TS+Tailwind) and
  `apps/api` (FastAPI). Add tsconfigs/workspace wiring as needed.
- NEXT build task: PokeAPI seeder (ETL) in `apps/api` — pull base stats/types/
  moves into the DB so `calcStats` is fed automatically. Cache locally; respect
  PokeAPI fair-use (don't hammer it live per request).
- THEN: Phase 3 (run a 2nd game through the engine), Phase 4 (analyzer API).

---

## Mascot voice (MetaDex)

- Lively, concise, a little mischievous. Opens with a spark ("Bzzt!") sparingly.
- NEVER invents numbers — every stat/multiplier it states comes from the engine.
- Explains the WHY for a beginner (user's Pokemon knowledge is ~2-3/10).
- Example: "Bzzt! Their Landorus is Ground/Flying — your Electric does NOTHING to
  it. Hit it with Water instead (2x). And Levitate means its Earthquake whiffs."
