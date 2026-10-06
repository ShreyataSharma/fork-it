// Pantry staples carried over from v2. Users are assumed to always have these.
export const PANTRY_STAPLES = [
  "salt", "black pepper", "white pepper", "olive oil", "vegetable oil", "butter",
  "garlic", "onions", "sugar", "eggs", "milk", "soy sauce", "white vinegar",
  "apple cider vinegar", "cumin", "coriander", "turmeric", "paprika", "chili powder",
  "oregano", "cinnamon", "garam masala", "red chili flakes", "ketchup", "mustard",
  "hot sauce", "lemon juice", "honey", "tomato paste", "sesame oil", "water",
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

// Reduce a name to its core for matching against staples or the user's ingredients: "Ground Turmeric" -> "turmeric",
// "garlic cloves" -> "garlic", "onions" -> "onion". "peanut butter" stays "peanut butter".
export function ingredientKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !DESCRIPTORS.has(w))
    .map(singular)
    .join(" ");
}

const STAPLE_KEYS = new Set(PANTRY_STAPLES.map(ingredientKey));

// Exact match on the reduced name, so "peanut butter" never matches "butter".
export function isPantryStaple(name: string): boolean {
  const key = ingredientKey(name);
  return key !== "" && STAPLE_KEYS.has(key);
}

// A recipe ingredient with one of these words is a different product from the plain
// ingredient: "chicken broth" is not "chicken", "peanut butter" is not "peanut".
const DERIVED_PRODUCT_WORDS = new Set(["broth", "stock", "sauce", "paste", "butter", "milk", "oil", "powder"]);

function words(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean).map(singular);
}

// True if `needle` appears in `hay` as a run of whole words.
function containsWords(hay: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > hay.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((w, j) => hay[i + j] === w)) return true;
  }
  return false;
}

// The user owns a recipe ingredient if its reduced name contains one of theirs as whole words
// ("long grain rice" contains "rice"), unless the recipe ingredient is a derived product
// ("chicken broth"). A derived-product word the user's own ingredient also has doesn't count,
// so "chicken broth" still matches a user's "chicken broth".
export function ownsIngredient(recipeIngredient: string, userIngredients: string[]): boolean {
  const recipeKey = ingredientKey(recipeIngredient).split(" ").filter(Boolean);
  const recipeWords = words(recipeIngredient);
  return userIngredients.some((u) => {
    if (!containsWords(recipeKey, ingredientKey(u).split(" ").filter(Boolean))) return false;
    const userWords = new Set(words(u));
    return !recipeWords.some((w) => DERIVED_PRODUCT_WORDS.has(w) && !userWords.has(w));
  });
}

// Ingredient names a recipe needs that the user lacks: drops pantry staples and anything
// the user owns.
export function missingFrom(recipeIngredients: string[], userIngredients: string[]): string[] {
  return recipeIngredients.filter((name) => !isPantryStaple(name) && !ownsIngredient(name, userIngredients));
}
