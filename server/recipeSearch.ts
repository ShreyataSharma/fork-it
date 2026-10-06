import type { Recipe, RecipeSearchRequest } from "../shared/recipes";
import { fetchAiRecipes, type AiAttempt } from "./aiRecipes";
import { fetchSpoonacularRecipes, type SpoonacularSearch } from "./recipes";

// The pipeline aims for this many recipes before curation.
export const TARGET_RECIPES = 10;

export type RecipeSearchResult = {
  recipes: Recipe[];
  counts: { spoonacularFetched: number; spoonacular: number; ai: number };
  aiAttempts: AiAttempt[];
  aiError?: string;
};

// Spoonacular first; if it leaves slots open, Haiku generates recipes for the rest from the
// user's ingredients plus staples. Order: Spoonacular, then AI. Not curated yet.
export async function findRecipes(
  req: RecipeSearchRequest,
  opts: { spoonacularSearch?: SpoonacularSearch } = {},
): Promise<RecipeSearchResult> {
  const spoon = await fetchSpoonacularRecipes(req, opts.spoonacularSearch);
  const counts = { spoonacularFetched: spoon.fetched, spoonacular: spoon.recipes.length, ai: 0 };

  const needed = TARGET_RECIPES - spoon.recipes.length;
  if (needed <= 0) return { recipes: spoon.recipes, counts, aiAttempts: [] };

  const ai = await fetchAiRecipes(req, needed, spoon.recipes.map((r) => r.name));
  counts.ai = ai.recipes.length;
  return { recipes: [...spoon.recipes, ...ai.recipes], counts, aiAttempts: ai.attempts, aiError: ai.error };
}
