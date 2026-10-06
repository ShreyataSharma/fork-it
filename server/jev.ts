// Placeholders for JEV classification and labels. Real logic comes later.
import { CUISINES, type Difficulty, type RecipeSource } from "../shared/recipes";

export type FridgeItem = { name: string; description: string };
export type ClassifiedFridgeItem = FridgeItem & { selected: boolean; confidence: number | null };

// Placeholder: marks every photo item as selected with no confidence score.
export function classifyFridgeItems(items: FridgeItem[]): ClassifiedFridgeItem[] {
  return items.map((item) => ({ ...item, selected: true, confidence: null }));
}

// Placeholder difficulty label: easy if total time is 30 min or less with 6 steps or fewer,
// medium if 60 min or less, hard otherwise. Unknown total time counts as medium.
export function labelDifficulty(recipe: { totalMinutes: number | null; stepCount: number }): Difficulty {
  const { totalMinutes, stepCount } = recipe;
  if (totalMinutes === null) return "Medium";
  if (totalMinutes <= 30 && stepCount <= 6) return "Easy";
  if (totalMinutes <= 60) return "Medium";
  return "Hard";
}

// Placeholder cuisine label. Spoonacular recipes use Spoonacular's cuisine: the one the user
// picked if it's listed, else the first one in the Home picker, else the first listed.
// AI recipes use the cuisine they were generated for. Anything else is unlabeled ("").
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
