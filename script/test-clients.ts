// Step 1 smoke test: one live call to each external API.
// Run with: npx tsx script/test-clients.ts
import Anthropic from "@anthropic-ai/sdk";
import { anthropic, HAIKU_MODEL } from "../server/clients/anthropic";
import { spoonacularGet } from "../server/clients/spoonacular";

async function testAnthropic() {
  const response = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content: "List the ingredients in this text as a comma-separated list: I have 2 eggs, some spinach, and half a block of feta.",
      },
    ],
  });
  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  console.log("[anthropic] model:", response.model);
  console.log("[anthropic] stop_reason:", response.stop_reason);
  console.log("[anthropic] usage:", response.usage.input_tokens, "in /", response.usage.output_tokens, "out");
  console.log("[anthropic] reply:", text);
}

type ComplexSearchResponse = {
  totalResults: number;
  results: { id: number; title: string; usedIngredientCount: number; missedIngredientCount: number }[];
};

async function testSpoonacular() {
  const data = await spoonacularGet<ComplexSearchResponse>("/recipes/complexSearch", {
    includeIngredients: "eggs,spinach,feta",
    sort: "max-used-ingredients",
    fillIngredients: true,
    number: 3,
  });
  console.log("[spoonacular] totalResults:", data.totalResults);
  for (const r of data.results) {
    console.log(`[spoonacular] #${r.id} ${r.title} (used ${r.usedIngredientCount}, missed ${r.missedIngredientCount})`);
  }
}

let failed = false;
for (const [name, fn] of [["anthropic", testAnthropic], ["spoonacular", testSpoonacular]] as const) {
  try {
    await fn();
    console.log(`[${name}] OK\n`);
  } catch (err) {
    failed = true;
    console.error(`[${name}] FAILED:`, err instanceof Error ? err.message : err, "\n");
  }
}
process.exit(failed ? 1 : 0);
