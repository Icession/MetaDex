import type { BaseStats, Stat, StatSpread, IVs, Nature } from "./types";

const clampIV = (v: number | undefined) => Math.min(31, Math.max(0, v ?? 31));
const ev = (v: number | undefined) => Math.max(0, v ?? 0);

function natureMod(nature: Nature | undefined, stat: Stat): number {
  if (!nature || stat === "hp") return 1;
  if (nature.plus === stat) return 1.1;
  if (nature.minus === stat) return 0.9;
  return 1;
}

/** HP uses a different formula from the other five stats. */
function calcHP(base: number, iv: number, evv: number, level: number): number {
  return Math.floor(((2 * base + iv + Math.floor(evv / 4)) * level) / 100) + level + 10;
}

function calcOther(base: number, iv: number, evv: number, level: number, mod: number): number {
  const inner = Math.floor(((2 * base + iv + Math.floor(evv / 4)) * level) / 100) + 5;
  return Math.floor(inner * mod);
}

export interface CalcInput {
  base: BaseStats;
  evs?: StatSpread;
  ivs?: IVs;
  nature?: Nature;
  level?: number; // default 100
}

/** Compute final battle stats. The canonical mainline formula. */
export function calcStats(input: CalcInput): BaseStats {
  const level = input.level ?? 100;
  const out = {} as BaseStats;
  (["hp", "atk", "def", "spa", "spd", "spe"] as Stat[]).forEach((s) => {
    const b = input.base[s];
    const iv = clampIV(input.ivs?.[s]);
    const evv = ev(input.evs?.[s]);
    out[s] = s === "hp"
      ? calcHP(b, iv, evv, level)
      : calcOther(b, iv, evv, level, natureMod(input.nature, s));
  });
  return out;
}

/** A few common natures to start with. */
export const NATURES: Record<string, Nature> = {
  Adamant: { name: "Adamant", plus: "atk", minus: "spa" },
  Modest:  { name: "Modest",  plus: "spa", minus: "atk" },
  Jolly:   { name: "Jolly",   plus: "spe", minus: "spa" },
  Timid:   { name: "Timid",   plus: "spe", minus: "atk" },
  Bold:    { name: "Bold",    plus: "def", minus: "atk" },
  Hardy:   { name: "Hardy" }, // neutral
};
