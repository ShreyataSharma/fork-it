// Pantry staples carried over from v2. Users are assumed to always have these.
export const PANTRY_STAPLES = [
  "salt", "black pepper", "white pepper", "olive oil", "vegetable oil", "butter",
  "garlic", "onions", "sugar", "eggs", "milk", "soy sauce", "white vinegar",
  "apple cider vinegar", "cumin", "coriander", "turmeric", "paprika", "chili powder",
  "oregano", "cinnamon", "garam masala", "red chili flakes", "ketchup", "mustard",
  "hot sauce", "lemon juice", "honey", "tomato paste", "sesame oil",
];

export function normalizeIngredient(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// Parsed names are singular ("onion", "egg"), so match both forms of each staple.
const STAPLE_SET = new Set(
  PANTRY_STAPLES.flatMap((s) => (s.endsWith("s") && !s.endsWith("ss") ? [s, s.slice(0, -1)] : [s])),
);

export function isPantryStaple(name: string): boolean {
  return STAPLE_SET.has(normalizeIngredient(name));
}
