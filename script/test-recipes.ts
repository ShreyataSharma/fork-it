// Recipe search test: Spoonacular fetch, missing-ingredient filter, Jev labels, the first
// (Spoonacular) batch, parallel AI calls (one per empty slot plus extras) within the time
// limit, and the final list, plus POST /api/recipes streaming through an in-process server.
// VERBOSE=true also prints each AI recipe's ingredients and per-step ingredients.
// Every case prints each Jev decision with its probability, the Jev calls, and a time breakdown.
//
// Live (default): calls Spoonacular and saves each raw response to script/fixtures/.
//   npx tsx script/test-recipes.ts
// Fixtures: reads those saved responses instead of calling Spoonacular (no quota used).
// The AI fallback still calls Anthropic in both modes.
//   USE_FIXTURES=true npx tsx script/test-recipes.ts
import express from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import type { RecipeStreamMessage } from "../shared/recipes";
import { MAX_MISSING_INGREDIENTS } from "../server/recipes";
import { CURATED_COUNT, MAX_PER_CUISINE } from "../server/curate";
import { AI_NAME_REJECT_MIN, AI_UNLISTED_REJECT_MIN, jevStats, resetJevStats, type JevJob } from "../server/jev";
import { AI_TIME_LIMIT_MS, findRecipes } from "../server/recipeSearch";
import { makeRecipesRouter } from "../server/routes/recipes";
import { CASES, offSuggestion, searchFor, USE_FIXTURES } from "./recipeCases";
const VERBOSE = process.env.VERBOSE === "true";

function tally(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return Array.from(counts, ([k, n]) => `${k} ${n}`).join(", ");
}
const JOB_TITLES: Record<JevJob, string> = {
  photo: "photo items",
  missing: "staples and same ingredient",
  labels: "curator labels (Spoonacular)",
  "ai-check": "AI recipe backstop and cuisine",
};

