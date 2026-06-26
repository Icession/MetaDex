/** The 18 Pokemon types. */
export type PokemonType =
  | "Normal" | "Fire" | "Water" | "Electric" | "Grass" | "Ice"
  | "Fighting" | "Poison" | "Ground" | "Flying" | "Psychic" | "Bug"
  | "Rock" | "Ghost" | "Dragon" | "Dark" | "Steel" | "Fairy";

/** The six battle stats. */
export type Stat = "hp" | "atk" | "def" | "spa" | "spd" | "spe";

/** A Pokemon's base stats (from the data core / PokeAPI). */
export type BaseStats = Record<Stat, number>;

/** Per-stat training points (EVs in mainline; free points in Champions). */
export type StatSpread = Partial<Record<Stat, number>>;

/** Individual values, 0-31 in mainline. */
export type IVs = Partial<Record<Stat, number>>;

/** A nature raises one stat 10% and lowers another 10%. Neutral = both undefined. */
export interface Nature {
  name: string;
  plus?: Exclude<Stat, "hp">;   // HP is never affected by nature
  minus?: Exclude<Stat, "hp">;
}
