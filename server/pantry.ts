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

// Words that describe form or prep, not the ingredient itself.
const DESCRIPTORS = new Set(["ground", "powder", "fresh", "dried", "chopped", "minced", "cloves", "clove"]);

function singular(word: string): string {
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (/(oes|ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

// Reduce a name to its core for staple matching: "Ground Turmeric" -> "turmeric",
// "garlic cloves" -> "garlic", "onions" -> "onion". "peanut butter" stays "peanut butter".
export function stapleKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !DESCRIPTORS.has(w))
    .map(singular)
    .join(" ");
}

const STAPLE_KEYS = new Set(PANTRY_STAPLES.map(stapleKey));

// Exact match on the reduced name, so "peanut butter" never matches "butter".
export function isPantryStaple(name: string): boolean {
  const key = stapleKey(name);
  return key !== "" && STAPLE_KEYS.has(key);
}
