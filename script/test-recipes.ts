// Step 3 test: Spoonacular fetch and missing-ingredient filter against the live API,
// plus one POST /api/recipes call through an in-process server.
// Run with: npx tsx script/test-recipes.ts
import express from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import type { RecipeSearchRequest } from "../shared/recipes";
import { fetchSpoonacularRecipes, MAX_MISSING_INGREDIENTS } from "../server/recipes";
import { recipesRouter } from "../server/routes/recipes";

const CASES: { name: string; request: RecipeSearchRequest }[] = [
  {
    name: "common list",
    request: { ingredients: ["chicken breast", "rice", "broccoli", "garlic", "onion", "cheddar", "tomato"] },
  },
  { name: "short list (2 items)", request: { ingredients: ["eggs", "spinach"] } },
  {
    name: "cuisine picked (Indian)",
    request: { ingredients: ["chicken", "tomato", "onion", "yogurt", "rice"], cuisine: ["Indian"] },
  },
];

async function main() {
  let failed = false;

  for (const c of CASES) {
    console.log(`=== ${c.name} ===`);
    console.log(`ingredients: ${c.request.ingredients.join(", ")}${c.request.cuisine ? ` | cuisine: ${c.request.cuisine}` : ""}`);
    const { fetched, recipes } = await fetchSpoonacularRecipes(c.request);
    console.log(`before filter: ${fetched}`);
    console.log(`after filter (<= ${MAX_MISSING_INGREDIENTS} missing): ${recipes.length}`);
    for (const r of recipes) {
      const missing = r.missingIngredients ?? [];
      console.log(`  - ${r.name} [${r.cuisine || "no cuisine"}]`);
      console.log(`      uses: ${r.mainIngredients.join(", ") || "(none)"}`);
      console.log(`      missing (${missing.length}): ${missing.join(", ") || "(none)"}`);
    }
    if (recipes.some((r) => (r.missingIngredients?.length ?? 0) > MAX_MISSING_INGREDIENTS || r.source !== "spoonacular")) {
      console.log("  FAIL: a recipe over the missing-ingredient limit or with the wrong source got through");
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
  const ok = await post({ ingredients: ["eggs", "spinach"], mealType: "Breakfast" });
  const okBody = await ok.json();
  console.log(`valid request: ${ok.status}, ${okBody.recipes?.length ?? 0} recipes`);
  if (ok.status !== 200 || !Array.isArray(okBody.recipes)) failed = true;

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
