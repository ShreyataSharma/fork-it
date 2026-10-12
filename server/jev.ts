// Jev (TypeSafe System One) judgments, with the questions and thresholds kept here for review.
// Code checks run first and Jev only answers what code can't decide. If a Jev call fails or
// TYPESAFE_API_KEY is unset, each job logs the error and falls back to its placeholder rule.
import pLimit from "p-limit";
import { choice, noul, TypeSafeClient, type EntryType, type NoulQuestion, type Questions, type SystemOneResult } from "@typesafe-ai/sdk";
import { CUISINES, type Difficulty, type Recipe, type RecipeSource } from "../shared/recipes";
import { env } from "./env";
import { getSameAnswers, getStapleAnswers, sameKey, saveSameAnswers, saveStapleAnswers, stapleKey } from "./jevCache";
import { cleanIngredientName, missingFrom, sameByWordRule } from "./pantry";
import { BusyTimer } from "./timing";

// Pinned so thresholds tuned against this version don't drift when `jev-latest` moves.
export const JEV_MODEL = "jev-1.13.0";
// Requests in flight at once, well under the 80 requests/second limit.
const JEV_CONCURRENCY = 8;

// Photo items. A photo item is hidden when its ingredient probability is below PHOTO_HIDE_BELOW.
// It starts selected when the probability is at least PHOTO_INGREDIENT_MIN and Jev names its
// identity (not "unsure") with at least PHOTO_IDENTITY_MIN_CONFIDENCE; otherwise unselected.
export const PHOTO_HIDE_BELOW = 0.2;
export const PHOTO_INGREDIENT_MIN = 0.8;
export const PHOTO_IDENTITY_MIN_CONFIDENCE = 0.5;
// Missing-ingredient names with more words than this (after cleaning) are scraped text such as
// "then add water and cook till meat is tender"; they count as missing without asking Jev.
export const MAX_JEV_NAME_WORDS = 5;
// A missing ingredient counts as a staple only at or above this probability.
export const STAPLE_MIN = 0.9;
// A user's ingredient covers a recipe ingredient only at or above this probability.
export const SAME_INGREDIENT_MIN = 0.9;
// Below these confidences the placeholder difficulty is kept and the cuisine stays unlabeled.
export const DIFFICULTY_MIN_CONFIDENCE = 0.3;
export const CUISINE_MIN_CONFIDENCE = 0.5;
// An AI recipe is rejected when the chance that a step uses an unlisted ingredient is at least this.
export const AI_UNLISTED_REJECT_MIN = 0.5;
// An AI recipe is rejected when the chance that its name mentions an unlisted ingredient is at least this.
export const AI_NAME_REJECT_MIN = 0.5;

const UNSURE = "unsure";
const OTHER_CUISINE = "other";

export type JevJob = "photo" | "missing" | "labels" | "ai-check";

export type JevDecision = {
  job: JevJob;
  subject: string;
  question: string;
  // Noul probability, or the selected Choice option's confidence.
  probability: number;
  outcome: string;
  cached?: boolean;
};

// Call counts, plus every decision when `record` is on (tests only; off in the server).
const jevTimer = new BusyTimer();

export const jevStats = {
  calls: 0,
  failures: 0,
  // Wall-clock time with at least one Jev request in flight.
  get busyMs() {
    return jevTimer.ms;
  },
  callsByJob: { photo: 0, missing: 0, labels: 0, "ai-check": 0 } as Record<JevJob, number>,
  record: false,
  decisions: [] as JevDecision[],
};

export function resetJevStats(record = false) {
  jevStats.calls = 0;
  jevStats.failures = 0;
  jevTimer.reset();
  for (const job of Object.keys(jevStats.callsByJob) as JevJob[]) jevStats.callsByJob[job] = 0;
  jevStats.record = record;
  jevStats.decisions = [];
}

function recordDecision(d: JevDecision) {
  if (jevStats.record) jevStats.decisions.push(d);
}

let client: TypeSafeClient | null | undefined;
const limit = pLimit(JEV_CONCURRENCY);

