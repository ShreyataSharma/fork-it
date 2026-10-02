import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { anthropic, HAIKU_MODEL } from "./clients/anthropic";
import { classifyFridgeItems } from "./jev";
import { isPantryStaple, normalizeIngredient } from "./pantry";

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp";

export type ParseInput =
  | { kind: "text"; text: string }
  | { kind: "image"; data: Buffer; mediaType: ImageMediaType };

export type ParsedIngredient = {
  name: string;
  description: string;
  selected: boolean;
  confidence: number | null;
  source: "text" | "photo";
};

export type ParseResult = {
  ingredients: ParsedIngredient[];
  staples: ParsedIngredient[];
  message: string;
};

export class ParseModelError extends Error {}

const HAIKU_OUTPUT_FORMAT = jsonSchemaOutputFormat({
  type: "object",
  properties: {
    ingredients: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
        },
        required: ["name", "description"],
        additionalProperties: false,
      },
    },
  },
  required: ["ingredients"],
  additionalProperties: false,
});

const SYSTEM_PROMPT = `You extract cooking ingredients from what a user has in their kitchen. The input is either text the user typed or spoke, or a photo of their fridge, pantry, or groceries.

For each distinct food item, return:
- name: a lowercase, singular, plain grocery name that would work as a recipe search term. Drop brands, quantities, and packaging ("2 cartons of Chobani Greek yogurt" becomes "greek yogurt", "tomatoes" becomes "tomato"). Make ambiguous names specific: "pepper" is "black pepper" when it means the spice and "bell pepper" when it means the vegetable.
- description: a short note on what you saw or read, such as "half-full carton on the top shelf" or "user said 'some leftover rice'".

Include pantry items like salt or oil if present. List each item once. Only include items you can actually see or that the user actually mentioned; do not guess at hidden or implied items.

If the input contains no food at all, return an empty ingredients list.`;

const NO_FOOD_MESSAGE =
  "We couldn't spot any ingredients there. Try listing what's in your fridge, like \"chicken, spinach, rice\", or upload a photo of your fridge.";
const ONLY_STAPLES_MESSAGE =
  "We only found pantry staples, which we already assume you have. Add a few more ingredients, like a protein or vegetable, to get recipe ideas.";

export async function parseIngredients(input: ParseInput): Promise<ParseResult> {
  const source = input.kind === "text" ? "text" : "photo";

  const content: Anthropic.ContentBlockParam[] =
    input.kind === "text"
      ? [{ type: "text", text: input.text }]
      : [
          {
            type: "image",
            source: { type: "base64", media_type: input.mediaType, data: input.data.toString("base64") },
          },
          { type: "text", text: "List the food items in this photo." },
        ];

  const response = await anthropic.messages.parse({
    model: HAIKU_MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
    output_config: { format: HAIKU_OUTPUT_FORMAT },
  });

  if (response.stop_reason !== "end_turn" || !response.parsed_output) {
    throw new ParseModelError(`Ingredient parsing did not complete (stop_reason: ${response.stop_reason})`);
  }

  // Normalize and dedupe; Haiku is asked for lowercase singular names but code enforces it.
  const seen = new Set<string>();
  const items = response.parsed_output.ingredients
    .map((i) => ({ name: normalizeIngredient(i.name), description: i.description.trim() }))
    .filter((i) => i.name && !seen.has(i.name) && seen.add(i.name));

  const classified =
    source === "photo"
      ? classifyFridgeItems(items)
      : items.map((i) => ({ ...i, selected: true, confidence: null }));
  const withSource = classified.map((i) => ({ ...i, source }) as ParsedIngredient);

  const ingredients = withSource.filter((i) => !isPantryStaple(i.name));
  const staples = withSource.filter((i) => isPantryStaple(i.name));

  let message: string;
  if (withSource.length === 0) message = NO_FOOD_MESSAGE;
  else if (ingredients.length === 0) message = ONLY_STAPLES_MESSAGE;
  else message = `Found ${ingredients.length} ingredient${ingredients.length === 1 ? "" : "s"}.`;

  return { ingredients, staples, message };
}
