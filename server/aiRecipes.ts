import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import type { MealType, Recipe, RecipeSearchRequest } from "../shared/recipes";
import { anthropic, HAIKU_MODEL } from "./clients/anthropic";
import { ingredientKey, missingFrom, ownsIngredient, PANTRY_STAPLES } from "./pantry";

// First request plus one retry for any slots left by rejected recipes.
const MAX_ROUNDS = 2;

type GeneratedRecipe = {
  name: string;
  description: string;
  cuisine: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  ingredients: { name: string; amount: string }[];
  steps: GeneratedStep[];
};

type GeneratedStep = { text: string; ingredients: string[] };

const OUTPUT_FORMAT = jsonSchemaOutputFormat({
  type: "object",
  properties: {
    recipes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          cuisine: { type: "string" },
          servings: { type: "integer" },
          prepMinutes: { type: "integer" },
          cookMinutes: { type: "integer" },
          ingredients: {
            type: "array",
            items: {
              type: "object",
              properties: { name: { type: "string" }, amount: { type: "string" } },
              required: ["name", "amount"],
              additionalProperties: false,
            },
          },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                // Every ingredient this step uses, so code can check it against the ingredient list.
                ingredients: { type: "array", items: { type: "string" } },
              },
              required: ["text", "ingredients"],
              additionalProperties: false,
            },
          },
        },
        required: ["name", "description", "cuisine", "servings", "prepMinutes", "cookMinutes", "ingredients", "steps"],
        additionalProperties: false,
      },
    },
  },
  required: ["recipes"],
  additionalProperties: false,
});

const SYSTEM_PROMPT = `You are a home cook's recipe writer. You create complete, practical recipes using only the ingredients the cook has.

Rules:
- Use only ingredients from the cook's list and the pantry staples list. No other ingredients, not even garnishes or optional ones.
- Write each ingredient name exactly as it appears in those lists. Do not rename or qualify it ("rice", not "basmati rice").
- A recipe does not need to use every ingredient.
- Give amounts for every ingredient, and clear numbered steps a beginner can follow. Do not number the step text itself.
- Every ingredient used in any step, including staples like salt or oil, must appear in the recipe's ingredient list.
- For each step, list in "ingredients" every ingredient that step uses, written exactly as in the recipe's ingredient list. Use an empty list for steps that use none, such as resting or serving.
- Never mention an ingredient in a step's text that is not in that step's ingredient list.
- description: 1 to 2 sentences about the dish.
- Make each recipe a distinct dish.`;

function mealTypeLabel(mealType: MealType | undefined): string {
  if (mealType === "Breakfast") return "breakfast";
  if (mealType === "Snacks") return "snack";
  return "main course";
}

function userPrompt(req: RecipeSearchRequest, count: number, exclude: string[]): string {
  const lines = [
    `Write ${count} recipes.`,
    `The cook's ingredients: ${req.ingredients.join(", ")}.`,
    `Pantry staples: ${PANTRY_STAPLES.join(", ")}.`,
    `Meal type: ${mealTypeLabel(req.mealType)}.`,
  ];
  if (req.cuisine?.length) lines.push(`Cuisine: ${req.cuisine.join(" or ")}.`);
  if (req.diet?.length) lines.push(`Diet: ${req.diet.join(", ")}.`);
  if (req.intolerances?.length) lines.push(`Must avoid: ${req.intolerances.join(", ")}.`);
  if (exclude.length) lines.push(`Do not repeat these dishes: ${exclude.join("; ")}.`);
  return lines.join("\n");
}

// Stable negative id from the name, so AI ids never collide with Spoonacular's positive ids.
function idFromName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (Math.imul(31, h) + name.charCodeAt(i)) | 0;
  return -(Math.abs(h) || 1);
}

function minutes(n: number): string {
  return n > 0 ? `${n} min` : "—";
}

