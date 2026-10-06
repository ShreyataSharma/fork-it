import type { Recipe, RecipeSearchRequest } from "../shared/recipes";
import { fetchSpoonacularRecipes, type SpoonacularSearch } from "./recipes";
import { fetchWebRecipes, normalizeUrl } from "./webRecipes";

// The pipeline aims for this many recipes before curation.
export const TARGET_RECIPES = 10;

function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export type RecipeSearchResult = {
  recipes: Recipe[];
  counts: { spoonacularFetched: number; spoonacular: number; webFound: number; web: number };
  webError?: string;
};

// Spoonacular first; if it leaves slots open, fill them from the web search fallback.
// Order: Spoonacular, then web. Not curated yet.
export async function findRecipes(
  req: RecipeSearchRequest,
  opts: { spoonacularSearch?: SpoonacularSearch } = {},
): Promise<RecipeSearchResult> {
  const spoon = await fetchSpoonacularRecipes(req, opts.spoonacularSearch);
  const counts = { spoonacularFetched: spoon.fetched, spoonacular: spoon.recipes.length, webFound: 0, web: 0 };

  const needed = TARGET_RECIPES - spoon.recipes.length;
  if (needed <= 0) return { recipes: spoon.recipes, counts };

  const web = await fetchWebRecipes(req, needed, spoon.recipes.map((r) => r.name));
  counts.webFound = web.found;

  // Drop web recipes that duplicate a Spoonacular recipe (or each other) by name or URL.
  const seenNames = new Set(spoon.recipes.map((r) => nameKey(r.name)));
  const seenUrls = new Set(spoon.recipes.flatMap((r) => (r.sourceUrl ? [normalizeUrl(r.sourceUrl)] : [])));
  const webRecipes: Recipe[] = [];
  for (const r of web.recipes) {
    const n = nameKey(r.name);
    const u = r.sourceUrl ? normalizeUrl(r.sourceUrl) : "";
    if (seenNames.has(n) || (u && seenUrls.has(u))) continue;
    seenNames.add(n);
    if (u) seenUrls.add(u);
    webRecipes.push(r);
    if (webRecipes.length === needed) break;
  }
  counts.web = webRecipes.length;

  return { recipes: [...spoon.recipes, ...webRecipes], counts, webError: web.error };
}
