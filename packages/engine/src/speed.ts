import type { BaseStats } from "./types";

export interface SpeedEntry { name: string; speed: number; mine: boolean; }

/** Rank Pokemon by final Speed, fastest first (who moves first). */
export function speedTiers(entries: SpeedEntry[]): SpeedEntry[] {
  return [...entries].sort((a, b) => b.speed - a.speed);
}

/** Do I outspeed the target? (ignores priority/items/abilities for now) */
export function outspeeds(mine: BaseStats, theirs: BaseStats): boolean {
  return mine.spe > theirs.spe;
}
