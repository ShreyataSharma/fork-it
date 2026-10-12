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

export type CurateOptions = {
  // Recipes already on screen. They stay, and count toward the quotas and the cuisine cap.
  fixed?: Recipe[];
  // Only fill each level up to its quota from that level: no borrowing from the nearest level
  // and no relaxing the cuisine cap. Used for the first batch, so AI recipes can take the
  // slots it leaves empty.
  strict?: boolean;
};

// Pick up to 10 recipes: 4 easy, 3 medium, 3 hard, filling a short level from the nearest
// one. If the user picked cuisines, only recipes labeled with one of them are eligible.
// Otherwise each cuisine label is capped at MAX_PER_CUISINE, and unlabeled recipes can fill
// any slot; if the cap would leave fewer than 10, the rest are picked without it.
// Candidates are taken in input order, so Spoonacular recipes win over AI ones. Unless
// strict, with 10 or fewer eligible recipes all of them are returned.
export function curateRecipes(recipes: Recipe[], pickedCuisines: string[] = [], opts: CurateOptions = {}): Recipe[] {
  const fixed = opts.fixed ?? [];
  const pool = (pickedCuisines.length ? recipes.filter((r) => pickedCuisines.includes(r.cuisine)) : recipes).filter(
    (r) => !fixed.includes(r),
  );
  if (!opts.strict && fixed.length + pool.length <= CURATED_COUNT) return orderRecipes([...fixed, ...pool]);

  const chosen = new Set<Recipe>(fixed);
  const perCuisine = new Map<string, number>();
  for (const r of fixed) if (r.cuisine) perCuisine.set(r.cuisine, (perCuisine.get(r.cuisine) ?? 0) + 1);
  let capCuisines = pickedCuisines.length === 0;
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

  // Fill each level up to its quota, then (unless strict) what's still short from the nearest levels.
  const fill = () => {
    const short = {} as Record<Difficulty, number>;
    for (const lvl of LEVELS) {
      const have = Array.from(chosen).filter((r) => level(r) === lvl).length;
      short[lvl] = Math.max(0, DIFFICULTY_QUOTA[lvl] - have);
      short[lvl] -= takeFrom(lvl, short[lvl]);
    }
    if (opts.strict) return;
    for (const lvl of LEVELS) {
      for (const near of NEAREST[lvl]) {
        if (short[lvl] > 0) short[lvl] -= takeFrom(near, short[lvl]);
      }
    }
  };

  fill();
  if (!opts.strict && chosen.size < CURATED_COUNT && capCuisines) {
    capCuisines = false;
    fill();
  }

  return orderRecipes(Array.from(chosen));
}

// Slots per level that the curated list leaves for recipes of that level.
export function emptySlots(curated: Recipe[]): Partial<Record<Difficulty, number>> {
  const empty: Partial<Record<Difficulty, number>> = {};
  for (const lvl of LEVELS) {
    const n = DIFFICULTY_QUOTA[lvl] - curated.filter((r) => level(r) === lvl).length;
    if (n > 0) empty[lvl] = n;
  }
  return empty;
}
