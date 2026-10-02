import { Router } from "express";
import { CUISINES, MEAL_TYPES, type Cuisine, type MealType, type RecipeSearchRequest } from "../../shared/recipes";
import { SpoonacularError } from "../clients/spoonacular";
import { fetchSpoonacularRecipes } from "../recipes";

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

export const recipesRouter = Router();

// POST /api/recipes
// Body: { ingredients: string[], cuisine?: string | string[], mealType?: string, diet?: string | string[], intolerances?: string | string[] }
recipesRouter.post("/api/recipes", async (req, res) => {
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

  try {
    const { recipes } = await fetchSpoonacularRecipes(request);
    res.json({ recipes });
  } catch (err) {
    console.error("[recipes]", err);
    if (err instanceof SpoonacularError) {
      return res.status(502).json({ error: "We couldn't reach the recipe service right now. Please try again." });
    }
    res.status(500).json({ error: "Something went wrong." });
  }
});
