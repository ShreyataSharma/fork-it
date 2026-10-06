import type { Recipe, RecipeSearchRequest } from "../shared/recipes";
import { fetchAiRecipes, type AiAttempt } from "./aiRecipes";
import { curateRecipes } from "./curate";
import { fetchSpoonacularRecipes, type SpoonacularSearch } from "./recipes";

// The pipeline aims for this many recipes before curation.
export const TARGET_RECIPES = 10;

export type RecipeSearchResult = {
  // The curated list shown to the user.
  recipes: Recipe[];
  // Every recipe that reached the curator: Spoonacular, then AI.
  candidates: Recipe[];
  counts: { spoonacularFetched: number; spoonacular: number; ai: number };
  aiAttempts: AiAttempt[];
  aiError?: string;
};

// Spoonacular first; if it leaves slots open, Haiku generates recipes for the rest from the
// user's ingredients plus staples. Then the curator picks the final list.
export async function findRecipes(
  req: RecipeSearchRequest,
  opts: { spoonacularSearch?: SpoonacularSearch } = {},
): Promise<RecipeSearchResult> {
  const spoon = await fetchSpoonacularRecipes(req, opts.spoonacularSearch);
  const counts = { spoonacularFetched: spoon.fetched, spoonacular: spoon.recipes.length, ai: 0 };

  const needed = TARGET_RECIPES - spoon.recipes.length;
  if (needed <= 0) {
    return { recipes: curateRecipes(spoon.recipes, req.cuisine), candidates: spoon.recipes, counts, aiAttempts: [] };
  }

  const ai = await fetchAiRecipes(req, needed, spoon.recipes.map((r) => r.name));
  counts.ai = ai.recipes.length;
  const candidates = [...spoon.recipes, ...ai.recipes];
  return {
    recipes: curateRecipes(candidates, req.cuisine),
    candidates,
    counts,
    aiAttempts: ai.attempts,
    aiError: ai.error,
  };
}
