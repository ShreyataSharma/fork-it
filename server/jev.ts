// Placeholder for JEV classification. Real logic comes later.

export type FridgeItem = { name: string; description: string };
export type ClassifiedFridgeItem = FridgeItem & { selected: boolean; confidence: number | null };

// Placeholder: marks every photo item as selected with no confidence score.
export function classifyFridgeItems(items: FridgeItem[]): ClassifiedFridgeItem[] {
  return items.map((item) => ({ ...item, selected: true, confidence: null }));
}
