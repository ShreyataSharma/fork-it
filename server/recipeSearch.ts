import type { Difficulty, Recipe, RecipeSearchRequest } from "../shared/recipes";
import { haikuTimer, planAngles, writeAiRecipe, type AiAttempt, type RecipeAngle } from "./aiRecipes";
import { anthropicStats } from "./clients/anthropic";
import { curateRecipes, emptySlots, MAX_PER_CUISINE } from "./curate";
import { jevStats, labelRecipes } from "./jev";
import { fetchSpoonacularRecipes, liveSpoonacularSearch, type SpoonacularSearch } from "./recipes";

// The AI part of a search (Haiku generation and its Jev checks) stops after this long and the
// search returns what has passed by then.
export const AI_TIME_LIMIT_MS = 20_000;
// Extra AI calls fired at the start, beyond one per empty slot, to cover recipes that fail
// their checks. Recipes that pass after every slot is filled are dropped.
export const AI_EXTRA_CALLS = 2;

export type SearchTiming = {
  // Waiting on the Spoonacular API (or reading a fixture).
  spoonacularMs: number;
  // Wall-clock time with a Jev request in flight. Overlaps Haiku while AI recipes are checked.
  jevMs: number;
  // Wall-clock time with a Haiku generation in flight.
  haikuMs: number;
  // Until the first batch (the curated Spoonacular recipes) is ready to show.
  firstRecipesMs: number;
  totalMs: number;
};

// One AI recipe that passed, with when it was sent to the client. `overCap` marks a recipe
// taken from the held list after the calls ended, so its cuisine may exceed MAX_PER_CUISINE.
export type AiArrival = { recipe: Recipe; angle: RecipeAngle; atMs: number; overCap?: boolean };

export type RecipeSearchResult = {
  // The final list: first batch, then AI recipes in arrival order, then any leftover
  // Spoonacular recipes for slots AI didn't fill.
  recipes: Recipe[];
  // The first batch shown: curated Spoonacular recipes, before any AI recipe exists.
  firstRecipes: Recipe[];
  // Every recipe that reached the curator: Spoonacular, then AI.
  candidates: Recipe[];
  counts: { spoonacularFetched: number; spoonacular: number; ai: number };
  // Every AI attempt, each with the angle it was written at.
  aiAttempts: AiAttempt[];
  // Empty slots per level that AI recipes were asked to fill.
  aiRequested: Partial<Record<Difficulty, number>>;
  // Haiku calls made: one per empty slot plus AI_EXTRA_CALLS.
  aiCalls: number;
  aiArrivals: AiArrival[];
  // AI recipes that passed every check but were refused only by the cuisine cap and were not
  // needed to fill a slot.
  aiHeldUnused: Recipe[];
  // True if AI_TIME_LIMIT_MS ran out with slots still empty.
  aiTimedOut: boolean;
  aiError?: string;
  // Anthropic 429 responses during this search, including ones the SDK retried.
  rateLimited: number;
  timing: SearchTiming;
};

export type SearchOptions = {
  spoonacularSearch?: SpoonacularSearch;
  // Called once with the first batch. `aiPending` is true when AI recipes will follow.
  onFirstRecipes?: (recipes: Recipe[], aiPending: boolean) => void;
  // Called with each AI recipe as soon as it passes its checks.
  onAiRecipe?: (recipe: Recipe) => void;
};

