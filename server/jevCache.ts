// Supabase cache for Jev answers that don't change between searches: whether an ingredient is
// a pantry staple for a cuisine, and whether one ingredient is the same as another. Answers
// are stored as raw probabilities so thresholds can change without asking again.
// Server only: needs the service role key. Without it, every lookup misses and nothing is saved.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

const STAPLES_TABLE = "jev_staple_answers";
const SAME_TABLE = "jev_same_ingredient_answers";

let client: SupabaseClient | null | undefined;

function db(): SupabaseClient | null {
  if (client !== undefined) return client;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("[jev-cache] SUPABASE_SERVICE_ROLE_KEY is not set; Jev answers will not be cached.");
    client = null;
  } else {
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  }
  return client;
}

export const stapleKey = (ingredient: string, cuisine: string) => `${ingredient}|${cuisine}`;
export const sameKey = (recipeIngredient: string, userIngredient: string) => `${recipeIngredient}|${userIngredient}`;

// Cached staple probabilities for these ingredients, keyed by stapleKey.
export async function getStapleAnswers(ingredients: string[], model: string): Promise<Map<string, number>> {
  const found = new Map<string, number>();
  const supabase = db();
  if (!supabase || ingredients.length === 0) return found;
  const { data, error } = await supabase
    .from(STAPLES_TABLE)
    .select("ingredient, cuisine, probability")
    .eq("model", model)
    .in("ingredient", ingredients);
  if (error) {
    console.error(`[jev-cache] staple lookup failed: ${error.message}`);
    return found;
  }
  for (const row of data) found.set(stapleKey(row.ingredient, row.cuisine), row.probability);
  return found;
}

// Cached same-ingredient probabilities for these recipe ingredients, keyed by sameKey.
export async function getSameAnswers(recipeIngredients: string[], model: string): Promise<Map<string, number>> {
  const found = new Map<string, number>();
  const supabase = db();
  if (!supabase || recipeIngredients.length === 0) return found;
  const { data, error } = await supabase
    .from(SAME_TABLE)
    .select("recipe_ingredient, user_ingredient, probability")
    .eq("model", model)
    .in("recipe_ingredient", recipeIngredients);
  if (error) {
    console.error(`[jev-cache] same-ingredient lookup failed: ${error.message}`);
    return found;
  }
  for (const row of data) found.set(sameKey(row.recipe_ingredient, row.user_ingredient), row.probability);
  return found;
}

export async function saveStapleAnswers(rows: { ingredient: string; cuisine: string; probability: number }[], model: string) {
  const supabase = db();
  if (!supabase || rows.length === 0) return;
  const { error } = await supabase.from(STAPLES_TABLE).upsert(rows.map((r) => ({ ...r, model })));
  if (error) console.error(`[jev-cache] staple save failed: ${error.message}`);
}

export async function saveSameAnswers(
  rows: { recipe_ingredient: string; user_ingredient: string; probability: number }[],
  model: string,
) {
  const supabase = db();
  if (!supabase || rows.length === 0) return;
  const { error } = await supabase.from(SAME_TABLE).upsert(rows.map((r) => ({ ...r, model })));
  if (error) console.error(`[jev-cache] same-ingredient save failed: ${error.message}`);
}
