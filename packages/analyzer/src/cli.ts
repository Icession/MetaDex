/**
 * cli.ts — the terminal front-end for the matchup advisor.
 *
 * All the fetch-then-analyze work now lives in the shared, reusable orchestrator
 * (`@metadex/analyzer/client`), so this file is just the CLI shell:
 *   1. parse the two teams + game from the command line
 *   2. call runMatchup (one round-trip to the data bridge, then the pure core)
 *   3. pretty-print the advice
 *
 * The web app uses the SAME runMatchup — this file no longer owns any network
 * code, it only owns argv parsing and console formatting.
 *
 * Run (from the repo root, with the API running on :8000):
 *   pnpm --filter @metadex/analyzer demo -- \
 *     --game champions --me "Pikachu,Onix" --vs "Staryu,Charizard"
 */

import { runMatchup, type RunMatchupResult } from "./client";

const API_URL = process.env.METADEX_API_URL ?? "http://localhost:8000";

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

// ----- pretty printing -------------------------------------------------------

function printResult(result: RunMatchupResult): void {
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

  const result = await runMatchup({ apiUrl: API_URL, profileId, myTeam, enemyTeam });
  printResult(result);
}

main().catch((err: unknown) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