function toRecipe(g: GeneratedRecipe, userIngredients: string[]): Recipe {
  return {
    id: idFromName(g.name),
    name: g.name.trim(),
    description: g.description.trim(),
    prepTime: minutes(g.prepMinutes),
    cookTime: minutes(g.cookMinutes),
    servings: g.servings > 0 ? g.servings : 1,
    cuisine: g.cuisine.trim(),
    mainIngredients: g.ingredients.filter((i) => ownsIngredient(i.name, userIngredients)).map((i) => i.name),
    // Every ingredient passed the check, so the user has all of them.
    allIngredients: g.ingredients.map((i) => ({ name: i.name, amount: i.amount, userHas: true })),
    steps: g.steps.map((s) => s.text.trim()).filter(Boolean),
    tags: [],
    // Nutrition is left empty rather than estimated.
    source: "ai",
    missingIngredients: [],
  };
}

// A step ingredient is listed if it names the same thing as an ingredient-list entry, with
// either one more specific ("chicken" in a step, "chicken breast" in the list). Derived
// products still don't match: a step's "chicken broth" is not the list's "chicken".
function isListed(stepIngredient: string, listed: string[]): boolean {
  const key = ingredientKey(stepIngredient);
  return listed.some(
    (l) => ingredientKey(l) === key || ownsIngredient(stepIngredient, [l]) || ownsIngredient(l, [stepIngredient]),
  );
}

export type AiAttempt = {
  round: number;
  name: string;
  ingredients: string[];
  steps: GeneratedStep[];
  // Ingredients (from the list or any step) outside the user's list and staples.
  missing: string[];
  // Step ingredients that aren't in the recipe's own ingredient list.
  unlistedInSteps: string[];
  passed: boolean;
  // Why a recipe was rejected, when it was.
  reason?: string;
};

export type AiFetchResult = {
  attempts: AiAttempt[];
  recipes: Recipe[];
  error?: string;
};

async function generate(req: RecipeSearchRequest, count: number, exclude: string[]): Promise<GeneratedRecipe[]> {
  const response = await anthropic.messages.parse({
    model: HAIKU_MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt(req, count, exclude) }],
    output_config: { format: OUTPUT_FORMAT },
  });
  if (response.stop_reason !== "end_turn" || !response.parsed_output) {
    throw new Error(`Recipe generation did not complete (stop_reason: ${response.stop_reason})`);
  }
  return (response.parsed_output as { recipes: GeneratedRecipe[] }).recipes;
}

// Ask Haiku for `count` recipes made only from the user's ingredients plus staples. Recipes
// with any other ingredient, in the list or in a step, are rejected, as are recipes whose
// steps use something missing from their own ingredient list; one retry fills the gaps. Never
// throws: on failure it logs the error and returns whatever passed so far.
export async function fetchAiRecipes(req: RecipeSearchRequest, count: number, exclude: string[] = []): Promise<AiFetchResult> {
  const attempts: AiAttempt[] = [];
  const recipes: Recipe[] = [];
  const seen = new Set(exclude.map((n) => n.toLowerCase().trim()));

  try {
    for (let round = 1; round <= MAX_ROUNDS && recipes.length < count; round++) {
      const generated = await generate(req, count - recipes.length, Array.from(seen));
      for (const g of generated) {
        const names = g.ingredients.map((i) => i.name);
        const stepIngredients = Array.from(new Set(g.steps.flatMap((s) => s.ingredients)));
        const unlistedInSteps = stepIngredients.filter((i) => !isListed(i, names));
        const missing = missingFrom(Array.from(new Set([...names, ...stepIngredients])), req.ingredients);
        const key = g.name.toLowerCase().trim();
        const reason =
          unlistedInSteps.length > 0 ? "a step uses ingredients not in the ingredient list"
          : missing.length > 0 ? "uses ingredients outside the user's list and staples"
          : g.steps.length === 0 ? "no steps"
          : seen.has(key) ? "duplicate of an earlier recipe"
          : recipes.length >= count ? "more recipes than requested"
          : undefined;
        const passed = reason === undefined;
        attempts.push({ round, name: g.name, ingredients: names, steps: g.steps, missing, unlistedInSteps, passed, reason });
        seen.add(key);
        if (passed) recipes.push(toRecipe(g, req.ingredients));
      }
    }
    return { attempts, recipes };
  } catch (err) {
    const error =
      err instanceof Anthropic.APIError
        ? `Anthropic API ${err.status ?? "connection"} error: ${err.message}`
        : `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[ai-recipes] ${error}`);
    return { attempts, recipes, error };
  }
}
