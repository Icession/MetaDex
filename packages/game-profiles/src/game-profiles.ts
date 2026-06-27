/**
 * game-profiles — the spine of multi-game support.
 *
 * THE IDEA
 * Every Pokemon game has different mechanics. Champions trains EV/IV stats
 * (fixed, not freely editable) and has held items set before battle, but NO
 * in-battle consumables. Scarlet/Violet also earns EVs and has held items,
 * abilities, and a Terastal gimmick. Pokemon GO uses a different CP/IV system.
 *
 * Instead of scattering "if (game === 'champions')" checks across the codebase,
 * each game declares ONE profile describing which mechanics exist. The engine and
 * the advisors read the profile and adapt. Adding a new game = adding a new
 * profile, with zero engine changes.
 *
 * RULE: engine code never hardcodes a game's rules. It asks the profile.
 */

// ----- building blocks --------------------------------------------------------

/** How a game lets the player influence a Pokemon's stats. */
export type StatSystem =
  | "ev_iv"        // mainline: 510 EV budget earned in-game + fixed IVs (0-31)
  | "free_points"  // Champions: freely allocate a point budget, edit anytime
  | "cp_iv";       // Pokemon GO: CP formula driven by IV spread + level

/** Battle gimmick available in a given era. */
export type Gimmick = "mega" | "zmove" | "dynamax" | "terastal" | "none";

export interface StatBudget {
  /** Total points the player can distribute (e.g. 510 EVs, or Champions' cap). */
  total: number;
  /** Max points allowed in a single stat (e.g. 252 EVs). null = no per-stat cap. */
  perStat: number | null;
}

/** Which advice modules are even meaningful for this game. */
export interface AdviceModules {
  matchup: boolean;       // type-effectiveness lead/avoid advice (always true)
  speedTiers: boolean;    // who-moves-first analysis
  statAllocation: boolean;// suggest an EV / free-point spread
  natureAdvisor: boolean; // suggest a nature
  itemAdvisor: boolean;   // suggest a held item
  moveAdvisor: boolean;   // suggest a 4-move set
}

// ----- the profile ------------------------------------------------------------

export interface GameProfile {
  id: string;             // "champions", "scarlet-violet", "go"
  displayName: string;
  era: string;            // generation / release line, for data lookups

  battleFormats: string[];// e.g. ["1v1", "2v2"]
  levelCap: number;

  statSystem: StatSystem;
  statBudget: StatBudget | null; // null when stats aren't player-allocated

  hasNatures: boolean;
  hasAbilities: boolean;
  hasHeldItems: boolean;
  hasInBattleItems: boolean;     // consumables you throw mid-battle
  /** Stats/natures editable any time outside battle (Champions = true). */
  editableOutsideBattle: boolean;

  gimmick: Gimmick;

  advice: AdviceModules;

  /** Optional override hook: species/forms legal in this game/regulation. */
  legalRosterRef?: string; // points at a roster table; absent = full dex
}

// ----- profile 1: Pokemon Champions ------------------------------------------
// Trained EV/IV stats + natures, held items set pre-battle (no in-battle
// consumables). Mega is back.

export const CHAMPIONS: GameProfile = {
  id: "champions",
  displayName: "Pokemon Champions",
  era: "champions-2026",

  battleFormats: ["1v1", "2v2"],
  levelCap: 100,

  statSystem: "ev_iv",
  statBudget: { total: 510, perStat: 252 }, // tune to the game's real cap

  hasNatures: true,
  hasAbilities: true,
  hasHeldItems: true,         // <- items set before battle
  hasInBattleItems: false,    // <- no mid-battle item throwing
  editableOutsideBattle: false,// <- stats are trained & fixed, not re-spec'd

  gimmick: "mega",

  advice: {
    matchup: true,
    speedTiers: true,
    statAllocation: true,   // EV-spread optimizer (trained, capped)
    natureAdvisor: true,
    itemAdvisor: true,      // <- items exist (set pre-battle)
    moveAdvisor: true,
  },
};

// ----- profile 2: Pokemon Scarlet / Violet -----------------------------------
// EVs are earned (not freely editable), held items + abilities exist, Terastal.

export const SCARLET_VIOLET: GameProfile = {
  id: "scarlet-violet",
  displayName: "Pokemon Scarlet & Violet",
  era: "gen9",

  battleFormats: ["1v1", "2v2"],
  levelCap: 100,

  statSystem: "ev_iv",
  statBudget: { total: 510, perStat: 252 },

  hasNatures: true,
  hasAbilities: true,
  hasHeldItems: true,         // <- items matter here
  hasInBattleItems: true,
  editableOutsideBattle: false,// <- EVs are trained, not re-spec'd freely

  gimmick: "terastal",

  advice: {
    matchup: true,
    speedTiers: true,
    statAllocation: true,   // EV-spread optimizer (earned, capped)
    natureAdvisor: true,
    itemAdvisor: true,      // <- now active
    moveAdvisor: true,
  },
};

// ----- registry ---------------------------------------------------------------

export const GAME_PROFILES: Record<string, GameProfile> = {
  [CHAMPIONS.id]: CHAMPIONS,
  [SCARLET_VIOLET.id]: SCARLET_VIOLET,
};

export function getProfile(id: string): GameProfile {
  const p = GAME_PROFILES[id];
  if (!p) throw new Error(`Unknown game profile: ${id}`);
  return p;
}

/**
 * Example of how an advisor consults the profile instead of hardcoding rules:
 *
 *   function shouldSuggestItem(profile: GameProfile) {
 *     return profile.hasHeldItems && profile.advice.itemAdvisor;
 *   }
 *
 * For Champions this now returns true (items are set before battle), so the UI
 * shows item advice. For Scarlet/Violet it also returns true. No engine changes.
 */
