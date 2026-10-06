import type { MealType, Recipe, RecipeIngredient, RecipeMacros, RecipeSearchRequest } from "../shared/recipes";
import { spoonacularGet } from "./clients/spoonacular";
import { isPantryStaple, missingFrom, normalizeIngredient, ownsIngredient } from "./pantry";

// Keep a recipe only if it needs at most this many ingredients the user doesn't have (staples excluded).
export const MAX_MISSING_INGREDIENTS = 3;
const RESULT_COUNT = 30;

const SPOONACULAR_MEAL_TYPE: Record<MealType, string> = {
  Breakfast: "breakfast",
  Lunch: "main course",
  Dinner: "main course",
  Snacks: "snack",
};

type SpoonIngredient = {
  id: number;
  name: string;
  amount: number;
  unit: string;
  unitShort?: string;
  original?: string;
};

type SpoonRecipe = {
  id: number;
  title: string;
  image?: string;
  summary?: string;
  sourceUrl?: string;
  readyInMinutes?: number;
  preparationMinutes?: number | null;
  cookingMinutes?: number | null;
  servings?: number;
  cuisines?: string[];
  dishTypes?: string[];
  diets?: string[];
  usedIngredients?: SpoonIngredient[];
  missedIngredients?: SpoonIngredient[];
  extendedIngredients?: SpoonIngredient[];
  analyzedInstructions?: { steps: { step: string }[] }[];
  nutrition?: {
    nutrients?: { name: string; amount: number }[];
    weightPerServing?: { amount: number; unit: string };
  };
};

export type ComplexSearchResponse = { results: SpoonRecipe[]; totalResults: number };

// Spoonacular sometimes lists an ingredient as missed even when the user searched for it,
// so the missed list is checked against the user's own ingredients too.
function missingIngredients(r: SpoonRecipe, userIngredients: string[]): string[] {
  return missingFrom((r.missedIngredients ?? []).map((i) => i.name), userIngredients);
}

// User ingredients used divided by total ingredients, ignoring pantry staples on both sides.
function computeCoverage(r: SpoonRecipe, missing: number): number {
  const used = (r.usedIngredients ?? []).filter((i) => !isPantryStaple(i.name)).length;
  const total = used + missing;
  return total === 0 ? 0 : used / total;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// First two sentences of Spoonacular's HTML summary.
function shortDescription(summary: string | undefined): string {
  if (!summary) return "";
  const sentences = stripHtml(summary).match(/[^.!?]+[.!?]+/g) ?? [];
  return sentences.slice(0, 2).join(" ").trim();
}

function minutes(n: number | null | undefined): string | null {
  return n && n > 0 ? `${n} min` : null;
}

function formatAmount(i: SpoonIngredient): string {
  const amount = Math.round(i.amount * 100) / 100;
  const unit = i.unitShort || i.unit;
  return unit ? `${amount} ${unit}` : String(amount);
}

function mapMacros(r: SpoonRecipe): RecipeMacros | undefined {
  const nutrients = r.nutrition?.nutrients;
  if (!nutrients) return undefined;
  const get = (name: string) => Math.round(nutrients.find((n) => n.name === name)?.amount ?? 0);
  const weight = r.nutrition?.weightPerServing;
  return {
    calories: get("Calories"),
    protein: get("Protein"),
    carbs: get("Carbohydrates"),
    fat: get("Fat"),
    fiber: get("Fiber"),
    servingWeightG: weight?.unit === "g" ? Math.round(weight.amount) : 0,
  };
}

function toRecipe(r: SpoonRecipe, missing: string[], userIngredients: string[]): Recipe {
  const usedIds = new Set((r.usedIngredients ?? []).map((i) => i.id));
  const allIngredients: RecipeIngredient[] = (r.extendedIngredients ?? []).map((i) => ({
    name: i.name,
    amount: formatAmount(i),
    userHas: usedIds.has(i.id) || ownsIngredient(i.name, userIngredients) || isPantryStaple(i.name),
  }));
  return {
    id: r.id,
    name: r.title,
    description: shortDescription(r.summary),
    prepTime: minutes(r.preparationMinutes) ?? "—",
    cookTime: minutes(r.cookingMinutes) ?? minutes(r.readyInMinutes) ?? "—",
    servings: r.servings ?? 1,
    cuisine: r.cuisines?.[0] ?? "",
    mainIngredients: Array.from(new Set((r.usedIngredients ?? []).map((i) => i.name))),
    allIngredients,
    steps: (r.analyzedInstructions ?? []).flatMap((block) => block.steps.map((s) => s.step)),
    tags: [...(r.diets ?? []), ...(r.dishTypes ?? [])],
    macros: mapMacros(r),
    source: "spoonacular",
    sourceUrl: r.sourceUrl,
    image: r.image,
    coverage: Math.round(computeCoverage(r, missing.length) * 100) / 100,
    missingIngredients: missing,
  };
}

export type SpoonacularFetchResult = {
  // Recipes Spoonacular returned, before the missing-ingredient filter.
  fetched: number;
  recipes: Recipe[];
};

// Returns Spoonacular's raw complexSearch response for a request.
export type SpoonacularSearch = (req: RecipeSearchRequest) => Promise<ComplexSearchResponse>;

// The live API call. The app always uses this; tests can pass a fixture reader instead.
export const liveSpoonacularSearch: SpoonacularSearch = (req) =>
  spoonacularGet<ComplexSearchResponse>("/recipes/complexSearch", {
    includeIngredients: req.ingredients.map(normalizeIngredient).join(","),
    cuisine: req.cuisine?.join(","),
    type: req.mealType ? SPOONACULAR_MEAL_TYPE[req.mealType] : "main course",
    diet: req.diet?.join(","),
    intolerances: req.intolerances?.join(","),
    sort: "max-used-ingredients",
    fillIngredients: true,
    // Spoonacular leaves its own pantry items (water, salt, flour, ...) out of used/missed lists.
    ignorePantry: true,
    // Needed to fill description, times, servings, steps, and macros.
    addRecipeInformation: true,
    addRecipeInstructions: true,
    addRecipeNutrition: true,
    number: RESULT_COUNT,
  });

export async function fetchSpoonacularRecipes(
  req: RecipeSearchRequest,
  search: SpoonacularSearch = liveSpoonacularSearch,
): Promise<SpoonacularFetchResult> {
  const data = await search(req);
  const recipes = data.results
    .map((r) => ({ r, missing: missingIngredients(r, req.ingredients) }))
    .filter(({ missing }) => missing.length <= MAX_MISSING_INGREDIENTS)
    .map(({ r, missing }) => toRecipe(r, missing, req.ingredients));

  return { fetched: data.results.length, recipes };
}
