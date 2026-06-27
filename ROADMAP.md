# MetaDex — Project Roadmap

> MetaDex (Most Effective Tactic Available): an all-round Pokemon battle-analysis
> assistant with an original electric-themed AI mascot. Reads your lineup and the
> opponent's, gives mathematically-exact matchup/EV/move/item advice
> (deterministically), and narrates it in a lively in-character voice (via LLM).
> Multi-game, multi-platform, companion-first.

*Original name + original mascot — no Nintendo IP. Non-commercial / educational /
portfolio project.*

---

## Guiding rules (do not break these)

1. **The LLM never does math.** Type effectiveness, stats, damage, and speed are
   computed by a deterministic engine from a hardcoded source of truth. The LLM
   only *narrates* what the engine produces. This keeps it fast AND
   hallucination-free.
2. **One engine, many games.** Game-specific rules live in *game profiles*, never
   in engine code. The engine asks the profile what mechanics exist.
3. **Companion-first, overlay-second.** The screenshot to analyze companion flow
   is the universal baseline (every platform). The floating overlay is a
   desktop/Android enhancement. iOS cannot draw overlays over other apps.
4. **Capture behind an interface.** v1 = Tesseract OCR. Swappable to LLM-vision
   later via one config change.

---

## Architecture pillars

| Pillar | What it is | Tech |
|---|---|---|
| Data core | Local DB seeded from PokeAPI = source of truth (stats, types, moves, abilities, type chart). Cached, offline-capable. | PostgreSQL (Neon), seeded via PokeAPI |
| Deterministic engine | Pure functions: type effectiveness, final stats, damage ranges, speed tiers. Instant, testable, no AI. | TypeScript (shared package) |
| Game profiles | Per-game config declaring which mechanics exist + which advice applies. The spine of multi-game support. | TypeScript |
| AI layer | Two models behind one interface + router. Gemini Flash -> vision/extraction + cheap volume. Claude -> persona/coaching voice. | Gemini API + Claude API |
| Capture | Screenshot -> OCR/extraction -> reconcile names against DB -> exact stats. Throttled / on-demand, never a continuous loop. | Tesseract (v1) behind CaptureProvider |
| Shell + persona | Responsive companion app + Pokedex browser; optional overlay; original animated mascot reacting to battle state. | React + Vite + TS + Tailwind; Live2D/Rive (late) |

### Repo layout (polyglot monorepo)

```
metadex/
|-- apps/
|   |-- web/            # React + Vite + TS + Tailwind -- companion app + Pokedex
|   |-- api/            # FastAPI -- PokeAPI seeding, DB, AI orchestration
|-- packages/
|   |-- engine/         # TS: type chart, stat calc, damage, speed (pure, tested)
|   |-- game-profiles/  # TS: GameProfile schema + per-game configs
|   |-- data/           # seeded PokeAPI dataset (JSON/SQLite) + loader
|-- README.md
|-- CLAUDE.md
|-- ROADMAP.md
```

TS side uses pnpm workspaces; apps/api is its own Python project (uv/poetry).

---

## Build phases (each teaches a skill)

| # | Phase | You'll learn | Done when... |
|---|---|---|---|
| 1 | **Foundations** | system design, monorepo | Stack locked, repo scaffolded, game-profile schema defined |
| 2 | **Data core** | SQL, ETL, pure-function engineering, testing | PokeAPI seeded into DB; type engine + stat calc pass tests |
| 3 | **Game profiles** | strategy pattern, config-driven design | Champions + 1 more game both run through one engine |
| 4 | **Analyzer serving + web seam** | API design, caching, monorepo seams | Analysis served as a shared TS lib (client-side); FastAPI data layer cached; web smoke page renders advice in a browser |
| 5 | **AI layer** | LLM integration, prompt engineering, abstraction | Two-provider router returns structured + persona output |
| 6 | **Vision** | multimodal AI / OCR pipeline | Screenshot -> team JSON -> reconciled with DB |
| 7 | **Frontend** | React, state, responsive | Companion app + Pokedex wired to live API |
| 8 | **Overlay** | desktop/native bridges | Tauri (desktop) + Android floating window; iOS share-sheet fallback |
| 9 | **Persona polish** | Live2D/Rive animation | Mascot reacts to battle state |

