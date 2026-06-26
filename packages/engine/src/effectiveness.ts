import type { PokemonType } from "./types";
import { TYPE_CHART } from "./type-chart";

/** Multiplier of one attacking type vs one defending type (1 if not listed). */
export function effectivenessVsType(attack: PokemonType, defend: PokemonType): number {
  return TYPE_CHART[attack][defend] ?? 1;
}

/**
 * Multiplier of an attacking move type vs a (possibly dual-type) defender.
 * Dual-type = product of both, so immunity from either type wins (-> 0).
 * e.g. Electric vs Ground/Flying = 0 (Ground immunity) x 2 (Flying) = 0.
 */
export function effectiveness(attack: PokemonType, defenderTypes: PokemonType[]): number {
  return defenderTypes.reduce((mult, t) => mult * effectivenessVsType(attack, t), 1);
}

/** Human label for a multiplier, for UI/coaching. */
export function effectivenessLabel(mult: number): string {
  if (mult === 0) return "no effect";
  if (mult >= 4) return "4x super effective";
  if (mult >= 2) return "super effective";
  if (mult <= 0.25) return "barely scratches";
  if (mult <= 0.5) return "not very effective";
  return "neutral";
}
