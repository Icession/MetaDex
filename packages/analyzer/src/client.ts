/**
 * client.ts — the shared IMPURE orchestrator (the one place network lives).
 *
 * This is the seam that makes the matchup advisor usable by ANY JS/TS caller —
 * the CLI today, the web app next — without each one re-implementing the
 * fetch-then-analyze dance. It does exactly three things:
 *   1. fetch every name on both teams from the data bridge in ONE round-trip
 *   2. build the sync Map-backed `lookup` the pure core expects
 *   3. run `analyzeMatchup` and return its result (+ which names were missing)
 *
 * It is deliberately kept OFF the package's main entry (`index.ts`), which stays
 * pure / no-I/O. Import the pure analyzer from "@metadex/analyzer"; import this
 * network wrapper from "@metadex/analyzer/client". That split is what lets the
 * core bundle for the browser and stay trivially testable.
 */

import {
  analyzeMatchup,
  type MatchupResult,
  type PokemonData,
} from "./index";

/** Shape the data bridge (POST /pokemon/batch) returns. */
interface BatchResponse {
  found: PokemonData[];
  missing: string[];
}

export interface RunMatchupOptions {
  /** Base URL of the MetaDex data API, e.g. "http://localhost:8000". */
  apiUrl: string;
  /** Game profile id: "champions" | "scarlet-violet". */
  profileId: string;
  /** Your team — names, any casing. */
  myTeam: string[];
  /** The enemy team — names, any casing. */
  enemyTeam: string[];
  /**
   * Injectable fetch, defaulting to the global. Lets a test or a non-browser
   * host swap in its own transport without this module reaching for `process`
   * or any Node-only API (keeps it browser-safe).
   */
  fetchImpl?: typeof fetch;
}

/** The matchup result plus the names the data bridge couldn't resolve. */
export interface RunMatchupResult extends MatchupResult {
  /** Names the API had no record for (its `missing`). Distinct from the
   *  analyzer's own `unknownNames`, though in practice they coincide. */
  missing: string[];
}

/**
 * Fetch both teams from the data bridge and run the pure analyzer over them.
 *
 * Throws a friendly Error if the API is unreachable or returns non-2xx, so a
 * caller (CLI or UI) can show one clear message instead of a raw network error.
 */
export async function runMatchup(
  opts: RunMatchupOptions,
): Promise<RunMatchupResult> {
  const { apiUrl, profileId, myTeam, enemyTeam } = opts;
  const doFetch = opts.fetchImpl ?? fetch;

  const names = [...myTeam, ...enemyTeam];

  let res: Response;
  try {
    res = await doFetch(`${apiUrl}/pokemon/batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ names }),
    });
  } catch {
    throw new Error(
      `Could not reach the MetaDex API at ${apiUrl}. Is it running?\n` +
        `  cd apps/api && uv run uvicorn app.main:app --port 8000`,
    );
  }

  if (!res.ok) {
    throw new Error(`API returned ${res.status} ${res.statusText}`);
  }

  const { found, missing } = (await res.json()) as BatchResponse;

  // Build the sync lookup the pure core expects: name -> record.
  const byName = new Map(found.map((p) => [p.name.toLowerCase(), p]));
  const lookup = (name: string): PokemonData | undefined =>
    byName.get(name.toLowerCase());

  const result = analyzeMatchup({ profileId, myTeam, enemyTeam, lookup });
  return { ...result, missing };
}
