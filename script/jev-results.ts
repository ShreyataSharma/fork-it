// Runs every search case against the Spoonacular fixtures and writes the results to
// script/jev-results.txt. Per case: when the first recipes and each AI recipe would appear,
// AI slots filled, a time breakdown (Spoonacular, Jev, Haiku, total), Jev calls, Anthropic
// rate limits, the difficulty and cuisine split, and every recipe name. Then every staple
// probability sorted high to low. Haiku writes new AI recipes
// each run; staple and same-ingredient answers come from the Supabase cache when present.
//   USE_FIXTURES=true npx tsx script/jev-results.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  AI_UNLISTED_REJECT_MIN,
  CUISINE_MIN_CONFIDENCE,
  DIFFICULTY_MIN_CONFIDENCE,
  JEV_MODEL,
  jevStats,
  MAX_JEV_NAME_WORDS,
  resetJevStats,
  SAME_INGREDIENT_MIN,
  STAPLE_MIN,
  type JevDecision,
} from "../server/jev";
import { AI_TIME_LIMIT_MS, findRecipes, type RecipeSearchResult } from "../server/recipeSearch";
import type { Recipe } from "../shared/recipes";
import { CASES, offSuggestion, searchFor, USE_FIXTURES } from "./recipeCases";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "jev-results.txt");

type CaseRun = {
  result: RecipeSearchResult;
  calls: number;
  callsByJob: Record<string, number>;
  failures: number;
  stapleCached: number;
  stapleTotal: number;
  decisions: JevDecision[];
};

