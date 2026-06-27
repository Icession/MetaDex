/**
 * analyzeMatchup — MetaDex's first piece of real advice.
 *
 * Given my team and the enemy team (by name), it decides the best Pokemon to
 * LEAD with and the worst one to AVOID leading, each with a short plain-English
 * reason. It is PURE: all the math comes from @metadex/engine, the rules come
 * from @metadex/game-profiles, and the data arrives through an injected
 * `lookup` function — so this file never touches a DB, a network, or an AI.
 *
 * HONEST LIMITATION: no movesets are seeded yet, so "offense" is approximated
 * from each Pokemon's own STAB *typing*, not its actual moves. Every reason
 * therefore talks about "typing", never a specific attack.
 */

import {
  effectiveness,
  calcStats,
  TYPE_CHART,
  type PokemonType,
  type BaseStats,
} from "@metadex/engine";
import { getProfile, type GameProfile } from "@metadex/game-profiles";

// ----- public shapes ---------------------------------------------------------

/** One Pokemon as the data bridge (POST /pokemon/batch) returns it. */
export interface PokemonData {
  id: number;
  name: string;
  types: string[];      // ["Electric"] or ["Grass", "Poison"]
  base: BaseStats;      // hp, atk, def, spa, spd, spe
}

/** Injected data source: name -> record, or undefined if not seeded. Sync so
 *  the core stays pure & testable; the CLI pre-fetches a team into a Map. */
export type Lookup = (name: string) => PokemonData | undefined;

export interface AnalyzeInput {
  profileId: string;    // "champions", "scarlet-violet"
  myTeam: string[];     // names (any casing)
  enemyTeam: string[];  // names (any casing)
  lookup: Lookup;
}

/** A single recommendation. `score` is the engine-derived matchup score. */
export interface Pick {
  name: string;
  score: number;
  reason: string;
}

export interface MatchupResult {
  game: string;             // profile.displayName
  bestLead: Pick | null;    // null if either team had no resolvable Pokemon
  worstToAvoid: Pick | null;// null if my team has fewer than 2 candidates
  unknownNames: string[];   // names the lookup couldn't resolve
  notes: string[];          // profile-driven reminders (items, gimmick)
}

// ----- type narrowing --------------------------------------------------------

// The DB stores canonical type names, but they arrive typed as plain strings.
// We validate against the engine's own type chart (its 18 keys) instead of
// hardcoding a list, so a bad value is dropped rather than trusted blindly.
const TYPE_SET = new Set<string>(Object.keys(TYPE_CHART));

function toTypes(raw: string[]): PokemonType[] {
  return raw.filter((t): t is PokemonType => TYPE_SET.has(t));
}

// ----- a resolved combatant --------------------------------------------------

interface Mon {
  data: PokemonData;
  types: PokemonType[];
  /** Final Speed at a neutral baseline (we don't know real EVs/nature). */
  finalSpe: number;
}

function toMon(data: PokemonData, profile: GameProfile): Mon {
  // Baseline: profile's level cap, neutral nature, 0 EVs, max IVs. This is the
  // fairest stand-in when we don't know the opponent's real training spread.
  const finalSpe = calcStats({ base: data.base, level: profile.levelCap }).spe;
  return { data, types: toTypes(data.types), finalSpe };
}

// ----- the per-Pokemon evaluation (the "why" behind the score) ---------------

interface Pairing {
  mult: number;
  myType: PokemonType | null;     // which of MY types did best on offense
  enemyType: PokemonType | null;  // which ENEMY type hit hardest on defense
  enemyName: string;
}

interface Evaluation {
  score: number;
  offense: number;     // avg best multiplier MY typing lands on the enemy team
  threat: number;      // avg best multiplier the enemy team lands on ME
  best: Pairing;       // the single strongest offensive pairing (for the reason)
  worst: Pairing;      // the single nastiest incoming pairing (for the reason)
  outspeedCount: number;
  total: number;       // enemy team size
}

/** Score one of my Pokemon against the whole enemy team. */
function evaluate(me: Mon, enemies: Mon[]): Evaluation {
  let offenseSum = 0;
  let best: Pairing = { mult: -1, myType: null, enemyType: null, enemyName: "" };

  let threatSum = 0;
  let worst: Pairing = { mult: -1, myType: null, enemyType: null, enemyName: "" };

  let outspeedCount = 0;

  for (const e of enemies) {
    // Offense: best multiplier any of MY types gets on THIS enemy.
    let bestHere = 0;
    let bestType: PokemonType | null = null;
    for (const t of me.types) {
      const m = effectiveness(t, e.types);
      if (m > bestHere) { bestHere = m; bestType = t; }
    }
    offenseSum += bestHere;
    if (bestHere > best.mult) {
      best = { mult: bestHere, myType: bestType, enemyType: null, enemyName: e.data.name };
    }

    // Defense: best multiplier any of THEIR types gets on ME (= the threat).
    let worstHere = 0;
    let worstType: PokemonType | null = null;
    for (const t of e.types) {
      const m = effectiveness(t, me.types);
      if (m > worstHere) { worstHere = m; worstType = t; }
    }
    threatSum += worstHere;
    if (worstHere > worst.mult) {
      worst = { mult: worstHere, myType: null, enemyType: worstType, enemyName: e.data.name };
    }

    if (me.finalSpe > e.finalSpe) outspeedCount++;
  }

  const total = enemies.length;
  const offense = offenseSum / total;
  const threat = threatSum / total;
  const speedFraction = outspeedCount / total;

  // Balanced score: reward hitting them, punish being hit, break ties on speed.
  // Speed is weighted lightly (0.5) so it nudges rather than dominates.
  const score = offense - threat + 0.5 * speedFraction;

  return { score, offense, threat, best, worst, outspeedCount, total };
}

