// Recipe types and picker options shared by the client and server.

// Cuisine picker options. Each value is also a valid Spoonacular `cuisine` parameter.
export const CUISINES = [
  "Indian", "Italian", "Asian", "Mexican", "Mediterranean", "Korean", "Thai", "Chinese", "Greek",
] as const;
export type Cuisine = (typeof CUISINES)[number];

// Rotation used by curation when the user picks no cuisine.
export const DEFAULT_CUISINES: readonly Cuisine[] = CUISINES;

export const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snacks"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export type Difficulty = "Easy" | "Medium" | "Hard";
export type RecipeSource = "spoonacular" | "ai";

export interface RecipeIngredient {
  name: string;
  amount: string;
  userHas: boolean;
}

export interface RecipeMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  servingWeightG: number;
}

export interface Recipe {
  id: number;
  name: string;
  description: string;
  prepTime: string;
  cookTime: string;
  servings: number;
  // Set during curation; absent on uncurated results.
  difficulty?: Difficulty;
  cuisine: string;
  mainIngredients: string[];
  allIngredients: RecipeIngredient[];
  steps: string[];
  tags: string[];
  macros?: RecipeMacros;
  source: RecipeSource;
  // Original publisher of a Spoonacular recipe, e.g. "foodista.com". Spoonacular's terms
  // require crediting it by name with a link to the original page.
  sourceName?: string;
  sourceUrl?: string;
  image?: string;
  // Share of non-staple ingredients the user already has, 0 to 1.
  coverage?: number;
  // Non-staple ingredients the recipe needs that the user didn't list.
  missingIngredients?: string[];
}

export interface RecipeSearchRequest {
  ingredients: string[];
  cuisine?: Cuisine[];
  mealType?: MealType;
  diet?: string[];
  intolerances?: string[];
}

export interface RecipeSearchResponse {
  recipes: Recipe[];
}

// POST /api/recipes streams newline-delimited JSON:
// - "first": the curated Spoonacular recipes, as soon as they're ready. aiPending says whether
//   AI recipes will follow.
// - "ai": one AI recipe as soon as it passes its checks; it goes after every card shown so far.
// - "done": the final list, sent only when aiPending was true. It starts with every card already
//   sent, in order, and may end with leftover Spoonacular recipes for slots AI didn't fill.
// - "error": the stream failed after the first message; the cards shown so far stay.
export type RecipeStreamMessage =
  | { type: "first"; recipes: Recipe[]; aiPending: boolean }
  | { type: "ai"; recipe: Recipe }
  | { type: "done"; recipes: Recipe[] }
  | { type: "error"; error: string };