// Every decision recorded during the last search, grouped by job.
function printJevDecisions() {
  for (const job of Object.keys(JOB_TITLES) as JevJob[]) {
    const decisions = jevStats.decisions.filter((d) => d.job === job);
    if (decisions.length === 0) continue;
    console.log(`  jev ${JOB_TITLES[job]}:`);
    for (const d of decisions) {
      console.log(`    ${d.probability.toFixed(2)}  ${d.subject} | ${d.question} -> ${d.outcome}${d.cached ? " (cached)" : ""}`);
    }
  }
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

async function main() {
  let failed = false;
  console.log(`Spoonacular source: ${USE_FIXTURES ? "fixtures (script/fixtures/)" : "live API (recording fixtures)"}`);
  console.log(`AI time limit: ${secs(AI_TIME_LIMIT_MS)}\n`);

  for (const c of CASES) {
    console.log(`=== ${c.name} ===`);
    console.log(`ingredients: ${c.request.ingredients.join(", ")}${c.request.cuisine ? ` | cuisine: ${c.request.cuisine}` : ""}`);
    resetJevStats(true);
    let firstCallbackAt = -1;
    const started = Date.now();
    const result = await findRecipes(c.request, {
      spoonacularSearch: searchFor(c),
      onFirstRecipes: () => (firstCallbackAt = Date.now() - started),
    });
    const { recipes, firstRecipes, candidates, counts, aiAttempts, aiArrivals, aiHeldUnused, aiRequested, aiCalls, aiTimedOut, aiError, rateLimited, timing } = result;
    printJevDecisions();
    const byJob = Object.entries(jevStats.callsByJob).map(([job, n]) => `${job} ${n}`).join(", ");
    console.log(`jev calls:   ${jevStats.calls} (${byJob}), ${jevStats.failures} failed`);
    console.log(
      `time:        spoonacular ${secs(timing.spoonacularMs)}, jev ${secs(timing.jevMs)}, haiku ${secs(timing.haikuMs)}, ` +
        `total ${secs(timing.totalMs)}; first recipes at ${secs(timing.firstRecipesMs)}`,
    );
    console.log(`spoonacular: ${counts.spoonacularFetched} fetched -> ${counts.spoonacular} kept (<= ${MAX_MISSING_INGREDIENTS} missing, with steps)`);
    console.log(`first batch: ${firstRecipes.length} (${tally(firstRecipes.map((r) => r.difficulty ?? "?")) || "none"})`);
    const requested = Object.entries(aiRequested).map(([lvl, n]) => `${lvl} ${n}`).join(", ") || "none";
    console.log(`ai:          slots ${requested}; ${aiCalls} calls, ${aiAttempts.length} returned -> ${counts.ai} accepted${aiTimedOut ? " (time limit reached)" : ""}`);
    console.log(`rate limits: ${rateLimited} Anthropic 429 responses`);
    for (const a of aiArrivals) console.log(`  arrived ${secs(a.atMs)}: ${a.recipe.name}${a.overCap ? " (held, over the cuisine cap)" : ""}`);
    if (aiError) console.log(`ai error:    ${aiError}`);
    console.log(`candidates:  ${candidates.length} -> curated ${recipes.length}`);
    for (const a of aiAttempts) {
      const jev = a.jevUnlisted === null ? "" : ` [jev steps ${a.jevUnlisted.toFixed(2)}, name ${a.jevName!.toFixed(2)}]`;
      const angle =
        `${a.angle.difficulty}, ${a.angle.mainIngredient}, suggested ${a.angle.suggestedMethod} ${a.angle.suggestedCuisine || "(no cuisine)"}, ` +
        `haiku wrote ${a.haikuCuisine}`;
      console.log(`  [ai ${angle}] ${a.name}: ${a.passed ? (a.reason ? `ACCEPTED (${a.reason})` : "ACCEPTED") : `REJECTED (${a.reason})`}${jev}`);
      if (!VERBOSE) continue;
      console.log(`      ingredients: ${a.ingredients.join(", ")}`);
      a.steps.forEach((step, i) => console.log(`      step ${i + 1}: ${step.ingredients.join(", ") || "(none)"}`));
      if (a.unlistedInSteps.length) console.log(`      in steps but not listed: ${a.unlistedInSteps.join(", ")}`);
      if (a.missing.length) console.log(`      not owned: ${a.missing.join(", ")}`);
    }

    const off = aiAttempts.filter(offSuggestion);
    console.log(
      `off cuisine: Haiku wrote ${off.length} of ${aiAttempts.length} AI recipes in a cuisine other than the one suggested` +
        (off.length ? ` (${off.map((a) => `${a.angle.suggestedCuisine} -> ${a.haikuCuisine}`).join(", ")})` : ""),
    );
    console.log("  curated:");
    recipes.forEach((r, i) =>
      console.log(`    ${String(i + 1).padStart(2)}. [${r.source}] ${r.difficulty ?? "?"} | ${r.cuisine || "unlabeled"} | ${r.name}`),
    );
    console.log(`  per difficulty: ${tally(recipes.map((r) => r.difficulty ?? "?"))}`);
    console.log(`  per cuisine:    ${tally(recipes.map((r) => r.cuisine || "unlabeled"))}`);

    const picked: string[] = c.request.cuisine ?? [];
    if (recipes.length > CURATED_COUNT || (candidates.length >= CURATED_COUNT && !picked.length && recipes.length < CURATED_COUNT)) {
      console.log(`  NOTE: curated ${recipes.length} from ${candidates.length} candidates`);
    }
    if (recipes.length > CURATED_COUNT) failed = true;
    if (firstCallbackAt < 0 || firstCallbackAt > timing.totalMs) {
      console.log("  FAIL: the first batch was not sent before the search finished");
      failed = true;
    }
    if (firstRecipes.some((r) => !recipes.includes(r))) {
      console.log("  FAIL: a recipe from the first batch is missing from the final list");
      failed = true;
    }
    if (firstRecipes.some((r) => r.source !== "spoonacular")) {
      console.log("  FAIL: the first batch has a non-Spoonacular recipe");
      failed = true;
    }
    if (timing.totalMs - timing.firstRecipesMs > AI_TIME_LIMIT_MS + 5_000) {
      console.log(`  FAIL: the AI part ran ${secs(timing.totalMs - timing.firstRecipesMs)}, well past the ${secs(AI_TIME_LIMIT_MS)} limit`);
      failed = true;
    }
    if (picked.length && recipes.some((r) => !picked.includes(r.cuisine))) {
      console.log("  FAIL: a curated recipe is outside the picked cuisine");
      failed = true;
    }
    // With no cuisine picked, a cuisine may appear more than MAX_PER_CUISINE times only if no
    // unused recipe in a cuisine under the cap could have taken that slot (same difficulty): a
    // held AI recipe, or a leftover Spoonacular recipe.
    if (!picked.length) {
      const perCuisine = new Map<string, number>();
      for (const r of recipes) if (r.cuisine) perCuisine.set(r.cuisine, (perCuisine.get(r.cuisine) ?? 0) + 1);
      const over = Array.from(perCuisine).filter(([, n]) => n > MAX_PER_CUISINE).map(([cuisine]) => cuisine);
      const unused = [...aiHeldUnused, ...candidates.filter((r) => r.source === "spoonacular" && !recipes.includes(r))];
      const underCap = (r: (typeof recipes)[number]) => !r.cuisine || (perCuisine.get(r.cuisine) ?? 0) < MAX_PER_CUISINE;
      for (const cuisine of over) {
        const extra = recipes.filter((r) => r.cuisine === cuisine).slice(MAX_PER_CUISINE);
        const blocked = extra.filter((r) => unused.some((u) => underCap(u) && u.difficulty === r.difficulty));
        if (blocked.length) {
          console.log(`  FAIL: ${cuisine} appears ${perCuisine.get(cuisine)} times though a recipe in another cuisine could take its slot`);
          failed = true;
        } else {
          console.log(`  NOTE: cuisine cap relaxed for ${cuisine} (${perCuisine.get(cuisine)}); no other cuisine could fill those slots`);
        }
      }
    }
    const levelRank = { Easy: 0, Medium: 1, Hard: 2 } as const;
    const firstRanks = firstRecipes.map((r) => levelRank[r.difficulty ?? "Medium"]);
    if (firstRanks.some((rank, i) => i > 0 && rank < firstRanks[i - 1])) {
      console.log("  FAIL: the first batch is not ordered easy to hard");
      failed = true;
    }
    // Cards never move: the final list is the first batch, then AI recipes in arrival order.
    const expectedPrefix = [...firstRecipes, ...aiArrivals.map((a) => a.recipe)];
    if (expectedPrefix.some((r, i) => recipes[i] !== r)) {
      console.log("  FAIL: the final list doesn't start with the first batch then AI recipes in arrival order");
      failed = true;
    }
    const names = recipes.map((r) => r.name.toLowerCase().trim());
    if (new Set(names).size !== names.length) {
      console.log("  FAIL: duplicate recipe names");
      failed = true;
    }

    if (recipes.some((r) => r.steps.length === 0)) {
      console.log("  FAIL: a recipe has no steps");
      failed = true;
    }
    if (recipes.some((r) => r.source === "spoonacular" && (r.missingIngredients?.length ?? 0) > MAX_MISSING_INGREDIENTS)) {
      console.log("  FAIL: a Spoonacular recipe over the missing-ingredient limit got through");
      failed = true;
    }
    // An AI recipe may use an ingredient the code rules call missing when Jev covered it, so
    // check the attempt's missing list, which includes Jev's answers.
    const ai = recipes.filter((r) => r.source === "ai");
    if (aiAttempts.some((a) => a.passed && a.missing.length > 0) || ai.some((r) => r.macros)) {
      console.log("  FAIL: an AI recipe uses an ingredient the user lacks, or has estimated nutrition");
      failed = true;
    }
    if (aiArrivals.some((a) => a.recipe.difficulty !== a.angle.difficulty)) {
      console.log("  FAIL: an AI recipe's difficulty differs from the level it was written at");
      failed = true;
    }
    // AI recipes may only fill empty slots, never more per level than requested.
    for (const [lvl, n] of Object.entries(aiRequested)) {
      const filled = aiArrivals.filter((a) => a.recipe.difficulty === lvl).length;
      if (filled > n!) {
        console.log(`  FAIL: ${filled} AI recipes at ${lvl} for ${n} slots`);
        failed = true;
      }
    }
    if (picked.length > 0 && aiArrivals.some((a) => !picked.includes(a.recipe.cuisine))) {
      console.log("  FAIL: an AI recipe's Jev cuisine is not a picked cuisine");
      failed = true;
    }
    // Every accepted AI recipe was checked by Jev for unlisted ingredients in its steps and name.
    const accepted = aiAttempts.filter((a) => a.passed);
    if (accepted.some((a) => (a.jevUnlisted ?? 0) >= AI_UNLISTED_REJECT_MIN || (a.jevName ?? 0) >= AI_NAME_REJECT_MIN)) {
      console.log("  FAIL: an accepted AI recipe is over a Jev backstop threshold");
      failed = true;
    }
    if (c.expectAi && counts.ai === 0) {
      console.log("  FAIL: expected AI recipes");
      failed = true;
    }
    if (c.minAiFilled !== undefined && counts.ai < c.minAiFilled) {
      const slots = Object.values(aiRequested).reduce((sum, n) => sum + (n ?? 0), 0);
      console.log(`  FAIL: AI filled ${counts.ai} of ${slots} slots; at least ${c.minAiFilled} required`);
      failed = true;
    }
    console.log();
  }

  // Route check. In fixture mode the route reads the short-list fixture instead of calling
  // Spoonacular; live mode calls Spoonacular.
  const routeCase = CASES.find((c) => c.fixture === "short-list")!;
  const app = express();
  app.use(express.json());
  app.use(makeRecipesRouter(USE_FIXTURES ? searchFor(routeCase) : undefined));
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
  const started = Date.now();
  const ok = await post(routeCase.request);
  const lines: { at: number; msg: RecipeStreamMessage }[] = [];
  const reader = ok.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (line) lines.push({ at: Date.now() - started, msg: JSON.parse(line) });
    }
  }
  console.log(`valid request: ${ok.status}, ${ok.headers.get("content-type")}`);
  for (const { at, msg } of lines) {
    const what =
      msg.type === "first" ? `first: ${msg.recipes.length} recipes, aiPending ${msg.aiPending}`
      : msg.type === "ai" ? `ai: ${msg.recipe.name}`
      : msg.type === "done" ? `done: ${msg.recipes.length} recipes`
      : `error: ${msg.error}`;
    console.log(`  ${secs(at)}: ${what}`);
  }
  // Expect "first", then any "ai" messages, then "done" if AI was pending; "done" starts with
  // every card already sent, in order.
  const msgs = lines.map((l) => l.msg);
  const firstMsg = msgs[0];
  const sent = firstMsg?.type === "first" ? [...firstMsg.recipes] : [];
  let streamOk = ok.status === 200 && firstMsg?.type === "first";
  for (const msg of msgs.slice(1, firstMsg?.type === "first" && firstMsg.aiPending ? -1 : undefined)) {
    if (msg.type === "ai") sent.push(msg.recipe);
    else streamOk = false;
  }
  if (firstMsg?.type === "first" && firstMsg.aiPending) {
    const last = msgs[msgs.length - 1];
    streamOk &&= msgs.length >= 2 && last.type === "done" && sent.every((r, i) => last.recipes[i]?.name === r.name);
  }
  if (!streamOk) {
    console.log("  FAIL: expected first, then ai messages, then done starting with every card sent");
    failed = true;
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