function tally(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return Array.from(counts, ([k, n]) => `${k} ${n}`).join(", ") || "none";
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

async function main() {
  if (!USE_FIXTURES) throw new Error("Run with USE_FIXTURES=true so no Spoonacular calls are made.");
  const runs: CaseRun[] = [];
  for (const c of CASES) {
    console.log(c.name);
    resetJevStats(true);
    const result = await findRecipes(c.request, { spoonacularSearch: searchFor(c) });
    const staples = jevStats.decisions.filter((d) => d.job === "missing" && d.question.startsWith("staple"));
    runs.push({
      result,
      calls: jevStats.calls,
      callsByJob: { ...jevStats.callsByJob },
      failures: jevStats.failures,
      stapleCached: staples.filter((d) => d.cached).length,
      stapleTotal: staples.length,
      decisions: jevStats.decisions,
    });
  }

  const lines: string[] = [];
  const add = (s = "") => lines.push(s);
  add(`Jev results, model ${JEV_MODEL}, ${new Date().toISOString()}`);
  add("USE_FIXTURES=true: Spoonacular responses are read from script/fixtures/, so the Spoonacular time is a file read,");
  add("not a network call. Haiku writes new AI recipes on every run.");
  add(
    `Settings: AI time limit ${secs(AI_TIME_LIMIT_MS)}; staple >= ${STAPLE_MIN}; same ingredient >= ${SAME_INGREDIENT_MIN}; ` +
      `AI backstop reject >= ${AI_UNLISTED_REJECT_MIN}; Spoonacular difficulty confidence >= ${DIFFICULTY_MIN_CONFIDENCE}; ` +
      `cuisine confidence >= ${CUISINE_MIN_CONFIDENCE}; names over ${MAX_JEV_NAME_WORDS} words skip Jev.`,
  );
  add();

  add("PER CASE");
  add("Times are from the start of the search. Jev and Haiku are wall-clock time with at least one call in flight;");
  add("they overlap while AI recipes are checked, so they don't add up to the total.");
  add("Each AI call gets a difficulty, a main ingredient, a suggested method, and a suggested cuisine (rotating through those");
  add("with room under the cap, or the picked ones). Haiku may switch cuisine only if the suggestion clearly doesn't suit;");
  add("Jev labels the cuisine the dish actually is, and that label drives the cap and the card.");
  add("AI recipes refused only by the cap are held; when the calls end, empty slots are filled from them, fewest-on-screen");
  add("cuisine first, and marked [held, over the cuisine cap].");
  const describe = (r: Recipe) => `${r.name}  [${r.source}, ${r.difficulty ?? "?"}, ${r.cuisine || "unlabeled"}]`;
  CASES.forEach((c, i) => {
    const { result, calls, callsByJob, failures, stapleCached, stapleTotal } = runs[i];
    const t = result.timing;
    const slots = Object.values(result.aiRequested).reduce((sum, n) => sum + (n ?? 0), 0);
    const byJob = Object.entries(callsByJob).filter(([job]) => job !== "photo").map(([job, n]) => `${job} ${n}`).join(", ");
    add();
    add(`== ${c.name} ==`);
    add(`first recipes on screen: ${secs(t.firstRecipesMs)} (${result.firstRecipes.length} Spoonacular recipes)`);
    add(
      `AI slots filled: ${result.counts.ai} of ${slots}, from ${result.aiCalls} parallel calls` +
        (slots ? ` (${Object.entries(result.aiRequested).map(([lvl, n]) => `${lvl} ${n}`).join(", ")})` : "") +
        (result.aiTimedOut ? "; time limit reached" : "") +
        (result.aiError ? `; errors: ${result.aiError}` : ""),
    );
    for (const a of result.aiArrivals) {
      add(
        `  AI recipe at ${secs(a.atMs)}: ${a.recipe.name}  (${a.angle.difficulty}, main ${a.angle.mainIngredient}, ` +
          `suggested ${a.angle.suggestedMethod} ${a.angle.suggestedCuisine || "(no cuisine)"}, Jev cuisine ${a.recipe.cuisine || "unlabeled"})` +
          (a.overCap ? "  [held, over the cuisine cap]" : ""),
      );
    }
    for (const a of result.aiAttempts.filter((x) => !x.passed)) {
      add(
        `  not used: ${a.name} (${a.reason}; ${a.angle.difficulty}, main ${a.angle.mainIngredient}, ` +
          `suggested ${a.angle.suggestedCuisine || "(no cuisine)"}, Haiku wrote ${a.haikuCuisine})`,
      );
    }
    const off = result.aiAttempts.filter(offSuggestion);
    if (result.aiAttempts.length) {
      add(
        `  Haiku wrote ${off.length} of ${result.aiAttempts.length} AI recipes in a cuisine other than the one suggested` +
          (off.length ? `: ${off.map((a) => `${a.angle.suggestedCuisine} -> ${a.haikuCuisine}`).join(", ")}` : ""),
      );
    }
    const unanswered = result.aiCalls - result.aiAttempts.length;
    if (unanswered > 0) add(`  ${unanswered} of ${result.aiCalls} calls returned nothing (stopped at the time limit, once every slot was filled, or failed)`);
    add(`time: spoonacular ${secs(t.spoonacularMs)} | jev ${secs(t.jevMs)} | haiku ${secs(t.haikuMs)} | total ${secs(t.totalMs)}`);
    add(`jev calls: ${calls} (${byJob}), ${failures} failed; staples from cache ${stapleCached} of ${stapleTotal}`);
    add(`anthropic rate limits (429): ${result.rateLimited}`);
    add(`final difficulty: ${tally(result.recipes.map((r) => r.difficulty ?? "?"))}`);
    add(`final cuisine:    ${tally(result.recipes.map((r) => r.cuisine || "unlabeled"))}`);
    add("recipes, in screen order:");
    result.recipes.forEach((r, j) => add(`  ${String(j + 1).padStart(2)}. ${describe(r)}`));
  });
  add();
  const total = (f: (x: CaseRun) => number) => runs.reduce((sum, x) => sum + f(x), 0);
  add(
    `All cases: ${total((x) => x.calls)} Jev calls, Jev ${secs(total((x) => x.result.timing.jevMs))}, ` +
      `Haiku ${secs(total((x) => x.result.timing.haikuMs))}, total ${secs(total((x) => x.result.timing.totalMs))}, ` +
      `${total((x) => x.result.rateLimited)} Anthropic rate limits`,
  );
  add();

  // Every staple answer seen, once per ingredient and cuisine.
  const staples = new Map<string, JevDecision>();
  for (const d of runs.flatMap((x) => x.decisions)) {
    if (d.job === "missing" && d.question.startsWith("staple")) staples.set(`${d.subject}|${d.question}`, d);
  }
  const sorted = Array.from(staples.values()).sort((a, b) => b.probability - a.probability || a.subject.localeCompare(b.subject));
  add(`STAPLE PROBABILITIES, HIGH TO LOW (${sorted.length} ingredient and cuisine pairs, ${sorted.filter((d) => d.probability >= STAPLE_MIN).length} at or above ${STAPLE_MIN})`);
  for (const d of sorted) {
    const cuisine = d.question.replace(/^staple in /, "").replace(/ kitchen$/, "");
    add(`  ${d.probability.toFixed(2)}  ${d.subject}  [${cuisine}]${d.probability >= STAPLE_MIN ? "  staple" : ""}`);
  }

  fs.writeFileSync(OUT, lines.join("\n") + "\n");
  console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
  process.exit(total((x) => x.failures) > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
