import Anthropic from "@anthropic-ai/sdk";
import express from "express";

let _anthropic: Anthropic;
function getAnthropic() {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

const PANTRY_STAPLES = "salt, black pepper, white pepper, olive oil, vegetable oil, butter, garlic, onions, sugar, eggs, milk, soy sauce, white vinegar, apple cider vinegar, cumin, coriander, turmeric, paprika, chili powder, oregano, cinnamon, garam masala, red chili flakes, ketchup, mustard, hot sauce, lemon juice, honey, tomato paste, sesame oil";
const MODEL = "claude-haiku-4-5-20251001";

// Agent 1: Parses natural text or image into a clean array of ingredients
export async function getCleanIngredients(text?: string, imageBase64?: string): Promise<string[]> {
  const content: any[] = [];
  if (text) {
    content.push({ type: "text", text: `Input: ${text}` });
  }
  
  if (imageBase64) {
    // Basic media type inference. Base64 strings sent from client usually include the data prefix.
    const mediaType = imageBase64.startsWith("data:image/png") ? "image/png" : "image/jpeg";
    const data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    content.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
  }

  const response = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 200,
    system: "You are a precise ingredient parser. Given the user's text or image input showing food items, extract the available core ingredients. Return ONLY a comma-separated list of items. Exclude basic pantry staples like salt, oil, or pepper. Do not output anything other than the comma-separated list.",
    messages: [{ role: "user", content: content.length > 0 ? content : "No ingredients provided." }],
  });
  
  const textRes = (response.content[0] as any).text || "";
  return textRes.split(",").map((i: string) => i.trim()).filter((i: string) => i.length > 0);
}

// Fetch helper for Agent 2: Spoonacular API
async function fetchSpoonacular(ingredients: string[]) {
  if (!process.env.SPOONACULAR_API_KEY) return [];
  const query = ingredients.join(",+");
  try {
    const res = await fetch(`https://api.spoonacular.com/recipes/findByIngredients?ingredients=${query}&number=15&apiKey=${process.env.SPOONACULAR_API_KEY}`);
    const data = await res.json();
    return Array.isArray(data) ? data.map(r => ({ id: r.id, title: r.title })) : [];
  } catch { return []; }
}

// Fetch helper for Agent 2: TheMealDB API
async function fetchTheMealDB(ingredients: string[]) {
  if (ingredients.length === 0) return [];
  // Free MealDB only supports searching by 1 main ingredient reliably
  try {
    const res = await fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?i=${ingredients[0]}`);
    const data = await res.json();
    return data.meals ? data.meals.slice(0, 10).map((m: any) => ({ id: m.idMeal, title: m.strMeal })) : [];
  } catch { return []; }
}

// Agent 2 (Curator) & Agent 4 (Fallback Generator) combined pipeline
export async function getCuratedRecipes(ingredients: string[]) {
  // Fan out API calls concurrently
  const [spoonacular, mealdb] = await Promise.all([
    fetchSpoonacular(ingredients),
    fetchTheMealDB(ingredients)
  ]);

  const apiResults = `Spoonacular Matches:\n${JSON.stringify(spoonacular)}\nTheMealDB Matches:\n${JSON.stringify(mealdb)}`;

  const response = await getAnthropic().messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: `You are an expert culinary AI architect. The user has these ingredients in their fridge: ${ingredients.join(", ")}.
You can also freely use these pantry staples without them needing to be specified: ${PANTRY_STAPLES}.

Here are some matching raw recipes returned from external APIs:
${apiResults}

Tasks:
1. Review the external API titles. Select the absolute best ones that can be made precisely using the fridge ingredients and pantry staples.
2. You MUST return EXACTLY 10 recipes in total. Ensure there is a good mix of easy, medium, and hard difficulty recipes.
3. Fallback Generation (Agent 4): If the APIs provided fewer than 10 good, viable matches, generate highly creative original recipes to reach exactly 10.
4. For all 10 recipes, fully flesh out standard cooking steps, descriptions, and mock realistic macros, since the APIs only provided titles and ids.

CRITICAL INSTRUCTION: Output strictly as a JSON array of objects, starting with '[' and ending with ']'. No markdown fences.
Schema per object:
{
  "name": "string",
  "cuisine": "string",
  "description": "string",
  "ingredients": [{"item": "string", "amount": "string"}],
  "steps": ["string"],
  "macros": {"calories": 0, "protein": 0, "carbs": 0, "fat": 0},
  "source": "spoonacular" | "themealdb" | "ai",
  "external_id": "string if from API, else null",
  "difficulty": "easy" | "medium" | "hard"
}`,
    messages: [{ role: "user", content: "Generate the JSON array for the 10 recipes." }]
  });

  const textResp = (response.content[0] as any).text || "";
  console.log("RAW AGENT 2 RESPONSE length:", textResp.length);
  // Log the end to see if it was cut off
  console.log("RAW AGENT 2 END:", textResp.slice(-200));
  const jsonMatch = textResp.match(/\[\s*\{.*\}\s*\]/s);
  
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch(e) { 
      console.error("JSON parse error:", e); 
      return [{ 
        name: "RAW_AI_OUTPUT_ERROR_DEBUG", 
        description: jsonMatch[0].slice(0, 500) + "... [TRUNCATED]",
        raw_text: jsonMatch[0],
        error: String(e)
      }];
    }
  }
  
  // Failsafe empty return if parsing utterly fails
  return [];
}

// Agent 3: Sous Chef Streaming Chatbot
export async function proxySousChefChat(req: express.Request, res: express.Response) {
  const { messages, recipeContext } = req.body;
  if (!messages) return res.status(400).send("Messages missing");

  const systemPrompt = `You are "Fork It", a helpful, conversational Sous Chef AI. 
The user is currently viewing this recipe: ${JSON.stringify(recipeContext || "No specific recipe selected.")}
Pantry Staples Assume Available: ${PANTRY_STAPLES}

Your personality: encouraging, concise, informative, and expert.
Answer cooking questions, offer smart ingredient substitutions using what they have, and provide guidance compactly.`;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = await getAnthropic().messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: systemPrompt,
      messages,
      stream: true,
    });

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        // SSE standard format
        res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
      }
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error: any) {
    console.error("Sous Chef Stream Error:", error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
}