// Two phases. First, Spoonacular recipes are fetched, labeled by Jev, and curated strictly by
// the difficulty quotas; that list goes out at once through onFirstRecipes. Then one Haiku call
// per empty slot, plus AI_EXTRA_CALLS, run in parallel within AI_TIME_LIMIT_MS, each with its
// own angle. Each recipe that passes its checks goes out through onAiRecipe if its difficulty
// still has an open slot, its name is new, and its Jev cuisine label fits the picked cuisine or
// the cap. Once every slot is filled the remaining calls stop. Recipes refused only by the cap
// are held; when the calls end (all returned, or the time limit), empty slots are filled from
// them, fewest-on-screen cuisine first, and they stream like the others. Finally, slots still
// empty are filled from leftover Spoonacular recipes.
export async function findRecipes(req: RecipeSearchRequest, opts: SearchOptions = {}): Promise<RecipeSearchResult> {
  const started = Date.now();
  const jevStart = jevStats.busyMs;
  const haikuStart = haikuTimer.ms;
  const rateLimitedStart = anthropicStats.rateLimited;
  let spoonacularMs = 0;
  const search = opts.spoonacularSearch ?? liveSpoonacularSearch;
  const timedSearch: SpoonacularSearch = async (r) => {
    const t = Date.now();
    try {
      return await search(r);
    } finally {
      spoonacularMs += Date.now() - t;
    }
  };
  const timing = (firstRecipesMs: number): SearchTiming => ({
    spoonacularMs,
    jevMs: jevStats.busyMs - jevStart,
    haikuMs: haikuTimer.ms - haikuStart,
    firstRecipesMs,
    totalMs: Date.now() - started,
  });

  const spoon = await fetchSpoonacularRecipes(req, timedSearch);
  const spoonRecipes = await labelRecipes(spoon.recipes);
  const counts = { spoonacularFetched: spoon.fetched, spoonacular: spoon.recipes.length, ai: 0 };

  const firstRecipes = curateRecipes(spoonRecipes, req.cuisine, { strict: true });
  const aiRequested = emptySlots(firstRecipes);
  const slots = (Object.keys(aiRequested) as Difficulty[]).flatMap((lvl) => Array<Difficulty>(aiRequested[lvl]!).fill(lvl));
  const firstRecipesMs = Date.now() - started;
  opts.onFirstRecipes?.(firstRecipes, slots.length > 0);

  const base = { firstRecipes, counts, aiRequested };
  if (slots.length === 0) {
    return {
      ...base,
      recipes: firstRecipes,
      candidates: spoonRecipes,
      aiAttempts: [],
      aiCalls: 0,
      aiArrivals: [],
      aiHeldUnused: [],
      aiTimedOut: false,
      rateLimited: anthropicStats.rateLimited - rateLimitedStart,
      timing: timing(firstRecipesMs),
    };
  }

  // Extra calls go to the levels with the most empty slots; ties go to the harder level.
  const levelOrder = (["Hard", "Medium", "Easy"] as Difficulty[])
    .filter((lvl) => aiRequested[lvl])
    .sort((x, y) => aiRequested[y]! - aiRequested[x]!);
  const extras = Array.from({ length: AI_EXTRA_CALLS }, (_, i) => levelOrder[i % levelOrder.length]);
  const angles = planAngles([...slots, ...extras], req, firstRecipes);

  const onScreen = firstRecipes.map((r) => r.name);
  const taken = new Set(onScreen.map((n) => n.toLowerCase().trim()));
  const open = { ...aiRequested };
  const picked: string[] = req.cuisine ?? [];
  const perCuisine = new Map<string, number>();
  for (const r of firstRecipes) if (r.cuisine) perCuisine.set(r.cuisine, (perCuisine.get(r.cuisine) ?? 0) + 1);
  const arrivals: AiArrival[] = [];
  const attempts: AiAttempt[] = [];
  // Passed every check; refused only by the cuisine cap.
  const held: { recipe: Recipe; angle: RecipeAngle; attempt: AiAttempt }[] = [];
  const controller = new AbortController();
  let timeLimitHit = false;
  const timer = setTimeout(() => {
    timeLimitHit = true;
    controller.abort();
  }, AI_TIME_LIMIT_MS);

  const capReason = (cuisine: string) => `${cuisine} already has ${MAX_PER_CUISINE} recipes`;
  const accept = (r: Recipe, angle: RecipeAngle, overCap = false) => {
    taken.add(r.name.toLowerCase().trim());
    open[r.difficulty!]! -= 1;
    if (r.cuisine) perCuisine.set(r.cuisine, (perCuisine.get(r.cuisine) ?? 0) + 1);
    arrivals.push({ recipe: r, angle, atMs: Date.now() - started, ...(overCap ? { overCap } : {}) });
    opts.onAiRecipe?.(r);
  };

  // Why a recipe that passed its checks can't take a slot, if it can't.
  const refusal = (r: Recipe): string | undefined => {
    if (controller.signal.aborted) return timeLimitHit ? "time limit reached" : "every slot already filled";
    if (taken.has(r.name.toLowerCase().trim())) return "duplicate of a recipe already shown";
    if (!open[r.difficulty!]) return `no ${r.difficulty} slot left`;
    if (picked.length && !picked.includes(r.cuisine)) return `Jev labeled it ${r.cuisine || "unlabeled"}, not a picked cuisine`;
    if (!picked.length && r.cuisine && (perCuisine.get(r.cuisine) ?? 0) >= MAX_PER_CUISINE)
      return capReason(r.cuisine);
    return undefined;
  };

  const results = await Promise.all(
    angles.map(async (angle) => {
      const result = await writeAiRecipe(req, angle, onScreen, controller.signal);
      if (result.attempt) attempts.push(result.attempt);
      const r = result.recipe;
      if (!r) return result;
      const reason = refusal(r);
      if (reason) {
        result.attempt!.passed = false;
        result.attempt!.reason = reason;
        if (reason === capReason(r.cuisine)) held.push({ recipe: r, angle, attempt: result.attempt! });
        return result;
      }
      accept(r, angle);
      // Every slot filled: stop the calls still running.
      if (Object.values(open).every((n) => !n)) controller.abort();
      return result;
    }),
  );
  clearTimeout(timer);

  // Cap relax: fill empty slots from the held list, fewest-on-screen cuisine first, then in the
  // order they passed.
  for (;;) {
    const usable = held.filter(
      (h) => !taken.has(h.recipe.name.toLowerCase().trim()) && open[h.recipe.difficulty!],
    );
    if (!usable.length) break;
    const count = (h: (typeof held)[number]) => perCuisine.get(h.recipe.cuisine) ?? 0;
    const next = usable.reduce((best, h) => (count(h) < count(best) ? h : best));
    held.splice(held.indexOf(next), 1);
    next.attempt.passed = true;
    next.attempt.reason = `${next.attempt.reason}; used to fill an empty slot`;
    accept(next.recipe, next.angle, true);
  }

  const aiRecipes = arrivals.map((a) => a.recipe);
  counts.ai = aiRecipes.length;
  const shown = [...firstRecipes, ...aiRecipes];
  const leftovers = spoonRecipes.filter((r) => !firstRecipes.includes(r));
  const extra = curateRecipes(leftovers, req.cuisine, { fixed: shown }).filter((r) => !shown.includes(r));
  const errors = results.map((r) => r.error).filter(Boolean);
  return {
    ...base,
    recipes: [...shown, ...extra],
    candidates: [...spoonRecipes, ...aiRecipes],
    aiAttempts: attempts,
    aiCalls: angles.length,
    aiArrivals: arrivals,
    aiHeldUnused: held.map((h) => h.recipe),
    aiTimedOut: timeLimitHit && Object.values(open).some((n) => n),
    aiError: errors.length ? errors.join("; ") : undefined,
    rateLimited: anthropicStats.rateLimited - rateLimitedStart,
    timing: timing(firstRecipesMs),
  };
}
