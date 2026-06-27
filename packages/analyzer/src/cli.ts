/**
 * cli.ts — the one place network lives.
 *
 * Wires the live data bridge (POST /pokemon/batch) to the pure analyzer:
 *   1. parse the two teams from the command line
 *   2. fetch every name from the API in ONE round-trip
 *   3. build a sync Map-backed lookup and hand it to analyzeMatchup
 *   4. print the advice
 *
 * The analyzer stays pure; this file does the I/O so the core never has to.
 *
 * Run (from the repo root, with the API running on :8000):
 *   pnpm --filter @metadex/analyzer demo -- \
 *     --game champions --me "Pikachu,Onix" --vs "Staryu,Charizard"
 */

import { analyzeMatchup, type PokemonData } from "./index";

const API_URL = process.env.METADEX_API_URL ?? "http://localhost:8000";

interface BatchResponse {
  found: PokemonData[];
  missing: string[];
}

// ----- argument parsing ------------------------------------------------------

/** Pull `--flag value` pairs out of argv into a simple map. */
function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") continue; // the pnpm/npm argument separator, not a flag
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = "true"; // bare flag, e.g. --help
      }
    }
  }
  return out;
}

/** "Pikachu, Onix" -> ["Pikachu", "Onix"] (trimmed, blanks dropped). */
function parseTeam(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

const USAGE = `
MetaDex matchup demo

Usage:
  pnpm --filter @metadex/analyzer demo -- --game <id> --me "A,B" --vs "C,D"

Options:
  --game   Game profile id: "champions" or "scarlet-violet"  (default: champions)
  --me     Your team, comma-separated names                  (required)
  --vs     The enemy team, comma-separated names             (required)
  --help   Show this message

Notes:
  - Only Gen 1 (the 151 seeded) Pokemon resolve right now.
  - The API must be running:  cd apps/api && uv run uvicorn app.main:app
  - Override the API URL with METADEX_API_URL.
`.trim();

// ----- the data bridge call --------------------------------------------------

async function fetchTeams(names: string[]): Promise<BatchResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/pokemon/batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ names }),
    });
  } catch {
    throw new Error(
      `Could not reach the API at ${API_URL}. Is it running?\n` +
        `  cd apps/api && uv run uvicorn app.main:app`,
    );
  }
  if (!res.ok) {
    throw new Error(`API returned ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as BatchResponse;
}

// ----- pretty printing -------------------------------------------------------

function printResult(result: ReturnType<typeof analyzeMatchup>): void {
  console.log(`\n=== MetaDex matchup — ${result.game} ===\n`);

  if (result.bestLead) {
    console.log(`✅ Lead with: ${result.bestLead.name}  (score ${result.bestLead.score})`);
    console.log(`   ${result.bestLead.reason}\n`);
  }
  if (result.worstToAvoid) {
    console.log(`⚠️  Avoid leading: ${result.worstToAvoid.name}  (score ${result.worstToAvoid.score})`);
    console.log(`   ${result.worstToAvoid.reason}\n`);
  }
  if (!result.bestLead) {
    console.log("No matchup could be computed (one team had no resolvable Pokemon).\n");
  }

  for (const note of result.notes) {
    console.log(`💡 ${note}`);
  }
  if (result.unknownNames.length > 0) {
    console.log(`\n❓ Not found (Gen 1 only for now): ${result.unknownNames.join(", ")}`);
  }
  console.log("");
}

// ----- main ------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(USAGE);
    return;
  }

  const profileId = args.game ?? "champions";
  const myTeam = parseTeam(args.me);
  const enemyTeam = parseTeam(args.vs);

  if (myTeam.length === 0 || enemyTeam.length === 0) {
    console.error("Both --me and --vs are required.\n");
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  // One round-trip for every name on both teams.
  const { found } = await fetchTeams([...myTeam, ...enemyTeam]);

  // Build the sync lookup the pure core expects: name -> record.
  const byName = new Map(found.map((p) => [p.name.toLowerCase(), p]));
  const lookup = (name: string): PokemonData | undefined => byName.get(name.toLowerCase());

  const result = analyzeMatchup({ profileId, myTeam, enemyTeam, lookup });
  printResult(result);
}

main().catch((err: unknown) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
