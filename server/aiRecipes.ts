import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { CUISINES, type Difficulty, type MealType, type Recipe, type RecipeSearchRequest } from "../shared/recipes";
import { anthropic, HAIKU_MODEL } from "./clients/anthropic";
import { MAX_PER_CUISINE } from "./curate";
import { checkAiRecipes, CUISINE_NOTES, DIFFICULTY_MARKERS, findMissing, labelCuisine } from "./jev";
import { ingredientKey, isPantryStaple, ownsIngredient, PANTRY_STAPLES } from "./pantry";
import { BusyTimer } from "./timing";

// Cooking methods suggested in rotation across parallel calls. Haiku may pick another.
export const COOKING_METHODS = ["stir fry", "bake", "curry", "soup", "salad", "grill"] as const;

// Wall-clock time with at least one Haiku generation in flight.
export const haikuTimer = new BusyTimer();

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
          // First, so the cuisine is settled before the name and steps are written.
          cuisine: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
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
        required: ["cuisine", "name", "description", "servings", "prepMinutes", "cookMinutes", "ingredients", "steps"],
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
- The recipe name must only mention ingredients in the recipe's ingredient list.
- description: 1 to 2 sentences about the dish.
- Write exactly one recipe, built around the main ingredient and at the difficulty you are given.
- Write it in the suggested cuisine. Other recipes for this cook are being written in the other cuisines at the same time, and a dish in a cuisine that already has its share will be discarded. Most ingredients work in most cuisines; switch only if the suggested cuisine clearly cannot make a sensible dish from these ingredients. If you are given alternatives, switch only to one of them.
- Make the dish recognizably that cuisine through its seasonings from the pantry staples and its techniques. Avoid generic dishes, such as a plain "X and Y rice bowl", that could belong to any cuisine.
- Never get the cuisine across with an ingredient that is not listed. If a classic dish needs one (gochujang, coconut milk, paneer, dashi, pasta, tortillas, and so on), make a different dish rather than adding it or naming the dish after it.
- cuisine: the cuisine name you were given, written exactly as given (for example "Asian", not "Vietnamese"). Write it first.`;

function mealTypeLabel(mealType: MealType | undefined): string {
  if (mealType === "Breakfast") return "breakfast";
  if (mealType === "Snacks") return "snack";
  return "main course";
}

// What one AI call writes. Its difficulty is final; the main ingredient and the suggested
// cuisine keep parallel calls apart, and the method is only a suggestion.
export type RecipeAngle = {
  difficulty: Difficulty;
  // One of the user's ingredients for the dish to center on.
  mainIngredient: string;
  suggestedMethod: string;
  // The cuisine to write in; "" if none has room. Jev labels the cuisine the dish actually is.
  suggestedCuisine: string;
  // Cuisines Haiku may switch to if the suggested one clearly doesn't suit the dish.
  otherCuisines: string[];
  // True when the user picked the cuisines, so the dish must be one of them.
  cuisineRequired: boolean;
};

// One angle per AI call. Main ingredients rotate through the user's non-staple ingredients,
// suggested methods through COOKING_METHODS, and suggested cuisines through the picked ones or,
// with none picked, the cuisines with room under MAX_PER_CUISINE given the recipes on screen.
export function planAngles(levels: Difficulty[], req: RecipeSearchRequest, onScreen: Recipe[]): RecipeAngle[] {
  const mains = req.ingredients.filter((i) => !isPantryStaple(i));
  const pool = mains.length ? mains : req.ingredients;
  const picked = req.cuisine ?? [];
  const used = new Map<string, number>();
  for (const r of onScreen) if (r.cuisine) used.set(r.cuisine, (used.get(r.cuisine) ?? 0) + 1);
  const withRoom = CUISINES.filter((c) => (used.get(c) ?? 0) < MAX_PER_CUISINE);

  const cuisines: string[] = picked.length ? picked : withRoom;

  return levels.map((difficulty, i) => {
    const suggestedCuisine = cuisines.length ? cuisines[i % cuisines.length] : "";
    return {
      difficulty,
      mainIngredient: pool[i % pool.length],
      suggestedMethod: COOKING_METHODS[i % COOKING_METHODS.length],
      suggestedCuisine,
      otherCuisines: cuisines.filter((c) => c !== suggestedCuisine),
      cuisineRequired: picked.length > 0,
    };
  });
}

function userPrompt(req: RecipeSearchRequest, angle: RecipeAngle, exclude: string[]): string {
  const lines = [
    "Write 1 recipe.",
    `The cook's ingredients: ${req.ingredients.join(", ")}.`,
    `Pantry staples: ${PANTRY_STAPLES.join(", ")}.`,
    `Meal type: ${mealTypeLabel(req.mealType)}.`,
    `Main ingredient: build the dish around ${angle.mainIngredient}.`,
  ];
  if (angle.suggestedCuisine) {
    // Alternatives are listed only for picked cuisines, where the dish must be one of them; with
    // none picked, listing every cuisine with room made Haiku switch far more often.
    const note = CUISINE_NOTES[angle.suggestedCuisine];
    lines.push(
      !angle.cuisineRequired ? `Suggested cuisine: ${angle.suggestedCuisine}.${note ? ` ${angle.suggestedCuisine} here means: ${note}` : ""}`
      : angle.otherCuisines.length ? `Suggested cuisine: ${angle.suggestedCuisine}. Alternatives: ${angle.otherCuisines.join(", ")}. The dish must be one of these cuisines.`
      : `Cuisine: the dish must be ${angle.suggestedCuisine}.`,
    );
  }
  lines.push(`Suggested cooking method: ${angle.suggestedMethod}. Use a different method if another suits the dish and cuisine better.`);
  if (req.diet?.length) lines.push(`Diet: ${req.diet.join(", ")}.`);
  if (req.intolerances?.length) lines.push(`Must avoid: ${req.intolerances.join(", ")}.`);
  lines.push(`Difficulty: the recipe must be ${angle.difficulty.toLowerCase()}: ${DIFFICULTY_MARKERS[angle.difficulty]}`);
  if (exclude.length) lines.push(`These dishes are already on the cook's screen; do not repeat any of them: ${exclude.join("; ")}.`);
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

