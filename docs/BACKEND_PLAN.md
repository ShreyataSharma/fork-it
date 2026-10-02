# Fork It Backend v3 Plan

Branch: `backend-v3`

## Stack

- Express + TypeScript
- Supabase
- Keep the recipe JSON schema and pantry staples list from v2 (currently in `server/agents.ts`).
- Delete `server/db.ts` and the old agent logic.

## Pipeline

1. **Parse:** Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) turns text or photo input into an ingredient list. Photo results pass through `server/jev.ts`, a placeholder that returns every item as selected.
2. **Fetch:** Spoonacular `complexSearch` with `includeIngredients`, `diet`, `intolerances`, `sort=max-used-ingredients`, `fillIngredients=true`. Code drops recipes below 60 percent coverage, excluding pantry staples.
3. **Web fallback:** If there are fewer than 10 recipes, Haiku with the web search tool finds real recipes, maps them to the schema, and keeps the source URL.
4. **AI fallback:** If there are still fewer than 10, Haiku generates recipes. Code rejects any recipe that uses ingredients outside the user's list plus pantry staples.
5. **Curate in code:** 4 easy, 3 medium, 3 hard. If a level runs short, fill from the nearest level. If the user picked a cuisine, all 10 match it. Otherwise rotate through `DEFAULT_CUISINES` = Indian, Chinese, Italian, Mexican, Thai, Middle Eastern, Japanese, Korean, with no cuisine repeated more than twice. Order: Spoonacular, then web, then AI. Difficulty and cuisine labels come from a placeholder in `server/jev.ts`.
6. **Sous Chef:** Haiku answers cooking questions only and refuses anything else, including coding.
7. **Supabase:** Routes for save, rate, and comment, with Row Level Security enabled on every table.

## Build steps

- [x] **Step 1:** Set up the Anthropic and Spoonacular clients, read keys from `.env`, and write one test call for each.
- [ ] Step 2+: Pipeline stages above, in order.
