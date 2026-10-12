// Pantry staples carried over from v2. Users are assumed to always have these.
export const PANTRY_STAPLES = [
  "salt", "black pepper", "white pepper", "olive oil", "vegetable oil", "butter",
  "garlic", "onions", "sugar", "eggs", "milk", "soy sauce", "white vinegar",
  "apple cider vinegar", "cumin", "coriander", "turmeric", "paprika", "chili powder",
  "oregano", "cinnamon", "garam masala", "red chili flakes", "ketchup", "mustard",
  "hot sauce", "lemon juice", "honey", "tomato paste", "sesame oil", "water", "oil",
];

export function normalizeIngredient(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// Connector words left at either end of a scraped name: "onion or", "in piece of ginger".
const EDGE_WORDS = new Set(["or", "and", "to", "of", "with", "for", "plus", "in", "a", "an", "the"]);

// A name fit to show Jev: letters only (symbols and numbers become spaces), lowercase, with
// connector words trimmed from both ends. "▢ 2 bay" -> "bay", "onion or" -> "onion". Returns
// "" when nothing is left.
export function cleanIngredientName(name: string): string {
  const words = name.toLowerCase().replace(/[^a-z\s'-]/g, " ").replace(/(^|\s)['-]+|['-]+(\s|$)/g, " ").split(/\s+/).filter(Boolean);
  while (words.length && EDGE_WORDS.has(words[0])) words.shift();
  while (words.length && EDGE_WORDS.has(words[words.length - 1])) words.pop();
  return words.join(" ");
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
// ingredient: "chicken broth" is not "chicken", "rice vinegar" is not "rice".
const DERIVED_PRODUCT_WORDS = new Set([
  "broth", "stock", "sauce", "paste", "butter", "milk", "oil", "powder", "vinegar", "flour", "wine",
]);

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
  return userIngredients.some((u) => sameByWordRule(recipeIngredient, u) === true);
}

// The word rule for one pair: true if the recipe ingredient contains the user's as whole words,
// false if it does but is a derived product ("chicken broth" vs "chicken"), and null when the
// words don't overlap, so the rule can't tell ("scallion" vs "green onion").
export function sameByWordRule(recipeIngredient: string, userIngredient: string): boolean | null {
  const recipeKey = ingredientKey(recipeIngredient).split(" ").filter(Boolean);
  if (!containsWords(recipeKey, ingredientKey(userIngredient).split(" ").filter(Boolean))) return null;
  const userWords = new Set(words(userIngredient));
  return !words(recipeIngredient).some((w) => DERIVED_PRODUCT_WORDS.has(w) && !userWords.has(w));
}

// Ingredient names a recipe needs that the user lacks: drops pantry staples and anything
// the user owns.
export function missingFrom(recipeIngredients: string[], userIngredients: string[]): string[] {
  return recipeIngredients.filter((name) => !isPantryStaple(name) && !ownsIngredient(name, userIngredients));
}
