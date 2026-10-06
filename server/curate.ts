import type { Difficulty, Recipe } from "../shared/recipes";

export const CURATED_COUNT = 10;
export const DIFFICULTY_QUOTA: Record<Difficulty, number> = { Easy: 4, Medium: 3, Hard: 3 };
// With no cuisine picked, no cuisine label may appear more than this many times.
export const MAX_PER_CUISINE = 2;

const LEVELS: Difficulty[] = ["Easy", "Medium", "Hard"];
// Where to fill a short level from, nearest first. Medium is equally near both; Easy goes first.
const NEAREST: Record<Difficulty, Difficulty[]> = {
  Easy: ["Medium", "Hard"],
  Medium: ["Easy", "Hard"],
  Hard: ["Medium", "Easy"],
};

// Unlabeled difficulty is treated as Medium.
function level(r: Recipe): Difficulty {
  return r.difficulty ?? "Medium";
}

// Spoonacular first, then AI; easy to hard within each group (stable).
export function orderRecipes(recipes: Recipe[]): Recipe[] {
  const byLevel = (a: Recipe, b: Recipe) => LEVELS.indexOf(level(a)) - LEVELS.indexOf(level(b));
  return [
    ...recipes.filter((r) => r.source === "spoonacular").sort(byLevel),
    ...recipes.filter((r) => r.source === "ai").sort(byLevel),
  ];
}

// Pick up to 10 recipes: 4 easy, 3 medium, 3 hard, filling a short level from the nearest
// one. If the user picked cuisines, only recipes labeled with one of them are eligible.
// Otherwise each cuisine label is capped at MAX_PER_CUISINE, and unlabeled recipes can fill
// any slot. Candidates are taken in input order, so Spoonacular recipes win over AI ones.
// With fewer than 10 eligible recipes, all of them are returned.
export function curateRecipes(recipes: Recipe[], pickedCuisines: string[] = []): Recipe[] {
  const pool = pickedCuisines.length ? recipes.filter((r) => pickedCuisines.includes(r.cuisine)) : recipes;
  if (pool.length < CURATED_COUNT) return orderRecipes(pool);

  const chosen = new Set<Recipe>();
  const perCuisine = new Map<string, number>();
  const capCuisines = pickedCuisines.length === 0;
  const fits = (r: Recipe) => !capCuisines || !r.cuisine || (perCuisine.get(r.cuisine) ?? 0) < MAX_PER_CUISINE;

  // Take up to n unchosen recipes of the given level; returns how many were taken.
  const takeFrom = (lvl: Difficulty, n: number): number => {
    let taken = 0;
    for (const r of pool) {
      if (taken >= n || chosen.size >= CURATED_COUNT) break;
      if (chosen.has(r) || level(r) !== lvl || !fits(r)) continue;
      chosen.add(r);
      if (r.cuisine) perCuisine.set(r.cuisine, (perCuisine.get(r.cuisine) ?? 0) + 1);
      taken++;
    }
    return taken;
  };

  const short = {} as Record<Difficulty, number>;
  for (const lvl of LEVELS) short[lvl] = DIFFICULTY_QUOTA[lvl] - takeFrom(lvl, DIFFICULTY_QUOTA[lvl]);
  for (const lvl of LEVELS) {
    for (const near of NEAREST[lvl]) {
      if (short[lvl] > 0) short[lvl] -= takeFrom(near, short[lvl]);
    }
  }

  return orderRecipes(Array.from(chosen));
}