function jevClient(): TypeSafeClient | null {
  if (client !== undefined) return client;
  if (!env.TYPESAFE_API_KEY) {
    console.warn("[jev] TYPESAFE_API_KEY is not set; using placeholder behavior.");
    client = null;
  } else {
    client = new TypeSafeClient({ apiKey: env.TYPESAFE_API_KEY, defaultModel: JEV_MODEL });
  }
  return client;
}

// One Jev request. Returns null on any failure so callers can fall back; failures are logged
// unless `signal` was aborted (the AI time limit ran out), which is expected.
async function ask<const Q extends Questions>(
  job: JevJob,
  state: EntryType,
  questions: Q,
  signal?: AbortSignal,
): Promise<SystemOneResult<Q> | null> {
  const c = jevClient();
  if (!c || signal?.aborted) return null;
  jevStats.calls++;
  jevStats.callsByJob[job]++;
  try {
    const result = await limit(() => jevTimer.time(() => c.systemOne({ model: JEV_MODEL, state, questions }, { signal })));
    if (result.model !== JEV_MODEL) console.warn(`[jev] asked for ${JEV_MODEL} but ${result.model} answered`);
    return result;
  } catch (err) {
    if (signal?.aborted) return null;
    jevStats.failures++;
    console.error(`[jev] ${job} request failed: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`);
    return null;
  }
}

const pct = (p: number) => p.toFixed(2);

// ---------------------------------------------------------------------------------------------
// 1. Photo items

export type FridgeItem = { name: string; description: string; alternatives?: string[] };
export type ClassifiedFridgeItem = { name: string; description: string; selected: boolean; confidence: number | null };

const IS_INGREDIENT_CRITERIA = {
  true: "Food, drink, seasoning, sauce, or condiment, whether raw, cooked, or packaged.",
  false: "Not food: a container, utensil, appliance, medicine, cleaning product, or an object that can't be identified.",
};

// Haiku's name goes in the instructions, not the state, so the identity question judges only
// what was seen. With the name in the state, Jev echoed Haiku's pick even for unlabeled tubs.
function isIngredientQuestion(item: FridgeItem) {
  return noul(
    {
      question: "Is the item in `item`, which the photo reader called `detected_as`, a food or drink a cook could use as an ingredient?",
      detected_as: item.name,
    },
    IS_INGREDIENT_CRITERIA,
  );
}

// item.name is already cleaned.
function identityQuestion(item: FridgeItem) {
  const options = Array.from(new Set([item.name, ...(item.alternatives ?? []).map(cleanIngredientName)])).filter(
    (o) => o && o !== UNSURE,
  );
  const criteria: Record<string, string | null> = Object.fromEntries(options.map((o) => [o, null]));
  criteria[UNSURE] = "What was seen in `item` doesn't clearly point to one of the other options.";
  return choice("Which of these exactly is the item in `item`?", criteria);
}

// Placeholder for one item: selected, no confidence.
const unclassified = (item: FridgeItem): ClassifiedFridgeItem => ({
  name: item.name,
  description: item.description,
  selected: true,
  confidence: null,
});

// One request per item asks both questions. Hidden items are left out of the result. A
// confidently identified item takes Jev's pick as its name.
export async function classifyFridgeItems(items: FridgeItem[]): Promise<ClassifiedFridgeItem[]> {
  const results = await Promise.all(
    items.map(async (original): Promise<ClassifiedFridgeItem | null> => {
      const item = { ...original, name: cleanIngredientName(original.name) };
      if (!item.name) return unclassified(original);
      const res = await ask(
        "photo",
        { item: { what_was_seen: item.description } },
        { is_ingredient: isIngredientQuestion(item), identity: identityQuestion(item) },
      );
      if (!res) return unclassified(item);

      const p = res.answers.is_ingredient.noul;
      const id = res.answers.identity;
      const identified = id.choice !== UNSURE && id.confidence >= PHOTO_IDENTITY_MIN_CONFIDENCE;
      const hidden = p < PHOTO_HIDE_BELOW;
      const selected = !hidden && identified && p >= PHOTO_INGREDIENT_MIN;
      const name = identified ? id.choice : item.name;
      const outcome = hidden ? "hidden" : selected ? "selected" : "unselected";
      const probs = Object.entries(id.probabilities).map(([o, q]) => `${o} ${pct(q)}`).join(", ");
      recordDecision({ job: "photo", subject: item.name, question: "is a cooking ingredient", probability: p, outcome });
      recordDecision({
        job: "photo",
        subject: item.name,
        question: `identity [${probs}]`,
        probability: id.confidence,
        outcome: `${id.choice}${identified ? "" : " (not confident)"}${name !== item.name ? `, renamed to "${name}"` : ""}`,
      });
      if (hidden) return null;
      return { name, description: item.description, selected, confidence: id.choice === UNSURE ? 0 : Math.min(p, id.confidence) };
    }),
  );
  return results.filter((r): r is ClassifiedFridgeItem => r !== null);
}

