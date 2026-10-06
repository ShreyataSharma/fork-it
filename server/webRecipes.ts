import Anthropic from "@anthropic-ai/sdk";
import type { MealType, Recipe, RecipeSearchRequest } from "../shared/recipes";
import { anthropic, HAIKU_MODEL } from "./clients/anthropic";
import { isPantryStaple, missingFrom, ownsIngredient, PANTRY_STAPLES } from "./pantry";
import { MAX_MISSING_INGREDIENTS } from "./recipes";

// Cost control: at most this many web searches per request.
export const MAX_WEB_SEARCHES = 3;
// The server-side search loop can pause; resume at most this many times.
const MAX_CONTINUATIONS = 2;

type WebRecipeInput = {
  name: string;
  url: string;
  cuisine: string;
  summary: string;
  servings: number | null;
  totalMinutes: number | null;
  ingredients: { name: string; amount: string }[];
};

const SUBMIT_TOOL: Anthropic.Tool = {
  name: "submit_recipes",
  description: "Submit the recipes you found. Call this exactly once, after searching.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      recipes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Recipe title as shown on the page." },
            url: { type: "string", description: "URL of the recipe page, copied exactly from a search result." },
            cuisine: { type: "string", description: "Cuisine, e.g. Italian. Empty string if unclear." },
            summary: {
              type: "string",
              description: "2 to 3 sentences in your own words describing the dish. Never copy the page's text or steps.",
            },
            servings: { type: ["integer", "null"] },
            totalMinutes: { type: ["integer", "null"], description: "Total time in minutes, if the page states it." },
            ingredients: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Lowercase singular grocery name, e.g. \"chicken breast\"." },
                  amount: { type: "string", description: "Quantity as listed, e.g. \"2 cups\". Empty string if none." },
                },
                required: ["name", "amount"],
                additionalProperties: false,
              },
            },
          },
          required: ["name", "url", "cuisine", "summary", "servings", "totalMinutes", "ingredients"],
          additionalProperties: false,
        },
      },
    },
    required: ["recipes"],
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT = `You find real, published recipes on the web for a home cook, based on the ingredients they already have.

Use the web_search tool to find recipe pages (at most ${MAX_WEB_SEARCHES} searches). Then call submit_recipes once with what you found.

Rules:
- Only include recipes from pages that appeared in your search results, and copy each URL exactly. Never invent a recipe or a URL.
- Prefer recipes that use the cook's ingredients and need at most ${MAX_MISSING_INGREDIENTS} other ingredients, not counting pantry staples.
- List every ingredient the recipe needs, each as a plain lowercase singular grocery name with its amount.
- Write the summary yourself in 2 to 3 sentences. Do not copy the recipe's instructions or any of the page's text.
- If you find nothing suitable, call submit_recipes with an empty list.`;

function mealTypeLabel(mealType: MealType | undefined): string {
  if (mealType === "Breakfast") return "breakfast";
  if (mealType === "Snacks") return "snack";
  return "main course";
}

function userPrompt(req: RecipeSearchRequest, count: number, exclude: string[]): string {
  const lines = [
    `Find ${count} recipes.`,
    `Ingredients the cook has: ${req.ingredients.join(", ")}.`,
    `Pantry staples the cook also has: ${PANTRY_STAPLES.join(", ")}.`,
    `Meal type: ${mealTypeLabel(req.mealType)}.`,
  ];
  if (req.cuisine?.length) lines.push(`Cuisine: ${req.cuisine.join(" or ")}.`);
  if (req.diet?.length) lines.push(`Diet: ${req.diet.join(", ")}.`);
  if (req.intolerances?.length) lines.push(`Must avoid: ${req.intolerances.join(", ")}.`);
  if (exclude.length) lines.push(`Skip these recipes, which the cook already has: ${exclude.join("; ")}.`);
  return lines.join("\n");
}

// Stable negative id from the URL, so web ids never collide with Spoonacular's positive ids.
function idFromUrl(url: string): number {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
  return -(Math.abs(h) || 1);
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function toRecipe(w: WebRecipeInput, userIngredients: string[], missing: string[]): Recipe {
  return {
    id: idFromUrl(w.url),
    name: w.name.trim(),
    description: w.summary.trim(),
    prepTime: "—",
    cookTime: w.totalMinutes && w.totalMinutes > 0 ? `${w.totalMinutes} min` : "—",
    servings: w.servings && w.servings > 0 ? w.servings : 1,
    cuisine: w.cuisine.trim(),
    mainIngredients: w.ingredients.filter((i) => ownsIngredient(i.name, userIngredients)).map((i) => i.name),
    allIngredients: w.ingredients.map((i) => ({
      name: i.name,
      amount: i.amount,
      userHas: ownsIngredient(i.name, userIngredients) || isPantryStaple(i.name),
    })),
    steps: [],
    tags: [],
    source: "web",
    sourceUrl: w.url,
    missingIngredients: missing,
  };
}

export type WebFetchResult = {
  // Recipes Haiku returned, before the missing-ingredient filter and URL check.
  found: number;
  recipes: Recipe[];
  error?: string;
};

// Ask Haiku with web search for up to `count` recipes. Never throws: on failure it logs the
// error and returns no recipes, so the caller can still serve Spoonacular results.
export async function fetchWebRecipes(
  req: RecipeSearchRequest,
  count: number,
  exclude: string[] = [],
): Promise<WebFetchResult> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt(req, count, exclude) }];
  const searchUrls = new Set<string>();

  try {
    let response: Anthropic.Message | undefined;
    for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt++) {
      response = await anthropic.messages.create({
        model: HAIKU_MODEL,
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: MAX_WEB_SEARCHES }, SUBMIT_TOOL],
        messages,
      });

      for (const block of response.content) {
        if (block.type !== "web_search_tool_result") continue;
        if (Array.isArray(block.content)) {
          for (const r of block.content) searchUrls.add(normalizeUrl(r.url));
        } else {
          // Server-tool errors come back as a 200 with an error object, not an exception.
          console.error(`[web-recipes] web search error: ${block.content.error_code}`);
        }
      }

      if (response.stop_reason !== "pause_turn") break;
      // Resume the paused server-side search loop with the partial assistant turn.
      messages.push({ role: "assistant", content: response.content });
    }

    const submit = response?.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === SUBMIT_TOOL.name,
    );
    if (!submit) {
      const error = `Haiku did not submit recipes (stop_reason: ${response?.stop_reason})`;
      console.error(`[web-recipes] ${error}`);
      return { found: 0, recipes: [], error };
    }

    const found = (submit.input as { recipes: WebRecipeInput[] }).recipes;
    const recipes: Recipe[] = [];
    for (const w of found) {
      if (!/^https?:\/\//i.test(w.url) || !searchUrls.has(normalizeUrl(w.url))) {
        console.warn(`[web-recipes] dropped "${w.name}": URL not in search results (${w.url})`);
        continue;
      }
      const missing = missingFrom(w.ingredients.map((i) => i.name), req.ingredients);
      if (missing.length > MAX_MISSING_INGREDIENTS) continue;
      recipes.push(toRecipe(w, req.ingredients, missing));
    }
    return { found: found.length, recipes };
  } catch (err) {
    const error =
      err instanceof Anthropic.APIError
        ? `Anthropic API ${err.status ?? "connection"} error: ${err.message}`
        : `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[web-recipes] ${error}`);
    return { found: 0, recipes: [], error };
  }
}
