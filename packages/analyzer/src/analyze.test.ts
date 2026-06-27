import { describe, test, expect } from "vitest";
import { analyzeMatchup, type PokemonData } from "./index";

/**
 * Fixtures: hand-built stand-in records (NOT loaded from the DB) so these tests
 * are pure and deterministic. Stats/types mirror real Gen 1 mons only so the
 * expected type interactions are easy to reason about:
 *   - pikachu  (Electric)      hits Water/Flying super-effectively
 *   - onix     (Rock/Ground)   is hit 4x by Water (2x Rock * 2x Ground)
 *   - staryu   (Water)         the Water attacker
 *   - charizard(Fire/Flying)   Electric hits its Flying for 2x
 */
const FIXTURES: Record<string, PokemonData> = {
  pikachu:   { id: 25,  name: "pikachu",   types: ["Electric"],       base: { hp: 35, atk: 55, def: 40,  spa: 50,  spd: 50, spe: 90 } },
  onix:      { id: 95,  name: "onix",      types: ["Rock", "Ground"], base: { hp: 35, atk: 45, def: 160, spa: 30,  spd: 45, spe: 70 } },
  staryu:    { id: 120, name: "staryu",    types: ["Water"],          base: { hp: 30, atk: 45, def: 55,  spa: 70,  spd: 55, spe: 85 } },
  charizard: { id: 6,   name: "charizard", types: ["Fire", "Flying"], base: { hp: 78, atk: 84, def: 78,  spa: 109, spd: 85, spe: 100 } },
};

/** Injected lookup over the fixtures (case-insensitive, like the real bridge). */
const lookup = (name: string): PokemonData | undefined => FIXTURES[name.toLowerCase()];

describe("analyzeMatchup (Champions)", () => {
  const run = () =>
    analyzeMatchup({
      profileId: "champions",
      myTeam: ["Pikachu", "Onix", "Mewthree"], // Mewthree is intentionally unknown
      enemyTeam: ["Staryu", "Charizard"],
      lookup,
    });

  test("picks the best lead and explains it by typing", () => {
    const { bestLead } = run();
    // Pikachu's Electric is super-effective into both enemies and it's fast;
    // Onix is weak to Staryu's Water, so Pikachu wins the score.
    expect(bestLead?.name).toBe("pikachu");
    expect(bestLead?.reason).toContain("Electric");
    expect(bestLead?.reason).toContain("super-effective");
  });

  test("picks the worst to avoid and cites the threat", () => {
    const { bestLead, worstToAvoid } = run();
    // Onix is hit 4x by Staryu's Water — the riskiest lead.
    expect(worstToAvoid?.name).toBe("onix");
    expect(worstToAvoid?.reason).toContain("4x");
    // Sanity: lead and avoid must be different Pokemon.
    expect(worstToAvoid?.name).not.toBe(bestLead?.name);
    // And the lead must score higher than the avoid.
    expect(bestLead!.score).toBeGreaterThan(worstToAvoid!.score);
  });

  test("reports names it couldn't resolve instead of throwing", () => {
    const { unknownNames } = run();
    expect(unknownNames).toEqual(["Mewthree"]);
  });

  test("surfaces the Champions held-item note (profile-driven)", () => {
    const { notes } = run();
    // Champions was corrected to HAVE held items, so the analyzer must remind
    // the player to give their lead one. This proves the profile fix flows
    // through to advice.
    expect(notes.some((n) => n.includes("Held items are set before battle"))).toBe(true);
  });
});
