import { Router } from "express";
import {
  CUISINES,
  MEAL_TYPES,
  type Cuisine,
  type MealType,
  type RecipeSearchRequest,
  type RecipeStreamMessage,
} from "../../shared/recipes";
import { SpoonacularError } from "../clients/spoonacular";
import { findRecipes } from "../recipeSearch";
import type { SpoonacularSearch } from "../recipes";

const MAX_INGREDIENTS = 50;

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === "string");
}

// Accept a single string or an array of strings; drop blanks.
function stringList(v: unknown): string[] | null {
  if (v === undefined || v === null) return [];
  if (typeof v === "string") return v.trim() ? [v.trim()] : [];
  if (isStringArray(v)) return v.map((s) => s.trim()).filter(Boolean);
  return null;
}

// `spoonacularSearch` replaces the live Spoonacular call; tests pass a fixture reader.
export function makeRecipesRouter(spoonacularSearch?: SpoonacularSearch) {
  const router = Router();

  // POST /api/recipes
  // Body: { ingredients: string[], cuisine?: string | string[], mealType?: string, diet?: string | string[], intolerances?: string | string[] }
  // Bad requests and failures before any recipes are ready get a JSON error. Otherwise the reply
  // is newline-delimited JSON (see RecipeStreamMessage): the Spoonacular batch as soon as it's
  // curated, each AI recipe as it passes, then the final list.
  router.post("/api/recipes", async (req, res) => {
    const body = req.body ?? {};

    const ingredients = stringList(body.ingredients);
    if (!ingredients || ingredients.length === 0)
      return res.status(400).json({ error: "Send at least one ingredient." });
    if (ingredients.length > MAX_INGREDIENTS)
      return res.status(400).json({ error: `Send ${MAX_INGREDIENTS} ingredients or fewer.` });

    const cuisine = stringList(body.cuisine);
    if (!cuisine || cuisine.some((c) => !(CUISINES as readonly string[]).includes(c)))
      return res.status(400).json({ error: `cuisine must be one of: ${CUISINES.join(", ")}.` });

    const mealType = body.mealType || undefined;
    if (mealType !== undefined && !(MEAL_TYPES as readonly string[]).includes(mealType))
      return res.status(400).json({ error: `mealType must be one of: ${MEAL_TYPES.join(", ")}.` });

    const diet = stringList(body.diet);
    const intolerances = stringList(body.intolerances);
    if (!diet || !intolerances)
      return res.status(400).json({ error: "diet and intolerances must be strings or lists of strings." });

    const request: RecipeSearchRequest = {
      ingredients,
      cuisine: cuisine as Cuisine[],
      mealType: mealType as MealType | undefined,
      diet,
      intolerances,
    };

    let streaming = false;
    let aiPending = false;
    const send = (msg: RecipeStreamMessage) => {
      if (!streaming) {
        res.status(200).type("application/x-ndjson");
        // Keep proxies from holding the first line back.
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("X-Accel-Buffering", "no");
        streaming = true;
      }
      res.write(JSON.stringify(msg) + "\n");
    };

    try {
      const { recipes } = await findRecipes(request, {
        spoonacularSearch,
        onFirstRecipes: (first, pending) => {
          aiPending = pending;
          send({ type: "first", recipes: first, aiPending: pending });
        },
        onAiRecipe: (recipe) => send({ type: "ai", recipe }),
      });
      if (aiPending) send({ type: "done", recipes });
      res.end();
    } catch (err) {
      console.error("[recipes]", err);
      if (streaming) {
        send({ type: "error", error: "Something went wrong while adding more recipes." });
        return res.end();
      }
      if (err instanceof SpoonacularError) {
        return res.status(502).json({ error: "We couldn't reach the recipe service right now. Please try again." });
      }
      res.status(500).json({ error: "Something went wrong." });
    }
  });

  return router;
}

export const recipesRouter = makeRecipesRouter();