---

## Deferred deliberately

- Live continuous screen-OCR (replaced by on-demand screenshot capture)
- Live2D animated mascot (CSS/Rive placeholder until Phase 9)
- Floating overlay (companion flow ships first)

---

## Platform reality

| Platform | Companion (screenshot->analyze) | Floating overlay |
|---|---|---|
| Web | yes (baseline) | n/a |
| Desktop (emulator) | yes | yes (Tauri overlay) |
| Android | yes | yes (with overlay permission) |
| iOS | yes (share sheet) | no (not allowed by Apple) |

---

## Decisions log

- **2v2/1v1 formats** supported from day one (Champions).
- **Engine in TypeScript** (shared package) for instant client-side math + offline. *(confirmed)*
- **Capture v1 = Tesseract** behind CaptureProvider. *(confirmed)*
- **Web companion app first.** *(confirmed)*
- **Name = MetaDex.** *(confirmed)*
- **Second validation game:** Scarlet/Violet (most mechanical contrast with Champions). *(default)*
- **Analysis runs client-side; Python is data-only.** *(confirmed, Phase 4)* The
  TS analyzer ships as a shared library (`@metadex/analyzer/client`) consumed by
  the web app + CLI; the engine math runs in the browser (instant, offline).
  Porting it to Python was rejected — it would create a second source of truth
  for the same numbers (breaks rules #1 and #2). This **revises** the original
  Phase 4 plan ("FastAPI serves matchup endpoints"): there is no matchup
  endpoint. The Phase 5 AI layer (Python) consumes the *already-computed*
  structured result via a `/narrate` seam, so the LLM still never does math.

---

## Current state

- Phase 1 (Foundations): DONE.
- Phase 2 (Data core): DONE. Engine (12 tests green), game-profiles, and the
  PokeAPI seeder ETL all complete. Seeder (`apps/api/app/seed`) loads base
  stats/types/abilities into SQLite — idempotent, disk-cached, rate-limited,
  logged; Gen 1 seeded + verified. `apps/api` scaffolded (FastAPI via uv).
- Phase 3 (First matchup analyzer): DONE. A data bridge (`POST /pokemon/batch`
  over a SQLite read layer) feeds engine-ready records to a pure TS analyzer
  (`packages/analyzer`) that computes type/speed matchups via the engine,
  consults the game profile (Champions vs Scarlet/Violet), and returns the best
  lead + worst to avoid with plain-English reasons. 4 tests green; a `cli.ts`
  runner drives it against the live API for a real Gen 1 demo. Both Champions
  and Scarlet/Violet run through the one engine — the multi-game proof for this
  phase. Caveat: offense uses STAB *typing* (no movesets seeded yet).
- Phase 4 (Analyzer serving + web seam): DONE. Settled the TS-analyzer /
  Python-API tension (see decisions log): analysis runs client-side as a shared
  library, Python stays data-only. Shipped `@metadex/analyzer/client` (the
  shared `runMatchup`, used by both CLI and web), an in-memory name cache on the
  data layer (repeat lookups skip SQLite), CORS for the browser, and a scaffolded
  `apps/web` (Vite + React + TS + Tailwind) whose smoke page renders real advice
  from a browser — proving browser → data API → TS engine end-to-end.
- NEXT: Phase 5 (AI layer / mascot narration over exact numbers via the
  `/narrate` seam) + seed movesets/full dex.

---

## Legal note

Pokemon names, sprites, and characters are Nintendo/Game Freak IP. MetaDex ships
with an original mascot and name, uses PokeAPI data under its fair-use terms,
stays non-commercial, and avoids hosting official sprites where an open/self-made
alternative exists. Frame publicly as an educational portfolio piece.
