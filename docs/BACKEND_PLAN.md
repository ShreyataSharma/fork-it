# Fork It Backend v3 Plan

Branch: `backend-v3`

## Stack

- Express + TypeScript
- Supabase
- Keep the recipe JSON schema and pantry staples list from v2 (currently in `server/agents.ts`).
- Delete `server/db.ts` and the old agent logic.

## Pipeline

1. **Parse:** Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) turns text or photo input into an ingredient list. Photo results pass through `server/jev.ts`, a placeholder that returns every item as selected.
2. **Fetch:** Spoonacular `complexSearch` with `includeIngredients`, `cuisine`, `type` (Breakfast → `breakfast`, Snacks → `snack`, Lunch/Dinner/none → `main course`), `diet`, `intolerances`, `sort=max-used-ingredients`, `fillIngredients=true`, `ignorePantry=true`. Code drops recipes without instructions, then keeps a recipe only if it needs at most `MAX_MISSING_INGREDIENTS` (3) ingredients the user doesn't have, not counting pantry staples. A recipe ingredient counts as owned if it contains one of the user's ingredients as whole words ("long grain rice" contains "rice"), unless it is a derived product (broth, stock, sauce, paste, butter, milk, oil, powder, vinegar, flour, wine).
3. **AI fallback:** If there are fewer than 10 recipes, Haiku generates the remaining number plus 3 extra from the user's ingredients plus pantry staples, honoring cuisine and meal type; the first ones to pass are kept. Each step lists the ingredients it uses. Code rejects any recipe with even one ingredient outside that list (in the ingredient list or any step), or a step ingredient missing from the recipe's own list, using the same matching as step 2, and asks once more for any slots left. If still short, it returns what it has. AI recipes have full steps, no nutrition, and an AI-generated badge.
4. **Full recipes, one required link:** every recipe card holds the full recipe; there are no "view full recipe" links. The only external link is the source credit on Spoonacular recipes (`Source: site name`, linked to the original page), which Spoonacular's terms require: "You must credit the original source in the same manner", meaning the site name with a hyperlink.
5. **Curate in code** (`server/curate.ts`): 4 easy, 3 medium, 3 hard. If a level runs short, fill from the nearest level (Medium tries Easy first). If the user picked a cuisine, only recipes labeled with it are kept. Otherwise no cuisine label appears more than twice, and unlabeled recipes can fill any slot. Order: Spoonacular, then AI, easy to hard within each. With fewer than 10 eligible recipes, all are returned in that order. Labels come from placeholders in `server/jev.ts`: `labelDifficulty` (easy: 30 min or less and 6 steps or fewer; medium: 60 min or less; hard: otherwise) and `labelCuisine` (Spoonacular's cuisine; for AI recipes, the cuisine they were generated for; otherwise unlabeled).
6. **Sous Chef:** Haiku answers cooking questions only and refuses anything else, including coding.
7. **Supabase:** Routes for save, rate, and comment, with Row Level Security enabled on every table.

## Build steps

- [x] **Step 1:** Set up the Anthropic and Spoonacular clients, read keys from `.env`, and write one test call for each.
- [x] **Step 2:** Parse text or photo input into ingredients.
- [x] **Step 3:** Spoonacular fetch and missing-ingredient filter.
- [x] **Step 4:** Web search fallback. Dropped in Step 5: every card must hold the full recipe.
- [x] **Step 5:** AI recipe fallback.
- [x] **Step 6:** Curator with placeholder labels.
- [ ] Step 7+: Sous Chef, Supabase routes.

Testing: `npx tsx script/test-recipes.ts` calls Spoonacular live and records responses to `script/fixtures/` (gitignored). `USE_FIXTURES=true` replays them without using Spoonacular quota.
