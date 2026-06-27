/**
 * App.tsx — the Phase 4 smoke proof.
 *
 * This is NOT the real matchup UI (that's Phase 7). Its single job is to prove
 * the seam end-to-end IN A BROWSER: the same shared `runMatchup` the CLI uses
 * fetches data from the Python API (cross-origin, so CORS must work) and runs
 * the TypeScript engine *client-side*, then we render the advice it returns.
 *
 * Teams are hardcoded on purpose — inputs, game selection and styling come later.
 */

import { useCallback, useEffect, useState } from "react";
import { runMatchup, type RunMatchupResult } from "@metadex/analyzer/client";

const API_URL = import.meta.env.VITE_METADEX_API_URL ?? "http://localhost:8000";

// The canonical Gen-1 demo matchup (same one the CLI ships with).
const PROFILE_ID = "champions";
const MY_TEAM = ["Pikachu", "Onix"];
const ENEMY_TEAM = ["Staryu", "Charizard"];

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: RunMatchupResult };

export default function App() {
  const [state, setState] = useState<State>({ status: "loading" });

  const analyze = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await runMatchup({
        apiUrl: API_URL,
        profileId: PROFILE_ID,
        myTeam: MY_TEAM,
        enemyTeam: ENEMY_TEAM,
      });
      setState({ status: "ready", result });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => {
    void analyze();
  }, [analyze]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="text-yellow-300">Meta</span>Dex — matchup proof
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {MY_TEAM.join(", ")} <span className="text-slate-600">vs</span>{" "}
            {ENEMY_TEAM.join(", ")} · profile{" "}
            <code className="text-slate-300">{PROFILE_ID}</code>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Data from <code>{API_URL}</code>; math runs in your browser.
          </p>
        </header>

        {state.status === "loading" && (
          <p className="text-slate-400">Analyzing…</p>
        )}

        {state.status === "error" && (
          <div className="rounded-lg border border-red-800 bg-red-950/50 p-4">
            <p className="font-semibold text-red-300">Could not analyze.</p>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-red-200/80">
              {state.message}
            </pre>
            <p className="mt-2 text-xs text-red-200/60">
              Is the API running? <code>cd apps/api &amp;&amp; uv run uvicorn
              app.main:app --port 8000</code>
            </p>
          </div>
        )}

        {state.status === "ready" && <Result result={state.result} />}

        <button
          onClick={() => void analyze()}
          className="mt-6 rounded-md bg-yellow-300 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-yellow-200 transition"
        >
          Re-run
        </button>
      </div>
    </main>
  );
}

function Result({ result }: { result: RunMatchupResult }) {
  return (
    <div className="space-y-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">
        {result.game}
      </p>

      {result.bestLead && (
        <section className="rounded-lg border border-emerald-800 bg-emerald-950/40 p-4">
          <p className="font-semibold text-emerald-300">
            ✅ Lead with {cap(result.bestLead.name)}{" "}
            <span className="text-emerald-500/70 font-normal">
              (score {result.bestLead.score})
            </span>
          </p>
          <p className="mt-1 text-sm text-slate-300">{result.bestLead.reason}</p>
        </section>
      )}

      {result.worstToAvoid && (
        <section className="rounded-lg border border-amber-800 bg-amber-950/40 p-4">
          <p className="font-semibold text-amber-300">
            ⚠️ Avoid leading {cap(result.worstToAvoid.name)}{" "}
            <span className="text-amber-500/70 font-normal">
              (score {result.worstToAvoid.score})
            </span>
          </p>
          <p className="mt-1 text-sm text-slate-300">
            {result.worstToAvoid.reason}
          </p>
        </section>
      )}

      {result.notes.length > 0 && (
        <ul className="space-y-1">
          {result.notes.map((note, i) => (
            <li key={i} className="text-sm text-slate-400">
              💡 {note}
            </li>
          ))}
        </ul>
      )}

      {result.unknownNames.length > 0 && (
        <p className="text-sm text-slate-500">
          ❓ Not found (Gen 1 only for now): {result.unknownNames.join(", ")}
        </p>
      )}
    </div>
  );
}

function cap(name: string): string {
  return name.length ? name[0].toUpperCase() + name.slice(1) : name;
}
