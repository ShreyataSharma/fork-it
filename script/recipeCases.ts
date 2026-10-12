// Search cases shared by test-recipes.ts and jev-results.ts.
// USE_FIXTURES=true reads saved Spoonacular responses from script/fixtures/; otherwise each
// case calls Spoonacular live and records its response there.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { RecipeSearchRequest } from "../shared/recipes";
import type { AiAttempt } from "../server/aiRecipes";
import { liveSpoonacularSearch, type SpoonacularSearch } from "../server/recipes";

export const USE_FIXTURES = process.env.USE_FIXTURES === "true";

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

// Each case reads from, or records to, script/fixtures/<fixture>.json.
export function spoonacularSearchFor(fixture: string): SpoonacularSearch {
  const file = path.join(FIXTURES_DIR, `${fixture}.json`);
  if (USE_FIXTURES) {
    return async () => {
      if (!fs.existsSync(file)) {
        throw new Error(`Missing fixture ${path.relative(process.cwd(), file)}. Run once without USE_FIXTURES to record it.`);
      }
      return JSON.parse(fs.readFileSync(file, "utf8"));
    };
  }
  return async (req) => {
    const data = await liveSpoonacularSearch(req);
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
    return data;
  };
}

// Simulates Spoonacular finding nothing, so the AI fallback must supply all 10.
export const noSpoonacularResults: SpoonacularSearch = async () => ({ results: [], totalResults: 0 });

// fixture: null means the case uses noSpoonacularResults instead of a saved response.
// minAiFilled: the fewest AI slots the case must fill, so a drop in variety (AI recipes refused
// by the cuisine cap or as duplicates) fails the test.
export const CASES: {
  name: string;
  fixture: string | null;
  request: RecipeSearchRequest;
  expectAi?: boolean;
  minAiFilled?: number;
}[] = [
  {
    name: "common list",
    fixture: "common-list",
    request: { ingredients: ["chicken breast", "rice", "broccoli", "garlic", "onion", "cheddar", "tomato"] },
  },
  { name: "short list (2 items)", fixture: "short-list", request: { ingredients: ["eggs", "spinach"] } },
  {
    name: "cuisine picked (Indian)",
    fixture: "indian",
    request: { ingredients: ["chicken", "tomato", "onion", "yogurt", "rice"], cuisine: ["Indian"] },
  },
  {
    name: "forced AI fallback (Spoonacular returns nothing)",
    fixture: null,
    request: { ingredients: ["chickpeas", "spinach", "tomato", "rice"], mealType: "Dinner" },
    expectAi: true,
    minAiFilled: 8,
  },
];

// True when Haiku wrote the dish in a cuisine other than the one its call suggested.
export function offSuggestion(a: AiAttempt): boolean {
  return !!a.angle.suggestedCuisine && a.haikuCuisine.trim().toLowerCase() !== a.angle.suggestedCuisine.toLowerCase();
}

// The Spoonacular search a case runs against.
export function searchFor(c: (typeof CASES)[number]): SpoonacularSearch {
  return c.fixture ? spoonacularSearchFor(c.fixture) : noSpoonacularResults;
}