// ----- turning numbers into plain English ------------------------------------

function fmt(m: number): string {
  return (Number.isInteger(m) ? m.toString() : m.toFixed(2)) + "x";
}

/** Short verdict word for a multiplier (kept separate from the engine's UI
 *  label so the reason text reads naturally next to the number). */
function verdict(m: number): string {
  if (m === 0) return "does nothing";
  if (m >= 4) return "quad-effective";
  if (m >= 2) return "super-effective";
  if (m <= 0.5) return "resisted";
  return "neutral";
}

function cap(name: string): string {
  return name.length ? name[0].toUpperCase() + name.slice(1) : name;
}

function leadReason(ev: Evaluation, profile: GameProfile): string {
  const parts: string[] = [];

  if (ev.best.mult >= 2 && ev.best.myType) {
    parts.push(
      `its ${ev.best.myType} typing is ${verdict(ev.best.mult)} (${fmt(ev.best.mult)}) into ${cap(ev.best.enemyName)}`,
    );
  } else if (ev.best.mult > 0) {
    parts.push(`its typing is at best neutral (${fmt(ev.best.mult)}) against this team`);
  } else {
    parts.push(`its typing can't touch this team`);
  }

  if (profile.advice.speedTiers) {
    if (ev.outspeedCount === ev.total) parts.push(`and it outspeeds all ${ev.total}`);
    else if (ev.outspeedCount > 0) parts.push(`and it outspeeds ${ev.outspeedCount}/${ev.total}`);
    else parts.push(`but it's slower than the whole team`);
  }

  const text = parts.join(" ");
  return cap(text) + ".";
}

function avoidReason(ev: Evaluation): string {
  if (ev.worst.mult >= 2 && ev.worst.enemyType) {
    return (
      `${cap(ev.worst.enemyName)}'s ${ev.worst.enemyType} typing hits it ${fmt(ev.worst.mult)} ` +
      `(${verdict(ev.worst.mult)}) — by typing alone it's the riskiest lead.`
    );
  }
  if (ev.offense === 0) {
    return `Its typing can't touch this team (best ${fmt(ev.best.mult)}), so it brings no pressure.`;
  }
  return `It has the weakest overall matchup here (offense ${fmt(ev.offense)}, incoming ${fmt(ev.threat)}).`;
}

// ----- profile-driven notes --------------------------------------------------

function profileNotes(profile: GameProfile): string[] {
  const notes: string[] = [];

  // The gimmick is the most visible cross-game difference (mega vs terastal).
  if (profile.gimmick !== "none") {
    notes.push(`${profile.displayName}: a ${profile.gimmick} gimmick is available — keep it in mind.`);
  }

  // Only surfaces when the game actually has items AND wants item advice. This
  // now fires for Champions because we corrected its profile to have items.
  if (profile.hasHeldItems && profile.advice.itemAdvisor) {
    notes.push(`Held items are set before battle — give your lead one.`);
  }

  return notes;
}

// ----- the analyzer ----------------------------------------------------------

export function analyzeMatchup(input: AnalyzeInput): MatchupResult {
  const profile = getProfile(input.profileId);
  const unknownNames: string[] = [];

  const resolve = (names: string[]): Mon[] => {
    const mons: Mon[] = [];
    for (const name of names) {
      const data = input.lookup(name);
      if (data === undefined) unknownNames.push(name);
      else mons.push(toMon(data, profile));
    }
    return mons;
  };

  const mine = resolve(input.myTeam);
  const enemies = resolve(input.enemyTeam);
  const notes = profileNotes(profile);

  // Nothing to compare against -> return the notes + unknowns, no picks.
  if (mine.length === 0 || enemies.length === 0) {
    return { game: profile.displayName, bestLead: null, worstToAvoid: null, unknownNames, notes };
  }

  const evals = mine.map((mon) => ({ mon, ev: evaluate(mon, enemies) }));

  let best = evals[0];
  let worst = evals[0];
  for (const e of evals) {
    if (e.ev.score > best.ev.score) best = e;
    if (e.ev.score < worst.ev.score) worst = e;
  }

  const bestLead: Pick = {
    name: best.mon.data.name,
    score: Math.round(best.ev.score * 100) / 100,
    reason: leadReason(best.ev, profile),
  };

  // With only one candidate, "best" and "worst" would be the same Pokemon —
  // calling it both is noise, so we omit the avoid pick.
  const worstToAvoid: Pick | null =
    mine.length < 2
      ? null
      : {
          name: worst.mon.data.name,
          score: Math.round(worst.ev.score * 100) / 100,
          reason: avoidReason(worst.ev),
        };

  return { game: profile.displayName, bestLead, worstToAvoid, unknownNames, notes };
}
