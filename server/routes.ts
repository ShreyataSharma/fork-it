import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import OpenAI from "openai";
import multer from "multer";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post("/api/identify-ingredients", upload.array("images", 10), async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];
      const textIngredients = req.body.ingredients as string | undefined;

      const messages: any[] = [];

      if (files && files.length > 0) {
        const imageContents: any[] = [
          {
            type: "text",
            text: `You are a culinary expert. Look at these fridge/pantry images and identify all visible ingredients. List them clearly, one per line. Only list actual food ingredients and condiments you can see. Be specific (e.g. "chicken breast" not just "meat"). ${textIngredients ? `The user also mentioned they have: ${textIngredients}` : ""}`,
          },
        ];

        for (const file of files) {
          const base64 = file.buffer.toString("base64");
          const mimeType = file.mimetype;
          imageContents.push({
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64}`,
            },
          });
        }

        messages.push({ role: "user", content: imageContents });
      } else if (textIngredients) {
        messages.push({
          role: "user",
          content: `The user has these ingredients: ${textIngredients}. List them back clearly, one per line, cleaned up and formatted properly.`,
        });
      } else {
        return res.status(400).json({ error: "No ingredients or images provided" });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages,
        max_completion_tokens: 1000,
      });

      const identified = response.choices[0]?.message?.content || "";
      const ingredients = identified
        .split("\n")
        .map((line: string) => line.replace(/^[-•*]\s*/, "").trim())
        .filter((line: string) => line.length > 0);

      res.json({ ingredients });
    } catch (error) {
      console.error("Error identifying ingredients:", error);
      res.status(500).json({ error: "Failed to identify ingredients" });
    }
  });

  app.post("/api/get-recipes", async (req: Request, res: Response) => {
    try {
      const { ingredients, cuisines, mealCategory } = req.body;

      if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
        return res.status(400).json({ error: "Ingredients list is required" });
      }

      const similarCuisines: Record<string, string[]> = {
        "Indian": ["Pakistani", "Sri Lankan", "Bangladeshi", "Nepali"],
        "Asian": ["Chinese", "Japanese", "Korean", "Thai", "Vietnamese", "Filipino", "Malaysian"],
        "Chinese": ["Japanese", "Korean", "Thai", "Vietnamese"],
        "Japanese": ["Korean", "Chinese", "Thai"],
        "Korean": ["Japanese", "Chinese", "Thai", "Vietnamese"],
        "Thai": ["Vietnamese", "Malaysian", "Indonesian", "Filipino"],
        "Mediterranean": ["Greek", "Turkish", "Lebanese", "Moroccan", "Spanish"],
        "French": ["Italian", "Belgian", "Swiss"],
        "Italian": ["French", "Spanish", "Greek"],
        "Mexican": ["Peruvian", "Colombian", "Brazilian", "Latin American"],
        "American": ["Canadian", "Australian", "British"],
        "Spanish": ["Portuguese", "Italian", "Mexican"],
        "Middle Eastern": ["Lebanese", "Turkish", "Persian", "Israeli", "Moroccan"],
        "Greek": ["Turkish", "Lebanese", "Italian", "Mediterranean"],
      };

      const isLucky = Array.isArray(cuisines) && cuisines.includes("__lucky__");

      const sharedPreamble = `You are a world-class chef. Based on these main ingredients the user has: ${ingredients.join(", ")}

Assume the user has these standard pantry staples ONLY: salt, black pepper, olive oil, vegetable oil, butter, garlic, onions, basic dry spices (cumin, coriander, turmeric, paprika, chili powder, oregano, cinnamon, garam masala, etc.), soy sauce, vinegar, flour, cornstarch, sugar, baking soda, baking powder, eggs, milk, common condiments (ketchup, mustard, hot sauce).

For each recipe, respond in this EXACT JSON format:
{
  "recipes": [
    {
      "id": 1,
      "name": "Recipe Name",
      "description": "A 1-2 sentence enticing description",
      "prepTime": "15 mins",
      "cookTime": "30 mins",
      "servings": 4,
      "difficulty": "Easy|Medium|Hard",
      "cuisine": "Italian|Asian|Mexican|American|Indian|Mediterranean|etc",
      "mainIngredients": ["ingredient1", "ingredient2"],
      "allIngredients": [
        {"name": "ingredient name", "amount": "2 cups", "userHas": true},
        {"name": "dry mango powder", "amount": "1 tsp", "userHas": false}
      ],
      "steps": [
        "Step 1: ...",
        "Step 2: ..."
      ],
      "tags": ["Quick", "Healthy", "Comfort Food"],
      "macros": {
        "calories": 420,
        "protein": 32,
        "carbs": 38,
        "fat": 12,
        "fiber": 5,
        "servingWeightG": 280
      }
    }
  ]
}

Make recipes varied in cooking methods and difficulty levels.

STRICT userHas rules — follow exactly:
- Set userHas: true ONLY if the ingredient is explicitly in the user's ingredient list above, OR is in the pantry staples list above.
- Set userHas: false for ALL of these, even if common: rice, pasta, noodles, bread, tortillas, potatoes, beans, lentils, chickpeas, canned tomatoes, broth/stock, cheese, cream, yogurt, coconut milk, nuts, seeds, fresh herbs, lemons/limes, any fresh produce NOT in the user's list, and any specialty or store-bought ingredient.
- When in doubt, set userHas: false. For macros, estimate realistic values per 1 serving (calories, protein in grams, carbs in grams, fat in grams, fiber in grams, servingWeightG as the total weight of 1 serving in grams).`;

      const mealInstruction = mealCategory
        ? (() => {
            const examples: Record<string, string> = {
              Breakfast: "eggs, pancakes, waffles, oatmeal, toast, smoothie bowls, French toast, breakfast burritos, frittatas, granola, muffins, bagels, crepes, shakshuka",
              Lunch: "salads, sandwiches, wraps, soups, grain bowls, light pasta, quesadillas, poke bowls, mezze plates, noodle dishes",
              Dinner: "hearty mains, roasts, stews, curries, pasta dishes, stir-fries, grills, casseroles, risotto, braised meats, sheet pan dinners",
              Snacks: "dips, energy balls, crackers & toppings, skewers, small bites, bruschetta, deviled eggs, guacamole, hummus, cheese plates, mini sliders",
            };
            return `

MEAL TYPE CONSTRAINT: ALL recipes MUST be appropriate for ${mealCategory}. Every recipe must be a dish people typically eat for ${mealCategory} (e.g. ${examples[mealCategory] ?? mealCategory}). Do NOT generate recipes for other meal times.`;
          })()
        : "";

      const fullPreamble = sharedPreamble + mealInstruction;

      let promptA: string;
      let promptB: string;

      if (isLucky) {
        promptA = `${fullPreamble}

Generate exactly 5 delicious recipes using ONLY lesser-known / underrepresented cuisines. Choose from: Brazilian, Peruvian, Ethiopian, Moroccan, Central European (Czech, Polish, Hungarian), Georgian, Uzbek, Sri Lankan, Filipino, Trinidadian, Jamaican, Venezuelan, Egyptian, Tunisian, Burmese, Laotian, Basque, Catalan, Sicilian, Levantine, Yemeni, Afghan, Congolese, Ghanaian, West African. Every recipe's "cuisine" field must accurately name the specific cuisine. Use IDs 1–5.`;

        promptB = `${fullPreamble}

Generate exactly 5 delicious recipes using ONLY creative fusion cuisines. Choose from: Indo-Chinese, American-Japanese (Japanamerican), Malay-Indian (Mamak), Tex-Mex, Korean-Mexican, Vietnamese-French, Indian-Caribbean, Afro-Brazilian, Nikkei (Japanese-Peruvian), Chifa (Chinese-Peruvian), Hawaiian-Asian (Plate Lunch), British-Indian (Balti), Fusion-Mediterranean. Every recipe's "cuisine" field must accurately name the specific cuisine. Use IDs 6–10.`;
      } else {
        const cuisineInstruction = Array.isArray(cuisines) && cuisines.length > 0
          ? (() => {
              const fallbacks = [...new Set(cuisines.flatMap(c => similarCuisines[c] || []))].filter(f => !cuisines.includes(f));
              return `CUISINE CONSTRAINT — follow these rules in order, no exceptions:

SELECTED CUISINES: ${cuisines.join(", ")}

RULE 1: Generate recipes using ONLY the selected cuisines above. Spread them evenly across the selections.
RULE 2: Only if you cannot fill all 5 slots from the selected cuisines alone, use ONLY these similar cuisines: ${fallbacks.length > 0 ? fallbacks.join(", ") : "the closest culturally related cuisines"}.
RULE 3: Every recipe's "cuisine" field must reflect its actual cuisine.`;
            })()
          : `Generate a diverse mix of cuisines (Italian, Asian, Mexican, American, Indian, Mediterranean, and others). Do NOT repeat any cuisine from the other batch.`;

        promptA = `${fullPreamble}

Generate exactly 5 delicious recipes. ${cuisineInstruction} Use IDs 1–5.`;

        promptB = `${fullPreamble}

Generate exactly 5 delicious recipes. ${cuisineInstruction} Use IDs 6–10. Make sure these 5 recipes are DIFFERENT from what a typical first batch would generate — use different cuisines, cooking methods, and dish types.`;
      }

      const totalStart = Date.now();

      const [responseA, responseB] = await Promise.all([
        (async () => {
          const t = Date.now();
          const r = await openai.chat.completions.create({
            model: "gpt-5.2",
            messages: [{ role: "user", content: promptA }],
            response_format: { type: "json_object" },
            max_completion_tokens: 4500,
          });
          console.log(`[batch-A] done in ${Date.now() - t}ms`);
          return r;
        })(),
        (async () => {
          const t = Date.now();
          const r = await openai.chat.completions.create({
            model: "gpt-5.2",
            messages: [{ role: "user", content: promptB }],
            response_format: { type: "json_object" },
            max_completion_tokens: 4500,
          });
          console.log(`[batch-B] done in ${Date.now() - t}ms`);
          return r;
        })(),
      ]);

      console.log(`[get-recipes] total ${Date.now() - totalStart}ms`);

      const parsedA = JSON.parse(responseA.choices[0]?.message?.content || "{}");
      const parsedB = JSON.parse(responseB.choices[0]?.message?.content || "{}");

      const recipesA: any[] = Array.isArray(parsedA.recipes) ? parsedA.recipes : [];
      const recipesB: any[] = Array.isArray(parsedB.recipes) ? parsedB.recipes : [];

      const combined = [...recipesA, ...recipesB].map((r, i) => ({ ...r, id: i + 1 }));
      const parsed = { recipes: combined };

      // Post-processing: filter out recipes that don't match selected cuisines or their fallbacks
      if (!isLucky && Array.isArray(cuisines) && cuisines.length > 0 && Array.isArray(parsed.recipes)) {
        const fallbacks = [...new Set(cuisines.flatMap((c: string) => similarCuisines[c] || []))];
        const allowedSet = [...cuisines.map((c: string) => c.toLowerCase()), ...fallbacks.map((f: string) => f.toLowerCase())];
        const filtered = parsed.recipes.filter((r: any) => {
          const rc = (r.cuisine || "").toLowerCase();
          return allowedSet.some(allowed => rc.includes(allowed) || allowed.includes(rc));
        });
        // Only replace if filter removed some recipes (keep original if all pass — preserves order)
        if (filtered.length < parsed.recipes.length) {
          console.log(`[cuisine-filter] Removed ${parsed.recipes.length - filtered.length} off-cuisine recipe(s). Kept ${filtered.length}.`);
          parsed.recipes = filtered;
        }
      }

      res.json(parsed);
    } catch (error) {
      console.error("Error getting recipes:", error);
      res.status(500).json({ error: "Failed to get recipes" });
    }
  });

  app.post("/api/substitution", async (req: Request, res: Response) => {
    try {
      const { ingredient, recipe, context, messages: chatHistory } = req.body;

      const systemPrompt = `You are a friendly, knowledgeable cooking assistant helping someone make a recipe with what they have at home. 
You specialize in ingredient substitutions and cooking tips. Be conversational, warm, and specific.
Keep responses concise but complete. The user is cooking: ${recipe}.

IMPORTANT: Write in plain, natural conversational language only. Do not use any markdown formatting whatsoever — no asterisks, no pound signs, no bullet dashes, no bold, no headers, no lists with symbols. Just write as if you are speaking directly to a friend in the kitchen. Use numbered options inline if listing alternatives, like "1) lemon juice 2) tamarind paste". Never use *, **, #, ##, -, or any other markdown symbols.`;

      const msgs: any[] = [{ role: "system", content: systemPrompt }];

      if (chatHistory && chatHistory.length > 0) {
        msgs.push(...chatHistory);
      }

      if (ingredient && !chatHistory?.length) {
        msgs.push({
          role: "user",
          content: `I don't have ${ingredient}. What can I substitute it with in this recipe? Give me 2-3 practical alternatives with how they affect the dish.`,
        });
      } else if (context) {
        msgs.push({ role: "user", content: context });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: msgs,
        stream: true,
        max_completion_tokens: 8192,
      });

      for await (const chunk of stream) {
        const raw = chunk.choices[0]?.delta?.content || "";
        if (raw) {
          const content = raw
            .replace(/#{1,6}\s*/g, "")
            .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
            .replace(/_{1,2}([^_]+)_{1,2}/g, "$1")
            .replace(/^\s*[-*+]\s+/gm, "")
            .replace(/^\s*\d+\.\s+/gm, (m) => m.trim().replace(/\.\s*$/, ") "))
            .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
            .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error getting substitution:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to get substitution" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to get substitution" });
      }
    }
  });

  return httpServer;
}