// ---------------------------------------------------------------------------------------------
// 2 and 3. Staples and same ingredient, for ingredients the code rules call missing

const SAME_CRITERIA = {
  true: "The same ingredient under another name, or a specific kind of it, e.g. 'scallion' for 'green onion' or 'roma tomato' for 'tomato'.",
  false: "A different ingredient, even one that could be used as a substitute, e.g. 'lemon' for 'lime', 'butter' for 'margarine', or 'yogurt' for 'sour cream'.",
};

function sameQuestion(owned: string): NoulQuestion {
  return noul(
    { question: "The recipe needs `need` and the cook has `owned`. Is `owned` the same ingredient as `need`, so the cook already has it?", owned },
    SAME_CRITERIA,
  );
}

const STAPLE_CRITERIA = {
  true: "Almost every such home already has it, so the cook would not need to buy it.",
  false: "Many such homes would need to buy it.",
};

// cuisine is "" when the recipe has none.
function stapleQuestion(cuisine: string): NoulQuestion {
  return noul(
    cuisine
      ? { question: "Would almost every home that regularly cooks `cuisine` food already have `need` on hand, without buying it?", cuisine }
      : "Would almost every home that cooks regularly already have `need` on hand, without buying it?",
    STAPLE_CRITERIA,
  );
}

const cuisineKey = (cuisine: string) => cuisine.trim().toLowerCase();

export type MissingCheck = { ingredients: string[]; cuisine: string };

