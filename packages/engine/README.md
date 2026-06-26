# @metadex/engine

The deterministic core. Pure functions, zero AI, zero network. Every matchup and
stat number MetaDex shows comes from here, so it is fast, offline, and impossible
to hallucinate.

## What's inside

| File | Purpose |
|---|---|
| `type-chart.ts` | The full 18-type effectiveness chart (official Gen 6+). |
| `effectiveness.ts` | `effectiveness(moveType, defenderTypes)` -> multiplier (dual-type + immunities). |
| `stats.ts` | `calcStats(...)` -> final battle stats from base + EVs + IVs + nature. |
| `speed.ts` | Speed-tier ranking (who moves first). |
| `engine.test.ts` | 12 tests, all green. |

## Run the tests
```bash
pnpm install
pnpm --filter @metadex/engine test
```

## A real example the tests prove
```ts
import { effectiveness } from "./src/effectiveness";

effectiveness("Electric", ["Ground", "Flying"]); // 0  <- Landorus is IMMUNE to Electric
effectiveness("Water",    ["Ground", "Flying"]); // 2  <- THIS is how you hit Landorus
effectiveness("Rock",     ["Fire", "Flying"]);   // 4  <- why Charizard fears Rock
```

This is why the engine exists: an early mockup wrongly claimed Electric hits
Landorus 2x. It doesn't — Ground grants immunity. The engine never makes that
mistake.
