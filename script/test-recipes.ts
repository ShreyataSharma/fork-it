// Steps 3-4 test: Spoonacular fetch, missing-ingredient filter, and web search fallback,
// plus POST /api/recipes through an in-process server.
//
// Live (default): calls Spoonacular and saves each raw response to script/fixtures/.
//   npx tsx script/test-recipes.ts
// Fixtures: reads those saved responses instead of calling Spoonacular (no quota used).
// The web search fallback still calls Anthropic in both modes.
//   USE_FIXTURES=true npx tsx script/test-recipes.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import type { RecipeSearchRequest } from "../shared/recipes";
import { liveSpoonacularSearch, MAX_MISSING_INGREDIENTS, type SpoonacularSearch } from "../server/recipes";
import { findRecipes } from "../server/recipeSearch";
import { recipesRouter } from "../server/routes/recipes";

const USE_FIXTURES = process.env.USE_FIXTURES === "true";
const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

// Each case reads from, or records to, script/fixtures/<fixture>.json.
function spoonacularSearchFor(fixture: string): SpoonacularSearch {
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

const CASES: { name: string; fixture: string; request: RecipeSearchRequest }[] = [
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
];

async function main() {
  let failed = false;
  console.log(`Spoonacular source: ${USE_FIXTURES ? "fixtures (script/fixtures/)" : "live API (recording fixtures)"}\n`);

  for (const c of CASES) {
    console.log(`=== ${c.name} ===`);
    console.log(`ingredients: ${c.request.ingredients.join(", ")}${c.request.cuisine ? ` | cuisine: ${c.request.cuisine}` : ""}`);
    const { recipes, counts, webError } = await findRecipes(c.request, { spoonacularSearch: spoonacularSearchFor(c.fixture) });
    console.log(`spoonacular: ${counts.spoonacularFetched} fetched -> ${counts.spoonacular} kept (<= ${MAX_MISSING_INGREDIENTS} missing)`);
    console.log(`web:         ${counts.webFound} found -> ${counts.web} kept`);
    if (webError) console.log(`web error:   ${webError}`);
    console.log(`total:       ${recipes.length}`);
    for (const r of recipes.filter((r) => r.source === "web")) {
      const missing = r.missingIngredients ?? [];
      console.log(`  [web] ${r.name}`);
      console.log(`      url: ${r.sourceUrl}`);
      console.log(`      missing (${missing.length}): ${missing.join(", ") || "(none)"}`);
    }
    if (recipes.some((r) => (r.missingIngredients?.length ?? 0) > MAX_MISSING_INGREDIENTS)) {
      console.log("  FAIL: a recipe over the missing-ingredient limit got through");
      failed = true;
    }
    if (recipes.some((r) => r.source === "web" && (!r.sourceUrl || r.steps.length > 0))) {
      console.log("  FAIL: a web recipe has no source URL or has copied steps");
      failed = true;
    }
    console.log();
  }

  // Route check: valid request returns a list; bad cuisine is rejected.
  const app = express();
  app.use(express.json());
  app.use(recipesRouter);
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  const post = (body: unknown) =>
    fetch(`http://localhost:${port}/api/recipes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  console.log("=== route ===");
  // The route always calls Spoonacular live, so skip the one valid request in fixture mode.
  if (USE_FIXTURES) {
    console.log("valid request: skipped (USE_FIXTURES=true)");
  } else {
    const ok = await post({ ingredients: ["eggs", "spinach"], mealType: "Breakfast" });
    const okBody = await ok.json();
    console.log(`valid request: ${ok.status}, ${okBody.recipes?.length ?? 0} recipes`);
    if (ok.status !== 200 || !Array.isArray(okBody.recipes)) failed = true;
  }

  const bad = await post({ ingredients: ["eggs"], cuisine: "Klingon" });
  console.log(`unknown cuisine: ${bad.status}`);
  if (bad.status !== 400) failed = true;

  const empty = await post({ ingredients: [] });
  console.log(`no ingredients: ${empty.status}`);
  if (empty.status !== 400) failed = true;

  server.close();
  console.log(failed ? "\nSOME CHECKS FAILED" : "\nALL CHECKS PASSED");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