// For each recipe, the ingredients the user lacks. Code first: the staples list and the word
// rule. For what's left, cached answers, then one Jev request per ingredient asking whether each
// of the user's ingredients the word rule can't judge is the same ingredient, and whether it's a
// staple for each cuisine it appears in. Every new answer is saved. Names are cleaned first;
// a name with nothing left after cleaning ("▢ 2") isn't an ingredient and is dropped, and one
// longer than MAX_JEV_NAME_WORDS stays missing without a Jev call.
export async function findMissing(recipes: MissingCheck[], userIngredients: string[], signal?: AbortSignal): Promise<string[][]> {
  const codeMissing = recipes.map((r) =>
    missingFrom(r.ingredients, userIngredients).filter((n) => cleanIngredientName(n) !== ""),
  );
  const users = Array.from(new Set(userIngredients.map(cleanIngredientName))).filter(Boolean);

  // Each missing ingredient, with the cuisines of the recipes that need it.
  const cuisinesFor = new Map<string, Set<string>>();
  recipes.forEach((r, i) => {
    for (const n of codeMissing[i]) {
      const name = cleanIngredientName(n);
      if (name.split(" ").length > MAX_JEV_NAME_WORDS) continue;
      if (!cuisinesFor.has(name)) cuisinesFor.set(name, new Set());
      cuisinesFor.get(name)!.add(cuisineKey(r.cuisine));
    }
  });
  const names = Array.from(cuisinesFor.keys());
  if (names.length === 0) return codeMissing;

  const [cachedStaple, cachedSame] = await Promise.all([getStapleAnswers(names, JEV_MODEL), getSameAnswers(names, JEV_MODEL)]);
  const staple = new Map(cachedStaple);
  const same = new Map(cachedSame);
  const undecidedPairs = (name: string) => users.filter((u) => sameByWordRule(name, u) === null);
  const stapleRows: { ingredient: string; cuisine: string; probability: number }[] = [];
  const sameRows: { recipe_ingredient: string; user_ingredient: string; probability: number }[] = [];

  await Promise.all(
    names.map(async (name) => {
      const pairs = undecidedPairs(name);
      if (pairs.some((u) => (same.get(sameKey(name, u)) ?? 0) >= SAME_INGREDIENT_MIN)) return;
      const askPairs = pairs.filter((u) => !same.has(sameKey(name, u)));
      const askCuisines = Array.from(cuisinesFor.get(name)!).filter((c) => !staple.has(stapleKey(name, c)));
      if (askPairs.length === 0 && askCuisines.length === 0) return;

      const questions: Record<string, NoulQuestion> = {};
      askPairs.forEach((u, i) => (questions[`same_${i}`] = sameQuestion(u)));
      askCuisines.forEach((c, i) => (questions[`staple_${i}`] = stapleQuestion(c)));
      const res = await ask("missing", { need: name }, questions, signal);
      if (!res) return;

      askPairs.forEach((u, i) => {
        const probability = res.answers[`same_${i}`].noul;
        same.set(sameKey(name, u), probability);
        sameRows.push({ recipe_ingredient: name, user_ingredient: u, probability });
      });
      askCuisines.forEach((c, i) => {
        const probability = res.answers[`staple_${i}`].noul;
        staple.set(stapleKey(name, c), probability);
        stapleRows.push({ ingredient: name, cuisine: c, probability });
      });
    }),
  );
  await Promise.all([saveStapleAnswers(stapleRows, JEV_MODEL), saveSameAnswers(sameRows, JEV_MODEL)]);

  if (jevStats.record) {
    for (const name of names) {
      for (const u of undecidedPairs(name)) {
        const p = same.get(sameKey(name, u));
        if (p === undefined) continue;
        recordDecision({
          job: "missing",
          subject: name,
          question: `same as user's "${u}"`,
          probability: p,
          outcome: p >= SAME_INGREDIENT_MIN ? "covered" : "not covered",
          cached: cachedSame.has(sameKey(name, u)),
        });
      }
      for (const c of Array.from(cuisinesFor.get(name)!)) {
        const p = staple.get(stapleKey(name, c));
        if (p === undefined) continue;
        recordDecision({
          job: "missing",
          subject: name,
          question: `staple in ${c || "a typical"} kitchen`,
          probability: p,
          outcome: p >= STAPLE_MIN ? "staple" : "not staple",
          cached: cachedStaple.has(stapleKey(name, c)),
        });
      }
    }
  }

  return recipes.map((r, i) =>
    codeMissing[i].filter((n) => {
      const name = cleanIngredientName(n);
      const covered =
        users.some((u) => (same.get(sameKey(name, u)) ?? 0) >= SAME_INGREDIENT_MIN) ||
        (staple.get(stapleKey(name, cuisineKey(r.cuisine))) ?? 0) >= STAPLE_MIN;
      return !covered;
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// 4. Curator labels

const DIFFICULTY_LABEL: Record<string, Difficulty> = { easy: "Easy", medium: "Medium", hard: "Hard" };

// Jev labels Spoonacular recipes with these; Haiku writes AI recipes to the same descriptions,
// and its level is final.
export const DIFFICULTY_MARKERS: Record<Difficulty, string> = {
  Easy: "One component, 30 minutes or less of active cooking, and only basic techniques such as chopping, boiling, roasting on a tray, or stir-frying.",
  Medium: "Two components cooked separately (such as a main and its sauce or side), 30 to 60 minutes of active cooking, or techniques such as searing then braising, making a pan sauce, or cooking rice and a curry together.",
  Hard: "Several separate components, more than an hour of active cooking, or advanced techniques such as deep frying, making dough from scratch, or deboning.",
};

const DIFFICULTY = choice("How hard is `recipe` for a home cook to make?", {
  easy: DIFFICULTY_MARKERS.Easy,
  medium: DIFFICULTY_MARKERS.Medium,
  hard: DIFFICULTY_MARKERS.Hard,
});

// What the two umbrella cuisines cover, so they don't absorb the specific ones listed beside
// them. Used by Jev's cuisine label and in the AI recipe prompt.
export const CUISINE_NOTES: Partial<Record<string, string>> = {
  Asian: "Asian cooking that isn't specifically Korean, Thai, Chinese, or Indian, such as Japanese, Vietnamese, or pan-Asian.",
  Mediterranean: "Mediterranean cooking that isn't specifically Greek or Italian, such as Spanish, Levantine, or North African.",
};

const CUISINE = choice("Which cuisine is `recipe`?", {
  ...Object.fromEntries(CUISINES.map((c) => [c, CUISINE_NOTES[c] ?? null])),
  [OTHER_CUISINE]: "None of the listed cuisines, or no clear cuisine, e.g. American, French, or a generic dish.",
});

function recipeState(r: Recipe) {
  return {
    recipe: {
      name: r.name,
      prep_time: r.prepTime,
      cook_time: r.cookTime,
      ingredients: r.allIngredients.map((i) => cleanIngredientName(i.name)).filter(Boolean),
      steps: r.steps,
    },
  };
}

type LabelAnswers = {
  difficulty?: { choice: string; confidence: number; probabilities: Readonly<Record<string, number>> };
  cuisine?: { choice: string; confidence: number; probabilities: Readonly<Record<string, number>> };
};

// Apply label answers to a recipe that carries placeholder labels.
function applyLabels(r: Recipe, a: LabelAnswers): Recipe {
  const fmt = (p: Readonly<Record<string, number>>) =>
    Object.entries(p).filter(([, q]) => q >= 0.01).map(([o, q]) => `${o} ${pct(q)}`).join(", ");
  let difficulty = r.difficulty;
  if (a.difficulty) {
    const useDifficulty = a.difficulty.confidence >= DIFFICULTY_MIN_CONFIDENCE;
    if (useDifficulty) difficulty = DIFFICULTY_LABEL[a.difficulty.choice];
    recordDecision({
      job: "labels",
      subject: r.name,
      question: `difficulty [${fmt(a.difficulty.probabilities)}]`,
      probability: a.difficulty.confidence,
      outcome: useDifficulty ? `${difficulty} (placeholder ${r.difficulty})` : `kept placeholder ${r.difficulty}`,
    });
  }
  let cuisine = r.cuisine;
  if (a.cuisine) {
    const useCuisine = a.cuisine.choice !== OTHER_CUISINE && a.cuisine.confidence >= CUISINE_MIN_CONFIDENCE;
    cuisine = useCuisine ? a.cuisine.choice : "";
    recordDecision({
      job: "labels",
      subject: r.name,
      question: `cuisine [${fmt(a.cuisine.probabilities)}]`,
      probability: a.cuisine.confidence,
      outcome: useCuisine ? cuisine : "unlabeled",
    });
  }
  return { ...r, difficulty, cuisine };
}

// Label difficulty for every recipe, and cuisine for those the code left unlabeled. Recipes keep
// their placeholder labels when Jev fails.
export async function labelRecipes(recipes: Recipe[]): Promise<Recipe[]> {
  return Promise.all(
    recipes.map(async (r) => {
      const res = r.cuisine
        ? await ask("labels", recipeState(r), { difficulty: DIFFICULTY })
        : await ask("labels", recipeState(r), { difficulty: DIFFICULTY, cuisine: CUISINE });
      return res ? applyLabels(r, res.answers as LabelAnswers) : r;
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// 5. AI recipe backstop, asked together with the AI recipe's cuisine label

const UNLISTED_IN_STEPS = noul("Does any step in `recipe.steps` use a food ingredient that is not in `recipe.ingredients`?", {
  true: "At least one step adds or uses a food, seasoning, liquid, or garnish that `recipe.ingredients` does not list.",
  false: "Every food the steps use is in `recipe.ingredients`, even if a step words it differently ('the chicken' for 'chicken breast'). Equipment, heat, and the dish itself don't count.",
});

const UNLISTED_IN_NAME = noul("Does `recipe.name` mention a food ingredient that is not in `recipe.ingredients`?", {
  true: "The name names a food, sauce, herb, or seasoning that `recipe.ingredients` does not list, e.g. 'Gochujang Rice Bowl' with no gochujang listed.",
  false: "Every food the name mentions is in `recipe.ingredients`, even if worded differently. Dish types (curry, salad, stir fry), cooking methods, and cuisines don't count.",
});

export type AiRecipeCheck = {
  recipe: Recipe;
  // Null when Jev wasn't reached.
  unlistedProbability: number | null;
  nameProbability: number | null;
  rejected: boolean;
  reason?: string;
};

// For AI recipes that passed the code checks, one request per recipe: whether a step or the
// name likely uses an unlisted ingredient, and which cuisine the dish actually is. That cuisine
// label replaces the placeholder. AI recipes keep the difficulty Haiku wrote them at. On failure
// the recipe passes with its placeholder cuisine, unless `signal` was aborted: then it isn't
// checked and the caller drops it.
export async function checkAiRecipes(recipes: Recipe[], signal?: AbortSignal): Promise<AiRecipeCheck[]> {
  return Promise.all(
    recipes.map(async (r): Promise<AiRecipeCheck> => {
      const res = await ask(
        "ai-check",
        recipeState(r),
        { unlisted: UNLISTED_IN_STEPS, name: UNLISTED_IN_NAME, cuisine: CUISINE },
        signal,
      );
      if (!res) return { recipe: r, unlistedProbability: null, nameProbability: null, rejected: false };
      const p = res.answers.unlisted.noul;
      const pName = res.answers.name.noul;
      const reason =
        p >= AI_UNLISTED_REJECT_MIN ? "Jev: a step likely uses an ingredient not in the list"
        : pName >= AI_NAME_REJECT_MIN ? "Jev: the name likely mentions an ingredient not in the list"
        : undefined;
      recordDecision({ job: "ai-check", subject: r.name, question: "a step uses an unlisted ingredient", probability: p, outcome: p >= AI_UNLISTED_REJECT_MIN ? "rejected" : "passed" });
      recordDecision({ job: "ai-check", subject: r.name, question: "the name mentions an unlisted ingredient", probability: pName, outcome: pName >= AI_NAME_REJECT_MIN ? "rejected" : "passed" });
      // Label the cuisine from scratch: the placeholder must not survive a low-confidence answer.
      const labeled = applyLabels({ ...r, cuisine: "" }, res.answers as LabelAnswers);
      return { recipe: labeled, unlistedProbability: p, nameProbability: pName, rejected: reason !== undefined, reason };
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// Placeholder labels, used as the fallback and as the starting label before Jev runs.

// Easy if total time is 30 min or less with 6 steps or fewer, medium if 60 min or less, hard
// otherwise. Unknown total time counts as medium.
export function labelDifficulty(recipe: { totalMinutes: number | null; stepCount: number }): Difficulty {
  const { totalMinutes, stepCount } = recipe;
  if (totalMinutes === null) return "Medium";
  if (totalMinutes <= 30 && stepCount <= 6) return "Easy";
  if (totalMinutes <= 60) return "Medium";
  return "Hard";
}

// Spoonacular recipes use Spoonacular's cuisine: the one the user picked if it's listed, else
// the first one in the Home picker, else the first listed. AI recipes use the cuisine they were
// generated for. Anything else is unlabeled (""), and Jev labels it.
export function labelCuisine(recipe: {
  source: RecipeSource;
  // Spoonacular's `cuisines` list, or the cuisine Haiku reported for an AI recipe.
  cuisines: string[];
  // Cuisines the user picked.
  requested: string[];
}): string {
  const { source, cuisines, requested } = recipe;
  if (source === "spoonacular") {
    return (
      cuisines.find((c) => requested.includes(c)) ??
      cuisines.find((c) => (CUISINES as readonly string[]).includes(c)) ??
      cuisines[0] ??
      ""
    );
  }
  if (requested.length === 0) return "";
  return cuisines.find((c) => requested.includes(c)) ?? requested[0];
}