// The recipe's difficulty is the level Haiku was asked to write it at. Its cuisine starts as the
// placeholder label (used if Jev can't be reached); Jev's label replaces it.
function toRecipe(g: GeneratedRecipe, req: RecipeSearchRequest, angle: RecipeAngle): Recipe {
  const userIngredients = req.ingredients;
  const steps = g.steps.map((s) => s.text.trim()).filter(Boolean);
  return {
    id: idFromName(g.name),
    name: g.name.trim(),
    description: g.description.trim(),
    prepTime: minutes(g.prepMinutes),
    cookTime: minutes(g.cookMinutes),
    servings: g.servings > 0 ? g.servings : 1,
    difficulty: angle.difficulty,
    cuisine: labelCuisine({ source: "ai", cuisines: [g.cuisine.trim()], requested: req.cuisine ?? [] }),
    mainIngredients: g.ingredients.filter((i) => ownsIngredient(i.name, userIngredients)).map((i) => i.name),
    // Every ingredient passed the check, so the user has all of them.
    allIngredients: g.ingredients.map((i) => ({ name: i.name, amount: i.amount, userHas: true })),
    steps,
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
  name: string;
  angle: RecipeAngle;
  // The cuisine Haiku said the dish is.
  haikuCuisine: string;
  ingredients: string[];
  steps: GeneratedStep[];
  // Ingredients (from the list or any step) outside the user's list and staples.
  missing: string[];
  // Step ingredients that aren't in the recipe's own ingredient list.
  unlistedInSteps: string[];
  // Jev's probabilities that a step, or the name, uses an unlisted ingredient; null if not asked.
  jevUnlisted: number | null;
  jevName: number | null;
  passed: boolean;
  // Why a recipe was rejected, when it was.
  reason?: string;
};

export type AiWriteResult = {
  attempt?: AiAttempt;
  // The recipe that passed every check, if any.
  recipe?: Recipe;
  // True if the time limit stopped it before it finished.
  timedOut: boolean;
  error?: string;
};

async function generate(req: RecipeSearchRequest, angle: RecipeAngle, exclude: string[], signal?: AbortSignal): Promise<GeneratedRecipe> {
  const response = await haikuTimer.time(() =>
    anthropic.messages.parse(
      {
        model: HAIKU_MODEL,
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt(req, angle, exclude) }],
        output_config: { format: OUTPUT_FORMAT },
      },
      { signal },
    ),
  );
  const recipes = (response.parsed_output as { recipes: GeneratedRecipe[] } | null)?.recipes;
  if (response.stop_reason !== "end_turn" || !recipes?.length) {
    throw new Error(`Recipe generation did not complete (stop_reason: ${response.stop_reason})`);
  }
  return recipes[0];
}

// Ask Haiku for one recipe at `angle`, made only from the user's ingredients plus staples.
// Code checks run first: any ingredient outside the user's list and staples (after Jev's
// staple and same-ingredient answers), any step ingredient missing from the recipe's list, or
// no steps. Jev then checks the steps and the name, and labels the cuisine. There is no retry;
// the search runs extra calls instead. When `signal` aborts (time limit, or every slot filled),
// it stops; a recipe still being checked is dropped. Never throws: on failure it logs the error
// and returns no recipe.
export async function writeAiRecipe(
  req: RecipeSearchRequest,
  angle: RecipeAngle,
  exclude: string[],
  signal?: AbortSignal,
): Promise<AiWriteResult> {
  try {
    const g = await generate(req, angle, exclude, signal);
    const names = g.ingredients.map((i) => i.name);
    const stepIngredients = Array.from(new Set(g.steps.flatMap((s) => s.ingredients)));
    const unlistedInSteps = stepIngredients.filter((i) => !isListed(i, names));
    const [missing] = await findMissing(
      [{ ingredients: Array.from(new Set([...names, ...stepIngredients])), cuisine: g.cuisine }],
      req.ingredients,
      signal,
    );
    const codeReason =
      unlistedInSteps.length > 0 ? "a step uses ingredients not in the ingredient list"
      : missing.length > 0 ? "uses ingredients outside the user's list and staples"
      : g.steps.length === 0 ? "no steps"
      : undefined;
    const [jev] = codeReason ? [undefined] : await checkAiRecipes([toRecipe(g, req, angle)], signal);
    const reason = codeReason ?? (signal?.aborted ? "stopped before its checks finished" : jev?.reason);
    const attempt: AiAttempt = {
      name: g.name,
      angle,
      haikuCuisine: g.cuisine,
      ingredients: names,
      steps: g.steps,
      missing,
      unlistedInSteps,
      jevUnlisted: jev?.unlistedProbability ?? null,
      jevName: jev?.nameProbability ?? null,
      passed: reason === undefined,
      reason,
    };
    return { attempt, recipe: reason === undefined ? jev?.recipe : undefined, timedOut: signal?.aborted ?? false };
  } catch (err) {
    if (signal?.aborted) return { timedOut: true };
    const error =
      err instanceof Anthropic.APIError
        ? `Anthropic API ${err.status ?? "connection"} error: ${err.message}`
        : `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[ai-recipes] ${error}`);
    return { timedOut: false, error };
  }
}
