import { describe, it, expect } from "vitest";
import { effectiveness } from "./effectiveness";
import { calcStats, NATURES } from "./stats";
import { speedTiers } from "./speed";
import type { BaseStats } from "./types";

describe("type effectiveness", () => {
  it("single type: Electric vs Water = 2x", () => {
    expect(effectiveness("Electric", ["Water"])).toBe(2);
  });

  it("immunity: Electric vs Ground = 0", () => {
    expect(effectiveness("Electric", ["Ground"])).toBe(0);
  });

  it("dual-type immunity wins: Electric vs Landorus (Ground/Flying) = 0", () => {
    // The earlier mockup wrongly said Electric hits Landorus 2x.
    // Ground's immunity zeroes it out -> Electric does NOTHING to Landorus.
    expect(effectiveness("Electric", ["Ground", "Flying"])).toBe(0);
  });

  it("the move that DOES hit Landorus: Water vs Ground/Flying = 2x", () => {
    expect(effectiveness("Water", ["Ground", "Flying"])).toBe(2);
  });

  it("4x weakness: Rock vs Charizard (Fire/Flying) = 4x", () => {
    expect(effectiveness("Rock", ["Fire", "Flying"])).toBe(4);
  });

  it("Garchomp's Ground vs Gholdengo (Steel/Ghost) = 2x", () => {
    expect(effectiveness("Ground", ["Steel", "Ghost"])).toBe(2);
  });

  it("Normal vs Ghost = 0 (no effect)", () => {
    expect(effectiveness("Normal", ["Ghost"])).toBe(0);
  });
});

describe("stat calculation (Garchomp @ lvl 100, max EVs/IVs)", () => {
  const garchompBase: BaseStats = { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 };

  it("Adamant 252 Atk = 394 (known competitive value)", () => {
    const s = calcStats({ base: garchompBase, evs: { atk: 252 }, nature: NATURES.Adamant });
    expect(s.atk).toBe(394);
  });

  it("neutral 252 Speed = 303", () => {
    const s = calcStats({ base: garchompBase, evs: { spe: 252 } });
    expect(s.spe).toBe(303);
  });

  it("252 HP = 420", () => {
    const s = calcStats({ base: garchompBase, evs: { hp: 252 } });
    expect(s.hp).toBe(420);
  });

  it("nature lowers the dumped stat (Adamant -> SpA at 0.9)", () => {
    const neutral = calcStats({ base: garchompBase });
    const adamant = calcStats({ base: garchompBase, nature: NATURES.Adamant });
    expect(adamant.spa).toBeLessThan(neutral.spa);
  });
});

describe("speed tiers", () => {
  it("orders fastest first", () => {
    const ranked = speedTiers([
      { name: "Rotom-Wash", speed: 86, mine: true },
      { name: "Dragapult", speed: 142, mine: true },
      { name: "Landorus", speed: 91, mine: false },
    ]);
    expect(ranked.map((e) => e.name)).toEqual(["Dragapult", "Landorus", "Rotom-Wash"]);
  });
});
